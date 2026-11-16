/**
 * Logo como data URL (o pdfmake e o jsPDF não baixam imagem por URL). Falha → sem logo.
 * Usado pelo motor de documentos (services/docGen/previa.ts) e pelo relatório do Imovib.
 */
const logoCache = new Map<string, Promise<string | null>>();

export function logoComoDataUrl(url?: string | null): Promise<string | null> {
    if (!url) return Promise.resolve(null);
    if (url.startsWith('data:image/')) return Promise.resolve(url);
    let p = logoCache.get(url);
    if (!p) {
        p = fetch(url)
            .then(r => (r.ok ? r.blob() : null))
            .then(blob => blob && blob.type.startsWith('image/')
                ? new Promise<string | null>(resolve => {
                    const fr = new FileReader();
                    fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : null);
                    fr.onerror = () => resolve(null);
                    fr.readAsDataURL(blob);
                })
                : null)
            .catch(() => null);
        logoCache.set(url, p);
        // Falha (rede, servidor) não fica no cache: senão a logo sumia até recarregar a página.
        p.then(v => { if (v == null) logoCache.delete(url); });
    }
    return p;
}
