import { describe, it, expect } from 'vitest';
import { ruleMatches, computeAdjustmentPct, countMatchesByRule, type UnitAttributes } from '../services/rentalPricingRuleService';
import { rentalPricingService } from '../services/rentalPricingService';
import type { RentalPricingRule, RentalPricingConfig, Property } from '../types';

/**
 * `computeAdjustmentPct`/`ruleMatches` são o ponto de risco real: uma regra que
 * casa quando não devia — ou deixa de casar quando devia — vira aluguel errado
 * em produção, silenciosamente (o motor não avisa "regra X não aplicou").
 */

const baseRule = (over: Partial<RentalPricingRule>): RentalPricingRule => ({
    id: 'r1',
    organization_id: 'org-1',
    building_property_id: 'b-1',
    attribute_key: 'private_area',
    attribute_label: 'Área privativa',
    operator: 'gt',
    value_num: null,
    value_num2: null,
    value_text: null,
    adjust_pct: 0,
    active: true,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
});

describe('ruleMatches — cada operador', () => {
    it('gt / gte / lt / lte comparam numericamente', () => {
        const attrs: UnitAttributes = { private_area: 20 };
        expect(ruleMatches(attrs, baseRule({ operator: 'gt', value_num: 15 }))).toBe(true);
        expect(ruleMatches(attrs, baseRule({ operator: 'gt', value_num: 20 }))).toBe(false);
        expect(ruleMatches(attrs, baseRule({ operator: 'gte', value_num: 20 }))).toBe(true);
        expect(ruleMatches(attrs, baseRule({ operator: 'lt', value_num: 25 }))).toBe(true);
        expect(ruleMatches(attrs, baseRule({ operator: 'lte', value_num: 20 }))).toBe(true);
        expect(ruleMatches(attrs, baseRule({ operator: 'lte', value_num: 19 }))).toBe(false);
    });

    it('between inclui os limites e tolera limites invertidos', () => {
        const attrs: UnitAttributes = { private_area: 15 };
        expect(ruleMatches(attrs, baseRule({ operator: 'between', value_num: 10, value_num2: 20 }))).toBe(true);
        expect(ruleMatches(attrs, baseRule({ operator: 'between', value_num: 15, value_num2: 20 }))).toBe(true); // limite
        expect(ruleMatches(attrs, baseRule({ operator: 'between', value_num: 20, value_num2: 10 }))).toBe(true); // invertido
        expect(ruleMatches(attrs, baseRule({ operator: 'between', value_num: 16, value_num2: 20 }))).toBe(false);
    });

    it('eq / neq comparam número quando possível, senão texto', () => {
        expect(ruleMatches({ floor: 10 }, baseRule({ attribute_key: 'floor', operator: 'eq', value_num: 10 }))).toBe(true);
        expect(ruleMatches({ floor: 10 }, baseRule({ attribute_key: 'floor', operator: 'neq', value_num: 10 }))).toBe(false);
        expect(ruleMatches(
            { position_type: 'FRONT' },
            baseRule({ attribute_key: 'position_type', operator: 'eq', value_text: 'FRONT' }),
        )).toBe(true);
    });

    it('contains / not_contains em multi-select é pertinência exata ao conjunto', () => {
        const attrs: UnitAttributes = { 'carac:acessibilidade': ['elevador', 'rampas'] };
        const rule = (op: 'contains' | 'not_contains', value: string) =>
            baseRule({ attribute_key: 'carac:acessibilidade', operator: op, value_text: value });
        expect(ruleMatches(attrs, rule('contains', 'elevador'))).toBe(true);
        expect(ruleMatches(attrs, rule('contains', 'escada'))).toBe(false);
        expect(ruleMatches(attrs, rule('not_contains', 'escada'))).toBe(true);
    });

    it('contains em texto livre é substring, case-insensitive', () => {
        const attrs: UnitAttributes = { typology: '2 Quartos Suíte' };
        expect(ruleMatches(attrs, baseRule({ attribute_key: 'typology', operator: 'contains', value_text: 'suíte' }))).toBe(true);
    });

    it('is_set / is_not_set não precisam de valor', () => {
        expect(ruleMatches({ suites: 1 }, baseRule({ attribute_key: 'suites', operator: 'is_set' }))).toBe(true);
        expect(ruleMatches({ suites: null }, baseRule({ attribute_key: 'suites', operator: 'is_set' }))).toBe(false);
        expect(ruleMatches({ suites: null }, baseRule({ attribute_key: 'suites', operator: 'is_not_set' }))).toBe(true);
        expect(ruleMatches({}, baseRule({ attribute_key: 'carac:x', operator: 'is_set' }))).toBe(false); // chave nem existe
    });

    it('atributo ausente nunca casa (exceto is_not_set)', () => {
        const rule = baseRule({ attribute_key: 'private_area', operator: 'gt', value_num: 10 });
        expect(ruleMatches({}, rule)).toBe(false);
        expect(ruleMatches({ private_area: null }, rule)).toBe(false);
        expect(ruleMatches({ private_area: undefined }, rule)).toBe(false);
    });
});

describe('computeAdjustmentPct', () => {
    it('soma (não compõe) os percentuais de regras que casam na mesma unidade', () => {
        const attrsByProperty = { u1: { private_area: 40 } };
        const rules: RentalPricingRule[] = [
            baseRule({ id: 'r1', operator: 'gt', value_num: 15, adjust_pct: 5 }),
            baseRule({ id: 'r2', operator: 'gt', value_num: 30, adjust_pct: 3 }),
        ];
        expect(computeAdjustmentPct(attrsByProperty, rules)).toEqual({ u1: 8 });
    });

    it('regra inativa é ignorada', () => {
        const attrsByProperty = { u1: { private_area: 40 } };
        const rules: RentalPricingRule[] = [
            baseRule({ id: 'r1', operator: 'gt', value_num: 15, adjust_pct: 5, active: false }),
        ];
        expect(computeAdjustmentPct(attrsByProperty, rules)).toEqual({});
    });

    it('unidade sem regra que case não entra no resultado', () => {
        const attrsByProperty = { u1: { private_area: 10 } };
        const rules: RentalPricingRule[] = [baseRule({ operator: 'gt', value_num: 15, adjust_pct: 5 })];
        expect(computeAdjustmentPct(attrsByProperty, rules)).toEqual({});
    });

    it('percentual negativo (desconto) é somado normalmente', () => {
        const attrsByProperty = { u1: { floor: 0 } };
        const rules: RentalPricingRule[] = [
            baseRule({ id: 'r1', attribute_key: 'floor', operator: 'eq', value_num: 0, adjust_pct: -10 }),
        ];
        expect(computeAdjustmentPct(attrsByProperty, rules)).toEqual({ u1: -10 });
    });

    it('características multi-select participam via contains', () => {
        const attrsByProperty = { u1: { 'carac:acessibilidade': ['elevador'] } };
        const rules: RentalPricingRule[] = [
            baseRule({ id: 'r1', attribute_key: 'carac:acessibilidade', operator: 'contains', value_text: 'elevador', adjust_pct: 3 }),
        ];
        expect(computeAdjustmentPct(attrsByProperty, rules)).toEqual({ u1: 3 });
    });
});

describe('countMatchesByRule', () => {
    it('conta quantas unidades cada regra pega', () => {
        const attrsByProperty = { u1: { private_area: 40 }, u2: { private_area: 10 }, u3: { private_area: 20 } };
        const rule = baseRule({ id: 'r1', operator: 'gt', value_num: 15 });
        expect(countMatchesByRule(attrsByProperty, [rule])).toEqual({ r1: 2 });
    });
});

describe('rentalPricingService.calculateRents — retrocompatibilidade', () => {
    const config: RentalPricingConfig = {
        mode: 'TARGET_TOTAL',
        base_per_sqm: 0,
        target_total_rent: 10000,
        floor_coefficient: 0,
        position_weights: { FRONT: 1, LATERAL: 1, BACK: 1 },
        view_weights: { NONE: 1, PARTIAL: 1, FULL: 1 },
        orientation_weights: { NORTH: 1, SOUTH: 1, EAST: 1, WEST: 1 },
    };
    const units: Property[] = [
        { id: 'u1', name: 'U1', type: 'APARTMENT', address: '', area: 50, private_area: 50, price: 0, status: 'AVAILABLE', specs: {} } as Property,
        { id: 'u2', name: 'U2', type: 'APARTMENT', address: '', area: 50, private_area: 50, price: 0, status: 'AVAILABLE', specs: {} } as Property,
    ];

    it('sem o 3º argumento, o resultado é idêntico a antes das regras existirem', () => {
        const withoutArg = rentalPricingService.calculateRents(units, config);
        const withEmptyArg = rentalPricingService.calculateRents(units, config, {});
        expect(withoutArg).toEqual(withEmptyArg);
        // Áreas iguais, sem ajuste => aluguel-alvo dividido igualmente.
        expect(withoutArg.map(u => u.rental_price)).toEqual([5000, 5000]);
    });

    it('no modo TARGET_TOTAL, a soma continua batendo com o alvo mesmo com regras aplicadas', () => {
        const adjust = { u1: 20 }; // só u1 ganha +20%
        const updated = rentalPricingService.calculateRents(units, config, adjust);
        const sum = updated.reduce((s, u) => s + (u.rental_price ?? 0), 0);
        // Arredondamento unidade a unidade pode desviar 1 (Math.round por unidade,
        // não do total) — tolerância de 1 real é o esperado, não um bug.
        expect(Math.abs(sum - config.target_total_rent)).toBeLessThanOrEqual(1);
        // E a unidade ajustada realmente ficou com aluguel maior que a outra.
        expect(updated[0].rental_price!).toBeGreaterThan(updated[1].rental_price!);
    });
});
