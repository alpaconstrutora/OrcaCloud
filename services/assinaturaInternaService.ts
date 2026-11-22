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

// ── Lado de quem ENVIA (membro da organização dona do documento) ───────────

export type OrigemDaAssinatura = { tipo: 'CDV' | 'DEAL_DOC'; id: string };

export type SignatarioParaEnviar =
    | { canal: 'PORTAL_CLIENTE'; client_id: string }
    | { canal: 'MEMBRO'; user_id: string; cpf?: string }
    | { canal: 'PORTAL_CORRETOR'; broker_id: string }
    | { canal: 'LINK'; nome: string; email: string; cpf: string };

export interface ResultadoDoEnvio {
    envelope_id: string;
    signatarios: { id: string; nome: string; papel: PapelAssinatura; canal: CanalAssinatura; email_enviado: boolean; erro?: string }[];
}

export interface SignatarioDoEnvelope {
    id: string;
    ordem: number;
    papel: PapelAssinatura;
    canal: CanalAssinatura;
    user_id: string | null;
    nome: string;
    representa: string | null;
    email: string;
    status: 'PENDENTE' | 'ASSINADO';
    visualizou_em: string | null;
    assinado_em: string | null;
}

export interface EnvelopeDeAssinatura {
    id: string;
    titulo: string;
    status: SituacaoEnvelope;
    expira_em: string;
    criado_em: string;
    concluido_em: string | null;
    motivo: string | null;
    assinatura_signatarios: SignatarioDoEnvelope[];
}

/** Situação que a tela mostra: ENVIADO com prazo vencido já é "vencido" (o banco marca no próximo toque). */
export const situacaoEfetiva = (e: Pick<EnvelopeDeAssinatura, 'status' | 'expira_em'>): SituacaoEnvelope =>
    e.status === 'ENVIADO' && new Date(e.expira_em).getTime() < Date.now() ? 'EXPIRADO' : e.status;

export const envioDeAssinaturaService = {
    criar(origem: OrigemDaAssinatura, signatarios: SignatarioParaEnviar[], titulo?: string): Promise<ResultadoDoEnvio> {
        return chamar({ acao: 'criar', origem_tipo: origem.tipo, origem_id: origem.id, titulo: titulo || null, signatarios });
    },
    cancelar(envelopeId: string, motivo?: string): Promise<{ ok: boolean; status: SituacaoEnvelope }> {
        return chamar({ acao: 'cancelar', envelope_id: envelopeId, motivo: motivo || null });
    },
    finalizar(envelopeId: string): Promise<{ ok: boolean }> {
        return chamar({ acao: 'finalizar', envelope_id: envelopeId });
    },
    /** Envelopes de um documento, o mais recente primeiro (RLS: membro da org). */
    async listar(origem: OrigemDaAssinatura): Promise<EnvelopeDeAssinatura[]> {
        const { data, error } = await supabase
            .from('assinatura_envelopes')
            .select('id, titulo, status, expira_em, criado_em, concluido_em, motivo, assinatura_signatarios(id, ordem, papel, canal, user_id, nome, representa, email, status, visualizou_em, assinado_em)')
            .eq('origem_tipo', origem.tipo)
            .eq('origem_id', origem.id)
            .order('criado_em', { ascending: false });
        if (error) throw error;
        return ((data ?? []) as EnvelopeDeAssinatura[]).map(e => ({
            ...e,
            assinatura_signatarios: [...(e.assinatura_signatarios ?? [])].sort((a, b) => a.ordem - b.ordem),
        }));
    },
};

// ── Quem pode assinar um documento (para a gaveta de envio) ────────────────

export interface ClienteCandidato {
    id: string;
    name: string;
    email: string | null;
    document: string | null;
    legal_rep_name: string | null;
    legal_rep_document: string | null;
}
export interface MembroCandidato { user_id: string; name: string | null; email: string | null }
export interface CorretorCandidato { id: string; name: string; email: string | null; cpf: string | null }

export interface CandidatosParaAssinar {
    compradores: ClienteCandidato[];
    corretor: CorretorCandidato | null;
    membros: MembroCandidato[];
    eu: string | null;
}

/**
 * Compradores (todos, mesmo peso — commercial_deal_buyers; sem negociação, o
 * cliente do contrato), o corretor da negociação e os membros da organização.
 * O servidor confere tudo de novo e lê nome/e-mail/CPF do CADASTRO.
 */
export async function candidatosParaAssinar(p: { organizationId: string; contractId?: string | null; dealId?: string | null }): Promise<CandidatosParaAssinar> {
    let dealId = p.dealId ?? null;
    let clienteDoContrato: string | null = null;
    if (p.contractId) {
        const { data: c } = await supabase.from('contracts').select('deal_id, client_id').eq('id', p.contractId).maybeSingle();
        dealId = dealId ?? (c?.deal_id as string | null) ?? null;
        clienteDoContrato = (c?.client_id as string | null) ?? null;
    }
    let clientIds: string[] = [];
    let brokerId: string | null = null;
    if (dealId) {
        const [{ data: compradores }, { data: deal }] = await Promise.all([
            supabase.from('commercial_deal_buyers').select('client_id, is_primary').eq('deal_id', dealId),
            supabase.from('commercial_deals').select('client_id, broker_id').eq('id', dealId).maybeSingle(),
        ]);
        clientIds = (compradores ?? [])
            .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
            .map(b => b.client_id as string);
        if (deal?.client_id && !clientIds.includes(deal.client_id as string)) clientIds.unshift(deal.client_id as string);
        brokerId = (deal?.broker_id as string | null) ?? null;
    }
    if (clienteDoContrato && !clientIds.includes(clienteDoContrato)) clientIds.push(clienteDoContrato);

    const [{ data: clientes }, corretor, { data: membros }, { data: auth }] = await Promise.all([
        clientIds.length
            ? supabase.from('clients').select('id, name, email, document, legal_rep_name, legal_rep_document').in('id', clientIds)
            : Promise.resolve({ data: [] as ClienteCandidato[] }),
        brokerId
            ? supabase.from('broker_profiles').select('id, name, email, cpf').eq('id', brokerId).maybeSingle().then(r => r.data as CorretorCandidato | null)
            : Promise.resolve(null),
        supabase.from('organization_members').select('user_id, name, email').eq('organization_id', p.organizationId).not('user_id', 'is', null).order('name'),
        supabase.auth.getUser(),
    ]);
    const porId = new Map(((clientes ?? []) as ClienteCandidato[]).map(c => [c.id, c]));
    return {
        compradores: clientIds.map(id => porId.get(id)).filter((c): c is ClienteCandidato => !!c),
        corretor,
        membros: (membros ?? []) as MembroCandidato[],
        eu: auth?.user?.id ?? null,
    };
}

/** CPF do usuário no RH (employees.user_id), se houver — o servidor usa o mesmo. */
export async function cpfDoUsuarioNoRh(userId: string): Promise<string | null> {
    const { data } = await supabase.from('employees').select('cpf').eq('user_id', userId).not('cpf', 'is', null).limit(1);
    const cpf = (data?.[0]?.cpf as string | undefined)?.replace(/\D/g, '');
    return cpf && cpf.length === 11 ? cpf : null;
}
