import { supabase } from '../lib/supabase';
import type { InterestRole } from './investorPortalService';
import type { ObraDoEspelho } from '../utils/espelhoDoInvestidor';
import type { ImovibScenario } from '../types';
import { versaoPublicadaDoSnapshot, type SnapshotDaVersao, type VersaoPublicada } from '../utils/imovibVersoes';

const MOTIVO_DO_ESTUDO_RECUSADO: Record<string, string> = {
    unauthorized: 'O link do portal venceu ou foi desativado.',
    forbidden: 'Esta oportunidade não está mais publicada.',
    sem_versao: 'Esta oportunidade ainda não tem uma versão do estudo publicada.',
    not_found: 'A versão publicada desta oportunidade não foi encontrada.',
};

/** Recusas de fn_investor_portal_acknowledge (vêm como `{valid:false,error}`, não como erro). */
const MOTIVO_DA_RESPOSTA_RECUSADA: Record<string, string> = {
    token_invalid: 'O link do portal venceu ou foi desativado. Peça um novo link a quem envia os comunicados.',
    not_found: 'Este comunicado não está mais disponível.',
    vote_required: 'Escolha Sim, Não ou Abstenção para votar.',
};

/** O que ficou gravado da resposta do investidor — a 2ª resposta não troca a 1ª. */
export interface RespostaDoComunicado {
    vote_option: string | null;
    acknowledged_at: string | null;
}

/** O banco recusou a resposta (link vencido, comunicado retirado, votação sem voto) — mensagem pronta. */
export class RespostaRecusadaError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RespostaRecusadaError';
    }
}

export interface InvestorPortalToken {
    id: string;
    org_id: string;
    investor_id: string;
    token: string;
    expires_at: string;
    last_used_at?: string;
    is_active: boolean;
    created_at?: string;
}

export interface SubmitInvestorPortalInterestPayload {
    opportunityId: string;
    name: string;
    email?: string;
    phone?: string;
    role?: InterestRole;
    message?: string;
    /** Quanto pretende aportar (Fase 4 do plano 2026-11-21) — vai ao interesse junto com o investidor do link. */
    valor?: number | null;
}

export const investorPortalTokenService = {
    async generateToken(investorId: string, orgId: string): Promise<string> {
        const { data, error } = await supabase.rpc('investor_portal_generate_token', {
            p_investor_id: investorId,
            p_org_id: orgId,
        });
        if (error) throw error;
        return data as string;
    },

    async getTokenForInvestor(investorId: string): Promise<InvestorPortalToken | null> {
        const { data, error } = await supabase
            .from('investor_portal_tokens')
            .select('id, org_id, investor_id, token, expires_at, last_used_at, is_active, created_at')
            .eq('investor_id', investorId)
            .eq('is_active', true)
            .maybeSingle();
        if (error) throw error;
        return data as InvestorPortalToken | null;
    },

    async revokeToken(investorId: string): Promise<void> {
        const { error } = await supabase
            .from('investor_portal_tokens')
            .update({ is_active: false })
            .eq('investor_id', investorId);
        if (error) throw error;
    },

    async getPortalData(token: string): Promise<{ valid: boolean; investor?: any; org_id?: string }> {
        const { data, error } = await supabase.rpc('investor_portal_get_data', { p_token: token });
        if (error) throw error;
        return data as { valid: boolean; investor?: any; org_id?: string };
    },

    buildPortalUrl(token: string): string {
        return `${window.location.origin}/portal-investidor?token=${token}`;
    },

    // ── RPCs de dados via token (anon) ────────────────────────────────────────

    async getSummaryByToken(token: string): Promise<{ participations: any[]; contributions: any[]; projects: any[] }> {
        const { data, error } = await supabase.rpc('fn_investor_portal_get_summary', { p_token: token });
        if (error) throw error;
        const res = data as any;
        return {
            participations: res?.participations ?? [],
            contributions: res?.contributions ?? [],
            projects: res?.projects ?? [],
        };
    },

    async getReportsByToken(token: string): Promise<any[]> {
        const { data, error } = await supabase.rpc('fn_investor_portal_get_reports', { p_token: token });
        if (error) throw error;
        return (data as any)?.reports ?? [];
    },

    async getAnnouncementsByToken(token: string): Promise<any[]> {
        const { data, error } = await supabase.rpc('fn_investor_portal_get_announcements', { p_token: token });
        if (error) throw error;
        return (data as any)?.announcements ?? [];
    },

    /**
     * Confirma a leitura (e, na votação, vota). A RPC recusa devolvendo `{valid:false}` sem erro —
     * antes isso passava calado e a tela marcava "Confirmado" sem nada gravado.
     */
    async acknowledgeByToken(token: string, announcementId: string, voteOption?: string): Promise<RespostaDoComunicado> {
        const { data, error } = await supabase.rpc('fn_investor_portal_acknowledge', {
            p_token: token,
            p_announcement_id: announcementId,
            p_vote_option: voteOption ?? null,
        });
        if (error) throw error;
        const r = (data ?? {}) as { valid?: boolean; error?: string; vote_option?: string | null; acknowledged_at?: string | null };
        if (!r.valid) {
            throw new RespostaRecusadaError(MOTIVO_DA_RESPOSTA_RECUSADA[r.error ?? ''] ?? 'Não foi possível registrar sua resposta.');
        }
        return { vote_option: r.vote_option ?? null, acknowledged_at: r.acknowledged_at ?? null };
    },

    async getOpportunitiesByToken(token: string): Promise<any[]> {
        const { data, error } = await supabase.rpc('fn_investor_portal_get_opportunities', { p_token: token });
        if (error) throw error;
        return (data as any)?.opportunities ?? [];
    },

    /**
     * SPEs em que o investidor do token é sócio, com a participação DELE.
     * Devolve [] (em vez de estourar) quando a RPC ainda não foi aplicada no
     * banco — a aba mostra estado vazio em vez de derrubar o portal.
     */
    async getSpesByToken(token: string): Promise<any[]> {
        const { data, error } = await supabase.rpc('fn_investor_portal_get_spes', { p_token: token });
        if (error) {
            // PGRST202 = função inexistente no schema exposto
            if (error.code === 'PGRST202' || /not find the function/i.test(error.message ?? '')) {
                console.warn('fn_investor_portal_get_spes ausente — aba SPE ficará vazia até a migration ser aplicada.');
                return [];
            }
            throw error;
        }
        return (data as any)?.spes ?? [];
    },

    /**
     * Espelho de Vendas 3D (F4, 10/11/2026): as obras do investidor com torres,
     * unidades (status já resolvido + preço de tabela) e o VGV vendido. Pelo link
     * (`token`) ou, no app logado, pelo investidor — a função do banco confere se
     * quem chama é da equipe da organização dele, superadmin ou o próprio.
     * Token inválido, sem permissão ou função ausente = [] (a aba mostra o vazio).
     */
    async getEspelho(acesso: { token: string } | { investorId: string }): Promise<ObraDoEspelho[]> {
        const { data, error } = 'token' in acesso
            ? await supabase.rpc('fn_investor_portal_get_espelho', { p_token: acesso.token })
            : await supabase.rpc('fn_investor_get_espelho', { p_investor_id: acesso.investorId });
        if (error) {
            if (error.code === 'PGRST202' || /not find the function/i.test(error.message ?? '')) {
                console.warn('Função do espelho do investidor ausente — a aba fica vazia até a migration ser aplicada.');
                return [];
            }
            throw error;
        }
        const res = data as { valid?: boolean; obras?: ObraDoEspelho[] } | null;
        return res?.valid ? (res.obras ?? []) : [];
    },

    async getMilestonesByToken(token: string): Promise<any[]> {
        const { data, error } = await supabase.rpc('fn_investor_portal_get_milestones', { p_token: token });
        if (error) throw error;
        return (data as any)?.milestones ?? [];
    },

    /**
     * A versão congelada que a oportunidade publica (Fase 2 do plano
     * docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md). O estudo do snapshot já
     * vem montado como o app o carregou (espelho, estrutura, fontes): não passa por `montarEstudoDoPortal`.
     */
    async getVersaoPublicadaByToken(token: string, opportunityId: string): Promise<VersaoPublicada> {
        // Pela OPORTUNIDADE (revisão da Fase 2): duas oportunidades publicadas do mesmo estudo podem
        // publicar versões diferentes; pelo estudo, o investidor via a da mais nova.
        const { data, error } = await supabase.rpc('fn_investor_portal_get_versao', {
            p_token: token,
            p_opportunity_id: opportunityId,
        });
        if (error) throw error;
        const r = data as { valid?: boolean; error?: string; study?: SnapshotDaVersao; cenarios?: ImovibScenario[]; relatorio?: SnapshotDaVersao['relatorio']; calculo?: VersaoPublicada['calculo']; versao?: VersaoPublicada['versao']; organizacao?: VersaoPublicada['organizacao'] } | null;
        if (!r?.valid || !r.study || !r.versao) {
            throw new Error(MOTIVO_DO_ESTUDO_RECUSADO[r?.error ?? ''] ?? 'Não foi possível ler o estudo desta oportunidade.');
        }
        return versaoPublicadaDoSnapshot(
            // Fase 6: o banco manda só a parte do investidor do cálculo congelado, em chave própria.
            { ...r.study, cenarios: r.cenarios ?? [], relatorio: r.relatorio ?? {}, calculo: r.calculo ? ({ investidor: r.calculo } as SnapshotDaVersao['calculo']) : undefined },
            r.versao,
            r.organizacao ?? { name: null, logo_url: null },
        );
    },

    async submitInterestByToken(token: string, payload: SubmitInvestorPortalInterestPayload): Promise<string> {
        const { data, error } = await supabase.rpc('fn_investor_portal_submit_interest', {
            p_token: token,
            p_opportunity_id: payload.opportunityId,
            p_name: payload.name,
            p_email: payload.email ?? null,
            p_phone: payload.phone ?? null,
            p_role: payload.role ?? 'investidor',
            p_message: payload.message ?? null,
            p_valor: payload.valor ?? null,
        });
        if (error) throw error;
        if (!data || !(data as any).valid) {
            throw new Error((data as any)?.error ?? 'Erro ao registrar interesse');
        }

        const interestId = (data as any).id as string;
        const organizationId = (data as any).organization_id as string;

        /* Notificação disparada pela trigger `trg_notify_opportunity_interest`
           no INSERT em `opportunity_interests` — ver investorPortalService.ts.
           Este caminho é ANÔNIMO (acesso por token), então nunca teve como
           mandar a credencial que a function exige. */

        return interestId;
    },
};
