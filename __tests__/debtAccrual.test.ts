/**
 * Apropriação por competência — as cinco convenções.
 *
 * O que estes testes protegem: que a convenção escolhida MUDE o número (senão
 * a escolha é decorativa) e que a soma da apropriação nunca invente nem perca
 * juros em relação ao cronograma.
 */

import { describe, expect, it } from 'vitest';
import {
    accrualByCompetence,
    accrueAt,
    baseAnual,
    contarDias,
    diasCorridos,
    diasUteis,
    ehDiaUtil,
    fracaoDeAno,
    type DayCountConvention,
} from '../utils/debtAccrual';
import { buildSchedule, type DebtScheduleParams } from '../utils/debtAmortization';

const CONVENCOES: DayCountConvention[] = ['BUS/252', 'ACT/365', 'ACT/360', 'ACT/ACT', '30/360'];

const params: DebtScheduleParams = {
    principal: 120_000,
    nominalRate: 1,
    ratePeriod: 'MENSAL',
    system: 'SAC',
    installmentCount: 12,
    installmentPeriod: 'MENSAL',
    firstDueDate: '2026-10-10',
};
const rows = buildSchedule(params);
const ANCORA = '2026-09-10';

describe('dias úteis · calendário nacional', () => {
    it('fim de semana não é dia útil', () => {
        expect(ehDiaUtil('2026-09-12')).toBe(false); // sábado
        expect(ehDiaUtil('2026-09-13')).toBe(false); // domingo
    });

    it('dia comum é dia útil', () => {
        expect(ehDiaUtil('2026-09-10')).toBe(true); // quinta
    });

    it('feriado nacional fixo não é dia útil', () => {
        expect(ehDiaUtil('2026-09-07')).toBe(false); // Independência
        expect(ehDiaUtil('2026-12-25')).toBe(false); // Natal
        expect(ehDiaUtil('2026-11-20')).toBe(false); // Consciência Negra
    });

    it('feriado móvel (Páscoa) também não é', () => {
        // Páscoa 2026 = 05/04. Sexta-feira Santa = 03/04.
        expect(ehDiaUtil('2026-04-03')).toBe(false);
    });

    it('conta menos dias úteis que corridos no mesmo intervalo', () => {
        const c = diasCorridos('2026-09-10', '2026-10-10');
        const u = diasUteis('2026-09-10', '2026-10-10');
        expect(c).toBe(30);
        expect(u).toBeLessThan(c);
        expect(u).toBeGreaterThan(15);
    });

    it('intervalo invertido ou nulo devolve 0, não negativo', () => {
        expect(diasUteis('2026-10-10', '2026-09-10')).toBe(0);
        expect(diasUteis('2026-09-10', '2026-09-10')).toBe(0);
    });
});

describe('contarDias por convenção', () => {
    it('as convenções de dias corridos concordam entre si', () => {
        for (const c of ['ACT/365', 'ACT/360', 'ACT/ACT'] as DayCountConvention[]) {
            expect(contarDias('2026-09-10', '2026-10-10', c)).toBe(30);
        }
    });

    it('30/360 dá exatamente 30 no mês, mesmo em fevereiro', () => {
        expect(contarDias('2026-01-31', '2026-02-28', '30/360')).toBe(28);
        expect(contarDias('2026-01-15', '2026-02-15', '30/360')).toBe(30);
        // Um ano inteiro fecha 360, não 365.
        expect(contarDias('2026-01-15', '2027-01-15', '30/360')).toBe(360);
    });

    it('ACT/ACT muda a base em ano bissexto', () => {
        expect(baseAnual('ACT/ACT', '2026-06-01')).toBe(365);
        expect(baseAnual('ACT/ACT', '2028-06-01')).toBe(366); // bissexto
        expect(baseAnual('ACT/365', '2028-06-01')).toBe(365); // fixa, ignora
    });

    it('fração de ano difere entre as bases — é o ponto de existirem', () => {
        const f365 = fracaoDeAno('2026-01-01', '2026-07-01', 'ACT/365');
        const f360 = fracaoDeAno('2026-01-01', '2026-07-01', 'ACT/360');
        expect(f360).toBeGreaterThan(f365); // mesma contagem, base menor
    });
});

describe('accrueAt · juros incorridos e não vencidos', () => {
    it('no meio do 1º período, apropria parte dos juros', () => {
        const r = accrueAt(rows, '2026-09-25', 'ACT/365', ANCORA);
        expect(r.parcelaEmCurso).toBe(1);
        expect(r.inicioDoPeriodo).toBe('2026-09-10');
        expect(r.fimDoPeriodo).toBe('2026-10-10');
        expect(r.diasDecorridos).toBe(15);
        expect(r.diasDoPeriodo).toBe(30);
        expect(r.fracaoDecorrida).toBeCloseTo(0.5, 6);
        // Juros da 1ª parcela = 1.200; metade do período = 600.
        expect(r.jurosDaParcela).toBeCloseTo(1200, 2);
        expect(r.jurosIncorridos).toBeCloseTo(600, 2);
    });

    it('na âncora, nada correu ainda', () => {
        const r = accrueAt(rows, ANCORA, 'ACT/365', ANCORA);
        expect(r.jurosIncorridos).toBe(0);
        expect(r.jurosVencidos).toBe(0);
    });

    it('no vencimento, os juros da parcela estão vencidos e nada mais incorre', () => {
        const r = accrueAt(rows, '2026-10-10', 'ACT/365', ANCORA);
        expect(r.jurosVencidos).toBeCloseTo(1200, 2);
        expect(r.parcelaEmCurso).toBe(2);
        expect(r.jurosIncorridos).toBe(0); // o 2º período começou agora
    });

    it('depois da última parcela, não há mais o que incorrer', () => {
        const r = accrueAt(rows, '2030-01-01', 'ACT/365', ANCORA);
        expect(r.parcelaEmCurso).toBeUndefined();
        expect(r.jurosIncorridos).toBe(0);
        expect(r.jurosVencidos).toBeGreaterThan(0);
    });

    it('cronograma vazio não quebra', () => {
        const r = accrueAt([], '2026-09-25', 'ACT/365', ANCORA);
        expect(r.jurosIncorridos).toBe(0);
        expect(r.parcelaEmCurso).toBeUndefined();
    });

    it('🔴 a convenção MUDA o número — senão a escolha seria decorativa', () => {
        const valores = CONVENCOES.map(c => accrueAt(rows, '2026-09-25', c, ANCORA).jurosIncorridos);
        // Pelo menos duas convenções têm de discordar no mesmo fechamento.
        expect(new Set(valores).size).toBeGreaterThan(1);
    });

    it('DU/252 difere de dias corridos no mesmo fechamento', () => {
        const util = accrueAt(rows, '2026-09-25', 'BUS/252', ANCORA);
        const corrido = accrueAt(rows, '2026-09-25', 'ACT/365', ANCORA);
        expect(util.diasDoPeriodo).toBeLessThan(corrido.diasDoPeriodo);
        expect(util.jurosIncorridos).not.toBeCloseTo(corrido.jurosIncorridos, 2);
    });

    it('nenhuma convenção aproprima mais que os juros da parcela', () => {
        for (const c of CONVENCOES) {
            const r = accrueAt(rows, '2026-10-09', c, ANCORA);
            expect(r.jurosIncorridos).toBeLessThanOrEqual(r.jurosDaParcela + 0.01);
            expect(r.fracaoDecorrida).toBeLessThanOrEqual(1);
        }
    });
});

describe('accrualByCompetence · o mês a que cada juro pertence', () => {
    it('🔴 conserva o total: apropriar não cria nem perde juros', () => {
        const totalCronograma = rows.reduce((a, r) => a + r.interest, 0);
        for (const c of CONVENCOES) {
            const meses = accrualByCompetence(rows, c, ANCORA);
            const soma = meses.reduce((a, m) => a + m.juros, 0);
            expect(soma).toBeCloseTo(totalCronograma, 1);
        }
    });

    it('conserva a amortização e os encargos', () => {
        const meses = accrualByCompetence(rows, 'ACT/365', ANCORA);
        expect(meses.reduce((a, m) => a + m.amortizacao, 0))
            .toBeCloseTo(rows.reduce((a, r) => a + r.amortization, 0), 1);
    });

    it('🔴 juros de parcela que vence dia 10 caem em DOIS meses', () => {
        const meses = accrualByCompetence(rows, 'ACT/365', ANCORA);
        // O período 10/09 → 10/10 atravessa setembro e outubro.
        const set = meses.find(m => m.mes === '2026-09');
        const out = meses.find(m => m.mes === '2026-10');
        expect(set).toBeDefined();
        expect(out).toBeDefined();
        expect(set!.juros).toBeGreaterThan(0);
        // Setembro NÃO tem amortização: ela cai no mês do vencimento.
        expect(set!.amortizacao).toBe(0);
        expect(out!.amortizacao).toBeGreaterThan(0);
    });

    it('amortização inteira no mês do vencimento, nunca rateada', () => {
        const meses = accrualByCompetence(rows, 'ACT/365', ANCORA);
        const comAmort = meses.filter(m => m.amortizacao > 0);
        expect(comAmort).toHaveLength(12); // uma por parcela
        for (const m of comAmort) expect(m.amortizacao).toBeCloseTo(10_000, 2);
    });

    it('a convenção muda a divisão entre os meses', () => {
        const a = accrualByCompetence(rows, 'ACT/365', ANCORA).find(m => m.mes === '2026-09')!.juros;
        const b = accrualByCompetence(rows, 'BUS/252', ANCORA).find(m => m.mes === '2026-09')!.juros;
        expect(a).not.toBeCloseTo(b, 2);
    });

    it('cronograma vazio devolve lista vazia', () => {
        expect(accrualByCompetence([], 'ACT/365', ANCORA)).toEqual([]);
    });

    it('meses vêm ordenados', () => {
        const meses = accrualByCompetence(rows, 'ACT/365', ANCORA);
        expect([...meses].sort((x, y) => x.mes.localeCompare(y.mes))).toEqual(meses);
    });
});
