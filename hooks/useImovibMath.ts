import { useMemo } from 'react';
import { ImovibStudy } from '../types';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';

export interface MonthlyFlow {
    month: number;
    name: string;
    rev: number;
    cost: number;
    net: number;
    acc: number;
}

export interface ImovibMathOptions {
    vgvDelta?: number; // percentage (-10 to 10)
    costDelta?: number; // percentage (-10 to 10)
}

/** Aba do detalhe do estudo onde a premissa de um aviso é corrigida. */
export type ImovibAba = 'premises' | 'capex' | 'funding' | 'viability_dynamic';

/**
 * Premissa que o motor não consegue usar como está. O motor calcula assim mesmo
 * (com o padrão, ou com o valor como veio) e AVISA — nunca troca em silêncio.
 */
export interface ImovibAviso {
    codigo: 'recebimento_nao_soma_100' | 'cronograma_invalido' | 'sem_area' | 'sem_preco' | 'divida_quitada_no_fim';
    mensagem: string;
    aba: ImovibAba;
}

export interface ImovibMathResult {
    monthlyFlows: MonthlyFlow[];
    maxExposure: number;
    vpl: number;
    annualIrr: number;
    vgvTotal: number;
    netVgvTotal: number;
    constCostTotal: number;
    duration: number;
    landCost: number;
    esgCostTotal: number;
    esgVgvPremiumValue: number;
    esgFundingDiscount: number;
    /** Área construída (privativa + comum) × quantidade × pavimentos — a MESMA que a aba CAPEX exibe. */
    totalBlockArea: number;
    /** Saldo devedor que as receitas não amortizaram e o investidor quita no último mês. */
    debtPayoffAtEnd: number;
    avisos: ImovibAviso[];
}

const calculateNPV = (rate: number, cashFlows: number[]): number => {
    return cashFlows.reduce((acc, val, i) => acc + val / Math.pow(1 + rate, i), 0);
};

// Limites da busca da TIR MENSAL. −90% a.m. já é perda total em qualquer
// horizonte; abaixo disso (1 + r)^i perde precisão em fluxos longos.
const IRR_LOW = -0.9;
const IRR_HIGH = 10.0;

/**
 * TIR mensal por bissecção. Devolve NaN quando não há raiz no intervalo —
 * nunca um dos limites. O motor antigo assumia que o VPL sempre cai com a
 * taxa e, sem raiz, convergia para o limite: exibia TIR de −100% a.a. como se
 * fosse uma taxa calculada.
 */
const calculateIRR = (cashFlows: number[]): number => {
    if (!cashFlows || cashFlows.length === 0) return NaN;
    const hasPositive = cashFlows.some(f => f > 0);
    const hasNegative = cashFlows.some(f => f < 0);
    if (!hasPositive || !hasNegative) return NaN;

    let low = IRR_LOW;
    let high = IRR_HIGH;
    let npvLow = calculateNPV(low, cashFlows);
    const npvHigh = calculateNPV(high, cashFlows);
    if (!Number.isFinite(npvLow) || !Number.isFinite(npvHigh)) return NaN;
    if (npvLow === 0) return low;
    if (npvHigh === 0) return high;
    if (Math.sign(npvLow) === Math.sign(npvHigh)) return NaN;

    // Segue o lado cujo sinal é o do limite inferior — não assume VPL decrescente.
    for (let i = 0; i < 200 && high - low > 1e-12; i++) {
        const mid = (low + high) / 2;
        const npvMid = calculateNPV(mid, cashFlows);
        if (npvMid === 0) return mid;
        if (Math.sign(npvMid) === Math.sign(npvLow)) {
            low = mid;
            npvLow = npvMid;
        } else {
            high = mid;
        }
    }
    return (low + high) / 2;
};

/** Campo vazio (null/undefined/NaN) usa o padrão; 0 digitado continua 0. */
const val = (x: number | null | undefined, padrao: number): number =>
    x == null || Number.isNaN(x) ? padrao : x;

const fmtBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

const EMPTY_RESULT: ImovibMathResult = {
    monthlyFlows: [],
    maxExposure: 0,
    vpl: 0,
    annualIrr: NaN,
    vgvTotal: 0,
    netVgvTotal: 0,
    constCostTotal: 0,
    duration: 0,
    landCost: 0,
    esgCostTotal: 0,
    esgVgvPremiumValue: 0,
    esgFundingDiscount: 0,
    totalBlockArea: 0,
    debtPayoffAtEnd: 0,
    avisos: [],
};

/**
 * Núcleo de cálculo puro — sem React. Extraído do corpo do useMemo abaixo para
 * poder rodar em lote (ex.: uma linha por estudo na listagem de Estudos de
 * Viabilidade), onde chamar o hook num loop violaria as regras dos Hooks.
 * O hook useImovibMath é um wrapper memoizado desta função.
 *
 * Testes: __tests__/imovibMath.test.ts.
 */
export const computeImovibMath = (study: ImovibStudy | null | undefined, options?: ImovibMathOptions): ImovibMathResult => {
        if (!study) return { ...EMPTY_RESULT, avisos: [] };

        const avisos: ImovibAviso[] = [];
        const D = IMOVIB_DEFAULTS;

        // Cronograma: vazio usa o padrão; valor impossível (duração ≤ 0, mês < 1)
        // também usa o padrão, mas AVISA — o motor antigo trocava em silêncio.
        const cronogramaInvalido: string[] = [];
        const mes = (x: number | null | undefined, padrao: number, minimo: number, rotulo: string) => {
            if (x == null || Number.isNaN(x)) return padrao;
            if (x < minimo) {
                cronogramaInvalido.push(`${rotulo} = ${x}`);
                return padrao;
            }
            return Math.round(x);
        };
        const constDur = mes(study.construction_duration_months, D.construction_duration_months, 1, 'duração da obra');
        const salesDur = mes(study.sales_duration_months, D.sales_duration_months, 1, 'duração das vendas');
        const constStart = mes(study.construction_start_month, D.construction_start_month, 1, 'mês de início da obra');
        const salesStart = mes(study.sales_start_month, D.sales_start_month, 1, 'mês de início das vendas');
        if (cronogramaInvalido.length) {
            avisos.push({
                codigo: 'cronograma_invalido',
                mensagem: `Cronograma inválido (${cronogramaInvalido.join('; ')}). Foi usado o padrão no cálculo.`,
                aba: 'viability_dynamic',
            });
        }

        // Total duration is dictated by whichever finishes last
        const duration = Math.max(constStart + constDur - 1, salesStart + salesDur - 1, 1);

        const inflation = val(study.inflation_rate, D.inflation_rate) / 100; // Monthly
        const discount = val(study.discount_rate, D.discount_rate) / 100; // Expected Annual
        const monthlyDiscount = Math.pow(1 + discount, 1 / 12) - 1; // Convert annual to monthly

        // Calculate ESG Impacts
        let esgCostTotal = 0;
        let esgVgvPremium = 0;
        let esgFundingDiscount = 0;

        study.esg_initiatives?.forEach(ini => {
            if (ini.active) {
                esgCostTotal += ini.cost || 0;
                esgVgvPremium += (ini.vgv_premium || 0) / 100;
                esgFundingDiscount += (ini.funding_discount || 0) / 100;
            }
        });

        // Advanced Finance
        const taxRate = val(study.tax_rate, D.tax_rate) / 100;
        const brokerageFee = val(study.brokerage_fee, D.brokerage_fee) / 100;
        const financingPercent = val(study.financing_percent, D.financing_percent) / 100;
        let financingRateAnnual = val(study.financing_rate_annual, D.financing_rate_annual) / 100;

        // Apply ESG Funding Discount
        financingRateAnnual = Math.max(0, financingRateAnnual - esgFundingDiscount);

        const monthlyFinancingRate = Math.pow(1 + financingRateAnnual, 1 / 12) - 1;

        const landCost = study.land_cost || 0;

        // 1. Calculate base totals from blocks
        let baseVgvTotal = 0;
        let baseConstCostTotal = 0;
        let totalBlockArea = 0;

        study.blocks?.forEach(block => {
            let blockPrivateArea = 0;
            let blockCommonArea = 0;
            block.units?.forEach(u => {
                const pav = (u as any).pavimentos || 1;
                blockPrivateArea += (u.quantity || 0) * pav * (u.private_area || 0);
                blockCommonArea += (u.quantity || 0) * pav * (u.common_area || 0);
            });
            baseVgvTotal += blockPrivateArea * (block.sales_price_sqm || 0);
            baseConstCostTotal += (blockPrivateArea + blockCommonArea) * (block.construction_cost_sqm || 0);
            totalBlockArea += blockPrivateArea + blockCommonArea;
        });

        if (totalBlockArea <= 0) {
            avisos.push({
                codigo: 'sem_area',
                mensagem: 'Nenhuma tipologia com área cadastrada: VGV e custo de obra ficam zerados.',
                aba: 'premises',
            });
        } else if (baseVgvTotal <= 0) {
            avisos.push({
                codigo: 'sem_preco',
                mensagem: 'Nenhum bloco tem preço de venda por m²: o VGV fica zerado.',
                aba: 'premises',
            });
        }

        // Apply Sensitivity Deltas & ESG Premiums
        const vgvDeltaMultiplier = 1 + (options?.vgvDelta || 0) / 100;
        const costDeltaMultiplier = 1 + (options?.costDelta || 0) / 100;

        const vgvTotal = baseVgvTotal * (vgvDeltaMultiplier + esgVgvPremium);
        const esgVgvPremiumValue = baseVgvTotal * esgVgvPremium;

        // CAPEX simplificado: área única × custo/m² substitui o custo dos blocos.
        // O custo ESG soma nos DOIS modos (antes sumia no simplificado).
        let constCostTotal: number;
        if (study.capex_mode === 'simplified' && study.capex_simplified_cost_sqm) {
            const effectiveArea = study.capex_simplified_area_sqm || totalBlockArea;
            constCostTotal = (effectiveArea * study.capex_simplified_cost_sqm + esgCostTotal) * costDeltaMultiplier;
        } else {
            constCostTotal = (baseConstCostTotal + esgCostTotal) * costDeltaMultiplier;
        }

        // Apply Swap Physical (reduces marketed VGV)
        const swapPhysical = val(study.swap_physical_percent, D.swap_physical_percent) / 100;
        const marketedVgv = vgvTotal * (1 - swapPhysical);

        // Apply Contingencies (Default, Cancellation, Swap Financial)
        const swapFinancial = val(study.swap_financial_percent, D.swap_financial_percent) / 100;
        const defaultRate = val(study.default_rate_percent, D.default_rate_percent) / 100;
        const cancellationRate = val(study.cancellation_rate_percent, D.cancellation_rate_percent) / 100;

        const netVgvTotal = marketedVgv * (1 - (swapFinancial + defaultRate + cancellationRate));

        // Revenue Curve Distribution (J-Curve Profile)
        const downpaymentPctRaw = val(study.revenue_downpayment_percent, D.revenue_downpayment_percent);
        const constructionPctRaw = val(study.revenue_construction_percent, D.revenue_construction_percent);
        const handoverPctRaw = val(study.revenue_handover_percent, D.revenue_handover_percent);
        const revenueSum = downpaymentPctRaw + constructionPctRaw + handoverPctRaw;
        if (Math.abs(revenueSum - 100) > 0.01) {
            avisos.push({
                codigo: 'recebimento_nao_soma_100',
                mensagem: `O perfil de recebimento soma ${Number(revenueSum.toFixed(2)).toLocaleString('pt-BR')}% (sinal + obra + repasse deveria ser 100%). O cálculo usa os valores como estão.`,
                aba: 'funding',
            });
        }
        const downpaymentPct = downpaymentPctRaw / 100;
        const constructionPct = constructionPctRaw / 100;
        const handoverPct = handoverPctRaw / 100;

        const downpaymentVol = netVgvTotal * downpaymentPct;
        const constructionVol = netVgvTotal * constructionPct;
        const handoverVol = netVgvTotal * handoverPct;

        const monthlyDownpayment = salesDur > 0 ? downpaymentVol / salesDur : 0;
        const monthlyConstRev = constDur > 0 ? constructionVol / constDur : 0;
        const handoverMonth = constStart + constDur - 1; // Paid at the end of construction

        const constMonths = Math.max(1, constDur);
        const monthlyConstCost = constCostTotal / constMonths;

        // Fallback to old financingPercent if Sprint 8 fields not used, but prefer debt
        const fundingDebtPct = val(study.funding_debt_percent, D.funding_debt_percent) / 100;
        const actualFinPct = fundingDebtPct > 0 ? fundingDebtPct : financingPercent;

        let accumulatedFlow = 0;
        let maxExposure = 0;
        let debtBalance = 0;
        let debtPayoffAtEnd = 0;

        const finalMonthlyFlows: MonthlyFlow[] = [];
        const finalRawNetFlows: number[] = [];

        for (let m = 1; m <= duration; m++) {
            const inflationMult = Math.pow(1 + inflation, m - 1);

            // J-Curve Revenue Aggregation
            let grossRev = 0;

            // 1. Downpayment (spread over sales period)
            if (m >= salesStart && m < salesStart + salesDur) {
                grossRev += monthlyDownpayment;
            }

            // 2. Construction Payments (spread over construction period)
            if (m >= constStart && m < constStart + constDur) {
                grossRev += monthlyConstRev;
            }

            // 3. Handover / Repasse (bullet payout)
            if (m === handoverMonth) {
                grossRev += handoverVol;
            }

            // Inflate Revenue if needed (optional based on models, we apply it here)
            grossRev = grossRev * inflationMult;

            const taxDeduction = grossRev * taxRate;
            const brokerageDeduction = grossRev * brokerageFee;
            const netRev = grossRev - taxDeduction - brokerageDeduction;

            let totalCost = 0;
            let equityCost = 0;
            let financedCost = 0;

            if (m === 1) {
                totalCost += landCost;
                equityCost += landCost;
            }

            if (m >= constStart && m < constStart + constDur) {
                const currentConstCost = monthlyConstCost * inflationMult;
                totalCost += currentConstCost;
                financedCost = currentConstCost * actualFinPct;
                equityCost += currentConstCost - financedCost;
            }

            debtBalance = debtBalance * (1 + monthlyFinancingRate);
            debtBalance += financedCost;

            let debtPayment = 0;
            let investorRev = 0;

            if (netRev > 0) {
                if (debtBalance > 0) {
                    debtPayment = Math.min(debtBalance, netRev);
                    debtBalance -= debtPayment;
                    investorRev = netRev - debtPayment;
                } else {
                    investorRev = netRev;
                }
            }

            let netFlow = investorRev - equityCost;

            // Último mês: o saldo que as receitas não amortizaram é quitado pelo
            // investidor. O motor antigo terminava o fluxo com a dívida em
            // aberto e a descartava — com 100% de dívida, subir o custo de obra
            // não mudava o VPL.
            if (m === duration && debtBalance > 0.005) {
                debtPayoffAtEnd = debtBalance;
                netFlow -= debtBalance;
                debtBalance = 0;
            }

            accumulatedFlow += netFlow;

            if (accumulatedFlow < maxExposure) {
                maxExposure = accumulatedFlow;
            }

            finalMonthlyFlows.push({
                month: m,
                name: `Mês ${m}`,
                rev: grossRev,
                cost: totalCost,
                net: netFlow,
                acc: accumulatedFlow
            });
            finalRawNetFlows.push(netFlow);
        }

        if (debtPayoffAtEnd > 0) {
            avisos.push({
                codigo: 'divida_quitada_no_fim',
                mensagem: `As receitas não amortizaram todo o financiamento: ${fmtBRL(debtPayoffAtEnd)} de saldo devedor são quitados com capital próprio no mês ${duration}.`,
                aba: 'funding',
            });
        }

        // 3. Calculate Advanced Indicators
        const vpl = calculateNPV(monthlyDiscount, finalRawNetFlows); // Using monthly discount rate

        // IRR is returned as a monthly rate. Convert to annual.
        const monthlyIrr = calculateIRR(finalRawNetFlows);
        let annualIrr = NaN;
        if (!isNaN(monthlyIrr) && isFinite(monthlyIrr)) {
            annualIrr = (Math.pow(1 + monthlyIrr, 12) - 1) * 100;
        }

        return {
            monthlyFlows: finalMonthlyFlows,
            maxExposure,
            vpl,
            annualIrr,
            vgvTotal,
            netVgvTotal,
            constCostTotal,
            duration,
            landCost,
            esgCostTotal,
            esgVgvPremiumValue,
            esgFundingDiscount,
            totalBlockArea,
            debtPayoffAtEnd,
            avisos,
        };
};

export const useImovibMath = (study: ImovibStudy | null | undefined, options?: ImovibMathOptions): ImovibMathResult => {
    return useMemo(() => computeImovibMath(study, options), [study, options?.vgvDelta, options?.costDelta]);
};
