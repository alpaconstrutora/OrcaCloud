/**
 * Valor por extenso (contratos, aditivos, recibos). Achado em 25/11/2026 no
 * aditivo AD-004 do CTL-006: saía "cinco mil E oitocentos e trinta e dois reais".
 * Regra do português: o "e" entre os grupos (bilhão/milhão/mil/centena) só entra
 * quando o grupo seguinte é menor que cem ou uma centena redonda.
 */
import { describe, it, expect } from 'vitest';
import { valorPorExtenso, numeroPorExtenso } from '../services/docxFieldCatalog';

describe('valorPorExtenso', () => {
    it('o caso do AD-004: R$ 5.832,48', () => {
        expect(valorPorExtenso(5832.48)).toBe('cinco mil oitocentos e trinta e dois reais e quarenta e oito centavos');
    });

    it('"e" depois de mil só antes de centena redonda ou de menos de cem', () => {
        expect(valorPorExtenso(1200)).toBe('mil e duzentos reais');
        expect(valorPorExtenso(1050)).toBe('mil e cinquenta reais');
        expect(valorPorExtenso(1001)).toBe('mil e um reais');
        expect(valorPorExtenso(1234)).toBe('mil duzentos e trinta e quatro reais');
        expect(valorPorExtenso(4784.92)).toBe('quatro mil setecentos e oitenta e quatro reais e noventa e dois centavos');
        expect(valorPorExtenso(2100)).toBe('dois mil e cem reais');
    });

    it('milhões', () => {
        expect(valorPorExtenso(1_000_001)).toBe('um milhão e um reais');
        expect(valorPorExtenso(1_500_000)).toBe('um milhão e quinhentos mil reais');
        expect(valorPorExtenso(1_234_567)).toBe('um milhão duzentos e trinta e quatro mil quinhentos e sessenta e sete reais');
        expect(valorPorExtenso(2_000_300)).toBe('dois milhões e trezentos reais');
    });

    it('milhão ou bilhão redondo pede "de reais"', () => {
        expect(valorPorExtenso(1_000_000)).toBe('um milhão de reais');
        expect(valorPorExtenso(3_000_000)).toBe('três milhões de reais');
        expect(valorPorExtenso(2_000_000_000)).toBe('dois bilhões de reais');
        expect(valorPorExtenso(1_000_000.5)).toBe('um milhão de reais e cinquenta centavos');
    });

    it('casos simples continuam como eram', () => {
        expect(valorPorExtenso(1)).toBe('um real');
        expect(valorPorExtenso(100)).toBe('cem reais');
        expect(valorPorExtenso(1000)).toBe('mil reais');
        expect(valorPorExtenso(0.01)).toBe('um centavo');
        expect(valorPorExtenso(0)).toBe('zero real');
        expect(valorPorExtenso(null)).toBe('');
    });
});

describe('numeroPorExtenso (prazo em meses, nº de aluguéis)', () => {
    it('mesma regra de junção', () => {
        expect(numeroPorExtenso(30)).toBe('trinta');
        expect(numeroPorExtenso(1350)).toBe('mil trezentos e cinquenta');
        expect(numeroPorExtenso(1300)).toBe('mil e trezentos');
    });
});
