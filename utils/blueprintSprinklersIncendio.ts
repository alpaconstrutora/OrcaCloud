/**
 * SPRINKLERS — o critério de projeto (01/10/2026, E5.1 do roadmap de incêndio):
 * risco → densidade × área de operação → vazão por sprinkler e da área →
 * duração. A cadeia é DERIVADA, nunca copiada: o estudo grava só o risco (ou
 * nada — a divisão da E0 sugere) e, se quiser, a densidade, a área e a área por
 * sprinkler declaradas, que vencem a tabela.
 *
 * ⚠️ NORMA. A tabela abaixo é o método hidráulico da NBR 10897 (curvas
 * densidade × área), transcrita DE MEMÓRIA pelos pontos de área mínima da
 * NFPA 13, em que a NBR se baseia — CONFERIR NA NORMA antes de emitir.
 *
 * Até a E5.2 não há "Área de Operação" desenhada: o cálculo abre os N
 * sprinklers mais desfavoráveis, N = ⌈área de operação ÷ área por sprinkler⌉.
 */

import { RISCOS_DE_SPRINKLER, pointInPolygon, polygonArea, type AreaDeOperacao, type BlueprintModel, type RiscoDeSprinkler, type Terminal } from './blueprintKernel';

// A lista mora no kernel (0.83.0) porque a Área de Operação declara a sua.
export { RISCOS_DE_SPRINKLER, type RiscoDeSprinkler };

export const ROTULO_DO_RISCO: Record<RiscoDeSprinkler, string> = {
  LEVE: 'Leve',
  ORDINARIO_1: 'Ordinário — grupo 1',
  ORDINARIO_2: 'Ordinário — grupo 2',
  EXTRA_1: 'Extraordinário — grupo 1',
  EXTRA_2: 'Extraordinário — grupo 2',
};

export const FONTE_NBR_10897 = 'NBR 10897, método hidráulico (curvas densidade × área) — CONFERIR NA NORMA (transcrito de memória, pontos de área mínima da NFPA 13)';

export interface LinhaDoRisco {
  /** Densidade de projeto, L/min/m² (= mm/min). */
  densidadeLminM2: number;
  /** Área de operação, m². */
  areaDeOperacaoM2: number;
  /** Área máxima de cobertura por sprinkler (spray padrão), m². */
  areaMaxPorSprinklerM2: number;
  /** Tempo de funcionamento, min. */
  duracaoMin: number;
  /** Adicional de mangueiras (hidrantes) somado à demanda — entra na E5.4. */
  mangueirasLmin: number;
}

/** CONFERIR NA NORMA — ver `FONTE_NBR_10897`. */
export const TABELA_DO_RISCO: Record<RiscoDeSprinkler, LinhaDoRisco> = {
  LEVE: { densidadeLminM2: 4.1, areaDeOperacaoM2: 139, areaMaxPorSprinklerM2: 20.9, duracaoMin: 30, mangueirasLmin: 380 },
  ORDINARIO_1: { densidadeLminM2: 6.1, areaDeOperacaoM2: 139, areaMaxPorSprinklerM2: 12.1, duracaoMin: 60, mangueirasLmin: 950 },
  ORDINARIO_2: { densidadeLminM2: 8.1, areaDeOperacaoM2: 139, areaMaxPorSprinklerM2: 12.1, duracaoMin: 60, mangueirasLmin: 950 },
  EXTRA_1: { densidadeLminM2: 12.2, areaDeOperacaoM2: 232, areaMaxPorSprinklerM2: 9.3, duracaoMin: 90, mangueirasLmin: 1900 },
  EXTRA_2: { densidadeLminM2: 16.3, areaDeOperacaoM2: 232, areaMaxPorSprinklerM2: 9.3, duracaoMin: 90, mangueirasLmin: 1900 },
};

// ─── Premissas do estudo ─────────────────────────────────────────────────────

export interface HipotesesDeSprinklers {
  /** Declarado vence o sugerido pela divisão. `null` = seguir a sugestão. */
  risco: RiscoDeSprinkler | null;
  /** Declarados vencem a tabela do risco. `null` = da tabela. */
  densidadeLminM2: number | null;
  areaDeOperacaoM2: number | null;
  areaPorSprinklerM2: number | null;
  /** E5.3: do defletor ao teto, mm — `null` = 150 (faixa usual 25–300 do spray padrão, CONFERIR NA NORMA). */
  distanciaAoTetoMm: number | null;
}

export const HIPOTESES_SPRINKLERS_PADRAO: HipotesesDeSprinklers = { risco: null, densidadeLminM2: null, areaDeOperacaoM2: null, areaPorSprinklerM2: null, distanciaAoTetoMm: null };
/** E5.3: o padrão da distância do defletor ao teto, mm — CONFERIR NA NORMA. */
export const DISTANCIA_AO_TETO_PADRAO_MM = 150;

const positivoOuNulo = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null);

export function hipotesesDeSprinklersDaColuna(raw: unknown): HipotesesDeSprinklers {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    risco: (RISCOS_DE_SPRINKLER as readonly unknown[]).includes(r.risco) ? (r.risco as RiscoDeSprinkler) : null,
    densidadeLminM2: positivoOuNulo(r.densidadeLminM2),
    areaDeOperacaoM2: positivoOuNulo(r.areaDeOperacaoM2),
    areaPorSprinklerM2: positivoOuNulo(r.areaPorSprinklerM2),
    distanciaAoTetoMm: positivoOuNulo(r.distanciaAoTetoMm),
  };
}

// ─── Risco sugerido pela ocupação ────────────────────────────────────────────

/**
 * O risco pela divisão da E0 (grupo = a letra) — CONFERIR NA NORMA (a NBR 10897
 * classifica por ocupação, em anexo). `null` = sem sugestão: declarar.
 */
export function riscoSugeridoPelaDivisao(divisao: string | null): { risco: RiscoDeSprinkler; motivo: string } | null {
  const g = divisao?.trim().charAt(0).toUpperCase();
  switch (g) {
    case 'A':
    case 'B':
    case 'D':
    case 'E':
    case 'H':
      return { risco: 'LEVE', motivo: `divisão ${divisao}: residencial, hospedagem, escritório, escola e saúde são risco leve` };
    case 'F':
      return { risco: 'LEVE', motivo: `divisão ${divisao}: reunião de público é risco leve, salvo palco e cenário (ordinário 2)` };
    case 'G':
      return { risco: 'ORDINARIO_1', motivo: `divisão ${divisao}: garagem e serviço automotivo são ordinário 1` };
    case 'C':
      return { risco: 'ORDINARIO_2', motivo: `divisão ${divisao}: comércio é ordinário 2` };
    case 'I':
      return { risco: 'ORDINARIO_2', motivo: `divisão ${divisao}: indústria — ordinário 2 como ponto de partida; conferir o processo` };
    case 'J':
      return { risco: 'ORDINARIO_2', motivo: `divisão ${divisao}: depósito até 3,7 m de altura de armazenamento; acima disso, proteção específica` };
    default:
      return null;
  }
}

// ─── O critério ──────────────────────────────────────────────────────────────

export type OrigemDoValor = 'DECLARADA' | 'SUGERIDA' | 'TABELA';

export interface CriterioDeSprinklers {
  risco: { valor: RiscoDeSprinkler; origem: OrigemDoValor; motivo: string } | null;
  /** Sem risco (nem declarado nem sugerido) os números abaixo são nulos e o cálculo diz o motivo. */
  densidade: { valorLminM2: number; origem: OrigemDoValor } | null;
  areaDeOperacao: { valorM2: number; origem: OrigemDoValor } | null;
  areaPorSprinkler: { valorM2: number; origem: OrigemDoValor } | null;
  duracaoMin: number | null;
  /** ⌈área de operação ÷ área por sprinkler⌉ — os que abrem juntos. */
  sprinklersNaArea: number | null;
  /** Densidade × área por sprinkler: o que o MAIS desfavorável tem de dar. */
  vazaoPorSprinklerLmin: number | null;
  /** Densidade × área de operação. */
  vazaoDaAreaLmin: number | null;
  fonte: string;
  /** De onde saiu — para a Área de Operação com risco próprio rederivar (E5.2). */
  hipoteses: HipotesesDeSprinklers;
  divisao: string | null;
}

export function criterioDeSprinklers(hs: HipotesesDeSprinklers, divisao: string | null): CriterioDeSprinklers {
  const sug = riscoSugeridoPelaDivisao(divisao);
  const risco = hs.risco
    ? { valor: hs.risco, origem: 'DECLARADA' as const, motivo: 'declarado nas premissas' }
    : sug
      ? { valor: sug.risco, origem: 'SUGERIDA' as const, motivo: sug.motivo }
      : null;
  const vazio: CriterioDeSprinklers = { risco, densidade: null, areaDeOperacao: null, areaPorSprinkler: null, duracaoMin: null, sprinklersNaArea: null, vazaoPorSprinklerLmin: null, vazaoDaAreaLmin: null, fonte: FONTE_NBR_10897, hipoteses: hs, divisao };
  if (!risco) return vazio;
  const t = TABELA_DO_RISCO[risco.valor];
  const escolher = (declarado: number | null, tabela: number) => (declarado != null ? { v: declarado, origem: 'DECLARADA' as const } : { v: tabela, origem: 'TABELA' as const });
  const d = escolher(hs.densidadeLminM2, t.densidadeLminM2);
  const A = escolher(hs.areaDeOperacaoM2, t.areaDeOperacaoM2);
  const a = escolher(hs.areaPorSprinklerM2, t.areaMaxPorSprinklerM2);
  return {
    ...vazio,
    densidade: { valorLminM2: d.v, origem: d.origem },
    areaDeOperacao: { valorM2: A.v, origem: A.origem },
    areaPorSprinkler: { valorM2: a.v, origem: a.origem },
    duracaoMin: t.duracaoMin,
    // O épsilon segura 139 ÷ 13,9 = 10,000000001 de virar 11.
    sprinklersNaArea: Math.max(1, Math.ceil(A.v / a.v - 1e-9)),
    vazaoPorSprinklerLmin: d.v * a.v,
    vazaoDaAreaLmin: d.v * A.v,
  };
}

// ─── A Área de Operação desenhada (E5.2) ─────────────────────────────────────

/** Área do contorno, m². */
export const areaDoContornoM2 = (a: Pick<AreaDeOperacao, 'pontos'>) => polygonArea(a.pontos) / 1e6;

/** Os sprinklers da área — DERIVADOS: do mesmo pavimento, com o ponto dentro do contorno (a borda conta). */
export function sprinklersDaArea(model: BlueprintModel, a: AreaDeOperacao): Terminal[] {
  return (model.terminais ?? []).filter((t) => t.disciplina === 'INCENDIO' && t.tipoHidraulico === 'SPRINKLER' && t.levelId === a.levelId && pointInPolygon(a.pontos, t.at));
}

/** O critério da área: o risco dela, se declarado, vence o do estudo; o resto das premissas é o do estudo. */
export function criterioDaArea(doEstudo: CriterioDeSprinklers, a: AreaDeOperacao): CriterioDeSprinklers {
  return a.risco ? criterioDeSprinklers({ ...doEstudo.hipoteses, risco: a.risco }, doEstudo.divisao) : doEstudo;
}

