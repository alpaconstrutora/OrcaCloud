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

/**
 * Preenche o .docx com os valores de `data`.
 *
 * Estratégia 1 (preferida): docxtemplater com parser customizado — resolve tokens
 * quebrados entre múltiplos "runs" do Word. Tolerante a tags internas do Word
 * ({CTVNu} etc.) graças ao nullGetter + parser que nunca lança.
 *
 * Estratégia 2 (fallback): substituição direta no XML — funciona quando o token
 * está em um único run (caso comum), não depende de docxtemplater.
 */
export async function fillDocx(
    src: File | Blob | ArrayBuffer,
    data: Record<string, string>,
): Promise<Blob> {
    const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([
        import('pizzip'),
        import('docxtemplater'),
    ]);
    const buf = await toArrayBuffer(src);

    const escapeXml = (v: string) =>
        v.replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;');

    // ── Estratégia 1: docxtemplater ──────────────────────────────────────────
    try {
        const zip = new PizZip(buf);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const DXT = Docxtemplater as any;
        const doc = new DXT(zip, {
            delimiters: { start: '{', end: '}' },
            nullGetter: () => '',
            // Parser customizado: nunca lança para nenhuma tag —
            // retorna o valor do data ou string vazia.
            parser: (tag: string) => ({ get: () => data[tag.trim()] ?? '' }),
        });
        // render pode lançar MultiError por chaves sem par no documento (ex.: 100 { itens}).
        // Mesmo assim, tenta gerar o zip — em geral as substituições já foram feitas.
        try { doc.render(data); } catch { /* ignorar — gerar mesmo assim */ }
        return doc.getZip().generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
    } catch {
        // Se o próprio construtor falhou (zip inválido ou outro erro grave),
        // cai na estratégia 2.
    }

    // ── Estratégia 2: substituição direta no XML ─────────────────────────────
    const zip = new PizZip(buf);
    const xmlEntries = Object.keys(zip.files).filter(
        f => f.startsWith('word/') && f.endsWith('.xml') && !zip.files[f].dir,
    );
    for (const fileName of xmlEntries) {
        let content = zip.files[fileName].asText();
        for (const [token, value] of Object.entries(data)) {
            content = content.split(`{${token}}`).join(escapeXml(value ?? ''));
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

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const container = window.document.createElement('div');
    container.style.cssText =
        'position:fixed;left:-9999px;top:0;width:794px;background:#fff;padding:48px;' +
        'font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#000';
    container.innerHTML = html;
    window.document.body.appendChild(container);

    try {
        const canvas = await html2canvas(container, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const imgW = pageW - 20;
        const imgH = (canvas.height * imgW) / canvas.width;
        let y = 10;
        let remaining = imgH;
        while (remaining > 0) {
            doc.addImage(imgData, 'JPEG', 10, y, imgW, imgH);
            remaining -= pageH - 20;
            if (remaining > 0) { doc.addPage(); y = 10 - (imgH - remaining); }
        }
    } finally {
        window.document.body.removeChild(container);
    }

    return doc.output('blob');
}
