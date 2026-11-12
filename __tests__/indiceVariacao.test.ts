import { describe, it, expect } from 'vitest';
import { serieDoIndice, taxaMensalMedia } from '../utils/indiceVariacao';

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

describe('pendência da Fase 1 — série do índice sem misturar organização e global', () => {
    const v = (reference_month: string, value: number, organization_id: string | null) => ({ reference_month, value, organization_id });

    it('a organização tem série: usa só a dela (o global não preenche os buracos dela)', () => {
        const serie = serieDoIndice([v('2026-01-01', 100, null), v('2026-02-01', 101, null), v('2026-03-01', 102, null), v('2026-01-01', 500, 'org'), v('2026-03-01', 510, 'org')]);
        expect(serie.map(x => x.value)).toEqual([500, 510]);
    });

    it('sem série da organização: usa a global', () => {
        expect(serieDoIndice([v('2026-01-01', 100, null), v('2026-02-01', 101, null)]).map(x => x.value)).toEqual([100, 101]);
    });

    it('a mistura distorcia a taxa: série da organização em outra base não salta para a global', () => {
        const valores = [v('2025-01-01', 100, null), v('2026-01-01', 112, null), v('2025-01-01', 1000, 'org'), v('2026-01-01', 1120, 'org'), v('2025-07-01', 106, null)];
        expect(taxaMensalMedia(serieDoIndice(valores), 12)).toBeCloseTo((Math.pow(1.12, 1 / 12) - 1) * 100, 6);
    });
});
