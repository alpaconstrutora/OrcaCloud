/**
 * Quantitativos derivados da geometria (PRD §8.7, RF-120 a RF-122).
 *
 * ÁREA DE EIXO × ÁREA DE PISO — a distinção que este módulo existe para fazer.
 *
 * O arranjo planar deriva o ambiente a partir dos EIXOS das paredes, porque é o
 * eixo que forma o grafo. Então `Space.areaMm2` inclui meia espessura de parede
 * em toda a volta. Numa sala de 4 × 3 m com parede de 150 mm isso dá 12,00 m²,
 * enquanto o piso que se assenta mede 3,85 × 2,85 = 10,97 m² — 9,4% a mais.
 *
 * Para desenhar, a área de eixo serve. Para orçar, não: 9% em piso, revestimento
 * e rodapé é diferença que aparece na obra. Aqui a área de piso é calculada
 * recuando o contorno em meia espessura de cada parede que o compõe.
 *
 * RASTREABILIDADE (RF-121). Todo resultado carrega fórmula, entradas e versão da
 * política. Um número de quantitativo que não diz de onde veio não pode ser
 * conferido, e o PRD §22.1 exige que a importação para o orçamento continue
 * ligada ao snapshot que a originou.
 */

import type { BlueprintModel, FuncaoCamada, Level, Opening, Space, Structural, StructuralKind, Wall } from './model';
import { wallLength, FORMA_ESTRUTURAL, contornoEmPlanta, nomeDoTipoEstrutural } from './model';
import { contornoExternoDoNivel } from './arrangement';
import { medirAgua } from './telhado';
import { furosDaEscada, medirEscada } from './escada';
import { sobreposicoesDoModelo } from './sobreposicao';
import {
  areCollinear,
  isBetween,
  pointInPolygon,
  polygonArea,
  polygonPerimeter,
  type Point,
} from './geom';

/** Política de cálculo. Versionada: mudar a política cria outro resultado. */
export interface QuantityPolicy {
  version: string;
  /** Altura do rodapé, em mm. Só afeta a área de rodapé, não o comprimento. */
  alturaRodapeMm: number;
  /**
   * Perda aplicada a piso e revestimento, em fração (0.10 = 10%).
   * Fica na política, e não embutida na fórmula, porque varia por empresa e por
   * material — e porque o valor SEM perda precisa continuar visível.
   */
  perdaRevestimento: number;
  /**
   * Casas decimais na APRESENTAÇÃO. O cálculo não arredonda em momento algum.
   *
   * O PRD §9.2 pede "persistir valor bruto e exibido". Aqui o bruto é guardado
   * com precisão inteira e o exibido é função pura de (bruto, política) — o que
   * é mais forte do que guardar os dois: uma cópia do valor exibido pode
   * divergir do bruto depois de uma edição, esta não pode.
   *
   * Arredondar durante o cálculo era pior ainda: somar valores já arredondados
   * acumula o erro de cada parcela no total.
   */
  casas: number;
}

/**
 * `version` NÃO É DECORAÇÃO — é a chave do cache do quantitativo.
 *
 * `computeAndStoreQuantities` é idempotente por `(snapshot, version)`: com a
 * mesma versão ele devolve o registro gravado e NÃO recalcula. Então toda
 * mudança de FÓRMULA obriga a subir a versão, senão todo estudo já quantificado
 * serve o número velho para sempre e a correção fica invisível — pior que não
 * ter corrigido, porque parece corrigida.
 *
 * Trocar a versão cria um registro novo e preserva o antigo, que é o que mantém
 * auditável o número que um orçamento já citou.
 *
 * 1.0.0 → 1.1.0 (15/08/2026): o rodapé passou a ser interrompido por peitoril
 * zero, e não por `kind === 'door'`. Corrige a porta-janela, que contava rodapé
 * ao longo de um vão sem parede.
 *
 * 1.1.0 → 1.2.0 (24/08/2026): entrou `totais.areaConstruidaM2`. Acrescentar
 * campo ao resultado É mudança de resultado — sem subir a versão, todo estudo
 * já quantificado continuaria servindo o registro velho, sem o campo novo, e a
 * área construída apareceria vazia sem nada explicando.
 *
 * 1.2.0 → 1.3.0 (30/08/2026): entrou `estruturas[]` — volume de concreto e área
 * de fôrma dos seis elementos estruturais — e os totais correspondentes. Mesma
 * razão da entrada anterior, e ela pesa mais aqui: um estudo já quantificado
 * que ganhasse pilares continuaria servindo o registro velho, e a aba mostraria
 * concreto zerado numa planta com trinta pilares desenhados. Zero é pior do que
 * vazio — parece um número.
 *
 * 1.3.0 → 1.4.0 (31/08/2026): o PILAR passou a descontar área de piso. É a
 * primeira mudança desta lista que altera um número JÁ EXISTENTE em vez de
 * acrescentar campo — a área de piso de um ambiente com pilar diminui —, e por
 * isso o bump aqui vale mais que nos anteriores: sem ele, dois estudos com a
 * mesma planta serviriam áreas diferentes conforme a data em que foram
 * quantificados, e nada na tela explicaria a divergência. Entrou junto
 * `QuantidadeAmbiente.areaEstruturaM2`, que mostra QUANTO saiu.
 *
 * 1.4.0 → 1.5.0 (01/09/2026): a SOBREPOSIÇÃO entre componentes passou a ser
 * medida e descontada. Um pilar embutido numa parede era pago duas vezes — como
 * concreto e como alvenaria —, porque a área da parede saía de `comprimento ×
 * altura` sem desconto nenhum de estrutura. Agora, quando um dos dois está
 * marcado com `cedeSobreposicao`, o volume disputado sai do lado que cede;
 * quando nenhum está, nada muda no número e a disputa aparece em
 * `sobreposicoes[]` com `quemCede: 'NINGUEM'` — a contagem dupla fica VISÍVEL
 * em vez de ser resolvida em silêncio.
 *
 * Muda número existente, como a 1.4.0: sem o bump, um estudo já quantificado
 * serviria para sempre a alvenaria cheia, e a correção seria invisível.
 *
 * 1.5.0 → 1.6.0 (01/09/2026): a PAREDE EM CAMADAS. Cada faixa passou a ter área
 * e volume próprios (`QuantidadeParede.camadas`), e o desenho inteiro ganhou
 * `totais.porMaterial` — quanto de bloco, quanto de reboco, quanto de gesso.
 *
 * Nenhum número que já existia mudou: a soma das camadas é exatamente o
 * `volumeM3` que a parede já devolvia, porque as espessuras somam `thicknessMm`
 * por invariante do modelo. É acréscimo de campo, como as entradas 1.2.0 e
 * 1.3.0 — e vale o mesmo que valeu nelas: sem o bump, um estudo já quantificado
 * continuaria servindo o registro velho, e a aba mostraria a coluna de materiais
 * VAZIA numa planta cujas paredes têm três camadas cada. Vazio sem explicação
 * parece defeito da tela, e o usuário procuraria o erro no lugar errado.
 */
export const POLITICA_PADRAO: QuantityPolicy = {
  version: 'quant-1.6.0',
  alturaRodapeMm: 100,
  perdaRevestimento: 0.1,
  casas: 2,
};

export interface QuantidadeAmbiente {
  spaceId: string;
  nome?: string;
  /** Área do polígono de eixo. É a primitiva geométrica, não o piso. */
  areaEixoM2: number;
  /** Área útil de piso: contorno recuado em meia espessura de cada parede. */
  areaPisoM2: number;
  areaPisoComPerdaM2: number;
  perimetroEixoM: number;
  /** Perímetro descontando os vãos de porta que dão para o ambiente. */
  comprimentoRodapeM: number;
  areaRodapeM2: number;
  /**
   * Área que a ESTRUTURA tira do piso deste ambiente, em m².
   *
   * Separada de `areaPisoM2` — que já vem líquida — de propósito: sem ela, uma
   * sala de 12 m² que aparece com 11,92 não diz por quê, e quem confere contra
   * a planta não tem como refazer a conta. É a mesma razão de `areaEixoM2`
   * conviver com `areaPisoM2`.
   */
  areaEstruturaM2: number;
  /** Explica de onde saiu a área de piso, para conferência. */
  formulaAreaPiso: string;
}

/**
 * Uma camada da parede, medida.
 *
 * ─── A ÁREA É A MESMA DA PAREDE, E ISSO NÃO É ERRO ──────────────────────────
 *
 * Toda camada tem a área de face líquida da parede inteira: porta e janela
 * atravessam a espessura de ponta a ponta, então o mesmo vão desconta de todas.
 * Repetir o número em cada linha é o certo — é o que se pinta, chapisca e reboca
 * naquela face, e é o número que o item de catálogo cobrado por m² vai usar.
 *
 * ⚠️ Somar `areaFaceM2` das camadas NÃO significa nada. O que soma é o volume.
 */
export interface QuantidadeCamada {
  /** Posição na composição, da face esquerda para a direita (sentido `a → b`). */
  indice: number;
  itemCode: string;
  descricao: string;
  funcao: FuncaoCamada;
  espessuraM: number;
  /** Uma face, líquida — a MESMA da parede. Ver o comentário acima. */
  areaFaceM2: number;
  volumeM3: number;
  /** De onde saiu o volume, para conferência (RF-121). */
  formula: string;
}

/**
 * Volume e área de um material somados no desenho inteiro.
 *
 * É o número que compra: "3,2 m³ de bloco cerâmico", "84 m² de reboco". Chega
 * agrupado por `itemCode` porque uma casa tem dezenas de paredes com a mesma
 * composição, e uma linha por parede não é uma lista de compras.
 */
export interface QuantidadePorMaterial {
  /** `''` quando a camada ainda não foi vinculada a um item de catálogo. */
  itemCode: string;
  descricao: string;
  funcao: FuncaoCamada;
  volumeM3: number;
  /**
   * Área de face somada. Serve a material cobrado por m² (reboco, cerâmica).
   *
   * ⚠️ É a área de UMA face por camada. Um reboco lançado como duas camadas —
   * uma em cada face — aparece aqui com as duas somadas, que é o certo; um
   * lançado como camada única aparece com uma, e quem orça precisa saber disso.
   * Por isso o desenho é a fonte, e não uma multiplicação por 2 embutida aqui.
   */
  areaFaceM2: number;
}

export interface QuantidadeParede {
  wallId: string;
  comprimentoM: number;
  alturaM: number;
  espessuraM: number;
  /** Uma face, sem desconto. */
  areaFaceBrutaM2: number;
  areaAberturasM2: number;
  /** Uma face, já descontadas as aberturas E a estrutura que atravessa. */
  areaFaceLiquidaM2: number;
  /** Alvenaria: comprimento × altura × espessura, menos vãos e estrutura. */
  volumeM3: number;
  /**
   * O que esta parede cedeu ao concreto que a atravessa, em m³. `0` = nada.
   *
   * Separado do volume — que já vem líquido — pela razão de `areaEstruturaM2`
   * no ambiente: uma parede que aparece com 1,80 m³ em vez de 2,00 tem de dizer
   * por quê, senão quem confere contra a planta não refaz a conta.
   */
  volumeCedidoM3: number;
  /**
   * A composição, medida faixa a faixa. Vazio na parede homogênea.
   *
   * `Σ camadas.volumeM3 === volumeM3` por construção, e não por sorte: a soma
   * das espessuras é `thicknessMm` por invariante do modelo, e as duas contas
   * partem da mesma área líquida. Está fixado em teste — se um dia divergir, é
   * porque alguém afrouxou o invariante, e o sintoma apareceria no orçamento.
   */
  camadas: QuantidadeCamada[];
}

export interface QuantidadeAbertura {
  openingId: string;
  tipo: 'door' | 'window' | 'passage' | 'sliding';
  larguraM: number;
  alturaM: number;
  areaM2: number;
}

export interface QuantidadeEstrutural {
  structuralId: string;
  kind: StructuralKind;
  /** "P1", "V3" — como o projeto estrutural chama a peça. Vazio quando não há. */
  rotulo: string;
  /** Comprimento do eixo (viga) ou extensão vertical (estaca). `0` na laje. */
  comprimentoM: number;
  /** Área em planta. Só a laje tem uma que signifique alguma coisa; 0 nas outras. */
  areaPlantaM2: number;
  volumeConcretoM3: number;
  /**
   * Área de FÔRMA — a superfície que precisa ser cofrada.
   *
   * Emitida para os seis tipos, inclusive estaca. Estaca escavada não usa fôrma
   * nenhuma, mas quem decide isso é o de-para do orçamento (RF-122), que pode
   * simplesmente não mapear a medida. Zerar aqui esconderia o número de quem
   * usa camisa metálica e ainda assim quer cofragem orçada — e um zero na
   * origem não tem como ser recuperado depois.
   */
  areaFormaM2: number;
  /** O que esta peça cedeu à alvenaria ou a outra peça, em m³. `0` = nada. */
  volumeCedidoM3: number;
  /** De onde saiu o volume, para conferência (RF-121). */
  formula: string;
}

/**
 * Uma água de telhado, medida.
 *
 * ─── AS DUAS ÁREAS SAEM JUNTAS, E NENHUMA SOZINHA ───────────────────────────
 *
 * `areaRealM2` é o que se compra; `areaProjetadaM2` é a sombra em planta, que é
 * o que se confere contra o desenho. É a mesma dupla de `areaEixoM2` e
 * `areaPisoM2` no ambiente, e existe pela mesma razão: dar só uma delas obriga
 * quem lê a adivinhar qual, e as duas são plausíveis.
 */
export interface QuantidadeAgua {
  aguaId: string;
  /** Sombra em planta, em m². */
  areaProjetadaM2: number;
  /** Superfície inclinada, em m². É o número da compra de telha. */
  areaRealM2: number;
  inclinacaoPct: number;
  /** Derivada de `inclinacaoPct` — nunca gravada no modelo. */
  inclinacaoGraus: number;
  comprimentoBeiralM: number;
  /** Cota do ponto mais alto, relativa ao piso do pavimento, em m. */
  alturaMaximaM: number;
  /** De onde saiu a área real, para conferência (RF-121). */
  formula: string;
}

/**
 * O que uma escada ou rampa custa — e o que ela TIRA da laje.
 *
 * `degraus` e `espelhoM` são DERIVADOS (ver `escada.ts`) e saem aqui pela
 * razão de `inclinacaoGraus` na água: o quantitativo é onde se confere, e
 * conferir exige o número que o desenho usou. `areaFuroLajeM2` é a soma dos
 * furos que ela abre — o desconto que a laje já recebeu em `areaLajeM2`.
 */
export interface QuantidadeEscada {
  escadaId: string;
  tipo: 'ESCADA' | 'RAMPA';
  rotulo: string;
  /** Pegada em planta, em m². É o que se reveste e o que sai do piso. */
  areaPlantaM2: number;
  larguraM: number;
  comprimentoM: number;
  /** A inclinada — o que se percorre e o que leva corrimão. */
  comprimentoInclinadoM: number;
  desnivelM: number;
  /** Zero na rampa. */
  degraus: number;
  espelhoM: number;
  pisoM: number;
  inclinacaoPct: number;
  /** Soma dos furos que ela abre nas lajes, em m². */
  areaFuroLajeM2: number;
  formula: string;
}

/**
 * Dois componentes disputando o mesmo espaço, e o que se decidiu sobre isso.
 *
 * `quemCede: 'NINGUEM'` é o estado que PRECISA aparecer na tela: o volume está
 * sendo contado duas vezes, uma como concreto e outra como alvenaria, e o
 * quantitativo não escolhe sozinho por quem. Escolher em silêncio seria a pior
 * saída — o número sairia plausível e ninguém saberia que houve uma decisão.
 */
export interface SobreposicaoQuantificada {
  aId: string;
  bId: string;
  volumeM3: number;
  quemCede: 'PAREDE' | 'CONCRETO' | 'NINGUEM';
}

export interface Quantitativos {
  policy: QuantityPolicy;
  kernelVersion: string;
  ambientes: QuantidadeAmbiente[];
  paredes: QuantidadeParede[];
  aberturas: QuantidadeAbertura[];
  estruturas: QuantidadeEstrutural[];
  /** Águas de telhado. Área REAL e área projetada, lado a lado. */
  telhados: QuantidadeAgua[];
  /** Escadas e rampas, com o número de degraus que o desenho usou. */
  escadas: QuantidadeEscada[];
  /** Onde dois componentes ocupam o mesmo espaço, e quem cedeu. */
  sobreposicoes: SobreposicaoQuantificada[];
  totais: {
    areaPisoM2: number;
    /**
     * ÁREA CONSTRUÍDA — o contorno externo, pela FACE das paredes.
     *
     * Não é a soma das áreas de piso: entre os cômodos está a alvenaria, que
     * ocupa lugar e é o que separa "o que se habita" de "o que se constrói".
     * É o número de laje e cobertura, e o que a NBR 12721 chama de área real.
     */
    areaConstruidaM2: number;
    areaPisoComPerdaM2: number;
    /** Duas faces por parede — é o que se reveste e se pinta. */
    areaParedeDuasFacesM2: number;
    /**
     * Volume de parede, somado. Com composição, é a soma de TODAS as camadas —
     * inclusive reboco e isolamento, que não são alvenaria.
     *
     * O nome ficou: renomeá-lo quebraria o de-para `VOLUME_ALVENARIA` que
     * orçamentos já publicados citam. Quem quer só o bloco tem `porMaterial`,
     * que é onde a distinção passou a existir de verdade.
     */
    volumeAlvenariaM3: number;
    /**
     * Volume e área por material, do desenho inteiro. Vazio sem composição.
     *
     * Array, e não um número, pela razão que o bloco de estrutura logo abaixo
     * documenta: bloco cerâmico, reboco e isolamento têm preço e unidade
     * diferentes, e um total único devolveria um número que não compra nada.
     */
    porMaterial: QuantidadePorMaterial[];
    comprimentoRodapeM: number;
    portas: number;
    janelas: number;
    /** Vãos livres — sem esquadria, então contados à parte de porta e janela. */
    vaosLivres: number;
    /** Correr é contada à parte de `portas`: preço e detalhe são outros. */
    portasDeCorrer: number;
    areaAberturasM2: number;

    // ── Estrutura ──────────────────────────────────────────────────────────
    //
    // Separados por FAMÍLIA, e não um `volumeConcretoM3` só, pela mesma razão
    // que `portasDeCorrer` não entra em `portas`: concreto de pilar, de laje e
    // de fundação são itens de catálogo diferentes, com preço, fck e bombeamento
    // diferentes. Um total único devolveria um número que não compra nada.
    volumeConcretoPilarM3: number;
    volumeConcretoVigaM3: number;
    volumeConcretoLajeM3: number;
    /** Estaca + bloco de coroamento + viga de fundação. */
    volumeConcretoFundacaoM3: number;
    areaFormaPilarM2: number;
    areaFormaVigaM2: number;
    areaFormaLajeM2: number;
    areaFormaFundacaoM2: number;
    /** Metro perfurado — é como a estaca é cotada, não por volume. */
    comprimentoEstacasM: number;
    comprimentoVigasM: number;
    areaLajeM2: number;
    pilares: number;
    estacas: number;
    blocosCoroamento: number;
    /**
     * TELHADO — área da superfície inclinada, somada. É o que se compra.
     *
     * ⚠️ NÃO confundir com `areaConstruidaM2`, que é o contorno em planta. Um
     * telhado a 30% tem 4,4% mais área que a sombra dele, e a diferença cresce
     * rápido: a 100% (45°), 41%. Comprar telha pela área construída é comprar a
     * menos, e o erro é silencioso porque o número é plausível.
     */
    areaTelhadoM2: number;
    /** A SOMBRA do telhado em planta. Serve à conferência, não à compra. */
    areaTelhadoProjetadaM2: number;
    aguas: number;
    /** Pegada somada das escadas e rampas, em m². */
    areaEscadasM2: number;
    /** Espelhos somados — é o que se conta para revestir degrau. */
    degraus: number;
    escadas: number;
  };
}

const MM2_PARA_M2 = 1_000_000;
const MM3_PARA_M3 = 1_000_000_000;

/** Apresentação. Chamada pela UI, nunca dentro do cálculo. */
export function formatarQuantidade(v: number, policy: QuantityPolicy): string {
  return v.toFixed(policy.casas);
}

/**
 * Espessura da parede que sustenta um trecho do contorno.
 *
 * Devolve 0 quando nenhuma parede corresponde — é o caso do `Boundary`, que
 * divide ambiente sem ter material. Recuar por causa dele seria errado: não há
 * espessura para descontar.
 */
function espessuraDoTrecho(walls: Wall[], a: Point, b: Point): number {
  for (const w of walls) {
    if (!areCollinear(w.a, w.b, a) || !areCollinear(w.a, w.b, b)) continue;
    if (!isBetween(w.a, w.b, a) || !isBetween(w.a, w.b, b)) continue;
    return w.thicknessMm;
  }
  return 0;
}

/**
 * Área do contorno recuado para dentro, aresta a aresta.
 *
 * A' = A − Σ(dᵢ · Lᵢ) + Σ(dᵢ² · tan(giroᵢ / 2))
 *
 * O termo linear tira a faixa de parede de cada lado. O termo dos cantos corrige
 * a sobreposição — sem ele, o canto seria descontado duas vezes. `tan(giro/2)`
 * vale 1 num canto reto convexo e −1 num reentrante, que é o que faz a conta
 * fechar EXATAMENTE em planta ortogonal, o caso comum.
 *
 * `sentido = -1` INVERTE o recuo e a fórmula passa a EXPANDIR — é como se obtém
 * a área pela face externa a partir do contorno de eixo. Conferido na álgebra e
 * fixado em teste: num retângulo de eixo W×H com parede `t`, recuar dá
 * (W−t)(H−t) e expandir dá (W+t)(H+t).
 *
 * ⚠️ É a MESMA fórmula nos dois sentidos, de propósito. Uma `areaExpandida`
 * própria seria a segunda cópia da regra de espessura — e a primeira coisa que
 * diverge quando alguém corrigir o termo de canto num lugar só.
 */
export function areaRecuada(
  ring: Point[],
  walls: Wall[],
  sentido: 1 | -1 = 1,
): { areaMm2: number; formula: string } {
  const n = ring.length;
  if (n < 3) return { areaMm2: 0, formula: 'contorno degenerado' };

  // Área do polígono de eixo (laço do agrimensor).
  let duasVezes = 0;
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    duasVezes += p.x * q.y - q.x * p.y;
  }
  const areaEixo = Math.abs(duasVezes / 2);

  let termoLinear = 0;
  let termoCanto = 0;
  const espessuras: number[] = [];

  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const d = (espessuraDoTrecho(walls, a, b) / 2) * sentido;
    espessuras.push(d);
    termoLinear += d * L;
  }

  for (let i = 0; i < n; i++) {
    const p = ring[(i - 1 + n) % n];
    const c = ring[i];
    const q = ring[(i + 1) % n];
    const ux = c.x - p.x;
    const uy = c.y - p.y;
    const vx = q.x - c.x;
    const vy = q.y - c.y;
    const giro = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    // Recuo do canto: média das duas arestas que nele chegam. Exato quando as
    // duas têm a mesma espessura, que é a planta comum.
    const d = (espessuras[(i - 1 + n) % n] + espessuras[i]) / 2;
    termoCanto += d * d * Math.tan(giro / 2);
  }

  return {
    areaMm2: Math.max(0, areaEixo - termoLinear + termoCanto),
    formula: 'A_eixo − Σ(espessura/2 × comprimento) + Σ(recuo² × tan(giro/2))',
  };
}

/**
 * ÁREA CONSTRUÍDA do nível — medida pela FACE EXTERNA das paredes.
 *
 * É o par da área de piso: piso é o que se assenta por dentro, área construída é
 * o que a edificação ocupa por fora. Nenhuma das duas é a "área de eixo" que o
 * arranjo planar produz, e é por isso que as três coexistem em vez de uma
 * substituir a outra.
 *
 * Sai do contorno externo (que `buildArrangement` descarta) expandido por meia
 * espessura, com a MESMA fórmula da área recuada — ver `areaRecuada`.
 *
 * Vários componentes conexos SOMAM: duas construções soltas no mesmo nível
 * ocupam as duas áreas. Fundir os contornos inventaria uma edificação só.
 */
export function areaConstruidaMm2(model: BlueprintModel, level: Level): number {
  const contornos = contornoExternoDoNivel(model, level);
  const paredes = model.walls.filter((w) => w.levelId === level.id);
  return contornos.reduce(
    (soma, anel) => soma + areaRecuada(anel, paredes, -1).areaMm2,
    0,
  );
}

/** Aberturas hospedadas em paredes que compõem o contorno deste ambiente. */
function aberturasDoAmbiente(
  space: Space,
  walls: Wall[],
  openings: Opening[],
): Opening[] {
  const idsNoContorno = new Set<string>();
  const n = space.ring.length;
  for (let i = 0; i < n; i++) {
    const a = space.ring[i];
    const b = space.ring[(i + 1) % n];
    for (const w of walls) {
      if (!areCollinear(w.a, w.b, a) || !areCollinear(w.a, w.b, b)) continue;
      if (!isBetween(w.a, w.b, a) || !isBetween(w.a, w.b, b)) continue;
      idsNoContorno.add(w.id);
    }
  }
  return openings.filter((o) => idsNoContorno.has(o.wallId));
}

/**
 * Volume de concreto e área de fôrma de uma peça estrutural.
 *
 * ─── POR QUE O CÍRCULO NÃO VIRA POLÍGONO ────────────────────────────────────
 *
 * `contornoEmPlanta` devolve o quadrado envolvente numa peça circular, de
 * propósito — polígono é o contrato dela. Aqui o caso redondo é calculado com
 * π, e não a partir daquele contorno: uma estaca ⌀300 aproximada por quatro
 * lados sairia com 27% de concreto a mais, e esse é um número que se COMPRA.
 *
 * ─── O QUE ENTRA NA FÔRMA ───────────────────────────────────────────────────
 *
 * PONTO: a lateral inteira (perímetro da seção × altura). Topo e base não são
 * cofrados — o topo é onde se lança e a base é solo ou peça de baixo.
 * LINHA: duas laterais e o fundo — `(2·h + b) × comprimento`. A face de cima
 * recebe a laje ou fica aberta para o lançamento.
 * AREA: só o fundo. A borda da laje é desprezada aqui de propósito: ela depende
 * de onde a laje encosta em viga (e aí não tem fôrma) e de onde está em balanço,
 * e essa informação não está no desenho. Quem precisa dela mapeia o perímetro
 * por fora.
 */
export function medirEstrutura(s: Structural): {
  comprimentoMm: number;
  areaPlantaMm2: number;
  volumeMm3: number;
  areaFormaMm2: number;
  formula: string;
} {
  const forma = FORMA_ESTRUTURAL[s.kind];

  if (forma === 'AREA') {
    const area = polygonArea(s.pontos);
    return {
      comprimentoMm: 0,
      areaPlantaMm2: area,
      volumeMm3: area * s.alturaMm,
      areaFormaMm2: area,
      formula: 'área do contorno × espessura',
    };
  }

  if (forma === 'LINHA') {
    const [a, b] = s.pontos;
    const comp = Math.hypot(b.x - a.x, b.y - a.y);
    return {
      comprimentoMm: comp,
      areaPlantaMm2: comp * s.larguraMm,
      volumeMm3: comp * s.larguraMm * s.alturaMm,
      areaFormaMm2: comp * (2 * s.alturaMm + s.larguraMm),
      formula: 'comprimento do eixo × base × altura da seção',
    };
  }

  if (s.circular) {
    const raio = s.larguraMm / 2;
    const areaSecao = Math.PI * raio * raio;
    return {
      comprimentoMm: s.alturaMm,
      areaPlantaMm2: areaSecao,
      volumeMm3: areaSecao * s.alturaMm,
      areaFormaMm2: Math.PI * s.larguraMm * s.alturaMm,
      formula: 'π × (diâmetro/2)² × altura',
    };
  }

  const areaSecao = s.larguraMm * s.profundidadeMm;
  return {
    comprimentoMm: s.alturaMm,
    areaPlantaMm2: areaSecao,
    volumeMm3: areaSecao * s.alturaMm,
    areaFormaMm2: 2 * (s.larguraMm + s.profundidadeMm) * s.alturaMm,
    formula: 'largura × profundidade × altura',
  };
}

/**
 * A peça OCUPA PISO? — a regra que decide o desconto de área.
 *
 * Duas condições, e nenhuma delas é o `kind`. Enumerar tipos aqui repetiria o
 * erro que a regra do rodapé já cometeu uma vez (perguntava `kind === 'door'` e
 * errava a porta-janela): o que importa é o que a peça FAZ, não como se chama.
 *
 * 1. É VERTICAL (`forma === 'PONTO'`). Pilar, estaca e bloco atravessam o piso;
 *    viga é horizontal e passa por cima; e LAJE não ocupa piso — ela É o piso.
 *    Sem esta condição, uma laje desenhada na cota 0 descontaria a própria área
 *    inteira e o ambiente iria a zero.
 * 2. ATRAVESSA O PLANO DO PISO: base ≤ 0 < topo. É o que separa o pilar (base 0,
 *    sobe 2,80 m) da estaca e do bloco, que ficam inteiramente enterrados e não
 *    tiram um centímetro de piso. Bloco cujo topo chega EXATAMENTE a 0 não
 *    atravessa — ele encosta por baixo, não emerge.
 */
function ocupaPiso(s: Structural): boolean {
  if (FORMA_ESTRUTURAL[s.kind] !== 'PONTO') return false;
  return s.baseMm <= 0 && s.baseMm + s.alturaMm > 0;
}

/**
 * Área que uma peça tira do piso de um ambiente. `0` quando não tira nada.
 *
 * ─── CONSERVADOR POR ESCOLHA: SÓ DESCONTA O QUE ESTÁ INTEIRO DENTRO ─────────
 *
 * Exige que os QUATRO cantos da seção caiam dentro do anel do ambiente. O
 * motivo é o pilar EMBUTIDO NA PAREDE, que é o caso comum: a área dele já não
 * era piso, porque a área de piso sai do contorno RECUADO em meia espessura —
 * a faixa de parede já está fora. Descontá-lo de novo seria contar duas vezes.
 *
 * E os dois erros não são simétricos. Deixar de descontar um pilar faz comprar
 * piso a mais — sobra. Descontar um que já estava fora faz comprar a MENOS —
 * falta material no meio do assentamento. Entre os dois, este código erra para
 * o lado da sobra.
 *
 * O teste de canto resolve o embutido sem nenhum caso especial: um pilar
 * centrado no eixo da parede tem cantos dos DOIS lados dela, e os de fora
 * reprovam. Um pilar solto no meio da sala tem os quatro dentro.
 *
 * ⚠️ Fica de fora o pilar que encosta na parede sem estar embutido: ele desconta
 * inteiro, incluindo a franja que invade a faixa de parede. O erro é de meia
 * espessura × largura — centímetros quadrados — e é do lado seguro.
 */
function areaOcupadaNoAmbiente(s: Structural, ring: Point[]): number {
  const cantos = contornoEmPlanta(s);
  if (cantos.length === 0) return 0;
  if (!cantos.every((c) => pointInPolygon(ring, c))) return 0;

  // Seção redonda pela área do CÍRCULO, não do quadrado envolvente — a mesma
  // disciplina do volume: o quadrado daria 27% a mais.
  if (s.circular) {
    const raio = s.larguraMm / 2;
    return Math.PI * raio * raio;
  }
  return s.larguraMm * s.profundidadeMm;
}

export function computeQuantities(
  model: BlueprintModel,
  policy: QuantityPolicy = POLITICA_PADRAO,
  kernelVersion = '',
): Quantitativos {
  // ── Sobreposição entre componentes ────────────────────────────────────────
  //
  // Antes das paredes porque elas já saem com o desconto aplicado. O volume é
  // RECALCULADO aqui, não lido do modelo: o que o modelo guarda é a decisão de
  // quem cede (`cedeSobreposicao`), e um volume gravado ficaria obsoleto no
  // instante em que alguém movesse o pilar. Ver `sobreposicao.ts`.
  const disputas = sobreposicoesDoModelo(model);
  const cedeMm3 = new Map<string, number>();
  const sobreposicoes: SobreposicaoQuantificada[] = disputas.map((d) => {
    const parede = model.walls.find((w) => w.id === d.aId) ?? null;
    const peca = (model.structures ?? []).find((s) => s.id === d.bId) ?? null;
    const outroA = parede ?? (model.structures ?? []).find((s) => s.id === d.aId) ?? null;

    const aCede = (parede ?? outroA)?.cedeSobreposicao === true;
    const bCede = peca?.cedeSobreposicao === true;

    // DESEMPATE quando os dois cedem: cede a PAREDE. É a convenção do orçamento
    // — compra-se bloco pela área líquida e o pilar é concreto —, e sem uma
    // regra escrita o desconto dependeria da ordem da lista, que muda sozinha.
    const quemCedeId = aCede && bCede ? d.aId : aCede ? d.aId : bCede ? d.bId : null;
    if (quemCedeId) {
      cedeMm3.set(quemCedeId, (cedeMm3.get(quemCedeId) ?? 0) + d.volumeMm3);
    }

    return {
      aId: d.aId,
      bId: d.bId,
      volumeM3: d.volumeMm3 / MM3_PARA_M3,
      quemCede: !quemCedeId ? 'NINGUEM' : quemCedeId === d.aId && parede ? 'PAREDE' : 'CONCRETO',
    };
  });

  // ── Paredes ───────────────────────────────────────────────────────────────
  const paredes: QuantidadeParede[] = model.walls.map((w) => {
    const compMm = wallLength(w);
    const aberturas = model.openings.filter((o) => o.wallId === w.id);
    const areaAberturasMm2 = aberturas.reduce((s, o) => s + o.widthMm * o.heightMm, 0);
    const bruta = compMm * w.heightMm;

    // O desconto chega em VOLUME e vira área de face dividindo pela espessura.
    // Derivar em vez de medir de novo é o que mantém as duas grandezas
    // coerentes: a face líquida × espessura tem de dar exatamente o volume, e
    // duas contas independentes divergiriam no arredondamento.
    const cedidoMm3 = Math.min(
      cedeMm3.get(w.id) ?? 0,
      (bruta - areaAberturasMm2) * w.thicknessMm,
    );
    const cedidoFaceMm2 = w.thicknessMm > 0 ? cedidoMm3 / w.thicknessMm : 0;
    const liquidaMm2 = Math.max(0, bruta - areaAberturasMm2 - cedidoFaceMm2);

    // ── A COMPOSIÇÃO ──────────────────────────────────────────────────────
    //
    // Parte da MESMA `liquidaMm2` da parede, e não de uma medição própria. É o
    // que garante que a soma das camadas dá exatamente o volume da parede: as
    // espessuras somam `thicknessMm` por invariante do modelo, então
    // `Σ (liquida × espessuraCamada) === liquida × thicknessMm`. Medir de novo,
    // camada a camada, seria a segunda cópia da regra de desconto de vão — e a
    // primeira a divergir no dia em que alguém corrigir uma delas.
    //
    // O volume CEDIDO ao concreto já saiu de `liquidaMm2` acima, então ele se
    // distribui pelas camadas na proporção das espessuras, sem conta separada.
    // É uma aproximação assumida: o pilar embutido come mais do miolo do que do
    // reboco. Repartir "de verdade" exigiria recortar a sobreposição faixa a
    // faixa, o que só mudaria a divisão INTERNA de um volume que já está certo
    // no total — e o total é o que vai para o orçamento.
    const camadas: QuantidadeCamada[] = (w.camadas ?? []).map((c, i) => ({
      indice: i,
      itemCode: c.itemCode,
      descricao: c.descricao,
      funcao: c.funcao,
      espessuraM: c.espessuraMm / 1000,
      areaFaceM2: liquidaMm2 / MM2_PARA_M2,
      volumeM3: (liquidaMm2 * c.espessuraMm) / MM3_PARA_M3,
      formula:
        cedidoMm3 > 0
          ? '(comprimento × altura − aberturas − estrutura) × espessura da camada'
          : '(comprimento × altura − aberturas) × espessura da camada',
    }));

    return {
      wallId: w.id,
      comprimentoM: (compMm / 1000),
      alturaM: (w.heightMm / 1000),
      espessuraM: (w.thicknessMm / 1000),
      areaFaceBrutaM2: (bruta / MM2_PARA_M2),
      areaAberturasM2: (areaAberturasMm2 / MM2_PARA_M2),
      areaFaceLiquidaM2: (liquidaMm2 / MM2_PARA_M2),
      volumeM3: ((liquidaMm2 * w.thicknessMm) / MM3_PARA_M3),
      volumeCedidoM3: cedidoMm3 / MM3_PARA_M3,
      camadas,
    };
  });

  // ── Agrupamento por material ──────────────────────────────────────────────
  //
  // Chave = `itemCode` + `funcao`. Só o código não basta: camada sem vínculo tem
  // código `''`, e todas elas cairiam numa linha só — bloco, reboco e isolamento
  // ainda não escolhidos somados num "sem material" que não significa nada. Com
  // a função na chave, o que ainda não foi vinculado pelo menos chega separado
  // por natureza, e quem for vincular sabe o que está olhando.
  //
  // A `descricao` fica de fora da chave, e a primeira encontrada é a que
  // aparece: ela é cache de rótulo, e duas grafias do mesmo código são o mesmo
  // material — agrupar por texto partiria a linha por um espaço a mais.
  const materiais = new Map<string, QuantidadePorMaterial>();
  for (const p of paredes) {
    for (const c of p.camadas) {
      const chave = `${c.itemCode} ${c.funcao}`;
      const atual = materiais.get(chave);
      if (atual) {
        atual.volumeM3 += c.volumeM3;
        atual.areaFaceM2 += c.areaFaceM2;
      } else {
        materiais.set(chave, {
          itemCode: c.itemCode,
          descricao: c.descricao,
          funcao: c.funcao,
          volumeM3: c.volumeM3,
          areaFaceM2: c.areaFaceM2,
        });
      }
    }
  }
  // Ordenado, e não na ordem de inserção: esta lista vai para tela e para
  // orçamento, e uma ordem que dependesse de qual parede foi desenhada primeiro
  // faria a mesma planta sair em ordens diferentes a cada sessão.
  const porMaterial = [...materiais.values()].sort(
    (a, b) => a.itemCode.localeCompare(b.itemCode) || a.funcao.localeCompare(b.funcao),
  );

  // ── Aberturas ─────────────────────────────────────────────────────────────
  const aberturas: QuantidadeAbertura[] = model.openings.map((o) => ({
    openingId: o.id,
    tipo: o.kind,
    larguraM: (o.widthMm / 1000),
    alturaM: (o.heightMm / 1000),
    areaM2: ((o.widthMm * o.heightMm) / MM2_PARA_M2),
  }));

  // ── Estrutura ─────────────────────────────────────────────────────────────
  //
  // Independente do arranjo planar de propósito: nenhuma peça daqui altera
  // `model.spaces`, e nenhum ambiente perde área por causa de um pilar. Ver o
  // comentário de `BlueprintModel.structures`.
  // ── Telhado ───────────────────────────────────────────────────────────────
  //
  // Independente do arranjo planar, como a estrutura: uma água sobre a sala não
  // mexe em área de piso nem em rodapé. E independente da SOBREPOSIÇÃO também —
  // telhado não disputa volume com alvenaria, ele fica acima dela.
  const telhados: QuantidadeAgua[] = (model.roofs ?? []).map((r) => {
    const m = medirAgua(r);
    return {
      aguaId: r.id,
      areaProjetadaM2: m.areaProjetadaM2,
      areaRealM2: m.areaRealM2,
      inclinacaoPct: r.inclinacaoPct,
      inclinacaoGraus: m.inclinacaoGraus,
      comprimentoBeiralM: m.comprimentoBeiralM,
      alturaMaximaM: m.alturaMaximaMm / 1000,
      formula: m.formula,
    };
  });

  // ── Escadas e rampas ──────────────────────────────────────────────────────
  //
  // Como o telhado: fora do arranjo planar e fora da disputa de volume. O que a
  // escada faz ao quantitativo é DESCONTAR a laje que atravessa — e esse
  // desconto é derivado a cada leitura (`furosDaEscada`), nunca gravado.
  const furos = furosDaEscada(model);
  const furoMm2PorLaje = new Map<string, number>();
  const furoMm2PorEscada = new Map<string, number>();
  for (const f of furos) {
    furoMm2PorLaje.set(f.structuralId, (furoMm2PorLaje.get(f.structuralId) ?? 0) + f.areaMm2);
    furoMm2PorEscada.set(f.escadaId, (furoMm2PorEscada.get(f.escadaId) ?? 0) + f.areaMm2);
  }
  const escadas: QuantidadeEscada[] = (model.stairs ?? []).map((e) => {
    const m = medirEscada(model, e);
    return {
      escadaId: e.id,
      tipo: e.tipo,
      rotulo: e.rotulo ?? '',
      areaPlantaM2: m.areaPlantaMm2 / MM2_PARA_M2,
      larguraM: e.larguraMm / 1000,
      comprimentoM: m.comprimentoMm / 1000,
      comprimentoInclinadoM: m.comprimentoInclinadoMm / 1000,
      desnivelM: m.desnivelMm / 1000,
      degraus: m.degraus,
      espelhoM: m.espelhoMm / 1000,
      pisoM: m.pisoMm / 1000,
      inclinacaoPct: m.inclinacaoPct,
      areaFuroLajeM2: (furoMm2PorEscada.get(e.id) ?? 0) / MM2_PARA_M2,
      formula:
        e.tipo === 'RAMPA'
          ? `inclinação = desnível ${m.desnivelMm} / comprimento ${m.comprimentoMm}`
          : `degraus = round(${m.desnivelMm} / ${e.alvoEspelhoMm}) = ${m.degraus}; espelho = ${m.desnivelMm} / ${m.degraus}`,
    };
  });

  const estruturas: QuantidadeEstrutural[] = (model.structures ?? []).map((s) => {
    const m = medirEstrutura(s);
    // Nunca cede mais do que tem: uma peça inteiramente dentro de outra sairia
    // com volume negativo, e um número negativo num orçamento não é conservador,
    // é lixo — ele SOMA errado no total em vez de aparecer como problema.
    const cedidoMm3 = Math.min(cedeMm3.get(s.id) ?? 0, m.volumeMm3);
    return {
      structuralId: s.id,
      kind: s.kind,
      rotulo: s.rotulo ?? '',
      comprimentoM: m.comprimentoMm / 1000,
      // A LAJE perde o furo da escada — em área e em volume. Derivado a cada
      // leitura: mover a escada corrige o desconto sozinho.
      areaPlantaM2: (m.areaPlantaMm2 - (furoMm2PorLaje.get(s.id) ?? 0)) / MM2_PARA_M2,
      volumeConcretoM3:
        (m.volumeMm3 - cedidoMm3 - (furoMm2PorLaje.get(s.id) ?? 0) * s.alturaMm) / MM3_PARA_M3,
      // A FÔRMA não muda. Ela é a superfície que se cofra, e o pilar embutido
      // continua precisando de fôrma nas faces que ficam contra a alvenaria —
      // é o que segura o concreto até a cura. Descontar aqui tiraria material
      // que a obra usa de verdade.
      areaFormaM2: m.areaFormaMm2 / MM2_PARA_M2,
      volumeCedidoM3: cedidoMm3 / MM3_PARA_M3,
      formula: cedidoMm3 > 0 ? `${m.formula} − volume cedido à alvenaria` : m.formula,
    };
  });

  /** Soma um campo das estruturas de um conjunto de tipos. */
  const somaEstrutural = (
    tipos: StructuralKind[],
    campo: 'volumeConcretoM3' | 'areaFormaM2' | 'comprimentoM' | 'areaPlantaM2',
  ) => estruturas.filter((e) => tipos.includes(e.kind)).reduce((s, e) => s + e[campo], 0);

  /** Estaca, bloco e viga de fundação — o que está abaixo do piso. */
  const FUNDACAO: StructuralKind[] = ['ESTACA', 'BLOCO_COROAMENTO', 'VIGA_FUNDACAO'];

  // ── Ambientes ─────────────────────────────────────────────────────────────
  const ambientes: QuantidadeAmbiente[] = model.spaces.map((s) => {
    const { areaMm2: pisoMm2, formula } = areaRecuada(s.ring, model.walls);

    // Buracos (ilhas) saem da área de piso: não se assenta piso ali.
    const buracosMm2 = s.holes.reduce((soma, h) => {
      const { areaMm2 } = areaRecuada(h, model.walls);
      return soma + areaMm2;
    }, 0);

    // A ESTRUTURA sai pelo MESMO caminho dos buracos, e é aí que ela cabe: um
    // pilar no meio da sala é uma ilha onde não se assenta piso. Descontar aqui,
    // no quantitativo, é o que permite manter `arrangement.ts` intocado — se o
    // pilar entrasse no arranjo planar, o ambiente se PARTIRIA em quatro, e
    // área, rodapé e revestimento mudariam junto por causa de uma peça de
    // esqueleto. O ambiente continua inteiro; só o número de piso sabe do pilar.
    const estruturaMm2 = (model.structures ?? [])
      .filter((e) => e.levelId === s.levelId && ocupaPiso(e))
      .reduce((soma, e) => soma + areaOcupadaNoAmbiente(e, s.ring), 0);

    const pisoLiquidoMm2 = Math.max(0, pisoMm2 - buracosMm2 - estruturaMm2);

    // Rodapé: perímetro menos o que INTERROMPE o rodapé.
    //
    // O QUE INTERROMPE É O VÃO QUE CHEGA AO PISO — `sillMm === 0`, e só isso. O
    // tipo não entra na conta, e essa é a correção de 15/08/2026: a regra
    // anterior perguntava `kind === 'door'`, então a PORTA-JANELA (janela com
    // peitoril zero, que se atravessa a pé) contava rodapé ao longo de um vão
    // onde não existe parede para pregá-lo. Vinha rodapé a mais no orçamento,
    // calado, e o desenho na tela estava certo o tempo todo.
    //
    // A regra por peitoril cobre os três tipos sem enumerá-los, e continua
    // correta para os casos que já estavam certos: porta nasce com peitoril
    // zero e segue interrompendo; janela normal (peitoril 900) não interrompe,
    // o rodapé passa por baixo; passa-prato — vão sem esquadria com peitoril
    // alto — também não.
    const interrompemRodape = aberturasDoAmbiente(s, model.walls, model.openings).filter(
      (o) => o.sillMm === 0,
    );
    const vaoPortasMm = interrompemRodape.reduce((soma, o) => soma + o.widthMm, 0);
    const rodapeMm = Math.max(0, s.perimeterMm - vaoPortasMm);

    return {
      spaceId: s.id,
      nome: s.name,
      areaEixoM2: (s.areaMm2 / MM2_PARA_M2),
      areaPisoM2: (pisoLiquidoMm2 / MM2_PARA_M2),
      areaPisoComPerdaM2: ((pisoLiquidoMm2 * (1 + policy.perdaRevestimento)) / MM2_PARA_M2),
      perimetroEixoM: (s.perimeterMm / 1000),
      comprimentoRodapeM: (rodapeMm / 1000),
      areaRodapeM2: ((rodapeMm * policy.alturaRodapeMm) / MM2_PARA_M2),
      areaEstruturaM2: (estruturaMm2 / MM2_PARA_M2),
      formulaAreaPiso:
        estruturaMm2 > 0 ? `${formula} − seção dos pilares no ambiente` : formula,
    };
  });

  // ── Totais ────────────────────────────────────────────────────────────────
  const somaPiso = ambientes.reduce((s, a) => s + a.areaPisoM2, 0);
  const somaFace = paredes.reduce((s, p) => s + p.areaFaceLiquidaM2, 0);
  // Somando os níveis: num sobrado a área construída é a dos dois pavimentos.
  const somaConstruida = model.levels.reduce(
    (soma, nivel) => soma + areaConstruidaMm2(model, nivel) / MM2_PARA_M2,
    0,
  );

  return {
    policy,
    kernelVersion,
    ambientes,
    paredes,
    aberturas,
    estruturas,
    telhados,
    escadas,
    sobreposicoes,
    totais: {
      areaPisoM2: (somaPiso),
      areaConstruidaM2: (somaConstruida),
      areaPisoComPerdaM2: (somaPiso * (1 + policy.perdaRevestimento)),
      // Duas faces: é o que se reveste e se pinta dos dois lados.
      areaParedeDuasFacesM2: (somaFace * 2),
      volumeAlvenariaM3: (paredes.reduce((s, p) => s + p.volumeM3, 0)),
      porMaterial,
      comprimentoRodapeM: (ambientes.reduce((s, a) => s + a.comprimentoRodapeM, 0)),
      portas: aberturas.filter((o) => o.tipo === 'door').length,
      janelas: aberturas.filter((o) => o.tipo === 'window').length,
      vaosLivres: aberturas.filter((o) => o.tipo === 'passage').length,
      // Contada à PARTE de `portas`: correr e abrir têm preço e detalhe
      // diferentes, e somá-las devolveria um número que não serve para
      // comprar nada.
      portasDeCorrer: aberturas.filter((o) => o.tipo === 'sliding').length,
      areaAberturasM2: (aberturas.reduce((s, o) => s + o.areaM2, 0)),

      volumeConcretoPilarM3: somaEstrutural(['PILAR'], 'volumeConcretoM3'),
      volumeConcretoVigaM3: somaEstrutural(['VIGA'], 'volumeConcretoM3'),
      volumeConcretoLajeM3: somaEstrutural(['LAJE'], 'volumeConcretoM3'),
      volumeConcretoFundacaoM3: somaEstrutural(FUNDACAO, 'volumeConcretoM3'),
      areaFormaPilarM2: somaEstrutural(['PILAR'], 'areaFormaM2'),
      areaFormaVigaM2: somaEstrutural(['VIGA'], 'areaFormaM2'),
      areaFormaLajeM2: somaEstrutural(['LAJE'], 'areaFormaM2'),
      areaFormaFundacaoM2: somaEstrutural(FUNDACAO, 'areaFormaM2'),
      comprimentoEstacasM: somaEstrutural(['ESTACA'], 'comprimentoM'),
      comprimentoVigasM: somaEstrutural(['VIGA', 'VIGA_FUNDACAO'], 'comprimentoM'),
      areaLajeM2: somaEstrutural(['LAJE'], 'areaPlantaM2'),
      pilares: estruturas.filter((e) => e.kind === 'PILAR').length,
      estacas: estruturas.filter((e) => e.kind === 'ESTACA').length,
      blocosCoroamento: estruturas.filter((e) => e.kind === 'BLOCO_COROAMENTO').length,
      areaTelhadoM2: telhados.reduce((t, a) => t + a.areaRealM2, 0),
      areaTelhadoProjetadaM2: telhados.reduce((t, a) => t + a.areaProjetadaM2, 0),
      aguas: telhados.length,
      areaEscadasM2: escadas.reduce((t, e) => t + e.areaPlantaM2, 0),
      degraus: escadas.reduce((t, e) => t + e.degraus, 0),
      escadas: escadas.length,
    },
  };
}
