/**
 * Engine de cálculo de ferragem armada — funções puras (sem DOM, sem Supabase).
 *
 * Princípio: QUANTIFICAR, não DIMENSIONAR.
 * Recebe armaduras já definidas pelo projetista e calcula comprimento,
 * estribo, transpasse, peso e perda. Nunca recebe cargas.
 *
 * Normas base (geometria apenas, não dimensionamento):
 *   NBR 7480 — pesos lineares tabelados
 *   NBR 6118 — cobrimentos, gancho de estribo, transpasse
 */

import type { Rebar, StructuralElement, SteelCatalogItem, BendSegment } from '../types/structural'

// ─────────────────────────────────────────────────────────────────────────────
// Funções elementares (exportadas para testes unitários)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Peso linear teórico (kg/m) pela fórmula NBR 7480.
 * Ø12.5 → 0.006165 × 156.25 ≈ 0.963 ✓
 * Usado apenas para validar o cadastro; a fonte de verdade é o valor tabelado.
 */
export function theoreticalLinearWeight(bitolaMm: number): number {
  return Number((0.006165 * bitolaMm * bitolaMm).toFixed(3))
}

/**
 * Comprimento de gancho por extremidade de estribo (cm).
 * NBR 6118 item 9.4.5: max(10d, 75 mm).
 */
export function stirrupHookCm(bitolaMm: number): number {
  return Math.max((10 * bitolaMm) / 10, 7.5) // resultado em cm
}

/**
 * Perímetro desenvolvido do estribo fechado (cm).
 * perímetro = 2·((b − 2c) + (h − 2c)) + 2·gancho
 *
 * @param b         largura da seção (cm)
 * @param h         altura da seção (cm)
 * @param cobrimento cobrimento nominal (cm)
 * @param bitolaMm  bitola do estribo (mm)
 */
export function calcStirrupPerimeter(
  b: number,
  h: number,
  cobrimento: number,
  bitolaMm: number,
): number {
  const innerB = b - 2 * cobrimento
  const innerH = h - 2 * cobrimento
  const hook = stirrupHookCm(bitolaMm)
  return 2 * (innerB + innerH) + 2 * hook
}

/**
 * Número de estribos em um vão útil.
 * n = floor(vão / espaçamento) + 1
 */
export function calcStirrupCount(vaoUtilCm: number, espacamentoCm: number): number {
  if (espacamentoCm <= 0) return 0
  return Math.floor(vaoUtilCm / espacamentoCm) + 1
}

// ─────────────────────────────────────────────────────────────────────────────
// E7 — Descontos de dobra (NBR 6118 item 8.1 / prática de centrais)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fator de raio mínimo de dobra por aço (NBR 6118 Tab. 8.1, Ductilidade B).
 * CA-50 Ø ≤ 10mm → r = 2d; Ø > 10mm → r = 3.5d  (conservador aqui: sempre 3.5)
 * CA-60 → r = 3d (parafuso/nervurado fino)
 * Usamos r_factor = 3.5 como padrão conservador (barra em uso geral CA-50).
 */
const DEFAULT_R_FACTOR = 3.5

/**
 * Desconto de dobra por ângulo (cm) — fórmula geométrica NBR 6118.
 *
 * `Δ = (2·(r + d/2)·tan(α/2) − r·α·π/180) / 10`
 *
 * onde r = r_factor · d (mm) e d = bitolaMm.
 * Resultado em cm. Valores típicos CA-50 r_factor=3.5:
 *   45°  → Δ ≈ 0.6·d/10 cm
 *   90°  → Δ ≈ 2.0·d/10 cm
 *   135° → Δ ≈ 4.3·d/10 cm
 */
export function bendDeductionCm(
  angleDeg: number,
  bitolaMm: number,
  rFactor = DEFAULT_R_FACTOR,
): number {
  if (angleDeg <= 0 || bitolaMm <= 0) return 0
  const r = rFactor * bitolaMm          // raio interno (mm)
  const alpha = (angleDeg * Math.PI) / 180
  const deductMm = 2 * (r + bitolaMm / 2) * Math.tan(alpha / 2) - r * alpha
  return Math.max(0, Number((deductMm / 10).toFixed(4))) // mm → cm
}

/**
 * Comprimento desenvolvido de UMA barra a partir do array de segmentos.
 *
 * Soma os trechos retos e subtrai os descontos de dobra de cada curva.
 * Se `dobras` estiver vazio ou null → retorna null (sinaliza "use a lógica legada").
 */
export function calcDevelopedLength(
  dobras: BendSegment[] | null | undefined,
  bitolaMm: number,
  rFactor = DEFAULT_R_FACTOR,
): number | null {
  if (!dobras || dobras.length === 0) return null

  let total = 0
  for (const seg of dobras) {
    if (seg.tipo === 'reta' && seg.cm != null) {
      total += seg.cm
    } else if (seg.tipo === 'dobra' && seg.ang != null) {
      total -= bendDeductionCm(seg.ang, bitolaMm, rFactor)
    }
  }
  return Math.max(0, Number(total.toFixed(2)))
}

/**
 * Comprimento de transpasse (emenda) em cm.
 * NBR 6118: l_t = k · d  (k configurável por org; default conservador = 50).
 * Ø12.5 mm, k=50 → 62.5 cm
 */
export function calcLapSpliceCm(bitolaMm: number, k = 50): number {
  return (k * bitolaMm) / 10 // mm → cm
}

// ─────────────────────────────────────────────────────────────────────────────
// Cálculo por armadura (posição da prancha)
// ─────────────────────────────────────────────────────────────────────────────

export interface RebarCalcResult {
  rebarId: string
  /** Comprimento de uma barra/estribo (cm), sem emendas */
  comprimentoUnitCm: number
  /** Comprimento desenvolvido bruto (cm) antes dos descontos — null se dobras não definido */
  comprimentoDesenvolvidoCm: number | null
  /** Soma dos descontos de dobra aplicados (cm) — 0 se sem dobras */
  totalDeducaoCm: number
  /** Comprimento total (cm): unitário + emendas × qtd × qtd_elementos */
  comprimentoTotalCm: number
  /** Quantidade real de barras ou estribos (pode diferir da qtd cadastrada se espaçamento calculado) */
  qtdCalculada: number
  /** Número total de emendas necessárias */
  nSplices: number
  /** Peso total sem perda (kg) */
  pesoKg: number
  /** Peso total com perda de processo (kg) */
  pesoComPerdaKg: number
  /** Custo estimado (R$) — null se custo_kg não cadastrado */
  custoEstimado: number | null
}

export interface CalcRebarInput {
  rebar: Rebar
  element: StructuralElement
  catalogItem: SteelCatalogItem
  /** Fator k do transpasse (default 50) */
  lapSpliceK?: number
}

/**
 * Calcula o resultado completo para uma armadura (chamada da prancha).
 *
 * Regras de comprimento unitário (prioridade):
 *   1. Se `comprimento_unit_cm` informado → usa diretamente.
 *   2. Estribo/porta_estribo → deriva pelo perímetro (§ calcStirrupPerimeter).
 *   3. Demais (longitudinal, distribuição, ancoragem) → comprimento − 2·cobrimento.
 *
 * Quantidade de estribos:
 *   Se funcao = estribo|porta_estribo E espacamento_cm cadastrado → recalcula a partir
 *   do vão útil (comprimento − 2·cobrimento). Usa a qtd recalculada, não a armazenada.
 */
export function calcRebarResult(input: CalcRebarInput): RebarCalcResult {
  const { rebar, element, catalogItem, lapSpliceK = 50 } = input
  const geo = element.geometria
  const c = element.cobrimento_cm
  const bitola = catalogItem.bitola_mm
  const pesoLinear = catalogItem.peso_linear_kg_m
  const barraCm = catalogItem.comprimento_barra_m * 100
  const perdaPct = catalogItem.perda_pct_padrao

  // ── 1. Comprimento unitário ──────────────────────────────────
  let comprimentoUnitCm: number

  // E7: se o array de dobras está definido, calcular comprimento desenvolvido
  // subtraindo os descontos de dobra (NBR 6118). Tem prioridade sobre os demais caminhos.
  const developedFromDobras = calcDevelopedLength(rebar.dobras, bitola)
  if (developedFromDobras != null) {
    comprimentoUnitCm = developedFromDobras
  } else if (rebar.comprimento_unit_cm != null) {
    comprimentoUnitCm = rebar.comprimento_unit_cm
  } else if (rebar.funcao === 'estribo' || rebar.funcao === 'porta_estribo') {
    const b = geo.b ?? 0
    const h = geo.h ?? 0
    comprimentoUnitCm = b > 0 && h > 0
      ? calcStirrupPerimeter(b, h, c, bitola)
      : 0
  } else {
    const comp = geo.comprimento ?? 0
    comprimentoUnitCm = comp > 0 ? comp - 2 * c : 0
  }

  // ── 2. Emendas por barra ─────────────────────────────────────
  const nSplicesPerBar = comprimentoUnitCm > barraCm && barraCm > 0
    ? Math.floor(comprimentoUnitCm / barraCm)
    : 0
  const spliceLengthCm = calcLapSpliceCm(bitola, lapSpliceK)
  const comprimentoComSpliceCm = comprimentoUnitCm + nSplicesPerBar * spliceLengthCm

  // ── 3. Quantidade real ───────────────────────────────────────
  let qtdCalculada = rebar.quantidade
  if (
    (rebar.funcao === 'estribo' || rebar.funcao === 'porta_estribo') &&
    rebar.espacamento_cm != null && rebar.espacamento_cm > 0
  ) {
    const comp = geo.comprimento ?? 0
    const vaoUtil = comp > 0 ? comp - 2 * c : 0
    if (vaoUtil > 0) {
      qtdCalculada = calcStirrupCount(vaoUtil, rebar.espacamento_cm)
    }
  }

  // ── 4. Totais (multiplica pela qtd de peças iguais) ──────────
  const qtdTotal = qtdCalculada * element.quantidade
  const comprimentoTotalCm = comprimentoComSpliceCm * qtdTotal
  const nSplices = nSplicesPerBar * qtdTotal

  // ── 5. Peso e custo ──────────────────────────────────────────
  const pesoKg = (comprimentoTotalCm / 100) * pesoLinear
  const pesoComPerdaKg = pesoKg * (1 + perdaPct / 100)
  const custoEstimado =
    catalogItem.custo_kg != null ? pesoComPerdaKg * catalogItem.custo_kg : null

  // Comprimento bruto desenvolvido (soma das retas antes do desconto) e total deduzido
  let comprimentoDesenvolvidoCm: number | null = null
  let totalDeducaoCm = 0
  if (rebar.dobras && rebar.dobras.length > 0) {
    let bruto = 0
    for (const seg of rebar.dobras) {
      if (seg.tipo === 'reta' && seg.cm != null) bruto += seg.cm
    }
    comprimentoDesenvolvidoCm = Number(bruto.toFixed(2))
    totalDeducaoCm = Number(Math.max(0, bruto - comprimentoUnitCm).toFixed(4))
  }

  return {
    rebarId: rebar.id,
    comprimentoUnitCm,
    comprimentoDesenvolvidoCm,
    totalDeducaoCm,
    comprimentoTotalCm,
    qtdCalculada,
    nSplices,
    pesoKg: Number(pesoKg.toFixed(3)),
    pesoComPerdaKg: Number(pesoComPerdaKg.toFixed(3)),
    custoEstimado: custoEstimado != null ? Number(custoEstimado.toFixed(2)) : null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Quantitativo agregado por bitola (para a aba Quantitativo)
// ─────────────────────────────────────────────────────────────────────────────

export interface QuantitativeRow {
  bitolaId: string
  bitolaMm: number
  tipo: string
  pesoKg: number
  pesoComPerdaKg: number
  custoEstimado: number | null
}

/** Agrega os resultados de várias armaduras por bitola. */
export function aggregateByBitola(results: { result: RebarCalcResult; catalogItem: SteelCatalogItem }[]): QuantitativeRow[] {
  const map = new Map<string, QuantitativeRow>()

  for (const { result, catalogItem } of results) {
    const key = catalogItem.id
    const existing = map.get(key)
    if (existing) {
      existing.pesoKg = Number((existing.pesoKg + result.pesoKg).toFixed(3))
      existing.pesoComPerdaKg = Number((existing.pesoComPerdaKg + result.pesoComPerdaKg).toFixed(3))
      if (result.custoEstimado != null) {
        existing.custoEstimado = Number(((existing.custoEstimado ?? 0) + result.custoEstimado).toFixed(2))
      }
    } else {
      map.set(key, {
        bitolaId: catalogItem.id,
        bitolaMm: catalogItem.bitola_mm,
        tipo: catalogItem.tipo,
        pesoKg: result.pesoKg,
        pesoComPerdaKg: result.pesoComPerdaKg,
        custoEstimado: result.custoEstimado,
      })
    }
  }

  return [...map.values()].sort((a, b) => a.bitolaMm - b.bitolaMm)
}
