/**
 * RF-122 — de-para entre a geometria e o orçamento.
 *
 * É o último trecho do caminho que faz a planta valer alguma coisa: sem ele o
 * quantitativo fica bonito numa tela que ninguém usa para comprar material.
 *
 * ─── A TRAVA QUE JUSTIFICA O MÓDULO: A UNIDADE ──────────────────────────────
 *
 * O erro perigoso aqui não é o de-para vazio — esse aparece na hora. É o de-para
 * ERRADO: apontar a área de piso (m²) para um item cotado por metro linear
 * (rodapé). Nada quebra, nenhuma tela reclama, e sai uma linha de orçamento com
 * número plausível e errado por um fator de 4 ou 5. Só se descobre na obra.
 *
 * Por isso cada medida declara a DIMENSÃO que produz, e um mapeamento cuja
 * unidade do item não bate é **recusado**, não gerado com aviso. Aviso se ignora;
 * linha que não existe, não.
 *
 * ─── PROCEDÊNCIA (RF-121 → §22.1) ───────────────────────────────────────────
 *
 * Toda linha gerada carrega `calculationMemory` com a fórmula que produziu o
 * número, as variáveis de entrada e a versão publicada que a originou. Número de
 * orçamento sem procedência não pode ser conferido, e o PRD exige que a
 * importação continue ligada ao snapshot.
 *
 * ─── REENVIAR NÃO PODE DUPLICAR ─────────────────────────────────────────────
 *
 * O id de cada linha é determinístico e prefixado por estudo. Regerar a partir
 * de uma versão nova SUBSTITUI as linhas daquela planta em vez de empilhar —
 * é a disciplina do CA-08 aplicada na fronteira do orçamento.
 */

import type { BudgetEntry, SinapiItem } from '../types/budget';
import type { DisciplinaDeRede, Quantitativos, StructuralKind, TipoDePontoHidraulico } from './blueprintKernel';
import { ROTULO_DA_CONEXAO } from './blueprintKernel';
import {
  nomeDoTipoDeAbertura as nomeDoTipo,
  nomeDoTipoEstrutural,
} from './blueprintKernel';
import { familiaDaPeca, type ArmaduraQuantificada } from './blueprintArmadura';
import { ROTULO_DA_DISCIPLINA } from './blueprintRede';
import { ROTULO_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';

/**
 * Dimensão física de uma medida. É o que a unidade do item tem que respeitar.
 * `KG` entrou com a armadura esquemática (16/09/2026): o aço se compra por peso.
 */
export type Dimensao = 'M2' | 'M' | 'M3' | 'UN' | 'KG';

/**
 * `EDIFICACAO` é o escopo do TODO — um valor por nível, não por elemento.
 *
 * Existe porque área construída não é atributo de ambiente, de parede nem de
 * abertura: é do contorno externo. Encaixá-la em `AMBIENTE` produziria uma
 * linha por cômodo com o mesmo número repetido, que somaria errado no
 * orçamento.
 */
export type EscopoMedida = 'AMBIENTE' | 'PAREDE' | 'ABERTURA' | 'EDIFICACAO' | 'ESTRUTURA' | 'TELHADO' | 'ESCADA' | 'INSTALACAO' | 'GUARDA_CORPO' | 'DEMOLICAO' | 'TERRENO';

export interface DefinicaoMedida {
  id: string;
  rotulo: string;
  escopo: EscopoMedida;
  dimensao: Dimensao;
  /** Ajuda a escolher: diz o que a medida É, não como se chama. */
  descricao: string;
}

/**
 * Catálogo de medidas que a geometria sabe produzir.
 *
 * Deliberadamente fechado: o de-para escolhe DENTRE estas, e não uma expressão
 * livre sobre o payload. Expressão livre traria de volta exatamente o problema
 * que a trava de unidade resolve — daria para escrever qualquer coisa e o
 * sistema não teria como saber o que ela significa.
 */
export const MEDIDAS: DefinicaoMedida[] = [
  {
    id: 'AREA_PISO',
    rotulo: 'Área de piso',
    escopo: 'AMBIENTE',
    dimensao: 'M2',
    descricao: 'Contorno recuado em meia espessura de parede. NÃO é a área de eixo.',
  },
  {
    id: 'AREA_CONSTRUIDA',
    rotulo: 'Área construída',
    escopo: 'EDIFICACAO',
    dimensao: 'M2',
    descricao:
      'Contorno externo pela FACE das paredes. Maior que a soma dos pisos — ' +
      'entre os cômodos está a alvenaria. É o número de laje e cobertura.',
  },
  {
    id: 'AREA_PISO_COM_PERDA',
    rotulo: 'Área de piso com perda',
    escopo: 'AMBIENTE',
    dimensao: 'M2',
    descricao: 'Área de piso acrescida da perda da política. Para compra, não para projeto.',
  },
  {
    id: 'COMPRIMENTO_RODAPE',
    rotulo: 'Comprimento de rodapé',
    escopo: 'AMBIENTE',
    dimensao: 'M',
    descricao: 'Perímetro menos os vãos de porta. Janela não interrompe rodapé.',
  },
  {
    id: 'AREA_RODAPE',
    rotulo: 'Área de rodapé',
    escopo: 'AMBIENTE',
    dimensao: 'M2',
    descricao: 'Comprimento de rodapé × altura da política.',
  },
  {
    id: 'PERIMETRO',
    rotulo: 'Perímetro do ambiente',
    escopo: 'AMBIENTE',
    dimensao: 'M',
    descricao: 'Perímetro de eixo, sem desconto de vão.',
  },
  {
    id: 'AREA_PAREDE_UMA_FACE',
    rotulo: 'Área de parede (uma face)',
    escopo: 'PAREDE',
    dimensao: 'M2',
    descricao: 'Face líquida, já descontadas as aberturas.',
  },
  {
    id: 'AREA_PAREDE_DUAS_FACES',
    rotulo: 'Área de parede (duas faces)',
    escopo: 'PAREDE',
    dimensao: 'M2',
    descricao: 'O que se reveste e se pinta dos dois lados. Uma face subestima pela metade.',
  },
  // CORTINA DE VIDRO e BRISE (P2.20): a pele da fachada, à parte da alvenaria.
  {
    id: 'AREA_CORTINA',
    rotulo: 'Cortina de vidro (painéis)',
    escopo: 'PAREDE',
    dimensao: 'M2',
    descricao: 'm² de painel das paredes marcadas como cortina de vidro (face líquida), uma linha por parede; o filtro casa com o painel (vidro, ACM, policarbonato).',
  },
  {
    id: 'COMPRIMENTO_MONTANTE',
    rotulo: 'Montantes e travessas da cortina',
    escopo: 'PAREDE',
    dimensao: 'M',
    descricao: 'Metros de perfil da cortina de vidro: um montante por módulo mais os das pontas, e duas travessas (base e topo).',
  },
  {
    id: 'AREA_BRISE',
    rotulo: 'Brise (fachada sombreada)',
    escopo: 'PAREDE',
    dimensao: 'M2',
    descricao: 'm² de fachada com brise (comprimento × altura da parede), uma linha por parede; as lâminas ficam nas variáveis.',
  },
  {
    id: 'COMPRIMENTO_PAREDE',
    rotulo: 'Comprimento de parede',
    escopo: 'PAREDE',
    dimensao: 'M',
    descricao: 'Eixo a eixo. Serve para verga, contraverga e cinta.',
  },
  {
    id: 'VOLUME_ALVENARIA',
    rotulo: 'Volume de alvenaria',
    escopo: 'PAREDE',
    dimensao: 'M3',
    descricao: 'Face líquida × espessura. O vazio das aberturas já saiu.',
  },
  {
    id: 'CONTAGEM_PORTAS',
    rotulo: 'Portas (unidades)',
    escopo: 'ABERTURA',
    dimensao: 'UN',
    descricao: 'Uma unidade por porta lançada na planta.',
  },
  {
    id: 'CONTAGEM_JANELAS',
    rotulo: 'Janelas (unidades)',
    escopo: 'ABERTURA',
    dimensao: 'UN',
    descricao: 'Uma unidade por janela lançada na planta.',
  },
  {
    id: 'AREA_ESQUADRIAS',
    rotulo: 'Área de esquadrias',
    escopo: 'ABERTURA',
    dimensao: 'M2',
    descricao: 'Largura × altura de cada abertura.',
  },

  // ── Estrutura ────────────────────────────────────────────────────────────
  //
  // SEPARADAS POR FAMÍLIA, e não uma medida "volume de concreto" só. Concreto
  // de pilar, de viga, de laje e de fundação são itens de catálogo diferentes:
  // fck diferente, bombeamento diferente, produtividade de lançamento
  // diferente. Um total único forçaria o usuário a mapear tudo para um item só
  // e o orçamento sairia com um número plausível e errado — exatamente o modo
  // de falha que o cabeçalho deste arquivo descreve.
  {
    id: 'VOLUME_CONCRETO_PILAR',
    rotulo: 'Concreto — pilares',
    escopo: 'ESTRUTURA',
    dimensao: 'M3',
    descricao: 'Seção × altura de cada pilar. Seção redonda usa π, não o quadrado envolvente.',
  },
  {
    id: 'VOLUME_CONCRETO_VIGA',
    rotulo: 'Concreto — vigas',
    escopo: 'ESTRUTURA',
    dimensao: 'M3',
    descricao: 'Comprimento do eixo × base × altura da seção. Não inclui viga de fundação.',
  },
  {
    id: 'VOLUME_CONCRETO_LAJE',
    rotulo: 'Concreto — lajes',
    escopo: 'ESTRUTURA',
    dimensao: 'M3',
    descricao: 'Área do contorno desenhado × espessura.',
  },
  {
    id: 'VOLUME_CONCRETO_FUNDACAO',
    rotulo: 'Concreto — fundação',
    escopo: 'ESTRUTURA',
    dimensao: 'M3',
    descricao: 'Estacas, blocos de coroamento e vigas de fundação somados — tudo abaixo do piso.',
  },
  {
    id: 'AREA_FORMA_PILAR',
    rotulo: 'Fôrma — pilares',
    escopo: 'ESTRUTURA',
    dimensao: 'M2',
    descricao: 'Perímetro da seção × altura. Topo e base não são cofrados.',
  },
  {
    id: 'AREA_FORMA_VIGA',
    rotulo: 'Fôrma — vigas',
    escopo: 'ESTRUTURA',
    dimensao: 'M2',
    descricao: 'Duas laterais mais o fundo: (2 × altura + base) × comprimento.',
  },
  {
    id: 'AREA_FORMA_LAJE',
    rotulo: 'Fôrma — lajes',
    escopo: 'ESTRUTURA',
    dimensao: 'M2',
    descricao: 'Só o fundo. A borda depende de onde a laje encosta em viga, e o desenho não diz.',
  },
  {
    id: 'AREA_FORMA_FUNDACAO',
    rotulo: 'Fôrma — fundação',
    escopo: 'ESTRUTURA',
    dimensao: 'M2',
    descricao:
      'Blocos e vigas de fundação. Estaca escavada normalmente não usa fôrma — ' +
      'não mapeie esta medida se for o caso.',
  },
  {
    id: 'COMPRIMENTO_ESTACA',
    rotulo: 'Estacas (metro perfurado)',
    escopo: 'ESTRUTURA',
    dimensao: 'M',
    descricao: 'Profundidade somada. É como a estaca é cotada — por metro, não por volume.',
  },
  {
    id: 'CONTAGEM_PILARES',
    rotulo: 'Pilares (unidades)',
    escopo: 'ESTRUTURA',
    dimensao: 'UN',
    descricao: 'Uma unidade por pilar lançado na planta.',
  },
  {
    id: 'CONTAGEM_ESTACAS',
    rotulo: 'Estacas (unidades)',
    escopo: 'ESTRUTURA',
    dimensao: 'UN',
    descricao: 'Uma unidade por estaca. Serve para mobilização e arrasamento, cotados por peça.',
  },
  // ── Aço — armadura esquemática (16/09/2026) ──────────────────────────────
  // Pré-quantitativo: mínimos da NBR 6118 por peça + piso pela taxa de
  // referência do estudo (hipóteses em `blueprint_study_armadura`). Não é
  // detalhamento; a descrição de cada medida diz isso a quem mapeia.
  {
    id: 'PESO_ACO_PILAR',
    rotulo: 'Peso de aço — pilares',
    escopo: 'ESTRUTURA',
    dimensao: 'KG',
    descricao: 'kg de aço dos pilares pela armadura esquemática (mínimos NBR 6118 + taxa de referência do estudo). Pré-quantitativo, não detalhamento.',
  },
  {
    id: 'PESO_ACO_VIGA',
    rotulo: 'Peso de aço — vigas',
    escopo: 'ESTRUTURA',
    dimensao: 'KG',
    descricao: 'kg de aço das vigas (as de fundação contam em fundação) pela armadura esquemática.',
  },
  {
    id: 'PESO_ACO_LAJE',
    rotulo: 'Peso de aço — lajes',
    escopo: 'ESTRUTURA',
    dimensao: 'KG',
    descricao: 'kg de aço das lajes pela armadura esquemática (malha inferior nas duas direções + taxa de referência).',
  },
  {
    id: 'PESO_ACO_FUNDACAO',
    rotulo: 'Peso de aço — fundação',
    escopo: 'ESTRUTURA',
    dimensao: 'KG',
    descricao: 'kg de aço de estacas, blocos de coroamento e vigas de fundação pela armadura esquemática.',
  },
  {
    id: 'PESO_ACO_TOTAL',
    rotulo: 'Peso de aço — toda a estrutura',
    escopo: 'ESTRUTURA',
    dimensao: 'KG',
    descricao: 'kg de aço de todas as peças estruturais da planta. Não combine com as medidas por família — contaria duas vezes.',
  },

  // ── Instalações hidráulicas (18/09/2026) ─────────────────────────────────
  //
  // Até aqui NENHUMA medida de instalação chegava ao orçamento: o quantitativo
  // já somava tubo por bitola e ponto por tipo, mas o de-para não tinha como
  // escolher. Uma linha por DN (é assim que se compra tubo) e uma por
  // classificação de ponto (chuveiro, vaso, ralo…). O filtro por texto casa
  // com o rótulo ("Água fria DN 25", "Chuveiro") para o de-para pegar só o DN
  // ou só a peça que quer.
  {
    id: 'COMPRIMENTO_TUBO_AGUA_FRIA',
    rotulo: 'Tubulação de água fria',
    escopo: 'INSTALACAO',
    dimensao: 'M',
    descricao: 'Metros de tubo de água fria, uma linha por diâmetro (DN). O comprimento é o real, com prumadas.',
  },
  {
    id: 'COMPRIMENTO_TUBO_AGUA_QUENTE',
    rotulo: 'Tubulação de água quente',
    escopo: 'INSTALACAO',
    dimensao: 'M',
    descricao: 'Metros de tubo de água quente, uma linha por diâmetro (DN).',
  },
  {
    id: 'COMPRIMENTO_TUBO_ESGOTO',
    rotulo: 'Tubulação de esgoto',
    escopo: 'INSTALACAO',
    dimensao: 'M',
    descricao: 'Metros de tubo de esgoto, uma linha por diâmetro (DN), com o caimento e as prumadas.',
  },
  {
    id: 'COMPRIMENTO_ELETRODUTO',
    rotulo: 'Eletroduto',
    escopo: 'INSTALACAO',
    dimensao: 'M',
    descricao: 'Metros de eletroduto, uma linha por bitola.',
  },
  // SUB-REGIÕES DO TERRENO (P2.19): as áreas externas por material vêm pelos extras (não estão no quantitativo).
  {
    id: 'AREA_SUBREGIAO',
    rotulo: 'Sub-região do terreno (por material)',
    escopo: 'TERRENO',
    dimensao: 'M2',
    descricao: 'Área em planta de cada sub-região do terreno (grama, intertravado, concreto…), uma linha por sub-região; o filtro casa com o material ou o nome.',
  },
  {
    id: 'COMPRIMENTO_DUTO',
    rotulo: 'Duto de ar (mecânica)',
    escopo: 'INSTALACAO',
    dimensao: 'M',
    descricao: 'Metros de duto da disciplina mecânica (P2.2), uma linha por diâmetro equivalente.',
  },
  {
    id: 'CONTAGEM_CONEXOES',
    rotulo: 'Conexões hidráulicas',
    escopo: 'INSTALACAO',
    dimensao: 'UN',
    descricao: 'Joelhos, tês, luvas e reduções por disciplina, tipo e diâmetro — deduzidas dos encontros de trechos, mais as lançadas à mão.',
  },
  {
    id: 'CONTAGEM_PONTOS_HIDRAULICOS',
    rotulo: 'Pontos hidráulicos',
    escopo: 'INSTALACAO',
    dimensao: 'UN',
    descricao: 'Peças hidráulicas por tipo — chuveiro, vaso, lavatório, ralo, caixa sifonada, caixa d\'água, registro… Uma linha por tipo e disciplina.',
  },

  // ── Telhado ──────────────────────────────────────────────────────────────
  //
  // DUAS medidas, e a primeira é a que compra. Telha, manta e madeiramento são
  // cotados pela superfície INCLINADA; a área em planta existe para conferir o
  // desenho e para o raro item cotado por projeção (calha por metro não é este
  // caso). Oferecer só a projetada faria o orçamento comprar 4,4% a menos a
  // 30% de inclinação — e 41% a menos a 45° — sem nenhuma tela avisar.
  {
    id: 'AREA_TELHADO',
    rotulo: 'Telhado — área real (inclinada)',
    escopo: 'TELHADO',
    dimensao: 'M2',
    descricao: 'Superfície inclinada de cada água: área projetada × √(1 + inclinação²). É a área que compra telha.',
  },
  {
    id: 'AREA_TELHADO_PROJETADA',
    rotulo: 'Telhado — área projetada (em planta)',
    escopo: 'TELHADO',
    dimensao: 'M2',
    descricao: 'A sombra da água em planta. Serve à conferência; para telha, use a área real.',
  },
  // ── Escada e rampa ───────────────────────────────────────────────────────
  //
  // O DEGRAU é a unidade da escada no orçamento: revestimento, rodapé de
  // degrau e a própria execução em concreto são cotados por espelho, não por
  // metro quadrado. A pegada existe para o que se cota por área — o piso da
  // rampa, a forma da laje inclinada.
  {
    id: 'DEGRAUS',
    rotulo: 'Escada — degraus (espelhos)',
    escopo: 'ESCADA',
    dimensao: 'UN',
    descricao: 'Número de espelhos de cada escada, derivado do desnível até o pavimento de cima. Rampa conta zero.',
  },
  {
    id: 'AREA_ESCADA',
    rotulo: 'Escada/rampa — pegada em planta',
    escopo: 'ESCADA',
    dimensao: 'M2',
    descricao: 'Área da pegada de cada escada ou rampa em planta. É o que sai do piso e o que se reveste na rampa.',
  },
  // GUARDA-CORPO E CORRIMÃO (E7.3): metro linear é como se compra; a área
  // (comprimento × altura) serve ao vidro e ao gradil cotados por m². Peça com
  // item de catálogo declarado também sai direto por `gerarLancamentosDeGuardaCorpos`.
  {
    id: 'COMPRIMENTO_GUARDA_CORPO',
    rotulo: 'Guarda-corpo — comprimento',
    escopo: 'GUARDA_CORPO',
    dimensao: 'M',
    descricao: 'Comprimento da polilinha de cada guarda-corpo (não inclui corrimão).',
  },
  {
    id: 'AREA_GUARDA_CORPO',
    rotulo: 'Guarda-corpo — área (comprimento × altura)',
    escopo: 'GUARDA_CORPO',
    dimensao: 'M2',
    descricao: 'Para vidro e gradil cotados por m².',
  },
  {
    id: 'COMPRIMENTO_CORRIMAO',
    rotulo: 'Corrimão — comprimento',
    escopo: 'GUARDA_CORPO',
    dimensao: 'M',
    descricao: 'Comprimento da polilinha de cada corrimão.',
  },
  // DEMOLIÇÃO (E10.2): o que está marcado A DEMOLIR. Sai por peça, como as
  // medidas de construção, e NÃO entra nas medidas acima — parede a demolir não
  // é parede que se compra. A existente (que fica) não sai em lugar nenhum.
  {
    id: 'DEMOLICAO_AREA_PAREDE',
    rotulo: 'Demolição — área de parede',
    escopo: 'DEMOLICAO',
    dimensao: 'M2',
    descricao: 'Área de face líquida (uma face) de cada parede marcada A DEMOLIR.',
  },
  {
    id: 'DEMOLICAO_VOLUME_ALVENARIA',
    rotulo: 'Demolição — volume de alvenaria',
    escopo: 'DEMOLICAO',
    dimensao: 'M3',
    descricao: 'Volume de cada parede marcada A DEMOLIR (comprimento × altura × espessura, menos vãos). É também o entulho a remover.',
  },
  {
    id: 'DEMOLICAO_ABERTURAS',
    rotulo: 'Demolição — esquadrias a remover',
    escopo: 'DEMOLICAO',
    dimensao: 'UN',
    descricao: 'Uma por porta, janela ou vão marcado A DEMOLIR.',
  },
  {
    id: 'DEMOLICAO_VOLUME_CONCRETO',
    rotulo: 'Demolição — volume de concreto',
    escopo: 'DEMOLICAO',
    dimensao: 'M3',
    descricao: 'Volume de cada peça estrutural marcada A DEMOLIR.',
  },
];

export const MEDIDA_POR_ID = new Map(MEDIDAS.map((m) => [m.id, m]));

/** Uma linha do de-para. Configuração da organização — mutável, versionada não. */
export interface MapeamentoOrcamento {
  id: string;
  organization_id: string;
  /** Id de `MEDIDAS`. */
  medida: string;
  /** Código no catálogo — SINAPI ou base própria, é o mesmo espaço de códigos. */
  item_code: string;
  /** Onde a linha cai na EAP do orçamento. */
  phase: string;
  budget_group: string;
  /**
   * `TOTAL` soma tudo numa linha; `POR_ELEMENTO` gera uma por ambiente/parede.
   *
   * Não há default óbvio: por elemento preserva a medição por ambiente e o
   * `location.room` do orçamento, mas uma planta de 40 ambientes × 3 medidas
   * vira 120 linhas. Quem monta o orçamento decide, mapeamento a mapeamento.
   */
  agrupamento: 'TOTAL' | 'POR_ELEMENTO';
  /**
   * Opcional: só aplica a ambientes cujo nome contenha um destes termos.
   * Existe porque revestimento de parede é de área molhada, não da casa inteira.
   * Vazio = todos.
   */
  filtro_ambiente: string[];
  active: boolean;
}

/** Mapeamento com o item já resolvido no catálogo. */
export interface MapeamentoResolvido {
  mapeamento: MapeamentoOrcamento;
  item: SinapiItem | null;
}

export interface Divergencia {
  mapeamentoId: string;
  medida: string;
  itemCode: string;
  motivo: string;
}

export interface ResultadoGeracao {
  entries: BudgetEntry[];
  divergencias: Divergencia[];
}

/**
 * Normaliza a unidade escrita no catálogo para uma dimensão.
 *
 * O SINAPI é irregular: 'M2', 'M²', 'm2', 'UN', 'UND', 'VB'. Comparar string
 * crua reprovaria mapeamento correto, o que empurraria o usuário a desligar a
 * trava — e uma trava desligada é pior do que trava nenhuma, porque dá a
 * impressão de que alguém conferiu.
 */
export function dimensaoDaUnidade(unidade: string | undefined | null): Dimensao | null {
  if (!unidade) return null;
  const u = unidade
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[\s.]/g, '');

  if (['M2', 'M²', 'MT2', 'METROQUADRADO'].includes(u)) return 'M2';
  if (['M3', 'M³', 'MT3', 'METROCUBICO'].includes(u)) return 'M3';
  if (['M', 'ML', 'MT', 'METRO', 'METROLINEAR'].includes(u)) return 'M';
  if (['UN', 'UND', 'UNID', 'UNIDADE', 'PC', 'PÇ', 'CJ', 'CONJ'].includes(u)) return 'UN';
  if (['KG', 'KGF', 'QUILO', 'QUILOGRAMA'].includes(u)) return 'KG';
  return null;
}

interface ValorMedido {
  /**
   * Identificador ESTÁVEL do elemento — entra no id da linha.
   *
   * ⚠️ É o `uid` (Etapa 1), e não o `id` do kernel. Até 06/09/2026 era o id, que
   * é POSICIONAL: `modelFromCanonicalPayload` renumera na ordem canônica a cada
   * publicação, então inserir uma parede antes das outras trocava o id de todas
   * as seguintes — e com ele o id da linha de orçamento de paredes que ninguém
   * tocou. Quem tivesse anotação ou vínculo preso ao id perdia, em silêncio.
   *
   * O ambiente é o único que pode cair de volta no id: ele é derivado e sem
   * etiqueta não tem uid. Nesse caso a linha É instável, e isso é o fato — não
   * um detalhe a esconder atrás de um id que parece identidade.
   */
  ref: string;
  /** Nome legível para `location.room` e para a memória de cálculo. */
  rotulo: string;
  valor: number;
  formula?: string;
  variaveis: Record<string, number | string>;
}

/**
 * O que acompanha o quantitativo sem estar nele: a armadura esquemática, que
 * depende das hipóteses do ESTUDO (e por isso não entra em `computeQuantities`,
 * cujo cache é por snapshot e versão da política).
 */
export interface ExtrasDaGeracao {
  armadura?: ArmaduraQuantificada;
  /** SUB-REGIÕES DO TERRENO (P2.19): `medirSubRegioes(model)`. */
  subRegioes?: { uid: string; nome: string; rotuloDoMaterial: string; material: string; permeavel: boolean; areaM2: number }[];
}

/** Extrai da leitura do quantitativo os valores de uma medida, elemento a elemento. */
function medir(quant: Quantitativos, medidaId: string, filtro: string[], extras: ExtrasDaGeracao = {}): ValorMedido[] {
  const combina = (nome: string | undefined) => {
    if (filtro.length === 0) return true;
    const n = (nome ?? '').toLowerCase();
    return filtro.some((f) => n.includes(f.trim().toLowerCase()));
  };

  switch (medidaId) {
    case 'AREA_PISO':
    case 'AREA_PISO_COM_PERDA':
    case 'COMPRIMENTO_RODAPE':
    case 'AREA_RODAPE':
      // RODAPÉ COMO ELEMENTO (P2.21): com trechos desenhados, uma linha por trecho (o filtro casa com item ou descrição); sem trecho, o derivado por ambiente abaixo.
      if ((medidaId === 'COMPRIMENTO_RODAPE' || medidaId === 'AREA_RODAPE') && (quant.rodapes ?? []).length > 0) {
        return quant.rodapes
          .filter((r) => combina(r.descricao) || combina(r.itemCode))
          .map((r) => ({
            ref: r.uid,
            rotulo: `Rodapé ${r.descricao || r.itemCode || ''} ${r.comprimentoM.toFixed(2)} m · ${r.alturaMm} mm${r.sugerido ? ' (sugerido)' : ''}`,
            valor: medidaId === 'COMPRIMENTO_RODAPE' ? r.comprimentoM : r.areaM2,
            formula: medidaId === 'COMPRIMENTO_RODAPE' ? 'comprimento do trecho desenhado' : 'comprimento do trecho × altura',
            variaveis: { itemCode: r.itemCode, alturaMm: r.alturaMm, comprimentoM: r.comprimentoM, areaM2: r.areaM2 },
          }));
      }
    case 'PERIMETRO':
      return quant.ambientes
        .filter((a) => combina(a.nome))
        .map((a) => ({
          ref: a.uid ?? a.spaceId,
          rotulo: a.nome ?? 'Ambiente sem nome',
          valor:
            medidaId === 'AREA_PISO' ? a.areaPisoM2
              : medidaId === 'AREA_PISO_COM_PERDA' ? a.areaPisoComPerdaM2
              : medidaId === 'COMPRIMENTO_RODAPE' ? a.comprimentoRodapeM
              : medidaId === 'AREA_RODAPE' ? a.areaRodapeM2
              : a.perimetroEixoM,
          formula: a.formulaAreaPiso,
          variaveis: {
            ambiente: a.nome ?? a.spaceId,
            areaEixoM2: a.areaEixoM2,
            areaPisoM2: a.areaPisoM2,
            perimetroEixoM: a.perimetroEixoM,
          },
        }));

    case 'AREA_CORTINA':
    case 'COMPRIMENTO_MONTANTE':
      return quant.paredes
        .filter((p) => p.cortina && combina(p.cortina.painel))
        .map((p) => ({
          ref: p.uid,
          rotulo: `Cortina ${p.cortina!.painel.toLowerCase()} ${p.comprimentoM.toFixed(2)} m · ${p.cortina!.paineis} painel(is)`,
          valor: medidaId === 'AREA_CORTINA' ? p.cortina!.areaM2 : p.cortina!.montantesM,
          formula: medidaId === 'AREA_CORTINA' ? 'comprimento × altura − aberturas' : '(painéis + 1) × altura + 2 × comprimento',
          variaveis: { painel: p.cortina!.painel, paineis: p.cortina!.paineis, comprimentoM: p.comprimentoM, alturaM: p.alturaM, areaM2: p.cortina!.areaM2, montantesM: p.cortina!.montantesM },
        }));
    case 'AREA_BRISE':
      return quant.paredes
        .filter((p) => p.brise)
        .map((p) => ({
          ref: p.uid,
          rotulo: `Brise ${p.brise!.orientacao.toLowerCase()} ${p.comprimentoM.toFixed(2)} m · ${p.brise!.laminas} lâmina(s)`,
          valor: p.brise!.areaM2,
          formula: 'comprimento × altura',
          variaveis: { orientacao: p.brise!.orientacao, laminas: p.brise!.laminas, comprimentoLaminasM: p.brise!.comprimentoLaminasM, areaM2: p.brise!.areaM2 },
        }));
    case 'AREA_PAREDE_UMA_FACE':
    case 'AREA_PAREDE_DUAS_FACES':
    case 'COMPRIMENTO_PAREDE':
    case 'VOLUME_ALVENARIA':
      return quant.paredes.map((p) => ({
        ref: p.uid,
        rotulo: `Parede ${p.comprimentoM.toFixed(2)} m`,
        valor:
          medidaId === 'AREA_PAREDE_UMA_FACE' ? p.areaFaceLiquidaM2
            : medidaId === 'AREA_PAREDE_DUAS_FACES' ? p.areaFaceLiquidaM2 * 2
            : medidaId === 'COMPRIMENTO_PAREDE' ? p.comprimentoM
            : p.volumeM3,
        formula:
          medidaId === 'VOLUME_ALVENARIA'
            ? '(comprimento × altura − aberturas) × espessura'
            : 'comprimento × altura − aberturas',
        variaveis: {
          comprimentoM: p.comprimentoM,
          alturaM: p.alturaM,
          espessuraM: p.espessuraM,
          areaAberturasM2: p.areaAberturasM2,
        },
      }));

    case 'CONTAGEM_PORTAS':
    case 'CONTAGEM_JANELAS':
    case 'AREA_ESQUADRIAS': {
      const tipo = medidaId === 'CONTAGEM_PORTAS' ? 'door' : 'window';
      const alvo =
        medidaId === 'AREA_ESQUADRIAS'
          ? // VÃO LIVRE FICA DE FORA: esquadria é o caixilho que se compra, e um
            // vão sem esquadria não tem o que orçar aqui. Ele já aparece no
            // quantitativo por outro caminho — desconta área de parede e
            // interrompe rodapé.
            quant.aberturas.filter((o) => o.tipo !== 'passage')
          : quant.aberturas.filter((o) => o.tipo === tipo);

      return alvo.map((o) => ({
        ref: o.uid,
        rotulo: `${nomeDoTipo(o.tipo)} ${o.larguraM.toFixed(2)} × ${o.alturaM.toFixed(2)} m`,
        valor: medidaId === 'AREA_ESQUADRIAS' ? o.areaM2 : 1,
        formula: medidaId === 'AREA_ESQUADRIAS' ? 'largura × altura' : 'contagem',
        variaveis: { larguraM: o.larguraM, alturaM: o.alturaM },
      }));
    }

    case 'VOLUME_CONCRETO_PILAR':
    case 'VOLUME_CONCRETO_VIGA':
    case 'VOLUME_CONCRETO_LAJE':
    case 'VOLUME_CONCRETO_FUNDACAO':
    case 'AREA_FORMA_PILAR':
    case 'AREA_FORMA_VIGA':
    case 'AREA_FORMA_LAJE':
    case 'AREA_FORMA_FUNDACAO':
    case 'COMPRIMENTO_ESTACA':
    case 'CONTAGEM_PILARES':
    case 'CONTAGEM_ESTACAS': {
      const FUNDACAO: StructuralKind[] = ['ESTACA', 'BLOCO_COROAMENTO', 'VIGA_FUNDACAO'];
      const tipos: StructuralKind[] = medidaId.endsWith('_PILAR') || medidaId === 'CONTAGEM_PILARES'
        ? ['PILAR']
        : medidaId.endsWith('_VIGA')
          ? ['VIGA']
          : medidaId.endsWith('_LAJE')
            ? ['LAJE']
            : medidaId.endsWith('_FUNDACAO')
              ? FUNDACAO
              : ['ESTACA'];

      // O FILTRO POR NOME NÃO SE APLICA. Ele existe para recortar ambientes
      // ("só área molhada"), e peça estrutural não tem nome de ambiente — o
      // rótulo dela é "P1", que ninguém filtra por termo. Aplicá-lo aqui
      // esvaziaria a medida em silêncio sempre que houvesse um filtro montado
      // para outra coisa.
      return (quant.estruturas ?? [])
        .filter((e) => tipos.includes(e.kind))
        .map((e) => ({
          ref: e.uid,
          rotulo: e.rotulo
            ? `${e.rotulo} · ${nomeDoTipoEstrutural(e.kind)}`
            : nomeDoTipoEstrutural(e.kind),
          valor: medidaId.startsWith('VOLUME_CONCRETO')
            ? e.volumeConcretoM3
            : medidaId.startsWith('AREA_FORMA')
              ? e.areaFormaM2
              : medidaId === 'COMPRIMENTO_ESTACA'
                ? e.comprimentoM
                : 1,
          formula: medidaId.startsWith('CONTAGEM') ? 'contagem' : e.formula,
          variaveis: {
            tipo: nomeDoTipoEstrutural(e.kind),
            rotulo: e.rotulo || e.structuralId,
            comprimentoM: e.comprimentoM,
            volumeConcretoM3: e.volumeConcretoM3,
            areaFormaM2: e.areaFormaM2,
          },
        }));
    }

    case 'PESO_ACO_PILAR':
    case 'PESO_ACO_VIGA':
    case 'PESO_ACO_LAJE':
    case 'PESO_ACO_FUNDACAO':
    case 'PESO_ACO_TOTAL': {
      // Sem a armadura calculada não há o que medir — quem gera sem ela (uma
      // chamada antiga) recebe lista vazia, e o de-para fica sem lançamento em
      // vez de ganhar um zero que pareceria medido.
      const pecas = extras.armadura?.pecas ?? [];
      const familia = medidaId.replace('PESO_ACO_', '');
      return pecas
        .filter((p) => familia === 'TOTAL' || familiaDaPeca(p.kind) === familia)
        .map((p) => ({
          ref: p.uid,
          rotulo: p.rotulo ? `${p.rotulo} · ${nomeDoTipoEstrutural(p.kind)}` : nomeDoTipoEstrutural(p.kind),
          valor: p.kg,
          formula:
            p.origem === 'TAXA'
              ? 'taxa de referência × volume de concreto'
              : p.origem === 'MANUAL'
                ? `armadura lançada manualmente (${p.descricao}) × (1 + perda)`
                : `esquema mínimo NBR 6118 (${p.descricao}) × (1 + perda)`,
          variaveis: {
            tipo: nomeDoTipoEstrutural(p.kind),
            rotulo: p.rotulo || p.structuralId,
            volumeConcretoM3: p.volumeConcretoM3,
            kg: p.kg,
            taxaKgM3: p.taxaEfetivaKgM3,
            descricao: p.descricao,
            origem: p.origem,
          },
        }));
    }

    case 'COMPRIMENTO_GUARDA_CORPO':
    case 'AREA_GUARDA_CORPO':
    case 'COMPRIMENTO_CORRIMAO':
      return (quant.guardaCorpos ?? [])
        .filter((g) => (medidaId === 'COMPRIMENTO_CORRIMAO' ? g.tipo === 'CORRIMAO' : g.tipo === 'GUARDA_CORPO'))
        .map((g, i) => ({
          ref: g.uid,
          rotulo: `${g.rotulo || `${g.tipo === 'CORRIMAO' ? 'Corrimão' : 'Guarda-corpo'} ${i + 1}`} · ${g.material.toLowerCase()} · h ${Math.round(g.alturaM * 100)} cm`,
          valor: medidaId === 'AREA_GUARDA_CORPO' ? g.areaM2 : g.comprimentoM,
          formula: medidaId === 'AREA_GUARDA_CORPO' ? 'Σ comprimento dos trechos × altura' : 'Σ comprimento dos trechos da polilinha',
          variaveis: { comprimentoM: g.comprimentoM, alturaM: g.alturaM, areaM2: g.areaM2, trechos: g.trechos, material: g.material },
        }));

    case 'DEMOLICAO_AREA_PAREDE':
    case 'DEMOLICAO_VOLUME_ALVENARIA':
      return quant.paredes
        .filter((p) => p.fase === 'DEMOLIR')
        .map((p, i) => ({
          ref: p.uid,
          rotulo: `Parede a demolir ${i + 1} · ${p.comprimentoM.toFixed(2)} m × ${p.alturaM.toFixed(2)} m × ${(p.espessuraM * 1000).toFixed(0)} mm`,
          valor: medidaId === 'DEMOLICAO_AREA_PAREDE' ? p.areaFaceLiquidaM2 : p.volumeM3,
          formula: medidaId === 'DEMOLICAO_AREA_PAREDE' ? 'comprimento × altura − vãos' : '(comprimento × altura − vãos) × espessura',
          variaveis: { comprimentoM: p.comprimentoM, alturaM: p.alturaM, espessuraM: p.espessuraM, areaAberturasM2: p.areaAberturasM2 },
        }));

    case 'DEMOLICAO_ABERTURAS':
      return quant.aberturas
        .filter((a) => a.fase === 'DEMOLIR')
        .map((a) => ({ ref: a.uid, rotulo: `${a.nome} · a remover`, valor: 1, formula: '1 por esquadria marcada a demolir', variaveis: { larguraM: a.larguraM, alturaM: a.alturaM } }));

    case 'DEMOLICAO_VOLUME_CONCRETO':
      return quant.estruturas
        .filter((e) => e.fase === 'DEMOLIR')
        .map((e) => ({ ref: e.uid, rotulo: `${e.rotulo || e.kind} · a demolir`, valor: e.volumeConcretoM3, formula: 'volume da peça', variaveis: { volumeConcretoM3: e.volumeConcretoM3 } }));

    case 'DEGRAUS':
    case 'AREA_ESCADA': {
      return (quant.escadas ?? []).map((e, i) => ({
        ref: e.uid,
        rotulo: `${e.rotulo || `${e.tipo === 'RAMPA' ? 'Rampa' : 'Escada'} ${i + 1}`}${e.tipo === 'ESCADA' ? ` · ${e.degraus} degraus` : ` · ${e.inclinacaoPct.toFixed(1)}%`}`,
        valor: medidaId === 'DEGRAUS' ? e.degraus : e.areaPlantaM2,
        formula: medidaId === 'DEGRAUS' ? e.formula : 'área da pegada em planta',
        variaveis: {
          degraus: e.degraus,
          espelhoM: e.espelhoM,
          pisoM: e.pisoM,
          desnivelM: e.desnivelM,
          areaPlantaM2: e.areaPlantaM2,
        },
      }));
    }

    case 'AREA_TELHADO':
    case 'AREA_TELHADO_PROJETADA': {
      // Uma linha por água. O filtro por nome não se aplica pela razão da
      // estrutura: água não tem nome de ambiente.
      return (quant.telhados ?? []).map((a, i) => ({
        ref: a.uid,
        rotulo: `Água ${i + 1} · ${a.inclinacaoPct}%`,
        valor: medidaId === 'AREA_TELHADO' ? a.areaRealM2 : a.areaProjetadaM2,
        formula: medidaId === 'AREA_TELHADO' ? a.formula : 'área do polígono em planta',
        variaveis: {
          inclinacaoPct: a.inclinacaoPct,
          areaProjetadaM2: a.areaProjetadaM2,
          areaRealM2: a.areaRealM2,
        },
      }));
    }

    case 'AREA_SUBREGIAO': {
      return (extras.subRegioes ?? [])
        .filter((s) => s.areaM2 > 0 && (combina(s.rotuloDoMaterial) || combina(s.nome)))
        .map((s) => ({
          ref: s.uid,
          rotulo: `${s.nome} · ${s.rotuloDoMaterial}${s.permeavel ? ' (permeável)' : ''}`,
          valor: s.areaM2,
          formula: 'área do polígono em planta',
          variaveis: { material: s.material, permeavel: s.permeavel ? 'sim' : 'não', areaM2: s.areaM2 },
        }));
    }

    case 'COMPRIMENTO_TUBO_AGUA_FRIA':
    case 'COMPRIMENTO_TUBO_AGUA_QUENTE':
    case 'COMPRIMENTO_TUBO_ESGOTO':
    case 'COMPRIMENTO_ELETRODUTO':
    case 'COMPRIMENTO_DUTO': {
      const disciplina =
        medidaId === 'COMPRIMENTO_ELETRODUTO' ? 'ELETRICA' : medidaId === 'COMPRIMENTO_DUTO' ? 'MECANICA' : medidaId.replace('COMPRIMENTO_TUBO_', '');
      const nome = ROTULO_DA_DISCIPLINA[disciplina as DisciplinaDeRede] ?? disciplina;
      // O `ref` é a linha de compra (disciplina + DN + item): estável entre
      // publicações enquanto existir tubo daquele DN.
      return (quant.totais.porBitola ?? [])
        .filter((b) => b.disciplina === disciplina && b.comprimentoM > 0)
        .map((b) => ({ b, rotulo: `${nome} DN ${b.bitolaMm}${b.itemCode ? ` · ${b.itemCode}` : ''}` }))
        .filter(({ rotulo }) => combina(rotulo))
        .map(({ b, rotulo }) => ({
          ref: `${b.disciplina}-dn${b.bitolaMm}${b.itemCode ? `-${b.itemCode}` : ''}`,
          rotulo,
          valor: b.comprimentoM,
          formula: `Σ comprimento real dos ${b.trechos} trecho(s) DN ${b.bitolaMm}`,
          variaveis: { disciplina: b.disciplina, bitolaMm: b.bitolaMm, trechos: b.trechos, comprimentoM: b.comprimentoM },
        }));
    }

    case 'CONTAGEM_CONEXOES': {
      return (quant.totais.porConexao ?? [])
        .filter((c) => c.quantidade > 0)
        .map((c) => ({
          c,
          rotulo: `${ROTULO_DA_CONEXAO[c.tipo]} DN ${c.bitolaMm}${c.paraMm != null ? `→${c.paraMm}` : ''} · ${ROTULO_DA_DISCIPLINA[c.disciplina as DisciplinaDeRede] ?? c.disciplina}`,
        }))
        .filter(({ rotulo }) => combina(rotulo))
        .map(({ c, rotulo }) => ({
          ref: `${c.disciplina}-${c.tipo}-dn${c.bitolaMm}${c.paraMm != null ? `-${c.paraMm}` : ''}`,
          rotulo,
          valor: c.quantidade,
          formula: `${c.derivadas} deduzida(s) dos encontros de trechos + ${c.manuais} lançada(s) à mão`,
          variaveis: { disciplina: c.disciplina, tipo: c.tipo, bitolaMm: c.bitolaMm, derivadas: c.derivadas, manuais: c.manuais },
        }));
    }

    case 'CONTAGEM_PONTOS_HIDRAULICOS': {
      return (quant.totais.porTerminal ?? [])
        .filter((t) => t.disciplina !== 'ELETRICA' && t.quantidade > 0)
        .map((t) => ({
          t,
          rotulo: `${t.classificacao ? (ROTULO_DO_PONTO_HIDRAULICO[t.classificacao as TipoDePontoHidraulico] ?? t.tipo) : t.tipo} · ${ROTULO_DA_DISCIPLINA[t.disciplina as DisciplinaDeRede] ?? t.disciplina}${t.itemCode ? ` · ${t.itemCode}` : ''}`,
        }))
        .filter(({ rotulo }) => combina(rotulo))
        .map(({ t, rotulo }) => ({
          ref: `${t.disciplina}-${t.classificacao ?? t.tipo}${t.itemCode ? `-${t.itemCode}` : ''}`,
          rotulo,
          valor: t.quantidade,
          formula: 'contagem de pontos da classificação',
          variaveis: { disciplina: t.disciplina, classificacao: t.classificacao ?? t.tipo, quantidade: t.quantidade },
        }));
    }

    case 'AREA_CONSTRUIDA': {
      // UMA linha só: o escopo é a edificação, não o elemento. O filtro por
      // nome não se aplica — não há nome de elemento para casar.
      if (quant.totais.areaConstruidaM2 <= 0) return [];
      return [
        {
          ref: 'edificacao',
          rotulo: 'Edificação',
          valor: quant.totais.areaConstruidaM2,
          formula: 'contorno externo expandido em meia espessura de parede',
          variaveis: { areaConstruidaM2: quant.totais.areaConstruidaM2 },
        },
      ];
    }

    default:
      return [];
  }
}

/**
 * Quanto a planta MEDE de cada medida do catálogo — independente de de-para.
 *
 * ⚠️ Usa o MESMO `medir` que gera as linhas, de propósito: a cobertura
 * (`blueprintCoberturaOrcamento`) diz "a planta tem 1.240 m² de alvenaria sem
 * item", e se ela contasse por outro caminho poderia discordar do orçamento na
 * própria tela que os mostra lado a lado.
 *
 * Medida sem elemento no desenho volta com `quantidade: 0` em vez de sumir: a
 * tela precisa saber a diferença entre "não tem no desenho" e "tem e está fora
 * do orçamento".
 */
export function resumoDasMedidas(
  quant: Quantitativos,
  extras: ExtrasDaGeracao = {},
): { medidaId: string; rotulo: string; dimensao: Dimensao; quantidade: number; elementos: number }[] {
  return MEDIDAS.map((def) => {
    const valores = medir(quant, def.id, [], extras);
    return {
      medidaId: def.id,
      rotulo: def.rotulo,
      dimensao: def.dimensao,
      quantidade: valores.reduce((soma, v) => soma + v.valor, 0),
      elementos: valores.length,
    };
  });
}

export interface ContextoGeracao {
  studyId: string;
  studyName: string;
  snapshotId: string;
  snapshotHash: string;
  revision: number;
}

/**
 * Gera as linhas de orçamento a partir de um quantitativo e do de-para.
 *
 * Função PURA: recebe o quantitativo e os itens já resolvidos, devolve linhas e
 * divergências. Não fala com o banco, o que é o que a torna testável — o erro
 * que interessa (unidade incompatível, medida inexistente) não precisa de rede
 * para aparecer.
 */
export function gerarLancamentos(
  quant: Quantitativos,
  resolvidos: MapeamentoResolvido[],
  ctx: ContextoGeracao,
  extras: ExtrasDaGeracao = {},
): ResultadoGeracao {
  const entries: BudgetEntry[] = [];
  const divergencias: Divergencia[] = [];

  const procedencia =
    `Gerado da planta "${ctx.studyName}", versão ${ctx.revision} ` +
    `(hash ${ctx.snapshotHash.slice(0, 12)}). Política ${quant.policy.version}, ` +
    `kernel ${quant.kernelVersion || '—'}.`;

  for (const { mapeamento: m, item } of resolvidos) {
    if (!m.active) continue;

    const def = MEDIDA_POR_ID.get(m.medida);
    if (!def) {
      divergencias.push({
        mapeamentoId: m.id,
        medida: m.medida,
        itemCode: m.item_code,
        motivo: `Medida "${m.medida}" não existe no catálogo de medidas.`,
      });
      continue;
    }

    if (!item) {
      divergencias.push({
        mapeamentoId: m.id,
        medida: m.medida,
        itemCode: m.item_code,
        motivo: `Item ${m.item_code} não encontrado no catálogo (SINAPI nem base própria).`,
      });
      continue;
    }

    // A TRAVA. Recusa, não avisa.
    const dimItem = dimensaoDaUnidade(item.unit);
    if (dimItem !== def.dimensao) {
      divergencias.push({
        mapeamentoId: m.id,
        medida: m.medida,
        itemCode: m.item_code,
        motivo:
          `"${def.rotulo}" produz ${def.dimensao}, mas o item ${m.item_code} é cotado ` +
          `em "${item.unit}"${dimItem ? ` (${dimItem})` : ' (unidade não reconhecida)'}. ` +
          `Nenhuma linha foi gerada — o número sairia plausível e errado.`,
      });
      continue;
    }

    const medidos = medir(quant, m.medida, m.filtro_ambiente ?? [], extras);
    if (medidos.length === 0) continue;

    const base = {
      sinapiItem: item,
      phase: m.phase,
      group: m.budget_group,
      discipline: 'Planta Inteligente',
    };

    if (m.agrupamento === 'TOTAL') {
      const total = medidos.reduce((s, v) => s + v.valor, 0);
      entries.push({
        ...base,
        id: `bp:${ctx.studyId}:${m.id}:total`,
        quantity: total,
        notes: procedencia,
        calculationMemory: {
          formula: medidos[0].formula,
          variables: {
            medida: def.rotulo,
            elementos: medidos.length,
            snapshot: ctx.snapshotId,
          },
          result: total,
          justification: procedencia,
        },
      });
    } else {
      for (const v of medidos) {
        entries.push({
          ...base,
          id: `bp:${ctx.studyId}:${m.id}:${v.ref}`,
          quantity: v.valor,
          location: { room: v.rotulo },
          notes: procedencia,
          calculationMemory: {
            formula: v.formula,
            variables: { ...v.variaveis, medida: def.rotulo, snapshot: ctx.snapshotId },
            result: v.valor,
            justification: procedencia,
          },
        });
      }
    }
  }

  return { entries, divergencias };
}

/** Prefixo que marca uma linha como originada de uma planta. */
export function prefixoDoEstudo(studyId: string): string {
  return `bp:${studyId}:`;
}

/**
 * O elemento a que uma linha se refere, ou `null` quando ela não é de um.
 *
 * ─── POR QUE A LEITURA MORA JUNTO DA ESCRITA ────────────────────────────────
 *
 * Os quatro formatos de id são montados neste arquivo, poucas linhas acima:
 *
 *   bp:<estudo>:<mapeamento>:<uid>       uma linha POR ELEMENTO      ← só esta
 *   bp:<estudo>:<mapeamento>:total       o total do desenho
 *   bp:<estudo>:camada:<item>:<funcao>   por material de parede
 *   bp:<estudo>:esquadria:<assinatura>   por TIPO de esquadria
 *
 * Ler isso noutro arquivo seria combinar um formato à distância e deixá-los
 * divergir na primeira mudança. Aqui, quem mexer num tem o outro à vista.
 *
 * `total`, `camada` e `esquadria` NÃO são elementos: um total é do desenho
 * inteiro, uma camada é de um material espalhado por várias paredes, e uma
 * esquadria é do TIPO, não da porta específica. Atribuir qualquer um deles a uma
 * peça daria um custo plausível e errado.
 */
export function refDoElemento(id: string): string | null {
  const partes = id.split(':');
  if (partes.length !== 4 || partes[0] !== 'bp') return null;
  if (partes[2] === 'esquadria' || partes[3] === 'total') return null;
  return partes[3] || null;
}

/** Quanto cada elemento custa, somando as linhas que apontam para ele. */
export function custoPorElemento(
  entries: { id: string; quantity: number; sinapiItem?: { price?: number } }[],
): Map<string, { totalBRL: number; linhas: number }> {
  const mapa = new Map<string, { totalBRL: number; linhas: number }>();
  for (const e of entries) {
    const ref = refDoElemento(e.id);
    if (!ref) continue;
    const atual = mapa.get(ref) ?? { totalBRL: 0, linhas: 0 };
    atual.totalBRL += e.quantity * (e.sinapiItem?.price ?? 0);
    atual.linhas += 1;
    mapa.set(ref, atual);
  }
  return mapa;
}

/**
 * Linhas de orçamento a partir das CAMADAS DE PAREDE — a ponte direta.
 *
 * ─── POR QUE ESTA NÃO PASSA PELO DE-PARA ────────────────────────────────────
 *
 * Todas as outras medidas precisam de um mapeamento porque a geometria não sabe
 * qual item comprar: "área de piso" pode virar contrapiso, cerâmica ou laminado,
 * e quem decide é quem orça. Na camada essa pergunta já foi respondida no
 * DESENHO — o usuário escolheu o item ao montar a composição da parede. Exigir
 * que ele repetisse a escolha no de-para seria pedir a mesma informação duas
 * vezes e criar uma segunda fonte da verdade sobre o mesmo material.
 *
 * ⚠️ E é por isso que uma medida `VOLUME_CAMADA` genérica NÃO foi acrescentada
 * ao catálogo `MEDIDAS`. Ela pareceria natural e seria uma armadilha: um
 * mapeamento aponta UMA medida para UM item, então "volume de camada → item X"
 * somaria bloco, reboco e isolamento de todas as paredes num item só. Sairia
 * uma linha com número plausível e errado — exatamente o desfecho que a trava de
 * unidade no cabeçalho deste arquivo existe para impedir. O de-para continua
 * servindo as medidas do TODO (`VOLUME_ALVENARIA`, `AREA_PAREDE_DUAS_FACES`);
 * a composição vem por aqui.
 *
 * ─── A TRAVA DE UNIDADE VALE IGUAL ──────────────────────────────────────────
 *
 * A camada produz duas grandezas — volume e área de face — e é a UNIDADE do item
 * que decide qual delas vale: m³ leva o volume, m² leva a área. Item cotado em
 * metro linear ou por unidade é RECUSADO com divergência, e não aproximado para
 * a grandeza mais próxima: a mesma disciplina de `gerarLancamentos`.
 *
 * ─── UMA LINHA POR MATERIAL ─────────────────────────────────────────────────
 *
 * Sempre agrupado, nunca por parede. Aqui não há a escolha `TOTAL` ×
 * `POR_ELEMENTO` do de-para porque não há nada a escolher: uma casa tem dezenas
 * de paredes com a mesma composição, e uma linha por parede não é uma lista de
 * compras. O detalhe parede a parede continua no quantitativo, que é onde se
 * confere.
 *
 * Função PURA, como `gerarLancamentos`: recebe os itens já resolvidos.
 */
export function gerarLancamentosDeCamadas(
  quant: Quantitativos,
  itensPorCodigo: Map<string, SinapiItem>,
  ctx: ContextoGeracao,
): ResultadoGeracao {
  const entries: BudgetEntry[] = [];
  const divergencias: Divergencia[] = [];

  const procedencia =
    `Gerado das camadas de parede da planta "${ctx.studyName}", versão ${ctx.revision} ` +
    `(hash ${ctx.snapshotHash.slice(0, 12)}). Política ${quant.policy.version}, ` +
    `kernel ${quant.kernelVersion || '—'}.`;

  for (const m of quant.totais.porMaterial ?? []) {
    // Camada sem material escolhido. Não é erro — desenhar antes de decidir o
    // material é o fluxo normal —, mas some do orçamento, e sumir calado é o que
    // não pode: o volume existe no desenho e não apareceria em lugar nenhum.
    if (!m.itemCode) {
      divergencias.push({
        mapeamentoId: `camada:${m.funcao}`,
        medida: 'CAMADA',
        itemCode: '',
        motivo:
          `${m.volumeM3.toFixed(2)} m³ de camada "${m.funcao}" sem material vinculado. ` +
          `Escolha o item no painel da parede para que ela entre no orçamento.`,
      });
      continue;
    }

    const item = itensPorCodigo.get(m.itemCode);
    if (!item) {
      divergencias.push({
        mapeamentoId: `camada:${m.itemCode}`,
        medida: 'CAMADA',
        itemCode: m.itemCode,
        motivo: `Item ${m.itemCode} não encontrado no catálogo (SINAPI nem base própria).`,
      });
      continue;
    }

    const dim = dimensaoDaUnidade(item.unit);
    if (dim !== 'M3' && dim !== 'M2') {
      divergencias.push({
        mapeamentoId: `camada:${m.itemCode}`,
        medida: 'CAMADA',
        itemCode: m.itemCode,
        motivo:
          `A camada produz volume (M3) ou área de face (M2), mas o item ${m.itemCode} ` +
          `é cotado em "${item.unit}"${dim ? ` (${dim})` : ' (unidade não reconhecida)'}. ` +
          `Nenhuma linha foi gerada — o número sairia plausível e errado.`,
      });
      continue;
    }

    const valor = dim === 'M3' ? m.volumeM3 : m.areaFaceM2;
    if (valor <= 0) continue;

    entries.push({
      // Determinístico e sob o prefixo do estudo, para `aplicarNoOrcamento`
      // SUBSTITUIR em vez de empilhar quando a planta for republicada. A função
      // entra na chave porque ela entra no agrupamento: duas camadas com o mesmo
      // código e funções diferentes são duas linhas, e dois ids iguais fariam
      // uma sumir.
      id: `bp:${ctx.studyId}:camada:${m.itemCode}:${m.funcao}`,
      sinapiItem: item,
      quantity: valor,
      phase: '',
      group: 'Camadas de parede',
      discipline: 'Planta Inteligente',
      notes: procedencia,
      calculationMemory: {
        formula:
          dim === 'M3'
            ? 'Σ (área de face líquida × espessura da camada), por parede'
            : 'Σ (área de face líquida), por parede',
        variables: {
          material: m.descricao || m.itemCode,
          funcao: m.funcao,
          volumeM3: m.volumeM3,
          areaFaceM2: m.areaFaceM2,
          snapshot: ctx.snapshotId,
        },
        result: valor,
        justification: procedencia,
      },
    });
  }

  return { entries, divergencias };
}

/**
 * Lançamentos dos ACABAMENTOS DECLARADOS (19/09/2026, E7.2) — piso, forro e
 * rodapé por material, pelo item que o usuário escolheu no ambiente.
 *
 * Espelha `gerarLancamentosDeCamadas`: não passa pelo de-para (a escolha do
 * item já foi feita no desenho), sempre agrupado por escopo × material ×
 * função, e a UNIDADE do item decide a grandeza — piso e forro: m³ leva o
 * volume, m² leva a área; rodapé: m leva o comprimento, m² leva comprimento ×
 * altura. Item em outra unidade é divergência, não aproximação.
 *
 * ⚠️ Quem declara piso no ambiente e AINDA mapeia `AREA_PISO` no de-para
 * compra o piso duas vezes — a prévia mostra os blocos separados para que isso
 * fique visível antes de aplicar (mesma nota das camadas de parede).
 */
export function gerarLancamentosDeAcabamentos(
  quant: Quantitativos,
  itensPorCodigo: Map<string, SinapiItem>,
  ctx: ContextoGeracao,
): ResultadoGeracao {
  const entries: BudgetEntry[] = [];
  const divergencias: Divergencia[] = [];
  const ROTULO = { PISO: 'Piso', FORRO: 'Forro', RODAPE: 'Rodapé' } as const;
  const procedencia =
    `Gerado dos acabamentos declarados por ambiente na planta "${ctx.studyName}", versão ${ctx.revision} ` +
    `(hash ${ctx.snapshotHash.slice(0, 12)}). Política ${quant.policy.version}, ` +
    `kernel ${quant.kernelVersion || '—'}.`;

  for (const m of quant.totais.porAcabamento ?? []) {
    const rotulo = ROTULO[m.escopo];
    const grandeza = m.escopo === 'RODAPE' ? `${m.comprimentoM.toFixed(2)} m` : `${m.areaM2.toFixed(2)} m²`;
    if (!m.itemCode) {
      divergencias.push({
        mapeamentoId: `acabamento:${m.escopo}:${m.funcao ?? ''}`,
        medida: 'ACABAMENTO',
        itemCode: '',
        motivo: `${grandeza} de ${rotulo.toLowerCase()}${m.funcao ? ` (${m.funcao.toLowerCase()})` : ''} sem material vinculado em ${m.ambientes} ambiente(s). Escolha o item nos acabamentos do ambiente.`,
      });
      continue;
    }
    const item = itensPorCodigo.get(m.itemCode);
    if (!item) {
      divergencias.push({ mapeamentoId: `acabamento:${m.escopo}:${m.itemCode}`, medida: 'ACABAMENTO', itemCode: m.itemCode, motivo: `Item ${m.itemCode} não encontrado no catálogo (SINAPI nem base própria).` });
      continue;
    }
    const dim = dimensaoDaUnidade(item.unit);
    const aceitas: Dimensao[] = m.escopo === 'RODAPE' ? ['M', 'M2'] : ['M3', 'M2'];
    if (!dim || !aceitas.includes(dim)) {
      divergencias.push({
        mapeamentoId: `acabamento:${m.escopo}:${m.itemCode}`,
        medida: 'ACABAMENTO',
        itemCode: m.itemCode,
        motivo: `O ${rotulo.toLowerCase()} produz ${aceitas.join(' ou ')}, mas o item ${m.itemCode} é cotado em "${item.unit}". Nenhuma linha foi gerada.`,
      });
      continue;
    }
    const valor = dim === 'M3' ? m.volumeM3 : dim === 'M' ? m.comprimentoM : m.areaM2;
    if (valor <= 0) continue;
    entries.push({
      id: `bp:${ctx.studyId}:acabamento:${m.escopo}:${m.itemCode}:${m.funcao ?? ''}`,
      sinapiItem: item,
      quantity: valor,
      phase: '',
      group: `Acabamentos — ${rotulo.toLowerCase()}`,
      discipline: 'Planta Inteligente',
      notes: procedencia,
      calculationMemory: {
        formula:
          m.escopo === 'RODAPE'
            ? dim === 'M' ? 'Σ (perímetro − vãos que chegam ao piso), por ambiente com rodapé declarado' : 'Σ (comprimento de rodapé × altura declarada), por ambiente'
            : dim === 'M3' ? 'Σ (área de piso líquida × espessura da camada), por ambiente' : 'Σ (área de piso líquida), por ambiente',
        variables: { escopo: m.escopo, material: m.descricao || m.itemCode, funcao: m.funcao ?? '', areaM2: m.areaM2, volumeM3: m.volumeM3, comprimentoM: m.comprimentoM, ambientes: m.ambientes, snapshot: ctx.snapshotId },
        result: valor,
        justification: procedencia,
      },
    });
  }
  return { entries, divergencias };
}

/**
 * Lançamentos dos GUARDA-CORPOS com item declarado (E7.3) — por tipo × material
 * × código, pelo item escolhido na peça. Mesmo contrato dos acabamentos: m leva
 * o comprimento, m² leva comprimento × altura; outra unidade ou sem código é
 * divergência. Peça sem código continua disponível ao de-para
 * (`COMPRIMENTO_GUARDA_CORPO`/`CORRIMAO`).
 */
export function gerarLancamentosDeGuardaCorpos(
  quant: Quantitativos,
  itensPorCodigo: Map<string, SinapiItem>,
  ctx: ContextoGeracao,
): ResultadoGeracao {
  const entries: BudgetEntry[] = [];
  const divergencias: Divergencia[] = [];
  const procedencia =
    `Gerado dos guarda-corpos e corrimãos da planta "${ctx.studyName}", versão ${ctx.revision} ` +
    `(hash ${ctx.snapshotHash.slice(0, 12)}). Política ${quant.policy.version}, kernel ${quant.kernelVersion || '—'}.`;
  for (const m of quant.totais.porGuardaCorpo ?? []) {
    const rotulo = m.tipo === 'CORRIMAO' ? 'Corrimão' : 'Guarda-corpo';
    if (!m.itemCode) continue; // sem código: fica para o de-para, não é divergência
    const item = itensPorCodigo.get(m.itemCode);
    if (!item) {
      divergencias.push({ mapeamentoId: `guarda-corpo:${m.tipo}:${m.itemCode}`, medida: 'GUARDA_CORPO', itemCode: m.itemCode, motivo: `Item ${m.itemCode} não encontrado no catálogo (SINAPI nem base própria).` });
      continue;
    }
    const dim = dimensaoDaUnidade(item.unit);
    if (dim !== 'M' && dim !== 'M2') {
      divergencias.push({ mapeamentoId: `guarda-corpo:${m.tipo}:${m.itemCode}`, medida: 'GUARDA_CORPO', itemCode: m.itemCode, motivo: `O ${rotulo.toLowerCase()} produz M ou M2, mas o item ${m.itemCode} é cotado em "${item.unit}". Nenhuma linha foi gerada.` });
      continue;
    }
    const valor = dim === 'M' ? m.comprimentoM : m.areaM2;
    if (valor <= 0) continue;
    entries.push({
      id: `bp:${ctx.studyId}:guarda-corpo:${m.tipo}:${m.material}:${m.itemCode}`,
      sinapiItem: item,
      quantity: valor,
      phase: '',
      group: `Guarda-corpos — ${rotulo.toLowerCase()}`,
      discipline: 'Planta Inteligente',
      notes: procedencia,
      calculationMemory: {
        formula: dim === 'M' ? 'Σ comprimento das polilinhas' : 'Σ comprimento × altura',
        variables: { tipo: m.tipo, material: m.material, comprimentoM: m.comprimentoM, areaM2: m.areaM2, pecas: m.pecas, snapshot: ctx.snapshotId },
        result: valor,
        justification: procedencia,
      },
    });
  }
  return { entries, divergencias };
}

/**
 * Lançamentos por TIPO DE ESQUADRIA — uma linha por tipo, pelo item dele.
 *
 * Espelha `gerarLancamentosDeCamadas`, decisão por decisão: sempre agrupado
 * (doze P1 são uma linha, não doze), a UNIDADE do item decide a grandeza —
 * `UN` leva a contagem, `M2` leva a área somada dos vãos —, e o que não tem
 * item entra como divergência, não some calado.
 *
 * ─── O DE-PARA CONTINUA VALENDO ─────────────────────────────────────────────
 *
 * `CONTAGEM_PORTAS`/`AREA_ESQUADRIAS` servem à planta SEM tipos. Numa planta
 * com tipos e item, mapear os dois contaria a mesma porta duas vezes — a
 * prévia mostra os blocos separados para que isso fique visível ANTES de
 * aplicar, como já faz com camadas × `VOLUME_ALVENARIA`.
 *
 * Tipos SEM nome (agrupados por medida) ficam fora daqui de propósito: sem
 * item não há o que lançar, e a divergência avisaria de uma coisa que o
 * usuário não decidiu — ele nem deu nome. Só a esquadria DECLARADA entra.
 */
export function gerarLancamentosDeEsquadrias(
  quant: Quantitativos,
  itensPorCodigo: Map<string, SinapiItem>,
  ctx: ContextoGeracao,
): ResultadoGeracao {
  const entries: BudgetEntry[] = [];
  const divergencias: Divergencia[] = [];

  const procedencia =
    `Gerado do quadro de esquadrias da planta "${ctx.studyName}", versão ${ctx.revision} ` +
    `(hash ${ctx.snapshotHash.slice(0, 12)}). Política ${quant.policy.version}, ` +
    `kernel ${quant.kernelVersion || '—'}.`;

  for (const e of quant.totais.porEsquadria ?? []) {
    // Sem nome = ninguém declarou tipo. Não é caso de divergência.
    // ⚠️ Do CAMPO, e não de `assinatura.split('|')[3]`, como era até 24/09/2026:
    // a assinatura é chave de agrupamento, não formato de dados, e um `|`
    // digitado no nome deslocava os campos do split.
    if (!e.declarada) continue;

    if (!e.itemCode) {
      divergencias.push({
        mapeamentoId: `esquadria:${e.nome}`,
        medida: 'ESQUADRIA',
        itemCode: '',
        motivo:
          `${e.quantidade} × ${e.nome} sem item de catálogo vinculado. ` +
          `Escolha o item no painel da abertura para que o tipo entre no orçamento.`,
      });
      continue;
    }

    const item = itensPorCodigo.get(e.itemCode);
    if (!item) {
      divergencias.push({
        mapeamentoId: `esquadria:${e.itemCode}`,
        medida: 'ESQUADRIA',
        itemCode: e.itemCode,
        motivo: `Item ${e.itemCode} não encontrado no catálogo (SINAPI nem base própria).`,
      });
      continue;
    }

    const dim = dimensaoDaUnidade(item.unit);
    if (dim !== 'UN' && dim !== 'M2') {
      divergencias.push({
        mapeamentoId: `esquadria:${e.itemCode}`,
        medida: 'ESQUADRIA',
        itemCode: e.itemCode,
        motivo:
          `A esquadria se conta por unidade (UN) ou pela área do vão (M2), mas o item ${e.itemCode} ` +
          `é cotado em "${item.unit}"${dim ? ` (${dim})` : ' (unidade não reconhecida)'}. ` +
          `Nenhuma linha foi gerada — o número sairia plausível e errado.`,
      });
      continue;
    }

    const valor = dim === 'UN' ? e.quantidade : e.areaM2;
    if (valor <= 0) continue;

    entries.push({
      // Determinístico e sob o prefixo do estudo, para `aplicarNoOrcamento`
      // SUBSTITUIR em vez de empilhar. A assinatura inteira entra na chave: dois
      // tipos com o mesmo item e medidas diferentes são duas linhas.
      id: `bp:${ctx.studyId}:esquadria:${e.assinatura}`,
      sinapiItem: item,
      quantity: valor,
      phase: '',
      group: 'Esquadrias',
      discipline: 'Planta Inteligente',
      notes: procedencia,
      calculationMemory: {
        formula: dim === 'UN' ? 'contagem das aberturas do tipo' : 'Σ (largura × altura) das aberturas do tipo',
        variables: {
          tipo: e.nome,
          larguraM: e.larguraM,
          alturaM: e.alturaM,
          quantidade: e.quantidade,
          areaM2: e.areaM2,
          snapshot: ctx.snapshotId,
        },
        result: valor,
        justification: procedencia,
      },
    });
  }

  return { entries, divergencias };
}

/**
 * Aplica as linhas geradas sobre um orçamento existente.
 *
 * SUBSTITUI as linhas da mesma planta em vez de empilhar. Regerar depois de
 * publicar uma versão nova é a operação normal — se ela duplicasse, o orçamento
 * dobraria em silêncio a cada revisão, que é o pior desfecho possível para um
 * módulo cujo propósito é dar confiança no número.
 *
 * Linha de outra origem (digitada à mão, importada de outro lugar) não é tocada.
 */
export function aplicarNoOrcamento(
  orcamentoAtual: BudgetEntry[],
  novas: BudgetEntry[],
  studyId: string,
): { budget: BudgetEntry[]; removidas: number; adicionadas: number } {
  const prefixo = prefixoDoEstudo(studyId);
  const preservadas = orcamentoAtual.filter((e) => !String(e.id).startsWith(prefixo));

  return {
    budget: [...preservadas, ...novas],
    removidas: orcamentoAtual.length - preservadas.length,
    adicionadas: novas.length,
  };
}
