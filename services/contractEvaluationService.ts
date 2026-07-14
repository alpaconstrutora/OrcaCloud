import { supabase } from '../lib/supabase';
import { ContractEvaluation, SupplierPerformance } from '../types/contracts';

export type EvaluationScores = {
    score_quality: number;
    score_deadline: number;
    score_sst: number;
    score_compliance: number;
    score_communication: number;
    score_commercial: number;
    critical_occurrence: boolean;
};

export const contractEvaluationService = {
    list: async (contractId: string): Promise<ContractEvaluation[]> => {
        const { data, error } = await supabase
            .from('contract_evaluations')
            .select('*')
            .eq('contract_id', contractId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data ?? [];
    },

    save: async (payload: EvaluationScores & { organization_id: string; contract_id: string; supplier_id?: string; period?: string; evaluated_by?: string; notes?: string }): Promise<ContractEvaluation> => {
        const { data, error } = await supabase
            .from('contract_evaluations')
            .insert(payload)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    /** Nota média + bloqueio (Manual §17.1) — usado no cadastro do Fornecedor */
    getSupplierPerformance: async (supplierId: string): Promise<SupplierPerformance> => {
        const { data, error } = await supabase
            .rpc('fn_supplier_performance', { p_supplier_id: supplierId })
            .single();
        if (error) throw error;
        return data as SupplierPerformance;
    },
};
