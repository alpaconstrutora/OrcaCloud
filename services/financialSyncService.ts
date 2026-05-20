import { supabase } from '../lib/supabase';
import { FinancialInfo, ProjectSettings } from '../types';

export const financialSyncService = {
    /**
     * Sincroniza os dados financeiros do projeto (parcelas e transações manuais)
     * com a tabela central de transações internas para conciliação.
     */
    async syncFinancialData(project: { name: string; settings?: ProjectSettings }, organizationId: string) {
        if (!project || !organizationId) return;

        const settings = project.settings as ProjectSettings;
        const info = settings.financialInfo;
        if (!info) return;

        const internalTxs: Record<string, unknown>[] = [];

        // 1. Processar Parcelas (Receitas)
        if (info.installments && info.installments.length > 0) {
            info.installments.forEach(inst => {
                internalTxs.push({
                    organization_id: organizationId,
                    source_system: 'PROJECT',
                    reference_id: inst.id,
                    transaction_date: inst.dueDate,
                    amount: inst.value,
                    direction: 'CREDIT',
                    description: inst.description || `Parcela - ${project.name}`,
                    entity_name: inst.clientName,
                    category: (inst as unknown as Record<string, unknown>).category || 'Receita de Obra',
                    status: inst.status === 'PAID' ? 'CONCILIATED' : 'PENDING'
                });
            });
        }

        // 2. Processar Transações Manuais (Despesas)
        if (info.transactions && info.transactions.length > 0) {
            info.transactions.forEach(tx => {
                internalTxs.push({
                    organization_id: organizationId,
                    source_system: 'PROJECT',
                    reference_id: tx.id,
                    transaction_date: tx.date,
                    amount: tx.value,
                    direction: tx.type === 'INCOME' ? 'CREDIT' : 'DEBIT',
                    description: tx.description || `Despesa - ${project.name}`,
                    entity_name: tx.supplier,
                    category: tx.category || 'Despesa de Obra',
                    status: tx.status === 'PAID' ? 'CONCILIATED' : 'PENDING'
                });
            });
        }

        if (internalTxs.length === 0) return;

        try {
            // Upsert para evitar duplicidade baseado no reference_id (ID da parcela/tx manual)
            // Nota: O reference_id deve ser único no contexto de PROJECT
            const { error } = await supabase
                .from('internal_transactions')
                .upsert(internalTxs, { onConflict: 'organization_id,reference_id' });

            if (error) {
                console.error('[FINANCIAL-SYNC] Error during upsert:', error);
                throw error;
            }

            console.log(`[FINANCIAL-SYNC] Sincronizados ${internalTxs.length} registros para o projeto: ${project.name}`);
        } catch (err) {
            console.error('[FINANCIAL-SYNC] Failed to sync to internal_transactions:', err);
        }
    }
};
