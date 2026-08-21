/**
 * O LOTE, derivado das divisas.
 *
 * ─── POR QUE A ÁREA NÃO VEM DE `Space` ──────────────────────────────────────
 *
 * O arranjo planar já transforma um anel fechado de limites num ambiente, e
 * seria natural ler `Space.areaMm2` e pronto. Não serve, e o motivo é concreto:
 * a área do ambiente é `grossArea − holeArea` (`arrangement.ts`). Um anel de
 * terreno em volta da casa produz uma face que tem a casa como BURACO — ou seja,
 * a área do QUINTAL, não a do lote. Quanto maior a construção, menor o "terreno".
 *
 * O número que vale — o que está na matrícula, o que divide para dar taxa de
 * ocupação — é a área do polígono do lote, inteira, ignorando o que foi
 * construído dentro. Por isso ela é calculada aqui, direto do anel.
 *
 * ─── ESTE MÓDULO É PURO ─────────────────────────────────────────────────────
 *
 * Recebe limites, devolve medidas. Não conhece React, nem serviço, nem canvas —
 * é o que permite testá-lo sem navegador, e o que impede uma segunda cópia da
 * regra do anel aparecer no renderizador.
 */

import {
  anelRecuado,
  envelopeValido,
  pointKey,
  polygonArea,
  type Boundary,
  type BoundaryPapel,
  type ObjectId,
  type Point,
  type Space,
} from './blueprintKernel';

export interface Terreno {
  /** Vértices na ordem do contorno, SEM repetir o primeiro no fim. */
  anel: Point[];
  /** Ids das divisas, na mesma ordem dos lados do anel. */
  ladosIds: ObjectId[];
  areaMm2: number;
  perimetroMm: number;
  fechado: boolean;
  /**
   * Distância entre a última ponta e a primeira, quando o contorno não fecha.
   *
   * Todo levantamento tem erro de fechamento — os lados medidos em campo nunca
   * voltam exatamente ao ponto de partida. Esconder isso é esconder erro de
   * medida: a área sairia de um polígono que o software fechou sozinho, e
   * ninguém saberia de quanto foi a licença que ele tomou.
   */
  erroFechamentoMm: number;
}

/** Só as divisas que formam o lote. Limite solto (`DIVISA`) não entra. */
export function divisasDoLote(limites: Boundary[]): Boundary[] {
  return limites.filter((b) => b.kind === 'TERRENO');
}

/**
 * Caminha o contorno e devolve os vértices na ordem.
 *
 * Começa por uma ponta SOLTA quando existe uma — num contorno aberto, começar
 * pelo meio devolveria metade do traçado e a área sairia de um polígono que não
 * é o desenho. Não havendo ponta solta, o contorno é um ciclo e qualquer vértice
 * serve de início.
 *
 * ⚠️ Com bifurcação (um vértice onde três divisas se encontram) o caminho é
 * ambíguo; aqui se toma a primeira aresta não usada. Um lote não tem bifurcação,
 * e forçar uma escolha é melhor que devolver nada — o erro de fechamento
 * denuncia o resultado estranho.
 */
export function anelDoTerreno(limites: Boundary[]): Point[] {
  return caminhar(divisasDoLote(limites)).vertices;
}

function caminhar(divisas: Boundary[]): {
  vertices: Point[];
  ladosIds: ObjectId[];
  voltouAoInicio: boolean;
} {
  if (divisas.length === 0) return { vertices: [], ladosIds: [], voltouAoInicio: false };

  const incidentes = new Map<string, { id: ObjectId; de: Point; para: Point }[]>();
  const registrar = (de: Point, para: Point, id: ObjectId) => {
    const chave = pointKey(de);
    const lista = incidentes.get(chave) ?? [];
    lista.push({ id, de, para });
    incidentes.set(chave, lista);
  };
  for (const b of divisas) {
    registrar(b.a, b.b, b.id);
    registrar(b.b, b.a, b.id);
  }

  // Ponta solta = vértice com uma única divisa. É por onde um contorno ABERTO
  // começa; num ciclo não existe nenhuma, e aí qualquer vértice serve.
  let inicio: Point | null = null;
  for (const b of divisas) {
    for (const p of [b.a, b.b]) {
      if ((incidentes.get(pointKey(p)) ?? []).length === 1) {
        inicio = p;
        break;
      }
    }
    if (inicio) break;
  }
  if (!inicio) inicio = divisas[0].a;

  const usadas = new Set<ObjectId>();
  const vertices: Point[] = [inicio];
  const ladosIds: ObjectId[] = [];
  let atual = inicio;

  for (let passo = 0; passo < divisas.length; passo++) {
    const saidas = incidentes.get(pointKey(atual)) ?? [];
    const proxima = saidas.find((s) => !usadas.has(s.id));
    if (!proxima) break;
    usadas.add(proxima.id);
    ladosIds.push(proxima.id);
    atual = proxima.para;
    vertices.push(atual);
  }

  // ⚠️ TESTAR O FECHAMENTO ANTES DE TIRAR A REPETIÇÃO. O último vértice repete o
  // primeiro quando o contorno fecha; removê-lo primeiro e só então comparar
  // "último com primeiro" compara o vértice ERRADO — o penúltimo do caminho — e
  // um lote perfeitamente fechado passa a ser relatado como aberto, com erro de
  // fechamento do tamanho de um lado inteiro.
  const voltouAoInicio =
    vertices.length > 1 && pointKey(vertices[vertices.length - 1]) === pointKey(vertices[0]);

  // Sem a repetição, o anel fica no formato que `polygonArea` espera — ela fecha
  // sozinha.
  if (voltouAoInicio) vertices.pop();

  return { vertices, ladosIds, voltouAoInicio };
}

/**
 * Mede o lote. `null` quando não há divisa de terreno nenhuma.
 *
 * A área só faz sentido com o contorno fechado; num contorno aberto ela é a do
 * polígono que se obtém ligando a última ponta à primeira — e é exatamente por
 * isso que `erroFechamentoMm` vem junto, dizendo de quanto foi essa licença.
 */
export function medirTerreno(limites: Boundary[]): Terreno | null {
  const divisas = divisasDoLote(limites);
  if (divisas.length === 0) return null;

  const { vertices, ladosIds, voltouAoInicio } = caminhar(divisas);
  if (vertices.length < 2) return null;

  const primeiro = vertices[0];
  const ultimo = vertices[vertices.length - 1];
  // Fechou quando TODA divisa entrou no caminho e o caminho voltou ao início.
  // Sem a primeira metade, um lote com uma divisa solta pendurada seria dado
  // como fechado — o anel fecha, mas o desenho tem um pedaço fora dele.
  const todasUsadas = ladosIds.length === divisas.length;
  const fechado = voltouAoInicio && todasUsadas && vertices.length >= 3;
  const erroFechamentoMm = voltouAoInicio
    ? 0
    : Math.round(Math.hypot(ultimo.x - primeiro.x, ultimo.y - primeiro.y));

  return {
    anel: vertices,
    ladosIds,
    areaMm2: vertices.length >= 3 ? Math.abs(polygonArea(vertices)) : 0,
    perimetroMm: divisas.reduce(
      (soma, b) => soma + Math.round(Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y)),
      0,
    ),
    fechado,
    erroFechamentoMm,
  };
}

const MM2_PARA_M2 = 1_000_000;

/** Área do lote em m², a unidade em que o mundo fala de terreno. */
export function areaEmM2(terreno: Terreno): number {
  return terreno.areaMm2 / MM2_PARA_M2;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recuos e envelope construtivo
// ─────────────────────────────────────────────────────────────────────────────

/** Recuos em MILÍMETRO, por papel de divisa. Zero = sem recuo naquele lado. */
export interface Recuos {
  FRENTE: number;
  FUNDOS: number;
  LATERAL_DIREITA: number;
  LATERAL_ESQUERDA: number;
}

export const RECUOS_ZERO: Recuos = {
  FRENTE: 0,
  FUNDOS: 0,
  LATERAL_DIREITA: 0,
  LATERAL_ESQUERDA: 0,
};

export interface Envelope {
  /** Anel do que sobra para construir. Vazio quando os recuos não cabem. */
  anel: Point[];
  areaMm2: number;
  /**
   * `false` quando os recuos comem o lote inteiro — o anel se inverte ou se
   * auto-intercepta e a área que sairia dele não significa nada. É resposta de
   * projeto ("não cabe"), não erro de software, e por isso vem como campo em vez
   * de exceção.
   */
  valido: boolean;
}

/**
 * O envelope construtivo: o lote recuado por lado, segundo o papel de cada divisa.
 *
 * Divisa sem papel não recua. É deliberado: inventar um recuo padrão para um lado
 * que ninguém classificou desenharia uma restrição que não existe no projeto —
 * e restrição inventada é pior que restrição faltando, porque parece conferida.
 *
 * ⚠️ Isto é o que `plantaAiEngine.calculateEnvelope` NÃO sabe fazer: lá o terreno
 * é `frontage × depth` menos recuos, ou seja, só retângulo. Aqui o lote pode ter
 * qualquer forma, e os cantos fecham pela mitra.
 */
export function envelopeConstrutivo(
  terreno: Terreno,
  limites: Boundary[],
  recuos: Recuos,
): Envelope {
  const vazio: Envelope = { anel: [], areaMm2: 0, valido: false };
  if (terreno.anel.length < 3) return vazio;

  const porId = new Map(limites.map((b) => [b.id, b]));
  const recuoDoLado = terreno.ladosIds.map((id) => {
    const papel = porId.get(id)?.papel;
    return papel ? recuos[papel] : 0;
  });
  if (recuoDoLado.length !== terreno.anel.length) return vazio;
  if (recuoDoLado.every((r) => r === 0)) {
    // Sem nenhum recuo, o envelope É o lote — e dizer isso é mais honesto que
    // devolver vazio, que a tela leria como "não cabe".
    return { anel: terreno.anel, areaMm2: terreno.areaMm2, valido: true };
  }

  const anel = anelRecuado(terreno.anel, recuoDoLado);
  const valido = envelopeValido(terreno.anel, anel);
  return {
    anel: valido ? anel : [],
    areaMm2: valido ? Math.abs(polygonArea(anel)) : 0,
    valido,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Aproveitamento — taxa de ocupação e coeficiente
// ─────────────────────────────────────────────────────────────────────────────

export interface Aproveitamento {
  /** Projeção construída ÷ área do lote, em fração (0,5 = 50%). */
  taxaOcupacao: number;
  /** Área construída total ÷ área do lote. */
  coeficienteAproveitamento: number;
  areaProjetadaM2: number;
  areaConstruidaM2: number;
}

/**
 * Quanto do lote está ocupado, e quanto se construiu em relação a ele.
 *
 * ⚠️ **TO e CA usam a MESMA área aqui, e isso é uma limitação declarada, não um
 * descuido.** Taxa de ocupação é a PROJEÇÃO no terreno; coeficiente é a soma de
 * TODOS os pavimentos. Enquanto o editor trabalha um nível de cada vez, os dois
 * números coincidem — e mentir que já somam pavimento seria pior que dizer que
 * ainda não somam. Quando o modelo passar a ter mais de um nível desenhado, o CA
 * passa a somar as áreas de todos eles e este comentário sai.
 */
export function calcularAproveitamento(
  terreno: Terreno,
  ambientes: Space[],
): Aproveitamento | null {
  if (terreno.areaMm2 <= 0) return null;
  const construidaMm2 = ambientes.reduce((soma, s) => soma + s.areaMm2, 0);
  return {
    taxaOcupacao: construidaMm2 / terreno.areaMm2,
    coeficienteAproveitamento: construidaMm2 / terreno.areaMm2,
    areaProjetadaM2: construidaMm2 / MM2_PARA_M2,
    areaConstruidaM2: construidaMm2 / MM2_PARA_M2,
  };
}

/** Papéis na ordem em que aparecem na tela. */
export const PAPEIS_DE_DIVISA: BoundaryPapel[] = [
  'FRENTE',
  'FUNDOS',
  'LATERAL_DIREITA',
  'LATERAL_ESQUERDA',
];

export const ROTULO_DO_PAPEL: Record<BoundaryPapel, string> = {
  FRENTE: 'Frente',
  FUNDOS: 'Fundos',
  LATERAL_DIREITA: 'Lateral direita',
  LATERAL_ESQUERDA: 'Lateral esquerda',
};
