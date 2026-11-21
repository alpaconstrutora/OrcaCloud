import { supabase } from '../lib/supabase';
import {
    InvestorOpportunity,
    InterestRole,
} from './investorPortalService';
import { naVitrine, type OportunidadeNaVitrine } from '../utils/oportunidadeNumerosDaVersao';
import { PhotoItem } from '../components/investor/PhotoGallery';

export interface PublicOrganization {
    id: string;
    name: string;
    logo_url?: string | null;
    website?: string | null;
}


/** Vitrine pública: números da versão do Imovib e fotos do empreendimento (plano 2026-11-21, itens 2.6 e 3.3). */
export type PublicOpportunity = OportunidadeNaVitrine;

export interface PublicMarketplace {
    organization: PublicOrganization;
    opportunities: PublicOpportunity[];
}

export interface SubmitInterestPayload {
    opportunity_id: string;
    name: string;
    email?: string;
    phone?: string;
    role?: InterestRole;
    message?: string;
}

/** Fotos da vitrine (URLs públicas do empreendimento) no formato da PhotoGallery. */
function fotosParaGaleria(o: PublicOpportunity): PhotoItem[] {
    return (o.fotos ?? []).map((f, i) => ({ id: `${i}-${f.url}`, url: f.url, description: f.legenda }));
}

export const publicMarketplaceService = {

    async getMarketplace(slug: string): Promise<PublicMarketplace> {
        const { data, error } = await supabase.rpc('get_public_marketplace', { p_slug: slug });
        if (error) throw error;
        if (!data || (data as any).error) {
            throw new Error((data as any)?.error ?? 'Marketplace não encontrado');
        }
        const result = data as { organization: PublicOrganization; opportunities: InvestorOpportunity[] };
        return { organization: result.organization, opportunities: (result.opportunities ?? []).map(o => naVitrine(o)) };
    },

    fotosParaGaleria,

    async submitInterest(payload: SubmitInterestPayload): Promise<string> {
        const { data, error } = await supabase.rpc('submit_public_interest', {
            p_opportunity_id: payload.opportunity_id,
            p_name:           payload.name,
            p_email:          payload.email ?? null,
            p_phone:          payload.phone ?? null,
            p_role:           payload.role ?? 'investidor',
            p_message:        payload.message ?? null,
        });
        if (error) throw error;
        if (!data || (data as any).error) {
            throw new Error((data as any)?.error ?? 'Erro ao registrar interesse');
        }

        const interestId = (data as any).id as string;
        const organizationId = (data as any).organization_id as string;

        /* Notificação disparada pela trigger `trg_notify_opportunity_interest`
           no INSERT em `opportunity_interests` — ver investorPortalService.ts.
           Este é o caminho MAIS exposto dos três (marketplace público, visitante
           anônimo) e o que mais justifica o gate: era por aqui que o C3-06
           virava spam com conteúdo de formulário aberto. */

        return interestId;
    },
};
