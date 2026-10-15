/**
 * Abrir o PDF de um boleto no servidor, com as senhas cadastradas nos
 * remetentes monitorados (15/10/2026 — plano S4).
 *
 * Concessionárias (o 1º caso foi a Energisa, "Reaviso Digital") mandam a conta
 * em PDF criptografado. Ordem das tentativas: sem senha → a do remetente que
 * casou com a mensagem → as dos outros remetentes da mesma caixa (a Energisa
 * manda cobrança de um endereço e reaviso de outro domínio, com a mesma senha).
 */
// @ts-ignore — pacote npm sem tipos no Deno
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";
import { ehErroDeSenha } from "../../../utils/boletoTexto.ts";

export interface PdfAberto {
    texto: string;
    paginas: number;
    /** O PDF pede senha. */
    protegido: boolean;
    /** Protegido, e nenhuma das senhas abriu. */
    semSenhaCerta: boolean;
}

async function tentar(bytes: Uint8Array, senha?: string): Promise<{ texto: string; paginas: number }> {
    // Cópia a cada tentativa: o pdf.js pode transferir (e esvaziar) o buffer.
    const pdf = await getDocumentProxy(new Uint8Array(bytes), senha ? { password: senha } : {});
    const r = await extractText(pdf, { mergePages: true });
    return { texto: String(r.text ?? ''), paginas: Number(r.totalPages ?? 0) };
}

export async function abrirPdf(bytes: Uint8Array, senhas: string[]): Promise<PdfAberto> {
    try {
        return { ...(await tentar(bytes)), protegido: false, semSenhaCerta: false };
    } catch (e) {
        if (!ehErroDeSenha(e)) {
            console.warn('[email-capture-sync] PDF ilegível', (e as Error)?.message);
            return { texto: '', paginas: 0, protegido: false, semSenhaCerta: false };
        }
    }
    for (const senha of [...new Set(senhas.filter(Boolean))]) {
        try {
            return { ...(await tentar(bytes, senha)), protegido: true, semSenhaCerta: false };
        } catch (e) {
            if (!ehErroDeSenha(e)) break;
        }
    }
    return { texto: '', paginas: 0, protegido: true, semSenhaCerta: true };
}

/** Senhas na ordem de tentativa: a do remetente casado primeiro, depois as demais da caixa. */
export function ordemDasSenhas(remetenteId: string | null, senhas: Map<string, string>): string[] {
    const primeira = remetenteId ? senhas.get(remetenteId) : undefined;
    return [...(primeira ? [primeira] : []), ...[...senhas.entries()].filter(([id]) => id !== remetenteId).map(([, s]) => s)];
}
