import { supabase } from '../lib/supabase';
import type { ReconciliationDashboard } from '../types/financial';

const EMPTY_DASHBOARD = (asOf: string): ReconciliationDashboard => ({
    as_of: asOf,
    accounts: [],
    totals: {
        opening_balance: 0,
        bank_balance: 0,
        reconciled_balance: 0,
        difference: 0,
        pending_value: 0,
        pending_count: 0,
        unclassified_count: 0,
    },
    system_balance: 0,
    fees: { value: 0, count: 0 },
});

export const reconciliationDashboardService = {
    /**
     * Consolida saldo bancário (extrato) vs. saldo conciliado e contábil,
     * por conta e no total da organização, na data de referência informada.
     */
    async getDashboard(
        organizationId: string,
        asOf?: string,
    ): Promise<ReconciliationDashboard> {
        const asOfDate = asOf ?? new Date().toISOString().split('T')[0];
        const { data, error } = await supabase.rpc('fn_reconciliation_dashboard', {
            p_organization_id: organizationId,
            p_as_of:           asOfDate,
        });
        if (error) throw error;
        return (data as ReconciliationDashboard) ?? EMPTY_DASHBOARD(asOfDate);
    },

    /**
     * Atualiza o saldo inicial de uma conta bancária (ponto de partida da conciliação).
     */
    async setOpeningBalance(
        accountId: string,
        openingBalance: number,
        openingBalanceDate: string | null,
    ): Promise<void> {
        const { error } = await supabase
            .from('payment_accounts')
            .update({
                opening_balance: openingBalance,
                opening_balance_date: openingBalanceDate,
            })
            .eq('id', accountId);
        if (error) throw error;
    },
};
