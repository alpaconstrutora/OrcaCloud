/**
 * Logo da capa do relatório do Imovib pronta para o jsPDF (pedido do usuário, 15/11/2026):
 * - o jsPDF só põe PNG e JPEG: SVG e WebP são redesenhados em PNG (antes saíam sem logo);
 * - logo grande é reduzida (16 mm de altura não pedem 3600 px; uma assim dava 15 MB de PDF).
 */
const LARGURA_MAXIMA = 480;
/** SVG sem tamanho próprio (só viewBox) chega com 0 × 0. */
const TAMANHO_DO_SVG_SEM_TAMANHO = { largura: LARGURA_MAXIMA, altura: 160 };

const ehPngOuJpeg = (dataUrl: string) => /^data:image\/(png|jpe?g)[;,]/i.test(dataUrl);

/** Redesenha quando o formato não entra no jsPDF ou quando passa da largura. */
export const precisaRedesenhar = (dataUrl: string, larguraNatural: number, larguraMaxima = LARGURA_MAXIMA): boolean =>
    !ehPngOuJpeg(dataUrl) || larguraNatural > larguraMaxima;

/** Só no navegador (usa <img> e <canvas>). Falha → a original se já for PNG/JPEG, senão sem logo. */
export async function logoParaOPdf(dataUrl: string | null, larguraMaxima = LARGURA_MAXIMA): Promise<string | null> {
    if (!dataUrl) return null;
    const original = ehPngOuJpeg(dataUrl) ? dataUrl : null;
    try {
        const img = new Image();
        await new Promise<void>((ok, erro) => { img.onload = () => ok(); img.onerror = () => erro(new Error('logo')); img.src = dataUrl; });
        if (!precisaRedesenhar(dataUrl, img.naturalWidth, larguraMaxima)) return dataUrl;
        const semTamanho = !img.naturalWidth || !img.naturalHeight;
        const largura = semTamanho ? TAMANHO_DO_SVG_SEM_TAMANHO.largura : Math.min(larguraMaxima, img.naturalWidth);
        const altura = semTamanho ? TAMANHO_DO_SVG_SEM_TAMANHO.altura : Math.max(1, Math.round((img.naturalHeight * largura) / img.naturalWidth));
        const c = document.createElement('canvas');
        c.width = largura;
        c.height = altura;
        const ctx = c.getContext('2d');
        if (!ctx) return original;
        ctx.drawImage(img, 0, 0, largura, altura);
        return c.toDataURL('image/png');
    } catch {
        return original;
    }
}
