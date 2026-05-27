import { supabase } from '../lib/supabase';
import { SupplierBankAccount } from '../types';

export const supplierBankAccountService = {

    /**
     * Lista todas as contas bancárias ativas de um fornecedor
     */
    listBySupplier: async (supplierId: string): Promise<SupplierBankAccount[]> => {
        const { data, error } = await supabase
            .from('supplier_bank_accounts')
            .select('*')
            .eq('supplier_id', supplierId)
            .eq('status', 'ativo')
            .order('is_primary', { ascending: false })
            .order('created_at', { ascending: true });

        if (error) throw error;
        return (data as SupplierBankAccount[]) || [];
    },

    /**
     * Lista TODAS as contas (ativas e inativas) de um fornecedor
     */
    listAllBySupplier: async (supplierId: string): Promise<SupplierBankAccount[]> => {
        const { data, error } = await supabase
            .from('supplier_bank_accounts')
            .select('*')
            .eq('supplier_id', supplierId)
            .order('is_primary', { ascending: false })
            .order('created_at', { ascending: true });

        if (error) throw error;
        return (data as SupplierBankAccount[]) || [];
    },

    /**
     * Retorna a conta principal ativa de um fornecedor (para integração com pagamentos)
     */
    getPrimaryAccount: async (supplierId: string): Promise<SupplierBankAccount | null> => {
        const { data, error } = await supabase
            .from('supplier_bank_accounts')
            .select('*')
            .eq('supplier_id', supplierId)
            .eq('is_primary', true)
            .eq('status', 'ativo')
            .maybeSingle();

        if (error) throw error;
        return data as SupplierBankAccount | null;
    },

    /**
     * Adiciona nova conta bancária.
     * Se is_primary = true, desativa a flag nas demais contas do fornecedor.
     * Se is_pix_primary = true, desativa a flag PIX nas demais.
     */
    add: async (
        accountData: Omit<SupplierBankAccount, 'id' | 'created_at' | 'updated_at'>
    ): Promise<SupplierBankAccount> => {
        // Remove unicidade de conta principal se necessário
        if (accountData.is_primary) {
            await supabase
                .from('supplier_bank_accounts')
                .update({ is_primary: false })
                .eq('supplier_id', accountData.supplier_id)
                .eq('is_primary', true);
        }

        // Remove unicidade de PIX principal se necessário
        if (accountData.is_pix_primary) {
            await supabase
                .from('supplier_bank_accounts')
                .update({ is_pix_primary: false })
                .eq('supplier_id', accountData.supplier_id)
                .eq('is_pix_primary', true);
        }

        const { data, error } = await supabase
            .from('supplier_bank_accounts')
            .insert(accountData)
            .select()
            .single();

        if (error) throw error;
        return data as SupplierBankAccount;
    },

    /**
     * Atualiza conta bancária existente.
     * Gerencia unicidade de is_primary e is_pix_primary automaticamente.
     */
    update: async (
        id: string,
        updates: Partial<Omit<SupplierBankAccount, 'id' | 'created_at'>>
    ): Promise<SupplierBankAccount> => {
        // Busca a conta atual para saber o supplier_id
        const { data: current, error: fetchError } = await supabase
            .from('supplier_bank_accounts')
            .select('supplier_id')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;
        const supplierId = (current as { supplier_id: string }).supplier_id;

        // Remove unicidade de conta principal se necessário
        if (updates.is_primary === true) {
            await supabase
                .from('supplier_bank_accounts')
                .update({ is_primary: false })
                .eq('supplier_id', supplierId)
                .eq('is_primary', true)
                .neq('id', id);
        }

        // Remove unicidade de PIX principal se necessário
        if (updates.is_pix_primary === true) {
            await supabase
                .from('supplier_bank_accounts')
                .update({ is_pix_primary: false })
                .eq('supplier_id', supplierId)
                .eq('is_pix_primary', true)
                .neq('id', id);
        }

        const { data, error } = await supabase
            .from('supplier_bank_accounts')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as SupplierBankAccount;
    },

    /**
     * Soft delete: marca como inativo (preserva histórico).
     * Se era a conta principal, não promove outra automaticamente — usuário decide.
     */
    remove: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('supplier_bank_accounts')
            .update({
                status: 'inativo',
                is_primary: false,
                is_pix_primary: false,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) throw error;
    },

    /**
     * Deleção física (uso restrito / admin)
     */
    hardDelete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('supplier_bank_accounts')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },
};
