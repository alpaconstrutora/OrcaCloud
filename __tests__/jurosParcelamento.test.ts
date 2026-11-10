import { describe, it, expect } from 'vitest';
import {
    calcularParcelasComJuros,
    montarPlanoComJuros,
    type PlanoComJuros,
} from '../utils/jurosParcelamento';

const dois = (n: number) => Number(n.toFixed(2));
const soma = (xs: number[]) => dois(xs.reduce((s, x) => s + x, 0));

const plano = (over: Partial<PlanoComJuros> = {}): PlanoComJuros => ({
    precoSemJuros: 100000,
    entrada: 0,
    parcelas: 12,
    tipo: 'MENSAL',
    intervaloMeses: 1,
    primeiroVencimento: '2026-12-10',
    dataBase: '2026-11-10',
    taxaMensal: 1,
    sistema: 'PRICE',
    ...over,
});

describe('calcularParcelasComJuros', () => {
    it('price sem carência', () => {
        const l = calcularParcelasComJuros(plano());
        expect(l).toHaveLength(12);
        expect(l[0]).toMatchObject({ vencimento: '2026-12-10', valor: 8884.88, juros: 1000, principal: 7884.88 });
        expect(l[11].valor).toBe(8884.85);
        expect(soma(l.map(x => x.valor))).toBe(106618.53);
        expect(soma(l.map(x => x.principal))).toBe(100000);
        expect(soma(l.map(x => x.juros))).toBe(6618.53);
    });

    it('price com carência de 3 meses', () => {
        const l = calcularParcelasComJuros(plano({ primeiroVencimento: '2027-02-10' }));
        expect(l[0].valor).toBe(9063.46);
        expect(l[11].valor).toBe(9063.54);
        expect(soma(l.map(x => x.valor))).toBe(108761.6);
        expect(l[0].juros).toBe(3030.1);
        expect(l[0].principal).toBe(6033.36);
        expect(soma(l.map(x => x.principal))).toBe(100000);
        expect(soma(l.map(x => x.juros))).toBe(8761.6);
    });

    it('price trimestral', () => {
        const l = calcularParcelasComJuros(plano({
            parcelas: 4, intervaloMeses: 3, tipo: 'TRIMESTRAL', primeiroVencimento: '2027-02-10',
        }));
        expect(l.map(x => x.vencimento)).toEqual(['2027-02-10', '2027-05-10', '2027-08-10', '2027-11-10']);
        expect(l[0].valor).toBe(26922.07);
        expect(l[0].juros).toBe(3030.1);
        expect(soma(l.map(x => x.valor))).toBe(107688.28);
        expect(soma(l.map(x => x.principal))).toBe(100000);
    });

    it('sac', () => {
        const l = calcularParcelasComJuros(plano({ precoSemJuros: 120000, sistema: 'SAC' }));
        expect(l[0].valor).toBe(11200);
        expect(l[11].valor).toBe(10100);
        expect(soma(l.map(x => x.valor))).toBe(127800);
        expect(l.every(x => x.principal === 10000)).toBe(true);
    });

    it('entrada não paga juros: a base é preço − entrada', () => {
        const l = calcularParcelasComJuros(plano({ precoSemJuros: 120000, entrada: 20000 }));
        expect(l[0]).toMatchObject({ valor: 8884.88, juros: 1000, principal: 7884.88 });
        expect(soma(l.map(x => x.valor))).toBe(106618.53);
        expect(soma(l.map(x => x.principal))).toBe(100000);
    });

    it('taxa 0 não quebra: parcelas iguais, sem juros, soma fecha na base', () => {
        const l = calcularParcelasComJuros(plano({ taxaMensal: 0, precoSemJuros: 1000, parcelas: 3 }));
        expect(l.map(x => x.valor)).toEqual([333.33, 333.33, 333.34]);
        expect(soma(l.map(x => x.juros))).toBe(0);
        expect(soma(l.map(x => x.principal))).toBe(1000);
    });
});

describe('montarPlanoComJuros', () => {
    it('price: 2 blocos (11× + última) e totais', () => {
        const r = montarPlanoComJuros(plano({ precoSemJuros: 120000, entrada: 20000 }));
        expect(r.entrada).toBe(20000);
        expect(r.blocos).toHaveLength(2);
        expect(r.blocos[0]).toMatchObject({ quantidade: 11, valorParcela: 8884.88, primeiroVencimento: '2026-12-10' });
        expect(r.blocos[0].juros).toHaveLength(11);
        expect(r.blocos[0].principal).toHaveLength(11);
        expect(r.blocos[1]).toMatchObject({ quantidade: 1, valorParcela: 8884.85, primeiroVencimento: '2027-11-10' });
        expect(r.totalComJuros).toBe(dois(20000 + 106618.53));
        expect(r.totalJuros).toBe(6618.53);
    });
});
