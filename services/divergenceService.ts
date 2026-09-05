import { supabase } from '../lib/supabase';
import { bankReconciliationService } from './bankReconciliationService';
import type {
    ReconciliationDivergences,
    BankWithoutInternal,
    ValueMismatch,
} from '../types/financial';

interface DivergenceOptions {
    asOf?: string;
    agingDays?: number;
    valueTolerance?: number;
    limit?: number;
}

/** Bloqueia mutações em datas dentro de um período já fechado. */
async function assertPeriodOpen(organizationId: string, date: string): Promise<void> {
    const { data, error } = await supabase.rpc('fn_period_is_closed', {
        p_organization_id: organizationId,
        p_date:            date,
    });
    if (error) throw error;
    if (data) throw new Error('Período fechado: reabra o mês no Fechamento Mensal para alterar lançamentos.');
}

export const divergenceService = {
    /**
     * Retorna as divergências de conciliação classificadas em três tipos.
     */
    async getDivergences(
        organizationId: string | null,
        opts: DivergenceOptions = {},
    ): Promise<ReconciliationDivergences> {
        const asOf = opts.asOf ?? new Date().toISOString().split('T')[0];
        const { data, error } = await supabase.rpc('fn_reconciliation_divergences', {
            p_organization_id: organizationId || null,
            p_as_of:           asOf,
            p_aging_days:      opts.agingDays ?? 5,
            p_value_tolerance: opts.valueTolerance ?? 50,
            p_limit:           opts.limit ?? 100,
        });
        if (error) throw error;
        return (data as ReconciliationDivergences) ?? {
            as_of: asOf,
            counts: { bank_without_internal: 0, internal_without_bank: 0, value_mismatch: 0 },
            bank_without_internal: [],
            internal_without_bank: [],
            value_mismatch: [],
        };
    },

    /**
     * Tipo 1 — cria um lançamento interno espelhando o movimento bancário
     * e o vincula automaticamente (ambos passam a CONCILIADO).
     * `overrides` permite classificar (categoria, obra, contraparte) antes de criar.
     */
    async createInternalAndMatch(
        organizationId: string,
        bank: BankWithoutInternal,
        overrides?: {
            category?: string;
            project_id?: string | null;
            cost_center_id?: string | null;
            party_id?: string | null;
            party_name?: string | null;
            party_type?: 'CLIENT' | 'SUPPLIER' | null;
            entity_name?: string | null;
            description?: string;
        },
    ): Promise<void> {
        await assertPeriodOpen(organizationId, bank.transaction_date);
        const entityName = overrides?.party_name?.trim() || overrides?.entity_name?.trim() || null;
        // party_id tem FK só para clients (internal_txs_party_id_fkey); fornecedor fica null
        const partyId = overrides?.party_type === 'CLIENT' ? (overrides?.party_id || null) : null;
        const { data: inserted, error } = await supabase
            .from('internal_transactions')
            .insert({
                organization_id: organizationId,
                source_system: 'MANUAL',
                transaction_date: bank.transaction_date,
                amount: bank.amount,
                direction: bank.direction,
                description: overrides?.description?.trim() || bank.description || 'Lançamento gerado da conciliação',
                category: overrides?.category?.trim() || bank.category || 'Geral',
                project_id: overrides?.project_id || null,
                cost_center_id: overrides?.cost_center_id || null,
                party_id: partyId,
                party_name: entityName,
                party_type: overrides?.party_type || null,
                entity_name: entityName,
                status: 'PENDING',
            })
            .select('id')
            .single();
        if (error) throw error;
        await bankReconciliationService.createMatch(bank.id, inserted!.id, 'MANUAL', 100);
        await this.audit(organizationId, 'MANUAL_CREATE', bank.id, {
            action: 'CREATE_INTERNAL_FROM_BANK',
            internal_id: inserted!.id,
            category: overrides?.category || bank.category,
            project_id: overrides?.project_id ?? null,
            cost_center_id: overrides?.cost_center_id ?? null,
            party_id: partyId,
        });
    },

    /**
     * Tipo 1 (alternativa) — confirma o movimento sem criar título
     * (ex.: tarifas/impostos já contabilizados externamente).
     */
    async confirmWithoutTitle(organizationId: string, bankTxId: string): Promise<void> {
        await bankReconciliationService.confirmTransaction(bankTxId, undefined, organizationId);
    },

    /**
     * Tipo 2 — estorna um título sem movimento bancário (status CANCELLED).
     */
    async reverseInternal(organizationId: string, internalTxId: string): Promise<void> {
        const { error } = await supabase
            .from('internal_transactions')
            .update({ status: 'CANCELLED' })
            .eq('id', internalTxId);
        if (error) throw error;
        await this.audit(organizationId, 'REJECT', internalTxId, { action: 'REVERSE_INTERNAL' });
    },

    /**
     * Tipo 2 — reabre um título previamente cancelado/baixado (volta a PENDING).
     */
    async reopenInternal(organizationId: string, internalTxId: string): Promise<void> {
        const { error } = await supabase
            .from('internal_transactions')
            .update({ status: 'PENDING' })
            .eq('id', internalTxId);
        if (error) throw error;
        await this.audit(organizationId, 'MANUAL_CREATE', internalTxId, { action: 'REOPEN_INTERNAL' });
    },

    /**
     * Tipo 3 — concilia extrato × título com diferença de valor.
     * Cria o vínculo e gera um lançamento de ajuste (tarifa/juros/desconto)
     * para o resíduo, mantendo o saldo contábil igual ao bancário.
     */
    async reconcileWithDifference(
        organizationId: string,
        m: ValueMismatch,
        adjustmentCategory = 'Tarifas Bancárias',
    ): Promise<void> {
        await assertPeriodOpen(organizationId, m.bank_date);
        // Vínculo + lançamento de ajuste do resíduo + auditoria, numa transação só
        // (fn_reconcile_match com p_adjustment_category). O ajuste nasce já vinculado
        // ao mesmo movimento, para o saldo do razão bater com o do banco.
        await bankReconciliationService.createMatch(m.bank_id, m.internal_id, 'MANUAL', 100, adjustmentCategory);
    },

    async audit(
        organizationId: string,
        eventType: 'IMPORT' | 'MATCH' | 'REJECT' | 'MANUAL_CREATE',
        targetId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        try {
            await supabase.from('reconciliation_audit_log').insert({
                organization_id: organizationId,
                event_type: eventType,
                target_id: targetId,
                payload,
            });
        } catch (e) {
            console.warn('[divergenceService] audit falhou (ignorado):', e);
        }
    },
};
