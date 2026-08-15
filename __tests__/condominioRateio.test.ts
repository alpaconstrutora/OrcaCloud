/**
 * Rateio condominial — a soma das cotas TEM de bater com o total, ao centavo.
 *
 * Não é preciosismo: 1000,00 dividido por 3 dá 333,333… e, se cada unidade
 * ficar com 333,33, o condomínio arrecada 999,99. Um centavo por mês, por
 * rateio, aparece na prestação de contas como furo que ninguém explica — e
 * prestação de contas de condomínio é aprovada em assembleia.
 *
 * O resto vai para as maiores frações perdidas (critério do "maior resto"), que
 * é como rateio se faz — e não para a primeira ou a última linha, que
 * concentraria a diferença sempre na mesma unidade.
 */
import { describe, expect, it } from 'vitest';
import { distribuir } from '../services/condominioRateioService';

const soma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe('rateio · a soma fecha exatamente', () => {
    it('divisão que não fecha: 1000,00 entre 3 iguais', () => {
        const r = distribuir(100000, [1, 1, 1]);
        expect(soma(r)).toBe(100000);
        // 333,34 + 333,33 + 333,33 — a diferença vai para UMA, não some.
        expect(r.filter(v => v === 33334)).toHaveLength(1);
        expect(r.filter(v => v === 33333)).toHaveLength(2);
    });

    it('divisão exata não inventa resto', () => {
        const r = distribuir(90000, [1, 1, 1]);
        expect(r).toEqual([30000, 30000, 30000]);
    });

    it('pesos desiguais (fração ideal) somam o total', () => {
        // Frações que não fecham redondo de propósito.
        const pesos = [0.0833, 0.0833, 0.0834, 0.25, 0.25, 0.25];
        const r = distribuir(123456, pesos);
        expect(soma(r)).toBe(123456);
        // Quem tem peso maior paga mais — a ordem se preserva.
        expect(r[3]).toBeGreaterThan(r[0]);
    });

    it('área privativa: proporcional e exato', () => {
        const r = distribuir(1000000, [45.5, 62.3, 88.1, 45.5]);
        expect(soma(r)).toBe(1000000);
        expect(r[0]).toBe(r[3]); // áreas iguais, cotas iguais
        expect(r[2]).toBeGreaterThan(r[1]);
    });

    it('peso zero não recebe nada', () => {
        // É o caso do critério GRUPO: quem está fora tem peso 0.
        const r = distribuir(100000, [1, 0, 1, 0]);
        expect(r[1]).toBe(0);
        expect(r[3]).toBe(0);
        expect(soma(r)).toBe(100000);
    });

    it('soma de pesos zero devolve zeros, sem dividir por zero', () => {
        // Acontece de verdade: critério FRACAO_IDEAL num condomínio onde nenhuma
        // unidade teve a convenção transcrita ainda.
        expect(distribuir(100000, [0, 0, 0])).toEqual([0, 0, 0]);
    });

    it('uma unidade só recebe tudo', () => {
        expect(distribuir(100000, [1])).toEqual([100000]);
    });

    it('muitas unidades com resto grande ainda fecham', () => {
        // 100,00 entre 7: resto de 2 centavos a distribuir.
        const r = distribuir(10000, Array(7).fill(1));
        expect(soma(r)).toBe(10000);
        expect(Math.max(...r) - Math.min(...r)).toBe(1); // diferença de 1 centavo, no máximo
    });
});
