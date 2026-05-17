
/**
 * Service to handle market data, indices and benchmarks.
 * Simulated for now, but ready to be connected to APIs like Banco Central or IBGE.
 */

export interface MarketIndexSeries {
    date: string;
    selic: number;
    ipca: number;
    igpm: number;
}

export const marketDataService = {
    /**
     * Generates a historical series of indices starting from a specific base value.
     * Used to compare portfolio performance against common benchmarks.
     */
    getBenchmarkSeries: (months: number = 12, startValue: number = 1000000): MarketIndexSeries[] => {
        const series: MarketIndexSeries[] = [];
        const now = new Date();

        // Monthly simulated rates (averages)
        const monthlySelic = 0.009; // ~11% year
        const monthlyIpca = 0.004;  // ~5% year
        const monthlyIgpm = 0.005;  // ~6% year

        for (let i = months; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const factor = months - i;

            series.push({
                date: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
                selic: startValue * Math.pow(1 + monthlySelic, factor),
                ipca: startValue * Math.pow(1 + monthlyIpca, factor),
                igpm: startValue * Math.pow(1 + monthlyIgpm, factor),
            });
        }

        return series;
    },

    /**
     * Returns current CUB values for different states.
     */
    getStateCUBData: () => {
        return [
            { uf: 'SC', value: 2650.45, change: 0.45, trend: 'up' },
            { uf: 'SP', value: 2840.12, change: -0.12, trend: 'down' },
            { uf: 'PR', value: 2590.80, change: 0.30, trend: 'up' },
            { uf: 'RJ', value: 2910.55, change: 0.55, trend: 'up' },
            { uf: 'MG', value: 2480.30, change: 0.15, trend: 'up' },
            { uf: 'RS', value: 2520.10, change: 0.25, trend: 'up' },
        ];
    }
};
