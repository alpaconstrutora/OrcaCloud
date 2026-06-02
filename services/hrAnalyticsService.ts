import { supabase } from '../lib/supabase';

// ── TYPES ─────────────────────────────────────────────────────────────────────

export type TurnoverTipo =
    | 'ADMISSAO' | 'DEMISSAO_VOLUNTARIA' | 'DEMISSAO_INVOLUNTARIA'
    | 'TRANSFERENCIA' | 'PROMOCAO' | 'REBAIXAMENTO';

export interface HrMonthlySnapshot {
    id: string;
    org_id: string;
    ano_mes: string;               // YYYY-MM-DD (primeiro dia do mês)
    headcount_inicio: number;
    headcount_fim: number;
    admissoes: number;
    demissoes: number;
    turnover_rate: number;
    turnover_voluntario: number;
    turnover_involuntario: number;
    dias_uteis?: number;
    dias_ausencia: number;
    absenteismo_rate?: number;
    custo_folha_total?: number;
    custo_encargos?: number;
    custo_medio_colaborador?: number;
    horas_trabalhadas?: number;
    horas_extras?: number;
    horas_extras_rate?: number;
    breakdown_por_funcao: Record<string, number>;
    breakdown_por_obra: Record<string, number>;
    created_at?: string;
    // from view
    turnover_media_3m?: number;
    absenteismo_media_3m?: number;
}

export interface TurnoverEvent {
    id: string;
    org_id: string;
    employee_id: string;
    employee_nome?: string;
    tipo: TurnoverTipo;
    data_evento: string;
    motivo?: string;
    cargo_saida?: string;
    salario_saida?: number;
    cargo_entrada?: string;
    salario_entrada?: number;
    origem_ref?: string;
    destino_ref?: string;
    observacao?: string;
    created_at?: string;
}

export interface ProductivityMetric {
    id: string;
    org_id: string;
    project_id?: string;
    project_nome?: string;
    ano_mes: string;
    hh_disponivel?: number;
    hh_produtivo?: number;
    eficiencia_pct?: number;
    custo_mdo_direto?: number;
    custo_mdo_indireto?: number;
    avanco_fisico_pct?: number;
    custo_previsto?: number;
    custo_realizado?: number;
    idc?: number;
    headcount_obra?: number;
    created_at?: string;
}

export interface ProductivityByProject {
    org_id: string;
    project_id?: string;
    projeto_nome?: string;
    hh_total?: number;
    eficiencia_media_pct?: number;
    custo_total_mdo?: number;
    custo_previsto_total?: number;
    custo_realizado_total?: number;
    desvio_custo_pct?: number;
    idc_medio?: number;
}

export interface RetentionCohort {
    org_id: string;
    coorte_mes: string;
    admitidos: number;
    ainda_ativos: number;
    taxa_retencao_pct: number;
    permanencia_media_dias: number;
}

export interface HrTarget {
    id?: string;
    org_id: string;
    ano: number;
    turnover_max_pct?: number;
    absenteismo_max_pct?: number;
    horas_extras_max_pct?: number;
    eficiencia_min_pct?: number;
}

// ── SERVICE ───────────────────────────────────────────────────────────────────

export const hrAnalyticsService = {

    // SNAPSHOTS MENSAIS
    async getSnapshots(orgId: string, limit = 24): Promise<HrMonthlySnapshot[]> {
        const { data, error } = await supabase
            .from('vw_hr_turnover_trend')
            .select('*')
            .eq('org_id', orgId)
            .order('ano_mes', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data || [];
    },

    async generateSnapshot(orgId: string, anoMes: string): Promise<{ headcount_fim: number; turnover_rate: number; admissoes: number; demissoes: number }> {
        const { data, error } = await supabase.rpc('generate_hr_monthly_snapshot', {
            p_org_id: orgId,
            p_ano_mes: anoMes,
        });
        if (error) throw error;
        return data;
    },

    async backfillSnapshots(orgId: string, months = 12): Promise<void> {
        const base = new Date();
        base.setDate(1);
        for (let i = months - 1; i >= 0; i--) {
            const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
            const anoMes = d.toISOString().slice(0, 7) + '-01';
            try {
                await hrAnalyticsService.generateSnapshot(orgId, anoMes);
            } catch {
                // mês sem dados — ignora e continua
            }
        }
    },

    async upsertSnapshot(snap: Partial<HrMonthlySnapshot> & { org_id: string; ano_mes: string }): Promise<void> {
        const { error } = await supabase
            .from('hr_monthly_snapshots')
            .upsert(snap, { onConflict: 'org_id,ano_mes' });
        if (error) throw error;
    },

    // EVENTOS DE MOVIMENTAÇÃO
    async getTurnoverEvents(orgId: string, limit = 100): Promise<TurnoverEvent[]> {
        const { data, error } = await supabase
            .from('hr_turnover_events')
            .select('*, employee:employees(id, name)')
            .eq('org_id', orgId)
            .order('data_evento', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return (data || []).map((r: any) => ({ ...r, employee_nome: r.employee?.name }));
    },

    async createTurnoverEvent(ev: Omit<TurnoverEvent, 'id' | 'created_at'>): Promise<TurnoverEvent> {
        const { data, error } = await supabase
            .from('hr_turnover_events')
            .insert(ev)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteTurnoverEvent(id: string): Promise<void> {
        const { error } = await supabase.from('hr_turnover_events').delete().eq('id', id);
        if (error) throw error;
    },

    // PRODUTIVIDADE POR OBRA
    async getProductivityByProject(orgId: string): Promise<ProductivityByProject[]> {
        const { data, error } = await supabase
            .from('vw_hr_productivity_by_project')
            .select('*')
            .eq('org_id', orgId)
            .order('custo_realizado_total', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async getProductivityMetrics(orgId: string, limit = 60): Promise<ProductivityMetric[]> {
        const { data, error } = await supabase
            .from('hr_productivity_metrics')
            .select('*')
            .eq('org_id', orgId)
            .order('ano_mes', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data || [];
    },

    async upsertProductivityMetric(metric: Omit<ProductivityMetric, 'id' | 'created_at'>): Promise<void> {
        const { error } = await supabase
            .from('hr_productivity_metrics')
            .upsert(metric, { onConflict: 'org_id,project_id,ano_mes' });
        if (error) throw error;
    },

    // RETENÇÃO
    async getRetentionCohorts(orgId: string): Promise<RetentionCohort[]> {
        const { data, error } = await supabase
            .from('vw_hr_retention_cohorts')
            .select('*')
            .eq('org_id', orgId)
            .order('coorte_mes', { ascending: false })
            .limit(24);
        if (error) throw error;
        return data || [];
    },

    // METAS
    async getTarget(orgId: string, ano: number): Promise<HrTarget | null> {
        const { data, error } = await supabase
            .from('hr_targets')
            .select('*')
            .eq('org_id', orgId)
            .eq('ano', ano)
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async upsertTarget(target: HrTarget): Promise<void> {
        const { error } = await supabase
            .from('hr_targets')
            .upsert(target, { onConflict: 'org_id,ano' });
        if (error) throw error;
    },
};
