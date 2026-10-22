import { describe, it, expect } from 'vitest';
import { salarioNaData, salarioDoPeriodo, type SalarioLancamento } from '../lib/payrollSalarioCompetencia';

// Casos reais de 22/10/2026: a folha usava employees.base_salary (o salário de
// HOJE) em toda competência, ignorando as datas do Histórico Salarial.

const ROGERIO: SalarioLancamento[] = [
    { effective_date: '2025-08-15', previous_salary: 1621, new_salary: 1621, created_at: '2026-09-03T10:00:00Z' },
    { effective_date: '2026-08-03', previous_salary: 1621, new_salary: 1767, created_at: '2026-09-03T10:01:00Z' },
];

describe('salarioNaData', () => {
    it('sem histórico usa o salário do cadastro', () => {
        expect(salarioNaData([], 2000, '2026-08-15')).toBe(2000);
    });

    it('vale o lançamento com a maior vigência até a data', () => {
        expect(salarioNaData(ROGERIO, 1767, '2026-07-31')).toBe(1621);
        expect(salarioNaData(ROGERIO, 1767, '2026-08-02')).toBe(1621);
        expect(salarioNaData(ROGERIO, 1767, '2026-08-03')).toBe(1767);
    });

    it('antes do primeiro lançamento vale o salário anterior dele', () => {
        const h = [{ effective_date: '2026-04-10', previous_salary: 2500, new_salary: 2477.02 }];
        expect(salarioNaData(h, 2477.02, '2026-02-28')).toBe(2500);
    });

    it('antes de uma admissão sem anterior vale o próprio valor da admissão', () => {
        const h = [{ effective_date: '2026-04-10', previous_salary: null, new_salary: 2477.02 }];
        expect(salarioNaData(h, 9999, '2026-02-28')).toBe(2477.02);
    });

    it('mesma vigência: vale o lançado por último', () => {
        const h: SalarioLancamento[] = [
            { effective_date: '2026-05-01', previous_salary: 1000, new_salary: 1100, created_at: '2026-05-01T08:00:00Z' },
            { effective_date: '2026-05-01', previous_salary: 1100, new_salary: 1200, created_at: '2026-05-02T08:00:00Z' },
        ];
        expect(salarioNaData(h, 0, '2026-05-15')).toBe(1200);
    });

    it('aceita data com hora (timestamp) sem deslocar o dia', () => {
        expect(salarioNaData(ROGERIO, 0, '2026-08-03T00:00:00')).toBe(1767);
    });
});

describe('salarioDoPeriodo — mês CLT de 30 dias, proporcional ao reajuste', () => {
    it('sem reajuste no mês: salário cheio, 30 dias', () => {
        const r = salarioDoPeriodo(ROGERIO, 1767, '2026-09-01', '2026-09-30');
        expect(r).toMatchObject({ valor: 1767, dias: 30, vigenteNoFim: 1767 });
    });

    it('reajuste no meio do mês: dias antes no antigo, a partir da data no novo (Rogério 08/2026)', () => {
        // 2 d × 1.621/30 + 28 d × 1.767/30 = 108,0667 + 1.649,20 = 1.757,27
        const r = salarioDoPeriodo(ROGERIO, 1767, '2026-08-01', '2026-08-31');
        expect(r.valor).toBe(1757.27);
        expect(r.dias).toBe(30);
        expect(r.vigenteNoFim).toBe(1767);
        expect(r.faixas).toEqual([
            { de: '2026-08-01', ate: '2026-08-02', dias: 2, salario: 1621 },
            { de: '2026-08-03', ate: '2026-08-30', dias: 28, salario: 1767 },
        ]);
    });

    it('competência anterior ao reajuste não é tocada por ele', () => {
        expect(salarioDoPeriodo(ROGERIO, 1767, '2026-07-01', '2026-07-31').valor).toBe(1621);
    });

    it('admissão no mês conta só a partir dela, com o reajuste no meio', () => {
        // admissão 11/03 (20 dias CLT), reajuste em 21/03
        const h = [
            { effective_date: '2026-03-11', previous_salary: null, new_salary: 3000 },
            { effective_date: '2026-03-21', previous_salary: 3000, new_salary: 3300 },
        ];
        const r = salarioDoPeriodo(h, 3300, '2026-03-01', '2026-03-31', '2026-03-11');
        // 10 d × 100 + 10 d × 110 = 2.100
        expect(r).toMatchObject({ valor: 2100, dias: 20, vigenteNoFim: 3300 });
    });

    it('admissão antes do período não reduz os dias', () => {
        expect(salarioDoPeriodo(ROGERIO, 1767, '2026-09-01', '2026-09-30', '2025-08-15').dias).toBe(30);
    });

    it('reajuste no dia 31 só entra no mês seguinte (dia 31 vale como 30)', () => {
        const h = [
            { effective_date: '2026-01-01', previous_salary: null, new_salary: 3000 },
            { effective_date: '2026-07-31', previous_salary: 3000, new_salary: 3300 },
        ];
        const r = salarioDoPeriodo(h, 3300, '2026-07-01', '2026-07-31');
        expect(r.valor).toBe(3000);
        expect(r.vigenteNoFim).toBe(3300);
    });

    it('fevereiro também tem 30 dias CLT: reajuste em 28/02 vale 3 dias', () => {
        const h = [
            { effective_date: '2026-01-01', previous_salary: null, new_salary: 3000 },
            { effective_date: '2026-02-28', previous_salary: 3000, new_salary: 3300 },
        ];
        // 27 d × 100 + 3 d × 110 = 3.030
        expect(salarioDoPeriodo(h, 3300, '2026-02-01', '2026-02-28').valor).toBe(3030);
    });

    it('sem histórico se comporta como antes (cadastro, 30 dias)', () => {
        expect(salarioDoPeriodo([], 2500, '2026-08-01', '2026-08-31')).toMatchObject({ valor: 2500, dias: 30, vigenteNoFim: 2500 });
    });
});
