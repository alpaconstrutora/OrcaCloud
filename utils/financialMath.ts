
/**
 * Calculus for Financial Simulator
 */

// Uses parseFloat(toFixed) to avoid IEEE 754 half-rounding errors (e.g. 1.005 → 1.01)
export const round2 = (n: number): number => parseFloat(n.toFixed(2));

export const calculatePMT = (rate: number, nper: number, pv: number): number => {
    // rate: monthly interest rate (annual / 12 / 100)
    // nper: number of months
    // pv: present value (loan amount)
    if (rate === 0) return pv / nper;
    return (pv * rate) / (1 - Math.pow(1 + rate, -nper));
};

export const calculateROI = (totalReturn: number, totalInvestment: number): number => {
    if (totalInvestment === 0) return 0;
    return ((totalReturn - totalInvestment) / totalInvestment) * 100;
};

export const calculateNPV = (rate: number, cashFlows: number[]): number => {
    // rate: discount rate (monthly)
    return cashFlows.reduce((acc, val, t) => acc + val / Math.pow(1 + rate, t), 0);
};

export const calculateIRR = (cashFlows: number[], guess = 0.1): number | null => {
    // Newton-Raphson method to estimate IRR
    const maxIter = 1000;
    const precision = 0.000001;
    let rate = guess;

    for (let i = 0; i < maxIter; i++) {
        let npv = 0;
        let dNpv = 0;

        for (let t = 0; t < cashFlows.length; t++) {
            const num = cashFlows[t];
            const denom = Math.pow(1 + rate, t);
            npv += num / denom;
            dNpv -= (t * num) / (denom * (1 + rate));
        }

        if (Math.abs(npv) < precision) return rate;

        if (dNpv === 0) return null; // Avoid division by zero
        const newRate = rate - npv / dNpv;

        // Prevent divergence or invalid rates
        if (Math.abs(newRate) > 10 || isNaN(newRate)) return null;

        if (Math.abs(newRate - rate) < precision) return newRate;

        rate = newRate;
    }

    return null; // Failed to converge — caller must handle null, not treat as 0% IRR
};

export const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export const formatPercent = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'percent', minimumFractionDigits: 2 });
};
