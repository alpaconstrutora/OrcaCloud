import { supabase } from '../lib/supabase';

export interface InssBracket {
    id: string;
    exercicio: number;
    base_de: number;
    base_ate: number;
    aliquota: number;
}

export const inssBracketsService = {
    /** Tabela oficial de faixas do INSS — global, mesma para todas as organizações. */
    async list(): Promise<InssBracket[]> {
        const { data, error } = await supabase
            .from('tax_inss_brackets')
            .select('id, exercicio, base_de, base_ate, aliquota')
            .order('exercicio', { ascending: false })
            .order('base_de', { ascending: true });
        if (error) throw error;
        return data ?? [];
    },
};
