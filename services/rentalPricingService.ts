import { Property, RentalPricingConfig } from '../types';

// Motor de precificação de LOCAÇÃO. Espelha services/pricingService.ts (Venda),
// mas grava SOMENTE rental_price — o eixo de venda (price/table_price/initial_price)
// permanece intocado. Duas estratégias, escolhidas via config.mode.
export const rentalPricingService = {
    /**
     * Score hedônico da unidade — área × andar × posição × vista × orientação
     * solar, igual ao de Venda, mais um 6º fator opcional: `adjustPct`, a soma
     * dos percentuais das regras da aba "Inteligência"
     * (rentalPricingRuleService.computeAdjustmentPct) que casaram com esta
     * unidade. `adjustPct` omitido/0 reproduz o cálculo de sempre — é o que
     * preserva a soma exata do modo TARGET_TOTAL quando não há regra nenhuma.
     */
    calculateUnitScore(property: Property, config: RentalPricingConfig, adjustPct: number = 0): number {
        const areaScore = property.private_area || property.area || 0;
        const floor = property.floor || 0;
        const floorFactor = 1 + (floor * config.floor_coefficient);
        const positionFactor = config.position_weights[property.position_type || 'LATERAL'] || 1.0;
        const viewFactor = config.view_weights[property.view_type || 'NONE'] || 1.0;
        const orientationFactor = config.orientation_weights[property.sun_orientation || 'EAST'] || 1.0;
        const ruleFactor = 1 + (adjustPct || 0) / 100;
        return areaScore * floorFactor * positionFactor * viewFactor * orientationFactor * ruleFactor;
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
        // Mesmo recorte de Venda: fora o master BUILDING; permutadas conforme o toggle.
        const units = properties.filter(
            p => p.type !== 'BUILDING' && (config.include_exchanged || p.status !== 'EXCHANGED'),
        );

        const unitScores = units.map(u => ({
            id: u.id,
            score: this.calculateUnitScore(u, config, adjustPctByPropertyId?.[u.id]),
        }));
        const totalScore = unitScores.reduce((sum, item) => sum + item.score, 0);
        if (totalScore === 0) return [];

        const scoreById = new Map(unitScores.map(s => [s.id, s.score]));

        return units.map(p => {
            const score = scoreById.get(p.id) ?? 0;
            const rental = config.mode === 'PER_SQM'
                ? Math.round(config.base_per_sqm * score)
                : Math.round((config.target_total_rent * score) / totalScore);
            return { ...p, rental_price: rental };
        });
    },
};
