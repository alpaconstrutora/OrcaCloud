import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

/**
 * Assinatura eletrônica interna, sem certificado — o lado do navegador da Edge
 * `assinatura-interna` (docs/planos/2026-11-21-assinatura-eletronica-interna.md).
 *
 * Nenhuma chamada manda organização: a Edge tira a org da linha do documento
 * (envio) ou do envelope (signatário), e o banco confere a credencial.
 */

export type CanalAssinatura = 'PORTAL_CLIENTE' | 'MEMBRO' | 'PORTAL_CORRETOR' | 'LINK';
export type PapelAssinatura = 'PARTE' | 'REPRESENTANTE' | 'TESTEMUNHA' | 'CORRETOR';
export type SituacaoEnvelope = 'ENVIADO' | 'FINALIZANDO' | 'CONCLUIDO' | 'CANCELADO' | 'EXPIRADO';

export const ROTULO_PAPEL: Record<PapelAssinatura, string> = {
    PARTE: 'Parte',
    REPRESENTANTE: 'Representante da empresa',
    TESTEMUNHA: 'Testemunha',
    CORRETOR: 'Corretor',
};

export const ROTULO_SITUACAO: Record<SituacaoEnvelope, string> = {
    ENVIADO: 'Aguardando assinaturas',
    FINALIZANDO: 'Finalizando',
    CONCLUIDO: 'Assinado por todos',
    CANCELADO: 'Cancelado',
    EXPIRADO: 'Prazo vencido',
};

/** Quem chama age como um signatário: o canal e a credencial dele. */
export interface AcessoDoSignatario {
    signatarioId: string;
    canal: CanalAssinatura;
    /** Token do portal (cliente/corretor) ou do link (testemunha). Membro: null (vai o JWT). */
    credencial: string | null;
}

export interface DocumentoParaAssinar {
    envelope_id: string;
    titulo: string;
    status: SituacaoEnvelope;
    expira_em: string;
    original_sha256: string;
    paginas: number | null;
    emitente: string | null;
    signatario: {
        id: string;
        nome: string;
        papel: PapelAssinatura;
        representa: string | null;
        status: 'PENDENTE' | 'ASSINADO';
        assinado_em: string | null;
        email_mascarado: string;
    };
    signatarios: { nome: string; papel: PapelAssinatura; status: 'PENDENTE' | 'ASSINADO'; assinado_em: string | null }[];
}

export interface VisaoParaAssinar {
    documento: DocumentoParaAssinar;
    /** URL assinada do PDF (5 min): original enquanto em andamento, o assinado quando concluído. */
    url: string | null;
    termo: string;
    termo_versao: string;
}

export interface ResultadoDaAssinatura { concluido: boolean; faltam: number }

/** Erro da Edge com a mensagem que ela escreveu (e se convém pedir um código novo). */
export class ErroDeAssinatura extends Error {
    constructor(mensagem: string, readonly status: number, readonly pedirCodigo = false) {
        super(mensagem);
    }
}

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke('assinatura-interna', { body: corpo });
    if (!error) return data as T;
    let mensagem = 'Não foi possível concluir agora. Tente de novo.';
    let status = 0;
    let pedirCodigo = false;
    if (error instanceof FunctionsHttpError) {
        status = error.context.status;
        try {
            const j = (await error.context.json()) as { error?: string; pedir_codigo?: boolean };
            if (j.error) mensagem = j.error;
            pedirCodigo = !!j.pedir_codigo;
        } catch {
            // corpo não era JSON: fica a mensagem genérica
        }
    }
    throw new ErroDeAssinatura(mensagem, status, pedirCodigo);
}

const doAcesso = (a: AcessoDoSignatario) => ({ signatario_id: a.signatarioId, canal: a.canal, credencial: a.credencial });

export const assinaturaInternaService = {
    ver(a: AcessoDoSignatario): Promise<VisaoParaAssinar> {
        return chamar({ acao: 'ver', ...doAcesso(a) });
    },
    pedirCodigo(a: AcessoDoSignatario): Promise<{ email_mascarado: string }> {
        return chamar({ acao: 'pedir_codigo', ...doAcesso(a) });
    },
    assinar(a: AcessoDoSignatario, p: { codigo: string; cpf: string; termoVersao: string }): Promise<ResultadoDaAssinatura> {
        return chamar({ acao: 'assinar', ...doAcesso(a), codigo: p.codigo, cpf: p.cpf, aceite: true, termo_versao: p.termoVersao });
    },
};

// ── Leitura dos portais (RPC por token, como o resto do portal) ─────────────

export interface ItemDeAssinaturaDoPortal {
    signatario_id: string;
    envelope_id: string;
    titulo: string;
    papel: PapelAssinatura;
    representa: string | null;
    minha_situacao: 'PENDENTE' | 'ASSINADO';
    situacao: SituacaoEnvelope;
    enviado_em: string;
    expira_em: string;
    assinado_em: string | null;
    concluido_em: string | null;
    emitente: string | null;
}

/** Está esperando a assinatura DESTA pessoa (envelope aberto, no prazo, ela não assinou). */
export const aguardaMinhaAssinatura = (i: Pick<ItemDeAssinaturaDoPortal, 'minha_situacao' | 'situacao'>) =>
    i.minha_situacao === 'PENDENTE' && i.situacao === 'ENVIADO';

export async function assinaturasDoPortal(portal: 'cliente' | 'corretor', token: string): Promise<ItemDeAssinaturaDoPortal[]> {
    const rpc = portal === 'cliente' ? 'fn_portal_assinaturas' : 'fn_broker_portal_assinaturas';
    const { data, error } = await supabase.rpc(rpc, { p_token: token });
    if (error) throw error;
    const r = data as { valid: boolean; itens?: ItemDeAssinaturaDoPortal[] } | null;
    return r?.valid ? (r.itens ?? []) : [];
}

/** O signatário que o e-mail mandou abrir (`?assinar=<id>`), se houver. */
export function signatarioDaUrl(search: string = typeof window !== 'undefined' ? window.location.search : ''): string | null {
    const id = new URLSearchParams(search).get('assinar');
    return id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

/** Tira `assinar` da barra de endereço (o resto da URL — inclusive `token` — fica). */
export function esquecerSignatarioDaUrl(): void {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('assinar')) return;
    url.searchParams.delete('assinar');
    window.history.replaceState(window.history.state, '', url.pathname + (url.search ? url.search : '') + url.hash);
}

/** `#s=<signatário>&t=<token>` da página pública da testemunha. */
export function acessoDoLinkDaTestemunha(hash: string): { signatarioId: string; token: string } | null {
    const p = new URLSearchParams(hash.replace(/^#/, ''));
    const s = p.get('s');
    const t = p.get('t');
    if (!s || !t || !/^[0-9a-f-]{36}$/i.test(s)) return null;
    return { signatarioId: s, token: t };
}

// ── Validação pública (destino do QR) ───────────────────────────────────────

export interface ValidacaoDeAssinatura {
    encontrado: boolean;
    titulo?: string;
    emitente?: string | null;
    situacao?: SituacaoEnvelope;
    enviado_em?: string;
    concluido_em?: string | null;
    paginas?: number | null;
    original_sha256?: string;
    final_sha256?: string | null;
    signatarios?: { nome: string; papel: PapelAssinatura; representa: string | null; cpf: string; situacao: 'PENDENTE' | 'ASSINADO'; assinado_em: string | null }[];
}

export async function validarAssinaturaPublica(envelopeId: string): Promise<ValidacaoDeAssinatura> {
    const { data, error } = await supabase.rpc('assinatura_validar', { p_envelope: envelopeId });
    if (error) throw error;
    return (data ?? { encontrado: false }) as ValidacaoDeAssinatura;
}
