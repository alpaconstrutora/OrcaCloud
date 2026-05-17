import { supabase } from '../lib/supabase';

export interface INSSBracket {
    id?: string;
    valid_from: string;
    valid_to: string | null;
    min_value: number;
    max_value: number | null;
    rate: number;
    deduction: number;
}

export interface IRRFBracket {
    id?: string;
    valid_from: string;
    valid_to: string | null;
    min_value: number;
    max_value: number | null;
    rate: number;
    deduction: number;
}

export interface FGTSConfig {
    id?: string;
    valid_from: string;
    valid_to: string | null;
    rate: number;
}

export const fiscalService = {
    /**
     * Busca as faixas de INSS válidas para uma determinada data (competência)
     */
    async getINSSBrackets(date: string): Promise<INSSBracket[]> {
        console.log(`[fiscalService] Buscando INSS para data: ${date}`);
        const { data, error } = await supabase
            .from('inss_brackets')
            .select('*')
            .lte('valid_from', date)
            .or(`valid_to.is.null,valid_to.gte."${date}"`)
            .order('min_value', { ascending: true });

        if (error) {
            console.error('[fiscalService] Erro ao buscar INSS:', error);
            throw error;
        }
        console.log(`[fiscalService] Encontradas ${data?.length || 0} faixas de INSS`);
        return data || [];
    },

    /**
     * Busca as faixas de IRRF válidas para uma determinada data
     */
    async getIRRFBrackets(date: string): Promise<IRRFBracket[]> {
        console.log(`[fiscalService] Buscando IRRF para data: ${date}`);
        const { data, error } = await supabase
            .from('irrf_brackets')
            .select('*')
            .lte('valid_from', date)
            .or(`valid_to.is.null,valid_to.gte."${date}"`)
            .order('min_value', { ascending: true });

        if (error) {
            console.error('[fiscalService] Erro ao buscar IRRF:', error);
            throw error;
        }
        console.log(`[fiscalService] Encontradas ${data?.length || 0} faixas de IRRF`);
        return data || [];
    },

    /**
     * Busca a configuração de FGTS válida para uma determinada data
     */
    async getFGTSConfig(date: string): Promise<FGTSConfig | null> {
        console.log(`[fiscalService] Buscando FGTS para data: ${date}`);
        const { data, error } = await supabase
            .from('fgts_config')
            .select('*')
            .lte('valid_from', date)
            .or(`valid_to.is.null,valid_to.gte."${date}"`)
            .order('valid_from', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('[fiscalService] Erro ao buscar FGTS:', error);
            throw error;
        }
        console.log(`[fiscalService] FGTS configurado: ${data ? data.rate * 100 + '%' : 'Não encontrado'}`);
        return data;
    },

    async updateINSSBracket(id: string, bracket: Partial<INSSBracket>) {
        const { error } = await supabase
            .from('inss_brackets')
            .update(bracket)
            .eq('id', id);
        if (error) throw error;
    },

    async updateIRRFBracket(id: string, bracket: Partial<IRRFBracket>) {
        const { error } = await supabase
            .from('irrf_brackets')
            .update(bracket)
            .eq('id', id);
        if (error) throw error;
    },

    async updateFGTSConfig(id: string, config: Partial<FGTSConfig>) {
        const { error } = await supabase
            .from('fgts_config')
            .update(config)
            .eq('id', id);
        if (error) throw error;
    },

    async deleteINSSBracket(id: string) {
        const { error } = await supabase
            .from('inss_brackets')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    async deleteIRRFBracket(id: string) {
        const { error } = await supabase
            .from('irrf_brackets')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    async createINSSBracket(bracket: Omit<INSSBracket, 'id'>) {
        const { data, error } = await supabase
            .from('inss_brackets')
            .insert(bracket)
            .select()
            .single();
        if (error) throw error;
        return data as INSSBracket;
    },

    async createIRRFBracket(bracket: Omit<IRRFBracket, 'id'>) {
        const { data, error } = await supabase
            .from('irrf_brackets')
            .insert(bracket)
            .select()
            .single();
        if (error) throw error;
        return data as IRRFBracket;
    },

    async duplicateYear(sourceYear: number, targetYear: number) {
        const sourceDate = `${sourceYear}-06-01`;
        const targetStart = `${targetYear}-01-01`;
        const targetEnd = `${targetYear}-12-31`;

        const [inss, irrf, fgts] = await Promise.all([
            this.getINSSBrackets(sourceDate),
            this.getIRRFBrackets(sourceDate),
            this.getFGTSConfig(sourceDate)
        ]);

        // Clone INSS
        if (inss.length > 0) {
            const inssRows = inss.map(({ id, ...rest }) => ({
                ...rest,
                valid_from: targetStart,
                valid_to: targetEnd
            }));
            const { error } = await supabase.from('inss_brackets').insert(inssRows);
            if (error) throw error;
        }

        // Clone IRRF
        if (irrf.length > 0) {
            const irrfRows = irrf.map(({ id, ...rest }) => ({
                ...rest,
                valid_from: targetStart,
                valid_to: targetEnd
            }));
            const { error } = await supabase.from('irrf_brackets').insert(irrfRows);
            if (error) throw error;
        }

        // Clone FGTS
        if (fgts) {
            const { id, ...rest } = fgts;
            const { error } = await supabase.from('fgts_config').insert({
                ...rest,
                valid_from: targetStart,
                valid_to: targetEnd
            });
            if (error) throw error;
        }
    }
};
