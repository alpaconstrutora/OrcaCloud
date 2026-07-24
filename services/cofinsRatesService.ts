import { supabase } from '../lib/supabase';

export interface CofinsRate {
    id: string;
    exercicio: number;
    regime_tributario: string;
    aliquota: number;
}

export const cofinsRatesService = {
    /** Alíquotas oficiais de COFINS por exercício/regime — globais, iguais para todas as organizações. */
    async list(): Promise<CofinsRate[]> {
        const { data, error } = await supabase
            .from('tax_cofins_rates')
            .select('id, exercicio, regime_tributario, aliquota')
            .order('exercicio', { ascending: false })
            .order('regime_tributario', { ascending: true });
        if (error) throw error;
        return data ?? [];
    },
};
