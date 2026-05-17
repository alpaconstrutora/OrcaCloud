
export interface SupplierAIInsight {
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'opportunity';
    actionable?: {
        label: string;
        target: string;
    };
}

export const supplierAiService = {
    analyzeMarketPrice: async (item: string, price: number, region: string): Promise<SupplierAIInsight> => {
        // Simulated market data benchmark
        await new Promise(resolve => setTimeout(resolve, 800));

        // Mock logic: assuming "region" would influence benchmarks
        const benchmarks: Record<string, number> = {
            'cimento': 30,
            'aço': 1200,
            'bloco': 2.5
        };

        const key = Object.keys(benchmarks).find(k => item.toLowerCase().includes(k));
        const benchmark = key ? benchmarks[key] : null;

        if (!benchmark) {
            return {
                title: "Item em Alta Demanda",
                message: `O item "${item}" está com alta procura nesta região. Considere reforçar seu estoque.`,
                type: 'info'
            };
        }

        const diff = ((price - benchmark) / benchmark) * 100;

        if (diff > 10) {
            return {
                title: "Preço acima da média regional",
                message: `Seu preço está cerca de ${diff.toFixed(1)}% acima da média da região. Considere revisar para aumentar suas chances de fechamento.`,
                type: 'warning',
                actionable: { label: "Ajustar Lance", target: "negotiations" }
            };
        }

        if (diff < -5) {
            return {
                title: "Oferta Altamente Competitiva",
                message: "Seu lance está entre as melhores ofertas da região. Você tem grandes chances de ser o fornecedor preferencial!",
                type: 'success'
            };
        }

        return {
            title: "Preço de Mercado",
            message: "Seu preço está alinhado com a média regional. Destaque-se pelos seus prazos de entrega ou qualidade.",
            type: 'info'
        };
    },

    getSupplyForecast: async (supplierId: string): Promise<SupplierAIInsight[]> => {
        // Mocking forecasted needs based on linked projects
        return [
            {
                title: "Oportunidade: Demanda Futura",
                message: "O Edifício Horizon entrará na fase de alvenaria em 15 dias. Prepare uma proposta para Blocos de Concreto.",
                type: 'opportunity',
                actionable: { label: "Antecipar Lance", target: "negotiations" }
            }
        ];
    }
};
