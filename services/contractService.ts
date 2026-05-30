import { supabase } from '../lib/supabase';
import { financialService } from './financialService';
import {
    Contract,
    ContractItem,
    ContractAddendum,
    ContractMeasurement,
    ContractMeasurementItem,
    ContractUtilityBill
} from '../types';

// Resolve supplier name from DB (returns fallback string on error)
async function resolveSupplierName(supplierId: string | undefined, fallback: string): Promise<string> {
    if (!supplierId) return fallback;
    try {
        const { data } = await supabase.from('suppliers').select('name').eq('id', supplierId).maybeSingle();
        return data?.name || fallback;
    } catch { return fallback; }
}

// Find the "Gestão Comercial" vault for an org
async function findVault(orgId: string) {
    const { data } = await supabase
        .from('projects')
        .select('*')
        .eq('name', 'Gestão Comercial')
        .filter('settings->>organizationId', 'eq', orgId)
        .order('created_at', { ascending: false })
        .limit(1);
    return data?.[0] ?? null;
}

// Remove all transactions tagged [contract:id] from project JSONB (priority) or vault (fallback)
async function removeContractTransactions(contractId: string, orgId: string | undefined, projectId: string | undefined) {
    const tag = `[contract:${contractId}]`;
    // Priority 1: project JSONB
    if (projectId) {
        try {
            const { projectService } = await import('./projectService');
            const project = await projectService.loadProject(projectId);
            if (project) {
                const info = (project.settings as any)?.financialInfo;
                if (info) {
                    const cleaned = (info.transactions || []).filter((t: any) => !(t.notes || '').includes(tag));
                    if (cleaned.length !== (info.transactions || []).length) {
                        await projectService.saveProject({ ...project, settings: { ...project.settings, financialInfo: { ...info, transactions: cleaned } } });
                    }
                }
                return;
            }
        } catch (e) { console.error('[CONTRACTS] removeContractTransactions project error:', e); }
    }
    // Fallback: vault
    if (orgId) {
        try {
            const vault = await findVault(orgId);
            if (vault) {
                const vaultInfo = vault.settings?.financialInfo;
                if (!vaultInfo) return;
                const cleaned = (vaultInfo.transactions || []).filter((t: any) => !(t.notes || '').includes(tag));
                if (cleaned.length !== (vaultInfo.transactions || []).length) {
                    await supabase.from('projects').update({
                        settings: { ...vault.settings, financialInfo: { ...vaultInfo, transactions: cleaned } }
                    }).eq('id', vault.id);
                }
            }
        } catch (e) { console.error('[CONTRACTS] removeContractTransactions vault error:', e); }
    }
}

// Returns all measurement IDs for a contract (used to clean up measurement-based transactions)
async function getContractMeasurementIds(contractId: string): Promise<string[]> {
    try {
        const { data } = await supabase
            .from('contract_measurements')
            .select('id')
            .eq('contract_id', contractId);
        return (data || []).map((r: any) => r.id);
    } catch { return []; }
}

// Removes all transactions belonging to this contract: tag-based OR measurement-based
function isContractTx(t: any, contractTag: string, measurementIds: string[]): boolean {
    if ((t.notes || '').includes(contractTag)) return true;
    if (t.measurementId && measurementIds.includes(t.measurementId)) return true;
    return false;
}

// Generate financial transactions from payment_schedule for a Parcelado contract.
// Writes to both: project JSONB (Despesas tab) and internal_transactions table (Conciliação tab).
async function syncParceladoScheduleToFinance(contract: Contract) {
    if (!contract.payment_schedule?.length || contract.is_recurring) return;
    try {
        const supplierName = await resolveSupplierName(contract.supplier_id, 'Fornecedor');
        const tag = `[contract:${contract.id}]`;
        const measurementIds = await getContractMeasurementIds(contract.id);

        const newTxs = contract.payment_schedule.map((inst, i) => ({
            id: crypto.randomUUID(),
            date: inst.date + 'T12:00:00.000Z',
            type: 'EXPENSE' as const,
            category: 'Mão de Obra / Serviço',
            description: `Contrato: ${contract.title || contract.number} - Parcela ${i + 1}/${contract.payment_schedule!.length}`,
            value: inst.value,
            status: 'PENDING' as const,
            supplier: supplierName,
            notes: `${tag} Parcela ${i + 1} gerada automaticamente do contrato ${contract.number || contract.id}`
        }));

        // ── 1. Project JSONB (aba Despesas) ────────────────────────────────────
        if (contract.project_id) {
            const { projectService } = await import('./projectService');
            const project = await projectService.loadProject(contract.project_id);
            if (project) {
                const info = (project.settings as any)?.financialInfo || { totalValue: 0, paymentMethod: 'Parcelamento Próprio', installments: [], transactions: [] };
                const toRemove = (info.transactions || []).filter((t: any) => isContractTx(t, tag, measurementIds));
                const kept = (info.transactions || []).filter((t: any) => !isContractTx(t, tag, measurementIds));
                await projectService.saveProject({
                    ...project,
                    settings: { ...project.settings, financialInfo: { ...info, transactions: [...newTxs, ...kept] } }
                });
                // Remove internal_transactions mirror entries created by addTransaction (source_system='PROJECT')
                const removedIds = toRemove.map((t: any) => t.id).filter(Boolean);
                if (removedIds.length > 0 && contract.organization_id) {
                    await supabase.from('internal_transactions')
                        .delete()
                        .eq('source_system', 'PROJECT')
                        .in('reference_id', removedIds);
                }
                console.log(`[CONTRACTS] Synced ${newTxs.length} parcelado txs to project JSONB, removed ${toRemove.length} old`);
            }
        } else if (contract.organization_id) {
            // Fallback: org-level vault
            const vault = await findVault(contract.organization_id);
            if (vault) {
                const vaultInfo = vault.settings?.financialInfo || { totalValue: 0, paymentMethod: 'Variavel', installments: [], transactions: [] };
                const kept = (vaultInfo.transactions || []).filter((t: any) => !isContractTx(t, tag, measurementIds));
                await supabase.from('projects').update({
                    settings: { ...vault.settings, financialInfo: { ...vaultInfo, transactions: [...newTxs, ...kept] } }
                }).eq('id', vault.id);
            }
        }

        // ── 2. internal_transactions (aba Conciliação) ─────────────────────────
        // reference_id uses contract.id:pN pattern to satisfy the (org, reference) unique constraint
        if (contract.organization_id) {
            // Remove old entries: use LIKE 'contract.id%' to catch all installment keys
            const { data: oldRows } = await supabase
                .from('internal_transactions')
                .select('id')
                .eq('organization_id', contract.organization_id)
                .eq('source_system', 'CONTRACT_PARCELADO')
                .like('reference_id', `${contract.id}%`);
            if (oldRows?.length) {
                await supabase.from('internal_transactions')
                    .delete()
                    .in('id', oldRows.map((r: any) => r.id));
            }
            if (measurementIds.length > 0) {
                await supabase.from('internal_transactions')
                    .delete()
                    .eq('organization_id', contract.organization_id)
                    .eq('source_system', 'CONTRACT_MEASUREMENT')
                    .in('reference_id', measurementIds);
            }

            // Insert one row per installment with unique reference_id
            const internalRows = newTxs.map((tx, i) => ({
                organization_id: contract.organization_id,
                source_system: 'CONTRACT_PARCELADO',
                reference_id: `${contract.id}:p${i + 1}`,
                transaction_date: tx.date.split('T')[0],
                amount: tx.value,
                direction: 'DEBIT',
                description: tx.description,
                category: 'Mão de Obra / Serviço',
                entity_name: supplierName,
                status: 'PENDING',
            }));
            await supabase.from('internal_transactions').insert(internalRows);
            console.log(`[CONTRACTS] Synced ${internalRows.length} parcelado txs to internal_transactions`);
        }
    } catch (e) {
        console.error('[CONTRACTS] Error syncing parcelado schedule to finance:', e);
    }
}

// Generate a single financial entry for a À Vista (non-parcelado, non-recurring) contract.
async function syncAVistaToFinance(contract: Contract) {
    if (contract.is_recurring || contract.payment_term_type === 'Parcelado') return;
    if (!contract.original_value || contract.original_value <= 0) return;
    try {
        const supplierName = await resolveSupplierName(contract.supplier_id, 'Fornecedor');
        const tag = `[contract:${contract.id}]`;
        const measurementIds = await getContractMeasurementIds(contract.id);

        // Due date = start_date + payment_days (or start_date if no payment_days)
        const base = new Date(contract.start_date + 'T12:00:00');
        if (contract.payment_days) base.setDate(base.getDate() + contract.payment_days);
        const dueDate = base.toISOString().split('T')[0];

        const tx = {
            id: crypto.randomUUID(),
            date: dueDate + 'T12:00:00.000Z',
            type: 'EXPENSE' as const,
            category: 'Mão de Obra / Serviço',
            description: `Contrato: ${contract.title || contract.number} — À Vista`,
            value: contract.original_value,
            status: 'PENDING' as const,
            supplier: supplierName,
            notes: `${tag} Lançamento à vista gerado automaticamente do contrato ${contract.number || contract.id}`
        };

        if (contract.project_id) {
            const { projectService } = await import('./projectService');
            const project = await projectService.loadProject(contract.project_id);
            if (project) {
                const info = (project.settings as any)?.financialInfo || { totalValue: 0, paymentMethod: 'À Vista', installments: [], transactions: [] };
                const kept = (info.transactions || []).filter((t: any) => !isContractTx(t, tag, measurementIds));
                await projectService.saveProject({
                    ...project,
                    settings: { ...project.settings, financialInfo: { ...info, transactions: [tx, ...kept] } }
                });
            }
        } else if (contract.organization_id) {
            const vault = await findVault(contract.organization_id);
            if (vault) {
                const vaultInfo = vault.settings?.financialInfo || { totalValue: 0, paymentMethod: 'À Vista', installments: [], transactions: [] };
                const kept = (vaultInfo.transactions || []).filter((t: any) => !isContractTx(t, tag, measurementIds));
                await supabase.from('projects').update({
                    settings: { ...vault.settings, financialInfo: { ...vaultInfo, transactions: [tx, ...kept] } }
                }).eq('id', vault.id);
            }
        }

        // internal_transactions mirror
        if (contract.organization_id) {
            await supabase.from('internal_transactions')
                .delete()
                .eq('organization_id', contract.organization_id)
                .eq('source_system', 'CONTRACT_AVISTA')
                .eq('reference_id', contract.id);

            await supabase.from('internal_transactions').insert({
                organization_id: contract.organization_id,
                source_system: 'CONTRACT_AVISTA',
                reference_id: contract.id,
                transaction_date: dueDate,
                amount: contract.original_value,
                direction: 'DEBIT',
                description: tx.description,
                category: 'Mão de Obra / Serviço',
                entity_name: supplierName,
                status: 'PENDING',
            });
        }
        console.log(`[CONTRACTS] Synced À Vista contract ${contract.id} to finance`);
    } catch (e) {
        console.error('[CONTRACTS] Error syncing À Vista to finance:', e);
    }
}

export const contractService = {
    // Contracts
    listContracts: async (projectId?: string, organizationId?: string, empresaId?: string): Promise<Contract[]> => {
        let query = supabase
            .from('contracts')
            .select('*')
            .order('created_at', { ascending: false });

        if (projectId) {
            query = query.eq('project_id', projectId);
        } else if (empresaId) {
            query = query.eq('empresa_id', empresaId);
        } else if (organizationId) {
            query = query.eq('organization_id', organizationId);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data as Contract[];
    },

    getContractById: async (id: string): Promise<Contract | null> => {
        const { data, error } = await supabase
            .from('contracts')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (error) throw error;
        return data as Contract;
    },

    createContract: async (contract: Omit<Contract, 'id' | 'created_at' | 'current_value'>): Promise<Contract> => {
        const { data, error } = await supabase
            .from('contracts')
            .insert({
                ...contract,
                current_value: contract.original_value // Initial current value matches original
            })
            .select()
            .single();

        if (error) throw error;
        
        const newContract = data as Contract;

        // Sync to financial module based on payment type
        if (!newContract.is_recurring && newContract.payment_term_type === 'Parcelado') {
            await syncParceladoScheduleToFinance(newContract);
        } else if (!newContract.is_recurring) {
            await syncAVistaToFinance(newContract);
        }

        // Auto-generate installments for recurring contracts with an end date
        if (newContract.is_recurring && newContract.start_date && newContract.end_date) {
            try {
                // Resolve supplier name for financial entries
                let supplierName = 'Contrato Recorrente';
                if (newContract.supplier_id) {
                    const { data: supplierData } = await supabase
                        .from('suppliers')
                        .select('name')
                        .eq('id', newContract.supplier_id)
                        .maybeSingle();
                    if (supplierData?.name) supplierName = supplierData.name;
                }

                const startDate = new Date(newContract.start_date + 'T12:00:00');
                const endDate = new Date(newContract.end_date + 'T12:00:00');
                
                let currentTxDate = new Date(startDate);
                
                // Set the specific due day if provided, otherwise use the start date's day
                if (newContract.due_day) {
                    currentTxDate.setDate(Math.min(newContract.due_day, new Date(currentTxDate.getFullYear(), currentTxDate.getMonth() + 1, 0).getDate()));
                }

                const transactions = [];
                let installmentNumber = 1;

                while (currentTxDate <= endDate) {
                    transactions.push({
                        organization_id: newContract.organization_id || null,
                        source_system: 'CONTRACT_RECURRING',
                        reference_id: newContract.id,
                        transaction_date: currentTxDate.toISOString().split('T')[0],
                        amount: newContract.original_value,
                        direction: 'DEBIT',
                        description: `Fatura Contrato ${newContract.number || ''} (${installmentNumber}) - ${currentTxDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
                        category: newContract.category_id || 'Contrato Recorrente',
                        status: 'PENDING'
                    });

                    // Advance one cycle
                    if (newContract.billing_cycle === 'Anual') {
                        currentTxDate.setFullYear(currentTxDate.getFullYear() + 1);
                    } else if (newContract.billing_cycle === 'Semestral') {
                        currentTxDate.setMonth(currentTxDate.getMonth() + 6);
                    } else if (newContract.billing_cycle === 'Bimestral') {
                        currentTxDate.setMonth(currentTxDate.getMonth() + 2);
                    } else { // Mensal
                        currentTxDate.setMonth(currentTxDate.getMonth() + 1);
                    }
                    
                    // Re-adjust day if necessary
                    if (newContract.due_day) {
                        currentTxDate.setDate(Math.min(newContract.due_day, new Date(currentTxDate.getFullYear(), currentTxDate.getMonth() + 1, 0).getDate()));
                    }
                    
                    installmentNumber++;
                }

                if (transactions.length > 0) {
                    if (newContract.project_id) {
                        // Insere todas as parcelas de uma vez (evita race conditions)
                        const batchPayload = transactions.map(tx => ({
                            date: tx.transaction_date + 'T12:00:00.000Z',
                            type: 'EXPENSE' as const,
                            category: 'Mão de Obra / Serviço',
                            description: tx.description,
                            value: tx.amount,
                            status: 'PENDING' as const,
                            supplier: supplierName,
                            notes: `[contract:${newContract.id}] Gerado automaticamente do contrato ${newContract.number || newContract.id}`
                        }));
                        await financialService.addTransactionBatch(newContract.project_id, batchPayload);
                    } else {
                        // Sem project_id: salva em internal_transactions (reconciliação bancária)
                        await supabase.from('internal_transactions').insert(transactions);
                    }
                    console.log(`[CONTRACTS] Generated ${transactions.length} installments for recurring contract ${newContract.id}`);
                }
            } catch (e) {
                console.error('[CONTRACTS] Error generating installments for recurring contract:', e);
            }
        }

        return newContract;
    },

    updateContract: async (id: string, updates: Partial<Contract>): Promise<Contract> => {
        // Se estiver atualizando o valor original, precisamos manter o valor atual sincronizado
        if (updates.original_value !== undefined) {
            const { data: addendums } = await supabase
                .from('contract_addendums')
                .select('value_impact')
                .eq('contract_id', id)
                .eq('status', 'Aprovado');

            const addendumsTotal = (addendums || []).reduce((sum, a) => sum + (a.value_impact || 0), 0);
            updates.current_value = updates.original_value + addendumsTotal;
        }

        const { data, error } = await supabase
            .from('contracts')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        const updated = data as Contract;

        // Re-sync financial entries when value or schedule changes
        if ('original_value' in updates || 'payment_schedule' in updates) {
            if (!updated.is_recurring && updated.payment_term_type === 'Parcelado') {
                await syncParceladoScheduleToFinance(updated);
            } else if (!updated.is_recurring) {
                await syncAVistaToFinance(updated);
            }
        }

        return updated;
    },

    // Re-lança o contrato no financeiro (uso retroativo ou manual)
    syncContractToFinance: async (contract: Contract): Promise<void> => {
        if (!contract.is_recurring && contract.payment_term_type === 'Parcelado') {
            await syncParceladoScheduleToFinance(contract);
        } else if (!contract.is_recurring) {
            await syncAVistaToFinance(contract);
        } else if (contract.is_recurring && contract.start_date && contract.end_date) {
            // Recurring with end date: rebuild entries (reuses createContract logic inline)
            const existing = await contractService.getContractById(contract.id);
            if (existing) {
                // Remove old recurring entries
                await removeContractTransactions(contract.id, contract.organization_id, contract.project_id);
                if (contract.organization_id) {
                    await supabase.from('internal_transactions')
                        .delete()
                        .eq('organization_id', contract.organization_id)
                        .eq('source_system', 'CONTRACT_RECURRING')
                        .eq('reference_id', contract.id);
                }
                // Re-create via createContract stub (trigger the generation block)
                const supplierName = await resolveSupplierName(contract.supplier_id, 'Contrato Recorrente');
                const start = new Date(contract.start_date + 'T12:00:00');
                const end = new Date(contract.end_date + 'T12:00:00');
                let cur = new Date(start);
                if (contract.due_day) cur.setDate(Math.min(contract.due_day, new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate()));
                const transactions = [];
                let n = 1;
                while (cur <= end) {
                    transactions.push({
                        id: crypto.randomUUID(),
                        date: cur.toISOString().split('T')[0] + 'T12:00:00.000Z',
                        type: 'EXPENSE' as const,
                        category: 'Mão de Obra / Serviço',
                        description: `Fatura Contrato ${contract.number || ''} (${n}) - ${cur.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
                        value: contract.original_value,
                        status: 'PENDING' as const,
                        supplier: supplierName,
                        notes: `[contract:${contract.id}] Gerado automaticamente do contrato ${contract.number || contract.id}`
                    });
                    if (contract.billing_cycle === 'Anual') cur.setFullYear(cur.getFullYear() + 1);
                    else if (contract.billing_cycle === 'Semestral') cur.setMonth(cur.getMonth() + 6);
                    else if (contract.billing_cycle === 'Bimestral') cur.setMonth(cur.getMonth() + 2);
                    else cur.setMonth(cur.getMonth() + 1);
                    if (contract.due_day) cur.setDate(Math.min(contract.due_day, new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate()));
                    n++;
                }
                if (transactions.length > 0 && contract.project_id) {
                    await financialService.addTransactionBatch(contract.project_id, transactions.map(tx => ({
                        date: tx.date,
                        type: tx.type,
                        category: tx.category,
                        description: tx.description,
                        value: tx.value,
                        status: tx.status,
                        supplier: tx.supplier,
                        notes: tx.notes,
                    })));
                }
            }
        }
    },

    deleteContract: async (id: string): Promise<void> => {
        // 1. Antes de excluir, busca o contrato para saber se era recorrente e qual organização
        const { data: contract } = await supabase
            .from('contracts')
            .select('id, is_recurring, organization_id, number, project_id, payment_term_type')
            .eq('id', id)
            .single();

        // 2. Se for recorrente, verifica se há parcelas já pagas antes de permitir a exclusão
        if (contract?.is_recurring && contract.organization_id) {
            try {
                const orgId = contract.organization_id;
                const contractTag = `[contract:${id}]`;

                const { data: vaultProjects } = await supabase
                    .from('projects')
                    .select('settings')
                    .eq('name', 'Gestão Comercial')
                    .filter('settings->>organizationId', 'eq', orgId)
                    .limit(1);

                if (vaultProjects && vaultProjects.length > 0) {
                    const txs = vaultProjects[0].settings?.financialInfo?.transactions || [];
                    const contractTxs = txs.filter((t: any) => (t.notes || '').includes(contractTag));
                    const paidTxs = contractTxs.filter((t: any) => t.status === 'PAID');

                    if (paidTxs.length > 0) {
                        throw new Error(
                            `Não é possível excluir este contrato pois ${paidTxs.length} parcela(s) já foram pagas no módulo Financeiro. ` +
                            `Cancele as baixas no Financeiro antes de excluir o contrato.`
                        );
                    }
                }
            } catch (e: any) {
                // Re-lança apenas erros de negócio (parcelas pagas), ignora erros de consulta
                if (e.message?.includes('parcela')) throw e;
                console.error('[CONTRACTS] Could not verify paid installments:', e);
            }
        }

        // 3. Exclui o contrato do banco
        const { error } = await supabase
            .from('contracts')
            .delete()
            .eq('id', id);

        if (error) throw error;

        // 4. Remove transações financeiras geradas (recorrente ou parcelado)
        if (contract?.is_recurring || contract?.payment_term_type === 'Parcelado') {
            try {
                const orgId = contract.organization_id;
                if (!orgId) return;

                // Localiza o vault da organização
                const { data: vaultProjects } = await supabase
                    .from('projects')
                    .select('*')
                    .eq('name', 'Gestão Comercial')
                    .filter('settings->>organizationId', 'eq', orgId)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (!vaultProjects || vaultProjects.length === 0) return;

                const vault = vaultProjects[0];
                const vaultInfo = vault.settings?.financialInfo;
                if (!vaultInfo) return;

                // Remove todas as transações que referenciam este contrato pelo ID embutido no campo notes
                const contractTag = `[contract:${id}]`;
                const cleanedTransactions = (vaultInfo.transactions || []).filter((t: any) => {
                    const notes = t.notes || '';
                    return !notes.includes(contractTag);
                });

                const removedCount = (vaultInfo.transactions || []).length - cleanedTransactions.length;

                if (removedCount > 0) {
                    const updatedVault = {
                        ...vault,
                        settings: {
                            ...vault.settings,
                            financialInfo: { ...vaultInfo, transactions: cleanedTransactions }
                        }
                    };
                    await supabase
                        .from('projects')
                        .update({ settings: updatedVault.settings })
                        .eq('id', vault.id);
                    console.log(`[CONTRACTS] Removed ${removedCount} financial transactions for deleted contract ${id}`);
                }

                // Also clean internal_transactions (Conciliação tab) — reference_id uses contract.id:pN pattern
                const { data: parceladoRows } = await supabase
                    .from('internal_transactions')
                    .select('id')
                    .eq('organization_id', orgId)
                    .eq('source_system', 'CONTRACT_PARCELADO')
                    .like('reference_id', `${id}%`);
                if (parceladoRows?.length) {
                    await supabase.from('internal_transactions')
                        .delete()
                        .in('id', parceladoRows.map((r: any) => r.id));
                }
            } catch (e) {
                console.error('[CONTRACTS] Error cleaning up financial transactions on contract delete:', e);
            }
        }
    },

    duplicateContract: async (id: string): Promise<Contract> => {
        // 1. Fetch original contract
        const { data: original, error: fetchError } = await supabase
            .from('contracts')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        // 2. Fetch original items
        const { data: items, error: itemsError } = await supabase
            .from('contract_items')
            .select('*')
            .eq('contract_id', id);

        if (itemsError) throw itemsError;

        // 3. Create new contract (Resetting some fields)
        const { data: dupe, error: createError } = await supabase
            .from('contracts')
            .insert({
                ...original,
                id: undefined,
                created_at: undefined,
                title: `${original.title} (Cópia)`,
                status: 'Rascunho',
                number: `${original.number}-COPY`
            })
            .select()
            .single();

        if (createError) throw createError;

        // 4. Duplicate items
        if (items && items.length > 0) {
            const duplicatedItems = items.map(item => ({
                ...item,
                id: undefined,
                created_at: undefined,
                contract_id: dupe.id
            }));

            const { error: insertItemsError } = await supabase
                .from('contract_items')
                .insert(duplicatedItems);

            if (insertItemsError) throw insertItemsError;
        }

        return dupe as Contract;
    },

    // Contract Items
    listContractItems: async (contractId: string): Promise<ContractItem[]> => {
        const { data, error } = await supabase
            .from('contract_items')
            .select('*')
            .eq('contract_id', contractId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data as ContractItem[];
    },

    addContractItem: async (item: Omit<ContractItem, 'id' | 'created_at'>): Promise<ContractItem> => {
        const { data, error } = await supabase
            .from('contract_items')
            .insert(item)
            .select()
            .single();

        if (error) throw error;
        return data as ContractItem;
    },

    updateContractItem: async (id: string, updates: Partial<ContractItem>): Promise<ContractItem> => {
        const { data, error } = await supabase
            .from('contract_items')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as ContractItem;
    },

    deleteContractItem: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('contract_items')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    // Aditivos (Addendums)
    listAddendums: async (contractId: string): Promise<ContractAddendum[]> => {
        const { data, error } = await supabase
            .from('contract_addendums')
            .select('*')
            .eq('contract_id', contractId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as ContractAddendum[];
    },

    createAddendum: async (addendum: Omit<ContractAddendum, 'id' | 'created_at' | 'status' | 'approved_at'>): Promise<ContractAddendum> => {
        // Exclude notes if empty to avoid 400 when the column hasn't been migrated yet
        const { notes, ...rest } = addendum as typeof addendum & { notes?: string };
        const payload: Record<string, unknown> = { ...rest, status: 'Pendente' };
        if (notes) payload.notes = notes;

        const { data, error } = await supabase
            .from('contract_addendums')
            .insert(payload)
            .select()
            .single();

        if (error) throw error;
        return data as ContractAddendum;
    },

    approveAddendum: async (id: string, approvedBy: string): Promise<void> => {
        // Fetch addendum to get value impact and contract_id
        const { data: addendum, error: fetchError } = await supabase
            .from('contract_addendums')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;
        if (addendum.status !== 'Pendente') throw new Error('Addendum is not pending approval');

        const { error: updateAddendumError } = await supabase
            .from('contract_addendums')
            .update({
                status: 'Aprovado',
                approved_by: approvedBy,
                approved_at: new Date().toISOString()
            })
            .eq('id', id);

        if (updateAddendumError) throw updateAddendumError;

        // Update contract: value and/or end_date — evaluated independently
        if (addendum.value_impact !== 0 || addendum.new_end_date) {
            const { data: contract, error: contractErr } = await supabase
                .from('contracts')
                .select('*')
                .eq('id', addendum.contract_id)
                .single();

            if (contractErr) throw contractErr;

            const contractUpdates: Record<string, any> = {};
            if (addendum.value_impact !== 0) {
                contractUpdates.current_value = (contract.current_value || 0) + (addendum.value_impact || 0);
            }
            if (addendum.new_end_date) {
                contractUpdates.end_date = addendum.new_end_date;
            }

            const { error: contractUpdateErr } = await supabase
                .from('contracts')
                .update(contractUpdates)
                .eq('id', addendum.contract_id);

            if (contractUpdateErr) throw contractUpdateErr;

            // Re-sync parcelado installments so Despesas/Conciliação reflect the new value
            if (addendum.value_impact !== 0 && !contract.is_recurring && contract.payment_term_type === 'Parcelado') {
                await syncParceladoScheduleToFinance({
                    ...contract,
                    current_value: contractUpdates.current_value
                } as Contract);
            }
        }
    },

    // Medições (Measurements)
    listMeasurements: async (contractId: string): Promise<ContractMeasurement[]> => {
        const { data, error } = await supabase
            .from('contract_measurements')
            .select('*')
            .eq('contract_id', contractId)
            .order('number', { ascending: false });

        if (error) throw error;
        return data as ContractMeasurement[];
    },

    createMeasurement: async (
        measurement: Omit<ContractMeasurement, 'id' | 'created_at'>,
        items: Omit<ContractMeasurementItem, 'id' | 'measurement_id' | 'created_at'>[]
    ): Promise<ContractMeasurement> => {
        // 1. Create measurement header
        const { data: mData, error: mError } = await supabase
            .from('contract_measurements')
            .insert(measurement)
            .select()
            .single();

        if (mError) throw mError;

        // 2. Create measurement items
        const measurementItems = items.map(item => ({
            ...item,
            measurement_id: mData.id
        }));

        const { error: itemsError } = await supabase
            .from('contract_measurement_items')
            .insert(measurementItems);

        if (itemsError) throw itemsError;

        // 3. Trigger Financial Sync (Background)
        // We don't await this to keep the UI responsive, as it's a non-blocking automation
        financialService.syncMeasurementToFinance(mData.id).catch(err => {
            console.error("[FINANCIAL SYNC ERROR]", err);
        });

        return mData as ContractMeasurement;
    },

    updateMeasurement: async (
        id: string,
        measurement: Partial<ContractMeasurement>,
        items: Omit<ContractMeasurementItem, 'id' | 'measurement_id' | 'created_at'>[]
    ): Promise<ContractMeasurement> => {
        // 1. Update measurement header
        const { data: mData, error: mError } = await supabase
            .from('contract_measurements')
            .update(measurement)
            .eq('id', id)
            .select()
            .single();

        if (mError) throw mError;

        // 2. Delete existing items
        const { error: deleteError } = await supabase
            .from('contract_measurement_items')
            .delete()
            .eq('measurement_id', id);

        if (deleteError) throw deleteError;

        // 3. Create new measurement items
        const measurementItems = items.map(item => ({
            ...item,
            measurement_id: id
        }));

        const { error: itemsError } = await supabase
            .from('contract_measurement_items')
            .insert(measurementItems);

        if (itemsError) throw itemsError;

        // 4. Trigger Financial Sync (Background)
        // syncMeasurementToFinance will handle cleaning up old transactions
        financialService.syncMeasurementToFinance(id).catch(err => {
            console.error("[FINANCIAL SYNC ERROR]", err);
        });

        return mData as ContractMeasurement;
    },

    deleteMeasurement: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('contract_measurements')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    getMeasurementItems: async (measurementId: string): Promise<ContractMeasurementItem[]> => {
        const { data, error } = await supabase
            .from('contract_measurement_items')
            .select('*')
            .eq('measurement_id', measurementId);

        if (error) throw error;
        return data as ContractMeasurementItem[];
    },

    // Faturas de Consumo (Utility Bills)
    listUtilityBills: async (contractId: string): Promise<ContractUtilityBill[]> => {
        const { data, error } = await supabase
            .from('contract_utility_bills')
            .select('*')
            .eq('contract_id', contractId)
            .order('reference_month', { ascending: false });

        if (error) throw error;
        return data as ContractUtilityBill[];
    },

    createUtilityBill: async (bill: Omit<ContractUtilityBill, 'id' | 'created_at'>): Promise<ContractUtilityBill> => {
        const { data, error } = await supabase
            .from('contract_utility_bills')
            .insert(bill)
            .select()
            .single();

        if (error) throw error;
        return data as ContractUtilityBill;
    },

    updateUtilityBill: async (id: string, updates: Partial<ContractUtilityBill>): Promise<ContractUtilityBill> => {
        const { data, error } = await supabase
            .from('contract_utility_bills')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as ContractUtilityBill;
    },

    deleteUtilityBill: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('contract_utility_bills')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
};
