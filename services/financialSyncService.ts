import { supabase } from '../lib/supabase';
import { FinancialInfo, ProjectSettings } from '../types';

export const financialSyncService = {
    /**
     * Sincroniza os dados financeiros do projeto (parcelas e transações manuais)
     * com a tabela central de transações internas para conciliação.
     */
    async syncFinancialData(project: { id?: string; name: string; settings?: ProjectSettings }, organizationId: string) {
        if (!project || !organizationId) return;

        const settings = project.settings as ProjectSettings;
        const info = settings.financialInfo;
        if (!info) return;

        // Dimensão obra: só carimba quando há um project.id real (vaults org-level ficam null)
        const projectId = project.id ?? null;

        // Vault comercial é isento do hard-lock de período fechado (decisão de produto):
        // marca source_system='COMMERCIAL' para a trigger trg_block_period_internal_tx liberar.
        const sourceSystem = project.name === 'Gestão Comercial' ? 'COMMERCIAL' : 'PROJECT';

        const internalTxs: Record<string, unknown>[] = [];

        // 1. Processar Parcelas (Receitas)
        if (info.installments && info.installments.length > 0) {
            info.installments.forEach(inst => {
                internalTxs.push({
                    organization_id: organizationId,
                    source_system: sourceSystem,
                    reference_id: inst.id,
                    project_id: projectId,
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
                    source_system: sourceSystem,
                    reference_id: tx.id,
                    project_id: projectId,
                    transaction_date: tx.date,
                    amount: tx.value,
                    direction: tx.type === 'INCOME' ? 'CREDIT' : 'DEBIT',
                    description: tx.description || `Despesa - ${project.name}`,
                    entity_name: tx.supplier,
                    // Ponte ÒPURA: custo de obra carrega o fornecedor (FK) capturado no form.
                    supplier_id: tx.type === 'EXPENSE' ? (tx.supplierId || null) : null,
                    category: tx.category || 'Despesa de Obra',
                    status: tx.status === 'PAID' ? 'CONCILIATED' : 'PENDING'
                });
            });
        }

        if (internalTxs.length === 0) return;

        try {
            // Enriquecer category_id a partir do nome da categoria
            const categoryNames = [...new Set(internalTxs.map(tx => tx.category as string).filter(Boolean))];
            let catMap: Record<string, string> = {};
            if (categoryNames.length > 0) {
                const { data: cats } = await supabase
                    .from('financial_categories')
                    .select('id, name')
                    .in('name', categoryNames);
                if (cats) catMap = Object.fromEntries(cats.map(c => [c.name, c.id]));
            }
            const enrichedTxs = internalTxs.map(tx => ({
                ...tx,
                category_id: catMap[tx.category as string] ?? null,
            }));

            const { error } = await supabase
                .from('internal_transactions')
                .upsert(enrichedTxs, { onConflict: 'organization_id,reference_id' });

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
