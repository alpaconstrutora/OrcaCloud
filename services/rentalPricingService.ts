import { Property, RentalPricingConfig } from '../types';

// Motor de precificação de LOCAÇÃO. Espelha services/pricingService.ts (Venda),
// mas grava SOMENTE rental_price — o eixo de venda (price/table_price/initial_price)
// permanece intocado. Duas estratégias, escolhidas via config.mode.
export const rentalPricingService = {
    /**
     * Score hedônico da unidade — idêntico ao de Venda (área × andar × posição ×
     * vista × orientação solar). Depende só dos atributos, não do valor-alvo.
     */
    calculateUnitScore(property: Property, config: RentalPricingConfig): number {
        const areaScore = property.private_area || property.area || 0;
        const floor = property.floor || 0;
        const floorFactor = 1 + (floor * config.floor_coefficient);
        const positionFactor = config.position_weights[property.position_type || 'LATERAL'] || 1.0;
        const viewFactor = config.view_weights[property.view_type || 'NONE'] || 1.0;
        const orientationFactor = config.orientation_weights[property.sun_orientation || 'EAST'] || 1.0;
        return areaScore * floorFactor * positionFactor * viewFactor * orientationFactor;
    },

    /**
     * Calcula o aluguel (rental_price) de cada unidade do prédio.
     *  - PER_SQM:      rental_price = base_per_sqm × score (score já embute área × fatores).
     *  - TARGET_TOTAL: rental_price = target_total_rent × score / totalScore.
     * Retorna somente as unidades alteradas (para o batch), com apenas rental_price mexido.
     */
    calculateRents(properties: Property[], config: RentalPricingConfig): Property[] {
        // Mesmo recorte de Venda: fora o master BUILDING; permutadas conforme o toggle.
        const units = properties.filter(
            p => p.type !== 'BUILDING' && (config.include_exchanged || p.status !== 'EXCHANGED'),
        );

        const unitScores = units.map(u => ({ id: u.id, score: this.calculateUnitScore(u, config) }));
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
