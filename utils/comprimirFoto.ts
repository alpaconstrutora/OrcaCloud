/**
 * Foto de obra antes de subir: lado maior até 2048 px, JPEG 0,82.
 *
 * A câmera do celular entrega 3–12 MB por foto, e o envio é pelo 4G do
 * canteiro. 2048 px ainda mostra fissura e etiqueta de material; dá ~0,4–0,9 MB.
 *
 * Nunca impede o envio: se o navegador não decodifica o formato (HEIC no
 * Chrome do computador) ou o canvas falha, sobe o arquivo original. No iPhone
 * (Safari decodifica HEIC) a foto sai JPEG — que também abre no escritório.
 */

export const LADO_MAXIMO_PX = 2048;
export const QUALIDADE_JPEG = 0.82;
/** Abaixo disto, JPEG/WebP já pequeno sobe como está (recomprimir só perde qualidade). */
export const LIMIAR_BYTES = 600 * 1024;

const HEIC = /^image\/hei[cf]$/i;

/** Tamanho final mantendo a proporção; nunca amplia. */
export function dimensoesAlvo(largura: number, altura: number, ladoMaximo = LADO_MAXIMO_PX): { largura: number; altura: number } {
    const maior = Math.max(largura, altura);
    if (!maior || maior <= ladoMaximo) return { largura, altura };
    const k = ladoMaximo / maior;
    return { largura: Math.round(largura * k), altura: Math.round(altura * k) };
}

/**
 * Vale tentar? Só imagem; GIF (animação) e SVG (vetor) nunca; HEIC sempre
 * (converter para JPEG é o ganho principal); o resto, só se for grande.
 */
export function precisaComprimir(file: { type?: string; size: number }): boolean {
    const tipo = (file.type || '').toLowerCase();
    if (!tipo.startsWith('image/')) return false;
    if (tipo === 'image/gif' || tipo === 'image/svg+xml') return false;
    if (HEIC.test(tipo)) return true;
    return file.size > LIMIAR_BYTES;
}

/** Nome com extensão `.jpg` (a foto passou a ser JPEG). */
export function nomeJpg(nome: string): string {
    const base = (nome || 'foto').replace(/\.[^./\\]+$/, '');
    return `${base || 'foto'}.jpg`;
}

export async function comprimirFoto(file: File): Promise<File> {
    if (!precisaComprimir(file)) return file;
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
    try {
        // `from-image`: respeita a orientação EXIF (foto em pé não deita).
        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const { largura, altura } = dimensoesAlvo(bmp.width, bmp.height);
        const canvas = document.createElement('canvas');
        canvas.width = largura;
        canvas.height = altura;
        const ctx = canvas.getContext('2d');
        if (!ctx) { bmp.close(); return file; }
        // PNG com transparência viraria fundo preto no JPEG.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, largura, altura);
        ctx.drawImage(bmp, 0, 0, largura, altura);
        bmp.close();
        const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', QUALIDADE_JPEG));
        if (!blob) return file;
        // Não piora: se não ficou menor, sobe o original (exceto HEIC — JPEG é o que o escritório abre).
        if (blob.size >= file.size && !HEIC.test(file.type)) return file;
        return new File([blob], nomeJpg(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
    } catch {
        return file;
    }
}
