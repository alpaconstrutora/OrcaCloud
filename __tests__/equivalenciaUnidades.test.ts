/**
 * EQUIVALÊNCIA DE UNIDADES (21/11/2026): *"o item 32, ACO CA-50, 6,3 MM, VERGALHAO
 * com unidade KG, porem ele pode ser por m (metro)"*.
 * Plano: docs/planos/2026-11-21-equivalencia-unidades.md.
 */
import { describe, it, expect } from 'vitest';
import {
    converterPreco, converterQuantidade, equivalenciasValidas, fatorEntre,
    unidadeInformadaValida, unidadesDoItem, baseDaUnidade, trocarUnidadeDaLinha, type EquivalenciaDeUnidade,
} from '../utils/equivalenciaUnidades';
import { identidadeDaUnidade, normalizarUnidade } from '../lib/unidadeDeMedida';

const eq = (unidade: string, fator: number, unidadeBase = 'KG'): EquivalenciaDeUnidade =>
    ({ itemCode: '32', unidadeBase, unidade, fator });
const EQS = new Map([['32', [eq('M', 0.245), eq('BR', 2.94)]]]);

describe('identidade da unidade', () => {
    it('vazio não vira UN para a equivalência (vira null), mas o pedido segue com UN', () => {
        expect(identidadeDaUnidade('')).toBeNull();
        expect(identidadeDaUnidade(null)).toBeNull();
        expect(normalizarUnidade('')).toBe('UN');
    });
    it('grafias diferentes da mesma unidade casam', () => {
        expect(identidadeDaUnidade('kg')).toBe('KG');
        expect(identidadeDaUnidade('m²')).toBe('M2');
        expect(identidadeDaUnidade('Barra')).toBe('BR');
    });
});

describe('fatorEntre', () => {
    it('mesma unidade = 1, mesmo sem cadastro', () => {
        expect(fatorEntre('99', 'KG', 'kg', 'KG', new Map())).toBe(1);
    });
    it('KG→M e M→KG pelo fator cadastrado', () => {
        expect(fatorEntre('32', 'KG', 'M', 'KG', EQS)).toBeCloseTo(0.245);
        expect(fatorEntre('32', 'KG', 'KG', 'M', EQS)).toBeCloseTo(1 / 0.245);
    });
    it('duas alternativas convertem pela base: 1 BR = 12 M', () => {
        expect(fatorEntre('32', 'KG', 'BR', 'M', EQS)).toBeCloseTo(12);
    });
    it('sem caminho = null (não chuta)', () => {
        expect(fatorEntre('32', 'KG', 'KG', 'SC', EQS)).toBeNull();
        expect(fatorEntre('33', 'KG', 'KG', 'M', EQS)).toBeNull();
        expect(fatorEntre('32', 'KG', '', 'M', EQS)).toBeNull();
    });
    it('item que mudou de unidade: a linha gravada para KG não vale para T', () => {
        expect(fatorEntre('32', 'T', 'T', 'M', EQS)).toBeNull();
        expect(equivalenciasValidas('32', 'T', EQS)).toEqual([]);
        expect(unidadesDoItem('32', 'T', EQS)).toBeNull();
    });
});

describe('unidadesDoItem', () => {
    it('a do item primeiro, depois as equivalentes', () => {
        expect(unidadesDoItem('32', 'kg', EQS)).toEqual(['KG', 'M', 'BR']);
    });
    it('sem equivalência = null', () => {
        expect(unidadesDoItem('33', 'KG', EQS)).toBeNull();
    });
});

describe('conversão conserva o total', () => {
    it('100 KG a R$ 8,00 = 408,16 M a R$ 1,96 (q × p igual)', () => {
        const f = fatorEntre('32', 'KG', 'KG', 'M', EQS)!;
        const q = converterQuantidade(100, f);
        const p = converterPreco(8, f);
        expect(q).toBeCloseTo(408.163265, 5);
        expect(p).toBeCloseTo(1.96, 4);
        expect(q * p).toBeCloseTo(800, 1);
    });
    it('120 M = 29,4 KG', () => {
        expect(converterQuantidade(120, fatorEntre('32', 'KG', 'M', 'KG', EQS)!)).toBeCloseTo(29.4, 6);
    });
});

describe('unidadeInformadaValida', () => {
    const inf = { unidade: 'M', unidadeBase: 'KG', fator: 0.245 };
    it('vale quando a base gravada é a unidade do item', () => {
        expect(unidadeInformadaValida('kg', inf)).toEqual(inf);
    });
    it('cai para a unidade do item quando ela mudou, ou o fator é inválido', () => {
        expect(unidadeInformadaValida('T', inf)).toBeNull();
        expect(unidadeInformadaValida('KG', { ...inf, fator: 0 })).toBeNull();
        expect(unidadeInformadaValida('KG', undefined)).toBeNull();
    });
});

describe('compras: base pela unidade atual da linha', () => {
    it('acha a base estando em KG, M ou BR', () => {
        expect(baseDaUnidade('32', 'kg', EQS)).toBe('KG');
        expect(baseDaUnidade('32', 'M', EQS)).toBe('KG');
        expect(baseDaUnidade('32', 'barra', EQS)).toBe('KG');
        expect(baseDaUnidade('32', 'SC', EQS)).toBeNull();
        expect(baseDaUnidade('33', 'KG', EQS)).toBeNull();
    });
    it('100 KG a R$ 8 → BR: 34,0136 BR a R$ 23,52 (total igual); e de volta', () => {
        const br = trocarUnidadeDaLinha('32', { unit: 'KG', quantity: 100, price: 8 }, 'BR', EQS)!;
        expect(br.unit).toBe('BR');
        expect(br.quantity).toBeCloseTo(34.013605, 5);
        expect(br.price).toBeCloseTo(23.52, 4);
        expect(br.quantity * br.price).toBeCloseTo(800, 1);
        const m = trocarUnidadeDaLinha('32', br, 'M', EQS)!;
        expect(m.quantity).toBeCloseTo(408.163265, 4);
    });
    it('sem caminho = null', () => {
        expect(trocarUnidadeDaLinha('32', { unit: 'KG', quantity: 1, price: 1 }, 'SC', EQS)).toBeNull();
    });
});
