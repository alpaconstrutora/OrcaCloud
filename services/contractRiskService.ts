import { supabase } from '../lib/supabase';
import { ContractRiskAssessment } from '../types/contracts';

export type RiskFactors = {
    factor_canteiro: 0 | 1 | 2;
    factor_equipe: 0 | 1 | 2;
    factor_sst: 0 | 1 | 2;
    factor_valor: 0 | 1 | 2;
    factor_tecnica: 0 | 1 | 2;
    factor_dados: 0 | 1 | 2;
    factor_continuidade: 0 | 1 | 2;
    factor_pf: 0 | 1 | 2;
};

export const contractRiskService = {
    get: async (contractId: string): Promise<ContractRiskAssessment | null> => {
        const { data, error } = await supabase
            .from('contract_risk_assessments')
            .select('*')
            .eq('contract_id', contractId)
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    /** Cria ou atualiza a avaliação de risco (uma por contrato — Manual §3) */
    assess: async (payload: RiskFactors & { organization_id: string; contract_id: string; assessed_by?: string; notes?: string }): Promise<ContractRiskAssessment> => {
        const { data, error } = await supabase
            .from('contract_risk_assessments')
            .upsert({ ...payload, assessed_at: new Date().toISOString() }, { onConflict: 'contract_id' })
            .select()
            .single();
        if (error) throw error;
        return data;
    },
};
