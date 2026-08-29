
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

/**
 * TIR de fluxo com datas IRREGULARES (XIRR), em taxa ANUAL efetiva.
 *
 * Mora aqui, e não num módulo de dívida, de propósito: o repositório já tem
 * DUAS implementações de IRR — a de cima (Newton-Raphson) e a de
 * `hooks/useImovibMath.ts` (bissecção). Uma terceira cópia seria a que ninguém
 * lembraria de corrigir.
 *
 * `calculateIRR` acima só serve a fluxo de período uniforme. Parcela de
 * financiamento não é uniforme: carência, parcela semestral e amortização
 * extraordinária deslocam as datas, e é exatamente sobre esse fluxo que o CET
 * tem de ser medido.
 *
 * Convenção do fluxo: valor POSITIVO é entrada de caixa (o dinheiro liberado
 * pelo banco), NEGATIVO é saída (as parcelas pagas). Datas em 'YYYY-MM-DD'.
 * Retorna `null` quando não converge — o chamador tem de tratar, nunca ler
 * como 0%.
 */
export const calculateXIRR = (
    flows: Array<{ date: string; amount: number }>,
    guess = 0.1,
): number | null => {
    if (flows.length < 2) return null;

    // Sem sinais opostos não existe raiz — devolver um número aqui seria pior
    // do que devolver null, porque pareceria uma taxa.
    const temPositivo = flows.some((f) => f.amount > 0);
    const temNegativo = flows.some((f) => f.amount < 0);
    if (!temPositivo || !temNegativo) return null;

    // Dias corridos desde o primeiro evento, base 365 (convenção de mercado
    // para CET). Datas em UTC para não deslocar por fuso — o mesmo cuidado do
    // resto do sistema com data pura.
    const asUTC = (iso: string): number => {
        const [y, m, d] = iso.split('-').map(Number);
        return Date.UTC(y, m - 1, d);
    };
    const t0 = asUTC(flows[0].date);
    const dias = flows.map((f) => (asUTC(f.date) - t0) / 86_400_000);

    const maxIter = 200;
    const precision = 1e-7;
    let rate = guess;

    for (let i = 0; i < maxIter; i++) {
        let npv = 0;
        let dNpv = 0;

        for (let k = 0; k < flows.length; k++) {
            const exp = dias[k] / 365;
            const base = 1 + rate;
            if (base <= 0) return null;
            const denom = Math.pow(base, exp);
            npv += flows[k].amount / denom;
            dNpv -= (exp * flows[k].amount) / (denom * base);
        }

        if (Math.abs(npv) < precision) return rate;
        if (dNpv === 0) return null;

        const newRate = rate - npv / dNpv;
        if (!isFinite(newRate) || newRate <= -1 || Math.abs(newRate) > 100) return null;
        if (Math.abs(newRate - rate) < precision) return newRate;

        rate = newRate;
    }

    return null; // não convergiu — o chamador trata, não é 0%
};

export const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export const formatPercent = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'percent', minimumFractionDigits: 2 });
};
