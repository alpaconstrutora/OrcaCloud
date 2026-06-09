// Renderização de documentos .docx com marcadores {001}, {002}…
// Detecção  : docxtemplater (normaliza runs quebrados do Word)
// Substituição: docxtemplater primeiro (lida com runs); fallback XML direto

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function toArrayBuffer(src: File | Blob | ArrayBuffer): Promise<ArrayBuffer> {
    if (src instanceof ArrayBuffer) return src;
    return await src.arrayBuffer();
}

/**
 * Detecta todos os marcadores {NNN} no .docx.
 * Usa docxtemplater que normaliza tokens quebrados entre "runs" do Word.
 */
export async function detectTokens(src: File | Blob | ArrayBuffer): Promise<string[]> {
    const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([
        import('pizzip'),
        import('docxtemplater'),
    ]);
    const buf = await toArrayBuffer(src);
    const zip = new PizZip(buf);

    const seen = new Set<string>();

    try {
        const doc = new Docxtemplater(zip, {
            delimiters: { start: '{', end: '}' },
            nullGetter: () => '',
            parser: (tag: string) => {
                const t = tag.trim();
                if (t) seen.add(t);
                return { get: () => '' };
            },
        });
        try { doc.render({}); } catch { /* tokens coletados */ }
    } catch { /* MultiError do construtor — tokens já coletados */ }

    return Array.from(seen)
        .filter(t => /^\w+$/.test(t))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

const escapeXml = (v: string) =>
    v.replace(/&/g, '&amp;')
     .replace(/</g, '&lt;')
     .replace(/>/g, '&gt;')
     .replace(/"/g, '&quot;');

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Constrói um regex que casa o marcador `{token}` no XML do Word **mesmo quando
 * o Word quebrou o marcador em vários "runs"**. Entre cada caractere (e ao redor
 * das chaves) toleramos qualquer sequência de tags XML — ex.:
 *   {001}                                    → casa
 *   {</w:t></w:r><w:r><w:t>001</w:t>...<w:t>} → casa
 *
 * Só casa o token informado (chaves do `data`), então nunca toca em outras
 * chaves do documento — diferente do docxtemplater, que apagaria qualquer `{…}`.
 */
function buildSplitTokenRegex(token: string): RegExp {
    const TAG = '(?:<[^>]+>)*';
    const chars = token.split('').map(escapeRegExp).join(TAG);
    return new RegExp('\\{' + TAG + chars + TAG + '\\}', 'g');
}

/**
 * Preenche o .docx com os valores de `data`, substituindo cada `{token}` pelo
 * valor correspondente. Tolerante à fragmentação de marcadores entre "runs" do
 * Word e imune a chaves soltas/tokens internos ({CTVNu} etc.): nunca lança e
 * nunca remove conteúdo que não seja um marcador conhecido.
 */
export async function fillDocx(
    src: File | Blob | ArrayBuffer,
    data: Record<string, string>,
): Promise<Blob> {
    const { default: PizZip } = await import('pizzip');
    const buf = await toArrayBuffer(src);
    const zip = new PizZip(buf);

    // Pré-compila um regex tolerante por token (ordena por tamanho desc. para
    // evitar que um token prefixo case dentro de outro maior).
    const replacements = Object.entries(data)
        .filter(([token]) => /^\w+$/.test(token))
        .sort((a, b) => b[0].length - a[0].length)
        .map(([token, value]) => ({ re: buildSplitTokenRegex(token), value: escapeXml(value ?? '') }));

    const xmlEntries = Object.keys(zip.files).filter(
        f => f.startsWith('word/') && f.endsWith('.xml') && !zip.files[f].dir,
    );
    for (const fileName of xmlEntries) {
        let content = zip.files[fileName].asText();
        for (const { re, value } of replacements) {
            content = content.replace(re, value);
        }
        zip.file(fileName, content);
    }
    return zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}

/** Converte um .docx (Blob) em HTML usando mammoth. */
export async function docxToHtml(docx: Blob | ArrayBuffer): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mammoth: any = await import('mammoth');
    const arrayBuffer = await toArrayBuffer(docx);
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return result.value as string;
}

const PX_TO_MM = 25.4 / 96;

/**
 * Gera um PDF **fiel ao layout do Word** a partir de um .docx já preenchido.
 *
 * Usa docx-preview (renderiza o .docx preservando fontes, margens, tabelas e o
 * tamanho de página real do Word) e captura **cada página** com html2canvas,
 * adicionando-a ao PDF no tamanho exato da página. Tudo dentro de um <iframe>
 * isolado: o html2canvas 1.4.1 quebra com as cores `oklch()` do Tailwind v4 da
 * página principal, e o iframe garante que ele só veja estilos simples.
 */
export async function docxBlobToPdf(docx: Blob | ArrayBuffer): Promise<Blob> {
    const [{ jsPDF }, { default: html2canvas }, docxPreview] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
        import('docx-preview'),
    ]);
    const buf = await toArrayBuffer(docx);

    const iframe = window.document.createElement('iframe');
    iframe.style.cssText =
        'position:absolute;left:0;top:0;width:1200px;height:10px;' +
        'border:0;opacity:0;pointer-events:none;z-index:-1';
    window.document.body.appendChild(iframe);

    try {
        const idoc = iframe.contentDocument!;
        idoc.open();
        idoc.write('<!doctype html><html><head><meta charset="utf-8">' +
            '<style>html,body{margin:0;padding:0;background:#fff}</style></head><body></body></html>');
        idoc.close();

        // docx-preview injeta seus próprios estilos (rgb/hex) e renderiza uma
        // <section> por página, com a largura/altura/margens reais do documento.
        // inWrapper:false → seções ficam direto no body (sem o wrapper cinza),
        // facilitando capturar o body inteiro e fatiar por página.
        await docxPreview.renderAsync(buf, idoc.body, undefined, {
            className: 'docx',
            inWrapper: false,
            ignoreWidth: false,
            ignoreHeight: false,
            breakPages: true,
            renderHeaders: true,
            renderFooters: true,
            useBase64URL: true,
        });

        // Remove margens/sombras entre páginas para o fatiamento ficar exato.
        const reset = idoc.createElement('style');
        reset.textContent =
            'body{margin:0;background:#fff}' +
            'section.docx{margin:0 !important;box-shadow:none !important}';
        idoc.head.appendChild(reset);

        try { await idoc.fonts?.ready; } catch { /* ignore */ }

        const pages = Array.from(idoc.querySelectorAll<HTMLElement>('section.docx'));
        if (pages.length === 0) {
            throw new Error('Não foi possível renderizar as páginas do documento.');
        }
        iframe.style.height = `${idoc.body.scrollHeight}px`;

        // Captura o body inteiro de uma vez (caminho comprovado) e depois fatia
        // o canvas resultante nos limites de cada página do documento.
        const SCALE = 2;
        const fullCanvas = await html2canvas(idoc.body, {
            scale: SCALE,
            useCORS: true,
            backgroundColor: '#ffffff',
            width: idoc.body.offsetWidth,
            height: idoc.body.scrollHeight,
            windowWidth: idoc.body.offsetWidth,
            windowHeight: idoc.body.scrollHeight,
        });

        if (!fullCanvas.width || !fullCanvas.height) {
            throw new Error('Não foi possível renderizar o conteúdo do documento.');
        }

        const sy = fullCanvas.height / idoc.body.scrollHeight;
        const sx = fullCanvas.width / idoc.body.offsetWidth;

        let doc: import('jspdf').jsPDF | null = null;
        for (const page of pages) {
            const wMm = page.offsetWidth * PX_TO_MM;
            const hMm = page.offsetHeight * PX_TO_MM;
            const orientation = wMm > hMm ? 'l' : 'p';

            const sliceX = Math.round(page.offsetLeft * sx);
            const sliceY = Math.round(page.offsetTop * sy);
            const sliceW = Math.max(1, Math.round(page.offsetWidth * sx));
            const sliceH = Math.max(1, Math.round(page.offsetHeight * sy));

            const pageCanvas = window.document.createElement('canvas');
            pageCanvas.width = sliceW;
            pageCanvas.height = sliceH;
            const ctx = pageCanvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, sliceW, sliceH);
                ctx.drawImage(fullCanvas, sliceX, sliceY, sliceW, sliceH, 0, 0, sliceW, sliceH);
            }
            const img = pageCanvas.toDataURL('image/jpeg', 0.95);

            if (!doc) {
                doc = new jsPDF({ unit: 'mm', format: [wMm, hMm], orientation, compress: true });
            } else {
                doc.addPage([wMm, hMm], orientation);
            }
            doc.addImage(img, 'JPEG', 0, 0, wMm, hMm);
        }

        return doc!.output('blob');
    } finally {
        window.document.body.removeChild(iframe);
    }
}
