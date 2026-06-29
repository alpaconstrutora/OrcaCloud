import { supabase } from '../lib/supabase';

export type ReportCategory =
    | 'relatorio' | 'contrato' | 'spe' | 'matricula' | 'licenca'
    | 'art' | 'nota' | 'prestacao_contas' | 'balancete' | 'dre' | 'ata' | 'outro';

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
    relatorio: 'Relatório',
    contrato: 'Contrato',
    spe: 'SPE',
    matricula: 'Matrícula',
    licenca: 'Licença',
    art: 'ART/RRT',
    nota: 'Nota Fiscal',
    prestacao_contas: 'Prestação de Contas',
    balancete: 'Balancete',
    dre: 'DRE',
    ata: 'Ata',
    outro: 'Outro',
};

export interface InvestorReport {
    id?: string;
    organization_id: string;
    investor_id?: string | null;
    project_id?: string | null;
    name: string;
    type?: string;
    category?: ReportCategory;
    url?: string;
    report_date?: string;
    created_at?: string;
}

export type OpportunityStatus = 'estudo' | 'viabilidade' | 'lancamento' | 'captacao' | 'encerrada';
export type OpportunityType = 'incorporacao' | 'loteamento' | 'obra_privada' | 'obra_publica';

export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
    estudo: 'Estudo',
    viabilidade: 'Viabilidade',
    lancamento: 'Lançamento',
    captacao: 'Captação',
    encerrada: 'Encerrada',
};

export const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string> = {
    incorporacao: 'Incorporação',
    loteamento: 'Loteamento',
    obra_privada: 'Obra Privada',
    obra_publica: 'Obra Pública',
};

export const OPPORTUNITY_STATUS_COLORS: Record<OpportunityStatus, string> = {
    estudo: 'bg-gray-100 text-gray-600',
    viabilidade: 'bg-amber-100 text-amber-700',
    lancamento: 'bg-blue-100 text-blue-700',
    captacao: 'bg-emerald-100 text-emerald-700',
    encerrada: 'bg-red-100 text-red-600',
};

export interface InvestorOpportunity {
    id?: string;
    organization_id: string;
    title: string;
    subtitle?: string;
    // mantido como text para retrocompatibilidade; usar roi_pct/tir_pct para cálculos
    projected_yield?: string;
    open_date?: string;
    link?: string;
    // campos MVP
    status?: OpportunityStatus;
    opportunity_type?: OpportunityType;
    location_city?: string;
    location_state?: string;
    thumbnail_url?: string;
    land_area_m2?: number | null;
    built_area_m2?: number | null;
    floors?: number | null;
    vgv?: number | null;
    roi_pct?: number | null;
    tir_pct?: number | null;
    cost_estimate?: number | null;
    cost_per_m2?: number | null;
    ticket_min?: number | null;
    expected_start?: string | null;
    project_id?: string | null;
    is_published?: boolean;
    // campos Fase 2 — cenários de viabilidade
    duration_months?: number | null;
    scenario_cost_cons_pct?: number | null;
    scenario_vgv_cons_pct?: number | null;
    scenario_cost_opt_pct?: number | null;
    scenario_vgv_opt_pct?: number | null;
    scenario_notes?: string | null;
    // novos campos de marketing, RI e vínculo ao IMOVIB
    imovib_study_id?: string | null;
    target_funding_value?: number | null;
    current_funding_value?: number | null;
    gallery_urls?: string[] | null;
    distances_json?: any[] | null;
    risks_json?: any[] | null;
    team_json?: any[] | null;
    simulation_params_json?: any | null;
    created_at?: string;
}

export interface OpportunityCompetitor {
    id?: string;
    organization_id: string;
    opportunity_id: string;
    name: string;
    price_per_m2: number;
    sales_velocity_pct?: number | null;
    appreciation_pct?: number | null;
    distance_km?: number | null;
    created_at?: string;
}

export type InterestRole = 'investidor' | 'arquiteto' | 'engenheiro' | 'projetista' | 'consultor' | 'outro';
export type InterestStage = 'lead' | 'interesse' | 'reuniao' | 'proposta' | 'negociacao' | 'fechado';

export const INTEREST_ROLE_LABELS: Record<InterestRole, string> = {
    investidor: 'Investidor',
    arquiteto: 'Arquiteto',
    engenheiro: 'Engenheiro',
    projetista: 'Projetista',
    consultor: 'Consultor',
    outro: 'Outro',
};

export const INTEREST_STAGE_LABELS: Record<InterestStage, string> = {
    lead: 'Lead',
    interesse: 'Interesse',
    reuniao: 'Reunião',
    proposta: 'Proposta',
    negociacao: 'Negociação',
    fechado: 'Fechado',
};

export const INTEREST_STAGE_COLORS: Record<InterestStage, { bg: string; text: string; border: string }> = {
    lead:       { bg: 'bg-gray-50',     text: 'text-gray-600',    border: 'border-gray-200' },
    interesse:  { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200' },
    reuniao:    { bg: 'bg-indigo-50',   text: 'text-indigo-700',  border: 'border-indigo-200' },
    proposta:   { bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200' },
    negociacao: { bg: 'bg-purple-50',   text: 'text-purple-700',  border: 'border-purple-200' },
    fechado:    { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200' },
};

export interface OpportunityInterest {
    id?: string;
    organization_id: string;
    opportunity_id: string;
    contact_name: string;
    contact_email?: string;
    contact_phone?: string;
    role: InterestRole;
    message?: string;
    stage?: InterestStage;
    created_at?: string;
}

const REPORT_COLS = 'id, organization_id, investor_id, project_id, name, type, category, url, report_date, created_at';

const OPP_COLS = [
    'id', 'organization_id', 'title', 'subtitle', 'projected_yield', 'open_date', 'link',
    'status', 'opportunity_type', 'location_city', 'location_state', 'thumbnail_url',
    'land_area_m2', 'built_area_m2', 'floors',
    'vgv', 'roi_pct', 'tir_pct', 'cost_estimate', 'cost_per_m2', 'ticket_min',
    'expected_start', 'project_id', 'is_published',
    'duration_months', 'scenario_cost_cons_pct', 'scenario_vgv_cons_pct',
    'scenario_cost_opt_pct', 'scenario_vgv_opt_pct', 'scenario_notes',
    'imovib_study_id', 'target_funding_value', 'current_funding_value',
    'gallery_urls', 'distances_json', 'risks_json', 'team_json', 'simulation_params_json',
    'created_at',
].join(', ');

const INTEREST_COLS = 'id, organization_id, opportunity_id, contact_name, contact_email, contact_phone, role, message, stage, created_at';

const COMPETITOR_COLS = 'id, organization_id, opportunity_id, name, price_per_m2, sales_velocity_pct, appreciation_pct, distance_km, created_at';

export const investorPortalService = {
    // ─── Reports ─────────────────────────────────────────────────────────────

    async listReports(organizationId: string, investorId?: string, category?: ReportCategory): Promise<InvestorReport[]> {
        let query = supabase
            .from('investor_reports')
            .select(REPORT_COLS)
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });

        if (investorId) {
            query = query.or(`investor_id.eq.${investorId},investor_id.is.null`);
        }
        if (category) {
            query = query.eq('category', category);
        }

        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as InvestorReport[];
    },

    async addReport(report: Omit<InvestorReport, 'id' | 'created_at'>): Promise<InvestorReport> {
        const { data, error } = await supabase
            .from('investor_reports')
            .insert({ ...report, category: report.category ?? 'relatorio' })
            .select(REPORT_COLS)
            .single();
        if (error) throw error;
        return data as InvestorReport;
    },

    async deleteReport(id: string): Promise<void> {
        const { error } = await supabase.from('investor_reports').delete().eq('id', id);
        if (error) throw error;
    },

    // ─── Opportunities ────────────────────────────────────────────────────────

    async listOpportunities(organizationId: string, onlyPublished = false): Promise<InvestorOpportunity[]> {
        let query = supabase
            .from('investor_opportunities')
            .select(OPP_COLS)
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });

        if (onlyPublished) query = query.eq('is_published', true);

        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as unknown as InvestorOpportunity[];
    },

    async addOpportunity(opp: Omit<InvestorOpportunity, 'id' | 'created_at'>): Promise<InvestorOpportunity> {
        const { data, error } = await supabase
            .from('investor_opportunities')
            .insert({ ...opp, status: opp.status ?? 'estudo', is_published: opp.is_published ?? false })
            .select(OPP_COLS)
            .single();
        if (error) throw error;
        return data as unknown as InvestorOpportunity;
    },

    async updateOpportunity(id: string, patch: Partial<Omit<InvestorOpportunity, 'id' | 'organization_id' | 'created_at'>>): Promise<InvestorOpportunity> {
        const { data, error } = await supabase
            .from('investor_opportunities')
            .update(patch)
            .eq('id', id)
            .select(OPP_COLS)
            .single();
        if (error) throw error;
        return data as unknown as InvestorOpportunity;
    },

    async deleteOpportunity(id: string): Promise<void> {
        const { error } = await supabase.from('investor_opportunities').delete().eq('id', id);
        if (error) throw error;
    },

    // ─── Interests ────────────────────────────────────────────────────────────

    async addInterest(interest: Omit<OpportunityInterest, 'id' | 'created_at'>): Promise<OpportunityInterest> {
        const { data, error } = await supabase
            .from('opportunity_interests')
            .insert({ ...interest, stage: interest.stage ?? 'lead' })
            .select(INTEREST_COLS)
            .single();
        if (error) throw error;
        const saved = data as OpportunityInterest;

        // Notificação por e-mail — fire-and-forget (falha silenciosa)
        if (saved.id) {
            supabase.functions.invoke('notify-opportunity-interest', {
                body: {
                    interestId:     saved.id,
                    opportunityId:  interest.opportunity_id,
                    organizationId: interest.organization_id,
                },
            }).catch(() => {/* notificação não bloqueia o fluxo */});
        }

        return saved;
    },

    async listInterests(organizationId: string, opportunityId?: string): Promise<OpportunityInterest[]> {
        let query = supabase
            .from('opportunity_interests')
            .select(INTEREST_COLS)
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });

        if (opportunityId) query = query.eq('opportunity_id', opportunityId);

        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as OpportunityInterest[];
    },

    async updateInterestStage(id: string, stage: InterestStage): Promise<void> {
        const { error } = await supabase
            .from('opportunity_interests')
            .update({ stage })
            .eq('id', id);
        if (error) throw error;
    },

    // ─── Competitors ──────────────────────────────────────────────────────────

    async listCompetitors(opportunityId: string): Promise<OpportunityCompetitor[]> {
        const { data, error } = await supabase
            .from('investor_opportunity_competitors')
            .select(COMPETITOR_COLS)
            .eq('opportunity_id', opportunityId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return (data ?? []) as OpportunityCompetitor[];
    },

    async saveCompetitor(competitor: Omit<OpportunityCompetitor, 'id' | 'created_at'> & { id?: string }): Promise<OpportunityCompetitor> {
        if (competitor.id) {
            const { data, error } = await supabase
                .from('investor_opportunity_competitors')
                .update(competitor)
                .eq('id', competitor.id)
                .select(COMPETITOR_COLS)
                .single();
            if (error) throw error;
            return data as OpportunityCompetitor;
        } else {
            const { data, error } = await supabase
                .from('investor_opportunity_competitors')
                .insert(competitor)
                .select(COMPETITOR_COLS)
                .single();
            if (error) throw error;
            return data as OpportunityCompetitor;
        }
    },

    async deleteCompetitor(id: string): Promise<void> {
        const { error } = await supabase
            .from('investor_opportunity_competitors')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },
};
