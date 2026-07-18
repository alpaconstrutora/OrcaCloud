import { supabase } from '../lib/supabase';
import { calculateNPV, round2 } from '../utils/financialMath';
import type { IndexName } from './contractIndexService';

// ==========================================================================
// Plano de Vendas e Propostas (PV) — F1
//
// Duas responsabilidades, deliberadamente separadas:
//  1. CRUD de sales_plans (a politica comercial versionada).
//  2. Motor de calculo da simulacao — PURO, deterministico, sem I/O.
//     A VALIDACAO da politica NAO vive aqui: e' do servidor
//     (fn_validate_sales_simulation). O front so' espelha. Ver validateSimulation.
// ==========================================================================

export type SalesPlanStatus = 'draft' | 'active' | 'suspended' | 'closed';

export interface SalesPlan {
    id: string;
    organization_id: string;
    building_id: string;
    price_table_id?: string | null;
    name: string;
    description?: string | null;
    effective_start: string;      // 'YYYY-MM-DD'
    effective_end?: string | null;
    min_down_payment_pct: number;
    max_installments: number;
    max_discount_pct: number;
    min_installment_value?: number | null;
    max_intermediary_count: number;
    keys_pct: number;
    index_name?: IndexName | null;
    interest_rate_monthly: number;         // % ao mes cobrado do comprador
    opportunity_rate_monthly?: number | null; // % ao mes — custo de capital (desconto do VPL)
    commission_pct: number;
    status: SalesPlanStatus;
    created_at?: string;
    updated_at?: string;
}

const PLAN_COLS =
    'id, organization_id, building_id, price_table_id, name, description, effective_start, effective_end, ' +
    'min_down_payment_pct, max_installments, max_discount_pct, min_installment_value, max_intermediary_count, ' +
    'keys_pct, index_name, interest_rate_monthly, opportunity_rate_monthly, commission_pct, status, created_at, updated_at';

// Custo de capital assumido quando o plano nao define opportunity_rate_monthly.
// 1% a.m. e' uma referencia conservadora de incorporadora; a UI deve deixar explicito.
const DEFAULT_OPPORTUNITY_RATE_MONTHLY = 0.01;

// --------------------------------------------------------------------------
// Motor de calculo (puro)
// --------------------------------------------------------------------------

export interface PaymentComposition {
    unitPrice: number;            // preco de tabela da unidade
    discountPct: number;          // desconto comercial nominal (%)
    downPaymentPct: number;       // entrada no ato (% do total)
    monthlyInstallments: number;  // qtd de parcelas mensais
    financingPct?: number;        // % financiado por banco (recebido ~no ato, MVP)
    keysPct?: number;             // parcela nas chaves (% do total), paga no ultimo mes
    intermediaries?: { count: number; value: number; everyMonths: number }[];
    // Taxas mensais em DECIMAL (0.01 = 1%). Se ausentes, usa o plano/defaults.
    correctionRateMonthly?: number;   // indice aplicado as parcelas futuras
    opportunityRateMonthly?: number;  // taxa de desconto do VPL
}

export interface SimulationResult {
    unitPrice: number;
    totalValue: number;           // nominal apos desconto comercial
    downPayment: number;
    financingValue: number;
    keysValue: number;
    intermediaryTotal: number;
    monthlyBase: number;          // parcela mensal (mes 1, antes da correcao acumular)
    totalNominalReceived: number; // soma de tudo que o comprador paga (com correcao)
    presentValue: number;         // VPL do fluxo, descontado ao custo de capital
    // A separacao que justifica o modulo inteiro (§5 do PRD):
    nominalDiscount: number;      // desconto comercial explicito (unitPrice - totalValue)
    nominalDiscountPct: number;
    financialDiscount: number;    // perda de valor do tempo (totalValue - VPL)
    financialDiscountPct: number;
    economicDiscount: number;     // efeito combinado (unitPrice - VPL)
    economicDiscountPct: number;
    cashFlow: number[];           // fluxo mensal nominal, indice = mes (0..N)
}

/**
 * Simula a composicao de pagamento e devolve os indicadores financeiros.
 * PURO: nao toca banco, nao valida politica. Deterministico.
 *
 * Modelo (MVP, explicito e defensavel):
 *  - Desconto comercial reduz o preco: totalValue = unitPrice*(1 - discount).
 *  - Entrada e financiamento entram no mes 0.
 *  - Parcelas mensais iguais em termos reais, corrigidas pelo indice a cada mes:
 *      parcela_t = base * (1+correcao)^t.
 *  - Intermediarias caem na sua periodicidade, tambem corrigidas.
 *  - Chaves no ultimo mes (proxy de entrega).
 *  - VPL desconta o fluxo nominal ao custo de capital (opportunityRate).
 *
 * Insight central: uma proposta "sem desconto" (totalValue = unitPrice) em 120x
 * com correcao < custo de capital ainda tem financialDiscount alto, porque
 * presentValue << totalValue. E' o desconto que ninguem ve.
 */
export function simulatePayment(comp: PaymentComposition): SimulationResult {
    const unitPrice = comp.unitPrice || 0;
    const nominalDiscount = round2(unitPrice * (comp.discountPct || 0) / 100);
    const totalValue = round2(unitPrice - nominalDiscount);

    const downPayment = round2(totalValue * (comp.downPaymentPct || 0) / 100);
    const financingValue = round2(totalValue * (comp.financingPct || 0) / 100);
    const keysValue = round2(totalValue * (comp.keysPct || 0) / 100);
    const intermediaries = comp.intermediaries ?? [];
    const intermediaryTotal = round2(
        intermediaries.reduce((s, it) => s + (it.count || 0) * (it.value || 0), 0)
    );

    const n = Math.max(0, Math.floor(comp.monthlyInstallments || 0));
    const remaining = round2(totalValue - downPayment - financingValue - keysValue - intermediaryTotal);
    const monthlyBase = n > 0 ? round2(remaining / n) : 0;

    const corr = comp.correctionRateMonthly ?? 0;
    const opp = comp.opportunityRateMonthly ?? DEFAULT_OPPORTUNITY_RATE_MONTHLY;

    // Fluxo mensal nominal. Indice = mes. Horizonte = max(n, maior intermediaria).
    const horizon = Math.max(
        n,
        ...intermediaries.map(it => (it.count || 0) * (it.everyMonths || 1)),
        0
    );
    const cashFlow = new Array(horizon + 1).fill(0);

    // Mes 0: entrada + financiamento.
    cashFlow[0] = round2(downPayment + financingValue);

    // Parcelas mensais corrigidas.
    for (let t = 1; t <= n; t++) {
        cashFlow[t] = round2(cashFlow[t] + monthlyBase * Math.pow(1 + corr, t));
    }

    // Intermediarias, corrigidas pelo mes em que caem.
    for (const it of intermediaries) {
        for (let k = 1; k <= (it.count || 0); k++) {
            const t = k * (it.everyMonths || 1);
            if (t < cashFlow.length) cashFlow[t] = round2(cashFlow[t] + (it.value || 0) * Math.pow(1 + corr, t));
        }
    }

    // Chaves no ultimo mes (corrigida).
    if (keysValue > 0 && horizon > 0) {
        cashFlow[horizon] = round2(cashFlow[horizon] + keysValue * Math.pow(1 + corr, horizon));
    } else if (keysValue > 0) {
        cashFlow[0] = round2(cashFlow[0] + keysValue);
    }

    const totalNominalReceived = round2(cashFlow.reduce((s, v) => s + v, 0));
    const presentValue = round2(calculateNPV(opp, cashFlow));

    const financialDiscount = round2(totalValue - presentValue);
    const economicDiscount = round2(unitPrice - presentValue);

    const pct = (v: number) => (unitPrice > 0 ? round2((v / unitPrice) * 100) : 0);

    return {
        unitPrice, totalValue, downPayment, financingValue, keysValue, intermediaryTotal,
        monthlyBase, totalNominalReceived, presentValue,
        nominalDiscount, nominalDiscountPct: pct(nominalDiscount),
        financialDiscount, financialDiscountPct: pct(financialDiscount),
        economicDiscount, economicDiscountPct: pct(economicDiscount),
        cashFlow,
    };
}

// --------------------------------------------------------------------------
// F2 — Rentabilidade gerencial. Custo x VPL x margem.
// O custo vem da RPC (fn_unit_cost_basis), que RECUSA corretores no banco — o
// corretor NUNCA ve custo/margem. O calculo de margem e' PURO (abaixo).
// --------------------------------------------------------------------------

export interface UnitCostBasis {
    hasCost: boolean;
    costBasis: number | null;   // custo total da unidade (R$)
    costPerSqm: number | null;  // custo/m2 usado
    areaSqm: number | null;
    source: string;
}

export interface Rentability {
    costBasis: number;
    grossMargin: number;        // nominal apos desconto: totalValue - custo
    grossMarginPct: number;     // sobre totalValue
    economicMargin: number;     // VPL - custo (a margem que sobrevive ao tempo)
    economicMarginPct: number;  // sobre presentValue
    markupPct: number;          // (VPL - custo) / custo
}

/**
 * Margem a partir de uma simulacao ja pronta + o custo da unidade. PURO.
 * A distincao que importa: grossMargin ignora o valor do tempo; economicMargin
 * usa o VPL, entao uma venda parcelada "no lucro" nominal pode estar no prejuizo
 * economico se o custo de capital comer a margem.
 */
export function computeRentability(sim: SimulationResult, costBasis: number): Rentability {
    const grossMargin = round2(sim.totalValue - costBasis);
    const economicMargin = round2(sim.presentValue - costBasis);
    return {
        costBasis: round2(costBasis),
        grossMargin,
        grossMarginPct: sim.totalValue > 0 ? round2((grossMargin / sim.totalValue) * 100) : 0,
        economicMargin,
        economicMarginPct: sim.presentValue > 0 ? round2((economicMargin / sim.presentValue) * 100) : 0,
        markupPct: costBasis > 0 ? round2((economicMargin / costBasis) * 100) : 0,
    };
}

// --------------------------------------------------------------------------
// Validacao de politica — o SERVIDOR e' a autoridade. Aqui so' o wrapper da RPC.
// --------------------------------------------------------------------------

export type Verdict = 'ALLOWED' | 'WARN' | 'NEEDS_APPROVAL' | 'BLOCKED';

export interface PolicyCheck {
    rule: string;
    verdict: Verdict;
    message: string;
    limit: number | null;
    value: number | null;
}

export interface PolicyValidation {
    overall: Verdict;
    checks: PolicyCheck[];
}

export interface SimulationPolicyInput {
    down_payment_pct: number;
    installments: number;
    discount_pct: number;
    installment_value: number;
    intermediary_count: number;
}

// --------------------------------------------------------------------------
// Servico
// --------------------------------------------------------------------------

export const salesPlanService = {
    async list(buildingId: string): Promise<SalesPlan[]> {
        const { data, error } = await supabase
            .from('sales_plans')
            .select(PLAN_COLS)
            .eq('building_id', buildingId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []) as unknown as SalesPlan[];
    },

    async listActive(buildingId: string): Promise<SalesPlan[]> {
        const { data, error } = await supabase
            .from('sales_plans')
            .select(PLAN_COLS)
            .eq('building_id', buildingId)
            .eq('status', 'active')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []) as unknown as SalesPlan[];
    },

    async save(plan: Partial<SalesPlan>): Promise<SalesPlan> {
        if (plan.id) {
            const { id, created_at, ...payload } = plan;
            const { data, error } = await supabase
                .from('sales_plans')
                .update({ ...payload, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select(PLAN_COLS)
                .single();
            if (error) throw error;
            return data as unknown as SalesPlan;
        }
        const { data, error } = await supabase
            .from('sales_plans')
            .insert(plan)
            .select(PLAN_COLS)
            .single();
        if (error) throw error;
        return data as unknown as SalesPlan;
    },

    async setStatus(id: string, status: SalesPlanStatus): Promise<void> {
        const { error } = await supabase
            .from('sales_plans')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
    },

    async remove(id: string): Promise<void> {
        // RLS so' permite deletar rascunho.
        const { error } = await supabase.from('sales_plans').delete().eq('id', id);
        if (error) throw error;
    },

    /** Valida a simulacao contra a politica. O servidor decide; nao reimplementar em TS. */
    async validateSimulation(planId: string, input: SimulationPolicyInput): Promise<PolicyValidation> {
        const { data, error } = await supabase.rpc('fn_validate_sales_simulation', {
            p_plan_id: planId,
            p_payload: input,
        });
        if (error) throw error;
        return data as PolicyValidation;
    },

    /**
     * Custo da unidade para a analise de rentabilidade (F2). A RPC recusa
     * corretores (RAISE EXCEPTION) — o erro sobe e a UI trata. Nao ha caminho em
     * que um corretor receba custo por aqui.
     */
    async getUnitCostBasis(propertyId: string): Promise<UnitCostBasis> {
        const { data, error } = await supabase.rpc('fn_unit_cost_basis', {
            p_property_id: propertyId,
        });
        if (error) throw error;
        const d = data as Record<string, unknown>;
        return {
            hasCost: !!d.has_cost,
            costBasis: d.cost_basis != null ? Number(d.cost_basis) : null,
            costPerSqm: d.cost_per_sqm != null ? Number(d.cost_per_sqm) : null,
            areaSqm: d.area_sqm != null ? Number(d.area_sqm) : null,
            source: String(d.source ?? ''),
        };
    },
};
