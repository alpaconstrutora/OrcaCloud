// ÒPURA Reformas — Serviço de Exportação de PDF
// Tecnologias: jsPDF, jsPDF-AutoTable
// Design: Clean Premium (Paleta Amber / Slate)

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ReformaProjeto, ReformaDiario, ReformaCronograma } from '../types';

// Cores e estilos da marca
const COLOR_AMBER = [217, 119, 6] as [number, number, number]; // #D97706
const COLOR_SLATE_DARK = [15, 23, 42] as [number, number, number]; // #0F172A
const COLOR_SLATE_TEXT = [51, 65, 85] as [number, number, number]; // #334155
const COLOR_SLATE_LIGHT = [248, 250, 252] as [number, number, number]; // #F8FAFC
const COLOR_GRAY_BORDER = [226, 232, 240] as [number, number, number]; // #E2E8F0
const COLOR_MUTED = [100, 116, 139] as [number, number, number]; // #64748B

/**
 * Adiciona rodapé corporativo padrão a todas as páginas do PDF
 */
function addFooter(doc: jsPDF, W: number, H: number) {
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Linha divisória fina
    doc.setDrawColor(...COLOR_GRAY_BORDER);
    doc.setLineWidth(0.2);
    doc.line(14, H - 15, W - 14, H - 15);

    // Identificação ÒPURA
    doc.setTextColor(...COLOR_MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('ÒPURA Reformas · Relatório Operacional de Obra', 14, H - 10);
    
    // Numeração de páginas
    doc.text(`Página ${i} de ${totalPages}`, W - 14, H - 10, { align: 'right' });
  }
}

/**
 * Renderiza textos estruturados simulando um parser de Markdown simplificado.
 * Suporta H1 (#), H3 (###), Bullets (- ou *) e parágrafos normais.
 * Garante quebra de página automática caso o cursor y estoure a altura H do PDF.
 */
function renderMarkdown(doc: jsPDF, markdown: string, startY: number, maxW: number, H: number): number {
  if (!markdown) return startY;
  const lines = markdown.split('\n');
  let y = startY;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      y += 4; // espaçamento entre blocos vazios
      continue;
    }

    // Validação preventiva de estouro de página antes de renderizar a linha
    if (y > H - 20) {
      doc.addPage();
      y = 20;
    }

    if (line.startsWith('# ')) {
      // H1 (Título principal do Diário)
      const text = line.substring(2).trim();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(...COLOR_SLATE_DARK);
      y += 6;
      doc.text(text, 14, y);
      y += 5;
    } else if (line.startsWith('### ')) {
      // H3 (Subtítulo de categoria)
      const text = line.substring(4).trim();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...COLOR_AMBER);
      y += 5;
      doc.text(text, 14, y);
      y += 4.5;
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      // Bullet lists
      const text = line.substring(2).replace(/\*\*/g, '').trim();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...COLOR_SLATE_TEXT);

      const splitText = doc.splitTextToSize(text, maxW - 6);
      
      // Renderizar primeira linha com marcador de bullet
      doc.text('•', 14, y);
      doc.text(splitText[0], 18, y);
      y += 4.5;

      // Renderizar linhas subsequentes recuadas
      for (let i = 1; i < splitText.length; i++) {
        if (y > H - 20) {
          doc.addPage();
          y = 20;
        }
        doc.text(splitText[i], 18, y);
        y += 4.5;
      }
    } else {
      // Parágrafo Comum
      const text = line.replace(/\*\*/g, '').trim();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...COLOR_SLATE_TEXT);

      const splitText = doc.splitTextToSize(text, maxW);
      for (const tLine of splitText) {
        if (y > H - 20) {
          doc.addPage();
          y = 20;
        }
        doc.text(tLine, 14, y);
        y += 4.5;
      }
    }
  }

  return y;
}

/**
 * Desenha as imagens anexadas em grade no PDF de forma segura.
 * Lida com imagens locais Base64 no array fotos_urls.
 */
function renderPhotos(doc: jsPDF, photos: string[], startY: number, maxW: number, H: number): number {
  if (!photos || photos.length === 0) return startY;
  
  let y = startY;
  const colW = (maxW - 6) / 2; // tamanho perfeito para caber duas fotos lado a lado
  const imgH = 60; // altura padrão da foto
  const spacing = 6;

  for (let i = 0; i < photos.length; i += 2) {
    // Verificar se a linha de fotos inteira cabe na folha atual
    if (y + imgH > H - 20) {
      doc.addPage();
      y = 20;
    }

    // Foto Esquerda
    try {
      doc.addImage(photos[i], 'JPEG', 14, y, colW, imgH);
    } catch (err) {
      console.warn('[reformasExportService] Erro ao renderizar imagem 1 no PDF:', err);
      // Retângulo indicador de indisponibilidade
      doc.setDrawColor(...COLOR_GRAY_BORDER);
      doc.rect(14, y, colW, imgH, 'S');
      doc.setFontSize(8);
      doc.setTextColor(...COLOR_MUTED);
      doc.text('[Foto de Canteiro Indisponível]', 14 + colW / 2, y + imgH / 2, { align: 'center' });
    }

    // Foto Direita (se houver)
    if (i + 1 < photos.length) {
      try {
        doc.addImage(photos[i + 1], 'JPEG', 14 + colW + spacing, y, colW, imgH);
      } catch (err) {
        console.warn('[reformasExportService] Erro ao renderizar imagem 2 no PDF:', err);
        doc.setDrawColor(...COLOR_GRAY_BORDER);
        doc.rect(14 + colW + spacing, y, colW, imgH, 'S');
        doc.setFontSize(8);
        doc.setTextColor(...COLOR_MUTED);
        doc.text('[Foto de Canteiro Indisponível]', 14 + colW + spacing + colW / 2, y + imgH / 2, { align: 'center' });
      }
    }

    y += imgH + spacing;
  }

  return y;
}

export const reformasExportService = {
  /**
   * Exporta o relatório de um Diário de Obra de reforma individual
   */
  async exportDiarioPdf(diario: ReformaDiario, projeto: ReformaProjeto): Promise<void> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const maxW = W - 28;

    // ── Cabeçalho Estilizado ÒPURA ───────────────────────────────────────────
    doc.setFillColor(...COLOR_AMBER);
    doc.rect(14, 15, 6, 12, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...COLOR_SLATE_DARK);
    doc.text('ÒPURA REFORMAS', 24, 20);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR_MUTED);
    doc.text('Relatório Técnico de Diário de Obra', 24, 25);

    // Metadados do Diário (Direita)
    const dataRegistroStr = new Date(diario.data_registro).toLocaleDateString('pt-BR');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...COLOR_SLATE_DARK);
    doc.text(`Data: ${dataRegistroStr}`, W - 14, 20, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(`Clima: ${diario.clima} | Temp: ${diario.temperatura}`, W - 14, 25, { align: 'right' });

    // Linha Divisória
    doc.setDrawColor(...COLOR_GRAY_BORDER);
    doc.setLineWidth(0.4);
    doc.line(14, 30, W - 14, 30);

    // ── Resumo do Projeto ────────────────────────────────────────────────────
    let y = 35;
    doc.setFillColor(...COLOR_SLATE_LIGHT);
    doc.rect(14, y, maxW, 20, 'F');
    doc.setDrawColor(...COLOR_GRAY_BORDER);
    doc.rect(14, y, maxW, 20, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_MUTED);
    doc.text('DADOS DA REFORMA ATIVA', 18, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...COLOR_SLATE_DARK);
    doc.text(`Cliente: ${projeto.nome_cliente}`, 18, y + 11);
    doc.text(`Local: ${projeto.endereco || 'Endereço não informado'}`, 18, y + 16);

    y += 26;

    // ── Resumo Escrito do Diário (Markdown) ──────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLOR_SLATE_DARK);
    doc.text('🚧 Avanço das Atividades', 14, y);
    y += 5;

    y = renderMarkdown(doc, diario.resumo_markdown, y, maxW, H);
    y += 10;

    // ── Seção de Evidências Fotográficas ─────────────────────────────────────
    if (diario.fotos_urls && diario.fotos_urls.length > 0) {
      if (y > H - 40) {
        doc.addPage();
        y = 20;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...COLOR_SLATE_DARK);
      doc.text('📸 Registro Fotográfico do Canteiro', 14, y);
      y += 6;

      y = renderPhotos(doc, diario.fotos_urls, y, maxW, H);
    }

    // ── Rodapés e Salvar ─────────────────────────────────────────────────────
    addFooter(doc, W, H);
    
    const fileName = `Diario_Obra_${projeto.nome_cliente.replace(/\s+/g, '_')}_${diario.data_registro}.pdf`;
    doc.save(fileName);
  },

  /**
   * Exporta o Relatório Consolidado da Reforma contendo:
   * Capa, checklist do Cronograma e a Linha do Tempo com todos os Diários
   */
  async exportReformaConsolidadaPdf(
    projeto: ReformaProjeto, 
    diarios: ReformaDiario[], 
    cronograma: ReformaCronograma[]
  ): Promise<void> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const maxW = W - 28;

    // ==========================================
    // ── PÁGINA 1: CAPA PREMIUM DO RELATÓRIO
    // ==========================================
    
    // Header Dark Superior
    doc.setFillColor(...COLOR_SLATE_DARK);
    doc.rect(0, 0, W, 80, 'F');

    // Destaque em Laranja Amber
    doc.setFillColor(...COLOR_AMBER);
    doc.rect(14, 25, 6, 26, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('ÒPURA REFORMAS', 24, 34);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(203, 213, 225); // slate-300
    doc.text('Relatório Consolidado de Progresso Físico e Operacional', 24, 42);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text(`Projeto: Reforma - ${projeto.nome_cliente}`, 24, 60);

    if (projeto.endereco) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text(`Endereço: ${projeto.endereco}`, 24, 66);
    }

    // Progresso e Estatísticas da Reforma
    const totalTasks = cronograma.length;
    const doneTasks = cronograma.filter(t => t.status === 'CONCLUIDO').length;
    const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
    
    let kpiY = 95;
    
    doc.setFillColor(...COLOR_SLATE_LIGHT);
    doc.rect(14, kpiY, maxW, 45, 'F');
    doc.setDrawColor(...COLOR_GRAY_BORDER);
    doc.rect(14, kpiY, maxW, 45, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLOR_SLATE_DARK);
    doc.text('RESUMO DE CONTROLE DA REFORMA', 20, kpiY + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_SLATE_TEXT);
    
    const fmtCurrency = (val: number) => 
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);

    doc.text(`Investimento Orçado: ${fmtCurrency(projeto.orcamento_total)}`, 20, kpiY + 18);
    doc.text(`Data de Início da Obra: ${new Date(projeto.data_inicio).toLocaleDateString('pt-BR')}`, 20, kpiY + 24);
    doc.text(`Status do Projeto: ${projeto.status === 'EM_ANDAMENTO' ? 'Em Andamento' : projeto.status === 'FINALIZADO' ? 'Finalizado' : 'Em Planejamento'}`, 20, kpiY + 30);
    doc.text(`Diários de Obra Registrados: ${diarios.length}`, 20, kpiY + 36);

    // Barra de Progresso Físico
    doc.setFont('helvetica', 'bold');
    doc.text(`Avanço Físico do Projeto: ${progressPct}%`, 110, kpiY + 18);

    doc.setFillColor(...COLOR_GRAY_BORDER);
    doc.rect(110, kpiY + 22, 68, 6, 'F');
    doc.setFillColor(16, 185, 129); // emerald-500
    doc.rect(110, kpiY + 22, Math.max(1, (progressPct / 100) * 68), 6, 'F');
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(`${doneTasks} de ${totalTasks} etapas do checklist concluídas`, 110, kpiY + 34);

    // Termos e assinaturas no rodapé da capa
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(`Emissão automatizada: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, H - 22);

    // ==========================================
    // ── PÁGINA 2: CRONOGRAMA DE ETAPAS
    // ==========================================
    doc.addPage();
    let y = 15;

    doc.setFillColor(...COLOR_AMBER);
    doc.rect(14, y, 6, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...COLOR_SLATE_DARK);
    doc.text('CRONOGRAMA DE ETAPAS E TAREFAS', 24, y + 7);
    y += 16;

    if (cronograma.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...COLOR_MUTED);
      doc.text('Nenhuma tarefa foi cadastrada no cronograma para esta reforma.', 14, y);
    } else {
      const headers = [['Etapa/Atividade', 'Responsável', 'Data Limite', 'Status']];
      const rows = cronograma.map(t => [
        t.tarefa,
        t.responsavel || 'Não atribuído',
        t.data_limite ? new Date(t.data_limite).toLocaleDateString('pt-BR') : 'Sem prazo',
        t.status === 'CONCLUIDO' ? 'Concluído' : t.status === 'EM_ANDAMENTO' ? 'Em Andamento' : 'Pendente'
      ]);

      autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        head: headers,
        body: rows,
        headStyles: { fillColor: COLOR_SLATE_DARK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
        bodyStyles: { fontSize: 8, textColor: COLOR_SLATE_TEXT },
        alternateRowStyles: { fillColor: COLOR_SLATE_LIGHT },
        didParseCell: (data) => {
          if (data.column.index === 3) {
            const rawVal = data.cell.raw;
            if (rawVal === 'Concluído') {
              data.cell.styles.textColor = [16, 185, 129]; // emerald-600
              data.cell.styles.fontStyle = 'bold';
            } else if (rawVal === 'Em Andamento') {
              data.cell.styles.textColor = [245, 158, 11]; // amber-500
              data.cell.styles.fontStyle = 'bold';
            }
          }
        }
      });
      y = (doc as any).lastAutoTable.finalY + 12;
    }

    // ==========================================
    // ── PÁGINA 3+: HISTÓRICO DE DIÁRIOS
    // ==========================================
    if (y > H - 40) {
      doc.addPage();
      y = 15;
    } else {
      y += 4;
    }

    doc.setFillColor(...COLOR_AMBER);
    doc.rect(14, y, 6, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...COLOR_SLATE_DARK);
    doc.text('LINHA DO TEMPO - DIÁRIOS DE OBRA', 24, y + 7);
    y += 16;

    if (diarios.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...COLOR_MUTED);
      doc.text('Nenhum relatório diário foi registrado no canteiro ainda.', 14, y);
    } else {
      // Ordenação cronológica reversa (mais recente primeiro)
      const sortedDiarios = [...diarios].sort((a, b) => b.data_registro.localeCompare(a.data_registro));

      for (let index = 0; index < sortedDiarios.length; index++) {
        const d = sortedDiarios[index];
        
        // Espaço de segurança para o início do diário (cabeçalho + clima + margem)
        if (y > H - 35) {
          doc.addPage();
          y = 15;
        }

        // Desenhar divisória entre diários anteriores
        if (index > 0) {
          doc.setDrawColor(...COLOR_GRAY_BORDER);
          doc.setLineWidth(0.3);
          doc.line(14, y, W - 14, y);
          y += 6;
        }

        // Data do Diário
        const dDate = new Date(d.data_registro).toLocaleDateString('pt-BR');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(...COLOR_SLATE_DARK);
        doc.text(`📅 Diário de Obra — ${dDate}`, 14, y);

        // Clima e Temperatura (Alinhado à direita)
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...COLOR_MUTED);
        doc.text(`Clima: ${d.clima} | Temperatura: ${d.temperatura}`, W - 14, y, { align: 'right' });
        y += 6;

        // Renderizar conteúdo textual do diário
        y = renderMarkdown(doc, d.resumo_markdown, y, maxW, H);
        y += 4;

        // Renderizar fotos do diário (se houver)
        if (d.fotos_urls && d.fotos_urls.length > 0) {
          if (y > H - 35) {
            doc.addPage();
            y = 15;
          }
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(...COLOR_AMBER);
          doc.text('Evidências fotográficas registradas no dia:', 14, y);
          y += 4.5;
          
          y = renderPhotos(doc, d.fotos_urls, y, maxW, H);
          y += 4;
        }
      }
    }

    // ── Rodapés e Salvar ─────────────────────────────────────────────────────
    addFooter(doc, W, H);
    
    const fileName = `Relatorio_Consolidado_Reforma_${projeto.nome_cliente.replace(/\s+/g, '_')}.pdf`;
    doc.save(fileName);
  }
};
