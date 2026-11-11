import { describe, it, expect } from 'vitest';
import { taxaMensalMedia } from '../utils/indiceVariacao';

/** Média mensal de um índice (item 1.7 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). */

const serie = (inicio: string, valores: number[]) => valores.map((value, i) => {
    const [a, m] = inicio.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1 + i, 1));
    return { reference_month: d.toISOString().slice(0, 10), value };
});

describe('1.7 — taxaMensalMedia', () => {
    it('100 → 112,68 em 12 meses dá 1% ao mês', () => {
        const valores = Array.from({ length: 13 }, (_, i) => 100 * Math.pow(1.01, i));
        expect(taxaMensalMedia(serie('2025-06', valores), 12)).toBeCloseTo(1, 6);
    });

    it('usa só os últimos N meses da série, em qualquer ordem', () => {
        const valores = [50, 60, 70, ...Array.from({ length: 13 }, (_, i) => 100 * Math.pow(1.005, i))];
        const embaralhada = serie('2024-12', valores).reverse();
        expect(taxaMensalMedia(embaralhada, 12)).toBeCloseTo(0.5, 6);
    });

    it('mês faltando no meio: conta pelos meses do calendário, não pelos pontos', () => {
        const s = serie('2025-01', [100, 101, 102.01, 103.0301]).filter((_, i) => i !== 1);
        expect(taxaMensalMedia(s, 12)).toBeCloseTo(1, 6);
    });

    it('menos de dois pontos, ou valor inválido: null', () => {
        expect(taxaMensalMedia([], 12)).toBeNull();
        expect(taxaMensalMedia(serie('2025-01', [100]), 12)).toBeNull();
        expect(taxaMensalMedia(serie('2025-01', [0, 100]), 12)).toBeNull();
    });
});
