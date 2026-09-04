import { Property, HedonicPricingConfig } from '../types';

export const pricingService = {
  /**
   * Calcula o score de valor relativo de uma unidade baseada em seus atributos.
   *
   * `adjustPct` é o 6º fator opcional: a soma dos percentuais das regras da aba
   * "Inteligência" (rentalPricingRuleService.computeAdjustmentPct) que casaram
   * com esta unidade. Omitido/0 reproduz o cálculo de sempre — é o que preserva
   * a soma exata do VGV-alvo quando não há regra nenhuma.
   */
  calculateUnitScore(property: Property, config: HedonicPricingConfig, adjustPct: number = 0): number {
    // 1. Fator Área
    const areaScore = property.private_area || property.area || 0;

    // 2. Fator Andar (Crescimento percentual progressivo)
    // Ex: Se config.floor_coefficient é 0.01 (1%), o multiplicador será (1 + (andar * 0.01))
    const floor = property.floor || 0;
    const floorFactor = 1 + (floor * config.floor_coefficient);

    // 3. Fator Posição
    const positionFactor = config.position_weights[property.position_type || 'LATERAL'] || 1.0;

    // 4. Fator Vista
    const viewFactor = config.view_weights[property.view_type || 'NONE'] || 1.0;

    // 5. Fator Orientação Solar
    const orientationFactor = config.orientation_weights[property.sun_orientation || 'EAST'] || 1.0;

    // 6. Fator das regras da aba "Inteligência" (soma dos percentuais que casaram)
    const ruleFactor = 1 + (adjustPct || 0) / 100;

    // Score Final = Área * Fatores
    return areaScore * floorFactor * positionFactor * viewFactor * orientationFactor * ruleFactor;
  },

  /**
   * Distribui o VGV alvo entre todas as unidades de forma proporcional aos scores.
   *
   * `adjustPctByPropertyId` é opcional — vem das regras da aba "Inteligência"
   * (rentalPricingRuleService). Sem ele, o resultado é idêntico a antes dessas
   * regras existirem.
   */
  calculatePrices(
    properties: Property[],
    config: HedonicPricingConfig,
    adjustPctByPropertyId?: Record<string, number>,
  ): Property[] {
    // Filtrar apenas unidades que compõem o VGV (eliminando o 'BUILDING' master; unidades permutadas
    // entram ou não conforme o toggle include_exchanged do usuário)
    const units = properties.filter(p => p.type !== 'BUILDING' && (config.include_exchanged || p.status !== 'EXCHANGED'));
    
    // 1. Calcular scores individuais e total
    const unitScores = units.map(u => ({
      id: u.id,
      score: this.calculateUnitScore(u, config, adjustPctByPropertyId?.[u.id])
    }));

    const totalScore = unitScores.reduce((sum, item) => sum + item.score, 0);

    if (totalScore === 0) return properties;

    // 2. Distribuir VGV proporcionalmente
    // Preço_i = (Config_VGV * Score_i) / Score_Total
    return properties.map(p => {
      if (p.type === 'BUILDING') return p;

      const scoreEntry = unitScores.find(s => s.id === p.id);
      if (!scoreEntry) return p; // fora do cálculo (ex.: permutado com include_exchanged=false) — preço mantido

      const finalPrice = Math.round((config.target_vgv * scoreEntry.score) / totalScore);

      return {
        ...p,
        price: finalPrice,
        initial_price: finalPrice,
        table_price: finalPrice
      };
    });
  },

  /**
   * Simula a curva de absorção de vendas (Curva em S) usando modelo logístico.
   */
  simulateAbsorption(totalUnits: number, months: number, velocity: number = 0.5): { month: number, sales: number, total: number }[] {
    const results = [];
    const k = totalUnits; // Capacidade total
    const r = velocity; // Taxa de crescimento
    const midPoint = months / 2;

    for (let t = 1; t <= months; t++) {
      // Função Logística: V(t) = K / (1 + e^(-r * (t - t0)))
      const totalToDate = Math.round(k / (1 + Math.exp(-r * (t - midPoint))));
      const prevTotal: number = t === 1 ? 0 : results[t - 2].total;
      
      results.push({
        month: t,
        sales: totalToDate - prevTotal,
        total: totalToDate
      });
    }

    return results;
  },

  /**
   * Roda simulateAbsorption para várias velocidades e retorna lado a lado, para
   * comparar cenários (ex.: lenta/moderada/agressiva) sobre o mesmo estoque/horizonte.
   */
  compareScenarios(
    totalUnits: number,
    months: number,
    velocities: { label: string; velocity: number }[]
  ): { label: string; velocity: number; curve: { month: number; sales: number; total: number }[]; monthsToSellOut: number }[] {
    return velocities.map(({ label, velocity }) => {
      const curve = this.simulateAbsorption(totalUnits, months, velocity);
      const monthsToSellOut = curve.findIndex(c => c.total >= totalUnits);
      return {
        label,
        velocity,
        curve,
        monthsToSellOut: monthsToSellOut === -1 ? months : monthsToSellOut + 1,
      };
    });
  }
};
