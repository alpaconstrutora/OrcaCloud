import { supabase } from '../lib/supabase';

export interface ContractTemplate {
    id: string;
    organization_id: string;
    name: string;
    description?: string;
    contract_type?: string;
    body_html: string;
    variables: string[];
    version: number;
    is_active: boolean;
    created_by?: string;
    created_at: string;
    updated_at: string;
}

// Variáveis padrão disponíveis para substituição
export const TEMPLATE_VARIABLES: { key: string; label: string }[] = [
    { key: 'NUMERO',          label: 'Número do contrato' },
    { key: 'TITULO',          label: 'Título' },
    { key: 'CLIENTE',         label: 'Cliente / Fornecedor' },
    { key: 'OBRA',            label: 'Nome da obra' },
    { key: 'RESPONSAVEL',     label: 'Responsável' },
    { key: 'VALOR_TOTAL',     label: 'Valor total (R$)' },
    { key: 'DATA_INICIO',     label: 'Data de início' },
    { key: 'DATA_FIM',        label: 'Data de término' },
    { key: 'PRAZO_DIAS',      label: 'Prazo em dias' },
    { key: 'TIPO',            label: 'Tipo de contrato' },
    { key: 'NATUREZA',        label: 'Natureza' },
    { key: 'INDICE_REAJUSTE', label: 'Índice de reajuste' },
    { key: 'RETENCAO_PCT',    label: 'Retenção (%)' },
    { key: 'CENTRO_CUSTO',    label: 'Centro de custo' },
    { key: 'DATA_HOJE',       label: 'Data de hoje' },
];

/** Substitui variáveis {{CHAVE}} pelo valor correspondente do contrato */
export function renderTemplate(bodyHtml: string, variables: Record<string, string>): string {
    return bodyHtml.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}

/** Monta o mapa de variáveis a partir de um contrato */
export function buildVariableMap(contract: {
    number: string; title: string; start_date: string; end_date?: string;
    original_value: number; contract_type?: string; nature?: string;
    reajuste_index?: string; retention_rate: number;
}, supplierName?: string, projectName?: string): Record<string, string> {
    const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
    const days = contract.end_date
        ? Math.ceil((new Date(contract.end_date).getTime() - new Date(contract.start_date).getTime()) / 86400000)
        : 0;
    return {
        NUMERO:          contract.number,
        TITULO:          contract.title,
        CLIENTE:         supplierName ?? '',
        OBRA:            projectName ?? '',
        RESPONSAVEL:     '',
        VALOR_TOTAL:     fmt(contract.original_value),
        DATA_INICIO:     fmtDate(contract.start_date),
        DATA_FIM:        contract.end_date ? fmtDate(contract.end_date) : '',
        PRAZO_DIAS:      days.toString(),
        TIPO:            contract.contract_type ?? '',
        NATUREZA:        contract.nature ?? '',
        INDICE_REAJUSTE: contract.reajuste_index ?? '',
        RETENCAO_PCT:    contract.retention_rate.toString(),
        CENTRO_CUSTO:    '',
        DATA_HOJE:       new Date().toLocaleDateString('pt-BR'),
    };
}

export const contractTemplateService = {
    list: async (organizationId: string): Promise<ContractTemplate[]> => {
        const { data, error } = await supabase
            .from('contract_templates')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('is_active', true)
            .order('name');
        if (error) throw error;
        return data ?? [];
    },

    get: async (id: string): Promise<ContractTemplate | null> => {
        const { data, error } = await supabase
            .from('contract_templates')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    create: async (
        organizationId: string,
        payload: Pick<ContractTemplate, 'name' | 'description' | 'contract_type' | 'body_html' | 'variables'>
    ): Promise<ContractTemplate> => {
        const { data, error } = await supabase
            .from('contract_templates')
            .insert({ ...payload, organization_id: organizationId })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    update: async (id: string, payload: Partial<Pick<ContractTemplate, 'name' | 'description' | 'body_html' | 'variables' | 'is_active'>>): Promise<ContractTemplate> => {
        const { data, error } = await supabase
            .from('contract_templates')
            .update({ ...payload, version: supabase.rpc as unknown as number })  // bump handled client-side
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    save: async (organizationId: string, id: string | null, payload: Pick<ContractTemplate, 'name' | 'description' | 'contract_type' | 'body_html' | 'variables'>): Promise<ContractTemplate> => {
        if (id) {
            const { data, error } = await supabase
                .from('contract_templates')
                .update(payload)
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        }
        return contractTemplateService.create(organizationId, payload);
    },

    deactivate: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('contract_templates')
            .update({ is_active: false })
            .eq('id', id);
        if (error) throw error;
    },
};
