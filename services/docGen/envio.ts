import { supabase } from '../../lib/supabase';
import type { DocGenDocumento } from '../../types/docGen';

/**
 * Envio e validação do ofício (F5). Plano: docs/planos/2026-10-07-gerador-de-oficios.md.
 *
 *   - e-mail: Edge Function `doc-gen-enviar` (PDF oficial em anexo, Resend);
 *   - WhatsApp: só o link `wa.me` com o texto — sem provedor; o usuário confirma
 *     que mandou e o envio é registrado;
 *   - validação pública: `/publico/validar-documento/<id>` (destino do QR do PDF),
 *     RPC `doc_gen_validar` (anon, sem caminho do arquivo).
 */

/** Endereço da validação pública do documento (vai no QR e no e-mail). */
export function urlDeValidacao(documentoId: string, origem: string = typeof window !== 'undefined' ? window.location.origin : ''): string {
    return `${origem.replace(/\/+$/, '')}/publico/validar-documento/${documentoId}`;
}

/** Só os dígitos, com DDI 55 quando o número é brasileiro sem DDI. Puro. */
export function telefoneWhatsApp(telefone: string | null | undefined): string {
    const d = (telefone ?? '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 10 || d.length === 11) return `55${d}`;
    return d;
}

/** Link `wa.me` com o texto pronto. Puro. */
export function linkWhatsApp(telefone: string | null | undefined, texto: string): string {
    const numero = telefoneWhatsApp(telefone);
    return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

/** Texto padrão do envio (e-mail e WhatsApp). Puro. */
export function textoPadraoDeEnvio(doc: Pick<DocGenDocumento, 'numero' | 'assunto' | 'destinatario_snapshot'>, emitente: string): string {
    const saudacao = doc.destinatario_snapshot?.contato_nome ? `Prezado(a) ${doc.destinatario_snapshot.contato_nome},` : 'Prezados,';
    return `${saudacao}\n\nEncaminhamos o Ofício nº ${doc.numero ?? ''} — ${doc.assunto}.\n\nAtenciosamente,\n${emitente}`.trim();
}

/** "a@x.com; b@y.com, c@z.com" → lista. Puro. */
export function listaDeEmails(texto: string): string[] {
    return texto.split(/[;,\s]+/).map(s => s.trim()).filter(Boolean);
}

export interface ResultadoEnvio { enviado: boolean; registrado: boolean; erro_registro?: string }

export async function enviarPorEmail(p: { documentoId: string; para: string[]; cc: string[]; mensagem: string; incluirAnexos: boolean }): Promise<ResultadoEnvio> {
    const { data, error } = await supabase.functions.invoke('doc-gen-enviar', {
        body: { documento_id: p.documentoId, para: p.para, cc: p.cc, mensagem: p.mensagem, incluir_anexos: p.incluirAnexos },
    });
    if (error) {
        // A function devolve { error } com o motivo; o invoke embrulha em FunctionsHttpError.
        let motivo = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
            const corpo = await ctx.json().catch(() => null) as { error?: string } | null;
            if (corpo?.error) motivo = corpo.error;
        }
        throw new Error(motivo || 'Falha ao enviar o e-mail.');
    }
    const r = data as ResultadoEnvio & { error?: string };
    if (r?.error) throw new Error(r.error);
    return r;
}

/** Envio feito fora do sistema (WhatsApp, em mãos…) — vai para o histórico; o 1º leva a ENVIADO. */
export async function registrarEnvio(documentoId: string, dados: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('doc_gen_registrar_envio', { p_documento_id: documentoId, p_dados: dados });
    if (error) throw new Error(error.message || 'Não foi possível registrar o envio.');
    return String(data);
}

export interface ValidacaoPublica {
    encontrado: boolean;
    tipo?: string;
    numero?: string;
    situacao?: string;
    emitente?: string | null;
    destinatario?: string | null;
    data?: string | null;
    emitido_em?: string | null;
    sha256?: string | null;
}

export async function validarDocumentoPublico(documentoId: string): Promise<ValidacaoPublica> {
    const { data, error } = await supabase.rpc('doc_gen_validar', { p_documento_id: documentoId });
    if (error) throw error;
    return (data ?? { encontrado: false }) as ValidacaoPublica;
}

/** SHA-256 de um arquivo escolhido pelo visitante — no navegador; o arquivo não sai da máquina. */
export async function sha256DeArquivo(arquivo: Blob): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', await arquivo.arrayBuffer());
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
