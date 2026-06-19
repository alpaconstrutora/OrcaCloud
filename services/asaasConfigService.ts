import { supabase } from '../lib/supabase';

export interface AsaasChargeConfig {
    organization_id: string;
    fine_percent: number;            // multa (% sobre o valor) após vencimento
    interest_percent_month: number;  // juros (% ao mês) de mora
    discount_percent: number;        // desconto (% até N dias antes do venc.)
    discount_days: number;
}

const DEFAULTS: Omit<AsaasChargeConfig, 'organization_id'> = {
    fine_percent: 2,
    interest_percent_month: 1,
    discount_percent: 0,
    discount_days: 0,
};

const COLS = 'organization_id,fine_percent,interest_percent_month,discount_percent,discount_days';

export const asaasConfigService = {

    /** Retorna a config da org (ou os padrões se ainda não existir). */
    async get(organizationId: string): Promise<AsaasChargeConfig> {
        const { data, error } = await supabase
            .from('asaas_charge_config')
            .select(COLS)
            .eq('organization_id', organizationId)
            .maybeSingle();
        if (error) throw error;
        return data
            ? (data as AsaasChargeConfig)
            : { organization_id: organizationId, ...DEFAULTS };
    },

    /** Salva (upsert) a config padrão da org. */
    async save(cfg: AsaasChargeConfig): Promise<void> {
        const { error } = await supabase
            .from('asaas_charge_config')
            .upsert({
                organization_id:        cfg.organization_id,
                fine_percent:           cfg.fine_percent,
                interest_percent_month: cfg.interest_percent_month,
                discount_percent:       cfg.discount_percent,
                discount_days:          cfg.discount_days,
                updated_at:             new Date().toISOString(),
            }, { onConflict: 'organization_id' });
        if (error) throw error;
    },
};
