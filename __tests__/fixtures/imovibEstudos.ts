/**
 * Estudos fixos dos testes do motor do Imovib (computeImovibMath).
 *
 * `baseStudy` saiu de __tests__/imovibMath.test.ts (Fase 0 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md) para ser
 * compartilhado com o teste de regressão. `ESTUDOS_DE_REGRESSAO` são os quatro
 * estudos cujo resultado o teste de regressão fixa.
 */

// Estudo-base: 40 unidades de 70 m² privativos + 20 m² comuns, R$ 10.000/m² de
// venda, R$ 4.500/m² de obra, terreno de R$ 5 mi. Todas as premissas que o
// motor lê vêm preenchidas, para o teste não depender de padrão.
export const baseStudy = (over: Record<string, any> = {}): any => ({
    id: 'estudo-teste',
    name: 'Estudo teste',
    construction_duration_months: 24,
    sales_duration_months: 24,
    construction_start_month: 6,
    sales_start_month: 1,
    inflation_rate: 0,
    discount_rate: 12,
    tax_rate: 4,
    brokerage_fee: 5,
    financing_percent: 0,
    financing_rate_annual: 10,
    revenue_downpayment_percent: 10,
    revenue_construction_percent: 20,
    revenue_handover_percent: 70,
    default_rate_percent: 0,
    cancellation_rate_percent: 0,
    funding_debt_percent: 0,
    swap_financial_percent: 0,
    swap_physical_percent: 0,
    land_cost: 5_000_000,
    blocks: [{
        id: 'b1', name: 'Torre A', sales_price_sqm: 10_000, construction_cost_sqm: 4_500,
        units: [{ id: 'u1', quantity: 40, private_area: 70, common_area: 20 }],
    }],
    ...over,
});

export const withCost = (costSqm: number, over: Record<string, any> = {}) => {
    const s = baseStudy(over);
    s.blocks = [{ ...s.blocks[0], construction_cost_sqm: costSqm }];
    return s;
};

export const rubrica = (category: string, name: string, value_type: 'currency' | 'percent', value: number, base?: string) =>
    ({ id: name, study_id: 'estudo-teste', category, name, value_type, value, base, created_at: '', updated_at: '' });

export const instancia = (id: string, block_id: string, price: number, status = 'DISPONÍVEL', private_area = 70) =>
    ({ id, study_id: 'estudo-teste', block_id, name: id, floor: 1, private_area, position_type: 'LATERAL', sun_orientation: 'NORTE', price, status, created_at: '', updated_at: '' });

/** Os quatro estudos do teste de regressão (item 0.1). */
export const ESTUDOS_DE_REGRESSAO: Record<string, () => any> = {
    base: () => baseStudy(),
    divida60: () => baseStudy({ funding_debt_percent: 60, financing_rate_annual: 14 }),
    completo: () => baseStudy({
        capex_items: [
            rubrica('1. Terreno', 'ITBI', 'percent', 3, 'terreno'),
            rubrica('2. Projetos e Consultorias', 'Projeto', 'currency', 100_000, 'obra'),
            rubrica('9. Contingência', 'Reserva', 'percent', 2, 'obra'),
            rubrica('5. Marketing e Vendas', 'Comissão', 'percent', 5, 'vgv'),
            rubrica('5. Marketing e Vendas', 'Stand', 'currency', 240_000, 'vgv'),
            rubrica('7. Impostos', 'RET', 'percent', 4, 'vgv'),
        ],
    }),
    espelhoInflacao: () => baseStudy({
        inflation_rate: 0.4,
        default_rate_percent: 3,
        cancellation_rate_percent: 5,
        // 40 unidades: 36 com preço próprio, 2 sem preço (área × preço/m²), 2 permutadas.
        unit_instances: Array.from({ length: 40 }, (_, i) =>
            i < 36 ? instancia(`u${i}`, 'b1', 720_000 + i * 2_000, i % 5 === 0 ? 'VENDIDO' : 'DISPONÍVEL')
                : i < 38 ? instancia(`u${i}`, 'b1', 0)
                    : instancia(`u${i}`, 'b1', 760_000, 'PERMUTADO')),
    }),
};
