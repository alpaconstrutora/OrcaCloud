/**
 * Lógica pura da sincronização da caixa (sem rede, sem banco) — testada no
 * Vitest (__tests__/emailCaptureSyncLogica.test.ts). Plano:
 * docs/planos/2026-10-15-captura-boletos-por-email.md, item 3.2.
 */
import { sanitizeFileName } from '../../../utils/storageUtils.ts';

/** Nó do BODYSTRUCTURE como o imapflow entrega. */
export interface ParteDaMensagem {
    part?: string;
    type?: string;
    parameters?: Record<string, string>;
    disposition?: string;
    dispositionParameters?: Record<string, string>;
    size?: number;
    childNodes?: ParteDaMensagem[];
}

export interface AnexoPdf {
    /** Identificador da parte para `client.download(uid, parte)`. */
    parte: string;
    nome: string;
    tamanho: number;
    /** Posição entre os PDFs da mensagem (0, 1, …) — chave de idempotência. */
    indice: number;
}

/** Teto de um anexo. Boleto tem dezenas a centenas de KB; 10 MB é folga. */
export const LIMITE_PDF_BYTES = 10 * 1024 * 1024;

function nomeDaParte(p: ParteDaMensagem): string {
    return (p.dispositionParameters?.filename ?? p.parameters?.name ?? '').trim();
}

function ehPdf(p: ParteDaMensagem): boolean {
    const tipo = (p.type ?? '').toLowerCase();
    if (tipo === 'application/pdf' || tipo === 'application/x-pdf') return true;
    // Muitos sistemas de cobrança mandam o PDF como octet-stream.
    return /\.pdf$/i.test(nomeDaParte(p)) && !tipo.startsWith('multipart/') && !tipo.startsWith('text/');
}

/**
 * Todos os PDFs da mensagem, em ordem, descendo em multipart aninhado
 * (multipart/mixed › multipart/alternative › …). Mensagem de parte única
 * (o próprio corpo é o PDF) tem parte "1".
 */
export function encontrarPdfs(raiz: ParteDaMensagem | null | undefined): AnexoPdf[] {
    const achados: Omit<AnexoPdf, 'indice'>[] = [];
    const visitar = (no: ParteDaMensagem, ehRaiz: boolean) => {
        if (no.childNodes?.length) {
            no.childNodes.forEach(f => visitar(f, false));
            return;
        }
        if (!ehPdf(no)) return;
        const parte = no.part ?? (ehRaiz ? '1' : '');
        if (!parte) return;
        achados.push({ parte, nome: nomeDaParte(no) || `anexo-${parte}.pdf`, tamanho: no.size ?? 0 });
    };
    if (raiz) visitar(raiz, true);
    return achados.map((a, indice) => ({ ...a, indice }));
}

/**
 * Valores de um cabeçalho, NA ORDEM da mensagem (o primeiro é o do servidor
 * que entregou por último). Desdobra continuação de linha (RFC 5322 folding).
 */
export function valoresDoCabecalho(bruto: string | Uint8Array | null | undefined, nome: string): string[] {
    if (!bruto) return [];
    const texto = typeof bruto === 'string' ? bruto : new TextDecoder().decode(bruto);
    const desdobrado = texto.replace(/\r?\n[ \t]+/g, ' ');
    const alvo = nome.toLowerCase() + ':';
    return desdobrado
        .split(/\r?\n/)
        .filter(l => l.toLowerCase().startsWith(alvo))
        .map(l => l.slice(alvo.length).trim());
}

/** Mesmo formato de caminho do upload manual (`boletoService.uploadBoleto`). */
export function caminhoNoStorage(organizationId: string, nomeArquivo: string, agora = new Date()): string {
    return `${organizationId}/${agora.getFullYear()}/${agora.getTime()}_${sanitizeFileName(nomeArquivo)}`;
}

/** Faixa de busca IMAP: depois do último UID visto, desde a data inicial. */
export function criterioDeBusca(lastUid: number | null, dataInicial: string): { uid: string; since: Date } {
    return { uid: `${(lastUid ?? 0) + 1}:*`, since: new Date(`${dataInicial}T00:00:00Z`) };
}

/**
 * "n:*" no IMAP devolve ao menos a ÚLTIMA mensagem mesmo que o UID dela seja
 * menor que n (RFC 3501 §6.4.8) — sem este filtro a última mensagem seria
 * reprocessada a cada execução.
 */
export function uidsNovos(uids: number[], lastUid: number | null): number[] {
    const piso = lastUid ?? 0;
    return [...new Set(uids)].filter(u => u > piso).sort((a, b) => a - b);
}

export function hexDoHash(buf: ArrayBuffer): string {
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
