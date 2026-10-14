// services/nbr12721ExportService.ts
//
// PDF e XLSX dos Quadros NBR 12721 de uma VERSÃO PUBLICADA (Fase 8 do plano
// docs/planos/2026-10-13-areas-nbr12721-na-planta.md) — substitui o
// `areaEngineExportService` do Motor de Áreas antigo.
//
// Lê só o que foi congelado na publicação (`blueprint_snapshot_nbr12721`):
// o documento é o que o hash cobre, nunca um recálculo do rascunho. As tabelas
// vêm de `utils/nbr12721/documento.ts` (puro, testado); aqui só se busca e se
// desenha.

import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { blueprintSheetTemplateService } from './blueprintSheetTemplateService';
import { blueprintSnapshotNbr12721Service as quadros } from './blueprintSnapshotNbr12721Service';
import {
  cabecalhoDoDocumentoNbr12721,
  celulaFormatada,
  nomeDoArquivoNbr12721,
  tabelasDoDocumentoNbr12721,
  versaoDoMemorial,
  type DocumentoNbr12721,
} from '../utils/nbr12721/documento';

function fail(context: string, message: string): never {
  throw new Error(`nbr12721Export/${context}: ${message}`);
}

export const nbr12721ExportService = {
  /** Reúne o documento da versão: quadro congelado, estudo, empresa, carimbo e aprovações com o nome de quem aprovou. */
  async documentoDaVersao(snapshotId: string): Promise<DocumentoNbr12721> {
    const { data: snap, error: e1 } = await supabase
      .from('blueprint_snapshots')
      .select('id, revision, study_id, organization_id')
      .eq('id', snapshotId)
      .maybeSingle();
    if (e1) fail('versao', e1.message);
    if (!snap) fail('versao', 'versão não encontrada');
    const s = snap as { id: string; revision: number; study_id: string; organization_id: string };

    const [quadro, saida, aprovacoes, estudo, org, templates] = await Promise.all([
      quadros.daVersao(snapshotId),
      quadros.saidaDaVersao(snapshotId),
      quadros.aprovacoes(snapshotId),
      supabase.from('blueprint_studies').select('name').eq('id', s.study_id).maybeSingle(),
      supabase.from('organizations').select('name').eq('id', s.organization_id).maybeSingle(),
      // O carimbo é o do template de pranchas da organização; sem template, o documento sai só com o nome da empresa.
      blueprintSheetTemplateService.list(s.organization_id).catch(() => []),
    ]);
    if (!quadro || !saida) fail('versao', 'esta versão não tem os Quadros NBR 12721 congelados');
    const nomes = await quadros.nomesDeQuemAprovou(aprovacoes.map((a) => a.aprovadoPor)).catch(() => new Map<string, string>());
    const carimbo = templates.find((t) => t.active)?.template.carimbo ?? templates[0]?.template.carimbo ?? null;
    const empresa = carimbo?.empresa?.trim() || (org.data as { name?: string } | null)?.name || '';

    return {
      estudo: (estudo.data as { name?: string } | null)?.name ?? 'Estudo',
      empresa,
      responsavel: carimbo?.responsavel?.trim() || null,
      registro: carimbo?.registro?.trim() || null,
      revisao: s.revision,
      hash: quadro.hash,
      versaoMotor: quadro.versaoMotor,
      congeladoEm: quadro.congeladoEm,
      aprovacoes: aprovacoes.map((a) => ({
        tipo: a.tipo,
        aprovadoEm: a.aprovadoEm,
        por: nomes.get(a.aprovadoPor) ?? a.aprovadoPor,
        hash: a.hash,
        observacao: a.observacao,
      })),
      saida,
    };
  },

  /**
   * O documento que o memorial de incorporação cita: entre as versões do estudo
   * com quadro congelado, a escolhida por `versaoDoMemorial`. `null` = o estudo
   * ainda não publicou versão com os quadros.
   */
  async documentoDoMemorial(studyId: string): Promise<DocumentoNbr12721 | null> {
    const { data, error } = await supabase.from('blueprint_snapshot_nbr12721').select('snapshot_id').eq('study_id', studyId);
    if (error) fail('memorial', error.message);
    const ids = ((data ?? []) as { snapshot_id: string }[]).map((r) => r.snapshot_id);
    if (!ids.length) return null;
    const [snaps, aprov] = await Promise.all([
      supabase.from('blueprint_snapshots').select('id, revision').in('id', ids),
      supabase.from('blueprint_snapshot_nbr12721_aprovacoes').select('snapshot_id, tipo').in('snapshot_id', ids),
    ]);
    if (snaps.error) fail('memorial', snaps.error.message);
    if (aprov.error) fail('memorial', aprov.error.message);
    const aprovacoes = (aprov.data ?? []) as { snapshot_id: string; tipo: 'TECNICA' | 'JURIDICA' }[];
    const escolhida = versaoDoMemorial(
      ((snaps.data ?? []) as { id: string; revision: number }[]).map((v) => ({
        snapshotId: v.id,
        revisao: v.revision,
        aprovacoes: aprovacoes.filter((a) => a.snapshot_id === v.id),
      })),
    );
    return escolhida ? nbr12721ExportService.documentoDaVersao(escolhida.snapshotId) : null;
  },

  /** A pasta de trabalho: "Resumo" + uma aba por tabela, números como número (a planilha soma). */
  pastaXlsx(d: DocumentoNbr12721): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Áreas NBR 12721 — Quadros da versão publicada'], [], ...cabecalhoDoDocumentoNbr12721(d)]), 'Resumo');
    for (const t of tabelasDoDocumentoNbr12721(d)) {
      const linhas: (string | number)[][] = [t.colunas.map((c) => c.titulo), ...t.linhas];
      if (t.total && t.linhas.length) linhas.push(t.total);
      const ws = XLSX.utils.aoa_to_sheet(linhas);
      ws['!cols'] = t.colunas.map((c, i) => ({ wch: i === 0 ? 18 : c.formato === 'texto' ? 40 : 16 }));
      XLSX.utils.book_append_sheet(wb, ws, t.aba.slice(0, 31));
    }
    return wb;
  },

  exportarXlsx(d: DocumentoNbr12721): void {
    XLSX.writeFile(nbr12721ExportService.pastaXlsx(d), `${nomeDoArquivoNbr12721(d)}.xlsx`);
  },

  /** O PDF montado (sem salvar) — `exportarPdf` baixa; separado para poder ser gerado e conferido fora do navegador. */
  async pdfDoDocumento(d: DocumentoNbr12721): Promise<import('jspdf').jsPDF> {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const largura = doc.internal.pageSize.getWidth();
    const altura = doc.internal.pageSize.getHeight();
    const MARGEM = 8;
    const fimDaUltimaTabela = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
    // Cada página leva no rodapé o que identifica o documento: empresa, versão e hash.
    const rodape = `${d.empresa ? `${d.empresa} · ` : ''}${d.estudo} · Versão ${d.revisao} · hash ${d.hash.slice(0, 16)}`;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Áreas NBR 12721 — Quadros I, II e IV-B', 12, 14);
    doc.setFontSize(8.5);
    let y = 21;
    for (const [rotulo, valor] of cabecalhoDoDocumentoNbr12721(d)) {
      doc.setFont('helvetica', 'bold');
      doc.text(`${rotulo}:`, 12, y);
      doc.setFont('helvetica', 'normal');
      doc.text(valor || '—', 52, y, { maxWidth: largura - 64 });
      y += 4.6;
    }

    /** Onde a última coisa desenhada terminou (cabeçalho, tabela ou título solto). */
    let cursor = y;
    /**
     * O título da tabela como texto, acima dela. Sem espaço para o título, o cabeçalho e até 5 linhas
     * (`linhas`), vira a página — nada de tabela começando no pé da folha com uma linha só.
     */
    const titulo = (texto: string, linhas = 0): number => {
      let topo = cursor + 8;
      if (topo + 18 + Math.min(linhas, 5) * 6 > altura - 14) {
        doc.addPage();
        topo = 14;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(texto, MARGEM, topo);
      cursor = topo;
      return topo + 2;
    };

    for (const t of tabelasDoDocumentoNbr12721(d)) {
      if (!t.linhas.length && (t.aba === 'Pendências' || t.aba === 'Aprovações')) {
        titulo(`${t.titulo}: nenhuma.`);
        continue;
      }
      const largas = t.colunas.length > 10;
      const fmt = (linha: (string | number)[]) => linha.map((v, i) => celulaFormatada(v, t.colunas[i].formato));
      const alinhamento = (i: number): 'left' | 'right' => (t.colunas[i].formato === 'texto' ? 'left' : 'right');
      const head = t.grupos
        ? [
            [
              { content: t.colunas[0].curto ?? t.colunas[0].titulo, rowSpan: 2, styles: { valign: 'bottom' as const } },
              ...t.grupos.map((g) => ({ content: g.titulo, colSpan: g.colunas, styles: { halign: 'center' as const } })),
            ],
            t.colunas.slice(1).map((c, i) => ({ content: c.curto ?? c.titulo, styles: { halign: alinhamento(i + 1) } })),
          ]
        : [t.colunas.map((c, i) => ({ content: c.curto ?? c.titulo, styles: { halign: alinhamento(i) } }))];
      const topo = titulo(t.titulo, t.linhas.length + (t.total ? 1 : 0));
      autoTable(doc, {
        startY: topo,
        head,
        body: t.linhas.map(fmt),
        foot: t.total && t.linhas.length ? [fmt(t.total)] : undefined,
        theme: 'grid',
        styles: { fontSize: largas ? 5.6 : 7.5, cellPadding: largas ? 0.9 : 1.4, overflow: 'linebreak', lineColor: [203, 213, 225], lineWidth: 0.1 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: largas ? 5.4 : 7.5, lineColor: [71, 85, 105] },
        footStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold' },
        columnStyles: Object.fromEntries(t.colunas.map((_, i) => [i, { halign: alinhamento(i) }])),
        // O rodapé (total) não herda o `columnStyles`: alinha aqui, número à direita como nas linhas.
        didParseCell: (c) => {
          if (c.section === 'foot') c.cell.styles.halign = alinhamento(c.column.index);
        },
        // Sem quebra horizontal: o quadro inteiro na largura da folha, os títulos curtos quebram em linhas
        // (com `horizontalPageBreak` o autoTable prefere partir o quadro em duas páginas a encolher as colunas).
        margin: { left: MARGEM, right: MARGEM, bottom: 14, top: 14 },
      });
      cursor = fimDaUltimaTabela() ?? cursor;
    }

    const paginas = doc.getNumberOfPages();
    for (let p = 1; p <= paginas; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100);
      doc.text(rodape, MARGEM, altura - 6);
      doc.text(`Página ${p} de ${paginas}`, largura - MARGEM, altura - 6, { align: 'right' });
    }
    return doc;
  },

  async exportarPdf(d: DocumentoNbr12721): Promise<void> {
    (await nbr12721ExportService.pdfDoDocumento(d)).save(`${nomeDoArquivoNbr12721(d)}.pdf`);
  },
};
