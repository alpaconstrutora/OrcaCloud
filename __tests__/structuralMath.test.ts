import { describe, it, expect } from 'vitest'
import {
  getCobrimentoNominalCm,
  dimensionarViga,
  dimensionarPilar,
  dimensionarLaje,
  dimensionarSapata,
} from '../utils/structuralMath'

describe('getCobrimentoNominalCm', () => {
  it('Viga CAA I -> 2.5 cm', () => {
    expect(getCobrimentoNominalCm('I', 'viga')).toBe(2.5)
  })
  it('Viga CAA II -> 3.0 cm', () => {
    expect(getCobrimentoNominalCm('II', 'viga')).toBe(3.0)
  })
  it('Laje CAA II -> 2.5 cm', () => {
    expect(getCobrimentoNominalCm('II', 'laje')).toBe(2.5)
  })
  it('Sapata CAA III -> 4.5 cm', () => {
    expect(getCobrimentoNominalCm('III', 'sapata')).toBe(4.5)
  })
})

describe('dimensionarViga', () => {
  it('Viga padrão 15x40 que atende aos esforços (Mk=20kNm, Vk=25kN, fck=25MPa, L=4m)', () => {
    const result = dimensionarViga({
      bCm: 15,
      hCm: 40,
      comprimentoVaoM: 4.0,
      fckMpa: 25,
      caa: 'II',
      mkKnm: 20,
      vkKn: 25,
      bitolaLongitudinalMm: 10,
      bitolaEstriboMm: 5.0,
    })

    expect(result.status).toBe('OK')
    expect(result.armaduraSugerida.longitudinal.quantidade).toBeGreaterThanOrEqual(2)
    expect(result.detalhesTecnicos.volumeConcretoM3).toBeCloseTo(0.24, 2) // 0.15 * 0.40 * 4 = 0.24 m³
    expect(result.diagnosticos.some(d => d.criterio.includes('flexão') && d.status === 'OK')).toBe(true)
    expect(result.diagnosticos.some(d => d.criterio.includes('cisalhamento') && d.status === 'OK')).toBe(true)
  })

  it('Viga subdimensionada à flexão (seção muito pequena para carga alta)', () => {
    const result = dimensionarViga({
      bCm: 12,
      hCm: 20, // altura muito baixa
      comprimentoVaoM: 5.0,
      fckMpa: 20,
      caa: 'II',
      mkKnm: 75, // momento muito alto
      vkKn: 15,
      bitolaLongitudinalMm: 12.5,
      bitolaEstriboMm: 5.0,
    })

    expect(result.status).toBe('REPROVADO')
    expect(result.diagnosticos.some(d => d.criterio.includes('flexão') && d.status === 'REPROVADO')).toBe(true)
  })

  it('Viga que falha por esmagamento da biela (cortante altíssima)', () => {
    const result = dimensionarViga({
      bCm: 12,
      hCm: 30,
      comprimentoVaoM: 3.0,
      fckMpa: 20,
      caa: 'II',
      mkKnm: 10,
      vkKn: 250, // cortante exagerada
      bitolaLongitudinalMm: 10,
      bitolaEstriboMm: 6.3,
    })

    expect(result.status).toBe('REPROVADO')
    expect(result.diagnosticos.some(d => d.criterio.includes('cisalhamento') && d.status === 'REPROVADO')).toBe(true)
  })
})

describe('dimensionarPilar', () => {
  it('Pilar curto 20x20 que atende (Nk=300kN, L=2.0m, fck=30MPa)', () => {
    const result = dimensionarPilar({
      bCm: 20,
      hCm: 20,
      comprimentoLivreM: 2.0,
      fckMpa: 30,
      caa: 'II',
      nkKn: 300,
      bitolaLongitudinalMm: 10,
    })

    expect(result.status).toBe('OK')
    expect(result.diagnosticos.some(d => d.criterio.includes('Esbeltez') && d.status === 'OK')).toBe(true)
    expect(result.diagnosticos.some(d => d.criterio.includes('compressão') && d.status === 'OK')).toBe(true)
    expect(result.armaduraSugerida.longitudinal.quantidade).toBeGreaterThanOrEqual(4)
  })

  it('Pilar que falha por esbeltez excessiva (menor lado muito pequeno)', () => {
    const result = dimensionarPilar({
      bCm: 8, // extremamente fino
      hCm: 20,
      comprimentoLivreM: 4.5,
      fckMpa: 25,
      caa: 'II',
      nkKn: 100,
      bitolaLongitudinalMm: 10,
    })

    expect(result.status).toBe('REPROVADO')
    expect(result.diagnosticos.some(d => d.criterio.includes('Esbeltez') && d.status === 'REPROVADO')).toBe(true)
  })
})

describe('dimensionarLaje', () => {
  it('Laje maciça 3.5m x 4.0m, h=12cm, revestimento=1kN/m², variável=1.5kN/m²', () => {
    const result = dimensionarLaje({
      lxM: 3.5,
      lyM: 4.0,
      hCm: 12,
      fckMpa: 25,
      caa: 'II',
      cargaRevestimentoKnm2: 1.0,
      cargaVariavelKnm2: 1.5,
    })

    expect(result.status).toBe('OK')
    expect(result.diagnosticos.some(d => d.criterio.includes('Espessura') && d.status === 'OK')).toBe(true)
    expect(result.diagnosticos.some(d => d.criterio.includes('flexão') && d.status === 'OK')).toBe(true)
    expect(result.armaduraSugerida.flexao.espaçamentoCm).toBeGreaterThan(0)
  })
})

describe('dimensionarSapata', () => {
  it('Sapata isolada rígida para Nk=450kN, pilar 20x20, solo=0.2MPa', () => {
    const result = dimensionarSapata({
      fckMpa: 25,
      caa: 'II',
      nkKn: 450,
      sigmaSoloMpa: 0.2,
      aPilarCm: 20,
      bPilarCm: 20,
    })

    expect(result.status).toBe('OK')
    expect(result.detalhesTecnicos.dimensaoACm).toBeGreaterThan(50)
    expect(result.detalhesTecnicos.dimensaoBCm).toBeGreaterThan(50)
    expect(result.detalhesTecnicos.volumeConcretoM3).toBeGreaterThan(0)
    expect(result.armaduraSugerida.direcaoA.quantidade).toBeGreaterThan(0)
  })
})
