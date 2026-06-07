// Renderização de documentos .docx com marcadores de chave única {001}, {002}…
// Usa docxtemplater (delimitadores nativos { }) para fidelidade total no Word
// e mammoth + jsPDF para um PDF de conveniência gerado no navegador.

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
    const doc = new Docxtemplater(zip, {
        delimiters: { start: '{', end: '}' },
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => '',
        parser: (tag: string) => {
            seen.add(tag.trim());
            return { get: () => '' };
        },
    });

    try {
        doc.render({});
    } catch {
        // Mesmo com erro de render, os marcadores já foram coletados pelo parser.
    }

    return Array.from(seen)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Preenche o .docx substituindo cada marcador pelo valor de `data`.
 * Marcadores sem valor viram string vazia. Retorna um Blob .docx.
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
    const zip = new PizZip(buf);

    const doc = new Docxtemplater(zip, {
        delimiters: { start: '{', end: '}' },
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => '',
    });

    doc.render(data);

    return doc.getZip().generate({
        type: 'blob',
        mimeType: DOCX_MIME,
        compression: 'DEFLATE',
    });
}

/** Converte um .docx (Blob) em HTML usando mammoth. */
export async function docxToHtml(docx: Blob | ArrayBuffer): Promise<string> {
    const mammoth: any = await import('mammoth');
    const arrayBuffer = await toArrayBuffer(docx);
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return result.value as string;
}

/**
 * Gera um PDF (Blob) a partir de um .docx já preenchido.
 * Caminho 100% no navegador: docx → HTML (mammoth) → PDF (jsPDF + html2canvas).
 * A fidelidade é boa para texto/parágrafos; layouts muito ricos do Word podem
 * simplificar — nesses casos use o .docx preenchido.
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
