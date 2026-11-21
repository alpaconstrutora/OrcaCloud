import { supabase } from '../lib/supabase';

export type AnnouncementType = 'aviso' | 'assembleia' | 'votacao' | 'comunicado';

export const ANNOUNCEMENT_TYPE_LABELS: Record<AnnouncementType, string> = {
    aviso: 'Aviso',
    assembleia: 'Assembleia',
    votacao: 'Votação',
    comunicado: 'Comunicado',
};

export interface InvestorAnnouncement {
    id?: string;
    organization_id: string;
    project_id?: string | null;
    title: string;
    body: string;
    type: AnnouncementType;
    published_at?: string | null;
    requires_acknowledgment: boolean;
    created_at?: string;
    // joined fields (not persisted)
    ack_count?: number;
    user_acknowledged?: boolean;
    user_vote?: string | null;
}

export interface InvestorAcknowledgment {
    id?: string;
    announcement_id: string;
    investor_id: string;
    acknowledged_at?: string;
    vote_option?: string | null;
}

/** O que o gestor preenche no formulário. */
export interface AnnouncementDraft {
    title: string;
    body: string;
    type: AnnouncementType;
    requires_acknowledgment: boolean;
}

export interface AnnouncementResponse {
    id: string;
    investor_id: string;
    investor_name: string | null;
    acknowledged_at: string;
    vote_option: string | null;
}

export const VOTE_LABELS: Record<string, string> = { sim: 'Sim', nao: 'Não', abstencao: 'Abstenção' };

/** Comunicado com aceite/voto não pode ser editado nem excluído. */
export class AnnouncementBlockedError extends Error {
    constructor(public readonly respostas: number, acao: 'editado' | 'excluído') {
        super(`Este comunicado já tem ${respostas} resposta${respostas === 1 ? '' : 's'} de investidor e não pode ser ${acao}.`);
        this.name = 'AnnouncementBlockedError';
    }
}

/** Mensagem de "a RLS não deixou": UPDATE/DELETE barrado volta 0 linhas, sem erro. */
const SEM_PERMISSAO = (acao: string) =>
    `Não foi possível ${acao} o comunicado: só o dono ou um administrador da organização pode fazer isso.`;

function exigirUmaLinha(data: unknown, acao: string): InvestorAnnouncement {
    const linhas = (data ?? []) as InvestorAnnouncement[];
    if (linhas.length === 0) throw new Error(SEM_PERMISSAO(acao));
    return linhas[0];
}

/**
 * A trava de comunicado respondido mora no BANCO (gatilho trg_investor_announcements_trava_respondido,
 * migration 20271117970000): recusa com HINT 'comunicado_com_respostas' e DETAIL = nº de respostas.
 * Aqui só vira o erro que a tela já sabe mostrar.
 */
function falhaDaGravacao(error: unknown, acao: 'editado' | 'excluído'): unknown {
    const e = error as { hint?: string | null; details?: string | null } | null;
    if (e?.hint === 'comunicado_com_respostas') return new AnnouncementBlockedError(Number(e.details) || 1, acao);
    return error;
}

const ANN_COLS = 'id, organization_id, project_id, title, body, type, published_at, requires_acknowledgment, created_at';
const ACK_COLS = 'id, announcement_id, investor_id, acknowledged_at, vote_option';

export const announcementsService = {
    async list(organizationId: string, investorId?: string): Promise<InvestorAnnouncement[]> {
        const { data, error } = await supabase
            .from('investor_announcements')
            .select(ANN_COLS)
            .eq('organization_id', organizationId)
            .not('published_at', 'is', null)
            .order('published_at', { ascending: false });

        if (error) throw error;
        const items = (data ?? []) as InvestorAnnouncement[];

        // Para cada announcement, verificar se o investidor já aceitou
        if (investorId && items.length > 0) {
            const ids = items.map(a => a.id!);
            const { data: acks } = await supabase
                .from('investor_acknowledgments')
                .select(ACK_COLS)
                .in('announcement_id', ids)
                .eq('investor_id', investorId);

            const ackMap = new Map((acks ?? []).map(a => [a.announcement_id, a]));
            items.forEach(item => {
                const ack = ackMap.get(item.id!);
                item.user_acknowledged = !!ack;
                item.user_vote = ack?.vote_option ?? null;
            });
        }
        return items;
    },

    /**
     * Visão do GESTOR: rascunhos e publicados, com a contagem de respostas (aceites/votos).
     * `null` = "Todas as organizações" do topo — sem filtro, a RLS recorta (REGRA #5).
     */
    async listAll(organizationId: string | null): Promise<InvestorAnnouncement[]> {
        let q = supabase
            .from('investor_announcements')
            .select(ANN_COLS);
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q.order('created_at', { ascending: false });
        if (error) throw error;
        const items = (data ?? []) as InvestorAnnouncement[];
        if (items.length === 0) return items;

        const { data: acks, error: ackErr } = await supabase
            .from('investor_acknowledgments')
            .select('announcement_id, vote_option')
            .in('announcement_id', items.map(a => a.id!));
        if (ackErr) throw ackErr;
        const contagem = new Map<string, number>();
        for (const k of (acks ?? []) as { announcement_id: string }[]) {
            contagem.set(k.announcement_id, (contagem.get(k.announcement_id) ?? 0) + 1);
        }
        return items.map(a => ({ ...a, ack_count: contagem.get(a.id!) ?? 0 }));
    },

    /** Cria na organização escolhida (o topo, ou a resposta do modal em "Todas"). */
    async create(organizationId: string, dados: AnnouncementDraft, publicarJa: boolean): Promise<InvestorAnnouncement> {
        const { data, error } = await supabase
            .from('investor_announcements')
            .insert({
                organization_id: organizationId,
                title: dados.title,
                body: dados.body,
                type: dados.type,
                requires_acknowledgment: dados.requires_acknowledgment,
                published_at: publicarJa ? new Date().toISOString() : null,
            })
            .select(ANN_COLS)
            .single();
        if (error) throw error;
        return { ...(data as InvestorAnnouncement), ack_count: 0 };
    },

    /**
     * Edita. Comunicado com aceite/voto NÃO muda: o investidor confirmou aquele texto. Quem recusa é
     * o banco, na hora de gravar — uma resposta pode chegar com o painel aberto.
     */
    async update(id: string, patch: Partial<AnnouncementDraft>): Promise<InvestorAnnouncement> {
        const { data, error } = await supabase
            .from('investor_announcements')
            .update(patch)
            .eq('id', id)
            .select(ANN_COLS);
        if (error) throw falhaDaGravacao(error, 'editado');
        const linha = exigirUmaLinha(data, 'alterar');
        return { ...linha, ack_count: 0 };
    },

    async publish(id: string): Promise<InvestorAnnouncement> {
        const { data, error } = await supabase
            .from('investor_announcements')
            .update({ published_at: new Date().toISOString() })
            .eq('id', id)
            .select(ANN_COLS);
        if (error) throw falhaDaGravacao(error, 'editado');
        return exigirUmaLinha(data, 'publicar');
    },

    /** Exclui. Com aceite/voto, o banco recusa: o `ON DELETE CASCADE` apagaria as respostas junto. */
    async remove(id: string): Promise<void> {
        const { data, error } = await supabase
            .from('investor_announcements')
            .delete()
            .eq('id', id)
            .select('id');
        if (error) throw falhaDaGravacao(error, 'excluído');
        exigirUmaLinha(data, 'excluir');
    },

    /** Quem respondeu (aceite e, na votação, o voto), com o nome do investidor. */
    async listResponses(announcementId: string): Promise<AnnouncementResponse[]> {
        const { data, error } = await supabase
            .from('investor_acknowledgments')
            .select('id, investor_id, acknowledged_at, vote_option, investors(name)')
            .eq('announcement_id', announcementId)
            .order('acknowledged_at', { ascending: false });
        if (error) throw error;
        return ((data ?? []) as unknown as {
            id: string; investor_id: string; acknowledged_at: string; vote_option: string | null;
            investors: { name: string | null } | { name: string | null }[] | null;
        }[]).map(r => {
            const inv = Array.isArray(r.investors) ? r.investors[0] : r.investors;
            return {
                id: r.id,
                investor_id: r.investor_id,
                investor_name: inv?.name ?? null,
                acknowledged_at: r.acknowledged_at,
                vote_option: r.vote_option,
            };
        });
    },

    /**
     * Ciência/voto do investidor LOGADO (Fase A7 do plano 2026-11-21-portal-do-investidor-consolidacao): a
     * tabela não aceita mais gravação direta — antes qualquer membro da org respondia em nome de qualquer
     * investidor. Vai pela mesma RPC do link, com o token do próprio investidor (`portal_token_para_mim`).
     * `_investorId` fica na assinatura só por compatibilidade: quem responde é sempre o dono do token.
     */
    async acknowledge(announcementId: string, _investorId: string, voteOption?: string): Promise<void> {
        const { data: acesso, error: erroAcesso } = await supabase.rpc('portal_token_para_mim', { p_portal: 'investidor' });
        if (erroAcesso) throw erroAcesso;
        const token = (acesso as { situacao?: string; token?: string } | null)?.token;
        if (!token) throw new Error('Seu acesso de investidor não está ativo: peça um novo link à construtora.');
        const { data, error } = await supabase.rpc('fn_investor_portal_acknowledge', {
            p_token: token,
            p_announcement_id: announcementId,
            p_vote_option: voteOption ?? null,
        });
        if (error) throw error;
        const r = data as { valid?: boolean; error?: string } | null;
        if (!r?.valid) {
            throw new Error(r?.error === 'vote_required' ? 'Escolha uma opção para votar.' : 'Não foi possível registrar a resposta.');
        }
    },

    async listAcknowledgments(announcementId: string): Promise<InvestorAcknowledgment[]> {
        const { data, error } = await supabase
            .from('investor_acknowledgments')
            .select(ACK_COLS)
            .eq('announcement_id', announcementId);
        if (error) throw error;
        return (data ?? []) as InvestorAcknowledgment[];
    },
};
