import { supabase } from '../lib/supabase';
import { ContractLaborQuestionnaire } from '../types/contracts';

export type LaborQuestionnaireAnswers = {
    q_horario: boolean;
    q_ordens: boolean;
    q_pessoalidade: boolean;
    q_salario_fixo: boolean;
    q_permanente: boolean;
    q_exclusividade: boolean;
    q_cargo_email: boolean;
    q_ferias: boolean;
};

/** Manual Interno §8 — dois ou mais alertas exigem parecer jurídico antes de contratar PF */
export const LABOR_ALERT_THRESHOLD = 2;

export const contractLaborQuestionnaireService = {
    get: async (contractId: string): Promise<ContractLaborQuestionnaire | null> => {
        const { data, error } = await supabase
            .from('contract_labor_questionnaires')
            .select('*')
            .eq('contract_id', contractId)
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    answer: async (payload: LaborQuestionnaireAnswers & { organization_id: string; contract_id: string; answered_by?: string; legal_opinion_url?: string }): Promise<ContractLaborQuestionnaire> => {
        const { data, error } = await supabase
            .from('contract_labor_questionnaires')
            .upsert({ ...payload, answered_at: new Date().toISOString() }, { onConflict: 'contract_id' })
            .select()
            .single();
        if (error) throw error;
        return data;
    },
};
