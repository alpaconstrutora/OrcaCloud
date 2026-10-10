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
    addFonts?: (fonts: Record<string, Record<string, string>>) => void;
    vfs?: Record<string, string>;
}

type Variacao = 'normal' | 'bold' | 'italics' | 'bolditalics';

/**
 * Família do pdfmake para uma fonte da organização (F9): cada variação aponta
 * para o arquivo no vfs; a que não foi enviada usa a Regular (o pdfmake exige as
 * quatro). Itálico sem arquivo próprio cai no negrito-itálico só se não houver
 * itálico — nunca inventa estilo. Puro.
 */
export function familiaDaFonte(arquivos: Partial<Record<Variacao, string>> & { normal: string }): Record<Variacao, string> {
    return {
        normal: arquivos.normal,
        bold: arquivos.bold ?? arquivos.normal,
        italics: arquivos.italics ?? arquivos.normal,
        bolditalics: arquivos.bolditalics ?? arquivos.bold ?? arquivos.italics ?? arquivos.normal,
    };
}

const fontesRegistradas = new Set<string>();

/** Carrega (uma vez) os arquivos da fonte da organização no pdfmake, com o id como nome da família. */
async function registrarFonteDaOrganizacao(pdfMake: PdfMakeLike, fonteId: string): Promise<void> {
    if (fontesRegistradas.has(fonteId)) return;
    const { docGenFonteService } = await import('../docGenFonteService');
    const { fonte, base64 } = await docGenFonteService.arquivosEmBase64(fonteId);
    const vfs: Record<string, string> = {};
    const nomes: Partial<Record<Variacao, string>> & { normal: string } = { normal: '' };
    for (const [v, b64] of Object.entries(base64) as [Variacao, string][]) {
        const ext = (fonte.arquivos[v] ?? '').split('.').pop() || 'ttf';
        const nome = `${fonteId}-${v}.${ext}`;
        vfs[nome] = b64;
        nomes[v] = nome;
    }
    if (!nomes.normal) throw new Error(`A fonte "${fonte.nome}" está sem o arquivo Regular.`);
    pdfMake.addVirtualFileSystem?.(vfs);
    pdfMake.addFonts?.({ [fonteId]: familiaDaFonte(nomes) });
    fontesRegistradas.add(fonteId);
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

/**
 * Perfil de arquivamento de TODO PDF do motor (pedido de 10/10: PDF/A).
 * PDF/A-2b (ISO 19005-2, conformidade básica): fontes embutidas, perfil de cor
 * sRGB (o PDFKit embute o ICC), metadados XMP com a identificação pdfaid — e,
 * ao contrário do 1b, admite a transparência do logo e da assinatura em PNG.
 * A versão 1.7 é a base do PDF/A-2 (e a 1.3 padrão do pdfmake não tem SMask).
 */
export const PERFIL_PDFA = 'PDF/A-2b';

/** Acrescenta ao docDefinition o que torna o PDF estável entre gerações — e PDF/A. */
export function comMetadadosFixos(def: TDocumentDefinitions, opts: OpcoesPdf): TDocumentDefinitions {
    return {
        ...def,
        // Campos do pdfmake 0.3 que os tipos (@types/pdfmake) ainda não declaram.
        ...({ version: '1.7', subset: PERFIL_PDFA, language: 'pt-BR', displayTitle: true } as Partial<TDocumentDefinitions>),
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
    // F9: modelo com fonte da organização — o PDF embute os arquivos dela.
    const familia = (def.defaultStyle as { font?: string } | undefined)?.font;
    if (familia && familia !== 'Roboto') await registrarFonteDaOrganizacao(pdfMake, familia);
    return pdfMake.createPdf(comMetadadosFixos(def, opts)).getBlob();
}

/** SHA-256 em hexadecimal de um Blob (o hash que o GED vai guardar — F3). */
export async function sha256DoBlob(blob: Blob): Promise<string> {
    const buf = await blob.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
