import { Property, RentalPricingConfig, PricingSplit } from '../types';

// Motor de precificação de LOCAÇÃO. Grava SOMENTE rental_price — o eixo de venda
// (price/table_price/initial_price) permanece intocado. Duas estratégias,
// escolhidas via config.mode.
//
// ⚠️ 2026-09-11 — o modelo hedônico embutido saiu daqui (andar, posição, vista,
// orientação solar, e o toggle de permutadas), a pedido do usuário: o único
// ajuste sobre a área são as REGRAS da aba "Inteligência". Venda de Ativos
// (services/pricingService.ts) segue com o modelo completo; não espelhe este
// arquivo lá sem pedido explícito.
export const rentalPricingService = {
    /**
     * Score da unidade = **área × ajuste das regras**, e nada mais.
     *
     * `adjustPct` é a soma dos percentuais das regras da aba "Inteligência"
     * (`rentalPricingRuleService.computeAdjustmentBreakdown`) que casaram com
     * esta unidade; entra como fator `1 + pct/100`. Omitido/0 devolve a área
     * limpa — é o que preserva a soma exata do modo TARGET_TOTAL sem regra
     * nenhuma.
     *
     * Área: `private_area`, caindo para `area` quando a privativa não está
     * preenchida. Unidade sem nenhuma das duas tem score 0 e não recebe aluguel
     * — era assim antes destas mudanças também, porque a área sempre multiplicou
     * todos os fatores.
     *
     * `config` não entra mais no score (só decide o modo, fora daqui). O
     * parâmetro fica na assinatura por compatibilidade com as chamadas existentes
     * e porque o modo pode voltar a pesar aqui.
     */
    calculateUnitScore(property: Property, _config: RentalPricingConfig, adjustPct: number = 0): number {
        const areaScore = property.private_area || property.area || 0;
        const ruleFactor = 1 + (adjustPct || 0) / 100;
        return areaScore * ruleFactor;
    },

    /**
     * Calcula o aluguel (rental_price) de cada unidade do prédio.
     *  - PER_SQM:      rental_price = base_per_sqm × score (score já embute área × fatores).
     *  - TARGET_TOTAL: rental_price = target_total_rent × score / totalScore.
     * Retorna somente as unidades alteradas (para o batch), com apenas rental_price mexido.
     *
     * `adjustPctByPropertyId` é opcional — vem das regras da aba "Inteligência"
     * (rentalPricingRuleService). Sem ele, o resultado é idêntico a antes dessas
     * regras existirem.
     */
    calculateRents(
        properties: Property[],
        config: RentalPricingConfig,
        adjustPctByPropertyId?: Record<string, number>,
    ): Property[] {
        return this.calculateRentsWithSplit(properties, config, adjustPctByPropertyId).units;
    },

    /**
     * O mesmo cálculo de `calculateRents`, devolvendo junto a decomposição EXATA
     * de cada aluguel: quanto a unidade receberia sem NENHUMA regra (`base`) e
     * quanto as regras somaram (`total`).
     *
     * Por que não dá para derivar isso do preço depois, fora daqui:
     *
     *  - No modo **PER_SQM** daria: `aluguel = base_per_sqm × score₀ × (1+%)`, então
     *    dividir por `1+%` devolve a base. É o que a tela fazia quando só tinha o
     *    preço na mão.
     *  - No modo **TARGET_TOTAL** não dá. O alvo é um bolo fixo repartido por
     *    participação: dar +5% a uma unidade **tira** de todas as outras, mesmo
     *    das que não casaram com regra nenhuma. A base verdadeira é a
     *    distribuição inteira refeita sem regras (`score₀` em todo mundo) — o
     *    denominador muda, não só o numerador. Dividir o preço por `1+%` nesse
     *    modo erra nas duas pontas, e erra também nas unidades de `%` zero, onde
     *    a diferença existe e aquela conta dá exatamente zero.
     *
     * Consequência esperada, e correta, no alvo total: `Σ base = Σ price = alvo`,
     * logo `Σ total = 0` — o que uma unidade ganha em participação outra perde.
     */
    calculateRentsWithSplit(
        properties: Property[],
        config: RentalPricingConfig,
        adjustPctByPropertyId?: Record<string, number>,
    ): { units: Property[]; splitByPropertyId: Record<string, PricingSplit> } {
        // Fora o master BUILDING e fora as permutadas. O toggle "incluir unidades
        // permutadas" saiu da tela (2026-09-11); o comportamento fixado é o que o
        // toggle já trazia desligado por padrão — unidade permutada não faz parte
        // do estoque de locação e, no modo de alvo total, entrar na conta tiraria
        // participação das que de fato serão alugadas.
        const units = properties.filter(
            p => p.type !== 'BUILDING' && p.status !== 'EXCHANGED',
        );

        const unitScores = units.map(u => ({
            id: u.id,
            score: this.calculateUnitScore(u, config, adjustPctByPropertyId?.[u.id]),
            // Contrafactual: o mesmo score sem o 6º fator (regras).
            baseScore: this.calculateUnitScore(u, config, 0),
        }));
        const totalScore = unitScores.reduce((sum, item) => sum + item.score, 0);
        if (totalScore === 0) return { units: [], splitByPropertyId: {} };
        const totalBaseScore = unitScores.reduce((sum, item) => sum + item.baseScore, 0);

        const byId = new Map(unitScores.map(s => [s.id, s]));
        const splitByPropertyId: Record<string, PricingSplit> = {};

        const outUnits = units.map(p => {
            const entry = byId.get(p.id);
            const score = entry?.score ?? 0;
            const baseScore = entry?.baseScore ?? 0;
            const rental = config.mode === 'PER_SQM'
                ? Math.round(config.base_per_sqm * score)
                : Math.round((config.target_total_rent * score) / totalScore);
            const base = config.mode === 'PER_SQM'
                ? Math.round(config.base_per_sqm * baseScore)
                : (totalBaseScore > 0
                    ? Math.round((config.target_total_rent * baseScore) / totalBaseScore)
                    : 0);
            splitByPropertyId[p.id] = {
                price: rental,
                base,
                total: rental - base,
                totalPct: adjustPctByPropertyId?.[p.id] ?? 0,
                mode: config.mode,
            };
            return { ...p, rental_price: rental };
        });

        return { units: outUnits, splitByPropertyId };
    },
};
