/**
 * Controladoria — regras de período e de margem (plano
 * docs/planos/2026-11-14-controladoria-critica.md, passo 1).
 */
import { describe, it, expect } from 'vitest';
import {
    hojeLocalISO, anoCorrente, motivoPeriodoInvalido, motivoDataInvalida, margemSobreReceitaLiquida,
} from '../utils/periodoControladoria';

describe('hojeLocalISO', () => {
    it('usa o dia LOCAL, não o UTC (23h de 14/11 não vira 15/11)', () => {
        // 14/11/2026 23:30 no fuso local — em UTC−3 o toISOString já daria dia 15.
        const noite = new Date(2026, 10, 14, 23, 30);
        expect(hojeLocalISO(noite)).toBe('2026-11-14');
    });

    it('preenche mês e dia com zero', () => {
        expect(hojeLocalISO(new Date(2026, 0, 5, 10))).toBe('2026-01-05');
    });
});

describe('anoCorrente', () => {
    it('vai de 1º de janeiro a 31 de dezembro', () => {
        expect(anoCorrente(new Date(2026, 6, 1))).toEqual({ de: '2026-01-01', ate: '2026-12-31' });
    });
});

describe('motivoPeriodoInvalido', () => {
    it('período completo e em ordem pode ser consultado', () => {
        expect(motivoPeriodoInvalido('2026-01-01', '2026-12-31')).toBeNull();
        expect(motivoPeriodoInvalido('2026-03-10', '2026-03-10')).toBeNull();
    });

    it('data vazia (campo incompleto) não consulta', () => {
        expect(motivoPeriodoInvalido('', '2026-12-31')).toMatch(/inicial/);
        expect(motivoPeriodoInvalido('2026-01-01', '')).toMatch(/final/);
    });

    it('ano no meio da digitação (0002, 0201) não consulta', () => {
        // Era exatamente isso que disparava a carga de "0201 a 2026" que pousava por último.
        expect(motivoPeriodoInvalido('0201-01-01', '2026-12-31')).toMatch(/inicial/);
        expect(motivoPeriodoInvalido('2010-01-01', '0002-12-31')).toMatch(/final/);
    });

    it('início depois do fim não consulta', () => {
        expect(motivoPeriodoInvalido('2026-12-31', '2026-01-01')).toBe('A data inicial é depois da final.');
    });
});

describe('motivoDataInvalida (WIP)', () => {
    it('aceita data completa e recusa incompleta', () => {
        expect(motivoDataInvalida('2026-11-14')).toBeNull();
        expect(motivoDataInvalida('')).toBe('Informe a data completa.');
        expect(motivoDataInvalida('0020-11-14')).toBe('Informe a data completa.');
    });
});

describe('margemSobreReceitaLiquida', () => {
    it('divide pela receita líquida', () => {
        expect(margemSobreReceitaLiquida(-2000, 4000)).toBe(-50);
        expect(margemSobreReceitaLiquida(500, 1000)).toBe(50);
    });

    it('sem receita líquida positiva não há margem (null, não 0 nem infinito)', () => {
        expect(margemSobreReceitaLiquida(-5021.18, 0)).toBeNull();
        expect(margemSobreReceitaLiquida(100, -50)).toBeNull();
    });

    it('DRE e SPE dão o MESMO número para o mesmo resultado (era bruta × líquida)', () => {
        const receitaBruta = 1000, deducoes = -100, resultado = 90;
        const receitaLiquida = receitaBruta + deducoes;
        expect(margemSobreReceitaLiquida(resultado, receitaLiquida)).toBe(10);
    });
});
