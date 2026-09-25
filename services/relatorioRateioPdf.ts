// services/relatorioRateioPdf.ts
// O PDF do relatório de rateio — a prestação de contas que o síndico distribui
// e que o condômino baixa do portal.
//
// Paleta, `sectionHeader`, linha de total em negrito via `didParseCell` e
// rodapé em TODAS as páginas são copiados de `services/pdfReportService.ts`,
// que é o molde de fato do app (o `academyCertificadoService` também parte
// dele). Não existe helper de PDF compartilhado neste repo — cada domínio tem
// o seu, e esta é a versão de condomínio.
//
// Duas diferenças deliberadas em relação ao `pdfReportService`:
//
//  1. **`import()` dinâmico**, como em `boletoService.exportarPDF`: jsPDF +
//     autotable são ~400 KB, e quem abre a aba Financeiro do condomínio quase
//     nunca baixa o relatório. Carregar no clique tira esse peso do bundle.
//  2. **`doc.save()`**, não upload ao Storage. O documento é derivado: sai
//     inteiro dos dados que a tela já tem. Gravá-lo criaria uma segunda
//     verdade que envelhece — rateio corrigido e PDF antigo no bucket.
//
// ⚠️ Este módulo NÃO conhece o banco nem o domínio. Recebe um
// `RelatorioRateio` já montado (`utils/relatorioRateio.ts`) e só desenha — é a
// convenção registrada em `services/exportService.ts:88-95`: o service formata,
// a tela conhece os rótulos.

import type { RelatorioRateio } from '../utils/relatorioRateio';

const PRIMARY = [30, 64, 175] as [number, number, number];   // blue-800
const LIGHT = [241, 245, 249] as [number, number, number];   // slate-100
const DARK = [15, 23, 42] as [number, number, number];       // slate-900
const GRAY = [100, 116, 139] as [number, number, number];    // slate-500
const HEAD_ALT = [248, 250, 252] as [number, number, number]; // slate-50
const AMBER = [180, 83, 9] as [number, number, number];      // amber-700

/** Moeda COM centavos. O `pdfReportService` arredonda para o inteiro porque
 *  lida com milhões; aqui o centavo é o assunto — é ele que faz a cota de uma
 *  unidade diferir da outra em R$ 0,01 na distribuição por maior resto. */
const dinheiro = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

function tituloDeSecao(doc: any, titulo: string, y: number, W: number): number {
    doc.setFillColor(...LIGHT);
    doc.rect(14, y, W - 28, 8, 'F');
    doc.setTextColor(...PRIMARY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(titulo, 17, y + 5.5);
    return y + 12;
}

/** Gera e BAIXA o PDF. Devolve o nome do arquivo, para a tela poder dizê-lo. */
export async function baixarRelatorioRateioPdf(rel: RelatorioRateio): Promise<string> {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();

    // ── Cabeçalho ────────────────────────────────────────────────────────
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, W, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Relatório de rateio', 14, 13);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(rel.condominio, 14, 21);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(rel.titulo, W - 14, 13, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Gerado em ${rel.geradoEm}`, W - 14, 21, { align: 'right' });

    let y = 42;

    // ── Identificação ────────────────────────────────────────────────────
    y = tituloDeSecao(doc, 'IDENTIFICAÇÃO', y, W);
    const identificacao: string[][] = [
        ['Competência', rel.competencia, 'Tipo', rel.tipo],
        ['Critério', rel.criterio, 'Situação', rel.fechadoEm ? `${rel.status} em ${rel.fechadoEm}` : rel.status],
        ['Total das despesas', dinheiro(rel.totalDespesas), 'Total rateado', dinheiro(rel.totalRateado)],
    ];
    if (rel.diferenca !== 0) {
        identificacao.push(['Diferença', dinheiro(rel.diferenca), 'Unidades', String(rel.unidades)]);
    } else {
        identificacao.push(['Unidades', String(rel.unidades), '', '']);
    }
    autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        body: identificacao,
        theme: 'plain',
        bodyStyles: { fontSize: 9, textColor: DARK, cellPadding: 1.6 },
        columnStyles: {
            0: { cellWidth: 38, fontStyle: 'bold', textColor: GRAY },
            1: { cellWidth: 55 },
            2: { cellWidth: 38, fontStyle: 'bold', textColor: GRAY },
            3: { cellWidth: 51 },
        },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // ── Avisos ───────────────────────────────────────────────────────────
    // Vêm ANTES das tabelas, de propósito: são o que muda a leitura dos
    // números abaixo, e um aviso no rodapé é um aviso que ninguém lê.
    if (rel.avisos.length > 0) {
        doc.setTextColor(...AMBER);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        for (const aviso of rel.avisos) {
            const linhas = doc.splitTextToSize(`• ${aviso}`, W - 32) as string[];
            doc.text(linhas, 16, y);
            y += linhas.length * 4 + 1.5;
        }
        y += 4;
    }

    // ── Despesas ─────────────────────────────────────────────────────────
    y = tituloDeSecao(doc, 'DESPESAS DA COMPETÊNCIA', y, W);
    if (rel.despesas.length === 0) {
        doc.setTextColor(...GRAY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text('Nenhuma despesa entrou neste rateio.', 16, y);
        y += 10;
    } else {
        autoTable(doc, {
            startY: y,
            margin: { left: 14, right: 14 },
            head: [['#', 'Descrição', 'Valor']],
            body: [
                ...rel.despesas.map((d, i) => [String(i + 1), d.descricao, dinheiro(d.valor)]),
                ['', `TOTAL — ${rel.despesas.length} lançamento(s)`, dinheiro(rel.somaDespesas)],
            ],
            headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
            bodyStyles: { fontSize: 9, textColor: DARK },
            alternateRowStyles: { fillColor: HEAD_ALT },
            didParseCell: (data: any) => {
                if (data.row.index === rel.despesas.length) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = LIGHT;
                }
            },
            columnStyles: {
                0: { cellWidth: 12, halign: 'right' },
                1: { cellWidth: 135 },
                2: { cellWidth: 35, halign: 'right' },
            },
        });
        y = (doc as any).lastAutoTable.finalY + 10;
    }

    // ── Cotas ────────────────────────────────────────────────────────────
    y = tituloDeSecao(doc, 'RATEIO POR UNIDADE', y, W);
    if (rel.cotas.length === 0) {
        doc.setTextColor(...GRAY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text('Nenhuma unidade recebeu cota neste rateio.', 16, y);
    } else {
        const temObservacao = rel.cotas.some(c => !!c.observacao);
        autoTable(doc, {
            startY: y,
            margin: { left: 14, right: 14 },
            head: [temObservacao
                ? ['Unidade', 'Quem paga', 'Observação', 'Cota']
                : ['Unidade', 'Quem paga', 'Cota']],
            body: [
                ...rel.cotas.map(c => {
                    // Cota sem pagador é informação, não branco: a cota foi
                    // calculada e não há de quem cobrar.
                    const pagador = c.pagador ?? 'Sem responsável definido';
                    return temObservacao
                        ? [c.unidade, pagador, c.observacao ?? '—', dinheiro(c.valor)]
                        : [c.unidade, pagador, dinheiro(c.valor)];
                }),
                temObservacao
                    ? ['', `TOTAL — ${rel.cotas.length} unidade(s)`, '', dinheiro(rel.somaCotas)]
                    : ['', `TOTAL — ${rel.cotas.length} unidade(s)`, dinheiro(rel.somaCotas)],
            ],
            headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
            bodyStyles: { fontSize: 9, textColor: DARK },
            alternateRowStyles: { fillColor: HEAD_ALT },
            didParseCell: (data: any) => {
                if (data.row.index === rel.cotas.length) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = LIGHT;
                    return;
                }
                // A cota de quem está lendo vem marcada — é a linha que o
                // condômino procura, e sem marca ele conta linhas com o dedo.
                if (rel.cotas[data.row.index]?.minha) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.textColor = PRIMARY;
                }
            },
            columnStyles: temObservacao
                ? { 0: { cellWidth: 42 }, 1: { cellWidth: 60 }, 2: { cellWidth: 45 }, 3: { cellWidth: 35, halign: 'right' } }
                : { 0: { cellWidth: 52 }, 1: { cellWidth: 95 }, 2: { cellWidth: 35, halign: 'right' } },
        });
        y = (doc as any).lastAutoTable.finalY + 10;
    }

    // ── Observações do rateio ────────────────────────────────────────────
    if (rel.observacoes) {
        y = tituloDeSecao(doc, 'OBSERVAÇÕES', y, W);
        doc.setTextColor(...DARK);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(doc.splitTextToSize(rel.observacoes, W - 32) as string[], 16, y);
    }

    // ── Rodapé em TODAS as páginas ───────────────────────────────────────
    const paginas = doc.getNumberOfPages();
    for (let i = 1; i <= paginas; i++) {
        doc.setPage(i);
        const H = doc.internal.pageSize.getHeight();
        doc.setFillColor(...LIGHT);
        doc.rect(0, H - 12, W, 12, 'F');
        doc.setTextColor(...GRAY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`${rel.condominio} — ${rel.titulo} · Documento gerado pelo Òpura.`, 14, H - 4);
        doc.text(`${i} / ${paginas}`, W - 14, H - 4, { align: 'right' });
    }

    const arquivo = `${rel.nomeDoArquivo}.pdf`;
    doc.save(arquivo);
    return arquivo;
}
