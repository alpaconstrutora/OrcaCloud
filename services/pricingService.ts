import { Property, HedonicPricingConfig, SalesPricingConfig, PricingSplit } from '../types';

// Motor de precificação de VENDA (Venda de Unidades › "Inteligência de preços").
// Grava price/table_price/initial_price — o eixo de locação (rental_price) fica
// intocado. Distribui um VGV-alvo entre as unidades do edifício por score.
//
// ⚠️ 2026-09-12 — o modelo hedônico embutido saiu daqui (andar, posição, vista,
// orientação solar), a pedido do usuário, como já tinha saído de Locação em
// 11/09: o único ajuste sobre a área são as REGRAS da aba "Inteligência". O
// cálculo antigo sobrevive em `calculateHedonicPrices`, só para a Imovib —
// instância de estudo de viabilidade não tem regras da aba (elas são por
// `building_property_id` do Comercial). Não use o hedônico em Venda.
export const pricingService = {
  /**
   * Score da unidade = **área × ajuste das regras**, e nada mais.
   *
   * `adjustPct` é a soma dos percentuais das regras da aba "Inteligência"
   * (`rentalPricingRuleService.computeAdjustmentBreakdown`) que casaram com
   * esta unidade; entra como fator `1 + pct/100`. Omitido/0 devolve a área
   * limpa — é o que preserva a soma exata do VGV-alvo sem regra nenhuma.
   *
   * Área: `private_area`, caindo para `area` quando a privativa não está
   * preenchida. Unidade sem nenhuma das duas tem score 0 e não recebe preço —
   * era assim antes também, porque a área sempre multiplicou todos os fatores.
   */
  calculateUnitScore(property: Property, adjustPct: number = 0): number {
    const areaScore = property.private_area || property.area || 0;
    const ruleFactor = 1 + (adjustPct || 0) / 100;
    return areaScore * ruleFactor;
  },

  /**
   * Distribui o VGV alvo entre todas as unidades de forma proporcional aos scores.
   *
   * `adjustPctByPropertyId` é opcional — vem das regras da aba "Inteligência"
   * (rentalPricingRuleService). Sem ele, a distribuição é só por área.
   */
  calculatePrices(
    properties: Property[],
    config: SalesPricingConfig,
    adjustPctByPropertyId?: Record<string, number>,
  ): Property[] {
    return this.calculatePricesWithSplit(properties, config, adjustPctByPropertyId).properties;
  },

  /**
   * O mesmo cálculo de `calculatePrices`, devolvendo junto a decomposição EXATA
   * de cada preço: `base` é o que a unidade receberia se nenhuma regra da aba
   * Inteligência existisse (participação pura por área), e `total` é o que as
   * regras somaram.
   *
   * Venda distribui um VGV-alvo, então vale aqui a mesma advertência do
   * `rentalPricingService.calculateRentsWithSplit`: dar +5% a uma unidade tira
   * participação de TODAS as outras, inclusive das que não casaram com regra
   * nenhuma. A base só sai certa refazendo a distribuição inteira com os scores
   * sem regra — dividir o preço por `1 + %` erraria, e daria zero justamente nas
   * unidades que perderam participação sem ter regra própria.
   *
   * `Σ base = Σ price = VGV-alvo`, logo `Σ total = 0`.
   */
  calculatePricesWithSplit(
    properties: Property[],
    config: SalesPricingConfig,
    adjustPctByPropertyId?: Record<string, number>,
  ): { properties: Property[]; splitByPropertyId: Record<string, PricingSplit> } {
    // Filtrar apenas unidades que compõem o VGV (eliminando o 'BUILDING' master; unidades permutadas
    // entram ou não conforme o toggle include_exchanged do usuário)
    const units = properties.filter(p => p.type !== 'BUILDING' && (config.include_exchanged || p.status !== 'EXCHANGED'));

    // 1. Calcular scores individuais e total (com regras e, em paralelo, sem elas)
    const unitScores = units.map(u => ({
      id: u.id,
      score: this.calculateUnitScore(u, adjustPctByPropertyId?.[u.id]),
      baseScore: this.calculateUnitScore(u, 0),
    }));

    const totalScore = unitScores.reduce((sum, item) => sum + item.score, 0);

    if (totalScore === 0) return { properties, splitByPropertyId: {} };

    const totalBaseScore = unitScores.reduce((sum, item) => sum + item.baseScore, 0);
    const splitByPropertyId: Record<string, PricingSplit> = {};

    // 2. Distribuir VGV proporcionalmente
    // Preço_i = (Config_VGV * Score_i) / Score_Total
    const out = properties.map(p => {
      if (p.type === 'BUILDING') return p;

      const scoreEntry = unitScores.find(s => s.id === p.id);
      if (!scoreEntry) return p; // fora do cálculo (ex.: permutado com include_exchanged=false) — preço mantido

      const finalPrice = Math.round((config.target_vgv * scoreEntry.score) / totalScore);
      const base = totalBaseScore > 0
        ? Math.round((config.target_vgv * scoreEntry.baseScore) / totalBaseScore)
        : 0;
      splitByPropertyId[p.id] = {
        price: finalPrice,
        base,
        total: finalPrice - base,
        totalPct: adjustPctByPropertyId?.[p.id] ?? 0,
        mode: 'TARGET_VGV',
      };

      return {
        ...p,
        price: finalPrice,
        initial_price: finalPrice,
        table_price: finalPrice
      };
    });

    return { properties: out, splitByPropertyId };
  },

  /**
   * Modelo hedônico com pesos embutidos — **só Imovib** (`ImovibSalesMapTab`).
   *
   * É o cálculo que Venda de Unidades usava até 2026-09-12, preservado sem
   * mudança de conta: área × andar × posição × vista × orientação solar,
   * distribuindo o VGV-alvo por participação. A Imovib precifica instâncias
   * de um estudo de viabilidade, que não têm regras da aba Inteligência, então
   * o modelo continua sendo o único jeito de diferenciar unidades por lá.
   * Não chame isto de dentro do Comercial.
   */
  calculateHedonicPrices(properties: Property[], config: HedonicPricingConfig): Property[] {
    const hedonicScore = (property: Property): number => {
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

      return areaScore * floorFactor * positionFactor * viewFactor * orientationFactor;
    };

    const units = properties.filter(p => p.type !== 'BUILDING' && (config.include_exchanged || p.status !== 'EXCHANGED'));
    const unitScores = units.map(u => ({ id: u.id, score: hedonicScore(u) }));
    const totalScore = unitScores.reduce((sum, item) => sum + item.score, 0);
    if (totalScore === 0) return properties;

    return properties.map(p => {
      if (p.type === 'BUILDING') return p;
      const scoreEntry = unitScores.find(s => s.id === p.id);
      if (!scoreEntry) return p;
      const finalPrice = Math.round((config.target_vgv * scoreEntry.score) / totalScore);
      return { ...p, price: finalPrice, initial_price: finalPrice, table_price: finalPrice };
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
