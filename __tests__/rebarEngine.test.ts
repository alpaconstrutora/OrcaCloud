import { describe, it, expect } from 'vitest'
import {
  theoreticalLinearWeight,
  stirrupHookCm,
  calcStirrupPerimeter,
  calcStirrupCount,
  calcLapSpliceCm,
  calcRebarResult,
  aggregateByBitola,
} from '../utils/rebarEngine'
import type { Rebar, StructuralElement, SteelCatalogItem } from '../types/structural'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const catalog: Record<string, SteelCatalogItem> = {
  ca50_10: {
    id: 'c-10', org_id: null, tipo: 'CA-50', bitola_mm: 10, peso_linear_kg_m: 0.617,
    comprimento_barra_m: 12, fabricante: null, custo_kg: 10.0, custo_barra: null, perda_pct_padrao: 10,
    created_at: '', created_by: null, updated_at: '',
  },
  ca50_125: {
    id: 'c-125', org_id: null, tipo: 'CA-50', bitola_mm: 12.5, peso_linear_kg_m: 0.963,
    comprimento_barra_m: 12, fabricante: null, custo_kg: 9.5, custo_barra: null, perda_pct_padrao: 10,
    created_at: '', created_by: null, updated_at: '',
  },
  ca60_5: {
    id: 'c-5', org_id: null, tipo: 'CA-60', bitola_mm: 5, peso_linear_kg_m: 0.154,
    comprimento_barra_m: 12, fabricante: null, custo_kg: null, custo_barra: null, perda_pct_padrao: 10,
    created_at: '', created_by: null, updated_at: '',
  },
}

const vigas: StructuralElement = {
  id: 'el-v1', org_id: 'org', assembly_id: 'asm',
  tipo: 'viga', nome: 'V1', quantidade: 3,
  geometria: { b: 20, h: 40, comprimento: 600 }, // 20×40, 6m
  cobrimento_cm: 3,
  created_at: '', created_by: null, updated_at: '',
}

function makeRebar(overrides: Partial<Rebar>): Rebar {
  return {
    id: 'r-1', org_id: 'org', element_id: 'el-v1',
    bitola_id: 'c-125', funcao: 'longitudinal',
    posicao: 1, quantidade: 4, espacamento_cm: null, comprimento_unit_cm: null,
    formato_dobra: 'reta', dobras: [],
    created_at: '', created_by: null, updated_at: '',
    ...overrides,
  }
}

// ── Peso linear (NBR 7480) ────────────────────────────────────────────────────

describe('theoreticalLinearWeight', () => {
  it('Ø5 → 0.154 kg/m', () => expect(theoreticalLinearWeight(5)).toBeCloseTo(0.154, 2))
  it('Ø10 → 0.617 kg/m', () => expect(theoreticalLinearWeight(10)).toBeCloseTo(0.617, 2))
  it('Ø12.5 → 0.963 kg/m', () => expect(theoreticalLinearWeight(12.5)).toBeCloseTo(0.963, 2))
  it('Ø16 → 1.578 kg/m', () => expect(theoreticalLinearWeight(16)).toBeCloseTo(1.578, 2))
  it('Ø25 → 3.853 kg/m', () => expect(theoreticalLinearWeight(25)).toBeCloseTo(3.853, 2))
})

// ── Gancho de estribo ─────────────────────────────────────────────────────────

describe('stirrupHookCm', () => {
  it('Ø10 → gancho = 10 cm (10d)', () => expect(stirrupHookCm(10)).toBe(10))
  it('Ø5  → gancho = 7.5 cm (mínimo NBR 6118)', () => expect(stirrupHookCm(5)).toBe(7.5))
  it('Ø8  → gancho = 8 cm', () => expect(stirrupHookCm(8)).toBe(8))
  it('Ø6.3 → gancho = max(6.3, 7.5) = 7.5 cm', () => expect(stirrupHookCm(6.3)).toBe(7.5))
})

// ── Perímetro do estribo ──────────────────────────────────────────────────────

describe('calcStirrupPerimeter', () => {
  // Viga 20×40, cobrimento 3 cm, Ø10
  // innerB = 14, innerH = 34 → 2*(14+34) = 96 cm + 2*10 = 116 cm
  it('viga 20×40 c=3 Ø10 → 116 cm', () => {
    expect(calcStirrupPerimeter(20, 40, 3, 10)).toBeCloseTo(116, 1)
  })

  // Pilar 25×25, c=3, Ø8
  // innerB = 19, innerH = 19 → 2*(19+19) = 76 + 2*8 = 92 cm
  it('pilar 25×25 c=3 Ø8 → 92 cm', () => {
    expect(calcStirrupPerimeter(25, 25, 3, 8)).toBeCloseTo(92, 1)
  })

  // Ø5 com hook mínimo 7.5 cm
  // Viga 20×40, c=3, Ø5 → 96 + 2*7.5 = 111 cm
  it('viga 20×40 c=3 Ø5 (gancho mínimo) → 111 cm', () => {
    expect(calcStirrupPerimeter(20, 40, 3, 5)).toBeCloseTo(111, 1)
  })
})

// ── Contagem de estribos ──────────────────────────────────────────────────────

describe('calcStirrupCount', () => {
  // Vão útil 500 cm, @20 cm → floor(500/20)+1 = 26
  it('vão 500 cm @20 cm → 26 estribos', () => {
    expect(calcStirrupCount(500, 20)).toBe(26)
  })

  // Vão útil 480 cm, @15 cm → floor(480/15)+1 = 33
  it('vão 480 cm @15 cm → 33 estribos', () => {
    expect(calcStirrupCount(480, 15)).toBe(33)
  })

  it('espaçamento 0 retorna 0', () => {
    expect(calcStirrupCount(500, 0)).toBe(0)
  })
})

// ── Transpasse ────────────────────────────────────────────────────────────────

describe('calcLapSpliceCm', () => {
  // Ø12.5 mm, k=50 → 50*12.5/10 = 62.5 cm
  it('Ø12.5 k=50 → 62.5 cm', () => expect(calcLapSpliceCm(12.5, 50)).toBeCloseTo(62.5, 2))
  it('Ø10 k=50 → 50 cm', () => expect(calcLapSpliceCm(10, 50)).toBeCloseTo(50, 2))
  it('Ø16 k=60 → 96 cm', () => expect(calcLapSpliceCm(16, 60)).toBeCloseTo(96, 2))
})

// ── calcRebarResult ───────────────────────────────────────────────────────────

describe('calcRebarResult — barra longitudinal', () => {
  // V1: 20×40, L=600 cm, cobrimento=3, quantidade=3 vigas iguais
  // 4 barras Ø12.5, sem comprimento informado
  // comprimentoUnit = 600 - 2*3 = 594 cm
  // 594 < 1200 cm → 0 emendas
  // qtdTotal = 4 barras × 3 vigas = 12
  // comprimentoTotal = 594 × 12 = 7128 cm
  // peso = 71.28 m × 0.963 kg/m = 68.642 kg
  // pesoComPerda = 68.642 × 1.10 = 75.506 kg
  // custo = 75.506 × 9.5 = 717.31 R$

  const rebar = makeRebar({ quantidade: 4 })
  const result = calcRebarResult({ rebar, element: vigas, catalogItem: catalog.ca50_125 })

  it('comprimentoUnitCm = 594', () => expect(result.comprimentoUnitCm).toBeCloseTo(594, 1))
  it('qtdCalculada = 4 (sem espaçamento)', () => expect(result.qtdCalculada).toBe(4))
  it('nSplices = 0 (barra < 12 m)', () => expect(result.nSplices).toBe(0))
  it('comprimentoTotalCm = 7128', () => expect(result.comprimentoTotalCm).toBeCloseTo(7128, 1))
  it('pesoKg ≈ 68.642', () => expect(result.pesoKg).toBeCloseTo(68.642, 1))
  it('pesoComPerdaKg ≈ 75.506', () => expect(result.pesoComPerdaKg).toBeCloseTo(75.506, 1))
  it('custoEstimado ≈ 717.31', () => expect(result.custoEstimado).toBeCloseTo(717.31, 0))
})

describe('calcRebarResult — barra longitudinal com emenda (>12 m)', () => {
  // Elemento com vão de 1500 cm (15 m)
  const bigElement: StructuralElement = {
    ...vigas, quantidade: 1,
    geometria: { b: 25, h: 50, comprimento: 1500 },
  }
  // comprimentoUnit = 1500 - 6 = 1494 cm
  // barraCm = 1200, nSplices = floor(1494/1200) = 1
  // splice Ø12.5 k=50 = 62.5 cm
  // comprimentoComSplice = 1494 + 62.5 = 1556.5 cm
  // qtdTotal = 2 barras × 1 elemento = 2
  // comprimentoTotal = 1556.5 × 2 = 3113 cm

  const rebar = makeRebar({ quantidade: 2 })
  const result = calcRebarResult({ rebar, element: bigElement, catalogItem: catalog.ca50_125 })

  it('nSplices = 2 (1 por barra × 2 barras)', () => expect(result.nSplices).toBe(2))
  it('comprimentoTotalCm = 3113', () => expect(result.comprimentoTotalCm).toBeCloseTo(3113, 1))
})

describe('calcRebarResult — estribo com espaçamento', () => {
  // V1: 20×40, L=600, c=3 → vão útil = 594 cm
  // Estribo Ø10 @20cm → n = floor(594/20)+1 = 30 estribos
  // perímetro = 116 cm, 30 estribos × 3 vigas = 90 total
  // comprimentoTotal = 116 × 90 = 10440 cm = 104.4 m
  // peso = 104.4 × 0.617 = 64.415 kg
  // pesoComPerda = 64.415 × 1.10 = 70.857 kg
  // sem custo (ca60_5 tem custo_kg null — mas usamos ca50_10 com custo 10)

  const rebar = makeRebar({
    bitola_id: 'c-10', funcao: 'estribo', quantidade: 1,
    espacamento_cm: 20, comprimento_unit_cm: null,
  })
  const result = calcRebarResult({ rebar, element: vigas, catalogItem: catalog.ca50_10 })

  it('comprimentoUnitCm = 116 (perímetro do estribo)', () => {
    expect(result.comprimentoUnitCm).toBeCloseTo(116, 1)
  })
  it('qtdCalculada = 30 (vão 594 @20 cm)', () => expect(result.qtdCalculada).toBe(30))
  it('comprimentoTotalCm = 10440 (116 × 90)', () => {
    expect(result.comprimentoTotalCm).toBeCloseTo(10440, 1)
  })
  it('pesoKg ≈ 64.415', () => expect(result.pesoKg).toBeCloseTo(64.415, 1))
  it('pesoComPerdaKg ≈ 70.857', () => expect(result.pesoComPerdaKg).toBeCloseTo(70.857, 1))
  it('custo ≈ R$ 708.57', () => expect(result.custoEstimado).toBeCloseTo(708.57, 0))
})

describe('calcRebarResult — comprimento_unit_cm informado diretamente', () => {
  const rebar = makeRebar({ quantidade: 2, comprimento_unit_cm: 400 })
  const result = calcRebarResult({ rebar, element: vigas, catalogItem: catalog.ca50_125 })

  it('usa o comprimento informado (400 cm)', () => {
    expect(result.comprimentoUnitCm).toBe(400)
  })
  it('comprimentoTotalCm = 2400 (400 × 2 barras × 3 vigas)', () => {
    expect(result.comprimentoTotalCm).toBeCloseTo(2400, 1)
  })
})

describe('calcRebarResult — sem custo_kg', () => {
  const rebar = makeRebar({ bitola_id: 'c-5', quantidade: 1 })
  const result = calcRebarResult({ rebar, element: vigas, catalogItem: catalog.ca60_5 })

  it('custoEstimado = null quando custo_kg não cadastrado', () => {
    expect(result.custoEstimado).toBeNull()
  })
})

// ── aggregateByBitola ─────────────────────────────────────────────────────────

describe('aggregateByBitola', () => {
  it('agrega corretamente duas posições da mesma bitola', () => {
    const r1 = makeRebar({ id: 'r-1', quantidade: 2, comprimento_unit_cm: 300 })
    const r2 = makeRebar({ id: 'r-2', quantidade: 3, comprimento_unit_cm: 200 })
    const res1 = calcRebarResult({ rebar: r1, element: { ...vigas, quantidade: 1 }, catalogItem: catalog.ca50_125 })
    const res2 = calcRebarResult({ rebar: r2, element: { ...vigas, quantidade: 1 }, catalogItem: catalog.ca50_125 })

    const rows = aggregateByBitola([
      { result: res1, catalogItem: catalog.ca50_125 },
      { result: res2, catalogItem: catalog.ca50_125 },
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0].bitolaMm).toBe(12.5)
    // peso r1: (600/100)*0.963 = 5.778 kg; peso r2: (600/100)*0.963 = 5.778 kg → total = 11.556
    expect(rows[0].pesoKg).toBeCloseTo(res1.pesoKg + res2.pesoKg, 2)
  })

  it('mantém duas bitolas separadas', () => {
    const rLong = makeRebar({ id: 'r-long', quantidade: 2, comprimento_unit_cm: 300 })
    const rEst = makeRebar({ id: 'r-est', bitola_id: 'c-10', quantidade: 10, comprimento_unit_cm: 116 })
    const resLong = calcRebarResult({ rebar: rLong, element: { ...vigas, quantidade: 1 }, catalogItem: catalog.ca50_125 })
    const resEst = calcRebarResult({ rebar: rEst, element: { ...vigas, quantidade: 1 }, catalogItem: catalog.ca50_10 })

    const rows = aggregateByBitola([
      { result: resLong, catalogItem: catalog.ca50_125 },
      { result: resEst, catalogItem: catalog.ca50_10 },
    ])

    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.bitolaMm).sort()).toEqual([10, 12.5])
  })
})
