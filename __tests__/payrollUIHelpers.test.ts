/**
 * Testes das funções puras extraídas de LaborPayroll.tsx para lib/payrollUIHelpers.ts.
 *
 * Cada função é testada com casos válidos, bordas e entradas inválidas/vazias.
 * Nenhum mock necessário — são funções puras sem side effects.
 */
import { describe, it, expect } from 'vitest';
import {
    formatDate,
    computeDateRange,
    suggestEventUnit,
    computeEventAmount,
    isDuplicateRubric,
} from '../lib/payrollUIHelpers';

// ─── formatDate ───────────────────────────────────────────────────────────────

describe('formatDate', () => {
    it('converte YYYY-MM-DD para DD/MM/YYYY', () => {
        expect(formatDate('2026-04-01')).toBe('01/04/2026');
    });

    it('ignora o sufixo T... de timestamps ISO', () => {
        expect(formatDate('2026-12-31T00:00:00.000Z')).toBe('31/12/2026');
    });

    it('retorna string vazia para entrada vazia', () => {
        expect(formatDate('')).toBe('');
    });

    it('retorna a entrada original quando o formato é desconhecido', () => {
        expect(formatDate('qualquer-coisa')).toBe('qualquer-coisa');
    });

    it('preserva zeros no dia e mês', () => {
        expect(formatDate('2026-01-05')).toBe('05/01/2026');
    });
});

// ─── computeDateRange ─────────────────────────────────────────────────────────

describe('computeDateRange', () => {
    it('retorna objeto vazio quando ano é "all"', () => {
        expect(computeDateRange('all', 'all')).toEqual({});
        expect(computeDateRange('all', '3')).toEqual({});
    });

    it('retorna o ano inteiro quando mês é "all"', () => {
        expect(computeDateRange('2026', 'all')).toEqual({
            start: '2026-01-01',
            end:   '2026-12-31',
        });
    });

    it('Janeiro (índice 0) → 01-01 a 01-31', () => {
        expect(computeDateRange('2026', '0')).toEqual({
            start: '2026-01-01',
            end:   '2026-01-31',
        });
    });

    it('Fevereiro 2026 (28 dias) → 02-01 a 02-28', () => {
        expect(computeDateRange('2026', '1')).toEqual({
            start: '2026-02-01',
            end:   '2026-02-28',
        });
    });

    it('Fevereiro 2024 (bissexto, 29 dias) → 02-01 a 02-29', () => {
        expect(computeDateRange('2024', '1')).toEqual({
            start: '2024-02-01',
            end:   '2024-02-29',
        });
    });

    it('Abril (índice 3, 30 dias) → 04-01 a 04-30', () => {
        expect(computeDateRange('2026', '3')).toEqual({
            start: '2026-04-01',
            end:   '2026-04-30',
        });
    });

    it('Dezembro (índice 11) → 12-01 a 12-31', () => {
        expect(computeDateRange('2026', '11')).toEqual({
            start: '2026-12-01',
            end:   '2026-12-31',
        });
    });
});

// ─── suggestEventUnit ─────────────────────────────────────────────────────────

describe('suggestEventUnit', () => {
    it('retorna "days" para rubricas com FALTA', () => {
        expect(suggestEventUnit('Falta Injustificada', 'FALTA')).toBe('days');
    });

    it('retorna "days" para rubricas com DSR', () => {
        expect(suggestEventUnit('Desconto DSR', 'DESC_DSR')).toBe('days');
    });

    it('retorna "hours" para HORA EXTRA no nome', () => {
        expect(suggestEventUnit('Hora Extra 50%', 'HE50')).toBe('hours');
    });

    it('retorna "hours" para HE no código mesmo sem "hora extra" no nome', () => {
        expect(suggestEventUnit('Adicional HE', 'HE100')).toBe('hours');
    });

    it('retorna "fixed" para Bônus (valor direto)', () => {
        expect(suggestEventUnit('Bônus de Produção', 'BONUS')).toBe('fixed');
    });

    it('retorna "fixed" para Adicional Noturno (sem HE no código)', () => {
        expect(suggestEventUnit('Adicional Noturno', 'AD_NOTURNO')).toBe('fixed');
    });

    it('retorna "fixed" para rubricas genéricas', () => {
        expect(suggestEventUnit('Outros', 'OUTROS')).toBe('fixed');
    });
});

// ─── computeEventAmount ───────────────────────────────────────────────────────

describe('computeEventAmount', () => {
    describe('unit = fixed', () => {
        it('sempre retorna 0 (valor digitado pelo usuário)', () => {
            expect(computeEventAmount('fixed', 10, 5000, 'BONUS', 'Bônus')).toBe(0);
        });
    });

    describe('unit = days', () => {
        it('calcula (salario / 30) * quantidade', () => {
            // 3000 / 30 * 2 = 200
            expect(computeEventAmount('days', 2, 3000, 'FALTA', 'Falta')).toBe(200);
        });

        it('arredonda para 2 casas decimais', () => {
            // 3001 / 30 * 1 = 100.0333... → 100.03
            expect(computeEventAmount('days', 1, 3001, 'FALTA', 'Falta')).toBe(100.03);
        });

        it('retorna 0 quando quantidade é 0', () => {
            expect(computeEventAmount('days', 0, 3000, 'FALTA', 'Falta')).toBe(0);
        });

        it('retorna 0 quando salário base é 0', () => {
            expect(computeEventAmount('days', 5, 0, 'FALTA', 'Falta')).toBe(0);
        });
    });

    describe('unit = hours', () => {
        it('fator 1.5 para HE50 — (salario / 220) * 1.5 * quantidade', () => {
            // 2200 / 220 * 1.5 * 10 = 150
            expect(computeEventAmount('hours', 10, 2200, 'HE50', 'Hora Extra 50%')).toBe(150);
        });

        it('fator 2.0 para HE100 — (salario / 220) * 2.0 * quantidade', () => {
            // 2200 / 220 * 2.0 * 5 = 100
            expect(computeEventAmount('hours', 5, 2200, 'HE100', 'Hora Extra 100%')).toBe(100);
        });

        it('fator 1.0 quando não é HE50 nem HE100', () => {
            // 2200 / 220 * 1.0 * 4 = 40
            expect(computeEventAmount('hours', 4, 2200, 'AD_NOTURNO', 'Adicional Noturno')).toBe(40);
        });

        it('detecta fator pelo nome quando código não tem 50/100', () => {
            // nome "Hora Extra 100%"
            expect(computeEventAmount('hours', 1, 2200, 'EXTRA', 'Hora Extra 100%')).toBe(20);
        });

        it('retorna 0 quando quantidade é 0', () => {
            expect(computeEventAmount('hours', 0, 3000, 'HE50', 'Hora Extra 50%')).toBe(0);
        });
    });
});

// ─── isDuplicateRubric ────────────────────────────────────────────────────────

describe('isDuplicateRubric', () => {
    const events = [
        { employee_id: 'emp1', rubric_code: 'BONUS',  code: 'BONUS' },
        { employee_id: 'emp1', rubric_code: 'FALTA',  code: 'FALTA' },
        { employee_id: 'emp2', rubric_code: 'BONUS',  code: 'BONUS' },
        // legado: rubric_code ausente, apenas code
        { employee_id: 'emp1', rubric_code: undefined, code: 'HE50' },
    ];

    it('detecta duplicata por rubric_code', () => {
        expect(isDuplicateRubric(events, 'emp1', 'BONUS')).toBe(true);
    });

    it('detecta duplicata por campo legado code', () => {
        expect(isDuplicateRubric(events, 'emp1', 'HE50')).toBe(true);
    });

    it('não detecta duplicata para outro colaborador', () => {
        // emp2 não tem FALTA
        expect(isDuplicateRubric(events, 'emp2', 'FALTA')).toBe(false);
    });

    it('não detecta duplicata para rubrica não lançada', () => {
        expect(isDuplicateRubric(events, 'emp1', 'OUTROS')).toBe(false);
    });

    it('retorna false para lista vazia', () => {
        expect(isDuplicateRubric([], 'emp1', 'BONUS')).toBe(false);
    });

    it('retorna false para employeeId inexistente', () => {
        expect(isDuplicateRubric(events, 'emp99', 'BONUS')).toBe(false);
    });
});
