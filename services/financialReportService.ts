import { supabase } from '../lib/supabase';
import type {
    DRELine, DRESummary, DRESummaryLine, CashFlowPoint, CashFlowSummary, CashFlowGranularity,
    FinancialCategory, DREProjectSummary, BalanceteLine,
} from '../types/financial';

export const financialReportService = {

    // ── Plano de Contas ───────────────────────────────────────
    async getCategories(): Promise<FinancialCategory[]> {
        const { data, error } = await supabase
            .from('financial_categories')
            .select('*')
            .order('sort_order', { ascending: true });
        if (error) throw error;
        return (data || []) as FinancialCategory[];
    },

    async updateCategory(id: string, updates: Partial<FinancialCategory>): Promise<FinancialCategory> {
        const { data, error } = await supabase
            .from('financial_categories')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data as FinancialCategory;
    },

    // ── DRE ───────────────────────────────────────────────────
    async getDREDetail(
        organizationId: string,
        dateFrom: string,
        dateTo: string,
        empresaId?: string,
        projectId?: string,
    ): Promise<DRELine[]> {
        const { data, error } = await supabase.rpc('fn_dre', {
            p_organization_id: organizationId,
            p_date_from:       dateFrom,
            p_date_to:         dateTo,
            p_empresa_id:      empresaId ?? null,
            p_project_id:      projectId ?? null,
        });
        if (error) throw error;
        return (data || []) as DRELine[];
    },

    async getDRESummary(
        organizationId: string,
        dateFrom: string,
        dateTo: string,
        projectId?: string,
    ): Promise<DRESummary> {
        const [summaryRes, detailRes] = await Promise.all([
            supabase.rpc('fn_dre_summary', {
                p_organization_id: organizationId,
                p_date_from:       dateFrom,
                p_date_to:         dateTo,
                p_project_id:      projectId ?? null,
            }),
            supabase.rpc('fn_dre', {
                p_organization_id: organizationId,
                p_date_from:       dateFrom,
                p_date_to:         dateTo,
                p_empresa_id:      null,
                p_project_id:      projectId ?? null,
            }),
        ]);

        if (summaryRes.error) throw summaryRes.error;
        if (detailRes.error)  throw detailRes.error;

        const lines  = (summaryRes.data || []) as DRESummaryLine[];
        const detail = (detailRes.data  || []) as DRELine[];

        const getVal = (label: string) => lines.find(l => l.linha === label)?.valor_realizado ?? 0;

        const receita_bruta    = getVal('Receita Bruta');
        const receita_liquida  = getVal('= Receita Líquida');
        const lucro_bruto      = getVal('= Lucro Bruto');
        const ebitda           = getVal('= EBITDA');
        const resultado_liquido = getVal('= Resultado Líquido');

        return {
            period_from:     dateFrom,
            period_to:       dateTo,
            lines,
            detail,
            receita_bruta,
            receita_liquida,
            lucro_bruto,
            ebitda,
            resultado_liquido,
            margem_bruta_pct:   receita_bruta ? (lucro_bruto  / receita_bruta * 100) : null,
            margem_ebitda_pct:  receita_bruta ? (ebitda       / receita_bruta * 100) : null,
            margem_liquida_pct: receita_bruta ? (resultado_liquido / receita_bruta * 100) : null,
        };
    },

    // ── Lista de obras (para filtro) ──────────────────────────
    // Todas as obras da org, com ou sem movimentação. Exclui
    // orçamentos/planejamentos/diários e o vault "Gestão Comercial".
    async listObras(
        organizationId: string,
    ): Promise<{ project_id: string; project_name: string; code: string | null }[]> {
        const { data, error } = await supabase.rpc('fn_list_obras', {
            p_organization_id: organizationId,
        });
        if (error) throw error;
        return (data || []) as { project_id: string; project_name: string; code: string | null }[];
    },

    // ── DRE por Obra (comparativo) ────────────────────────────
    async getDREByProject(
        organizationId: string,
        dateFrom: string,
        dateTo: string,
    ): Promise<DREProjectSummary[]> {
        const { data, error } = await supabase.rpc('fn_dre_projects_summary', {
            p_organization_id: organizationId,
            p_date_from:       dateFrom,
            p_date_to:         dateTo,
        });
        if (error) throw error;
        return ((data || []) as Omit<DREProjectSummary, 'margem_pct'>[]).map(r => ({
            ...r,
            margem_pct: r.receita ? (r.margem / r.receita * 100) : null,
        }));
    },

    // ── Balancete Gerencial ───────────────────────────────────
    async getBalancete(
        organizationId: string,
        dateFrom: string,
        dateTo: string,
        projectId?: string,
    ): Promise<BalanceteLine[]> {
        const { data, error } = await supabase.rpc('fn_balancete', {
            p_organization_id: organizationId,
            p_date_from:       dateFrom,
            p_date_to:         dateTo,
            p_project_id:      projectId ?? null,
        });
        if (error) throw error;
        return (data || []) as BalanceteLine[];
    },

    // ── Fluxo de Caixa ────────────────────────────────────────
    async getCashFlow(
        organizationId: string,
        dateFrom: string,
        dateTo: string,
        granularity: CashFlowGranularity = 'month',
    ): Promise<CashFlowSummary> {
        const { data, error } = await supabase.rpc('fn_cash_flow', {
            p_organization_id: organizationId,
            p_date_from:       dateFrom,
            p_date_to:         dateTo,
            p_granularity:     granularity,
        });
        if (error) throw error;

        const points = (data || []) as CashFlowPoint[];
        const total_entradas = points.reduce((s, p) => s + p.credit_real, 0);
        const total_saidas   = points.reduce((s, p) => s + p.debit_real,  0);
        const last = points[points.length - 1];

        return {
            period_from:          dateFrom,
            period_to:            dateTo,
            granularity,
            points,
            total_entradas,
            total_saidas,
            saldo_final:          last?.saldo_acumulado ?? 0,
            saldo_previsto_final: (last?.saldo_acumulado ?? 0) + (last?.saldo_prev ?? 0),
        };
    },

    // ── Helpers de formatação ─────────────────────────────────
    formatBRL(value: number): string {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    },

    formatPct(value: number | null): string {
        if (value === null) return '—';
        return `${value.toFixed(1)}%`;
    },
};
