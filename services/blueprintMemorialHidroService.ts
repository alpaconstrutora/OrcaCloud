/**
 * Os MEMORIAIS HIDROSSANITÁRIOS em arquivo (28/09/2026, E3.1/E3.2): PDF com
 * tabelas de verdade (jspdf-autotable) e DOCX (os XML de
 * `utils/blueprintMemorialDocx.ts` num zip). O conteúdo é o de
 * `utils/blueprintMemorialHidro.ts` — aqui só se desenha.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { BlocoDoMemorial } from '../utils/blueprintMemorialHidro';
import { arquivosDoDocx } from '../utils/blueprintMemorialDocx';
import type { ArtefatoExportado } from './blueprintExportService';

/**
 * As fontes-padrão do jsPDF são WinAnsi: Σ, √, −, Δ e → saem como lixo. O
 * texto do PDF troca esses caracteres por equivalentes legíveis (o DOCX, que é
 * Unicode, fica com os originais).
 */
export function paraWinAnsi(s: string): string {
  return s
    .replace(/√ΣP/g, 'raiz(soma P)')
    .replace(/ΣP/g, 'soma P')
    .replace(/Σ/g, 'soma ')
    .replace(/√/g, 'raiz ')
    .replace(/−/g, '-')
    .replace(/Δ/g, 'delta ')
    .replace(/→/g, '->')
    .replace(/[✓]/g, 'OK')
    .replace(/[✗]/g, 'X')
    // E5.3: o memorial elétrico usa Ω (ρ em Ω·mm²/m) e ≤ ≥ (IB ≤ In ≤ Iz, Icn ≥ Ik) — viravam "?".
    .replace(/Ω/g, 'ohm')
    .replace(/ρ/g, 'rho')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    // E8.4 (incêndio): CO₂ do extintor.
    .replace(/₂/g, '2')
    .replace(/[^\u0000-ÿ–—‘’“”•…€]/g, '?');
}

/** O PDF do memorial: A4, deitado quando alguma tabela é larga. */
export function memorialHidroEmPdf(blocos: BlocoDoMemorial[], titulo: string): Blob {
  const paisagem = blocos.some((b) => b.tipo === 'tabela' && b.cabecalho.length > 8);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: paisagem ? 'landscape' : 'portrait' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  let y = M;
  const garantir = (altura: number) => {
    if (y + altura > H - M - 6) {
      doc.addPage();
      y = M;
    }
  };
  const texto = (t: string, tamanho: number, negrito: boolean, depois: number) => {
    doc.setFont('helvetica', negrito ? 'bold' : 'normal');
    doc.setFontSize(tamanho);
    const linhas = doc.splitTextToSize(paraWinAnsi(t), W - 2 * M) as string[];
    const alt = linhas.length * tamanho * 0.42;
    garantir(alt + (negrito ? 8 : 0)); // título não fica sozinho no pé da página
    doc.text(linhas, M, y + tamanho * 0.35);
    y += alt + depois;
  };
  for (const b of blocos) {
    if (b.tipo === 'titulo') texto(b.texto, 14, true, 3);
    else if (b.tipo === 'secao') texto(b.texto, 11.5, true, 1.5);
    else if (b.tipo === 'subsecao') texto(b.texto, 10, true, 1);
    else if (b.tipo === 'paragrafo') texto(b.texto, 9, false, 2);
    else {
      const larga = b.cabecalho.length > 8;
      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M, bottom: M + 6 },
        head: [b.cabecalho.map(paraWinAnsi)],
        body: b.linhas.map((l) => l.map(paraWinAnsi)),
        styles: { font: 'helvetica', fontSize: larga ? 6.5 : 8, cellPadding: 1, overflow: 'linebreak' },
        headStyles: { fillColor: [229, 231, 235], textColor: [0, 0, 0], fontStyle: 'bold' },
        theme: 'grid',
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
    }
  }
  // Rodapé em todas as páginas: o título e "página x de y".
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    doc.text(paraWinAnsi(titulo), M, H - M + 2);
    doc.text(`página ${p} de ${total}`, W - M, H - M + 2, { align: 'right' });
    doc.setTextColor(0);
  }
  return doc.output('blob');
}

/** O DOCX do memorial. Assíncrono: o `pizzip` entra por `import()`, como no BCF. */
export async function memorialHidroEmDocx(blocos: BlocoDoMemorial[]): Promise<Blob> {
  const { default: PizZip } = await import('pizzip');
  const zip = new PizZip();
  const paisagem = blocos.some((b) => b.tipo === 'tabela' && b.cabecalho.length > 8);
  for (const a of arquivosDoDocx(blocos, paisagem)) zip.file(a.caminho, a.conteudo);
  return zip.generate({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }) as Blob;
}

/** Os dois arquivos de um memorial, prontos para `baixarArtefatos`. */
export async function artefatosDoMemorial(blocos: BlocoDoMemorial[], nomeBase: string, titulo: string, formato: 'pdf' | 'docx'): Promise<ArtefatoExportado[]> {
  if (formato === 'pdf') return [{ blob: memorialHidroEmPdf(blocos, titulo), nome: `${nomeBase}.pdf`, tipo: 'pdf' }];
  return [{ blob: await memorialHidroEmDocx(blocos), nome: `${nomeBase}.docx`, tipo: 'docx' }];
}
