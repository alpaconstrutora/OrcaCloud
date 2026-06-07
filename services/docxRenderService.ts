// Renderização de documentos .docx com marcadores {001}, {002}…
// Detecção: docxtemplater (normaliza marcadores quebrados entre "runs" do Word)
// Preenchimento: substituição direta no XML — evita MultiError de tokens internos do Word

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function toArrayBuffer(src: File | Blob | ArrayBuffer): Promise<ArrayBuffer> {
    if (src instanceof ArrayBuffer) return src;
    return await src.arrayBuffer();
}

/**
 * Detecta todos os marcadores presentes no .docx (ex.: 001, 002…).
 * Usa o parser do docxtemplater, que normaliza marcadores quebrados entre
 * "runs" do Word — algo que um regex no XML cru não capturaria de forma confiável.
 */
export async function detectTokens(src: File | Blob | ArrayBuffer): Promise<string[]> {
    const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([
        import('pizzip'),
        import('docxtemplater'),
    ]);
    const buf = await toArrayBuffer(src);
    const zip = new PizZip(buf);

    const seen = new Set<string>();

    // O construtor compila o template e pode lançar MultiError se o .docx contiver
    // chaves malformadas. Os callbacks do parser são chamados ANTES do lançamento,
    // então os marcadores válidos já estão em `seen` quando o erro sai.
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
        try { doc.render({}); } catch { /* tokens já coletados pelo parser */ }
    } catch { /* MultiError do construtor — tokens já coletados */ }

    return Array.from(seen)
        .filter(t => /^\w+$/.test(t))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Preenche o .docx substituindo cada marcador {token} pelo valor de `data`.
 * Substitui diretamente no XML para evitar MultiError causado por tokens internos
 * do Word (ex.: {CTVNu}, {STYLEREF}, etc.) que o docxtemplater não tolera.
 * Valores são escapados para XML antes da inserção.
 */
export async function fillDocx(
    src: File | Blob | ArrayBuffer,
    data: Record<string, string>,
): Promise<Blob> {
    const { default: PizZip } = await import('pizzip');
    const buf = await toArrayBuffer(src);
    const zip = new PizZip(buf);

    const escapeXml = (v: string) =>
        v.replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;');

    // Processa todos os XMLs de conteúdo (corpo, cabeçalho, rodapé, notas…)
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
 * Gera um PDF (Blob) a partir de um .docx já preenchido.
 * Caminho 100% no navegador: docx → HTML (mammoth) → PDF (jsPDF + html2canvas).
 */
export async function docxBlobToPdf(docx: Blob | ArrayBuffer): Promise<Blob> {
    const html = await docxToHtml(docx);
    const { jsPDF } = await import('jspdf');
    const { default: html2canvas } = await import('html2canvas');

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const container = window.document.createElement('div');
    container.style.cssText =
        'position:fixed;left:-9999px;top:0;width:794px;background:#fff;padding:48px;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#000';
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
            if (remaining > 0) {
                doc.addPage();
                y = 10 - (imgH - remaining);
            }
        }
    } finally {
        window.document.body.removeChild(container);
    }

    return doc.output('blob');
}
