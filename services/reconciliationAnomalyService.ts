import { supabase } from '../lib/supabase';
import type { ReconciliationAnomalies } from '../types/financial';

interface AnomalyOptions {
    asOf?: string;
    lookbackDays?: number;
    dupWindowDays?: number;
    minAmount?: number;
    zThreshold?: number;
    limit?: number;
}

export const reconciliationAnomalyService = {
    /**
     * Detecta anomalias de conciliação: possíveis duplicidades e
     * valores fora do padrão histórico por contraparte.
     */
    async getAnomalies(
        organizationId: string | null,
        opts: AnomalyOptions = {},
    ): Promise<ReconciliationAnomalies> {
        const asOf = opts.asOf ?? new Date().toISOString().split('T')[0];
        const { data, error } = await supabase.rpc('fn_reconciliation_anomalies', {
            p_organization_id: organizationId || null,
            p_as_of:           asOf,
            p_lookback_days:   opts.lookbackDays ?? 180,
            p_dup_window_days: opts.dupWindowDays ?? 7,
            p_min_amount:      opts.minAmount ?? 100,
            p_z_threshold:     opts.zThreshold ?? 3,
            p_limit:           opts.limit ?? 100,
        });
        if (error) throw error;
        return (data as ReconciliationAnomalies) ?? {
            as_of: asOf,
            counts: { duplicates: 0, value_outliers: 0 },
            duplicates: [],
            value_outliers: [],
        };
    },
};
