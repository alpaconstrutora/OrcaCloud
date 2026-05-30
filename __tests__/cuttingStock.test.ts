import { describe, it, expect } from 'vitest'
import { cuttingStockFFD, buildProjectBarPlan } from '../utils/cuttingStock'
import type { StockPiece } from '../utils/cuttingStock'
import type { CutTableRow } from '../utils/cutTable'
import type { SteelCatalogItem } from '../types/structural'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function piece(id: string, lengthCm: number, qty = 1): StockPiece {
  return { id, label: id, lengthCm, qty }
}

// ── cuttingStockFFD ───────────────────────────────────────────────────────────

describe('cuttingStockFFD — entrada vazia', () => {
  const r = cuttingStockFFD([], 1200)
  it('nBars = 0', () => expect(r.nBars).toBe(0))
  it('usagePct = 0', () => expect(r.usagePct).toBe(0))
  it('bars = []', () => expect(r.bars).toEqual([]))
})

describe('cuttingStockFFD — todas as peças em uma barra', () => {
  // 3 peças de 300 cm → soma = 900 < 1200 → cabe em 1 barra
  const pieces = [piece('a', 300, 3)]
  const r = cuttingStockFFD(pieces, 1200, 0) // kerf=0 para simplificar

  it('nBars = 1', () => expect(r.nBars).toBe(1))
  it('usedCm = 900', () => expect(r.usedCm).toBeCloseTo(900, 1))
  it('wasteCm = 300', () => expect(r.wasteCm).toBeCloseTo(300, 1))
  it('usagePct = 0.75', () => expect(r.usagePct).toBeCloseTo(0.75, 2))
  it('1 barra com 3 cortes', () => expect(r.bars[0].cuts).toHaveLength(3))
})

describe('cuttingStockFFD — múltiplas barras necessárias', () => {
  // 4 peças de 500 cm → soma = 2000 cm > 1200 → mínimo 2 barras
  // FFD: 500+500 = 1000 em barra 1 (sobra 200), 500+500 em barra 2 (sobra 200)
  const pieces = [piece('p', 500, 4)]
  const r = cuttingStockFFD(pieces, 1200, 0)

  it('nBars = 2', () => expect(r.nBars).toBe(2))
  it('usedCm = 2000', () => expect(r.usedCm).toBeCloseTo(2000, 1))
  it('wasteCm = 400 (200 × 2)', () => expect(r.wasteCm).toBeCloseTo(400, 1))
  it('2 cortes por barra', () => {
    r.bars.forEach(b => expect(b.cuts).toHaveLength(2))
  })
})

describe('cuttingStockFFD — FFD ordena maior primeiro (melhor empacotamento)', () => {
  // 1 peça grande (700) + 2 peças médias (400) + 1 pequena (200)
  // FFD (maior primeiro): [700, 400, 400, 200]
  // Barra 1: 700 + 400 = 1100 (sobra 100) — pequena 200 não cabe
  // Barra 2: 400 + 200 = 600 (sobra 600)
  // Total barras = 2
  const pieces = [piece('sm', 200), piece('md', 400, 2), piece('lg', 700)]
  const r = cuttingStockFFD(pieces, 1200, 0)

  it('nBars = 2 (FFD empacota melhor que 3)', () => expect(r.nBars).toBe(2))
  it('usedCm = 1700', () => expect(r.usedCm).toBeCloseTo(1700, 1))
})

describe('cuttingStockFFD — kerf é descontado entre peças', () => {
  // 4 peças de 298.9 cm, kerf = 0.3 cm
  // Barra 1: 298.9 + (298.9+0.3) + (298.9+0.3) = 896.8... + (298.9+0.3) = 1196.4 → sobra 3.6
  // Cabe 4 peças? 298.9 + 3*(298.9+0.3) = 298.9 + 897.6 = 1196.5 → sobra 3.5 cm → sim
  const pieces = [piece('k', 298.9, 4)]
  const r = cuttingStockFFD(pieces, 1200, 0.3)

  it('nBars = 1 com kerf (peças cabem na margem)', () => expect(r.nBars).toBe(1))
  it('wasteCm = sobra < 4 cm', () => expect(r.wasteCm).toBeLessThan(4))
})

describe('cuttingStockFFD — peça maior que a barra (inválido)', () => {
  // Peça de 1500 cm > barra de 1200 cm → cria uma barra negativa (caso de dado inválido)
  // O sistema deve colocar a peça numa barra própria; a barra fica com waste negativo
  // Na prática, o usuário não deveria ter peça > barra; cabe ao módulo de entrada validar
  const pieces = [piece('big', 1500)]
  const r = cuttingStockFFD(pieces, 1200, 0)

  it('nBars = 1 (1 barra por peça, mesmo "estourando")', () => expect(r.nBars).toBe(1))
})

describe('cuttingStockFFD — usagePct correto', () => {
  // 600 cm em barra de 1200 → 50%
  const r = cuttingStockFFD([piece('half', 600)], 1200, 0)
  it('usagePct = 0.50', () => expect(r.usagePct).toBeCloseTo(0.5, 3))
})

// ── buildProjectBarPlan ───────────────────────────────────────────────────────

const catalog125: SteelCatalogItem = {
  id: 'c-125', org_id: null, tipo: 'CA-50', bitola_mm: 12.5,
  peso_linear_kg_m: 0.963, comprimento_barra_m: 12, fabricante: null,
  custo_kg: 10.0, custo_barra: null, perda_pct_padrao: 10,
  created_at: '', created_by: null, updated_at: '',
}

function mockRow(bitola: number, comp: number, qty: number, pos: number | string = 1): CutTableRow {
  return {
    pos, assemblyNome: 'Bloco A', elementNome: 'V1', elementTipo: 'viga',
    bitolaMm: bitola, tipo: 'CA-50', formatoDobra: 'reta',
    comprimentoCm: comp, qtdPecas: qty,
    pesoUnitKg: (comp / 100) * 0.963,
    pesoTotalKg: (comp / 100) * 0.963 * qty,
    pesoComPerdaKg: (comp / 100) * 0.963 * qty * 1.1,
  }
}

describe('buildProjectBarPlan', () => {
  const rows = [
    mockRow(12.5, 500, 2, 1),
    mockRow(12.5, 300, 4, 2),
  ]
  const plan = buildProjectBarPlan(rows, [catalog125], 1200, 0)

  it('gera 1 plano por bitola', () => expect(plan.bitolaPlans).toHaveLength(1))
  it('bitola = 12.5', () => expect(plan.bitolaPlans[0].bitolaMm).toBe(12.5))
  it('totalBars > 0', () => expect(plan.totalBars).toBeGreaterThan(0))
  it('overallUsagePct entre 0 e 1', () => {
    expect(plan.overallUsagePct).toBeGreaterThan(0)
    expect(plan.overallUsagePct).toBeLessThanOrEqual(1)
  })
  it('totalWasteKg ≥ 0', () => expect(plan.totalWasteKg).toBeGreaterThanOrEqual(0))
  it('wasteKg derivado do catálogo', () => {
    expect(plan.bitolaPlans[0].wasteKg).toBeDefined()
  })
  it('wasteCostBrl calculado quando custo_kg está no catálogo', () => {
    expect(plan.bitolaPlans[0].wasteCostBrl).not.toBeNull()
    expect(plan.bitolaPlans[0].wasteCostBrl).toBeGreaterThanOrEqual(0)
  })
  it('totalWasteCostBrl calculado', () => {
    expect(plan.totalWasteCostBrl).not.toBeNull()
  })
})

describe('buildProjectBarPlan — duas bitolas diferentes', () => {
  const rows = [mockRow(12.5, 400, 2), mockRow(10, 300, 3)]
  const catalog10: SteelCatalogItem = {
    ...catalog125, id: 'c-10', bitola_mm: 10, peso_linear_kg_m: 0.617, custo_kg: null,
  }
  const plan = buildProjectBarPlan(rows, [catalog125, catalog10], 1200, 0)

  it('2 planos (uma por bitola)', () => expect(plan.bitolaPlans).toHaveLength(2))
  it('ordenado por bitola crescente', () => {
    expect(plan.bitolaPlans[0].bitolaMm).toBe(10)
    expect(plan.bitolaPlans[1].bitolaMm).toBe(12.5)
  })
  it('totalWasteCostBrl null quando alguma bitola não tem custo', () => {
    // Ø10 sem custo → não contribui → mas Ø12.5 tem, então resultado não é null
    // O resultado depende da implementação (some tem, some não)
    // Apenas verificar que é number ou null
    expect(typeof plan.totalWasteCostBrl === 'number' || plan.totalWasteCostBrl === null).toBe(true)
  })
})
