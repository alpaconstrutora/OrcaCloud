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
    drawRow('Largura b_viga:', `${geometria.bCm ?? 15} cm`, 'Altura h_viga:', `${geometria.hCm ?? 40} cm`)
    drawRow('Vão livre L_vao:', `${geometria.comprimentoVaoM ?? 4} m`, 'Classe Concreto fck:', `C${geometria.fckMpa ?? 25}`)
    drawRow('Momento fletor Mk:', `${cargas.mkKnm ?? 0} kN.m`, 'Esforço cortante Vk:', `${cargas.vkKn ?? 0} kN`)
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
  if (element.tipo === 'VIGA') {
    const long = result.armaduraSugerida.longitudinal
    const trans = result.armaduraSugerida.transversal
    armaduraTexto = `Adotar armadura longitudinal de ${long.quantidade} barras Ø${long.bitolaMm} mm (As = ${long.areaCalculadaCm2.toFixed(2)} cm²).\nTransversal: Estribos Ø${trans.bitolaMm} mm espaçados a cada c/${trans.espaçamentoCm} cm.`
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
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2])
  doc.rect(marginX, currentY, 170, 20, 'F')
  doc.setFont('Helvetica', 'bold')
  doc.text(armaduraTexto, marginX + 5, currentY + 6)
  
  currentY += 26

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
