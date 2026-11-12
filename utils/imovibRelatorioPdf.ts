/**
 * PDF do relatório completo (item 10.5 do plano 2026-11-11): desenha as seções de
 * utils/imovibRelatorio.ts com texto e tabelas de verdade (jsPDF + jspdf-autotable)
 * — a busca do leitor de PDF acha os números. Uma linha de tabela nunca é
 * cortada entre duas páginas. Devolve o documento sem salvar, para poder ser
 * gerado e conferido fora do navegador.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { SecaoDoRelatorio } from './imovibRelatorio';

const MARGEM = 14;

export function pdfDoRelatorio(secoes: SecaoDoRelatorio[], nomeDoEstudo: string): jsPDF {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const largura = doc.internal.pageSize.getWidth();
    const altura = doc.internal.pageSize.getHeight();
    const fimDaTabela = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? MARGEM;
    let y = MARGEM;

    const garantir = (alturaNecessaria: number) => {
        if (y + alturaNecessaria > altura - 16) { doc.addPage(); y = MARGEM; }
    };
    const texto = (t: string, tamanho = 9.5, negrito = false) => {
        doc.setFont('helvetica', negrito ? 'bold' : 'normal');
        doc.setFontSize(tamanho);
        doc.setTextColor(15, 23, 42);
        const linhas = doc.splitTextToSize(t, largura - 2 * MARGEM) as string[];
        garantir(linhas.length * tamanho * 0.45 + 2);
        doc.text(linhas, MARGEM, y);
        y += linhas.length * tamanho * 0.45 + 2;
    };

    secoes.forEach((s, i) => {
        // Cada seção começa em página nova, menos a capa.
        if (i > 0) { doc.addPage(); y = MARGEM; }
        texto(`${i + 1}. ${s.titulo}`, 14, true);
        y += 2;
        if (s.vazio) { texto(s.vazio); return; }
        for (const p of s.paragrafos) texto(p);
        for (const t of s.tabelas) {
            y += 2;
            if (t.titulo) { garantir(16); texto(t.titulo, 10.5, true); }
            autoTable(doc, {
                startY: y,
                head: [t.colunas],
                body: t.linhas,
                margin: { left: MARGEM, right: MARGEM },
                styles: { fontSize: 8, cellPadding: 1.6, overflow: 'linebreak' },
                headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
                rowPageBreak: 'avoid',
                showHead: 'everyPage',
            });
            y = fimDaTabela() + 4;
        }
    });

    // Rodapé em todas as páginas: o estudo e a página.
    const total = doc.getNumberOfPages();
    for (let n = 1; n <= total; n++) {
        doc.setPage(n);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(`${nomeDoEstudo} · Relatório de viabilidade · página ${n} de ${total}`, MARGEM, altura - 8);
    }
    return doc;
}
