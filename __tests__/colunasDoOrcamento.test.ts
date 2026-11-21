/**
 * Colunas da lista de Orçamentos e a conta do Preço Final (21/11/2026).
 * Plano: docs/planos/2026-11-21-orcamentos-colunas.md.
 */
import { describe, it, expect } from 'vitest';
import { precoFinalDoOrcamento } from '../utils/totaisDoOrcamento';
import { valorDaColunaDoOrcamento, compararValores } from '../utils/colunasDoOrcamento';

describe('precoFinalDoOrcamento', () => {
    it('quantidade × preço × (1 + BDI); o BDI do item vence o global', () => {
        expect(precoFinalDoOrcamento([
            { quantity: 2, sinapiItem: { price: 100 } },
            { quantity: 1, sinapiItem: { price: 100 }, bdi: 10 },
        ], 25)).toBeCloseTo(360);
    });
    it('BDI do item 0 vale (não cai no global); sem preço conta 0; sem BDI global = 0%', () => {
        expect(precoFinalDoOrcamento([{ quantity: 1, sinapiItem: { price: 100 }, bdi: 0 }], 25)).toBe(100);
        expect(precoFinalDoOrcamento([{ quantity: 5, sinapiItem: undefined as never }], 25)).toBe(0);
        expect(precoFinalDoOrcamento([{ quantity: 1, sinapiItem: { price: 50 } }], undefined)).toBe(50);
        expect(precoFinalDoOrcamento(null, 25)).toBe(0);
    });
});

describe('valorDaColunaDoOrcamento', () => {
    it('base de preço junta a base e o mês; ordena pelo mês como AAAA-MM', () => {
        expect(valorDaColunaDoOrcamento('base-preco', { database: 'SINAPI', referenceMonth: '12/2025' }))
            .toEqual({ texto: 'SINAPI · 12/2025', ordem: 'SINAPI|2025-12' });
        expect(valorDaColunaDoOrcamento('base-preco', {}).texto).toBeNull();
    });
    it('BDI 0 é dado (0%), não vazio; área 0 é vazio', () => {
        expect(valorDaColunaDoOrcamento('bdi', { bdi: 0 }).texto).toBe('0%');
        expect(valorDaColunaDoOrcamento('bdi', { bdi: 22.5 }).texto).toBe('22,5%');
        expect(valorDaColunaDoOrcamento('area', { area: 0 }).texto).toBeNull();
        expect(valorDaColunaDoOrcamento('area', { area: 1234.5 }).texto).toBe('1.234,5 m²');
    });
    it('datas do cadastro sem deslocar o dia pelo fuso', () => {
        expect(valorDaColunaDoOrcamento('previsto-inicio', { startDate: '2026-01-01' }).texto).toBe('01/01/2026');
        expect(valorDaColunaDoOrcamento('previsto-termino', { endDate: '' }).texto).toBeNull();
    });
    it('valor total só com o número calculado', () => {
        expect(valorDaColunaDoOrcamento('valor-total', {}, 1500.5).texto?.replace(/ /g, ' ')).toBe('R$ 1.500,50');
        expect(valorDaColunaDoOrcamento('valor-total', {}, null).texto).toBeNull();
    });
});

describe('compararValores', () => {
    it('sem dado vai para o fim nos dois sentidos', () => {
        const ordenar = (dir: 'asc' | 'desc') => [3, null, 1].sort((a, b) => compararValores(a, b, dir));
        expect(ordenar('asc')).toEqual([1, 3, null]);
        expect(ordenar('desc')).toEqual([3, 1, null]);
    });
});
