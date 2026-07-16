import { supabase } from '../lib/supabase';
import { calculateNPV, calculateIRR } from '../utils/financialMath';

export type LandDealType = 'compra_direta' | 'permuta_fisica' | 'permuta_financeira' | 'opcao_compra' | 'sociedade';

export const LAND_DEAL_TYPE_LABELS: Record<LandDealType, string> = {
    compra_direta: 'Compra Direta',
    permuta_fisica: 'Permuta Física',
    permuta_financeira: 'Permuta Financeira',
    opcao_compra: 'Opção de Compra',
    sociedade: 'Sociedade com o Proprietário',
};

/** Premissas por tipo de negócio — só os campos do tipo escolhido são preenchidos */
export interface LandDealPremises {
    // compra_direta
    valor_total?: number;
    entrada?: number;
    num_parcelas?: number;
    taxa_correcao_mensal_pct?: number;
    // permuta_fisica
    unidades_prometidas?: number;
    valor_referencia_unidades?: number;
    prazo_entrega_meses?: number;
    // permuta_financeira
    percentual_sobre_vgv?: number;
    valor_minimo_garantido?: number;
    // opcao_compra
    premio_opcao?: number;
    prazo_opcao_meses?: number;
    valor_exercicio?: number;
    // sociedade
    participacao_pct?: number;
    aporte_terreno_equivalente?: number;
}

export interface LandDealScenario {
    id?: string;
    organization_id: string;
    opportunity_id: string;
    deal_type: LandDealType;
    name: string;
    premises_json: LandDealPremises;
    land_cost_equivalent?: number | null;
    impact_tir_pct?: number | null;
    impact_vpl?: number | null;
    max_cash_exposure?: number | null;
    notes?: string | null;
    is_selected?: boolean;
    created_at?: string;
    updated_at?: string;
}

const SCENARIO_COLS = 'id, organization_id, opportunity_id, deal_type, name, premises_json, land_cost_equivalent, impact_tir_pct, impact_vpl, max_cash_exposure, notes, is_selected, created_at, updated_at';

/** Custo de terreno equivalente para comparação entre modelos, a valor presente simples */
export function calculateLandCostEquivalent(dealType: LandDealType, p: LandDealPremises, vgv?: number): number {
    switch (dealType) {
        case 'compra_direta': {
            const entrada = p.entrada ?? 0;
            const total = p.valor_total ?? 0;
            const parcelas = Math.max(1, p.num_parcelas ?? 1);
            const saldo = total - entrada;
            const rate = (p.taxa_correcao_mensal_pct ?? 0) / 100;
            const flows = [-entrada, ...Array(parcelas).fill(-saldo / parcelas)];
            return -calculateNPV(rate, flows);
        }
        case 'permuta_fisica':
            return p.valor_referencia_unidades ?? (p.unidades_prometidas ?? 0) * 0;
        case 'permuta_financeira':
            return vgv != null && p.percentual_sobre_vgv != null
                ? Math.max((vgv * p.percentual_sobre_vgv) / 100, p.valor_minimo_garantido ?? 0)
                : p.valor_minimo_garantido ?? 0;
        case 'opcao_compra':
            return (p.premio_opcao ?? 0) + (p.valor_exercicio ?? 0);
        case 'sociedade':
            return p.aporte_terreno_equivalente ?? 0;
        default:
            return 0;
    }
}

/** Exposição máxima de caixa no fechamento do negócio (desembolso imediato) */
export function calculateMaxCashExposure(dealType: LandDealType, p: LandDealPremises): number {
    switch (dealType) {
        case 'compra_direta': return p.entrada ?? 0;
        case 'permuta_fisica': return 0;
        case 'permuta_financeira': return 0;
        case 'opcao_compra': return p.premio_opcao ?? 0;
        case 'sociedade': return 0;
        default: return 0;
    }
}

/** Impacto no fluxo do estudo Imovib vinculado: substitui o custo de terreno pelo equivalente do modelo e recalcula TIR/VPL */
export function calculateDealImpactOnStudy(
    dealType: LandDealType,
    p: LandDealPremises,
    baseMonthlyFlows: number[],
    baseLandCost: number,
    vgv?: number,
): { impactTirPct: number | null; impactVpl: number | null } {
    const landCostEquivalent = calculateLandCostEquivalent(dealType, p, vgv);
    const delta = baseLandCost - landCostEquivalent;
    if (baseMonthlyFlows.length === 0) return { impactTirPct: null, impactVpl: null };
    const adjustedFlows = [...baseMonthlyFlows];
    adjustedFlows[0] = (adjustedFlows[0] ?? 0) + delta;
    const irr = calculateIRR(adjustedFlows);
    const vpl = calculateNPV(0.01, adjustedFlows);
    return {
        impactTirPct: irr != null ? irr * 100 : null,
        impactVpl: vpl,
    };
}

export const landDealComparatorService = {
    async listScenarios(opportunityId: string): Promise<LandDealScenario[]> {
        const { data, error } = await supabase
            .from('land_deal_scenarios')
            .select(SCENARIO_COLS)
            .eq('opportunity_id', opportunityId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return (data ?? []) as LandDealScenario[];
    },

    async saveScenario(scenario: Omit<LandDealScenario, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<LandDealScenario> {
        const payload = { ...scenario, updated_at: new Date().toISOString() };
        if (scenario.id) {
            const { data, error } = await supabase
                .from('land_deal_scenarios')
                .update(payload)
                .eq('id', scenario.id)
                .select(SCENARIO_COLS)
                .single();
            if (error) throw error;
            return data as LandDealScenario;
        }
        const { data, error } = await supabase
            .from('land_deal_scenarios')
            .insert(payload)
            .select(SCENARIO_COLS)
            .single();
        if (error) throw error;
        return data as LandDealScenario;
    },

    async deleteScenario(id: string): Promise<void> {
        const { error } = await supabase.from('land_deal_scenarios').delete().eq('id', id);
        if (error) throw error;
    },

    async selectScenario(opportunityId: string, id: string): Promise<void> {
        const { error: clearErr } = await supabase
            .from('land_deal_scenarios')
            .update({ is_selected: false })
            .eq('opportunity_id', opportunityId);
        if (clearErr) throw clearErr;
        const { error } = await supabase
            .from('land_deal_scenarios')
            .update({ is_selected: true })
            .eq('id', id);
        if (error) throw error;
    },
};
