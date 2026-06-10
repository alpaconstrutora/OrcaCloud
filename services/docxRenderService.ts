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

    // iframe com tamanho REAL antes de renderizar — docx-preview precisa medir
    // layout para paginar; um iframe de 10px produzia páginas vazias.
    const iframe = window.document.createElement('iframe');
    iframe.style.cssText =
        'position:fixed;left:-10000px;top:0;width:900px;height:1200px;' +
        'border:0;background:#fff;z-index:-1';
    window.document.body.appendChild(iframe);

    try {
        const idoc = iframe.contentDocument!;
        idoc.open();
        idoc.write('<!doctype html><html><head><meta charset="utf-8">' +
            '<style>html,body{margin:0;padding:0;background:#fff}</style></head><body></body></html>');
        idoc.close();

        // styleContainer = idoc.head: o html2canvas só aplica folhas de estilo do
        // <head> ao clonar; se ficarem no <body>, o conteúdo é capturado sem estilo.
        // inWrapper:true: usa o layout nativo do docx-preview, que é quem dá o
        // tamanho REAL a cada página (<section>). Sem o wrapper as seções colapsavam
        // para 0×0 e o canvas/slice saía vazio (toDataURL='data:,').
        await docxPreview.renderAsync(buf, idoc.body, idoc.head, {
            className: 'docx',
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            breakPages: true,
            // honra as marcas de quebra de página do Word (quando existirem),
            // ajudando a paginar em vez de uma única seção gigante
            ignoreLastRenderedPageBreak: false,
            renderHeaders: true,
            renderFooters: true,
            useBase64URL: true,
        });

        const reset = idoc.createElement('style');
        reset.textContent =
            '.docx-wrapper{background:#fff !important;padding:0 !important}' +
            'section.docx{margin:0 !important;box-shadow:none !important}';
        idoc.head.appendChild(reset);

        try { await idoc.fonts?.ready; } catch { /* ignore */ }
        // Deixa o layout assentar (duas RAFs) antes de capturar.
        await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

        const pages = Array.from(idoc.querySelectorAll<HTMLElement>('section.docx'));
        if (pages.length === 0) {
            throw new Error('Não foi possível renderizar as páginas do documento.');
        }
        iframe.style.width = `${idoc.documentElement.scrollWidth}px`;
        iframe.style.height = `${idoc.documentElement.scrollHeight}px`;

        const SCALE = 2;
        const A4_RATIO = 297 / 210;           // altura/largura de uma folha A4
        const MAX_CHUNK_PX = 14000;           // conteúdo por captura (×SCALE fica < 32767)
        let doc: import('jspdf').jsPDF | null = null;
        let added = 0;
        const diag: string[] = [];

        // Estratégia: poucas capturas grandes + fatiamento em memória.
        // Cada html2canvas re-renderiza o documento inteiro, então chamá-lo 30×
        // (uma por folha A4) é lento. Capturamos em blocos altos (~14000px, abaixo
        // do limite de canvas do navegador) e depois recortamos cada bloco em
        // páginas A4 com drawImage (barato), reduzindo de ~30 para ~3 capturas.
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            const w = page.offsetWidth;
            const totalH = page.offsetHeight;
            if (w < 1 || totalH < 1) { diag.push(`p${i + 1}:vazia ${w}x${totalH}`); continue; }

            const wMm = w * PX_TO_MM;
            const pageHpx = Math.max(200, Math.floor(w * A4_RATIO)); // altura de 1 folha A4
            const wScaled = Math.round(w * SCALE);

            for (let chunkTop = 0; chunkTop < totalH; chunkTop += MAX_CHUNK_PX) {
                const chunkH = Math.min(MAX_CHUNK_PX, totalH - chunkTop);
                let big: HTMLCanvasElement;
                try {
                    big = await html2canvas(page, {
                        scale: SCALE,
                        useCORS: true,
                        backgroundColor: '#ffffff',
                        logging: false,        // evita o despejo de centenas de linhas no console
                        x: 0,
                        y: chunkTop,
                        width: w,
                        height: chunkH,
                        windowWidth: w,
                        windowHeight: totalH,
                        scrollX: 0,
                        scrollY: 0,
                    });
                } catch (e) {
                    diag.push(`p${i + 1}@${chunkTop}:err ${e instanceof Error ? e.message : String(e)}`);
                    continue;
                }
                if (!big.width || !big.height) { diag.push(`p${i + 1}@${chunkTop}:cv0`); continue; }

                // Recorta o bloco em páginas A4 (drawImage em memória — rápido).
                for (let off = 0; off < chunkH; off += pageHpx) {
                    const sliceH = Math.min(pageHpx, chunkH - off);
                    const sliceCanvas = window.document.createElement('canvas');
                    sliceCanvas.width = wScaled;
                    sliceCanvas.height = Math.round(sliceH * SCALE);
                    const ctx = sliceCanvas.getContext('2d');
                    if (!ctx) continue;
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
                    ctx.drawImage(
                        big,
                        0, Math.round(off * SCALE), wScaled, sliceCanvas.height,
                        0, 0, wScaled, sliceCanvas.height,
                    );
                    const img = sliceCanvas.toDataURL('image/jpeg', 0.9);
                    if (!img || img === 'data:,') { diag.push(`p${i + 1}@${chunkTop}+${off}:img0`); continue; }

                    const hMm = sliceH * PX_TO_MM;
                    const orientation = wMm > hMm ? 'l' : 'p';
                    if (!doc) doc = new jsPDF({ unit: 'mm', format: [wMm, hMm], orientation, compress: true });
                    else doc.addPage([wMm, hMm], orientation);
                    doc.addImage(img, 'JPEG', 0, 0, wMm, hMm);
                    added++;
                }
            }
        }

        if (!doc || added === 0) {
            throw new Error('PDF sem conteúdo. Diagnóstico → ' + diag.slice(0, 6).join('  ||  '));
        }
        return doc.output('blob');
    } finally {
        window.document.body.removeChild(iframe);
    }
}
