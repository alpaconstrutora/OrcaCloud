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

/**
 * Gera um PDF a partir de um .docx já preenchido.
 * docx → HTML (mammoth) → PDF (jsPDF + html2canvas) — tudo no navegador.
 */
export async function docxBlobToPdf(docx: Blob | ArrayBuffer): Promise<Blob> {
    const html = await docxToHtml(docx);
    const { jsPDF } = await import('jspdf');
    const { default: html2canvas } = await import('html2canvas');

    const RENDER_WIDTH = 794; // ~ largura de A4 a 96dpi
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });

    // Container fora da tela, mas com posição/dimensões reais para o html2canvas
    // conseguir medir e pintar (left:-9999px com position:fixed costuma sair em branco).
    const container = window.document.createElement('div');
    container.style.cssText =
        `position:absolute;left:0;top:0;width:${RENDER_WIDTH}px;background:#ffffff;` +
        'padding:48px;box-sizing:border-box;z-index:-1;opacity:0;pointer-events:none;' +
        'font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#000';
    container.innerHTML = html && html.trim() ? html : '<p>(documento sem conteúdo)</p>';
    window.document.body.appendChild(container);

    try {
        // Garante que as fontes carregaram antes de tirar o "print"
        if (window.document.fonts?.ready) {
            try { await window.document.fonts.ready; } catch { /* ignore */ }
        }

        const canvas = await html2canvas(container, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            width: RENDER_WIDTH,
            windowWidth: RENDER_WIDTH,
        });

        if (!canvas.width || !canvas.height) {
            throw new Error('Não foi possível renderizar o conteúdo do documento.');
        }

        const margin = 10; // mm
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const usableW = pageW - margin * 2;
        const usableH = pageH - margin * 2;

        // px por mm na largura renderizada → altura de uma página em px do canvas
        const pxPerMm = canvas.width / usableW;
        const pageHpx = Math.floor(usableH * pxPerMm);

        let renderedHpx = 0;
        let pageIndex = 0;
        while (renderedHpx < canvas.height) {
            const sliceHpx = Math.min(pageHpx, canvas.height - renderedHpx);

            // Fatia esta página em um canvas próprio e adiciona como imagem.
            const pageCanvas = window.document.createElement('canvas');
            pageCanvas.width = canvas.width;
            pageCanvas.height = sliceHpx;
            const ctx = pageCanvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
                ctx.drawImage(
                    canvas,
                    0, renderedHpx, canvas.width, sliceHpx,
                    0, 0, canvas.width, sliceHpx,
                );
            }
            const img = pageCanvas.toDataURL('image/jpeg', 0.95);
            if (pageIndex > 0) doc.addPage();
            doc.addImage(img, 'JPEG', margin, margin, usableW, sliceHpx / pxPerMm);

            renderedHpx += sliceHpx;
            pageIndex += 1;
        }
    } finally {
        window.document.body.removeChild(container);
    }

    return doc.output('blob');
}
