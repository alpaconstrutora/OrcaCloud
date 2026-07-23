import { supabase } from '../lib/supabase';

export interface TaxSetting {
    id: string;
    organization_id: string;
    nome: string;
    aliquota: number | null;
    base_calculo: string | null;
    regra_retencao: string | null;
    ativo: boolean;
}

export interface TaxSettingInput {
    nome: string;
    aliquota: number | null;
    base_calculo: string | null;
    regra_retencao: string | null;
    ativo: boolean;
}

// Módulos padrão do grupo "Tributos e Impostos" — usados só para o
// preenchimento inicial (botão "Criar tributos padrão"); depois disso a
// tabela é um catálogo livre por organização.
export const DEFAULT_TAX_MODULES: string[] = ['Imposto de Renda', 'PIS', 'COFINS', 'CSLL', 'IRRF'];

export const taxSettingsService = {
    async list(organizationId: string): Promise<TaxSetting[]> {
        const { data, error } = await supabase
            .from('tax_settings')
            .select('id, organization_id, nome, aliquota, base_calculo, regra_retencao, ativo')
            .eq('organization_id', organizationId)
            .order('nome');
        if (error) throw error;
        return data ?? [];
    },

    async create(organizationId: string, input: TaxSettingInput): Promise<TaxSetting> {
        const { data, error } = await supabase
            .from('tax_settings')
            .insert({ organization_id: organizationId, ...input })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async update(id: string, input: Partial<TaxSettingInput>): Promise<TaxSetting> {
        const { data, error } = await supabase
            .from('tax_settings')
            .update({ ...input, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('tax_settings').delete().eq('id', id);
        if (error) throw error;
    },

    /** Cria os módulos padrão (Imposto de Renda, PIS, COFINS, CSLL, IRRF) que ainda não existirem para a org. */
    async seedDefaults(organizationId: string): Promise<number> {
        const existing = await this.list(organizationId);
        const existingNames = new Set(existing.map(t => t.nome));
        const toCreate = DEFAULT_TAX_MODULES.filter(nome => !existingNames.has(nome));
        if (toCreate.length === 0) return 0;

        const rows = toCreate.map(nome => ({
            organization_id: organizationId,
            nome,
            aliquota: null,
            base_calculo: null,
            regra_retencao: null,
            ativo: true,
        }));
        const { error } = await supabase.from('tax_settings').insert(rows);
        if (error) throw error;
        return toCreate.length;
    },
};
