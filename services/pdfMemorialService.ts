import jsPDF from 'jspdf'
import type { OpuraStructuralProject, OpuraStructuralDimensionElement } from '../types/structural'
import type { DimensionResult } from '../utils/structuralMath'

/**
 * Gera o memorial de cálculo profissional em PDF usando a biblioteca jsPDF instalada no frontend.
 */
export function generateMemorialPDF(
  project: OpuraStructuralProject,
  element: OpuraStructuralDimensionElement,
  geometria: Record<string, any>,
  cargas: Record<string, any>,
  result: DimensionResult
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  // Cores da Identidade ÒPURA
  const primaryColor = [15, 23, 42] // Slate 900
  const secondaryColor = [37, 99, 235] // Blue 600
  const lightBg = [248, 250, 252] // Slate 50

  // Margens e dimensões
  const marginX = 20
  let currentY = 25
  const pageHeight = doc.internal.pageSize.getHeight()

  const checkPageBreak = (neededHeight: number) => {
    if (currentY + neededHeight > pageHeight - 20) {
      doc.addPage()
      currentY = 25
      drawFooter()
    }
  }

  const drawFooter = () => {
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(
      'ÒPURA — Software de Dimensionamento Estrutural NBR 6118:2023 — Confidencial',
      marginX,
      pageHeight - 10
    )
    doc.text(`Página ${doc.internal.pages.length - 1}`, doc.internal.pageSize.getWidth() - marginX - 10, pageHeight - 10)
  }

  // Desenha primeiro rodapé
  drawFooter()

  // ─── 1. CABEÇALHO / CAPA DO RELATÓRIO ───
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2])
  doc.rect(marginX, currentY, 170, 2, 'F')
  currentY += 8

  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
  doc.text('MEMORIAL DE CÁLCULO ESTRUTURAL', marginX, currentY)
  currentY += 6

  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text('ÒPURA Estruturas de Concreto · NBR 6118:2023 · v1.0', marginX, currentY)
  currentY += 12

  // Ficha do Projeto
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2])
  doc.rect(marginX, currentY, 170, 42, 'F')
  
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
  
  doc.text('DADOS DO PROJETO E RT', marginX + 5, currentY + 7)
  
  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Obra: ${project.nome}`, marginX + 5, currentY + 14)
  doc.text(`Responsável Técnico: ${project.responsavel_tecnico}`, marginX + 5, currentY + 20)
  doc.text(`ART Associada: ${project.numero_art || 'Pendente de assinatura'}`, marginX + 5, currentY + 26)
  doc.text(`Classe de Agressividade: CAA ${project.caa} (Durabilidade NBR)`, marginX + 5, currentY + 32)
  doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')} (Revisão R${String(project.revisao_atual).padStart(2, '0')})`, marginX + 5, currentY + 38)
  
  currentY += 50

  // ─── 2. DETALHES DO ELEMENTO ESTRUTURAL ───
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2])
  doc.text(`Elemento Verificado: ${element.tag} (${element.tipo})`, marginX, currentY)
  currentY += 6

  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(80, 80, 80)
  doc.text(`Pavimento: ${element.pavimento} | Status: ${result.status === 'OK' ? 'APROVADO' : 'REPROVADO'}`, marginX, currentY)
  currentY += 10

  // Tabela de Geometria e Esforços
  doc.setFillColor(230, 235, 245)
  doc.rect(marginX, currentY, 170, 6, 'F')
  doc.setFont('Helvetica', 'bold')
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
  doc.text('Parâmetros de Entrada Geométricos & Cargas', marginX + 3, currentY + 4.5)
  currentY += 6

  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(50, 50, 50)
  
  const drawRow = (label1: string, val1: string, label2: string, val2: string) => {
    doc.rect(marginX, currentY, 170, 7)
    doc.text(label1, marginX + 3, currentY + 5)
    doc.setFont('Helvetica', 'bold')
    doc.text(val1, marginX + 45, currentY + 5)
    doc.setFont('Helvetica', 'normal')
    doc.text(label2, marginX + 90, currentY + 5)
    doc.setFont('Helvetica', 'bold')
    doc.text(val2, marginX + 130, currentY + 5)
    doc.setFont('Helvetica', 'normal')
    currentY += 7
  }

  // Geometria e cargas Dinâmicas por tipo
  if (element.tipo === 'VIGA') {
    const isContinua = Number(geometria.isContinua ?? 0) === 1
    if (isContinua) {
      drawRow('Largura b_viga:', `${geometria.bCm ?? 15} cm`, 'Altura h_viga:', `${geometria.hCm ?? 40} cm`)
      drawRow('Vão L1 / L2:', `${geometria.L1M ?? 4.0} m / ${geometria.L2M ?? 4.0} m`, 'Classe Concreto fck:', `C${geometria.fckMpa ?? 25}`)
      drawRow('Carga q1 / q2:', `${cargas.q1Knm ?? 15} / ${cargas.q2Knm ?? 15} kN/m`, 'Redistribuição (δ):', `${geometria.deltaRed ?? 0.90}`)
    } else {
      drawRow('Largura b_viga:', `${geometria.bCm ?? 15} cm`, 'Altura h_viga:', `${geometria.hCm ?? 40} cm`)
      drawRow('Vão livre L_vao:', `${geometria.comprimentoVaoM ?? 4} m`, 'Classe Concreto fck:', `C${geometria.fckMpa ?? 25}`)
      drawRow('Momento fletor Mk:', `${cargas.mkKnm ?? 0} kN.m`, 'Esforço cortante Vk:', `${cargas.vkKn ?? 0} kN`)
    }
  } else if (element.tipo === 'PILAR') {
    drawRow('Largura b_pilar:', `${geometria.bCm ?? 20} cm`, 'Largura h_pilar:', `${geometria.hCm ?? 20} cm`)
    drawRow('Comprimento livre L:', `${geometria.comprimentoLivreM ?? 2.8} m`, 'Classe Concreto fck:', `C${geometria.fckMpa ?? 25}`)
    drawRow('Força Normal Nk:', `${cargas.nkKn ?? 0} kN`, 'Esbeltez cálculo (λ):', `${result.detalhesTecnicos.taxaArmadura ? 'Curto' : 'N/D'}`)
  } else if (element.tipo === 'LAJE') {
    drawRow('Vão Menor Lx:', `${geometria.lxM ?? 3.5} m`, 'Vão Maior Ly:', `${geometria.lyM ?? 4.0} m`)
    drawRow('Espessura h_laje:', `${geometria.hCm ?? 10} cm`, 'Classe Concreto fck:', `C${geometria.fckMpa ?? 25}`)
    drawRow('Revestimento:', `${cargas.cargaRevestimentoKnm2 ?? 0} kN/m²`, 'Sobrecarga NBR 6120:', `${cargas.cargaVariavelKnm2 ?? 0} kN/m²`)
  } else if (element.tipo === 'SAPATA') {
    drawRow('Dimensão Pilar a x b:', `${geometria.aPilarCm ?? 20} x ${geometria.bPilarCm ?? 20} cm`, 'Concreto fck:', `C${geometria.fckMpa ?? 25}`)
    drawRow('Força Normal Nk:', `${cargas.nkKn ?? 0} kN`, 'Pressão Adm Solo:', `${cargas.sigmaSoloMpa ?? 0.2} MPa`)
  }

  currentY += 10
  checkPageBreak(80)

  // ─── 3. VERIFICAÇÕES NORMATIVAS DETALHADAS ───
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2])
  doc.text('Verificações Normativas Realizadas', marginX, currentY)
  currentY += 6

  // Listagem de diagnósticos
  result.diagnosticos.forEach((diag) => {
    checkPageBreak(25)

    doc.setFillColor(lightBg[0], lightBg[1], lightBg[2])
    doc.rect(marginX, currentY, 170, 18, 'F')
    
    // Status visual
    if (diag.status === 'OK') {
      doc.setFillColor(16, 185, 129) // Emerald 500
    } else if (diag.status === 'ATENCAO') {
      doc.setFillColor(245, 158, 11) // Amber 500
    } else {
      doc.setFillColor(239, 68, 68) // Rose 500
    }
    doc.rect(marginX, currentY, 4, 18, 'F')

    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.text(`${diag.criterio} [${diag.referenciaNormativa}]`, marginX + 8, currentY + 5)

    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(100, 100, 100)
    doc.text(diag.mensagem, marginX + 8, currentY + 10)

    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(`Valor: ${diag.valorCalculado} | Limite: ${diag.valorLimite}`, marginX + 8, currentY + 14)

    // Badge de status no canto direito
    doc.setFontSize(9)
    doc.setTextColor(
      diag.status === 'OK' ? 16 : diag.status === 'ATENCAO' ? 245 : 239,
      diag.status === 'OK' ? 185 : diag.status === 'ATENCAO' ? 158 : 68,
      diag.status === 'OK' ? 129 : diag.status === 'ATENCAO' ? 158 : 68
    )
    doc.text(diag.status, marginX + 145, currentY + 10, { align: 'right' })

    currentY += 21
  })

  // ─── 4. ARMADURAS RECOMENDADAS E QUANTITATIVOS ───
  checkPageBreak(50)
  currentY += 5

  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2])
  doc.rect(marginX, currentY, 170, 0.5, 'F')
  currentY += 6

  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2])
  doc.text('Armadura Recomendada e Quantitativos Adotados', marginX, currentY)
  currentY += 8

  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(50, 50, 50)

  // Descreve armadura sugerida baseada no tipo
  let armaduraTexto = ''
  const isContinua = element.tipo === 'VIGA' && Number(geometria.isContinua ?? 0) === 1

  if (element.tipo === 'VIGA') {
    if (isContinua) {
      const v1 = result.armaduraSugerida.longitudinalVao1
      const ap = result.armaduraSugerida.longitudinalApoio
      const v2 = result.armaduraSugerida.longitudinalVao2
      const trans = result.armaduraSugerida.transversal
      armaduraTexto = `Armadura Longitudinal Sugerida:\n  Vão L1 (Inferior): ${v1.quantidade} barras Ø${v1.bitolaMm} mm (As = ${v1.areaCalculadaCm2.toFixed(2)} cm²)\n  Apoio Intermediário B (Superior): ${ap.quantidade} barras Ø${ap.bitolaMm} mm (As = ${ap.areaCalculadaCm2.toFixed(2)} cm²)\n  Vão L2 (Inferior): ${v2.quantidade} barras Ø${v2.bitolaMm} mm (As = ${v2.areaCalculadaCm2.toFixed(2)} cm²)\nTransversal: Estribos Ø${trans.bitolaMm} mm espaçados a cada c/${trans.espaçamentoCm} cm.`
    } else {
      const long = result.armaduraSugerida.longitudinal
      const trans = result.armaduraSugerida.transversal
      armaduraTexto = `Adotar armadura longitudinal de ${long.quantidade} barras Ø${long.bitolaMm} mm (As = ${long.areaCalculadaCm2.toFixed(2)} cm²).\nTransversal: Estribos Ø${trans.bitolaMm} mm espaçados a cada c/${trans.espaçamentoCm} cm.`
    }
  } else if (element.tipo === 'PILAR') {
    const long = result.armaduraSugerida.longitudinal
    const trans = result.armaduraSugerida.transversal
    armaduraTexto = `Adotar armadura de compressão longitudinal com ${long.quantidade} barras Ø${long.bitolaMm} mm (As = ${long.areaCalculadaCm2.toFixed(2)} cm²).\nTransversal: Estribos de travamento Ø${trans.bitolaMm} mm espaçados a cada c/${trans.espaçamentoCm} cm.`
  } else if (element.tipo === 'LAJE') {
    const flex = result.armaduraSugerida.flexao
    armaduraTexto = `Adotar malha de aço Ø${flex.bitolaMm} mm espaçada a cada c/${flex.espaçamentoCm} cm (As = ${flex.areaCalculadaCm2M.toFixed(2)} cm²/m nas duas direções).`
  } else if (element.tipo === 'SAPATA') {
    const dirA = result.armaduraSugerida.direcaoA
    const dirB = result.armaduraSugerida.direcaoB
    armaduraTexto = `Armadura de Flexão inferior em grelha:\nDireção A: ${dirA.quantidade} barras Ø${dirA.bitolaMm} mm | Direção B: ${dirB.quantidade} barras Ø${dirB.bitolaMm} mm.`
  }

  // Desenha caixa de armadura
  const caixaHeight = isContinua ? 32 : 20
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2])
  doc.rect(marginX, currentY, 170, caixaHeight, 'F')
  doc.setFont('Helvetica', 'bold')
  doc.text(armaduraTexto, marginX + 5, currentY + 6)
  
  currentY += (caixaHeight + 6)

  // Quantitativos finais
  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Volume estimado de concreto: ${result.detalhesTecnicos.volumeConcretoM3?.toFixed(3)} m³`, marginX, currentY)
  doc.text(`Área de fôrma estimada: ${result.detalhesTecnicos.areaFormaM2?.toFixed(2)} m²`, marginX, currentY + 6)
  doc.text(`Massa de aço CA-50 estimada: ${result.detalhesTecnicos.pesoAcoKg?.toFixed(1)} kg`, marginX, currentY + 12)

  // Salva o PDF no browser
  const filename = `Memorial_${element.tag}_Revisao_R${String(project.revisao_atual).padStart(2, '0')}.pdf`
  doc.save(filename)
}

/**
 * Gera o caderno de memoriais unificado (PDF) contendo a capa do projeto, índice geral e
 * a listagem de todos os elementos cadastrados no projeto.
 */
export function generateConsolidatedMemorialPDF(
  project: OpuraStructuralProject,
  elements: OpuraStructuralDimensionElement[]
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const primaryColor = [15, 23, 42] // Slate 900
  const secondaryColor = [37, 99, 235] // Blue 600
  const lightBg = [248, 250, 252] // Slate 50
  const marginX = 20
  const pageHeight = doc.internal.pageSize.getHeight()
  
  let currentPageNum = 1

  const drawFooter = (pageNum: number) => {
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(
      'ÒPURA — Caderno de Memoriais Técnicos Consolidados — NBR 6118:2023',
      marginX,
      pageHeight - 10
    )
    doc.text(`Página ${pageNum}`, doc.internal.pageSize.getWidth() - marginX - 10, pageHeight - 10)
  }

  // ─── PÁGINA 1: CAPA ───
  drawFooter(currentPageNum)

  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2])
  doc.rect(marginX, 35, 170, 4, 'F')

  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(24)
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
  doc.text('CADERNO DE MEMORIAIS', marginX, 55)
  doc.text('DE CÁLCULO ESTRUTURAL', marginX, 65)

  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(100, 100, 100)
  doc.text('ÒPURA Estruturas de Concreto · NBR 6118:2023 · v1.0', marginX, 75)

  // Ficha do Projeto na Capa
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2])
  doc.rect(marginX, 95, 170, 60, 'F')
  
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
  doc.text('DADOS GERAIS DO PROJETO', marginX + 8, 105)
  
  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Obra / Projeto: ${project.nome}`, marginX + 8, 114)
  doc.text(`Responsável Técnico: ${project.responsavel_tecnico}`, marginX + 8, 122)
  doc.text(`Registro ART: ${project.numero_art || 'Pendente de assinatura'}`, marginX + 8, 130)
  doc.text(`Classe de Agressividade Ambiental: CAA ${project.caa}`, marginX + 8, 138)
  doc.text(`Revisão do Projeto: R${String(project.revisao_atual).padStart(2, '0')}`, marginX + 8, 146)

  // Resumo de Elementos
  doc.setFontSize(9)
  doc.text(`Total de elementos dimensionados: ${elements.length} elementos`, marginX, 175)
  doc.text(`Elementos calculados com sucesso: ${elements.filter(e => e.resultado_calculo != null).length}`, marginX, 182)
  doc.text(`Data de Geração do Caderno: ${new Date().toLocaleDateString('pt-BR')}`, marginX, 189)

  // Assinatura do RT
  doc.line(marginX + 45, 245, marginX + 125, 245)
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(project.responsavel_tecnico.toUpperCase(), marginX + 85, 250, { align: 'center' })
  doc.setFont('Helvetica', 'normal')
  doc.text('Engenheiro Responsável Técnico', marginX + 85, 255, { align: 'center' })

  // ─── PÁGINA 2: ÍNDICE / SUMÁRIO ───
  doc.addPage()
  currentPageNum++
  drawFooter(currentPageNum)

  let indexY = 30
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
  doc.text('ÍNDICE DO CADERNO DE CÁLCULO', marginX, indexY)
  indexY += 12

  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(120, 120, 120)
  doc.text('Tag', marginX, indexY)
  doc.text('Tipo', marginX + 25, indexY)
  doc.text('Pavimento', marginX + 60, indexY)
  doc.text('Status NBR', marginX + 110, indexY)
  doc.text('Pág.', marginX + 155, indexY)
  
  indexY += 4
  doc.line(marginX, indexY, marginX + 170, indexY)
  indexY += 6

  const sorted = [...elements].sort((a, b) => {
    const pavComp = a.pavimento.localeCompare(b.pavimento)
    if (pavComp !== 0) return pavComp
    return a.tag.localeCompare(b.tag)
  })

  let elStartPage = 3

  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(50, 50, 50)

  for (const el of sorted) {
    if (indexY > pageHeight - 25) {
      doc.addPage()
      currentPageNum++
      drawFooter(currentPageNum)
      indexY = 30
    }

    doc.text(el.tag, marginX, indexY)
    doc.text(el.tipo.replace('_', ' '), marginX + 25, indexY)
    doc.text(el.pavimento, marginX + 60, indexY)
    
    const res = el.resultado_calculo as DimensionResult | null
    const statusText = res ? (res.status === 'OK' ? 'APROVADO' : 'ATENÇÃO/REPROVADO') : 'SEM CÁLCULO'
    
    doc.setFont('Helvetica', 'bold')
    if (statusText === 'APROVADO') {
      doc.setTextColor(16, 185, 129)
    } else if (statusText === 'SEM CÁLCULO') {
      doc.setTextColor(150, 150, 150)
    } else {
      doc.setTextColor(239, 68, 68)
    }
    doc.text(statusText, marginX + 110, indexY)
    
    doc.setTextColor(50, 50, 50)
    doc.setFont('Helvetica', 'normal')
    doc.text(String(elStartPage), marginX + 158, indexY)
    
    indexY += 8
    elStartPage++
  }

  // ─── DETALHAMENTO DE CADA ELEMENTO (1 por página) ───
  for (const el of sorted) {
    doc.addPage()
    currentPageNum++
    drawFooter(currentPageNum)

    let currentY = 25

    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.rect(marginX, currentY, 170, 1.5, 'F')
    currentY += 8

    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.text(`${el.tag} — Memorial Técnico`, marginX, currentY)
    currentY += 6

    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text(`Pavimento: ${el.pavimento} | Tipo de Elemento: ${el.tipo.replace('_', ' ')}`, marginX, currentY)
    currentY += 12

    const result = el.resultado_calculo as DimensionResult | null
    if (!result) {
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2])
      doc.rect(marginX, currentY, 170, 60, 'F')
      doc.setFont('Helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(239, 68, 68)
      doc.text('ELEMENTO PENDENTE DE CÁLCULO', marginX + 15, currentY + 25)
      doc.setFont('Helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(100, 100, 100)
      doc.text('Este elemento estrutural foi cadastrado na obra, mas ainda não teve o dimensionamento', marginX + 15, currentY + 34)
      doc.text('executado e gravado pelo motor matemático da NBR 6118.', marginX + 15, currentY + 40)
      continue
    }

    doc.setFillColor(230, 235, 245)
    doc.rect(marginX, currentY, 170, 6, 'F')
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.text('Parâmetros de Entrada Geométricos & Cargas', marginX + 3, currentY + 4.5)
    currentY += 6

    doc.setFont('Helvetica', 'normal')
    doc.setTextColor(50, 50, 50)

    const drawRow = (label1: string, val1: string, label2: string, val2: string) => {
      doc.rect(marginX, currentY, 170, 7)
      doc.text(label1, marginX + 3, currentY + 5)
      doc.setFont('Helvetica', 'bold')
      doc.text(val1, marginX + 45, currentY + 5)
      doc.setFont('Helvetica', 'normal')
      doc.text(label2, marginX + 90, currentY + 5)
      doc.setFont('Helvetica', 'bold')
      doc.text(val2, marginX + 130, currentY + 5)
      doc.setFont('Helvetica', 'normal')
      currentY += 7
    }

    const geometria = el.geometria
    const cargas = el.cargas

    if (el.tipo === 'VIGA') {
      const isContinua = Number(geometria.isContinua ?? 0) === 1
      if (isContinua) {
        drawRow('Largura b_viga:', `${geometria.bCm ?? 15} cm`, 'Altura h_viga:', `${geometria.hCm ?? 40} cm`)
        drawRow('Vão L1 / L2:', `${geometria.L1M ?? 4.0} m / ${geometria.L2M ?? 4.0} m`, 'Classe Concreto:', `C${geometria.fckMpa ?? 25}`)
        drawRow('Carga q1 / q2:', `${cargas.q1Knm ?? 15} / ${cargas.q2Knm ?? 15} kN/m`, 'Redistribuição (δ):', `${geometria.deltaRed ?? 0.90}`)
      } else {
        drawRow('Largura b_viga:', `${geometria.bCm ?? 15} cm`, 'Altura h_viga:', `${geometria.hCm ?? 40} cm`)
        drawRow('Vão livre L_vao:', `${geometria.comprimentoVaoM ?? 4} m`, 'Classe Concreto:', `C${geometria.fckMpa ?? 25}`)
        drawRow('Momento fletor Mk:', `${cargas.mkKnm ?? 0} kN.m`, 'Esforço cortante Vk:', `${cargas.vkKn ?? 0} kN`)
      }
    } else if (el.tipo === 'PILAR') {
      drawRow('Largura b_pilar:', `${geometria.bCm ?? 20} cm`, 'Largura h_pilar:', `${geometria.hCm ?? 20} cm`)
      drawRow('Comprimento livre L:', `${geometria.comprimentoLivreM ?? 2.8} m`, 'Classe Concreto:', `C${geometria.fckMpa ?? 25}`)
      drawRow('Força Normal Nk:', `${cargas.nkKn ?? 0} kN`, 'Esbeltez cálculo (λ):', `${result.detalhesTecnicos.esforcos?.lambda ? result.detalhesTecnicos.esforcos.lambda.toFixed(1) : 'N/D'}`)
    } else if (el.tipo === 'LAJE') {
      if (geometria.tipoLaje === 'trelicada') {
        drawRow('Altura Treliça h_tr:', `${geometria.htrCm ?? 12} cm`, 'Espessura Capa h_c:', `${geometria.hcCm ?? 5} cm`)
        drawRow('Vão Unidirecional Lx:', `${geometria.lxM ?? 3.5} m`, 'Enchimento / Catálogo:', `${geometria.tipoEnchimento ?? 'EPS'} / ${geometria.trelicaAdotada ?? 'TR12645'}`)
        drawRow('Larguras b_w / b_e:', `${geometria.bwCm ?? 12} / ${geometria.beCm ?? 30} cm`, 'Sobrecarga NBR 6120:', `${cargas.cargaVariavelKnm2 ?? 0} kN/m²`)
      } else {
        drawRow('Vão Menor Lx:', `${geometria.lxM ?? 3.5} m`, 'Vão Maior Ly:', `${geometria.lyM ?? 4.0} m`)
        drawRow('Espessura h_laje:', `${geometria.hCm ?? 10} cm`, 'Classe Concreto:', `C${geometria.fckMpa ?? 25}`)
        drawRow('Revestimento:', `${cargas.cargaRevestimentoKnm2 ?? 0} kN/m²`, 'Sobrecarga NBR 6120:', `${cargas.cargaVariavelKnm2 ?? 0} kN/m²`)
      }
    } else if (el.tipo === 'SAPATA') {
      drawRow('Dimensão Pilar a x b:', `${geometria.aPilarCm ?? 20} x ${geometria.bPilarCm ?? 20} cm`, 'Concreto:', `C${geometria.fckMpa ?? 25}`)
      drawRow('Força Normal Nk:', `${cargas.nkKn ?? 0} kN`, 'Pressão Solo Solo:', `${cargas.sigmaSoloMpa ?? 0.2} MPa`)
    } else if (el.tipo === 'VIGA_BALDRAME') {
      drawRow('Largura b_baldrame:', `${geometria.bCm ?? 15} cm`, 'Altura h_baldrame:', `${geometria.hCm ?? 40} cm`)
      drawRow('Comprimento L_vao:', `${geometria.comprimentoVaoM ?? 3} m`, 'Classe Concreto:', `C${geometria.fckMpa ?? 25}`)
      drawRow('Carga Alvenaria:', `${cargas.cargaParedeKnm ?? 0} kN/m`, 'Lastro Concreto Magro:', `${geometria.presencaConcretoMagro ? 'Sim (5cm)' : 'Não'}`)
    }

    currentY += 10

    // Verificações Normativas Simplificadas
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2])
    doc.text('Verificações Normativas Realizadas', marginX, currentY)
    currentY += 6

    result.diagnosticos.forEach((diag) => {
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2])
      doc.rect(marginX, currentY, 170, 11, 'F')
      
      doc.setFillColor(
        diag.status === 'OK' ? 16 : diag.status === 'ATENCAO' ? 245 : 239,
        diag.status === 'OK' ? 185 : diag.status === 'ATENCAO' ? 158 : 68,
        diag.status === 'OK' ? 129 : diag.status === 'ATENCAO' ? 158 : 68
      )
      doc.rect(marginX, currentY, 3, 11, 'F')

      doc.setFont('Helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
      doc.text(`${diag.criterio} [${diag.referenciaNormativa}]`, marginX + 6, currentY + 4)

      doc.setFont('Helvetica', 'normal')
      doc.text(`Calculado: ${diag.valorCalculado} | Limite: ${diag.valorLimite} | Status: ${diag.status}`, marginX + 6, currentY + 8)

      currentY += 13
    })

    currentY += 5

    // Armadura Recomendada
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.rect(marginX, currentY, 170, 0.5, 'F')
    currentY += 6

    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2])
    doc.text('Armadura Recomendada e Quantitativos Adotados', marginX, currentY)
    currentY += 6

    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(50, 50, 50)

    let armaduraTexto = ''
    const isContinua = el.tipo === 'VIGA' && Number(geometria.isContinua ?? 0) === 1

    if (el.tipo === 'VIGA') {
      if (isContinua) {
        const v1 = result.armaduraSugerida.longitudinalVao1
        const ap = result.armaduraSugerida.longitudinalApoio
        const v2 = result.armaduraSugerida.longitudinalVao2
        const trans = result.armaduraSugerida.transversal
        armaduraTexto = `Armadura Longitudinal Sugerida:\n  Vão L1 (Inferior): ${v1.amount || v1.quantidade} barras Ø${v1.bitolaMm} mm | Apoio Central: ${ap.amount || ap.quantidade} barras Ø${ap.bitolaMm} mm | Vão L2: ${v2.amount || v2.quantidade} barras Ø${v2.bitolaMm} mm\n  Transversal: Estribos Ø${trans.bitolaMm} mm espaçados a cada c/${trans.espaçamentoCm} cm.`
      } else {
        const long = result.armaduraSugerida.longitudinal
        const trans = result.armaduraSugerida.transversal
        armaduraTexto = `Adotar armadura longitudinal de ${long.quantidade} barras Ø${long.bitolaMm} mm (As = ${long.areaCalculadaCm2.toFixed(2)} cm²).\nTransversal: Estribos Ø${trans.bitolaMm} mm espaçados a cada c/${trans.espaçamentoCm} cm.`
      }
    } else if (el.tipo === 'PILAR') {
      const long = result.armaduraSugerida.longitudinal
      const trans = result.armaduraSugerida.transversal
      armaduraTexto = `Adotar armadura de compressão longitudinal com ${long.quantidade} barras Ø${long.bitolaMm} mm (As = ${long.areaCalculadaCm2.toFixed(2)} cm²).\nTransversal: Estribos de travamento Ø${trans.bitolaMm} mm espaçados a cada c/${trans.espaçamentoCm} cm.`
    } else if (el.tipo === 'LAJE') {
      if (geometria.tipoLaje === 'trelicada') {
        const flex = result.armaduraSugerida.flexao
        armaduraTexto = `Treliça adotada: ${geometria.trelicaAdotada ?? 'TR12645'} (banzo inf: 2x Ø${flex.bitolaMm}mm, e=${flex.espaçamentoCm}cm).\nReforço longitudinal adicional: ${flex.quantidade > 0 ? `${flex.quantidade} barra(s) Ø${flex.bitolaReforçoMm} mm por vigota` : 'Nenhum reforço necessário'}.`
      } else {
        const flex = result.armaduraSugerida.flexao
        armaduraTexto = `Adotar malha de aço Ø${flex.bitolaMm} mm espaçada a cada c/${flex.espaçamentoCm} cm (As = ${flex.areaCalculadaCm2M.toFixed(2)} cm²/m nas duas direções).`
      }
    } else if (el.tipo === 'SAPATA') {
      const dirA = result.armaduraSugerida.direcaoA
      const dirB = result.armaduraSugerida.direcaoB
      armaduraTexto = `Armadura de Flexão inferior em grelha:\nDireção A: ${dirA.quantidade} barras Ø${dirA.bitolaMm} mm | Direção B: ${dirB.quantidade} barras Ø${dirB.bitolaMm} mm.`
    } else if (el.tipo === 'VIGA_BALDRAME') {
      const long = result.armaduraSugerida.longitudinal
      const longSup = result.armaduraSugerida.longitudinalSuperior
      const trans = result.armaduraSugerida.transversal
      armaduraTexto = `Armadura longitudinal inferior de tração: ${long.quantidade} barras Ø${long.bitolaMm} mm.\nArmadura superior contra recalques (Pele): ${longSup.quantidade} barras Ø${longSup.bitolaMm} mm.\nTransversal: Estribos Ø${trans.bitolaMm} mm espaçados a cada c/${trans.espaçamentoCm} cm.`
    }

    const caixaHeight = isContinua ? 18 : 12
    doc.setFillColor(lightBg[0], lightBg[1], lightBg[2])
    doc.rect(marginX, currentY, 170, caixaHeight, 'F')
    doc.setFont('Helvetica', 'bold')
    doc.text(armaduraTexto, marginX + 4, currentY + 5)
    
    currentY += (caixaHeight + 5)

    doc.setFont('Helvetica', 'normal')
    doc.text(`Volume estimado de concreto: ${result.detalhesTecnicos.volumeConcretoM3?.toFixed(3)} m³ | Área de fôrma estimada: ${result.detalhesTecnicos.areaFormaM2?.toFixed(2)} m² | Massa de aço CA-50: ${result.detalhesTecnicos.pesoAcoKg?.toFixed(1)} kg`, marginX, currentY)
  }

  const filename = `Caderno_Memoriais_${project.nome.replace(/\s+/g, '-')}_R${project.revisao_atual}.pdf`
  doc.save(filename)
}

