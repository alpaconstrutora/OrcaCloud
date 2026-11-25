import { supabase } from '../lib/supabase';

// Garante que `date` é uma string ISO YYYY-MM-DD antes de interpolar em queries PostgREST.
// Evita injeção via .or() que usa string literal na sintaxe do filtro.
function safeIsoDate(date: string): string {
    return /^\d{4}-\d{2}-\d{2}/.test(date)
        ? date.substring(0, 10)
        : new Date().toISOString().substring(0, 10);
}

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

/**
 * As tabelas fiscais são globais e só superadmin grava (policy com is_superadmin()).
 * A RLS barra UPDATE/DELETE sem erro — 0 linhas — e a tela dizia "atualizada".
 * Sem linha de volta = recusado.
 */
function exigirLinha(data: unknown[] | null) {
    if (!data?.length) throw new Error('O banco recusou a gravação — só o superadmin altera as tabelas oficiais.');
}

export const fiscalService = {
    /**
     * Primeiro ano com vigência cadastrada na tabela — o seletor de ano da tela
     * começa nele (até 24/11/2026 começava fixo em 2023 e escondia o IRRF de
     * 04/2015 a 04/2023, que existe e é usado pelas locações). null = vazia.
     */
    async primeiroAnoDaTabela(tabela: 'inss' | 'irrf' | 'fgts'): Promise<number | null> {
        const nome = tabela === 'inss' ? 'inss_brackets' : tabela === 'irrf' ? 'irrf_brackets' : 'fgts_config';
        const { data, error } = await supabase
            .from(nome)
            .select('valid_from')
            .order('valid_from', { ascending: true })
            .limit(1);
        if (error) throw error;
        const de = (data?.[0] as { valid_from?: string } | undefined)?.valid_from;
        return de ? Number(de.slice(0, 4)) : null;
    },

    /**
     * Busca as faixas de INSS válidas para uma determinada data (competência)
     */
    async getINSSBrackets(date: string): Promise<INSSBracket[]> {
        console.log(`[fiscalService] Buscando INSS para data: ${date}`);
        const { data, error } = await supabase
            .from('inss_brackets')
            .select('id, valid_from, valid_to, min_value, max_value, rate, deduction')
            .lte('valid_from', date)
            .or(`valid_to.is.null,valid_to.gte."${safeIsoDate(date)}"`)
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
            .select('id, valid_from, valid_to, min_value, max_value, rate, deduction')
            .lte('valid_from', date)
            .or(`valid_to.is.null,valid_to.gte."${safeIsoDate(date)}"`)
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
            .select('id, valid_from, valid_to, rate')
            .lte('valid_from', date)
            .or(`valid_to.is.null,valid_to.gte."${safeIsoDate(date)}"`)
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
        const { data, error } = await supabase
            .from('inss_brackets')
            .update(bracket)
            .eq('id', id)
            .select('id');
        if (error) throw error;
        exigirLinha(data);
    },

    async updateIRRFBracket(id: string, bracket: Partial<IRRFBracket>) {
        const { data, error } = await supabase
            .from('irrf_brackets')
            .update(bracket)
            .eq('id', id)
            .select('id');
        if (error) throw error;
        exigirLinha(data);
    },

    async updateFGTSConfig(id: string, config: Partial<FGTSConfig>) {
        const { data, error } = await supabase
            .from('fgts_config')
            .update(config)
            .eq('id', id)
            .select('id');
        if (error) throw error;
        exigirLinha(data);
    },

    async deleteINSSBracket(id: string) {
        const { data, error } = await supabase
            .from('inss_brackets')
            .delete()
            .eq('id', id)
            .select('id');
        if (error) throw error;
        exigirLinha(data);
    },

    async deleteIRRFBracket(id: string) {
        const { data, error } = await supabase
            .from('irrf_brackets')
            .delete()
            .eq('id', id)
            .select('id');
        if (error) throw error;
        exigirLinha(data);
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
