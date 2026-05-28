import { supabase } from '../lib/supabase';

// ── TYPES ─────────────────────────────────────────────────────────────────────

export type CycleTipo = '90' | '180' | '360' | 'SELF';
export type CycleStatus = 'RASCUNHO' | 'ATIVO' | 'ENCERRADO';
export type ResponseTipo = 'SELF' | 'GESTOR' | 'PAR' | 'SUBORDINADO';
export type ResponseStatus = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA';
export type Classificacao = 'DESTAQUE' | 'ACIMA' | 'ESPERADO' | 'ABAIXO' | 'CRITICO';
export type PdiStatus = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'CANCELADO';

export interface Competencia {
    id: string;
    nome: string;
    descricao?: string;
    peso: number; // 1-5
    categoria?: string;
}

export interface RespostaItem {
    competencia_id: string;
    nota: number; // 1-5
    comentario?: string;
}

export interface EvaluationCycle {
    id: string;
    org_id: string;
    nome: string;
    descricao?: string;
    tipo: CycleTipo;
    periodo_inicio: string;
    periodo_fim: string;
    status: CycleStatus;
    competencias: Competencia[];
    created_at?: string;
    updated_at?: string;
    // computed
    total_respostas?: number;
    respostas_concluidas?: number;
    total_avaliados?: number;
}

export interface EvaluationResponse {
    id: string;
    org_id: string;
    cycle_id: string;
    evaluatee_id: string;
    evaluatee_nome?: string;
    evaluator_id?: string;
    evaluator_nome?: string;
    tipo: ResponseTipo;
    respostas: RespostaItem[];
    nota_media?: number;
    pontos_fortes?: string;
    pontos_melhoria?: string;
    comentario_geral?: string;
    status: ResponseStatus;
    submitted_at?: string;
    created_at?: string;
}

export interface EvaluationResult {
    id: string;
    org_id: string;
    cycle_id: string;
    employee_id: string;
    employee_nome?: string;
    employee_cargo?: string;
    nota_self?: number;
    nota_gestor?: number;
    nota_pares?: number;
    nota_final?: number;
    classificacao?: Classificacao;
    notas_por_comp: Record<string, number>;
    created_at?: string;
}

export interface PdiItem {
    id: string;
    org_id: string;
    employee_id: string;
    employee_nome?: string;
    cycle_id?: string;
    competencia: string;
    descricao?: string;
    acao: string;
    recursos?: string;
    prazo?: string;
    status: PdiStatus;
    progresso_pct: number;
    resultado?: string;
    created_at?: string;
    updated_at?: string;
}

// ── SERVICE ───────────────────────────────────────────────────────────────────

export const evaluationService = {

    // CICLOS
    async getCycles(orgId: string): Promise<EvaluationCycle[]> {
        const { data, error } = await supabase
            .from('evaluation_cycles')
            .select('*')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async createCycle(cycle: Omit<EvaluationCycle, 'id' | 'created_at' | 'updated_at'>): Promise<EvaluationCycle> {
        const { data, error } = await supabase
            .from('evaluation_cycles')
            .insert(cycle)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateCycle(id: string, patch: Partial<EvaluationCycle>): Promise<void> {
        const { error } = await supabase
            .from('evaluation_cycles')
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
    },

    async deleteCycle(id: string): Promise<void> {
        const { error } = await supabase
            .from('evaluation_cycles')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    // RESPOSTAS
    async getResponsesByCycle(cycleId: string): Promise<EvaluationResponse[]> {
        const { data, error } = await supabase
            .from('evaluation_responses')
            .select(`
                *,
                evaluatee:employees!evaluatee_id(id, name),
                evaluator:employees!evaluator_id(id, name)
            `)
            .eq('cycle_id', cycleId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []).map((r: any) => ({
            ...r,
            evaluatee_nome: r.evaluatee?.name,
            evaluator_nome: r.evaluator?.name,
        }));
    },

    async getMyPendingResponses(orgId: string, employeeId: string): Promise<EvaluationResponse[]> {
        const { data, error } = await supabase
            .from('evaluation_responses')
            .select(`*, evaluatee:employees!evaluatee_id(id, name), cycle:evaluation_cycles(nome)`)
            .eq('org_id', orgId)
            .eq('evaluator_id', employeeId)
            .eq('status', 'PENDENTE');
        if (error) throw error;
        return data || [];
    },

    async createResponse(response: Omit<EvaluationResponse, 'id' | 'created_at'>): Promise<EvaluationResponse> {
        const { data, error } = await supabase
            .from('evaluation_responses')
            .insert(response)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async submitResponse(id: string, payload: {
        respostas: RespostaItem[];
        nota_media: number;
        pontos_fortes?: string;
        pontos_melhoria?: string;
        comentario_geral?: string;
    }): Promise<void> {
        const { error } = await supabase
            .from('evaluation_responses')
            .update({
                ...payload,
                status: 'CONCLUIDA',
                submitted_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', id);
        if (error) throw error;
    },

    async createBulkResponses(
        cycleId: string,
        orgId: string,
        competencias: Competencia[],
        pairs: Array<{ evaluatee_id: string; evaluator_id: string | null; tipo: ResponseTipo }>
    ): Promise<number> {
        const rows = pairs.map(p => ({
            org_id: orgId,
            cycle_id: cycleId,
            evaluatee_id: p.evaluatee_id,
            evaluator_id: p.evaluator_id,
            tipo: p.tipo,
            respostas: competencias.map(c => ({ competencia_id: c.id, nota: 0, comentario: '' })),
            status: 'PENDENTE' as ResponseStatus,
        }));
        const { error, count } = await supabase
            .from('evaluation_responses')
            .upsert(rows, { onConflict: 'cycle_id,evaluatee_id,evaluator_id,tipo', ignoreDuplicates: true })
            .select();
        if (error) throw error;
        return count || rows.length;
    },

    // CONSOLIDAR CICLO (RPC)
    async consolidateCycle(cycleId: string): Promise<{ success: boolean; consolidados: number }> {
        const { data, error } = await supabase.rpc('consolidate_evaluation_cycle', { p_cycle_id: cycleId });
        if (error) throw error;
        return data;
    },

    // RESULTADOS
    async getResults(cycleId: string): Promise<EvaluationResult[]> {
        const { data, error } = await supabase
            .from('evaluation_results')
            .select(`*, employee:employees(id, name, role)`)
            .eq('cycle_id', cycleId)
            .order('nota_final', { ascending: false });
        if (error) throw error;
        return (data || []).map((r: any) => ({
            ...r,
            employee_nome: r.employee?.name,
            employee_cargo: r.employee?.role,
        }));
    },

    // PDI
    async getPdiItems(orgId: string, employeeId?: string): Promise<PdiItem[]> {
        let q = supabase
            .from('pdi_items')
            .select(`*, employee:employees(id, name)`)
            .eq('org_id', orgId)
            .order('created_at', { ascending: false });
        if (employeeId) q = q.eq('employee_id', employeeId);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []).map((r: any) => ({ ...r, employee_nome: r.employee?.name }));
    },

    async createPdiItem(item: Omit<PdiItem, 'id' | 'created_at' | 'updated_at'>): Promise<PdiItem> {
        const { data, error } = await supabase
            .from('pdi_items')
            .insert(item)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updatePdiItem(id: string, patch: Partial<PdiItem>): Promise<void> {
        const { error } = await supabase
            .from('pdi_items')
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
    },

    async deletePdiItem(id: string): Promise<void> {
        const { error } = await supabase.from('pdi_items').delete().eq('id', id);
        if (error) throw error;
    },
};
