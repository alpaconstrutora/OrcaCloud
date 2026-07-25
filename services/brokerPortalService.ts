import { supabase } from '../lib/supabase';
import type { CommercialPriceTable, CommercialPriceTableItem } from './commercialPriceTableService';
import type { SalesPlan, PolicyValidation, SimulationPolicyInput } from './salesPlanService';

export interface BrokerPortalToken {
    id: string;
    org_id: string;
    broker_id: string;
    token: string;
    expires_at: string;
    last_used_at?: string;
    is_active: boolean;
    created_at?: string;
}

export const brokerPortalService = {
    /** Gera ou regenera token de acesso para um corretor (admin autenticado). */
    async generateToken(brokerId: string, orgId: string): Promise<string> {
        const { data, error } = await supabase.rpc('broker_portal_generate_token', {
            p_broker_id: brokerId,
            p_org_id: orgId,
        });
        if (error) throw error;
        return data as string;
    },

    /** Busca token ativo existente de um corretor (admin autenticado). */
    async getTokenForBroker(brokerId: string): Promise<BrokerPortalToken | null> {
        const { data, error } = await supabase
            .from('broker_portal_tokens')
            .select('*')
            .eq('broker_id', brokerId)
            .eq('is_active', true)
            .maybeSingle();
        if (error) throw error;
        return data as BrokerPortalToken | null;
    },

    /** Revoga acesso de um corretor ao portal. */
    async revokeToken(brokerId: string): Promise<void> {
        const { error } = await supabase
            .from('broker_portal_tokens')
            .update({ is_active: false })
            .eq('broker_id', brokerId);
        if (error) throw error;
    },

    /** Valida token e retorna dados do corretor (anon — usado pela rota pública). */
    async getPortalData(token: string): Promise<{ valid: boolean; broker?: any; org_id?: string }> {
        const { data, error } = await supabase.rpc('broker_portal_get_data', { p_token: token });
        if (error) throw error;
        return data as { valid: boolean; broker?: any; org_id?: string };
    },

    /** URL pública do portal do corretor para compartilhamento. */
    buildPortalUrl(token: string): string {
        return `${window.location.origin}/portal-corretor?token=${token}`;
    },

    // ── RPCs de dados via token (anon) ────────────────────────────────────────

    async getUnitsByToken(token: string): Promise<any[]> {
        const { data, error } = await supabase.rpc('fn_broker_portal_get_units', { p_token: token });
        if (error) throw error;
        const res = data as { valid: boolean; units?: any[] };
        return res?.units ?? [];
    },

    async getProposalsByToken(token: string): Promise<any[]> {
        const { data, error } = await supabase.rpc('fn_broker_portal_get_proposals', { p_token: token });
        if (error) throw error;
        const res = data as { valid: boolean; proposals?: any[] };
        return res?.proposals ?? [];
    },

    async getCommissionsByToken(token: string): Promise<any[]> {
        const { data, error } = await supabase.rpc('fn_broker_portal_get_commissions', { p_token: token });
        if (error) throw error;
        const res = data as { valid: boolean; commissions?: any[] };
        return res?.commissions ?? [];
    },

    /**
     * Tabela de preços ATIVA de um empreendimento (building), para o modo público
     * do Portal do Corretor. Espelha commercialPriceTableService.getActiveTable +
     * getTableItems, mas via RPC anon — essas duas tabelas têm RLS `is_org_member`
     * sem policy `TO anon` (ver migration fn_broker_portal_get_price_table).
     * `table: null` quando o prédio não tem versão ativa — o chamador cai no
     * fallback das unidades filhas com o preço vigente de commercial_properties.
     */
    async getPriceTableByToken(token: string, buildingId: string): Promise<{
        table: Pick<CommercialPriceTable, 'id' | 'version_label' | 'effective_date' | 'status' | 'activated_at'> | null;
        items: CommercialPriceTableItem[];
    }> {
        const { data, error } = await supabase.rpc('fn_broker_portal_get_price_table', {
            p_token: token,
            p_building_id: buildingId,
        });
        if (error) throw error;
        const res = data as {
            valid: boolean;
            table?: Pick<CommercialPriceTable, 'id' | 'version_label' | 'effective_date' | 'status' | 'activated_at'> | null;
            items?: CommercialPriceTableItem[];
        };
        return { table: res?.table ?? null, items: res?.items ?? [] };
    },

    /**
     * Tabela de ALUGUÉIS ativa de um empreendimento, para o modo público do
     * Portal do Corretor. Espelho de getPriceTableByToken, mas via RPC
     * fn_broker_portal_get_rental_price_table — lê rental_price em vez de price.
     */
    async getRentalPriceTableByToken(token: string, buildingId: string): Promise<{
        table: Pick<CommercialPriceTable, 'id' | 'version_label' | 'effective_date' | 'status' | 'activated_at'> | null;
        items: CommercialPriceTableItem[];
    }> {
        const { data, error } = await supabase.rpc('fn_broker_portal_get_rental_price_table', {
            p_token: token,
            p_building_id: buildingId,
        });
        if (error) throw error;
        const res = data as {
            valid: boolean;
            table?: Pick<CommercialPriceTable, 'id' | 'version_label' | 'effective_date' | 'status' | 'activated_at'> | null;
            items?: CommercialPriceTableItem[];
        };
        return { table: res?.table ?? null, items: res?.items ?? [] };
    },

    /**
     * Colunas visíveis da tabela de preços do Portal do Corretor (por organização).
     * NÃO é preferência de tela: é o que o corretor enxerga no link público — o
     * admin escolhe na visão do app e o link passa a refletir. `null` = org nunca
     * configurou, o front usa o default (todas as colunas).
     */
    async getPriceColumns(orgId: string): Promise<string[] | null> {
        const { data, error } = await supabase
            .from('broker_portal_price_columns')
            .select('visible_columns')
            .eq('org_id', orgId)
            .maybeSingle();
        if (error) throw error;
        const cols = data?.visible_columns;
        return Array.isArray(cols) ? (cols as string[]) : null;
    },

    async savePriceColumns(orgId: string, columns: string[]): Promise<void> {
        const { error } = await supabase
            .from('broker_portal_price_columns')
            .upsert({ org_id: orgId, visible_columns: columns, updated_at: new Date().toISOString() }, { onConflict: 'org_id' });
        if (error) throw error;
    },

    /** Espelho anon de getPriceColumns — o link não tem sessão Supabase. */
    async getPriceColumnsByToken(token: string): Promise<string[] | null> {
        const { data, error } = await supabase.rpc('fn_broker_portal_get_price_columns', { p_token: token });
        if (error) throw error;
        const res = data as { valid: boolean; columns?: string[] | null };
        return Array.isArray(res?.columns) ? res.columns : null;
    },

    /**
     * Planos de vendas ATIVOS de um empreendimento, para o Simulador de Proposta
     * no modo público (sem sessão Supabase). Espelha salesPlanService.listActive,
     * mas via RPC anon — sales_plans só tem RLS `TO authenticated` (20270717000000).
     */
    async getSalesPlansByToken(token: string, buildingId: string): Promise<SalesPlan[]> {
        const { data, error } = await supabase.rpc('fn_broker_portal_get_sales_plans', {
            p_token: token,
            p_building_id: buildingId,
        });
        if (error) throw error;
        const res = data as { valid: boolean; plans?: SalesPlan[] };
        return res?.plans ?? [];
    },

    /**
     * Validação de política do Simulador no modo público. Espelha
     * salesPlanService.validateSimulation, mas a posse do plano é conferida pelo
     * token (nunca por is_org_member, que exige auth.uid() — sempre nulo em anon).
     * Mesmas regras do lado autenticado: ambas as RPCs delegam para
     * fn_sales_simulation_checks no banco, não há duplicação de política.
     */
    async validateSalesSimulationByToken(token: string, planId: string, input: SimulationPolicyInput): Promise<PolicyValidation> {
        const { data, error } = await supabase.rpc('fn_broker_portal_validate_sales_simulation', {
            p_token: token,
            p_plan_id: planId,
            p_payload: input,
        });
        if (error) throw error;
        return data as PolicyValidation;
    },
};
