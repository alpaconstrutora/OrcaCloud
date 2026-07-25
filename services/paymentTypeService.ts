import { supabase } from '../lib/supabase';
import { PaymentType } from '../types';
import { DEFAULT_PAYMENT_TYPES, slugPaymentTypeCode } from '../constants/paymentTypes';

/**
 * Mescla os registros do banco com os Tipos de Pagamento padrão do sistema
 * (defaults que ainda não foram importados aparecem como "Global", somente
 * leitura, com id sintético `default-<code>`). Mesmo padrão de
 * `services/clientCategoryService.ts`.
 */
const withDefaultPaymentTypes = (rows: PaymentType[], organizationId?: string): PaymentType[] => {
    const existingCodes = new Set(rows.map(r => (r.code || '').toUpperCase()).filter(Boolean));
    const existingNames = new Set(rows.map(r => r.name.trim().toLocaleLowerCase('pt-BR')));
    const defaults: PaymentType[] = DEFAULT_PAYMENT_TYPES
        .filter(d => !existingCodes.has(d.code) && !existingNames.has(d.name.toLocaleLowerCase('pt-BR')))
        .map(d => ({
            id: `default-${d.code.toLowerCase()}`,
            name: d.name,
            code: d.code,
            interval_months: d.interval_months,
            generates_series: d.generates_series,
            active: true,
            organization_id: organizationId,
        }));
    return [...rows, ...defaults];
};

export const paymentTypeService = {
    // REGRA #5: aceita organizationId nulo ("Todas as organizações") e só aplica
    // o filtro quando presente — deixando a RLS filtrar pelas orgs do usuário.
    async listTypes(organizationId?: string): Promise<PaymentType[]> {
        let query = supabase.from('payment_types').select('*');
        if (organizationId) query = query.eq('organization_id', organizationId);

        const { data, error } = await query;
        if (error) {
            console.error('[paymentTypeService.listTypes] Erro:', error);
            throw new Error(`Erro ao listar tipos de pagamento: ${error.message}`);
        }
        return withDefaultPaymentTypes(data || [], organizationId);
    },

    async createType(input: { name: string; organization_id: string }): Promise<PaymentType> {
        const payload = {
            name: input.name,
            code: slugPaymentTypeCode(input.name),
            interval_months: null,
            generates_series: false,
            active: true,
            organization_id: input.organization_id,
        };
        const { data, error } = await supabase
            .from('payment_types')
            .insert(payload)
            .select('*')
            .single();
        if (error) {
            console.error('[paymentTypeService.createType] Erro:', error);
            throw new Error(`Erro ao criar tipo de pagamento: ${error.message}`);
        }
        return data;
    },

    async createTypes(rows: Omit<PaymentType, 'id' | 'created_at'>[]): Promise<PaymentType[]> {
        if (rows.length === 0) return [];
        const { data, error } = await supabase
            .from('payment_types')
            .insert(rows)
            .select('*');
        if (error) {
            console.error('[paymentTypeService.createTypes] Erro:', error);
            throw new Error(`Erro ao importar tipos de pagamento: ${error.message}`);
        }
        return data || [];
    },

    async updateType(id: string, updates: { name: string }): Promise<PaymentType> {
        const { data, error } = await supabase
            .from('payment_types')
            .update({ name: updates.name })
            .eq('id', id)
            .select('*')
            .single();
        if (error) {
            console.error('[paymentTypeService.updateType] Erro:', error);
            throw new Error(`Erro ao atualizar tipo de pagamento: ${error.message}`);
        }
        return data;
    },

    async deleteType(id: string): Promise<void> {
        const { error } = await supabase
            .from('payment_types')
            .delete()
            .eq('id', id);
        if (error) {
            console.error('[paymentTypeService.deleteType] Erro:', error);
            throw new Error(`Erro ao excluir tipo de pagamento: ${error.message}`);
        }
    },
};
