import { describe, it, expect } from 'vitest';
import { pricingService } from '../services/pricingService';
import type { HedonicPricingConfig, Property, SalesPricingConfig } from '../types';

/**
 * Venda de Unidades › Inteligência de Precificação (2026-09-12): o preço sai de
 * **área × regras da aba Inteligência**, e de mais nada. Os pesos de andar,
 * posição, vista e orientação solar saíram do modal e do cálculo, como já
 * tinham saído de Locação em 11/09.
 *
 * Estes testes são a trava: se alguém reintroduzir um fator embutido no score
 * de venda, eles quebram. E o último bloco garante o inverso — a Imovib, que
 * não tem regras, continua com o modelo hedônico intacto.
 */

const u = (over: Partial<Property>): Property => ({
    id: 'u', name: 'U', type: 'APARTMENT', address: '', area: 50, private_area: 50,
    price: 0, status: 'AVAILABLE', specs: {}, ...over,
} as Property);

const cfg: SalesPricingConfig = { target_vgv: 10000, include_exchanged: false };

describe('venda: só área e regras entram no cálculo (2026-09-12)', () => {
    it('andar, posição, vista e orientação solar NÃO mudam mais o preço', () => {
        const simples = u({ id: 'a' });
        const cheia = u({ id: 'b', floor: 12, position_type: 'FRONT', view_type: 'FULL', sun_orientation: 'NORTH' });
        const out = pricingService.calculatePrices([simples, cheia], cfg);
        // Mesmos 50 m², nenhuma regra: o VGV divide ao meio, atributos não pesam.
        expect(out.map(p => p.price)).toEqual([5000, 5000]);
    });

    it('o único ajuste sobre a área é a regra da aba Inteligência', () => {
        const out = pricingService.calculatePrices([u({ id: 'a', floor: 9 }), u({ id: 'b' })], cfg, { a: 20 });
        // scores 60 e 50 → 10000 × 60/110 e 10000 × 50/110
        expect(out.map(p => p.price)).toEqual([5455, 4545]);
        expect(out[0].price).toBeGreaterThan(out[1].price);
    });

    it('a soma dos preços fecha no VGV-alvo, com ou sem regras', () => {
        const unidades = [u({ id: 'a', private_area: 80 }), u({ id: 'b', private_area: 45 }), u({ id: 'c', private_area: 62 })];
        const semRegra = pricingService.calculatePrices(unidades, cfg);
        const comRegra = pricingService.calculatePrices(unidades, cfg, { a: 5, c: -3 });
        for (const out of [semRegra, comRegra]) {
            const soma = out.reduce((s, p) => s + p.price, 0);
            // Math.round por unidade pode desviar 1 real — esperado, não bug.
            expect(Math.abs(soma - cfg.target_vgv)).toBeLessThanOrEqual(1);
        }
    });

    it('grava price, initial_price e table_price — nunca rental_price', () => {
        const [out] = pricingService.calculatePrices([u({ id: 'a', rental_price: 900 })], cfg);
        expect(out).toMatchObject({ price: 10000, initial_price: 10000, table_price: 10000, rental_price: 900 });
    });

    it('unidade permutada só entra no VGV com include_exchanged — o toggle continua mandando', () => {
        const unidades = [u({ id: 'a' }), u({ id: 'x', status: 'EXCHANGED', price: 1234 })];
        const fora = pricingService.calculatePrices(unidades, { ...cfg, include_exchanged: false });
        expect(fora.map(p => p.price)).toEqual([10000, 1234]);   // permutada mantém o preço que tinha
        const dentro = pricingService.calculatePrices(unidades, { ...cfg, include_exchanged: true });
        expect(dentro.map(p => p.price)).toEqual([5000, 5000]);
    });

    it('área privativa manda; sem ela cai em `area`; sem nenhuma, a unidade não é precificada', () => {
        const soArea = u({ id: 'y', private_area: 0, area: 30 });
        const semArea = u({ id: 'z', area: 0, private_area: 0 });
        const out = pricingService.calculatePrices([soArea, semArea], cfg);
        expect(out.find(p => p.id === 'y')!.price).toBe(10000);
        expect(out.find(p => p.id === 'z')!.price).toBe(0);
    });

    it('o master BUILDING fica de fora e intocado', () => {
        const predio = u({ id: 'p', type: 'BUILDING', price: 777 });
        const out = pricingService.calculatePrices([predio, u({ id: 'a' })], cfg);
        expect(out.find(p => p.id === 'p')!.price).toBe(777);
        expect(out.find(p => p.id === 'a')!.price).toBe(10000);
    });

    it('a decomposição explica o preço INTEIRO: base é a participação pura por área', () => {
        const { splitByPropertyId } = pricingService.calculatePricesWithSplit(
            [u({ id: 'a', floor: 12, position_type: 'FRONT' }), u({ id: 'b' })], cfg, { a: 10 },
        );
        // Sem pesos escondidos, base(a) = base(b) = metade do VGV; a regra explica toda a diferença.
        expect(splitByPropertyId.a).toMatchObject({ base: 5000, price: 5238, total: 238, totalPct: 10, mode: 'TARGET_VGV' });
        expect(splitByPropertyId.b).toMatchObject({ base: 5000, price: 4762, total: -238, totalPct: 0 });
    });
});

describe('imovib: o modelo hedônico continua existindo, com a MESMA conta de antes', () => {
    // A Imovib precifica instâncias de estudo de viabilidade, que não têm regras
    // da aba Inteligência — lá os pesos embutidos seguem sendo o único jeito de
    // diferenciar unidades. Este bloco trava que o caminho preservado dá o
    // número que `calculatePrices` dava antes de 2026-09-12.
    const hedonic: HedonicPricingConfig = {
        target_vgv: 10000,
        floor_coefficient: 0.01,
        include_exchanged: false,
        position_weights: { FRONT: 1.03, LATERAL: 1.0, BACK: 0.97 },
        view_weights: { NONE: 1.0, PARTIAL: 1.03, FULL: 1.07 },
        orientation_weights: { NORTH: 1.02, EAST: 1.01, WEST: 0.99, SOUTH: 0.98 },
    };

    it('andar, posição, vista e sol pesam — e o resultado é o histórico', () => {
        const simples = u({ id: 'a', floor: 0, position_type: 'LATERAL', view_type: 'NONE', sun_orientation: 'EAST' });
        const cheia = u({ id: 'b', floor: 10, position_type: 'FRONT', view_type: 'FULL', sun_orientation: 'NORTH' });
        const out = pricingService.calculateHedonicPrices([simples, cheia], hedonic);
        // scores: a = 50 × 1 × 1 × 1 × 1.01 = 50.5; b = 50 × 1.10 × 1.03 × 1.07 × 1.02 = 61.8237
        const sa = 50 * 1.01, sb = 50 * 1.10 * 1.03 * 1.07 * 1.02;
        expect(out[0].price).toBe(Math.round(10000 * sa / (sa + sb)));
        expect(out[1].price).toBe(Math.round(10000 * sb / (sa + sb)));
        expect(out[1].price).toBeGreaterThan(out[0].price);
    });

    it('é um caminho separado: o motor de Venda ignora esses pesos', () => {
        const cheia = u({ id: 'b', floor: 10, position_type: 'FRONT', view_type: 'FULL', sun_orientation: 'NORTH' });
        const venda = pricingService.calculatePrices([u({ id: 'a' }), cheia], { target_vgv: 10000 });
        expect(venda.map(p => p.price)).toEqual([5000, 5000]);
    });
});
