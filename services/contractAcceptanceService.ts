import { supabase } from '../lib/supabase';
import { ContractAcceptance, AcceptancePendingItem, AcceptanceKind } from '../types/contracts';

export const contractAcceptanceService = {
    list: async (contractId: string): Promise<ContractAcceptance[]> => {
        const { data, error } = await supabase
            .from('contract_acceptances')
            .select('*')
            .eq('contract_id', contractId)
            .order('issued_at', { ascending: false });
        if (error) throw error;
        return data ?? [];
    },

    /**
     * Emite o termo de recebimento (provisório ou definitivo). O definitivo
     * também move o contrato para "Concluído" e é o gatilho para liberar a
     * retenção definitiva (contractService.releaseRetention) — a UI decide
     * se libera automaticamente ou deixa para o usuário confirmar o valor.
     */
    issue: async (payload: {
        organization_id: string;
        contract_id: string;
        kind: AcceptanceKind;
        pending_items?: AcceptancePendingItem[];
        issued_by?: string;
        notes?: string;
    }): Promise<ContractAcceptance> => {
        const { data, error } = await supabase
            .from('contract_acceptances')
            .insert({
                ...payload,
                pending_items: payload.pending_items ?? [],
                issued_at: new Date().toISOString().split('T')[0],
            })
            .select()
            .single();
        if (error) throw error;

        if (payload.kind === 'DEFINITIVO') {
            await supabase.from('contracts').update({ status: 'Concluído' }).eq('id', payload.contract_id);
        }

        return data;
    },
};
