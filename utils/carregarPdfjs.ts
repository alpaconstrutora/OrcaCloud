/** pdf.js sob demanda (não pesa no bundle inicial), com o worker local do Vite —
 *  evita violação de CSP com CDN externo. Usado pela leitura de boleto e pela
 *  transcrição de documentos. */
export async function carregarPdfjs(): Promise<any> {
    const pdfjs: any = await import('pdfjs-dist');
    if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url,
        ).toString();
    }
    return pdfjs;
}
