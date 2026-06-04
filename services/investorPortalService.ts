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

export interface InvestorOpportunity {
    id?: string;
    organization_id: string;
    title: string;
    subtitle?: string;
    projected_yield?: string;
    open_date?: string;
    link?: string;
    created_at?: string;
}

const REPORT_COLS = 'id, organization_id, investor_id, project_id, name, type, category, url, report_date, created_at';
const OPP_COLS = 'id, organization_id, title, subtitle, projected_yield, open_date, link, created_at';

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

    async listOpportunities(organizationId: string): Promise<InvestorOpportunity[]> {
        const { data, error } = await supabase
            .from('investor_opportunities')
            .select(OPP_COLS)
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []) as InvestorOpportunity[];
    },

    async addOpportunity(opp: Omit<InvestorOpportunity, 'id' | 'created_at'>): Promise<InvestorOpportunity> {
        const { data, error } = await supabase
            .from('investor_opportunities')
            .insert(opp)
            .select(OPP_COLS)
            .single();
        if (error) throw error;
        return data as InvestorOpportunity;
    },

    async deleteOpportunity(id: string): Promise<void> {
        const { error } = await supabase.from('investor_opportunities').delete().eq('id', id);
        if (error) throw error;
    },
};
