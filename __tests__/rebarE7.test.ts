/**
 * Testes E7 — descontos de dobra + otimizador melhorado
 */
import { describe, it, expect } from 'vitest'
import {
  bendDeductionCm,
  calcDevelopedLength,
  calcRebarResult,
} from '../utils/rebarEngine'
import {
  cuttingStockFFD,
  cuttingStockBFD,
  cuttingStockDP,
  cuttingStockOptimal,
} from '../utils/cuttingStock'
import type { Rebar, StructuralElement, SteelCatalogItem } from '../types/structural'

// ─────────────────────────────────────────────────────────────────────────────
// Descontos de dobra
// ─────────────────────────────────────────────────────────────────────────────

describe('bendDeductionCm', () => {
  it('retorna 0 para ângulo zero', () => {
    expect(bendDeductionCm(0, 12.5)).toBe(0)
  })

  it('retorna 0 para bitola zero', () => {
    expect(bendDeductionCm(90, 0)).toBe(0)
  })

  it('90° CA-50 rFactor=3.5 — desconto positivo e razoável para Ø12.5', () => {
    // Fórmula: Δ = (2·(3.5+0.5)·tan(45°) − 3.5·π/2) · 12.5/10
    // = (8·1 − 5.4978) · 1.25 = 2.5022 · 1.25 ≈ 3.13 cm
    const d = bendDeductionCm(90, 12.5)
    expect(d).toBeGreaterThan(0)
    expect(d).toBeCloseTo(3.13, 1)
  })

  it('45° < 90° < 135° (descontos crescentes com ângulo)', () => {
    const d45  = bendDeductionCm(45,  12.5)
    const d90  = bendDeductionCm(90,  12.5)
    const d135 = bendDeductionCm(135, 12.5)
    expect(d45).toBeGreaterThan(0)
    expect(d90).toBeGreaterThan(d45)
    expect(d135).toBeGreaterThan(d90)
  })

  it('desconto proporcional à bitola (90°): Ø16 > Ø12.5 > Ø8', () => {
    const d8   = bendDeductionCm(90, 8)
    const d125 = bendDeductionCm(90, 12.5)
    const d16  = bendDeductionCm(90, 16)
    expect(d8).toBeLessThan(d125)
    expect(d125).toBeLessThan(d16)
  })
})

describe('calcDevelopedLength', () => {
  it('retorna null para array vazio', () => {
    expect(calcDevelopedLength([], 12.5)).toBeNull()
  })

  it('retorna null para null/undefined', () => {
    expect(calcDevelopedLength(null, 12.5)).toBeNull()
    expect(calcDevelopedLength(undefined, 12.5)).toBeNull()
  })

  it('barra reta simples (sem dobras) = soma das retas', () => {
    const result = calcDevelopedLength([{ tipo: 'reta', cm: 300 }], 12.5)
    expect(result).toBe(300)
  })

  it('barra com 1 dobra de 90° — comprimento < soma das retas', () => {
    // trecho1=100cm + dobra90 + trecho2=100cm
    const result = calcDevelopedLength([
      { tipo: 'reta', cm: 100 },
      { tipo: 'dobra', ang: 90 },
      { tipo: 'reta', cm: 100 },
    ], 12.5)
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(200)  // desconto aplicado
    expect(result!).toBeGreaterThan(190) // mas não pode descontar demais
  })

  it('barra em U (2 dobras 90°) com Ø16', () => {
    const d90 = bendDeductionCm(90, 16)
    const expected = 50 + 100 + 50 - 2 * d90
    const result = calcDevelopedLength([
      { tipo: 'reta', cm: 50 },
      { tipo: 'dobra', ang: 90 },
      { tipo: 'reta', cm: 100 },
      { tipo: 'dobra', ang: 90 },
      { tipo: 'reta', cm: 50 },
    ], 16)
    expect(result).toBeCloseTo(expected, 2)
  })

  it('nunca retorna valor negativo', () => {
    // Caso absurdo: muitas dobras em barra curta
    const result = calcDevelopedLength([
      { tipo: 'reta', cm: 1 },
      { tipo: 'dobra', ang: 180 },
    ], 20)
    expect(result).toBeGreaterThanOrEqual(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// calcRebarResult integrado com dobras
// ─────────────────────────────────────────────────────────────────────────────

const mockCatalog: SteelCatalogItem = {
  id: 'cat-1', org_id: null, tipo: 'CA-50', bitola_mm: 12.5,
  peso_linear_kg_m: 0.963, comprimento_barra_m: 12,
  custo_kg: null, custo_barra: null, perda_pct_padrao: 10,
  fabricante: null, created_at: '', updated_at: '',
}

const mockElement: StructuralElement = {
  id: 'el-1', assembly_id: 'a-1', org_id: 'org-1',
  tipo: 'viga', nome: 'V1', quantidade: 2, cobrimento_cm: 3,
  geometria: { comprimento: 600, b: 20, h: 50 },
  created_at: '', updated_at: '', created_by: null,
}

describe('calcRebarResult com dobras', () => {
  it('sem dobras: comportamento idêntico ao legado', () => {
    const rebar: Rebar = {
      id: 'r1', org_id: 'org-1', element_id: 'el-1', bitola_id: 'cat-1',
      funcao: 'longitudinal', posicao: 1, quantidade: 4,
      espacamento_cm: null, comprimento_unit_cm: null,
      formato_dobra: 'reta', dobras: [],
      created_at: '', created_by: null, updated_at: '',
    }
    const res = calcRebarResult({ rebar, element: mockElement, catalogItem: mockCatalog })
    expect(res.comprimentoDesenvolvidoCm).toBeNull()
    expect(res.totalDeducaoCm).toBe(0)
    // comprimento = 600 - 2×3 = 594 cm (geometria legada)
    expect(res.comprimentoUnitCm).toBe(594)
  })

  it('com dobras: comprimentoUnitCm = comprimento desenvolvido com desconto', () => {
    const rebar: Rebar = {
      id: 'r2', org_id: 'org-1', element_id: 'el-1', bitola_id: 'cat-1',
      funcao: 'longitudinal', posicao: 2, quantidade: 2,
      espacamento_cm: null, comprimento_unit_cm: null,
      formato_dobra: 'gancho', dobras: [
        { tipo: 'reta', cm: 200 },
        { tipo: 'dobra', ang: 90 },
        { tipo: 'reta', cm: 300 },
      ],
      created_at: '', created_by: null, updated_at: '',
    }
    const res = calcRebarResult({ rebar, element: mockElement, catalogItem: mockCatalog })
    const d90 = bendDeductionCm(90, 12.5)
    expect(res.comprimentoUnitCm).toBeCloseTo(500 - d90, 2)
    expect(res.comprimentoDesenvolvidoCm).toBe(500) // soma das retas
    expect(res.totalDeducaoCm).toBeCloseTo(d90, 2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Otimizadores BFD e DP
// ─────────────────────────────────────────────────────────────────────────────

describe('cuttingStockBFD', () => {
  it('array vazio → 0 barras', () => {
    const r = cuttingStockBFD([], 1200)
    expect(r.nBars).toBe(0)
  })

  it('1 peça 100cm → 1 barra, sobra 1100', () => {
    const r = cuttingStockBFD([{ id: 'a', label: 'a', lengthCm: 100, qty: 1 }], 1200, 0)
    expect(r.nBars).toBe(1)
    expect(r.wasteCm).toBeCloseTo(1100, 1)
  })

  it('uso ≤ 1 (não excede capacidade)', () => {
    const pieces = [
      { id: 'a', label: 'a', lengthCm: 400, qty: 3 },
      { id: 'b', label: 'b', lengthCm: 300, qty: 2 },
    ]
    const r = cuttingStockBFD(pieces, 1200, 0)
    expect(r.usagePct).toBeLessThanOrEqual(1)
    expect(r.nBars).toBeGreaterThan(0)
  })
})

describe('cuttingStockDP', () => {
  it('array vazio → 0 barras', () => {
    const r = cuttingStockDP([], 1200)
    expect(r.nBars).toBe(0)
  })

  it('4×300cm em barras de 1200cm → 1 barra (aproveitamento perfeito)', () => {
    const r = cuttingStockDP([{ id: 'a', label: 'a', lengthCm: 300, qty: 4 }], 1200, 0)
    expect(r.nBars).toBe(1)
    expect(r.wasteCm).toBeCloseTo(0, 1)
    expect(r.usagePct).toBeCloseTo(1, 2)
  })

  it('DP ≤ FFD em número de barras (não piora)', () => {
    const pieces = [
      { id: 'a', label: 'a', lengthCm: 380, qty: 5 },
      { id: 'b', label: 'b', lengthCm: 520, qty: 3 },
      { id: 'c', label: 'c', lengthCm: 210, qty: 7 },
    ]
    const ffd = cuttingStockFFD(pieces, 1200, 0)
    const dp  = cuttingStockDP(pieces,  1200, 0)
    expect(dp.nBars).toBeLessThanOrEqual(ffd.nBars)
  })
})

describe('cuttingStockOptimal', () => {
  it('seleciona DP para ≤200 itens e retorna resultado válido', () => {
    const r = cuttingStockOptimal([{ id: 'a', label: 'a', lengthCm: 250, qty: 8 }], 1200, 0)
    expect(r.nBars).toBeGreaterThan(0)
    expect(r.usagePct).toBeGreaterThan(0)
    expect(r.usagePct).toBeLessThanOrEqual(1)
  })

  it('invariante: usedCm = soma total das peças', () => {
    const pieces = [
      { id: 'a', label: 'a', lengthCm: 355, qty: 6 },
      { id: 'b', label: 'b', lengthCm: 480, qty: 4 },
    ]
    const r = cuttingStockOptimal(pieces, 1200, 0)
    const expected = 355 * 6 + 480 * 4
    expect(r.usedCm).toBeCloseTo(expected, 1)
  })
})
