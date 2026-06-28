// ============================================================
// Motor de Dimensionamento Estrutural — NBR 6118:2023
// Lógica matemática pura em TypeScript
// ============================================================

export interface DiagnosticItem {
  criterio: string
  status: 'OK' | 'ATENCAO' | 'REPROVADO'
  valorCalculado: string
  valorLimite: string
  referenciaNormativa: string
  mensagem: string
}

export interface DimensionResult {
  status: 'OK' | 'ATENCAO' | 'REPROVADO'
  diagnosticos: DiagnosticItem[]
  armaduraSugerida: Record<string, any>
  detalhesTecnicos: Record<string, any>
}

/**
 * Retorna o cobrimento nominal c_nom em cm com base na CAA (Classe de Agressividade Ambiental)
 * Conforme NBR 6118:2023 Tabela 7.2
 */
export function getCobrimentoNominalCm(caa: 'I' | 'II' | 'III' | 'IV', tipoElemento: 'viga' | 'pilar' | 'laje' | 'sapata'): number {
  const tolerância = 1.0 // 10 mm em cm
  let cmin = 1.5 // lajes CAA I

  if (tipoElemento === 'viga' || tipoElemento === 'pilar') {
    switch (caa) {
      case 'I': return 2.5
      case 'II': return 3.0
      case 'III': return 4.0
      case 'IV': return 5.0
    }
  } else if (tipoElemento === 'laje') {
    switch (caa) {
      case 'I': return 2.0
      case 'II': return 2.5
      case 'III': return 3.5
      case 'IV': return 4.5
    }
  } else {
    // Sapata / Fundações (cobrimento mínimo em contato com o solo é de 30mm a 40mm)
    switch (caa) {
      case 'I': return 3.0
      case 'II': return 3.5
      case 'III': return 4.5
      case 'IV': return 5.5
    }
  }
}

/**
 * Dimensionamento de Viga Retangular Biapoiada (ELU Flexão, ELU Cisalhamento, ELS Flecha e wk)
 */
export function dimensionarViga(params: {
  bCm: number
  hCm: number
  comprimentoVaoM: number
  fckMpa: number
  caa: 'I' | 'II' | 'III' | 'IV'
  mkKnm: number
  vkKn: number
  bitolaLongitudinalMm: number
  bitolaEstriboMm: number
}): DimensionResult {
  const { bCm, hCm, comprimentoVaoM, fckMpa, caa, mkKnm, vkKn, bitolaLongitudinalMm, bitolaEstriboMm } = params
  const diagnosticos: DiagnosticItem[] = []

  // 1. Durabilidade e Coeficientes
  const cNomCm = getCobrimentoNominalCm(caa, 'viga')
  const fcd = fckMpa / 1.4 // MPa
  const fyd = 500 / 1.15 // CA-50 = 434.78 MPa
  const fydKnc2 = fyd / 10 // kN/cm²
  const fcdKnc2 = fcd / 10 // kN/cm²

  // Altura útil d (estimativa)
  const dCm = hCm - cNomCm - (bitolaEstriboMm / 10) - (bitolaLongitudinalMm / 20)
  
  diagnosticos.push({
    criterio: 'Cobrimento nominal',
    status: 'OK',
    valorCalculado: `${cNomCm * 10} mm`,
    valorLimite: `${cNomCm * 10} mm`,
    referenciaNormativa: 'Art. 7.2',
    mensagem: `Cobrimento adequado para CAA ${caa}.`
  })

  // 2. ELU - Flexão Simples (Equação de 2º Grau para x)
  const md = 1.4 * mkKnm // kN.m
  const mdKncm = md * 100 // kN.cm

  const A = 0.272 * bCm * fcdMpaToKnc2(fckMpa)
  const B = -0.68 * bCm * fcdMpaToKnc2(fckMpa) * dCm
  const C = mdKncm

  const delta = B * B - 4 * A * C
  let xCm = 0
  let asNec = 0
  let flexaoStatus: 'OK' | 'ATENCAO' | 'REPROVADO' = 'OK'
  let flexaoMsg = 'Seção de concreto adequada à flexão.'

  if (delta < 0 || dCm <= 0) {
    flexaoStatus = 'REPROVADO'
    flexaoMsg = 'Seção subdimensionada. Aumente a largura (b) ou a altura (h) da viga.'
  } else {
    xCm = (-B - Math.sqrt(delta)) / (2 * A)
    const betaX = xCm / dCm

    if (betaX > 0.45) {
      flexaoStatus = 'REPROVADO'
      flexaoMsg = `A linha neutra (x/d = ${betaX.toFixed(2)}) excedeu o limite de ductilidade (0.45). Aumente a seção de concreto.`
    } else if (betaX > 0.35) {
      flexaoStatus = 'ATENCAO'
      flexaoMsg = `Linha neutra (x/d = ${betaX.toFixed(2)}) próxima ao limite de ruptura frágil.`
    }

    asNec = mdKncm / (fydKnc2 * (dCm - 0.4 * xCm))
  }

  // Taxa de armadura mínima (Tabela 17.1)
  let rhoMin = 0.0015 // fck <= 30 MPa -> 0.15%
  if (fckMpa > 30) {
    // Interpolação simplificada para rho_min
    rhoMin = 0.0015 + (fckMpa - 30) * 0.00008
  }
  const asMin = rhoMin * bCm * hCm
  const asFinal = Math.max(asNec, asMin)

  diagnosticos.push({
    criterio: 'Resistência à flexão (ELU)',
    status: flexaoStatus,
    valorCalculado: flexaoStatus === 'REPROVADO' ? 'Ruptura' : `${asFinal.toFixed(2)} cm²`,
    valorLimite: `Mín: ${asMin.toFixed(2)} cm²`,
    referenciaNormativa: 'Art. 17.2',
    mensagem: flexaoMsg
  })

  // Barras longitudinal sugerida
  const areaBarra = (Math.PI * Math.pow(bitolaLongitudinalMm / 10, 2)) / 4
  const numBarras = flexaoStatus === 'REPROVADO' ? 0 : Math.ceil(asFinal / areaBarra)

  // 3. ELU - Cisalhamento
  const vd = 1.4 * vkKn // kN
  const vrd2 = 0.27 * (1 - fckMpa / 250) * fcdMpaToKnc2(fckMpa) * bCm * dCm
  let cisStatus: 'OK' | 'ATENCAO' | 'REPROVADO' = 'OK'
  let cisMsg = 'Seção de concreto resistente à compressão diagonal.'

  if (vd > vrd2) {
    cisStatus = 'REPROVADO'
    cisMsg = 'Esmagamento da biela de compressão. Aumente a largura da viga ou a classe do concreto.'
  }

  // Parcela resistida pelo concreto
  const fctkInf = 0.21 * Math.pow(fckMpa, 2 / 3) // MPa
  const fctd = fctkInf / 1.4 // MPa
  const vc0 = 0.6 * (fctd / 10) * bCm * dCm // kN

  const vsw = Math.max(0, vd - vc0)
  const aswOverS = vsw / (fydKnc2 * dCm) // cm²/cm

  // Taxa de estribos mínima
  const fctm = 0.3 * Math.pow(fckMpa, 2 / 3) // MPa
  const rhoSwMin = 0.2 * (fctm / 500)
  const aswOverSMin = rhoSwMin * bCm // cm²/cm

  const aswOverSFinal = Math.max(aswOverS, aswOverSMin)

  // Bitola de estribo
  const areaEstribo = 2 * (Math.PI * Math.pow(bitolaEstriboMm / 10, 2)) / 4 // 2 ramos em cm²
  const espaçamentoEstribo = Math.min(30, Math.floor(areaEstribo / aswOverSFinal))
  
  // Limites normativos de espaçamento
  const sMax = vd <= 0.67 * vrd2 ? Math.min(30, 0.6 * dCm) : Math.min(20, 0.3 * dCm)
  const espaçamentoFinal = Math.min(espaçamentoEstribo, sMax)

  diagnosticos.push({
    criterio: 'Resistência ao cisalhamento (ELU)',
    status: cisStatus,
    valorCalculado: cisStatus === 'REPROVADO' ? 'Esmagamento' : `Estribos de c/${espaçamentoFinal} cm`,
    valorLimite: `Máx: c/${Math.floor(sMax)} cm`,
    referenciaNormativa: 'Art. 17.4',
    mensagem: cisMsg
  })

  // 4. ELS - Flecha (Método simplificado de Branson)
  const Ec = 4760 * Math.sqrt(fckMpa) // MPa
  const EcKnc2 = Ec / 10 // kN/cm²
  const Ic = (bCm * Math.pow(hCm, 3)) / 12 // cm⁴
  
  // Carga fictícia em kN/cm de serviço (Mk correspondente à viga biapoiada)
  // Mk = q * L² / 8 -> q = 8 * Mk / L²
  const qServicoKnm = (8 * mkKnm) / Math.pow(comprimentoVaoM, 2)
  const qServicoKncm = qServicoKnm / 100 // kN/cm
  const vaoCm = comprimentoVaoM * 100

  // Momento de fissuração
  const yt = hCm / 2
  const mcr = (1.2 * fctm / 10 * Ic) / yt // kN.cm
  const ma = mkKnm * 100 // kN.cm

  let Ieq = Ic
  if (ma > mcr) {
    const maRatio = Math.pow(mcr / ma, 3)
    const Ifiss = 0.3 * Ic // Aproximação do estádio II simplificada
    Ieq = maRatio * Ic + (1 - maRatio) * Ifiss
  }

  const flechaImediata = (5 * qServicoKncm * Math.pow(vaoCm, 4)) / (384 * EcKnc2 * Ieq)
  const flechaLongaDuracao = flechaImediata * 3 // Fluência com multiplicador 2.0 (total = imediata * 3)

  const flechaLimite = vaoCm / 250 // NBR limite de conforto
  const flechaStatus = flechaLongaDuracao <= flechaLimite ? 'OK' : 'REPROVADO'

  diagnosticos.push({
    criterio: 'Deformação excessiva (ELS)',
    status: flechaStatus,
    valorCalculado: `${flechaLongaDuracao.toFixed(2)} cm`,
    valorLimite: `${flechaLimite.toFixed(2)} cm (L/250)`,
    referenciaNormativa: 'Tabela 13.3',
    mensagem: flechaStatus === 'OK' ? 'Flecha dentro dos limites normativos.' : 'Flecha excessiva! Aumente a altura (h) da viga.'
  })

  // Status Geral do Semáforo
  let overallStatus: 'OK' | 'ATENCAO' | 'REPROVADO' = 'OK'
  if (diagnosticos.some(d => d.status === 'REPROVADO')) {
    overallStatus = 'REPROVADO'
  } else if (diagnosticos.some(d => d.status === 'ATENCAO')) {
    overallStatus = 'ATENCAO'
  }

  // Volume de concreto
  const volumeConcretoM3 = (bCm / 100) * (hCm / 100) * comprimentoVaoM
  const pesoAcoKg = asFinal * 100 * 0.00785 * comprimentoVaoM // Estimativa simplificada

  return {
    status: overallStatus,
    diagnosticos,
    armaduraSugerida: {
      longitudinal: {
        bitolaMm: bitolaLongitudinalMm,
        quantidade: numBarras,
        areaCalculadaCm2: asFinal
      },
      transversal: {
        bitolaMm: bitolaEstriboMm,
        espaçamentoCm: espaçamentoFinal
      }
    },
    detalhesTecnicos: {
      cobrimentoNominalCm: cNomCm,
      alturaUtilCm: dCm,
      flechaImediataCm: flechaImediata,
      flechaLongaDuracaoCm: flechaLongaDuracao,
      volumeConcretoM3,
      pesoAcoKg,
      areaFormaM2: (bCm + 2 * hCm) / 100 * comprimentoVaoM
    }
  }
}

/**
 * Dimensionamento de Pilar Curto Retangular (Compressão Centrada / Excentricidade Mínima)
 */
export function dimensionarPilar(params: {
  bCm: number
  hCm: number
  comprimentoLivreM: number
  fckMpa: number
  caa: 'I' | 'II' | 'III' | 'IV'
  nkKn: number
  bitolaLongitudinalMm: number
}): DimensionResult {
  const { bCm, hCm, comprimentoLivreM, fckMpa, caa, nkKn, bitolaLongitudinalMm } = params
  const diagnosticos: DiagnosticItem[] = []

  const cNomCm = getCobrimentoNominalCm(caa, 'pilar')
  const fcd = fckMpa / 1.4
  const fyd = 500 / 1.15
  const fydKnc2 = fyd / 10
  const fcdKnc2 = fcd / 10

  const ac = bCm * hCm // área da seção em cm²
  const menorLado = Math.min(bCm, hCm)
  const le = comprimentoLivreM * 100 // cm
  const lambda = (le * Math.sqrt(12)) / menorLado // esbeltez para pilar retangular

  // 1. Esbeltez e Classificação
  let esbeltezStatus: 'OK' | 'ATENCAO' | 'REPROVADO' = 'OK'
  let esbeltezMsg = 'Pilar curto (efeitos de 2ª ordem locais desprezíveis).'

  if (lambda > 90) {
    esbeltezStatus = 'REPROVADO'
    esbeltezMsg = `Esbeltez crítica (λ = ${lambda.toFixed(1)} > 90). O sistema não dimensiona acima de 90 (NBR 6118). Aumente as dimensões.`
  } else if (lambda >= 35) {
    esbeltezStatus = 'ATENCAO'
    esbeltezMsg = `Pilar esbelto (35 ≤ λ ≤ 90). Efeitos de 2ª ordem calculados pelo método do pilar-padrão.`
  }

  diagnosticos.push({
    criterio: 'Esbeltez estrutural',
    status: esbeltezStatus,
    valorCalculado: `λ = ${lambda.toFixed(1)}`,
    valorLimite: 'λ ≤ 90',
    referenciaNormativa: 'Art. 15.8 / 18.3',
    mensagem: esbeltezMsg
  })

  // 2. Determinação das Excentricidades e 2ª Ordem
  const nd = 1.4 * nkKn // normal de cálculo (kN)
  
  // Excentricidade acidental (imperfeição geométrica local)
  const ea = le / 400
  // Excentricidade mínima (Art. 18.3.3)
  const e1Min = Math.max(2.0, 1.5 + 0.03 * menorLado)
  // Excentricidade de 1ª ordem de cálculo
  const e1 = Math.max(ea, e1Min)

  // Altura útil d (direção crítica de flambagem)
  const bitolaEstriboMm = Math.max(5.0, Math.ceil(bitolaLongitudinalMm / 4))
  const dPrime = cNomCm + (bitolaEstriboMm / 10) + (bitolaLongitudinalMm / 20)
  const dCm = menorLado - dPrime

  // Excentricidade de 2ª ordem pelo método da curvatura aproximada (Art. 15.8.2)
  let e2 = 0
  if (lambda >= 35 && lambda <= 90) {
    const nu = nd / (ac * fcdKnc2) // normal adimensional
    const curvatura = 0.005 / (dCm * (nu + 0.5))
    const curvaturaLim = 0.005 / dCm
    const curvaturaFinal = Math.min(curvatura, curvaturaLim)
    e2 = (le * le / 10) * curvaturaFinal
  }

  const eTot = e1 + e2
  const mSdTotKnm = (nd * eTot) / 100 // momento fletor total em kNm

  // 3. Dimensionamento à Flexo-Compressão Composta (Equilíbrio de Pequena Excentricidade)
  // Capacidade resistente do concreto
  const nRc = 0.85 * fcdKnc2 * ac // kN

  // Parcela da armadura para compressão centrada
  const asComp = Math.max(0, (nd - nRc) / fydKnc2)
  // Parcela da armadura para momento fletor total (binário de forças simétrico)
  const asFlex = (nd * eTot) / (fydKnc2 * (menorLado - 2 * dPrime))
  const asNec = asComp + asFlex

  // Taxa de armadura mínima (Art. 18.4)
  const asMin = Math.max(0.15 * nd / fydKnc2, 0.004 * ac)
  const asFinal = Math.max(asNec, asMin)

  // Verificação de taxa máxima (8% em traspasse)
  const asMax = 0.08 * ac
  let resistenciaStatus: 'OK' | 'ATENCAO' | 'REPROVADO' = 'OK'
  let resistenciaMsg = esbeltezStatus === 'REPROVADO'
    ? 'Cálculo inviabilizado pela esbeltez excessiva.'
    : 'Seção de concreto e armadura adequadas para flexo-compressão.'

  if (esbeltezStatus === 'REPROVADO') {
    resistenciaStatus = 'REPROVADO'
  } else if (asFinal > asMax) {
    resistenciaStatus = 'REPROVADO'
    resistenciaMsg = 'Armadura necessária excede o limite máximo normativo de 8%. Aumente a seção do pilar.'
  }

  diagnosticos.push({
    criterio: 'Resistência à flexo-compressão (ELU)',
    status: resistenciaStatus,
    valorCalculado: resistenciaStatus === 'REPROVADO' && esbeltezStatus === 'REPROVADO' ? 'Inviável' : `${asFinal.toFixed(2)} cm²`,
    valorLimite: `Mín: ${asMin.toFixed(2)} cm²`,
    referenciaNormativa: 'Art. 18.4',
    mensagem: resistenciaMsg
  })

  // Sugestão de bitolas longitudinais (mínimo de 4 barras em pilares retangulares)
  const areaBarra = (Math.PI * Math.pow(bitolaLongitudinalMm / 10, 2)) / 4
  const numBarras = resistenciaStatus === 'REPROVADO' ? 0 : Math.max(4, Math.ceil(asFinal / areaBarra))

  // Estribos do pilar (conforme Art. 18.4.3)
  const espaçamentoEstribo = Math.min(20, menorLado, Math.floor(12 * (bitolaLongitudinalMm / 10)))

  // Status Geral do Semáforo
  let overallStatus: 'OK' | 'ATENCAO' | 'REPROVADO' = 'OK'
  if (diagnosticos.some(d => d.status === 'REPROVADO')) {
    overallStatus = 'REPROVADO'
  } else if (diagnosticos.some(d => d.status === 'ATENCAO')) {
    overallStatus = 'ATENCAO'
  }

  const volumeConcretoM3 = (ac / 10000) * comprimentoLivreM
  const pesoAcoKg = numBarras * areaBarra * 100 * 0.00785 * comprimentoLivreM

  return {
    status: overallStatus,
    diagnosticos,
    armaduraSugerida: {
      longitudinal: {
        bitolaMm: bitolaLongitudinalMm,
        quantidade: numBarras,
        areaCalculadaCm2: asFinal
      },
      transversal: {
        bitolaMm: bitolaEstriboMm,
        espaçamentoCm: espaçamentoEstribo
      }
    },
    detalhesTecnicos: {
      cobrimentoNominalCm: cNomCm,
      taxaArmadura: (asFinal / ac * 100),
      volumeConcretoM3,
      pesoAcoKg,
      areaFormaM2: (2 * bCm + 2 * hCm) / 100 * comprimentoLivreM,
      esforcos: {
        lambda,
        e1Cm: e1,
        e2Cm: e2,
        eTotCm: eTot,
        mSdTotKnm
      }
    }
  }
}

/**
 * Dimensionamento de Laje Maciça Retangular (M Método Marcus e flexão simplificada)
 */
export function dimensionarLaje(params: {
  lxM: number
  lyM: number
  hCm: number
  fckMpa: number
  caa: 'I' | 'II' | 'III' | 'IV'
  cargaRevestimentoKnm2: number
  cargaVariavelKnm2: number
}): DimensionResult {
  const { lxM, lyM, hCm, fckMpa, caa, cargaRevestimentoKnm2, cargaVariavelKnm2 } = params
  const diagnosticos: DiagnosticItem[] = []

  const cNomCm = getCobrimentoNominalCm(caa, 'laje')
  const fcd = fckMpa / 1.4
  const fyd = 500 / 1.15
  const fydKnc2 = fyd / 10

  // 1. Verificação de altura mínima (Conforto visual/vão útil - NBR 6118)
  const lMenor = Math.min(lxM, lyM)
  const hMin = (lMenor * 100) / 30 // L/30
  let alturaStatus: 'OK' | 'ATENCAO' | 'REPROVADO' = 'OK'
  if (hCm < hMin) {
    alturaStatus = 'ATENCAO'
  }

  diagnosticos.push({
    criterio: 'Espessura mínima',
    status: alturaStatus,
    valorCalculado: `${hCm} cm`,
    valorLimite: `Mín: ${Math.ceil(hMin)} cm`,
    referenciaNormativa: 'Art. 13.2.4',
    mensagem: hCm >= hMin ? 'Espessura adequada da laje.' : 'Espessura abaixo da recomendação de flecha simplificada. Risco de deformação visível.'
  })

  // 2. Cargas
  const pesoProprio = (hCm / 100) * 25 // kN/m²
  const cargaTotalServico = pesoProprio + cargaRevestimentoKnm2 + cargaVariavelKnm2
  const cargaTotalCalculo = 1.4 * cargaTotalServico // kN/m²

  // 3. Método Marcus (Momentos Fletores)
  const lambda = lyM / lxM // ly >= lx
  let betaX = 0.048 // coeficiente médio para Marcus
  let betaY = 0.024
  
  if (lambda >= 2.0) {
    // Laje armada em 1 direção (comportamento de viga de 1m de largura)
    betaX = 0.125 // q * L^2 / 8
    betaY = 0
  } else {
    // Ajuste linear simplificado dos coeficientes de Marcus baseados na relação de vãos
    betaX = 0.04 + (lambda - 1) * 0.04
    betaY = 0.04 - (lambda - 1) * 0.02
  }

  const mxKnm = betaX * cargaTotalCalculo * Math.pow(lxM, 2)
  const myKnm = betaY * cargaTotalCalculo * Math.pow(lxM, 2)

  // Dimensionamento à flexão de 1m de largura de laje (b = 100 cm)
  const dCm = hCm - cNomCm - 0.5 // d útil estimado para barras de 10mm
  const md = mxKnm * 100 // kN.cm / m

  const A = 0.272 * 100 * fcdMpaToKnc2(fckMpa)
  const B = -0.68 * 100 * fcdMpaToKnc2(fckMpa) * dCm
  const C = md

  const delta = B * B - 4 * A * C
  let asNec = 0
  let flexaoStatus: 'OK' | 'ATENCAO' | 'REPROVADO' = 'OK'
  
  if (delta < 0 || dCm <= 0) {
    flexaoStatus = 'REPROVADO'
  } else {
    const x = (-B - Math.sqrt(delta)) / (2 * A)
    asNec = md / (fydKnc2 * (dCm - 0.4 * x))
  }

  const asMin = 0.0015 * 100 * hCm // 0.15% da seção transversal
  const asFinal = Math.max(asNec, asMin)

  diagnosticos.push({
    criterio: 'Resistência à flexão (ELU)',
    status: flexaoStatus,
    valorCalculado: flexaoStatus === 'REPROVADO' ? 'Inviável' : `${asFinal.toFixed(2)} cm²/m`,
    valorLimite: `Mín: ${asMin.toFixed(2)} cm²/m`,
    referenciaNormativa: 'Art. 19.3',
    mensagem: flexaoStatus === 'OK' ? 'Armadura calculada atende às cargas de projeto.' : 'Espessura de laje insuficiente para resistir ao momento.'
  })

  // Sugestão de bitola e espaçamento para malha de aço da laje
  const bitolaLajeMm = 8.0
  const areaLajeBar = (Math.PI * Math.pow(bitolaLajeMm / 10, 2)) / 4
  const espaçamentoLaje = Math.min(20, Math.floor((areaLajeBar * 100) / asFinal))

  let overallStatus: 'OK' | 'ATENCAO' | 'REPROVADO' = 'OK'
  if (diagnosticos.some(d => d.status === 'REPROVADO')) {
    overallStatus = 'REPROVADO'
  } else if (diagnosticos.some(d => d.status === 'ATENCAO')) {
    overallStatus = 'ATENCAO'
  }

  const volumeConcretoM3 = lxM * lyM * (hCm / 100)
  const pesoAcoKg = asFinal * 100 * 0.00785 * lxM * lyM // Estimativa de peso total de aço

  return {
    status: overallStatus,
    diagnosticos,
    armaduraSugerida: {
      flexao: {
        bitolaMm: bitolaLajeMm,
        espaçamentoCm: espaçamentoLaje,
        areaCalculadaCm2M: asFinal
      }
    },
    detalhesTecnicos: {
      cobrimentoNominalCm: cNomCm,
      cargaTotalServicoKnm2: cargaTotalServico,
      volumeConcretoM3,
      pesoAcoKg,
      areaFormaM2: lxM * lyM
    }
  }
}

/**
 * Dimensionamento de Sapata Isolada Rígida
 */
export function dimensionarSapata(params: {
  fckMpa: number
  caa: 'I' | 'II' | 'III' | 'IV'
  nkKn: number
  sigmaSoloMpa: number // Tensão admissível do solo em MPa (SPT)
  aPilarCm: number // dimensões do pilar de arranque
  bPilarCm: number
  mkAKnm?: number // Momento em kN.m na direção A
  mkBKnm?: number // Momento em kN.m na direção B
}): DimensionResult {
  const { fckMpa, caa, nkKn, sigmaSoloMpa, aPilarCm, bPilarCm, mkAKnm = 0, mkBKnm = 0 } = params
  const diagnosticos: DiagnosticItem[] = []

  const cNomCm = getCobrimentoNominalCm(caa, 'sapata')
  const fyd = 500 / 1.15
  const fydKnc2 = fyd / 10

  // Converter tensão do solo de MPa para kN/cm² (1 MPa = 1000 kN/m² = 0.1 kN/cm²)
  const sigmaSoloKnc2 = sigmaSoloMpa * 0.1

  // 1. Dimensionamento em Planta
  // Adiciona 10% para peso próprio da sapata
  const nEstKn = 1.1 * nkKn
  let areaPlantaCm2 = nEstKn / sigmaSoloKnc2

  // Mantendo balanços iguais nas duas direções: aSap - bSap = aPilar - bPilar
  const diffPilar = (aPilarCm - bPilarCm)
  const deltaEquaçao = diffPilar * diffPilar + 4 * areaPlantaCm2
  let aSap = Math.ceil(((diffPilar + Math.sqrt(deltaEquaçao)) / 2) / 5) * 5
  let bSap = aSap - diffPilar

  // Iteração para garantir que a tensão máxima atenda a capacidade do solo e limitar descolamento
  let atendido = false
  let iteracao = 0
  let sigmaMax = 0
  let sigmaMin = 0

  while (!atendido && iteracao < 20) {
    iteracao++
    const A = aSap
    const B = bSap
    const area = A * B

    // W = B * A^2 / 6 (direção A)
    const Wa = (B * Math.pow(A, 2)) / 6
    // W = A * B^2 / 6 (direção B)
    const Wb = (A * Math.pow(B, 2)) / 6

    // Momentos em kN.cm
    const mkA_cm = mkAKnm * 100
    const mkB_cm = mkBKnm * 100

    sigmaMax = (nEstKn / area) + (mkA_cm / Wa) + (mkB_cm / Wb)
    sigmaMin = (nEstKn / area) - (mkA_cm / Wa) - (mkB_cm / Wb)

    // Se a tensão máxima e o descolamento parcial estiverem aceitáveis
    if (sigmaMax <= sigmaSoloKnc2 && sigmaMin >= -0.2 * sigmaMax) {
      atendido = true
    } else {
      aSap += 5
      bSap = aSap - diffPilar
    }
  }

  const statusTensao = sigmaMax <= sigmaSoloKnc2 ? 'OK' : 'REPROVADO'
  const msgTensao = statusTensao === 'OK'
    ? `Tensão máxima no solo (${(sigmaMax * 10).toFixed(2)} kgf/cm²) atende a tensão admissível (${(sigmaSoloKnc2 * 10).toFixed(2)} kgf/cm²).`
    : `Tensão máxima no solo (${(sigmaMax * 10).toFixed(2)} kgf/cm²) excede a admissível (${(sigmaSoloKnc2 * 10).toFixed(2)} kgf/cm²).`

  diagnosticos.push({
    criterio: 'Tensão máxima no solo',
    status: statusTensao,
    valorCalculado: `${(sigmaMax).toFixed(3)} kN/cm²`,
    valorLimite: `${sigmaSoloKnc2.toFixed(3)} kN/cm²`,
    referenciaNormativa: 'NBR 6122',
    mensagem: msgTensao
  })

  // Verificação de descolamento de base
  let statusDescolamento: 'OK' | 'ATENCAO' | 'REPROVADO' = 'OK'
  let msgDescolamento = 'Sem descolamento de base (toda a sapata está comprimida).'

  if (sigmaMin < 0) {
    const eA = mkAKnm / (nkKn || 1)
    const eB = mkBKnm / (nkKn || 1)
    
    if (eA > aSap / 600 || eB > bSap / 600) {
      statusDescolamento = 'ATENCAO'
      msgDescolamento = `Descolamento de base detectado fora do núcleo central.`
    } else {
      statusDescolamento = 'OK'
      msgDescolamento = `Descolamento leve detectado (${(sigmaMin * 10).toFixed(2)} kgf/cm²), aceitável dentro do núcleo central.`
    }
  }

  diagnosticos.push({
    criterio: 'Descolamento da base da sapata',
    status: statusDescolamento,
    valorCalculado: sigmaMin >= 0 ? '0.00%' : `${Math.abs(sigmaMin / (sigmaMax - sigmaMin) * 100).toFixed(1)}% de descolamento`,
    valorLimite: 'Evitar tração no solo',
    referenciaNormativa: 'NBR 6122 Art. 7.4',
    mensagem: msgDescolamento
  })

  // 2. Altura da Sapata Rígida (Bielas a 45 graus)
  const dCm = Math.max((aSap - aPilarCm) / 4, (bSap - bPilarCm) / 4)
  const hSap = Math.ceil((dCm + cNomCm + 1.0) / 5) * 5

  diagnosticos.push({
    criterio: 'Condição de sapata rígida',
    status: 'OK',
    valorCalculado: `${hSap} cm`,
    valorLimite: `Mín: ${Math.ceil(dCm + cNomCm + 1.0)} cm`,
    referenciaNormativa: 'Art. 22.5.1',
    mensagem: 'Altura de sapata suficiente para garantir comportamento rígido.'
  })

  // 3. Armaduras de Flexão nas duas direções
  const balançoA = (aSap - aPilarCm) / 2
  const balançoB = (bSap - bPilarCm) / 2

  const pressaoCalculoMax = 1.4 * sigmaMax // kN/cm²
  
  const momentoA = (pressaoCalculoMax * bSap * Math.pow(balançoA, 2)) / 2
  const momentoB = (pressaoCalculoMax * aSap * Math.pow(balançoB, 2)) / 2

  const asMinA = 0.0015 * bSap * dCm
  const asMinB = 0.0015 * aSap * dCm

  const asA = Math.max(asMinA, momentoA / (fydKnc2 * 0.9 * dCm))
  const asB = Math.max(asMinB, momentoB / (fydKnc2 * 0.9 * dCm))

  const bitolaSapMm = 10.0
  const areaSapBar = (Math.PI * Math.pow(bitolaSapMm / 10, 2)) / 4
  const numBarrasA = Math.ceil(asA / areaSapBar)
  const numBarrasB = Math.ceil(asB / areaSapBar)

  const volumeConcretoM3 = (aSap / 100) * (bSap / 100) * (hSap / 100)
  const pesoAcoKg = (numBarrasA * (aSap / 100) + numBarrasB * (bSap / 100)) * areaSapBar * 100 * 0.00785

  let sapStatus: 'OK' | 'ATENCAO' | 'REPROVADO' = 'OK'
  if (diagnosticos.some(d => d.status === 'REPROVADO')) sapStatus = 'REPROVADO'
  else if (diagnosticos.some(d => d.status === 'ATENCAO')) sapStatus = 'ATENCAO'

  return {
    status: sapStatus,
    diagnosticos,
    armaduraSugerida: {
      direcaoA: {
        bitolaMm: bitolaSapMm,
        quantidade: numBarrasA,
        areaCalculadaCm2: asA
      },
      direcaoB: {
        bitolaMm: bitolaSapMm,
        quantidade: numBarrasB,
        areaCalculadaCm2: asB
      }
    },
    detalhesTecnicos: {
      cobrimentoNominalCm: cNomCm,
      dimensaoACm: aSap,
      dimensaoBCm: bSap,
      esforcos: {
        nkKn,
        mkAKnm,
        mkBKnm,
        sigmaMaxKnc2: sigmaMax,
        sigmaMinKnc2: sigmaMin
      },
      volumeConcretoM3,
      pesoAcoKg,
      areaFormaM2: (2 * aSap * hSap + 2 * bSap * hSap) / 10000
    }
  }
}

/**
 * Dimensionamento de Viga Contínua de 2 Vãos (P0 - MVP)
 */
export function dimensionarVigaContinua(params: {
  bCm: number
  hCm: number
  L1M: number
  L2M: number
  fckMpa: number
  caa: 'I' | 'II' | 'III' | 'IV'
  q1Knm: number
  q2Knm: number
  deltaRed: number // Coeficiente de redistribuição (ex: 0.90)
  bitolaLongitudinalMm: number
  bitolaEstriboMm: number
}): DimensionResult {
  const { bCm, hCm, L1M, L2M, fckMpa, caa, q1Knm, q2Knm, deltaRed, bitolaLongitudinalMm, bitolaEstriboMm } = params
  const diagnosticos: DiagnosticItem[] = []

  // 1. Durabilidade e Coeficientes
  const cNomCm = getCobrimentoNominalCm(caa, 'viga')
  const fcd = fckMpa / 1.4
  const fyd = 500 / 1.15
  const fydKnc2 = fyd / 10
  const fcdKnc2 = fcd / 10
  const dCm = hCm - cNomCm - (bitolaEstriboMm / 10) - (bitolaLongitudinalMm / 20)

  diagnosticos.push({
    criterio: 'Cobrimento nominal',
    status: 'OK',
    valorCalculado: `${cNomCm * 10} mm`,
    valorLimite: `${cNomCm * 10} mm`,
    referenciaNormativa: 'Art. 7.2',
    mensagem: `Cobrimento adequado para CAA ${caa}.`
  })

  // 2. Equação dos Três Momentos (Apoio Central B)
  // M_B = - (q1 * L1^3 + q2 * L2^3) / (8 * (L1 + L2))
  const MB = - (q1Knm * Math.pow(L1M, 3) + q2Knm * Math.pow(L2M, 3)) / (8 * (L1M + L2M))
  
  // Coeficiente de redistribuição deltaRed (Cap. 14 da NBR 6118)
  const MB_red = deltaRed * MB

  // 3. Reações de Apoio e Equilíbrio (Esforços de Serviço)
  const RA = (q1Knm * L1M) / 2 + MB_red / L1M
  const RC = (q2Knm * L2M) / 2 + MB_red / L2M
  const RB = (q1Knm * L1M + q2Knm * L2M) - RA - RC

  // Esforços Cortantes de Cálculo nas Faces (ELU)
  const VSd_A = 1.4 * RA
  const VSd_B_esq = 1.4 * (q1Knm * L1M - RA)
  const VSd_B_dir = 1.4 * (q2Knm * L2M - RC)
  const VSd_C = 1.4 * RC
  const VSd_max = Math.max(Math.abs(VSd_A), Math.abs(VSd_B_esq), Math.abs(VSd_B_dir), Math.abs(VSd_C))

  // Momentos de Cálculo nas Seções Críticas (ELU)
  const MSd_negB = 1.4 * Math.abs(MB_red)

  // Vão 1 (Momento Positivo Máximo)
  const x_max1 = RA / q1Knm
  const MSd_pos1 = (x_max1 > 0 && x_max1 < L1M) ? (1.4 * Math.pow(RA, 2)) / (2 * q1Knm) : 0

  // Vão 2 (Momento Positivo Máximo)
  const x_max2 = RC / q2Knm
  const MSd_pos2 = (x_max2 > 0 && x_max2 < L2M) ? (1.4 * Math.pow(RC, 2)) / (2 * q2Knm) : 0

  // 4. Flexão Simples (Equação de 2º Grau para Linha Neutra)
  const dimensionarSecao = (mdKnm: number) => {
    if (mdKnm <= 0) {
      return { asNec: 0, status: 'OK' as const, msg: 'Sem momento fletor relevante.' }
    }
    const mdKncm = mdKnm * 100
    const A_coef = 0.272 * bCm * fcdKnc2
    const B_coef = -0.68 * bCm * fcdKnc2 * dCm
    const C_coef = mdKncm

    const delta = B_coef * B_coef - 4 * A_coef * C_coef
    if (delta < 0 || dCm <= 0) {
      return { asNec: 0, status: 'REPROVADO' as const, msg: 'Seção subdimensionada. Aumente a viga.' }
    }

    const x = (-B_coef - Math.sqrt(delta)) / (2 * A_coef)
    const betaX = x / dCm

    if (betaX > 0.45) {
      return { asNec: 0, status: 'REPROVADO' as const, msg: `Linha neutra (x/d = ${betaX.toFixed(2)}) > 0.45.` }
    } else if (betaX > 0.35) {
      return { asNec: mdKncm / (fydKnc2 * (dCm - 0.4 * x)), status: 'ATENCAO' as const, msg: `Linha neutra (x/d = ${betaX.toFixed(2)}) elevada.` }
    }

    return { asNec: mdKncm / (fydKnc2 * (dCm - 0.4 * x)), status: 'OK' as const, msg: 'Seção adequada.' }
  }

  // Taxa mínima de armadura longitudinal
  let rhoMin = 0.0015
  if (fckMpa > 30) {
    rhoMin = 0.0015 + (fckMpa - 30) * 0.00008
  }
  const asMin = rhoMin * bCm * hCm

  // Seção 1: Vão 1 (Inferior)
  const resVao1 = dimensionarSecao(MSd_pos1)
  const asVao1 = MSd_pos1 > 0 ? Math.max(resVao1.asNec, asMin) : asMin

  // Seção 2: Apoio B (Superior)
  const resApoio = dimensionarSecao(MSd_negB)
  const asApoio = Math.max(resApoio.asNec, asMin)

  // Seção 3: Vão 2 (Inferior)
  const resVao2 = dimensionarSecao(MSd_pos2)
  const asVao2 = MSd_pos2 > 0 ? Math.max(resVao2.asNec, asMin) : asMin

  const areaBarra = (Math.PI * Math.pow(bitolaLongitudinalMm / 10, 2)) / 4
  const barrasVao1 = Math.ceil(asVao1 / areaBarra)
  const barrasApoio = Math.ceil(asApoio / areaBarra)
  const barrasVao2 = Math.ceil(asVao2 / areaBarra)

  let flexaoStatus: 'OK' | 'ATENCAO' | 'REPROVADO' = 'OK'
  if (resVao1.status === 'REPROVADO' || resApoio.status === 'REPROVADO' || resVao2.status === 'REPROVADO') {
    flexaoStatus = 'REPROVADO'
  } else if (resVao1.status === 'ATENCAO' || resApoio.status === 'ATENCAO' || resVao2.status === 'ATENCAO') {
    flexaoStatus = 'ATENCAO'
  }

  diagnosticos.push({
    criterio: 'Resistência à flexão (ELU)',
    status: flexaoStatus,
    valorCalculado: `Vão1: ${asVao1.toFixed(2)} cm² | Apoio: ${asApoio.toFixed(2)} cm² | Vão2: ${asVao2.toFixed(2)} cm²`,
    valorLimite: `Mín: ${asMin.toFixed(2)} cm²`,
    referenciaNormativa: 'Art. 17.2',
    mensagem: flexaoStatus === 'REPROVADO' ? 'Seção com armadura excessiva ou ruptura. Aumente as dimensões da viga.' : 'Dimensionamento à flexão concluído com sucesso.'
  })

  // 5. Cisalhamento (ELU)
  const vrd2 = 0.27 * (1 - fckMpa / 250) * fcdKnc2 * bCm * dCm
  let cisStatus: 'OK' | 'ATENCAO' | 'REPROVADO' = 'OK'
  let cisMsg = 'Seção de concreto resistente à compressão diagonal.'

  if (VSd_max > vrd2) {
    cisStatus = 'REPROVADO'
    cisMsg = 'Esmagamento da biela de compressão. Aumente a largura da viga.'
  }

  const fctkInf = 0.21 * Math.pow(fckMpa, 2 / 3)
  const fctd = fctkInf / 1.4
  const vc0 = 0.6 * (fctd / 10) * bCm * dCm

  const vsw = Math.max(0, VSd_max - vc0)
  const aswOverS = vsw / (fydKnc2 * dCm)

  const fctm = 0.3 * Math.pow(fckMpa, 2 / 3)
  const rhoSwMin = 0.2 * (fctm / 500)
  const aswOverSMin = rhoSwMin * bCm
  const aswOverSFinal = Math.max(aswOverS, aswOverSMin)

  const areaEstribo = 2 * (Math.PI * Math.pow(bitolaEstriboMm / 10, 2)) / 4
  const espaçamentoEstribo = Math.min(30, Math.floor(areaEstribo / aswOverSFinal))
  const sMax = VSd_max <= 0.67 * vrd2 ? Math.min(30, 0.6 * dCm) : Math.min(20, 0.3 * dCm)
  const espaçamentoFinal = Math.min(espaçamentoEstribo, sMax)

  diagnosticos.push({
    criterio: 'Resistência ao cisalhamento (ELU)',
    status: cisStatus,
    valorCalculado: cisStatus === 'REPROVADO' ? 'Esmagamento' : `Estribos de c/${espaçamentoFinal} cm`,
    valorLimite: `Máx: c/${Math.floor(sMax)} cm`,
    referenciaNormativa: 'Art. 17.4',
    mensagem: cisMsg
  })

  // 6. ELS - Flechas por Vão (Método simplificado de Branson adaptado)
  const Ec = 4760 * Math.sqrt(fckMpa)
  const EcKnc2 = Ec / 10
  const Ic = (bCm * Math.pow(hCm, 3)) / 12
  const yt = hCm / 2
  const mcr = (1.2 * fctm / 10 * Ic) / yt

  const ma1 = (MSd_pos1 / 1.4) * 100
  let Ieq1 = Ic
  if (ma1 > mcr) {
    const maRatio = Math.pow(mcr / ma1, 3)
    const Ifiss = 0.3 * Ic
    Ieq1 = maRatio * Ic + (1 - maRatio) * Ifiss
  }

  const ma2 = (MSd_pos2 / 1.4) * 100
  let Ieq2 = Ic
  if (ma2 > mcr) {
    const maRatio = Math.pow(mcr / ma2, 3)
    const Ifiss = 0.3 * Ic
    Ieq2 = maRatio * Ic + (1 - maRatio) * Ifiss
  }

  const q1_cm = q1Knm / 100
  const L1_cm = L1M * 100
  const MB_red_cm = Math.abs(MB_red) * 100
  const flechaImediata1 = Math.max(0, (5 * q1_cm * Math.pow(L1_cm, 4)) / (384 * EcKnc2 * Ieq1) - (MB_red_cm * Math.pow(L1_cm, 2)) / (16 * EcKnc2 * Ieq1))
  const flechaLonga1 = flechaImediata1 * 3

  const q2_cm = q2Knm / 100
  const L2_cm = L2M * 100
  const flechaImediata2 = Math.max(0, (5 * q2_cm * Math.pow(L2_cm, 4)) / (384 * EcKnc2 * Ieq2) - (MB_red_cm * Math.pow(L2_cm, 2)) / (16 * EcKnc2 * Ieq2))
  const flechaLonga2 = flechaImediata2 * 3

  const limite1 = L1_cm / 250
  const limite2 = L2_cm / 250

  const flechaStatus = (flechaLonga1 <= limite1 && flechaLonga2 <= limite2) ? 'OK' : 'REPROVADO'

  diagnosticos.push({
    criterio: 'Deformação excessiva (ELS)',
    status: flechaStatus,
    valorCalculado: `Vão 1: ${flechaLonga1.toFixed(2)} cm | Vão 2: ${flechaLonga2.toFixed(2)} cm`,
    valorLimite: `Vão 1: ${limite1.toFixed(2)} cm | Vão 2: ${limite2.toFixed(2)} cm`,
    referenciaNormativa: 'Tabela 13.3',
    mensagem: flechaStatus === 'OK' ? 'Flechas dentro dos limites normativos.' : 'Flecha excessiva em pelo menos um dos vãos. Aumente a altura (h).'
  })

  // Status Geral
  let overallStatus: 'OK' | 'ATENCAO' | 'REPROVADO' = 'OK'
  if (diagnosticos.some(d => d.status === 'REPROVADO')) {
    overallStatus = 'REPROVADO'
  } else if (diagnosticos.some(d => d.status === 'ATENCAO')) {
    overallStatus = 'ATENCAO'
  }

  const volumeConcretoM3 = (bCm / 100) * (hCm / 100) * (L1M + L2M)
  const pesoAcoKg = (asVao1 * L1M + asVao2 * L2M + asApoio * ((L1M + L2M) / 4)) * 100 * 0.00785

  return {
    status: overallStatus,
    diagnosticos,
    armaduraSugerida: {
      longitudinalVao1: {
        bitolaMm: bitolaLongitudinalMm,
        quantidade: barrasVao1,
        areaCalculadaCm2: asVao1
      },
      longitudinalApoio: {
        bitolaMm: bitolaLongitudinalMm,
        quantidade: barrasApoio,
        areaCalculadaCm2: asApoio
      },
      longitudinalVao2: {
        bitolaMm: bitolaLongitudinalMm,
        quantidade: barrasVao2,
        areaCalculadaCm2: asVao2
      },
      transversal: {
        bitolaMm: bitolaEstriboMm,
        espaçamentoCm: espaçamentoFinal
      }
    },
    detalhesTecnicos: {
      cobrimentoNominalCm: cNomCm,
      alturaUtilCm: dCm,
      esforcos: {
        MB: MB_red,
        RA,
        RB,
        RC,
        MSd_pos1,
        MSd_pos2,
        MSd_negB,
        VSd_max
      },
      flechas: {
        vao1: { imediata: flechaImediata1, diferida: flechaLonga1, limite: limite1 },
        vao2: { imediata: flechaImediata2, diferida: flechaLonga2, limite: limite2 }
      },
      volumeConcretoM3,
      pesoAcoKg,
      areaFormaM2: (bCm + 2 * hCm) / 100 * (L1M + L2M)
    }
  }
}

/**
 * Dimensionamento de Viga Baldrame (Viga biapoiada em contato contínuo com o solo)
 */
export function dimensionarVigaBaldrame(params: {
  bCm: number
  hCm: number
  comprimentoVaoM: number
  fckMpa: number
  caa: 'I' | 'II' | 'III' | 'IV'
  cargaParedeKnm: number
  bitolaLongitudinalMm: number
  bitolaEstriboMm: number
  presencaConcretoMagro: boolean
}): DimensionResult {
  const {
    bCm, hCm, comprimentoVaoM, fckMpa, caa, cargaParedeKnm,
    bitolaLongitudinalMm, bitolaEstriboMm, presencaConcretoMagro
  } = params
  const diagnosticos: DiagnosticItem[] = []

  // 1. Durabilidade e Cobrimento Nominal Específico (NBR 6118 Art. 7.2.6)
  const cNomCm = presencaConcretoMagro
    ? Math.max(3.0, getCobrimentoNominalCm(caa, 'viga'))
    : 5.0 // vala direta sem lastro exige cobrimento rígido de 5.0 cm (50 mm)

  const fcd = fckMpa / 1.4
  const fyd = 500 / 1.15
  const fydKnc2 = fyd / 10
  const fcdKnc2 = fcd / 10

  const dCm = hCm - cNomCm - (bitolaEstriboMm / 10) - (bitolaLongitudinalMm / 20)

  diagnosticos.push({
    criterio: 'Cobrimento em fundações',
    status: 'OK',
    valorCalculado: `${cNomCm * 10} mm`,
    valorLimite: presencaConcretoMagro ? '≥ 30 mm (com lastro)' : '≥ 50 mm (sem lastro)',
    referenciaNormativa: 'Art. 7.2.6',
    mensagem: presencaConcretoMagro
      ? `Cobrimento adequado para viga baldrame com lastro de regularização.`
      : `Cobrimento forçado para 50 mm devido à ausência de lastro de concreto magro.`
  })

  // 2. Cargas e Análise de Esforços
  const pesoProprioKnm = (bCm / 100) * (hCm / 100) * 25 // Concreto armado = 25 kN/m³
  const qKnm = pesoProprioKnm + cargaParedeKnm

  // Esforços críticos na fase de execução (viga suspensa biapoiada)
  const mkPosKnm = (qKnm * Math.pow(comprimentoVaoM, 2)) / 8
  const vkMaxKn = (qKnm * comprimentoVaoM) / 2

  const mdKnm = 1.4 * mkPosKnm
  const vdKn = 1.4 * vkMaxKn

  // 3. Dimensionamento à Flexão Longitudinal (ELU)
  let rhoMin = 0.0015
  if (fckMpa > 30) {
    rhoMin = 0.0015 + (fckMpa - 30) * 0.00008
  }
  const asMin = rhoMin * bCm * hCm

  // Flexão Positiva (Inferior)
  const mdKncm = mdKnm * 100
  const A_eq = 0.272 * bCm * fcdKnc2
  const B_eq = -0.68 * bCm * fcdKnc2 * dCm
  const C_eq = mdKncm

  let asPosFinal = asMin
  let flexStatus: 'OK' | 'ATENCAO' | 'REPROVADO' = 'OK'
  let flexMsg = 'Seção de concreto e armadura inferior adequadas para flexão.'

  const delta = B_eq * B_eq - 4 * A_eq * C_eq
  if (delta < 0 || dCm <= 0) {
    flexStatus = 'REPROVADO'
    flexMsg = 'Seção subdimensionada. Ruptura por esmagamento do concreto. Aumente a seção.'
    asPosFinal = 0
  } else {
    const xCm = (-B_eq - Math.sqrt(delta)) / (2 * A_eq)
    const betaX = xCm / dCm
    if (betaX > 0.45) {
      flexStatus = 'REPROVADO'
      flexMsg = `Linha neutra (x/d = ${betaX.toFixed(2)}) excede o limite de ductilidade (0.45).`
      asPosFinal = 0
    } else {
      if (betaX > 0.35) {
        flexStatus = 'ATENCAO'
        flexMsg = `Linha neutra (x/d = ${betaX.toFixed(2)}) elevada.`
      }
      const asPosNec = mdKncm / (fydKnc2 * (dCm - 0.4 * xCm))
      asPosFinal = Math.max(asPosNec, asMin)
    }
  }

  // Armadura superior (negativa) de combate a recalques diferenciais (mínimo 50% da inferior)
  const asNegFinal = flexStatus === 'REPROVADO' ? 0 : Math.max(0.5 * asPosFinal, asMin)

  diagnosticos.push({
    criterio: 'Resistência à flexão inferior (ELU)',
    status: flexStatus,
    valorCalculado: flexStatus === 'REPROVADO' ? 'Inviável' : `${asPosFinal.toFixed(2)} cm²`,
    valorLimite: `Mín: ${asMin.toFixed(2)} cm²`,
    referenciaNormativa: 'Art. 17.2',
    mensagem: flexMsg
  })

  diagnosticos.push({
    criterio: 'Resistência à flexão superior de recalque',
    status: flexStatus,
    valorCalculado: flexStatus === 'REPROVADO' ? 'Inviável' : `${asNegFinal.toFixed(2)} cm²`,
    valorLimite: `Mín: ${asMin.toFixed(2)} cm²`,
    referenciaNormativa: 'Proteção contra recalques',
    mensagem: 'Armadura superior de proteção dimensionada para cobrir inversões de momentos e recalques de blocos.'
  })

  // Barras sugeridas
  const areaBarra = (Math.PI * Math.pow(bitolaLongitudinalMm / 10, 2)) / 4
  const numBarrasInferior = flexStatus === 'REPROVADO' ? 0 : Math.max(2, Math.ceil(asPosFinal / areaBarra))
  const numBarrasSuperior = flexStatus === 'REPROVADO' ? 0 : Math.max(2, Math.ceil(asNegFinal / areaBarra))

  // 4. Dimensionamento ao Cisalhamento (Estribos)
  const vrd2 = 0.27 * (1 - fckMpa / 250) * fcdKnc2 * bCm * dCm
  let cisStatus: 'OK' | 'ATENCAO' | 'REPROVADO' = 'OK'
  let cisMsg = 'Seção de concreto resistente à compressão diagonal.'

  if (vdKn > vrd2) {
    cisStatus = 'REPROVADO'
    cisMsg = 'Esmagamento da biela de compressão. Aumente a largura da viga ou a classe do concreto.'
  }

  const fctkInf = 0.21 * Math.pow(fckMpa, 2 / 3)
  const fctd = fctkInf / 1.4
  const vc0 = 0.6 * (fctd / 10) * bCm * dCm

  const vsw = Math.max(0, vdKn - vc0)
  const aswOverS = vsw / (fydKnc2 * dCm)

  const fctm = 0.3 * Math.pow(fckMpa, 2 / 3)
  const rhoSwMin = 0.2 * (fctm / 500)
  const aswOverSMin = rhoSwMin * bCm
  const aswOverSFinal = Math.max(aswOverS, aswOverSMin)

  const areaEstribo = 2 * (Math.PI * Math.pow(bitolaEstriboMm / 10, 2)) / 4
  const espaçamentoEstribo = Math.min(30, Math.floor(areaEstribo / aswOverSFinal))
  const sMax = vdKn <= 0.67 * vrd2 ? Math.min(30, 0.6 * dCm) : Math.min(20, 0.3 * dCm)
  const espaçamentoFinal = Math.min(espaçamentoEstribo, sMax)

  diagnosticos.push({
    criterio: 'Resistência ao cisalhamento (ELU)',
    status: cisStatus,
    valorCalculado: cisStatus === 'REPROVADO' ? 'Esmagamento' : `Estribos de c/${espaçamentoFinal} cm`,
    valorLimite: `Máx: c/${Math.floor(sMax)} cm`,
    referenciaNormativa: 'Art. 17.4',
    mensagem: cisMsg
  })

  // 5. Flechas ELS (Branson)
  const Ec = 4760 * Math.sqrt(fckMpa)
  const EcKnc2 = Ec / 10
  const Ic = (bCm * Math.pow(hCm, 3)) / 12
  const yt = hCm / 2
  const mcr = (1.2 * (fctm / 10) * Ic) / yt
  const ma = mkPosKnm * 100 // kN.cm

  let Ieq = Ic
  if (ma > mcr) {
    const maRatio = Math.pow(mcr / ma, 3)
    Ieq = maRatio * Ic + (1 - maRatio) * (0.3 * Ic)
  }

  const q_cm = qKnm / 100
  const L_cm = comprimentoVaoM * 100
  const flechaImediata = (5 * q_cm * Math.pow(L_cm, 4)) / (384 * EcKnc2 * Ieq)
  const flechaLonga = flechaImediata * 3.0 // Fluência e longa duração
  const flechaLim = L_cm / 250

  const statusFlecha = flechaLonga <= flechaLim ? 'OK' : 'REPROVADO'

  diagnosticos.push({
    criterio: 'Deformação excessiva (ELS)',
    status: statusFlecha,
    valorCalculado: `${flechaLonga.toFixed(2)} cm`,
    valorLimite: `${flechaLim.toFixed(2)} cm (L/250)`,
    referenciaNormativa: 'Tabela 13.3',
    mensagem: statusFlecha === 'OK'
      ? 'Deformação imediata e diferida dentro dos limites.'
      : 'Flecha excessiva! Aumente a altura da viga baldrame.'
  })

  // Status Geral do Semáforo
  let overallStatus: 'OK' | 'ATENCAO' | 'REPROVADO' = 'OK'
  if (diagnosticos.some(d => d.status === 'REPROVADO')) {
    overallStatus = 'REPROVADO'
  } else if (diagnosticos.some(d => d.status === 'ATENCAO')) {
    overallStatus = 'ATENCAO'
  }

  const volumeConcretoM3 = (bCm / 100) * (hCm / 100) * comprimentoVaoM
  const pesoAcoKg = (asPosFinal + asNegFinal) * 100 * 0.00785 * comprimentoVaoM * 1.15

  return {
    status: overallStatus,
    diagnosticos,
    armaduraSugerida: {
      longitudinal: {
        bitolaMm: bitolaLongitudinalMm,
        quantidade: numBarrasInferior,
        areaCalculadaCm2: asPosFinal
      },
      longitudinalSuperior: {
        bitolaMm: bitolaLongitudinalMm,
        quantidade: numBarrasSuperior,
        areaCalculadaCm2: asNegFinal
      },
      transversal: {
        bitolaMm: bitolaEstriboMm,
        espaçamentoCm: espaçamentoFinal
      }
    },
    detalhesTecnicos: {
      cobrimentoNominalCm: cNomCm,
      alturaUtilCm: dCm,
      esforcos: {
        pesoProprioKnm,
        qTotalKnm: qKnm,
        mSdKnm: mdKnm,
        vSdKn: vdKn
      },
      volumeConcretoM3,
      pesoAcoKg,
      areaFormaM2: (bCm + 2 * hCm) / 100 * comprimentoVaoM
    }
  }
}

// ── Funções de ajuda internas ───────────────────────────────────

function fcdMpaToKnc2(fckMpa: number): number {
  return (fckMpa / 1.4) / 10 // converte MPa para kN/cm²
}
