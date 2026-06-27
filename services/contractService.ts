import { supabase } from '../lib/supabase';
import { financialService } from './financialService';
import { projectService } from './projectService';
import { approvalService } from './approvalService';
import { INITIAL_PROJECT_SETTINGS } from '../constants';
import { BudgetEntry } from '../types/budget';
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

/**
 * Resolve a contraparte cadastrada de um contrato para popular party_type/party_name
 * (e party_id) nos lançamentos internos.
 * INCOMING = recebível (cliente); OUTGOING/indefinido = pagável (fornecedor).
 * IMPORTANTE: internal_transactions.party_id tem FK só para clients
 * (internal_txs_party_id_fkey). Por isso party_id só é setado para CLIENTE;
 * para fornecedor, gravamos party_type/party_name mas party_id fica null.
 */
async function resolveContractParty(
    contract: Contract,
    fallbackName: string,
): Promise<{ party_id: string | null; party_type: 'SUPPLIER' | 'CLIENT' | null; party_name: string | null }> {
    const cAny = contract as unknown as { direction?: string; client_id?: string; supplier_id?: string };
    if (!cAny.client_id && !cAny.supplier_id) return { party_id: null, party_type: null, party_name: null };

    // Rótulo segue a direção (INCOMING = cliente/recebível; senão fornecedor/pagável),
    // mas o NOME é resolvido de qualquer id que exista (a contraparte às vezes está em supplier_id).
    const isIncoming = cAny.direction === 'INCOMING';
    const partyType: 'SUPPLIER' | 'CLIENT' = isIncoming ? 'CLIENT' : 'SUPPLIER';
    let name = fallbackName;
    try {
        if (cAny.client_id) {
            const { data } = await supabase.from('clients').select('name').eq('id', cAny.client_id).maybeSingle();
            name = data?.name || fallbackName;
        } else if (cAny.supplier_id) {
            name = await resolveSupplierName(cAny.supplier_id, fallbackName);
        }
    } catch { /* mantém fallback */ }

    // party_id tem FK só p/ clients → só preenche quando há cliente real
    const partyId = isIncoming && cAny.client_id ? cAny.client_id : null;
    return { party_id: partyId, party_type: partyType, party_name: name };
}

// Find the "Gestão Comercial" vault for an org
async function findVault(orgId: string) {
    const { data } = await supabase
        .from('projects')
        .select('id, name, settings')
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
            const party = await resolveContractParty(contract, supplierName);
            const txDirection = contract.direction === 'INCOMING' ? 'CREDIT' : 'DEBIT';
            const internalRows = newTxs.map((tx, i) => ({
                organization_id: contract.organization_id,
                source_system: 'CONTRACT_PARCELADO',
                reference_id: `${contract.id}:p${i + 1}`,
                project_id: contract.project_id ?? null,
                transaction_date: tx.date.split('T')[0],
                amount: tx.value,
                direction: txDirection,
                description: tx.description,
                category: 'Mão de Obra / Serviço',
                entity_name: party.party_name ?? supplierName,
                party_id: party.party_id,
                party_type: party.party_type,
                party_name: party.party_name,
                status: 'PENDING',
            }));
            await supabase.from('internal_transactions').insert(internalRows);
            console.log(`[CONTRACTS] Synced ${internalRows.length} parcelado txs to internal_transactions`);
        }
    } catch (e) {
        console.error('[CONTRACTS] Error syncing parcelado schedule to finance:', e);
    }
}

function advanceCycle(date: Date, cycle: string | undefined) {
    if (cycle === 'Anual') date.setFullYear(date.getFullYear() + 1);
    else if (cycle === 'Semestral') date.setMonth(date.getMonth() + 6);
    else if (cycle === 'Bimestral') date.setMonth(date.getMonth() + 2);
    else date.setMonth(date.getMonth() + 1);
}

// Advance by one cycle and snap to due_day (if provided).
function advanceCycleAligned(date: Date, cycle: string | undefined, dueDay?: number) {
    advanceCycle(date, cycle);
    if (dueDay) {
        const maxDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        date.setDate(Math.min(dueDay, maxDay));
    }
}

// Generate financial entries for a recurring contract.
//
// Rules:
//   • due_day    = fixed day of month for ALL payments (e.g. always the 10th)
//   • payment_days = minimum offset in days after start_date before first payment
//   • First payment = first occurrence of due_day >= (start_date + payment_days)
//   • Subsequent payments = same due_day, advancing by billing_cycle
//   • ALL payments from start are generated (past ones = PAID, future = PENDING)
//   • Without end_date: generates from start up to 12 cycles into the future
async function syncRecurringToFinance(contract: Contract) {
    if (!contract.is_recurring || !contract.original_value) return;
    try {
        const supplierName = await resolveSupplierName(contract.supplier_id, 'Contrato Recorrente');

        const today = new Date();
        today.setHours(23, 59, 59, 0);

        const dueDay = contract.due_day;

        // Reference date = start_date + payment_days
        const ref = new Date(contract.start_date + 'T12:00:00');
        if (contract.payment_days && contract.payment_days > 0) {
            ref.setDate(ref.getDate() + contract.payment_days);
        }

        // First payment = first occurrence of due_day >= ref
        let cur: Date;
        if (dueDay) {
            const maxDaySameMonth = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
            const samMonth = new Date(ref.getFullYear(), ref.getMonth(), Math.min(dueDay, maxDaySameMonth), 12, 0, 0);
            cur = samMonth >= ref ? samMonth : (() => {
                const d = new Date(samMonth);
                advanceCycleAligned(d, contract.billing_cycle, dueDay);
                return d;
            })();
        } else {
            cur = new Date(ref);
        }

        // End boundary: contract end_date OR (last past payment + 12 future cycles)
        const endDate = contract.end_date
            ? new Date(contract.end_date + 'T12:00:00')
            : (() => {
                // find the first future payment, then add 11 more cycles
                const e = new Date(cur);
                while (e <= today) advanceCycleAligned(e, contract.billing_cycle, dueDay);
                for (let i = 0; i < 11; i++) advanceCycleAligned(e, contract.billing_cycle, dueDay);
                return e;
            })();

        if (cur > endDate) return;

        const transactions: Array<{
            id: string; date: string; type: 'EXPENSE'; category: string;
            description: string; value: number; status: 'PAID' | 'PENDING'; supplier: string; notes: string;
        }> = [];
        let n = 1;

        while (cur <= endDate) {
            const isPast = cur <= today;
            transactions.push({
                id: crypto.randomUUID(),
                date: cur.toISOString().split('T')[0] + 'T12:00:00.000Z',
                type: 'EXPENSE',
                category: 'Mão de Obra / Serviço',
                description: `Fatura Contrato ${contract.number || ''} (${n}) - ${cur.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
                value: contract.original_value,
                status: isPast ? 'PAID' : 'PENDING',
                supplier: supplierName,
                notes: `[contract:${contract.id}] Gerado automaticamente do contrato ${contract.number || contract.id}`
            });

            advanceCycleAligned(cur, contract.billing_cycle, dueDay);
            n++;
        }

        if (transactions.length === 0) return;

        if (contract.project_id) {
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
        } else if (contract.organization_id) {
            const party = await resolveContractParty(contract, supplierName);
            const txDirection = contract.direction === 'INCOMING' ? 'CREDIT' : 'DEBIT';
            await supabase.from('internal_transactions').insert(transactions.map(tx => ({
                organization_id: contract.organization_id,
                source_system: 'CONTRACT_RECURRING',
                reference_id: contract.id,
                project_id: contract.project_id ?? null,
                transaction_date: tx.date.split('T')[0],
                amount: tx.value,
                direction: txDirection,
                description: tx.description,
                category: 'Mão de Obra / Serviço',
                entity_name: party.party_name ?? supplierName,
                party_id: party.party_id,
                party_type: party.party_type,
                party_name: party.party_name,
                status: 'PENDING',
            })));
        }
        console.log(`[CONTRACTS] Generated ${transactions.length} recurring entries for contract ${contract.id} (from current month)`);
    } catch (e) {
        console.error('[CONTRACTS] Error syncing recurring contract to finance:', e);
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

            const party = await resolveContractParty(contract, supplierName);
            const txDirection = contract.direction === 'INCOMING' ? 'CREDIT' : 'DEBIT';
            await supabase.from('internal_transactions').insert({
                organization_id: contract.organization_id,
                source_system: 'CONTRACT_AVISTA',
                reference_id: contract.id,
                project_id: contract.project_id ?? null,
                transaction_date: dueDate,
                amount: contract.original_value,
                direction: txDirection,
                description: tx.description,
                category: 'Mão de Obra / Serviço',
                entity_name: party.party_name ?? supplierName,
                party_id: party.party_id,
                party_type: party.party_type,
                party_name: party.party_name,
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
    listContracts: async (
        projectId?: string,
        organizationId?: string,
        empresaId?: string,
        direction?: 'OUTGOING' | 'INCOMING',
        domain?: 'SUPRIMENTOS' | 'SERVICOS' | 'LOCACAO' | 'VENDAS',
    ): Promise<Contract[]> => {
        // payment_schedule (array JSONB) omitido na listagem — carregado em getContractById
        let query = supabase
            .from('contracts')
            .select('id, organization_id, project_id, supplier_id, client_id, budget_id, number, title, description, contract_type, nature, direction, domain, start_date, end_date, is_recurring, billing_cycle, due_day, status, original_value, current_value, reajuste_index, reajuste_data_base, reajuste_proximo, retention_rate, responsible_email, signed_contract_url, empresa_id, cost_center_id, category_id, payment_method, payment_term_type, payment_days, payment_installments, signature_status, signature_url, approval_status, approval_required_levels, template_id, created_at')
            .order('created_at', { ascending: false });

        if (projectId) {
            query = query.eq('project_id', projectId);
        } else if (empresaId) {
            query = query.eq('empresa_id', empresaId);
        } else if (organizationId) {
            query = query.eq('organization_id', organizationId);
        }

        // Separação de módulos por domínio de negócio (preferencial).
        //   SUPRIMENTOS · SERVICOS · LOCACAO · VENDAS — nunca misturar.
        if (domain) {
            // Contratos legados de Suprimentos podem ter domain NULL antes do backfill.
            if (domain === 'SUPRIMENTOS') {
                query = query.or('domain.eq.SUPRIMENTOS,domain.is.null');
            } else {
                query = query.eq('domain', domain);
            }
        }

        // Compat: separação legada por direction (quando domain não é informado).
        //  - OUTGOING  → Comercial / Contratos de Serviço
        //  - INCOMING  → Suprimentos (inclui contratos legados com direction NULL)
        if (!domain && direction === 'OUTGOING') {
            query = query.eq('direction', 'OUTGOING');
        } else if (!domain && direction === 'INCOMING') {
            query = query.or('direction.eq.INCOMING,direction.is.null');
        }

        const { data, error } = await query;
        if (error) throw error;
        return data as Contract[];
    },

    // Mapeia a categoria do cliente comercial para o domínio de contrato correspondente.
    categoryToContractDomain: (category?: string): 'VENDAS' | 'LOCACAO' | 'SERVICOS' | undefined => {
        switch (category) {
            case 'Vendas':   return 'VENDAS';
            case 'Locação':  return 'LOCACAO';
            case 'Serviços': return 'SERVICOS';
            default:         return undefined;
        }
    },

    listContractsByClientId: async (
        clientId: string,
        orgId?: string,
        category?: string,
    ): Promise<Contract[]> => {
        let query = supabase
            .from('contracts')
            .select('id, organization_id, number, title, contract_type, nature, status, original_value, current_value, start_date, end_date, is_recurring, billing_cycle, due_day, reajuste_index, reajuste_data_base, reajuste_proximo, sla_days, warranty_months, signature_status, signature_url, signed_contract_url, direction, domain, minuta_versions, created_at')
            .eq('client_id', clientId)
            .eq('direction', 'OUTGOING')
            .neq('status', 'Rascunho')
            .order('created_at', { ascending: false });
        if (orgId) query = query.eq('organization_id', orgId);
        // Blindagem por domínio: cliente só vê contratos do seu próprio tipo
        // (Vendas / Locação / Serviços). O client_id já isola, mas o domínio é explícito.
        const domain = contractService.categoryToContractDomain(category);
        if (domain) query = query.eq('domain', domain);
        const { data, error } = await query;
        if (error) throw error;
        return data as Contract[];
    },

    // ─── Ponte Negociação (Vendas de Ativos) → Contrato de Venda ──────────────
    // Retorna o contrato VENDAS já gerado para uma negociação, se existir.
    getContractByDealId: async (dealId: string): Promise<Contract | null> => {
        const { data, error } = await supabase
            .from('contracts')
            .select('id, organization_id, deal_id, client_id, number, title, status, original_value, current_value, direction, domain, signature_status, signed_contract_url, created_at')
            .eq('deal_id', dealId)
            .maybeSingle();
        if (error) throw error;
        return (data as Contract) ?? null;
    },

    // Cria (ou retorna se já existir) um contrato domain='VENDAS' a partir de uma
    // negociação de Vendas de Ativos. Idempotente via contracts.deal_id (índice único).
    createFromDeal: async (deal: {
        id: string;
        organization_id?: string;
        client_id: string;
        property_id?: string;
        value: number;
        date?: string;
        contract_number?: string;
        notes?: string;
        payment_method?: string;
        installments?: number;
        status?: string;
        signature_status?: string;
        signature_url?: string;
        signed_contract_url?: string;
    }): Promise<Contract> => {
        if (!deal.organization_id) throw new Error('Negociação sem organização — impossível gerar contrato.');
        if (!deal.client_id) throw new Error('Negociação sem cliente — selecione o comprador antes de gerar o contrato.');

        // Idempotência: se já há contrato para esta negociação, retorna o existente.
        const existing = await contractService.getContractByDealId(deal.id);
        if (existing) return existing;

        // Título com o nome da unidade, quando disponível.
        let unitLabel = '';
        if (deal.property_id) {
            try {
                const { data: prop } = await supabase
                    .from('commercial_properties')
                    .select('name, unit_number')
                    .eq('id', deal.property_id)
                    .maybeSingle();
                unitLabel = (prop?.name || (prop as any)?.unit_number || '').toString().trim();
            } catch { /* título sem unidade, não bloqueia */ }
        }

        const number = (deal.contract_number && deal.contract_number.trim())
            ? deal.contract_number.trim()
            : await contractService.getNextContractNumber(deal.organization_id, 'OUTGOING');

        // Mapeia o estágio da negociação para o status do contrato.
        const status =
            deal.status === 'COMPLETED' ? 'Concluído'
            : deal.signature_status === 'SIGNED' ? 'Assinado'
            : 'Ativo';

        const payload = {
            deal_id: deal.id,
            organization_id: deal.organization_id,
            client_id: deal.client_id,
            number,
            title: unitLabel ? `Contrato de Venda — ${unitLabel}` : 'Contrato de Compra e Venda',
            description: deal.notes || undefined,
            contract_type: 'Compra e Venda',
            nature: 'Venda',
            direction: 'OUTGOING' as const,
            domain: 'VENDAS' as const,
            status,
            original_value: deal.value || 0,
            start_date: deal.date || new Date().toISOString().split('T')[0],
            is_recurring: false,
            payment_method: deal.payment_method || undefined,
            payment_installments: deal.installments || undefined,
            signature_status: deal.signature_status as Contract['signature_status'] | undefined,
            signature_url: deal.signature_url || undefined,
            signed_contract_url: deal.signed_contract_url || undefined,
        };

        return await contractService.createContract(payload as Omit<Contract, 'id' | 'created_at' | 'current_value'>);
    },

    addMinutaVersion: async (contractId: string, version: { url: string; notes: string; name?: string }): Promise<void> => {
        // Lê versões atuais, incrementa número e faz append. Versão entra como rascunho (não emitida).
        const { data, error: fetchErr } = await supabase
            .from('contracts')
            .select('minuta_versions')
            .eq('id', contractId)
            .single();
        if (fetchErr) throw fetchErr;
        const current: import('../types').MinutaVersion[] = (data?.minuta_versions as any) ?? [];
        const next: import('../types').MinutaVersion = {
            v: (current.length > 0 ? Math.max(...current.map((x: any) => x.v)) : 0) + 1,
            url: version.url,
            name: version.name?.trim() || undefined,
            notes: version.notes,
            emitted: false,
            created_at: new Date().toISOString(),
        };
        const { error } = await supabase
            .from('contracts')
            .update({ minuta_versions: [...current, next] })
            .eq('id', contractId);
        if (error) throw error;
    },

    // Helper interno: lê, transforma e grava o array de versões
    _mutateMinutaVersions: async (
        contractId: string,
        transform: (versions: import('../types').MinutaVersion[]) => import('../types').MinutaVersion[],
    ): Promise<void> => {
        const { data, error: fetchErr } = await supabase
            .from('contracts')
            .select('minuta_versions')
            .eq('id', contractId)
            .single();
        if (fetchErr) throw fetchErr;
        const current: import('../types').MinutaVersion[] = (data?.minuta_versions as any) ?? [];
        const { error } = await supabase
            .from('contracts')
            .update({ minuta_versions: transform(current) })
            .eq('id', contractId);
        if (error) throw error;
    },

    // Emite uma versão → fica disponível no portal do cliente
    emitMinutaVersion: async (contractId: string, v: number): Promise<void> => {
        await contractService._mutateMinutaVersions(contractId, versions =>
            versions.map(ver =>
                ver.v === v ? { ...ver, emitted: true, emitted_at: new Date().toISOString() } : ver,
            ),
        );
    },

    // Edita nome / notas de uma versão
    updateMinutaVersion: async (
        contractId: string,
        v: number,
        patch: { name?: string; notes?: string },
    ): Promise<void> => {
        await contractService._mutateMinutaVersions(contractId, versions =>
            versions.map(ver =>
                ver.v === v
                    ? {
                          ...ver,
                          ...(patch.name !== undefined ? { name: patch.name.trim() || undefined } : {}),
                          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
                      }
                    : ver,
            ),
        );
    },

    // Exclui uma versão (bloqueada caso já emitida)
    deleteMinutaVersion: async (contractId: string, v: number): Promise<void> => {
        await contractService._mutateMinutaVersions(contractId, versions => {
            const target = versions.find(ver => ver.v === v);
            if (target && target.emitted !== false) {
                throw new Error('Não é possível excluir uma versão já emitida ao cliente.');
            }
            return versions.filter(ver => ver.v !== v);
        });
    },

    getContractById: async (id: string): Promise<Contract | null> => {
        const { data, error } = await supabase
            .from('contracts')
            .select('id, organization_id, project_id, budget_id, budget_snapshot, supplier_id, number, title, description, contract_type, nature, start_date, end_date, is_recurring, billing_cycle, due_day, status, original_value, current_value, reajuste_index, reajuste_data_base, reajuste_proximo, retention_rate, responsible_email, signed_contract_url, empresa_id, cost_center_id, category_id, payment_method, payment_term_type, payment_days, payment_installments, payment_schedule, client_id, direction, execution_address, client_responsible, internal_responsible, sla_days, warranty_months, labor_value, materials_value, services_included, services_excluded, signature_status, signature_token, signature_url, signature_completed_at, approval_status, approval_chain, approval_required_levels, billing_mode, release_requirements, minuta_versions, created_at')
            .eq('id', id)
            .maybeSingle();

        if (error) throw error;
        return data as Contract;
    },

    createContract: async (contract: Omit<Contract, 'id' | 'created_at' | 'current_value'>): Promise<Contract> => {
        // Captura snapshot do orçamento se budget_id informado
        let budgetSnapshot: unknown = undefined;
        if (contract.budget_id) {
            try {
                const { data: proj } = await supabase
                    .from('projects')
                    .select('budget')
                    .eq('id', contract.budget_id)
                    .maybeSingle();
                if (proj?.budget) budgetSnapshot = proj.budget;
            } catch { /* snapshot opcional, não bloqueia */ }
        }

        const { data, error } = await supabase
            .from('contracts')
            .insert({
                ...contract,
                current_value: contract.original_value,
                ...(budgetSnapshot !== undefined ? { budget_snapshot: budgetSnapshot } : {}),
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
        if (newContract.is_recurring && newContract.start_date && newContract.end_date && newContract.original_value > 0) {
            try {
                await syncRecurringToFinance(newContract);
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

        // Sanitize UUID fields: empty string fails Postgres UUID cast
        for (const key of Object.keys(updates) as (keyof typeof updates)[]) {
            if (key.endsWith('_id') && (updates[key] as unknown) === '') {
                (updates as Record<string, unknown>)[key] = undefined;
            }
        }

        // Refresh budget_snapshot when budget_id changes
        if (updates.budget_id) {
            try {
                const { data: proj } = await supabase
                    .from('projects')
                    .select('budget')
                    .eq('id', updates.budget_id)
                    .maybeSingle();
                if (proj?.budget) (updates as any).budget_snapshot = proj.budget;
            } catch { /* snapshot opcional */ }
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

    // Re-lança o contrato no financeiro (uso retroativo ou manual).
    // Para recorrentes sem end_date: gera os próximos 12 meses.
    // Para recorrentes com end_date: gera do mês atual até o fim.
    syncContractToFinance: async (contract: Contract): Promise<{ count: number }> => {
        if (!contract.is_recurring && contract.payment_term_type === 'Parcelado') {
            await syncParceladoScheduleToFinance(contract);
            return { count: contract.payment_schedule?.length ?? 0 };
        } else if (!contract.is_recurring) {
            await syncAVistaToFinance(contract);
            return { count: 1 };
        } else {
            // syncRecurringToFinance returns void; count = 12 cycles (or less until end_date)
            await syncRecurringToFinance(contract);
            return { count: contract.end_date ? -1 : 12 }; // -1 = unknown exact count with end_date
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
                    .select('id, name, settings')
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
            .select('id, organization_id, project_id, budget_id, supplier_id, number, title, description, contract_type, nature, start_date, end_date, is_recurring, billing_cycle, due_day, status, original_value, current_value, reajuste_index, reajuste_data_base, reajuste_proximo, retention_rate, responsible_email, signed_contract_url, empresa_id, cost_center_id, category_id, payment_method, payment_term_type, payment_days, payment_installments, payment_schedule, client_id, direction, execution_address, client_responsible, internal_responsible, sla_days, warranty_months, labor_value, materials_value, services_included, services_excluded, signature_status, signature_token, signature_url, signature_completed_at, approval_status, approval_chain, approval_required_levels, created_at')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        // 2. Fetch original items
        const { data: items, error: itemsError } = await supabase
            .from('contract_items')
            .select('id, contract_id, budget_item_id, description, unit, quantity, unit_price, total_price, created_at')
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
            .select('id, contract_id, budget_item_id, description, unit, quantity, unit_price, total_price, created_at')
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
            .select('id, contract_id, number, type, description, value_impact, new_end_date, status, requested_by, approved_by, approved_at, notes, created_at')
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
            .select('id, contract_id, number, type, description, value_impact, new_end_date, status, requested_by, approved_by, approved_at, notes, created_at')
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
                .select('id, organization_id, project_id, budget_id, supplier_id, number, title, description, contract_type, nature, start_date, end_date, is_recurring, billing_cycle, due_day, status, original_value, current_value, reajuste_index, reajuste_data_base, reajuste_proximo, retention_rate, responsible_email, signed_contract_url, empresa_id, cost_center_id, category_id, payment_method, payment_term_type, payment_days, payment_installments, payment_schedule, client_id, direction, execution_address, client_responsible, internal_responsible, sla_days, warranty_months, labor_value, materials_value, services_included, services_excluded, signature_status, signature_token, signature_url, signature_completed_at, approval_status, approval_chain, approval_required_levels, created_at')
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
            .select('id, contract_id, number, period_start, period_end, measurement_date, status, measurement_mode, total_value, retention_value, net_value, notes, invoice_url, approved_by, approved_at, rejection_reason, created_at')
            .eq('contract_id', contractId)
            .order('number', { ascending: false });

        if (error) throw error;
        return data as ContractMeasurement[];
    },

    createMeasurement: async (
        measurement: Omit<ContractMeasurement, 'id' | 'created_at'>,
        items: Omit<ContractMeasurementItem, 'id' | 'measurement_id' | 'created_at'>[]
    ): Promise<ContractMeasurement> => {
        // 0. Carrega contrato para validar saldo e calcular retenção
        const { data: contract, error: contractErr } = await supabase
            .from('contracts')
            .select('current_value, retention_rate, billing_mode, release_requirements')
            .eq('id', measurement.contract_id)
            .single();
        if (contractErr) throw contractErr;

        const { data: prevMeasurements } = await supabase
            .from('contract_measurements')
            .select('total_value')
            .eq('contract_id', measurement.contract_id)
            .neq('status', 'Cancelada');
        const previousTotal = (prevMeasurements ?? []).reduce((s: number, m: { total_value: number }) => s + m.total_value, 0);
        const availableBalance = (contract.current_value ?? 0) - previousTotal;

        if (measurement.total_value > availableBalance + 0.01) {
            throw new Error(
                `Saldo insuficiente: disponível R$ ${availableBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, solicitado R$ ${measurement.total_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`
            );
        }

        // Retenção automática calculada a partir do contrato
        const retentionRate = contract.retention_rate ?? 0;
        const retentionValue = Math.round(measurement.total_value * retentionRate) / 100;
        const netValue = measurement.total_value - retentionValue;

        // 1. Cria cabeçalho da medição
        const { data: mData, error: mError } = await supabase
            .from('contract_measurements')
            .insert({ ...measurement, retention_value: retentionValue, net_value: netValue })
            .select()
            .single();

        if (mError) throw mError;

        // 2. Cria itens da medição
        const measurementItems = items.map(item => ({
            ...item,
            measurement_id: mData.id
        }));

        const { error: itemsError } = await supabase
            .from('contract_measurement_items')
            .insert(measurementItems);

        if (itemsError) throw itemsError;

        // 3. Sync financeiro — apenas quando NÃO é contrato por medição com gating.
        // Para billing_mode=MEDICAO o sync só ocorre após approveMeasurement().
        if (contract.billing_mode !== 'MEDICAO') {
            financialService.syncMeasurementToFinance(mData.id).catch(err => {
                console.error("[FINANCIAL SYNC ERROR]", err);
            });
        }

        return mData as ContractMeasurement;
    },

    updateMeasurement: async (
        id: string,
        measurement: Partial<ContractMeasurement>,
        items: Omit<ContractMeasurementItem, 'id' | 'measurement_id' | 'created_at'>[]
    ): Promise<ContractMeasurement> => {
        // Recalcula retenção se total_value mudou
        let patch = { ...measurement };
        if (patch.total_value !== undefined) {
            const { data: cm } = await supabase
                .from('contract_measurements')
                .select('contract_id')
                .eq('id', id)
                .single();
            if (cm?.contract_id) {
                const { data: ct } = await supabase
                    .from('contracts')
                    .select('current_value, retention_rate')
                    .eq('id', cm.contract_id)
                    .single();
                if (ct) {
                    const { data: prevMeasurements } = await supabase
                        .from('contract_measurements')
                        .select('total_value')
                        .eq('contract_id', cm.contract_id)
                        .neq('status', 'Cancelada')
                        .neq('id', id);
                    const previousTotal = (prevMeasurements ?? []).reduce((s: number, m: { total_value: number }) => s + m.total_value, 0);
                    const availableBalance = (ct.current_value ?? 0) - previousTotal;

                    if (patch.total_value > availableBalance + 0.01) {
                        throw new Error(
                            `Saldo insuficiente: disponível R$ ${availableBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, solicitado R$ ${patch.total_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`
                        );
                    }

                    const retentionValue = Math.round(patch.total_value * (ct.retention_rate ?? 0)) / 100;
                    patch.retention_value = retentionValue;
                    patch.net_value = patch.total_value - retentionValue;
                }
            }
        }

        // 1. Atualiza cabeçalho
        const { data: mData, error: mError } = await supabase
            .from('contract_measurements')
            .update(patch)
            .eq('id', id)
            .select()
            .single();

        if (mError) throw mError;

        // 2. Substitui itens
        const { error: deleteError } = await supabase
            .from('contract_measurement_items')
            .delete()
            .eq('measurement_id', id);

        if (deleteError) throw deleteError;

        const measurementItems = items.map(item => ({
            ...item,
            measurement_id: id
        }));

        const { error: itemsError } = await supabase
            .from('contract_measurement_items')
            .insert(measurementItems);

        if (itemsError) throw itemsError;

        // 3. Sync financeiro — só se não for gating por medição (ou se já estava Processada)
        const { data: ct2 } = await supabase
            .from('contracts')
            .select('billing_mode')
            .eq('id', mData.contract_id)
            .single();

        if (ct2?.billing_mode !== 'MEDICAO') {
            financialService.syncMeasurementToFinance(id).catch(err => {
                console.error("[FINANCIAL SYNC ERROR]", err);
            });
        }

        return mData as ContractMeasurement;
    },

    deleteMeasurement: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('contract_measurements')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    // Workflow de aprovação para contratos billing_mode=MEDICAO
    submitMeasurementForReview: async (id: string): Promise<ContractMeasurement> => {
        const { data, error } = await supabase
            .from('contract_measurements')
            .update({ status: 'Em Análise' })
            .eq('id', id)
            .eq('status', 'Pendente')
            .select()
            .single();
        if (error) throw error;
        if (!data) throw new Error('Medição não encontrada ou já enviada para análise.');
        return data as ContractMeasurement;
    },

    approveMeasurement: async (id: string, approvedBy: string): Promise<ContractMeasurement> => {
        // Valida checklist de liberação
        const { data: m, error: mErr } = await supabase
            .from('contract_measurements')
            .select('contract_id, status, invoice_url, total_value')
            .eq('id', id)
            .single();
        if (mErr) throw mErr;
        if (m.status !== 'Em Análise')
            throw new Error(`Medição não está Em Análise (status atual: ${m.status}).`);

        const { data: ct } = await supabase
            .from('contracts')
            .select('billing_mode, release_requirements')
            .eq('id', m.contract_id)
            .single();

        const req = ct?.release_requirements ?? {};
        if (req.require_invoice && !m.invoice_url)
            throw new Error('Aprovação bloqueada: Nota Fiscal não anexada.');

        if (req.require_evidence) {
            const { data: itemsWithEvidence } = await supabase
                .from('contract_measurement_items')
                .select('attachment_urls')
                .eq('measurement_id', id);
            const hasEvidence = (itemsWithEvidence ?? []).some(
                (i: { attachment_urls?: string[] }) => (i.attachment_urls ?? []).length > 0
            );
            if (!hasEvidence)
                throw new Error('Aprovação bloqueada: nenhuma evidência fotográfica anexada.');
        }

        const now = new Date().toISOString();
        const { data: updated, error: upErr } = await supabase
            .from('contract_measurements')
            .update({ status: 'Processada', approved_by: approvedBy, approved_at: now, rejection_reason: null })
            .eq('id', id)
            .select()
            .single();
        if (upErr) throw upErr;

        // Sync financeiro só ocorre aqui — após aprovação
        financialService.syncMeasurementToFinance(id).catch(err => {
            console.error('[FINANCIAL SYNC ERROR]', err);
        });

        return updated as ContractMeasurement;
    },

    rejectMeasurement: async (id: string, reason: string): Promise<ContractMeasurement> => {
        const { data, error } = await supabase
            .from('contract_measurements')
            .update({ status: 'Pendente', rejection_reason: reason, approved_by: null, approved_at: null })
            .eq('id', id)
            .in('status', ['Em Análise', 'Processada'])
            .select()
            .single();
        if (error) throw error;
        if (!data) throw new Error('Medição não encontrada ou não pode ser rejeitada neste status.');
        return data as ContractMeasurement;
    },

    getMeasurementItems: async (measurementId: string): Promise<ContractMeasurementItem[]> => {
        const { data, error } = await supabase
            .from('contract_measurement_items')
            .select('id, measurement_id, contract_item_id, quantity_executed, value_executed, attachment_urls, percent_executed, item_mode, created_at')
            .eq('measurement_id', measurementId);

        if (error) throw error;
        return data as ContractMeasurementItem[];
    },

    // Faturas de Consumo (Utility Bills)
    listUtilityBills: async (contractId: string): Promise<ContractUtilityBill[]> => {
        const { data, error } = await supabase
            .from('contract_utility_bills')
            .select('id, contract_id, reference_month, consumption_metric, total_value, status, due_date, notes, created_at')
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
    },

    // ─── Gerar Contrato a partir do Orçamento ────────────────────────────────

    /**
     * Cria um contrato OUTGOING (para cliente) a partir do orçamento aprovado do projeto.
     * - Congela snapshot do budget
     * - Importa itens do orçamento como contract_items
     * - Herda valor total, escopo e cronograma do projeto
     */
    generateFromBudget: async (
        projectId: string,
        organizationId: string,
        budgetEntries: BudgetEntry[],
        overrides?: Partial<Contract>
    ): Promise<Contract> => {
        // Calcula valor total do orçamento (quantidade × preço × (1 + bdi/100))
        const totalValue = budgetEntries.reduce((sum, e) => {
            const bdi = e.bdi ?? 0;
            return sum + e.quantity * e.sinapiItem.price * (1 + bdi / 100);
        }, 0);

        // Busca dados do projeto para herdar nome e configurações
        const { data: project } = await supabase
            .from('projects')
            .select('name, settings, budget')
            .eq('id', projectId)
            .single();

        // Gera número sequencial isolado para OUTGOING (Serviços)
        const number = await contractService.getNextContractNumber(organizationId, 'OUTGOING');

        const contractPayload: Omit<Contract, 'id' | 'created_at' | 'current_value'> = {
            organization_id: organizationId,
            project_id: projectId,
            number,
            title: `Contrato — ${project?.name ?? 'Projeto'}`,
            contract_type: 'Empreitada Global',
            nature: 'Serviço',
            direction: 'OUTGOING',
            start_date: new Date().toISOString().split('T')[0],
            end_date: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
            status: 'Rascunho',
            original_value: Math.round(totalValue * 100) / 100,
            retention_rate: 0,
            budget_id: projectId, // referência ao projeto-orçamento
            budget_snapshot: project?.budget ?? null,
            ...overrides,
        };

        const contract = await contractService.createContract(contractPayload);

        // Importa itens do orçamento como contract_items
        if (budgetEntries.length > 0) {
            const items = budgetEntries.map(e => {
                const unitPrice = e.sinapiItem.price * (1 + (e.bdi ?? 0) / 100);
                return {
                    contract_id: contract.id,
                    budget_item_id: e.id,
                    description: `[${e.sinapiItem.code}] ${e.sinapiItem.description}`,
                    unit: e.sinapiItem.unit,
                    quantity: e.quantity,
                    unit_price: Math.round(unitPrice * 100) / 100,
                    total_price: Math.round(e.quantity * unitPrice * 100) / 100,
                };
            });
            await supabase.from('contract_items').insert(items);
        }

        return contract;
    },

    /** Retorna próximo número de contrato formatado, isolado por direction quando informado */
    getNextContractNumber: async (organizationId: string, direction?: 'OUTGOING' | 'INCOMING'): Promise<string> => {
        const { data } = direction
            ? await supabase.rpc('get_next_contract_number', { p_org_id: organizationId, p_direction: direction })
            : await supabase.rpc('get_next_contract_number', { p_org_id: organizationId });
        return data ?? '001';
    },

    // ─── Gerar Obra a partir do Contrato ─────────────────────────────────────

    /**
     * Cria um projeto OBRA vinculado ao contrato assinado.
     * Herda: nome, valor contratado, escopo (budget_snapshot), centro de custo.
     */
    generateObra: async (contractId: string): Promise<{ projectId: string }> => {
        const { data: contract, error } = await supabase
            .from('contracts')
            .select('id, organization_id, project_id, budget_id, supplier_id, number, title, description, contract_type, nature, start_date, end_date, is_recurring, billing_cycle, due_day, status, original_value, current_value, reajuste_index, reajuste_data_base, reajuste_proximo, retention_rate, responsible_email, signed_contract_url, empresa_id, cost_center_id, category_id, payment_method, payment_term_type, payment_days, payment_installments, payment_schedule, client_id, direction, execution_address, client_responsible, internal_responsible, sla_days, warranty_months, labor_value, materials_value, services_included, services_excluded, budget_snapshot, signature_status, signature_token, signature_url, signature_completed_at, approval_status, approval_chain, approval_required_levels, created_at')
            .eq('id', contractId)
            .single();
        if (error || !contract) throw new Error('Contrato não encontrado.');
        if (contract.project_id) throw new Error('Este contrato já possui uma obra vinculada.');


        const settings = {
            ...INITIAL_PROJECT_SETTINGS,
            organizationId: contract.organization_id,
            classification: 'OBRA' as const,
            totalValue: contract.current_value,
            contractId,
            contractNumber: contract.number,
            ...(contract.cost_center_id ? { costCenterId: contract.cost_center_id } : {}),
        };

        const savedProject = await projectService.saveProject({
            name: contract.title,
            settings,
            budget: (contract.budget_snapshot as any) ?? [],
        });

        // Vincula obra ao contrato
        await supabase
            .from('contracts')
            .update({ project_id: savedProject.id })
            .eq('id', contractId);

        return { projectId: savedProject.id };
    },

    // ─── Assinatura Eletrônica ────────────────────────────────────────────────

    sendForSignature: async (
        contractId: string,
        organizationId: string,
        documentBase64: string,
        documentName: string,
        signers: { name: string; email: string; phone?: string }[]
    ): Promise<{ token: string; sign_url: string }> => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Não autenticado.');

        const { data: fnData, error: fnError } = await supabase.functions.invoke('sign-contract', {
            body: { action: 'send', contractId, organizationId, documentBase64, documentName, signers },
        });
        if (fnError) throw new Error(fnError.message ?? 'Erro ao invocar serviço de assinatura.');
        if (!fnData?.success) throw new Error(fnData?.error ?? 'Falha ao enviar para assinatura.');
        return { token: fnData.token, sign_url: fnData.sign_url };
    },

    getSignatureStatus: async (signatureToken: string): Promise<{ status: string; signed_file?: string }> => {
        const { data: fnData, error: fnError } = await supabase.functions.invoke('sign-contract', {
            body: { action: 'status', signatureToken, organizationId: 'query', dealId: 'query' },
        });
        if (fnError) throw new Error(fnError.message);
        return fnData;
    },

    // ─── Aprovação Multinível ─────────────────────────────────────────────────

    // Delega à primitiva unificada (approvalService); injeta os efeitos
    // específicos do contrato (status 'Ativo' ao aprovar / 'Rascunho' ao
    // rejeitar). Assinaturas preservadas (Regra de Ouro 12).
    // Observação: o submit agora resolve os níveis pelo valor do contrato
    // (antes ficava no default 1), unificando a política com o financeiro.

    submitForApproval: async (contractId: string): Promise<Contract> => {
        return await approvalService.submit('contract', contractId) as Contract;
    },

    approveContract: async (
        contractId: string,
        level: 1 | 2,
        approvedBy: string,
        notes?: string
    ): Promise<Contract> => {
        return await approvalService.approve(
            'contract', contractId, level, approvedBy,
            { level1_label: 'Gestor', level2_label: 'Financeiro/Diretoria' },
            notes,
            { status: 'Ativo' },
        ) as Contract;
    },

    rejectContract: async (
        contractId: string,
        rejectedBy: string,
        reason: string
    ): Promise<Contract> => {
        return await approvalService.reject(
            'contract', contractId, rejectedBy, reason,
            { status: 'Rascunho' },
        ) as Contract;
    },

    // ─── Reajuste contratual ──────────────────────────────────────────────────

    /**
     * Aplica reajuste ao contrato usando a fórmula padrão:
     *   novo_valor = current_value × (indexValue / indexBase)
     * onde indexBase e indexValue são fornecidos pelo chamador (ex: INCC/IPCA manual ou via API).
     * Atualiza current_value, reajuste_data_base (nova base = hoje) e reajuste_proximo (+ 12 meses),
     * e re-sincroniza parcelas/recorrência ao módulo financeiro.
     */
    applyReajuste: async (
        contractId: string,
        indexBase: number,
        indexValue: number,
        notes?: string
    ): Promise<Contract> => {
        if (indexBase <= 0) throw new Error('Índice base deve ser maior que zero.');
        if (indexValue <= 0) throw new Error('Índice atual deve ser maior que zero.');

        const { data: contract, error: fetchErr } = await supabase
            .from('contracts')
            .select('id, organization_id, project_id, budget_id, supplier_id, number, title, description, contract_type, nature, start_date, end_date, is_recurring, billing_cycle, due_day, status, original_value, current_value, reajuste_index, reajuste_data_base, reajuste_proximo, retention_rate, responsible_email, signed_contract_url, empresa_id, cost_center_id, category_id, payment_method, payment_term_type, payment_days, payment_installments, payment_schedule, client_id, direction, execution_address, client_responsible, internal_responsible, sla_days, warranty_months, labor_value, materials_value, services_included, services_excluded, signature_status, signature_token, signature_url, signature_completed_at, approval_status, approval_chain, approval_required_levels, created_at')
            .eq('id', contractId)
            .single();
        if (fetchErr) throw fetchErr;

        if (!['Ativo', 'Assinado'].includes(contract.status)) {
            throw new Error(`Não é possível aplicar reajuste em um contrato com status "${contract.status}". O contrato deve estar "Ativo" ou "Assinado".`);
        }

        const fator = indexValue / indexBase;
        const novoValor = parseFloat((contract.current_value * fator).toFixed(2));
        const hoje = new Date().toISOString().split('T')[0];
        const proximo = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0];

        const { data: updated, error: updateErr } = await supabase
            .from('contracts')
            .update({
                current_value: novoValor,
                reajuste_data_base: hoje,
                reajuste_proximo: proximo,
                ...(notes ? { description: `[Reajuste ${hoje}] ${notes}\n${contract.description || ''}` } : {}),
            })
            .eq('id', contractId)
            .select()
            .single();
        if (updateErr) throw updateErr;

        // Re-sync parcelas futuras se parcelado
        if (!updated.is_recurring && updated.payment_term_type === 'Parcelado') {
            await syncParceladoScheduleToFinance(updated as Contract);
        }

        return updated as Contract;
    },
};
