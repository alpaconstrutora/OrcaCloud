import { useMemo } from 'react';
import { ImovibStudy } from '../types';

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

export interface ImovibMathResult {
    monthlyFlows: MonthlyFlow[];
    maxExposure: number;
    vpl: number;
    annualIrr: number;
    vgvTotal: number;
    netVgvTotal: number; // Added
    constCostTotal: number;
    duration: number;
    landCost: number;
    esgCostTotal: number;
    esgVgvPremiumValue: number;
    esgFundingDiscount: number;
}

// Bisection method for IRR (more stable than Newton-Raphson)
const calculateNPV = (rate: number, cashFlows: number[]): number => {
    return cashFlows.reduce((acc, val, i) => acc + val / Math.pow(1 + rate, i), 0);
};

const calculateIRR = (cashFlows: number[]): number => {
    // Check if there are both positive and negative cash flows
    let hasPositive = false;
    let hasNegative = false;

    // First, verify we have any valid flows to avoid empty array issues
    if (!cashFlows || cashFlows.length === 0) return NaN;

    for (let flow of cashFlows) {
        if (flow > 0) hasPositive = true;
        if (flow < 0) hasNegative = true;
        if (hasPositive && hasNegative) break;
    }

    if (!hasPositive || !hasNegative) return NaN;

    let low = -0.99; // Can't go below -100%
    let high = 10.0; // Assume max 1000% monthly to avoid infinite loops
    const tolerance = 1e-4; // 0.01%
    const maxIterations = 1000;

    let mid = 0;

    // Simple Bisection
    for (let i = 0; i < maxIterations; i++) {
        mid = (low + high) / 2;
        const npvMid = calculateNPV(mid, cashFlows);

        if (Math.abs(npvMid) < tolerance) return mid;

        // Normal projects: NPV decreases as rate increases
        if (npvMid > 0) {
            low = mid;
        } else {
            high = mid;
        }
    }

    return (low + high) / 2;
};

export const useImovibMath = (study: ImovibStudy | null | undefined, options?: ImovibMathOptions): ImovibMathResult => {
    return useMemo(() => {
        if (!study) {
            return {
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
                esgFundingDiscount: 0
            };
        }

        const constDur = study.construction_duration_months || 24;
        const salesDur = study.sales_duration_months || 36;
        const constStart = study.construction_start_month || 6;
        const salesStart = study.sales_start_month || 1;

        // Total duration is dictated by whichever finishes last
        const duration = Math.max(constStart + constDur - 1, salesStart + salesDur - 1, 1);

        const inflation = (study.inflation_rate || 0) / 100; // Monthly
        const discount = (study.discount_rate || 0) / 100; // Expected Annual
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
        const taxRate = (study.tax_rate || 4.0) / 100;
        const brokerageFee = (study.brokerage_fee || 6.0) / 100;
        const financingPercent = (study.financing_percent || 0.0) / 100;
        let financingRateAnnual = (study.financing_rate_annual || 10.0) / 100;

        // Apply ESG Funding Discount
        financingRateAnnual = Math.max(0, financingRateAnnual - esgFundingDiscount);

        const monthlyFinancingRate = Math.pow(1 + financingRateAnnual, 1 / 12) - 1;

        const landCost = study.land_cost || 0;

        // 1. Calculate base totals from blocks
        let baseVgvTotal = 0;
        let baseConstCostTotal = 0;

        study.blocks?.forEach(block => {
            let blockPrivateArea = 0;
            let blockCommonArea = 0;
            block.units?.forEach(u => {
                blockPrivateArea += (u.quantity || 0) * (u.private_area || 0);
                blockCommonArea += (u.quantity || 0) * (u.common_area || 0);
            });
            baseVgvTotal += blockPrivateArea * (block.sales_price_sqm || 0);
            baseConstCostTotal += (blockPrivateArea + blockCommonArea) * (block.construction_cost_sqm || 0);
        });

        // Apply Sensitivity Deltas & ESG Premiums
        const vgvDeltaMultiplier = 1 + (options?.vgvDelta || 0) / 100;
        const costDeltaMultiplier = 1 + (options?.costDelta || 0) / 100;

        const vgvTotal = baseVgvTotal * (vgvDeltaMultiplier + esgVgvPremium);
        const esgVgvPremiumValue = baseVgvTotal * esgVgvPremium; // Calculado explicitamente para a UI
        const constCostTotal = (baseConstCostTotal + esgCostTotal) * costDeltaMultiplier;

        // Apply Swap Physical (reduces marketed VGV)
        const swapPhysical = (study.swap_physical_percent || 0) / 100;
        const marketedVgv = vgvTotal * (1 - swapPhysical);

        // Apply Contingencies (Default, Cancellation, Swap Financial)
        const swapFinancial = (study.swap_financial_percent || 0) / 100;
        const defaultRate = (study.default_rate_percent || 0) / 100;
        const cancellationRate = (study.cancellation_rate_percent || 0) / 100;

        const netVgvTotal = marketedVgv * (1 - (swapFinancial + defaultRate + cancellationRate));

        // Revenue Curve Distribution (J-Curve Profile)
        const downpaymentPct = (study.revenue_downpayment_percent ?? 10) / 100;
        const constructionPct = (study.revenue_construction_percent ?? 20) / 100;
        const handoverPct = (study.revenue_handover_percent ?? 70) / 100;

        const downpaymentVol = netVgvTotal * downpaymentPct;
        const constructionVol = netVgvTotal * constructionPct;
        const handoverVol = netVgvTotal * handoverPct;

        const monthlyDownpayment = salesDur > 0 ? downpaymentVol / salesDur : 0;
        const monthlyConstRev = constDur > 0 ? constructionVol / constDur : 0;
        const handoverMonth = constStart + constDur - 1; // Paid at the end of construction

        const constMonths = Math.max(1, constDur);
        const monthlyConstCost = constCostTotal / constMonths;

        let accumulatedFlow = 0;
        let maxExposure = 0;
        let debtBalance = 0;

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

                // Incorporate Debt Funding %
                const fundingDebtPct = (study.funding_debt_percent ?? 0) / 100;

                // Fallback to old financingPercent if Sprint 8 fields not used, but prefer debt
                const actualFinPct = fundingDebtPct > 0 ? fundingDebtPct : financingPercent;

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
            } else {
                investorRev = 0;
            }

            const netFlow = investorRev - equityCost;
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
            esgFundingDiscount
        };
    }, [study, options?.vgvDelta, options?.costDelta]);
};
