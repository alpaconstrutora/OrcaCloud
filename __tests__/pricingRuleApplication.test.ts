import { describe, it, expect } from 'vitest';
import { rentalPricingService } from '../services/rentalPricingService';
import { pricingService } from '../services/pricingService';
import { allocateAmountByRules, type AdjustmentBreakdown } from '../services/rentalPricingRuleService';
import { buildApplicationRows } from '../services/pricingRuleApplicationService';
import { describeRuleCell } from '../utils/pricingRuleCell';
import type {
    HedonicPricingConfig, PricingRuleApplication, Property, RentalPricingConfig, RentalPricingRule,
} from '../types';

/**
 * O que está sob teste aqui é a resposta para "de onde veio este preço".
 *
 * Duas coisas podiam mentir sem quebrar nada visível:
 *  1. a decomposição em R$ nos modos de ALVO TOTAL — onde dar +5% a uma unidade
 *     tira participação de todas as outras, e a conta "preço ÷ (1+%)" erra;
 *  2. a célula da coluna preferir a avaliação de HOJE ao registro do dia do
 *     Aplicar, explicando o preço por uma regra que nunca o gerou.
 */

const unidade = (over: Partial<Property>): Property => ({
    id: 'u',
    name: 'U',
    type: 'APARTMENT',
    status: 'AVAILABLE',
    private_area: 50,
    floor: 1,
    position_type: 'LATERAL',
    view_type: 'NONE',
    sun_orientation: 'EAST',
    ...over,
} as Property);

const PESOS = {
    floor_coefficient: 0,
    position_weights: { FRONT: 1, LATERAL: 1, BACK: 1 },
    view_weights: { NONE: 1, PARTIAL: 1, FULL: 1 },
    orientation_weights: { NORTH: 1, SOUTH: 1, EAST: 1, WEST: 1 },
    include_exchanged: true,
};

const configAluguel = (over: Partial<RentalPricingConfig>): RentalPricingConfig => ({
    mode: 'PER_SQM',
    base_per_sqm: 100,
    target_total_rent: 0,
    ...PESOS,
    ...over,
} as RentalPricingConfig);

const rule = (id: string, pct: number, name = id): RentalPricingRule => ({
    id, organization_id: 'org', building_property_id: 'b', name,
    attribute_key: 'private_area', attribute_label: 'Área privativa',
    operator: 'gt', value_num: 0, value_num2: null, value_text: null,
    adjust_pct: pct, active: true, sort_order: 0,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
});

describe('calculateRentsWithSplit — contrafactual exato', () => {
    const unidades = [unidade({ id: 'a' }), unidade({ id: 'b' })];

    it('PER_SQM: base é o aluguel sem regra e total é o que a regra somou', () => {
        const { units, splitByPropertyId } = rentalPricingService.calculateRentsWithSplit(
            unidades, configAluguel({ mode: 'PER_SQM' }), { a: 10 },
        );
        // a: 50 m² × 100 × 1,10 = 5500 ; b: 5000 (sem regra)
        expect(units.find(u => u.id === 'a')!.rental_price).toBe(5500);
        expect(splitByPropertyId.a).toMatchObject({ price: 5500, base: 5000, total: 500, totalPct: 10, mode: 'PER_SQM' });
        // Unidade sem regra não muda de preço neste modo: não há bolo a repartir.
        expect(splitByPropertyId.b).toMatchObject({ price: 5000, base: 5000, total: 0, totalPct: 0 });
    });

    it('TARGET_TOTAL: a base refaz a distribuição inteira sem regras — e a soma fecha no alvo', () => {
        const cfg = configAluguel({ mode: 'TARGET_TOTAL', target_total_rent: 10000 });
        const { splitByPropertyId } = rentalPricingService.calculateRentsWithSplit(unidades, cfg, { a: 10 });
        // scores: a=55, b=50 → a = 10000×55/105 = 5238 ; b = 4762
        expect(splitByPropertyId.a.price).toBe(5238);
        expect(splitByPropertyId.b.price).toBe(4762);
        // sem regras os dois seriam 5000 — é ESTA a base, não preço÷1,10 (=4762).
        expect(splitByPropertyId.a.base).toBe(5000);
        expect(splitByPropertyId.b.base).toBe(5000);
        expect(splitByPropertyId.a.total).toBe(238);
        // A unidade SEM regra perde participação: total negativo, que a conta
        // "preço ÷ (1 + 0%)" daria como zero.
        expect(splitByPropertyId.b.total).toBe(-238);
        expect(splitByPropertyId.a.price + splitByPropertyId.b.price).toBe(10000);
    });

    it('sem regra nenhuma, base = preço e o resultado é idêntico ao de antes das regras', () => {
        const cfg = configAluguel({ mode: 'TARGET_TOTAL', target_total_rent: 10000 });
        const { units, splitByPropertyId } = rentalPricingService.calculateRentsWithSplit(unidades, cfg);
        expect(units.map(u => u.rental_price)).toEqual([5000, 5000]);
        expect(Object.values(splitByPropertyId).every(s => s.total === 0)).toBe(true);
        // E `calculateRents` (assinatura antiga) segue devolvendo só as unidades.
        expect(rentalPricingService.calculateRents(unidades, cfg).map(u => u.rental_price)).toEqual([5000, 5000]);
    });
});

describe('calculatePricesWithSplit (Venda/VGV) — mesma conta do lado de venda', () => {
    it('distribui o VGV e a base refaz a distribuição sem regras', () => {
        const cfg = { target_vgv: 10000, ...PESOS } as HedonicPricingConfig;
        const { properties, splitByPropertyId } = pricingService.calculatePricesWithSplit(
            [unidade({ id: 'a' }), unidade({ id: 'b' })], cfg, { a: 10 },
        );
        expect(properties.find(p => p.id === 'a')!.price).toBe(5238);
        expect(splitByPropertyId.a).toMatchObject({ base: 5000, total: 238, mode: 'TARGET_VGV' });
        expect(splitByPropertyId.b).toMatchObject({ base: 5000, total: -238 });
    });
});

describe('allocateAmountByRules — reparte o total exato entre as regras', () => {
    const applied = [{ rule: rule('r1', 5), pct: 5 }, { rule: rule('r2', 15), pct: 15 }];

    it('proporcional ao percentual, somando exatamente o total', () => {
        const out = allocateAmountByRules(400, applied);
        expect(out).toEqual([100, 300]);
        expect(out.reduce((s, v) => s + v, 0)).toBe(400);
    });

    it('regras que se anulam (total 0%) não recebem parcela — o resto é redistribuição', () => {
        const anuladas = [{ rule: rule('r1', 5), pct: 5 }, { rule: rule('r2', -5), pct: -5 }];
        expect(allocateAmountByRules(-238, anuladas)).toEqual([0, 0]);
    });

    it('sem regra, sem parcela', () => {
        expect(allocateAmountByRules(-238, [])).toEqual([]);
    });
});

describe('buildApplicationRows — o que vai para o banco', () => {
    const breakdown: Record<string, AdjustmentBreakdown> = {
        a: { applied: [{ rule: rule('r1', 10, 'Área grande') }].map(x => ({ ...x, pct: 10 })), totalPct: 10 },
        b: { applied: [], totalPct: 0 },
    };
    const split = {
        a: { price: 5238, base: 5000, total: 238, totalPct: 10, mode: 'TARGET_TOTAL' as const },
        b: { price: 4762, base: 5000, total: -238, totalPct: 0, mode: 'TARGET_TOTAL' as const },
    };

    it('congela nome/percentual/R$ de cada regra e o contrafactual', () => {
        const rows = buildApplicationRows({
            organizationId: 'org', buildingPropertyId: 'b1', purpose: 'RENTAL',
            breakdownByProperty: breakdown, splitByPropertyId: split,
        });
        const a = rows.find(r => r.property_id === 'a')!;
        expect(a).toMatchObject({ purpose: 'RENTAL', mode: 'TARGET_TOTAL', price: 5238, base_price: 5000, total_amount: 238, total_pct: 10 });
        expect(a.rules).toEqual([{ rule_id: 'r1', name: 'Área grande', attribute_label: 'Área privativa', pct: 10, amount: 238 }]);
    });

    it('unidade SEM regra também vira linha — no alvo total ela mudou de preço por causa das outras', () => {
        const rows = buildApplicationRows({
            organizationId: 'org', buildingPropertyId: 'b1', purpose: 'RENTAL',
            breakdownByProperty: breakdown, splitByPropertyId: split,
        });
        const b = rows.find(r => r.property_id === 'b')!;
        expect(b.rules).toEqual([]);
        expect(b.total_amount).toBe(-238);
    });
});

const aplicacao = (over: Partial<PricingRuleApplication>): PricingRuleApplication => ({
    id: 'app-1', organization_id: 'org', building_property_id: 'b1', property_id: 'a',
    purpose: 'RENTAL', mode: 'TARGET_TOTAL', price: 5238, base_price: 5000,
    total_amount: 238, total_pct: 10,
    rules: [{ rule_id: 'r1', name: 'Área grande', attribute_label: 'Área privativa', pct: 10, amount: 238 }],
    applied_at: '2026-09-10T12:00:00Z',
    ...over,
});

describe('describeRuleCell — qual fonte a célula usa, e quando ela avisa', () => {
    const vivoIgual: Record<string, AdjustmentBreakdown> = {
        a: { applied: [{ rule: rule('r1', 10, 'Área grande'), pct: 10 }], totalPct: 10 },
    };

    it('com registro, mostra o que foi aplicado — não a avaliação de hoje', () => {
        const vivoDiferente: Record<string, AdjustmentBreakdown> = {
            a: { applied: [{ rule: rule('r1', 30, 'Área grande'), pct: 30 }], totalPct: 30 },
        };
        const c = describeRuleCell({ propertyId: 'a', price: 5238 }, { a: aplicacao({}) }, vivoDiferente)!;
        expect(c.fonte).toBe('registro');
        expect(c.entradas).toEqual([{ id: 'r1', nome: 'Área grande', pct: 10, valor: 238 }]);
        expect(c.totalPct).toBe(10);
    });

    it('avisa quando a regra mudou depois da aplicação', () => {
        const vivoDiferente: Record<string, AdjustmentBreakdown> = {
            a: { applied: [{ rule: rule('r1', 30, 'Área grande'), pct: 30 }], totalPct: 30 },
        };
        const c = describeRuleCell({ propertyId: 'a', price: 5238 }, { a: aplicacao({}) }, vivoDiferente)!;
        expect(c.aviso?.tom).toBe('alerta');
        expect(c.aviso?.texto).toContain('regras mudaram');
    });

    it('avisa quando TODAS as regras foram apagadas/desativadas desde a aplicação', () => {
        const c = describeRuleCell({ propertyId: 'a', price: 5238 }, { a: aplicacao({}) }, null)!;
        expect(c.aviso?.texto).toContain('regras mudaram');
    });

    it('avisa quando o preço desta versão não é mais o preço aplicado', () => {
        const c = describeRuleCell({ propertyId: 'a', price: 6000 }, { a: aplicacao({}) }, vivoIgual)!;
        expect(c.aviso?.texto).toContain('preço alterado');
    });

    it('sem divergência, não avisa nada', () => {
        const c = describeRuleCell({ propertyId: 'a', price: 5238 }, { a: aplicacao({}) }, vivoIgual)!;
        expect(c.aviso).toBeUndefined();
        expect(c.titulo).toContain('Aplicado em');
    });

    it('unidade sem regra própria mas com registro: entradas vazias e total da redistribuição', () => {
        const semRegra = aplicacao({ property_id: 'b', price: 4762, rules: [], total_amount: -238, total_pct: 0 });
        const c = describeRuleCell({ propertyId: 'b', price: 4762 }, { b: semRegra }, null)!;
        expect(c.entradas).toEqual([]);
        expect(c.totalAmount).toBe(-238);
        expect(c.titulo).toContain('redistribuição');
    });

    it('sem registro, cai na estimativa ao vivo e diz que é estimativa', () => {
        const c = describeRuleCell({ propertyId: 'a', price: 5500 }, null, vivoIgual)!;
        expect(c.fonte).toBe('estimativa');
        expect(c.aviso?.tom).toBe('neutro');
        expect(c.entradas[0].valor).toBeCloseTo(500, 6);   // 5500 ÷ 1,10 = 5000 de base
        expect(c.titulo).toContain('aproximada');
    });

    it('sem registro e sem regra ativa, a célula não tem o que dizer', () => {
        expect(describeRuleCell({ propertyId: 'a', price: 5500 }, null, null)).toBeNull();
    });
});
