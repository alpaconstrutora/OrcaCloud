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
    async getSnapshots(orgId: string | null, limit = 24): Promise<HrMonthlySnapshot[]> {
        let q = supabase
            .from('vw_hr_turnover_trend')
            .select('id, org_id, ano_mes, headcount_inicio, headcount_fim, admissoes, demissoes, turnover_rate, turnover_voluntario, turnover_involuntario, dias_uteis, dias_ausencia, absenteismo_rate, custo_folha_total, custo_encargos, custo_medio_colaborador, horas_trabalhadas, horas_extras, horas_extras_rate, breakdown_por_funcao, breakdown_por_obra, turnover_media_3m, absenteismo_media_3m, created_at')
            .order('ano_mes', { ascending: false })
            .limit(limit);
        if (orgId && orgId !== 'all') q = q.eq('org_id', orgId);
        const { data, error } = await q;
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
    async getTurnoverEvents(orgId: string | null, limit = 100): Promise<TurnoverEvent[]> {
        let q = supabase
            .from('hr_turnover_events')
            .select('*, employee:employees(id, name)')
            .order('data_evento', { ascending: false })
            .limit(limit);
        if (orgId && orgId !== 'all') q = q.eq('org_id', orgId);
        const { data, error } = await q;
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
    async getProductivityByProject(orgId: string | null): Promise<ProductivityByProject[]> {
        let q = supabase
            .from('vw_hr_productivity_by_project')
            .select('org_id, project_id, projeto_nome, hh_total, eficiencia_media_pct, custo_total_mdo, custo_previsto_total, custo_realizado_total, desvio_custo_pct, idc_medio')
            .order('custo_realizado_total', { ascending: false });
        if (orgId && orgId !== 'all') q = q.eq('org_id', orgId);
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
    },

    async getProductivityMetrics(orgId: string | null, limit = 60): Promise<ProductivityMetric[]> {
        let q = supabase
            .from('hr_productivity_metrics')
            .select('id, org_id, project_id, ano_mes, hh_disponivel, hh_produtivo, eficiencia_pct, custo_mdo_direto, custo_mdo_indireto, avanco_fisico_pct, custo_previsto, custo_realizado, idc, headcount_obra, created_at')
            .order('ano_mes', { ascending: false })
            .limit(limit);
        if (orgId && orgId !== 'all') q = q.eq('org_id', orgId);
        const { data, error } = await q;
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
    async getRetentionCohorts(orgId: string | null): Promise<RetentionCohort[]> {
        let q = supabase
            .from('vw_hr_retention_cohorts')
            .select('org_id, coorte_mes, admitidos, ainda_ativos, taxa_retencao_pct, permanencia_media_dias')
            .order('coorte_mes', { ascending: false })
            .limit(24);
        if (orgId && orgId !== 'all') q = q.eq('org_id', orgId);
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
    },

    // METAS
    async getTarget(orgId: string | null, ano: number): Promise<HrTarget | null> {
        // Meta é um registro por organização/ano: em "Todas" não há uma única a devolver.
        if (!orgId || orgId === 'all') return null;
        const { data, error } = await supabase
            .from('hr_targets')
            .select('id, org_id, ano, turnover_max_pct, absenteismo_max_pct, horas_extras_max_pct, eficiencia_min_pct')
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
