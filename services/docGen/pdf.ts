import type { TDocumentDefinitions } from 'pdfmake/interfaces';

/**
 * docDefinition → PDF (Blob), no navegador, com pdfmake carregado sob demanda
 * (`import()`): o bundle do pdfmake com as fontes passa de 1 MB e só quem abre
 * uma prévia ou emite um documento paga por ele.
 *
 * Determinismo: `info.creationDate`/`modDate` fixas em `criadoEm`. O PDFKit
 * deriva o `/ID` do arquivo das informações do documento (CreationDate
 * inclusa) — então o mesmo registro gera os mesmos bytes, como o recibo
 * (`utils/reciboRecebimento.ts`). O teste em node confere isso pelo printer
 * do pdfmake, que usa o mesmo núcleo.
 */
export interface OpcoesPdf {
    /** Identidade do documento gravado — entra nos metadados (`subject`). */
    id: string;
    /** Data fixa de criação; sem ela o PDF muda a cada geração. */
    criadoEm: Date;
}

let carregando: Promise<PdfMakeLike> | null = null;

interface PdfMakeLike {
    createPdf: (def: TDocumentDefinitions) => { getBlob: () => Promise<Blob> };
    addVirtualFileSystem?: (vfs: Record<string, string>) => void;
    vfs?: Record<string, string>;
}

async function carregarPdfMake(): Promise<PdfMakeLike> {
    if (!carregando) {
        carregando = (async () => {
            const [modPdf, modVfs] = await Promise.all([
                import('pdfmake/build/pdfmake'),
                import('pdfmake/build/vfs_fonts'),
            ]);
            const pdfMake = ((modPdf as unknown as { default?: PdfMakeLike }).default ?? (modPdf as unknown as PdfMakeLike));
            const vfs = ((modVfs as unknown as { default?: Record<string, string> }).default ?? (modVfs as unknown as Record<string, string>));
            if (typeof pdfMake.addVirtualFileSystem === 'function') pdfMake.addVirtualFileSystem(vfs);
            else pdfMake.vfs = vfs;
            return pdfMake;
        })();
    }
    return carregando;
}

/** Acrescenta ao docDefinition o que torna o PDF estável entre gerações. */
export function comMetadadosFixos(def: TDocumentDefinitions, opts: OpcoesPdf): TDocumentDefinitions {
    return {
        ...def,
        info: {
            ...(def.info ?? {}),
            subject: opts.id,
            creationDate: opts.criadoEm,
            modDate: opts.criadoEm,
        } as TDocumentDefinitions['info'],
    };
}

export async function gerarPdfBlob(def: TDocumentDefinitions, opts: OpcoesPdf): Promise<Blob> {
    const pdfMake = await carregarPdfMake();
    return pdfMake.createPdf(comMetadadosFixos(def, opts)).getBlob();
}

/** SHA-256 em hexadecimal de um Blob (o hash que o GED vai guardar — F3). */
export async function sha256DoBlob(blob: Blob): Promise<string> {
    const buf = await blob.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
