import { describe, it, expect } from 'vitest'
import {
  getCobrimentoNominalCm,
  dimensionarViga,
  dimensionarPilar,
  dimensionarLaje,
  dimensionarSapata,
  dimensionarVigaContinua,
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

  it('Pilar médio (35 <= lambda <= 90) que calcula efeitos de 2ª ordem locais (15x20, Nk=120kN, L=2.5m)', () => {
    const result = dimensionarPilar({
      bCm: 15,
      hCm: 20,
      comprimentoLivreM: 2.5,
      fckMpa: 25,
      caa: 'II',
      nkKn: 120,
      bitolaLongitudinalMm: 10,
    })

    expect(result.status).toBe('ATENCAO')
    expect(result.detalhesTecnicos.esforcos.lambda).toBeGreaterThanOrEqual(35)
    expect(result.detalhesTecnicos.esforcos.e2Cm).toBeGreaterThan(0) // excentricidade de 2ª ordem calculada
    expect(result.detalhesTecnicos.esforcos.mSdTotKnm).toBeGreaterThan(0)
    expect(result.diagnosticos.some(d => d.criterio.includes('Esbeltez') && d.status === 'ATENCAO')).toBe(true)
    expect(result.diagnosticos.some(d => d.criterio.includes('flexo-compressão') && d.status === 'OK')).toBe(true)
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

describe('dimensionarVigaContinua', () => {
  it('Viga contínua simétrica 15x45 que atende (Vão1=4.0m, Vão2=4.0m, q1=q2=15kN/m, fck=25MPa)', () => {
    const result = dimensionarVigaContinua({
      bCm: 15,
      hCm: 45,
      L1M: 4.0,
      L2M: 4.0,
      fckMpa: 25,
      caa: 'II',
      q1Knm: 15.0,
      q2Knm: 15.0,
      bitolaLongitudinalMm: 10,
      bitolaEstriboMm: 5.0,
      deltaRed: 0.90, // redistribuição de 10%
    })

    expect(result.status).toBe('OK')
    expect(result.detalhesTecnicos.volumeConcretoM3).toBeCloseTo(0.54, 2)
    expect(result.detalhesTecnicos.esforcos.MB).toBeLessThan(0)
    expect(result.armaduraSugerida.longitudinalVao1.quantidade).toBeGreaterThanOrEqual(2)
    expect(result.armaduraSugerida.longitudinalVao2.quantidade).toBeGreaterThanOrEqual(2)
    expect(result.armaduraSugerida.longitudinalApoio.quantidade).toBeGreaterThanOrEqual(2)
    expect(result.diagnosticos.some(d => d.criterio.includes('flexão') && d.status === 'OK')).toBe(true)
    expect(result.diagnosticos.some(d => d.criterio.includes('cisalhamento') && d.status === 'OK')).toBe(true)
  })

  it('Viga contínua assimétrica que falha por excesso de carga no apoio central', () => {
    const result = dimensionarVigaContinua({
      bCm: 12,
      hCm: 25, // Seção muito baixa
      L1M: 3.5,
      L2M: 5.5,
      fckMpa: 20,
      caa: 'II',
      q1Knm: 40.0, // Cargas altíssimas
      q2Knm: 50.0,
      bitolaLongitudinalMm: 12.5,
      bitolaEstriboMm: 6.3,
      deltaRed: 0.90,
    })

    expect(result.status).toBe('REPROVADO')
    expect(result.diagnosticos.some(d => d.criterio.includes('flexão') && d.status === 'REPROVADO')).toBe(true)
  })
})

