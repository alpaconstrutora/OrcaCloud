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

import type { BlueprintModel, Level, Opening, Space, Structural, StructuralKind, Wall } from './model';
import { wallLength, FORMA_ESTRUTURAL, contornoEmPlanta, nomeDoTipoEstrutural } from './model';
import { contornoExternoDoNivel } from './arrangement';
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
 */
export const POLITICA_PADRAO: QuantityPolicy = {
  version: 'quant-1.4.0',
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

export interface QuantidadeParede {
  wallId: string;
  comprimentoM: number;
  alturaM: number;
  espessuraM: number;
  /** Uma face, sem desconto. */
  areaFaceBrutaM2: number;
  areaAberturasM2: number;
  /** Uma face, já descontadas as aberturas. */
  areaFaceLiquidaM2: number;
  /** Alvenaria: comprimento × altura × espessura, menos o vazio das aberturas. */
  volumeM3: number;
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
  /** De onde saiu o volume, para conferência (RF-121). */
  formula: string;
}

export interface Quantitativos {
  policy: QuantityPolicy;
  kernelVersion: string;
  ambientes: QuantidadeAmbiente[];
  paredes: QuantidadeParede[];
  aberturas: QuantidadeAbertura[];
  estruturas: QuantidadeEstrutural[];
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
    volumeAlvenariaM3: number;
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
  // ── Paredes ───────────────────────────────────────────────────────────────
  const paredes: QuantidadeParede[] = model.walls.map((w) => {
    const compMm = wallLength(w);
    const aberturas = model.openings.filter((o) => o.wallId === w.id);
    const areaAberturasMm2 = aberturas.reduce((s, o) => s + o.widthMm * o.heightMm, 0);
    const bruta = compMm * w.heightMm;

    return {
      wallId: w.id,
      comprimentoM: (compMm / 1000),
      alturaM: (w.heightMm / 1000),
      espessuraM: (w.thicknessMm / 1000),
      areaFaceBrutaM2: (bruta / MM2_PARA_M2),
      areaAberturasM2: (areaAberturasMm2 / MM2_PARA_M2),
      areaFaceLiquidaM2: ((bruta - areaAberturasMm2) / MM2_PARA_M2),
      volumeM3: (((bruta - areaAberturasMm2) * w.thicknessMm) / MM3_PARA_M3),
    };
  });

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
  const estruturas: QuantidadeEstrutural[] = (model.structures ?? []).map((s) => {
    const m = medirEstrutura(s);
    return {
      structuralId: s.id,
      kind: s.kind,
      rotulo: s.rotulo ?? '',
      comprimentoM: m.comprimentoMm / 1000,
      areaPlantaM2: m.areaPlantaMm2 / MM2_PARA_M2,
      volumeConcretoM3: m.volumeMm3 / MM3_PARA_M3,
      areaFormaM2: m.areaFormaMm2 / MM2_PARA_M2,
      formula: m.formula,
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
    totais: {
      areaPisoM2: (somaPiso),
      areaConstruidaM2: (somaConstruida),
      areaPisoComPerdaM2: (somaPiso * (1 + policy.perdaRevestimento)),
      // Duas faces: é o que se reveste e se pinta dos dois lados.
      areaParedeDuasFacesM2: (somaFace * 2),
      volumeAlvenariaM3: (paredes.reduce((s, p) => s + p.volumeM3, 0)),
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
    },
  };
}
