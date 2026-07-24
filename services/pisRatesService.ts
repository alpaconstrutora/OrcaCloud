import { supabase } from '../lib/supabase';

export interface PisRate {
    id: string;
    exercicio: number;
    regime_tributario: string;
    aliquota: number;
}

export const pisRatesService = {
    /** Alíquotas oficiais de PIS por exercício/regime — globais, iguais para todas as organizações. */
    async list(): Promise<PisRate[]> {
        const { data, error } = await supabase
            .from('tax_pis_rates')
            .select('id, exercicio, regime_tributario, aliquota')
            .order('exercicio', { ascending: false })
            .order('regime_tributario', { ascending: true });
        if (error) throw error;
        return data ?? [];
    },
};
