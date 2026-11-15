/**
 * PDF do relatório completo (item 10.5 do plano 2026-11-11): desenha as seções de
 * utils/imovibRelatorio.ts com texto e tabelas de verdade (jsPDF + jspdf-autotable)
 * — a busca do leitor de PDF acha os números. Uma linha de tabela nunca é
 * cortada entre duas páginas. Devolve o documento sem salvar, para poder ser
 * gerado e conferido fora do navegador.
 *
 * Plano 2026-11-15 (Fase 3): `extras.capa` desenha a capa visual na 1ª página (organização, logo,
 * estudo, versão e quatro números) e `extras.imagens` põe os gráficos de cada seção depois das
 * tabelas dela — imagem não é cortada entre páginas.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { SecaoDoRelatorio, CapaDoRelatorio } from './imovibRelatorio';
import type { GraficoId } from './imovibGraficos';

const MARGEM = 14;

export interface ImagemDoGrafico { dataUrl: string; largura: number; altura: number }

export interface ExtrasDoPdf {
    capa?: CapaDoRelatorio & { organizacao?: string | null; logo?: string | null };
    imagens?: Partial<Record<GraficoId, ImagemDoGrafico>>;
}

const formatoDaImagem = (dataUrl: string): 'PNG' | 'JPEG' | null =>
    /^data:image\/png/i.test(dataUrl) ? 'PNG' : /^data:image\/jpe?g/i.test(dataUrl) ? 'JPEG' : null;

function desenharCapa(doc: jsPDF, capa: NonNullable<ExtrasDoPdf['capa']>) {
    const largura = doc.internal.pageSize.getWidth();
    const altura = doc.internal.pageSize.getHeight();
    // Faixa escura com a organização (e o logo, se houver) e o filete de destaque.
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, largura, 58, 'F');
    doc.setFillColor(225, 85, 60);
    doc.rect(0, 58, largura, 2.2, 'F');
    let xTexto = MARGEM;
    const formato = capa.logo ? formatoDaImagem(capa.logo) : null;
    if (capa.logo && formato) {
        try {
            const props = doc.getImageProperties(capa.logo);
            const alturaLogo = 16;
            const larguraLogo = Math.min(48, (props.width / Math.max(1, props.height)) * alturaLogo);
            // Fundo branco: logo feita para papel (letra escura) sumia na faixa escura.
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(MARGEM - 3, 13, larguraLogo + 6, alturaLogo + 6, 2, 2, 'F');
            // 'FAST': o jsPDF guarda PNG sem compressão (uma logo de 3600 px dava 15 MB).
            doc.addImage(capa.logo, formato, MARGEM, 16, larguraLogo, alturaLogo, undefined, 'FAST');
            xTexto = MARGEM + larguraLogo + 9;
        } catch { /* logo ilegível: a capa sai sem ele */ }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    if (capa.organizacao) doc.text(capa.organizacao, xTexto, 26);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(203, 213, 225);
    doc.text('Estudo de viabilidade', xTexto, 33);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    const titulo = doc.splitTextToSize(capa.titulo, largura - 2 * MARGEM) as string[];
    doc.text(titulo, MARGEM, 86);
    let y = 86 + titulo.length * 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(71, 85, 105);
    doc.text(capa.subtitulo, MARGEM, y);
    y += 14;

    // Os quatro números, em grade 2×2.
    const larguraDoCartao = (largura - 2 * MARGEM - 6) / 2;
    capa.destaques.forEach((d, i) => {
        const x = MARGEM + (i % 2) * (larguraDoCartao + 6);
        const yc = y + Math.floor(i / 2) * 30;
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(x, yc, larguraDoCartao, 24, 2, 2, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text(d.rotulo, x + 5, yc + 8);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(15, 23, 42);
        doc.text(d.valor, x + 5, yc + 18);
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Números calculados pelo Ópura Imovib. Premissas e fontes nas seções a seguir.', MARGEM, altura - 22);
}

export function pdfDoRelatorio(secoes: SecaoDoRelatorio[], nomeDoEstudo: string, extras: ExtrasDoPdf = {}): jsPDF {
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

    if (extras.capa) desenharCapa(doc, extras.capa);

    secoes.forEach((s, i) => {
        // Cada seção começa em página nova (a 1ª, só se houver capa visual antes).
        if (i > 0 || extras.capa) { doc.addPage(); y = MARGEM; }
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
        // Gráficos da seção, na largura da página e na proporção da captura.
        for (const id of s.graficos ?? []) {
            const img = extras.imagens?.[id];
            if (!img) continue;
            const w = largura - 2 * MARGEM;
            const h = (w * img.altura) / Math.max(1, img.largura);
            garantir(h + 4);
            doc.addImage(img.dataUrl, formatoDaImagem(img.dataUrl) ?? 'PNG', MARGEM, y, w, h);
            y += h + 4;
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
