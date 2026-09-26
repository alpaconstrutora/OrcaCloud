// services/relatorioAnexos.ts
// Os COMPROVANTES anexados ao relatório de rateio: o boleto (ou o XML, ou a
// minuta) de cada despesa, virando páginas do mesmo PDF.
//
// POR QUE RASTERIZAR: não há biblioteca de MERGE de PDF neste projeto
// (`jspdf` escreve, não junta; não existe `pdf-lib`). O que existe é
// `pdfjs-dist`, já usado em `utils/pdfToImage.ts`, e o precedente de
// `docxRenderService.docxBlobToPdf`, que também rasteriza. Então cada página do
// comprovante é desenhada num canvas e entra como imagem.
//
// O custo é perder o texto selecionável do anexo. Para um comprovante isso é
// aceitável: boleto vem de PDF escaneado ou de OCR, e o que se quer dele é a
// prova visual. O corpo do relatório — que é o que se lê — continua vetorial.
//
// ⚠️ Só o lado de DENTRO do sistema consegue anexar. O bucket `boletos` só abre
// para membro da organização (policy `boletos_select_org`), e o condômino entra
// por token de portal, sem ser membro. O relatório do portal sai sem anexo, de
// propósito — não é limitação a corrigir, é a permissão funcionando.

import { storageService } from './storageService';
import type { DocumentoDeOrigem } from './condominioRateioService';

/** Uma despesa que tem comprovante a anexar. */
export interface ComprovanteDeDespesa {
    descricao: string;
    valor: number;
    documento: DocumentoDeOrigem;
}

/** Qualidade do anexo. Escala 2 num A4 dá ~1.240×1.754 px, legível para
 *  imprimir; JPEG a 0,72 mantém o arquivo em alguns MB em vez de dezenas. */
const ESCALA = 2;
const QUALIDADE_JPEG = 0.72;
/** Teto de páginas por comprovante — boleto com 30 páginas é erro de upload,
 *  não prestação de contas, e não pode travar o navegador. */
const MAX_PAGINAS_POR_DOC = 10;

const dinheiro = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

/**
 * Recorta a margem branca do canvas renderizado.
 *
 * Medido no primeiro boleto anexado (Energisa, 26/09/2026): a página de origem
 * é larga e a fatura ocupa só a faixa ESQUERDA — o resto é branco. Encaixada
 * inteira, a fatura saía como uma tira de ~5 cm num A4, e o texto não se lia
 * impresso. Aparar o branco deixa o conteúdo crescer até a largura da folha.
 *
 * Varre em passos (não pixel a pixel) porque uma página a escala 2 tem ~2 mi de
 * pixels; a margem de erro de alguns pixels é coberta pela folga.
 */
function aparaMargemBranca(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const { width: W, height: H } = canvas;
    const dados = ctx.getImageData(0, 0, W, H).data;
    const passo = 3;
    // "Branco" com tolerância: PDF escaneado raramente tem 255 puro no fundo.
    const conteudo = (x: number, y: number) => {
        const i = (y * W + x) * 4;
        return dados[i] < 235 || dados[i + 1] < 235 || dados[i + 2] < 235;
    };
    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let y = 0; y < H; y += passo) {
        for (let x = 0; x < W; x += passo) {
            if (!conteudo(x, y)) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    // Página em branco: devolve como está, não um canvas de 0×0.
    if (maxX < 0) return canvas;

    const folga = 24;
    minX = Math.max(0, minX - folga);
    minY = Math.max(0, minY - folga);
    maxX = Math.min(W - 1, maxX + folga);
    maxY = Math.min(H - 1, maxY + folga);
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    // Quase nada a aparar: não vale a cópia.
    if (w > W * 0.97 && h > H * 0.97) return canvas;

    const recorte = document.createElement('canvas');
    recorte.width = w;
    recorte.height = h;
    const rctx = recorte.getContext('2d');
    if (!rctx) return canvas;
    rctx.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
    return recorte;
}

/**
 * Anexa os comprovantes ao documento jsPDF já montado.
 *
 * Devolve o que conseguiu e o que não — o relatório NÃO pode falhar porque um
 * anexo não abriu: um comprovante ilegível é uma linha no fim do documento,
 * não um download que não acontece.
 */
export async function anexarComprovantes(
    doc: any,
    autoTable: any,
    comprovantes: ComprovanteDeDespesa[],
    aoProgredir?: (feito: number, total: number) => void,
): Promise<{ anexados: number; falhas: { descricao: string; motivo: string }[] }> {
    const falhas: { descricao: string; motivo: string }[] = [];
    let anexados = 0;
    if (comprovantes.length === 0) return { anexados, falhas };

    const pdfjs = await import('pdfjs-dist');
    // O worker vem do mesmo lugar que `utils/pdfToImage.ts` usa — sem ele o
    // pdfjs roda na thread principal e trava a aba em documento grande.
    const { default: workerSrc } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    (pdfjs as any).GlobalWorkerOptions.workerSrc = workerSrc;

    for (let i = 0; i < comprovantes.length; i++) {
        const c = comprovantes[i];
        aoProgredir?.(i, comprovantes.length);
        try {
            const url = await storageService.createSignedUrl(c.documento.bucket, c.documento.path, 60 * 15);
            const resposta = await fetch(url);
            if (!resposta.ok) throw new Error(`o arquivo respondeu ${resposta.status}`);
            const bytes = await resposta.arrayBuffer();

            const pdf = await (pdfjs as any).getDocument({ data: bytes }).promise;
            const paginas = Math.min(pdf.numPages, MAX_PAGINAS_POR_DOC);

            for (let n = 1; n <= paginas; n++) {
                const pagina = await pdf.getPage(n);
                const viewport = pagina.getViewport({ scale: ESCALA });
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('o navegador não deu contexto de canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                // Fundo branco: PDF sem fundo vira JPEG preto.
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                await pagina.render({ canvasContext: ctx, viewport }).promise;

                // Apara ANTES de decidir retrato/paisagem: é o formato do
                // CONTEÚDO que importa, não o da folha em que ele veio.
                const imagem = aparaMargemBranca(canvas);
                const retrato = imagem.height >= imagem.width;
                doc.addPage('a4', retrato ? 'portrait' : 'landscape');
                const L = doc.internal.pageSize.getWidth();
                const A = doc.internal.pageSize.getHeight();

                // Legenda: sem ela, 30 páginas de boleto no fim do documento não
                // dizem a QUAL despesa cada uma corresponde.
                doc.setTextColor(100, 116, 139);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                const legenda = `Comprovante ${i + 1}/${comprovantes.length}`
                    + `${paginas > 1 ? ` · página ${n} de ${paginas}` : ''}`
                    + ` — ${c.descricao} · ${dinheiro(c.valor)}`;
                doc.text(doc.splitTextToSize(legenda, L - 28)[0], 14, 10);

                // Encaixa a página inteira na folha, sem distorcer.
                const topo = 14;
                const escala = Math.min((L - 28) / imagem.width, (A - topo - 14) / imagem.height);
                const w = imagem.width * escala;
                const h = imagem.height * escala;
                doc.addImage(
                    imagem.toDataURL('image/jpeg', QUALIDADE_JPEG),
                    'JPEG', (L - w) / 2, topo, w, h, undefined, 'FAST',
                );
            }
            if (pdf.numPages > MAX_PAGINAS_POR_DOC) {
                falhas.push({
                    descricao: c.descricao,
                    motivo: `tem ${pdf.numPages} páginas; só as ${MAX_PAGINAS_POR_DOC} primeiras entraram`,
                });
            }
            anexados++;
        } catch (e: any) {
            falhas.push({ descricao: c.descricao, motivo: e?.message || 'não foi possível abrir o arquivo' });
        }
    }
    aoProgredir?.(comprovantes.length, comprovantes.length);

    // O que não entrou é DITO no documento. Anexo que falta em silêncio é pior
    // que anexo que falta: quem confere não tem como saber que faltou.
    if (falhas.length > 0) {
        doc.addPage('a4', 'portrait');
        const L = doc.internal.pageSize.getWidth();
        doc.setTextColor(180, 83, 9);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Comprovantes que não entraram', 14, 20);
        autoTable(doc, {
            startY: 26,
            margin: { left: 14, right: 14 },
            head: [['Despesa', 'Motivo']],
            body: falhas.map(f => [f.descricao, f.motivo]),
            headStyles: { fillColor: [180, 83, 9], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
            bodyStyles: { fontSize: 9, textColor: [15, 23, 42] },
            columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: L - 128 } },
        });
    }

    return { anexados, falhas };
}
