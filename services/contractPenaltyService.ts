import { supabase } from '../lib/supabase';
import { ContractPenalty } from '../types/contracts';

const CURE_DEFAULT_BUSINESS_DAYS = 3;

const addBusinessDays = (from: Date, days: number): string => {
    const d = new Date(from);
    let added = 0;
    while (added < days) {
        d.setDate(d.getDate() + 1);
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) added++;
    }
    return d.toISOString().split('T')[0];
};

export const contractPenaltyService = {
    list: async (contractId: string): Promise<ContractPenalty[]> => {
        const { data, error } = await supabase
            .from('contract_penalties')
            .select('*')
            .eq('contract_id', contractId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data ?? [];
    },

    /** Notifica uma penalidade — abre o prazo de cura de 3 dias úteis (Cl.31.1) */
    notify: async (payload: Partial<ContractPenalty> & { organization_id: string; contract_id: string; kind: ContractPenalty['kind']; reason: string; amount: number }): Promise<ContractPenalty> => {
        const cureDeadline = payload.cure_deadline ?? addBusinessDays(new Date(), CURE_DEFAULT_BUSINESS_DAYS);
        const { data, error } = await supabase
            .from('contract_penalties')
            .insert({ ...payload, status: 'NOTIFICADA', cure_deadline: cureDeadline })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    /** Encerra o prazo de cura sem aplicar — a correção foi aceita */
    cure: async (id: string): Promise<ContractPenalty> => {
        const { data, error } = await supabase
            .from('contract_penalties')
            .update({ status: 'CANCELADA', notes: 'Cura aceita — penalidade não aplicada.' })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    /** Aplica a penalidade (findo o prazo de cura sem correção) */
    apply: async (id: string): Promise<ContractPenalty> => {
        const { data, error } = await supabase
            .from('contract_penalties')
            .update({ status: 'APLICADA', applied_at: new Date().toISOString().split('T')[0] })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    cancel: async (id: string, notes?: string): Promise<ContractPenalty> => {
        const { data, error } = await supabase
            .from('contract_penalties')
            .update({ status: 'CANCELADA', notes })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    /** Compensa uma penalidade aplicada na próxima medição — abate o net_value */
    compensateInMeasurement: async (penaltyId: string, measurementId: string): Promise<ContractPenalty> => {
        const { data, error } = await supabase
            .from('contract_penalties')
            .update({ compensated_measurement_id: measurementId })
            .eq('id', penaltyId)
            .eq('status', 'APLICADA')
            .select()
            .single();
        if (error) throw error;
        return data;
    },
};
