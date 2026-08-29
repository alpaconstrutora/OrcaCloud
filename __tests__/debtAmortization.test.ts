/**
 * Motor de amortização — casos de mesa.
 *
 * Os números de SAC e Price abaixo são conferíveis à mão / em planilha; é de
 * propósito que os testes não recalculem a fórmula que estão testando (senão
 * validariam o defeito, não o resultado).
 */

import { describe, expect, it } from 'vitest';
import {
    addMonthsISO,
    buildSchedule,
    monthlyRateFrom,
    outstandingBalanceAt,
    earlySettlementSavings,
    accruedInterestByCompetence,
    debtServiceBetween,
    scheduleTotals,
    cet,
    type DebtScheduleParams,
} from '../utils/debtAmortization';
import { calculateXIRR } from '../utils/financialMath';

const base: DebtScheduleParams = {
    principal: 120_000,
    nominalRate: 1,
    ratePeriod: 'MENSAL',
    system: 'SAC',
    installmentCount: 120,
    installmentPeriod: 'MENSAL',
    firstDueDate: '2026-09-10',
};

describe('addMonthsISO · data pura, sem fuso', () => {
    it('preserva o dia quando ele existe no mês de destino', () => {
        expect(addMonthsISO('2026-01-10', 1)).toBe('2026-02-10');
        expect(addMonthsISO('2026-09-10', 12)).toBe('2027-09-10');
    });

    it('recua o dia quando o mês de destino é mais curto', () => {
        expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28');
        expect(addMonthsISO('2028-01-31', 1)).toBe('2028-02-29'); // bissexto
        expect(addMonthsISO('2026-03-31', 1)).toBe('2026-04-30');
    });

    it('atravessa o ano sem deslocar', () => {
        expect(addMonthsISO('2026-12-15', 1)).toBe('2027-01-15');
        expect(addMonthsISO('2026-01-01', -1)).toBe('2025-12-01');
    });
});

describe('monthlyRateFrom · conversão de taxa', () => {
    it('mensal passa direto', () => {
        expect(monthlyRateFrom({ ...base, nominalRate: 1, ratePeriod: 'MENSAL' })).toBeCloseTo(0.01, 10);
    });

    it('anual geométrica ≠ anual linear — a escolha muda a parcela', () => {
        const geo = monthlyRateFrom({ ...base, nominalRate: 12, ratePeriod: 'ANUAL' });
        const lin = monthlyRateFrom({ ...base, nominalRate: 12, ratePeriod: 'ANUAL', annualConversion: 'LINEAR' });
        expect(geo).toBeCloseTo(0.0094888, 6);
        expect(lin).toBeCloseTo(0.01, 10);
    });

    it('spread soma à taxa mensal', () => {
        expect(monthlyRateFrom({ ...base, nominalRate: 1, spreadMonthly: 0.5 })).toBeCloseTo(0.015, 10);
    });
});

describe('SAC · 120 parcelas, 1% a.m., R$ 120.000', () => {
    const rows = buildSchedule(base);

    it('gera todas as parcelas', () => {
        expect(rows).toHaveLength(120);
    });

    it('amortização constante de R$ 1.000', () => {
        expect(rows[0].amortization).toBe(1000);
        expect(rows[59].amortization).toBe(1000);
        expect(rows[119].amortization).toBe(1000);
    });

    it('a primeira parcela é 1.000 + 1.200 de juros', () => {
        expect(rows[0].openingBalance).toBe(120_000);
        expect(rows[0].interest).toBe(1200);
        expect(rows[0].total).toBe(2200);
        expect(rows[0].closingBalance).toBe(119_000);
    });

    it('a segunda já custa menos juros (parcela decrescente)', () => {
        expect(rows[1].interest).toBe(1190);
        expect(rows[1].total).toBe(2190);
    });

    it('a última parcela zera o saldo', () => {
        expect(rows[119].openingBalance).toBe(1000);
        expect(rows[119].interest).toBe(10);
        expect(rows[119].closingBalance).toBe(0);
    });

    it('soma dos juros = R$ 72.600 (PA de 1.200 a 10)', () => {
        expect(scheduleTotals(rows).interest).toBeCloseTo(72_600, 2);
    });

    it('Σ amortização = principal liberado', () => {
        expect(scheduleTotals(rows).amortization).toBeCloseTo(120_000, 2);
    });

    it('vencimentos avançam mês a mês', () => {
        expect(rows[0].dueDate).toBe('2026-09-10');
        expect(rows[1].dueDate).toBe('2026-10-10');
        expect(rows[11].dueDate).toBe('2027-08-10');
    });
});

describe('Price · 60 parcelas, 1% a.m., R$ 100.000', () => {
    const rows = buildSchedule({
        ...base,
        principal: 100_000,
        system: 'PRICE',
        installmentCount: 60,
    });

    it('prestação de R$ 2.224,44 (valor de planilha)', () => {
        expect(rows[0].total).toBeCloseTo(2224.44, 2);
        expect(rows[30].total).toBeCloseTo(2224.44, 2);
    });

    it('a parcela é constante, mas a composição inverte', () => {
        expect(rows[0].interest).toBe(1000);
        expect(rows[0].amortization).toBeCloseTo(1224.44, 2);
        // No fim, quase tudo é principal.
        expect(rows[59].amortization).toBeGreaterThan(rows[59].interest * 50);
    });

    it('zera o saldo e amortiza exatamente o principal', () => {
        expect(rows[59].closingBalance).toBe(0);
        expect(scheduleTotals(rows).amortization).toBeCloseTo(100_000, 2);
    });
});

describe('Price com 6 períodos de carência de principal', () => {
    const rows = buildSchedule({
        ...base,
        principal: 100_000,
        system: 'PRICE',
        installmentCount: 60,
        gracePrincipalPeriods: 6,
    });

    it('as 6 primeiras só pagam juros', () => {
        for (let i = 0; i < 6; i++) {
            expect(rows[i].amortization).toBe(0);
            expect(rows[i].interest).toBe(1000);
            expect(rows[i].total).toBe(1000);
            expect(rows[i].closingBalance).toBe(100_000);
        }
    });

    it('a partir da sétima a prestação sobe (54 parcelas para o mesmo saldo)', () => {
        expect(rows[6].total).toBeGreaterThan(2224.44);
        expect(rows[6].amortization).toBeGreaterThan(0);
    });

    it('ainda assim zera e amortiza o principal cheio', () => {
        expect(rows[59].closingBalance).toBe(0);
        expect(scheduleTotals(rows).amortization).toBeCloseTo(100_000, 2);
    });

    it('carência custa mais juros que o mesmo contrato sem ela', () => {
        const semCarencia = buildSchedule({
            ...base, principal: 100_000, system: 'PRICE', installmentCount: 60,
        });
        expect(scheduleTotals(rows).interest).toBeGreaterThan(scheduleTotals(semCarencia).interest);
    });
});

describe('Carência de juros', () => {
    const comum = { ...base, principal: 100_000, system: 'SAC' as const, installmentCount: 12, graceInterestPeriods: 3 };

    it('capitalizando: os juros entram no saldo e não saem do caixa', () => {
        const rows = buildSchedule({ ...comum, capitalizeInterest: true });
        expect(rows[0].interest).toBe(0);
        expect(rows[1].interest).toBe(0);
        expect(rows[2].interest).toBe(0);
        expect(rows[3].interest).toBeGreaterThan(0);
        // O saldo cresceu com os juros capitalizados, então amortiza mais que
        // o principal original.
        expect(scheduleTotals(rows).amortization).toBeGreaterThan(100_000);
        expect(rows[11].closingBalance).toBe(0);
    });

    it('sem capitalizar: os juros acumulados caem na primeira parcela pós-carência', () => {
        const rows = buildSchedule({ ...comum, capitalizeInterest: false });
        expect(rows[0].interest).toBe(0);
        expect(rows[3].interest).toBeGreaterThan(rows[4].interest * 2);
        expect(scheduleTotals(rows).amortization).toBeCloseTo(100_000, 2);
    });
});

describe('Americano e Bullet', () => {
    it('Americano paga juros todo período e o principal só no fim', () => {
        const rows = buildSchedule({
            ...base, principal: 100_000, system: 'AMERICANO', installmentCount: 12,
        });
        expect(rows[0].interest).toBe(1000);
        expect(rows[0].amortization).toBe(0);
        expect(rows[0].total).toBe(1000);
        expect(rows[11].amortization).toBe(100_000);
        expect(rows[11].total).toBe(101_000);
        expect(rows[11].closingBalance).toBe(0);
        expect(scheduleTotals(rows).amortization).toBeCloseTo(100_000, 2);
    });

    it('Bullet não paga nada até o vencimento e capitaliza os juros', () => {
        const rows = buildSchedule({
            ...base, principal: 100_000, system: 'BULLET', installmentCount: 12,
        });
        for (let i = 0; i < 11; i++) expect(rows[i].total).toBe(0);
        // Saldo em 11 períodos a 1%: 100.000 × 1,01^11 = 111.566,83
        expect(rows[11].openingBalance).toBeCloseTo(111_566.83, 0);
        expect(rows[11].total).toBeCloseTo(112_682.50, 0);
        expect(rows[11].closingBalance).toBe(0);
    });
});

describe('Parcela semestral', () => {
    const rows = buildSchedule({
        ...base, principal: 100_000, system: 'SAC',
        installmentCount: 4, installmentPeriod: 'SEMESTRAL',
    });

    it('os vencimentos andam de 6 em 6 meses', () => {
        expect(rows[0].dueDate).toBe('2026-09-10');
        expect(rows[1].dueDate).toBe('2027-03-10');
        expect(rows[3].dueDate).toBe('2028-03-10');
    });

    it('a taxa capitaliza no período, não é a mensal crua', () => {
        // 1,01^6 − 1 = 6,152% sobre 100.000
        expect(rows[0].interest).toBeCloseTo(6152.02, 1);
    });

    it('zera o saldo', () => {
        expect(rows[3].closingBalance).toBe(0);
    });
});

describe('Contrato indexado (IPCA)', () => {
    const serie: Record<string, number> = {
        '2026-10': 1.004, '2026-11': 1.005, '2026-12': 1.003,
        '2027-01': 1.006, '2027-02': 1.004, '2027-03': 1.002,
    };
    const params: DebtScheduleParams = {
        ...base, principal: 100_000, system: 'SAC', installmentCount: 6,
        indexSeries: serie,
    };

    it('a primeira parcela não tem correção (a base já é a data dela)', () => {
        expect(buildSchedule(params)[0].monetaryCorrection).toBe(0);
    });

    it('as seguintes corrigem o saldo antes dos juros', () => {
        const rows = buildSchedule(params);
        expect(rows[1].monetaryCorrection).toBeGreaterThan(0);
        expect(scheduleTotals(rows).monetaryCorrection).toBeGreaterThan(0);
    });

    it('percentual do indexador escala a correção', () => {
        const cheio = scheduleTotals(buildSchedule(params)).monetaryCorrection;
        const metade = scheduleTotals(buildSchedule({ ...params, indexPct: 50 })).monetaryCorrection;
        expect(metade).toBeLessThan(cheio);
        expect(metade).toBeGreaterThan(0);
    });

    it('indexado custa mais que o mesmo contrato sem índice', () => {
        const semIndice = buildSchedule({ ...params, indexSeries: undefined });
        expect(scheduleTotals(buildSchedule(params)).total)
            .toBeGreaterThan(scheduleTotals(semIndice).total);
    });

    it('mesmo indexado, a última parcela zera o saldo', () => {
        expect(buildSchedule(params)[5].closingBalance).toBe(0);
    });
});

describe('Encargos por parcela', () => {
    const rows = buildSchedule({
        ...base, principal: 12_000, system: 'SAC', installmentCount: 12,
        iofPerInstallment: 3.5, insurancePerInstallment: 40, feesPerInstallment: 25,
    });

    it('entram no total sem virar amortização', () => {
        expect(rows[0].iof).toBe(3.5);
        expect(rows[0].insurance).toBe(40);
        expect(rows[0].fees).toBe(25);
        expect(rows[0].total).toBeCloseTo(1000 + 120 + 68.5, 2);
    });

    it('não mexem no saldo devedor', () => {
        expect(rows[11].closingBalance).toBe(0);
        expect(scheduleTotals(rows).amortization).toBeCloseTo(12_000, 2);
    });
});

describe('Fluxo manual / irregular', () => {
    const rows = buildSchedule({
        ...base, principal: 60_000, system: 'MANUAL', installmentCount: 3,
        firstDueDate: '2026-09-10',
        manualRows: [
            { dueDate: '2026-09-10', amortization: 10_000 },
            { dueDate: '2027-03-10', amortization: 20_000 },
            { dueDate: '2027-12-10', amortization: 30_000 },
        ],
    });

    it('respeita as datas e as amortizações informadas', () => {
        expect(rows).toHaveLength(3);
        expect(rows[0].dueDate).toBe('2026-09-10');
        expect(rows[1].dueDate).toBe('2027-03-10');
        expect(rows[0].amortization).toBe(10_000);
        expect(rows[1].amortization).toBe(20_000);
    });

    it('calcula os juros pelo intervalo real entre as parcelas', () => {
        // Salto de 6 meses cobra mais juros que o de 1 mês sobre saldo menor.
        expect(rows[1].interest).toBeGreaterThan(rows[0].interest);
    });

    it('a última absorve o saldo e zera', () => {
        expect(rows[2].closingBalance).toBe(0);
    });
});

describe('Consultas sobre o cronograma', () => {
    const rows = buildSchedule({ ...base, principal: 120_000, installmentCount: 120 });

    it('saldo devedor antes da primeira parcela é o principal cheio', () => {
        expect(outstandingBalanceAt(rows, '2026-08-01')).toBe(120_000);
    });

    it('saldo devedor numa data intermediária', () => {
        // Após a 12ª parcela (2027-08-10): 120.000 − 12.000
        expect(outstandingBalanceAt(rows, '2027-08-10')).toBe(108_000);
        expect(outstandingBalanceAt(rows, '2027-09-01')).toBe(108_000);
    });

    it('liquidação antecipada economiza os juros futuros', () => {
        const economia = earlySettlementSavings(rows, '2027-08-10');
        expect(economia).toBeGreaterThan(0);
        expect(economia).toBeLessThan(scheduleTotals(rows).interest);
    });

    it('juros por competência só somam o intervalo pedido', () => {
        const ano1 = accruedInterestByCompetence(rows, '2026-09-01', '2027-08-31');
        expect(ano1).toBeCloseTo(1200 + 1190 + 1180 + 1170 + 1160 + 1150 + 1140 + 1130 + 1120 + 1110 + 1100 + 1090, 2);
    });

    it('serviço da dívida soma as parcelas do intervalo', () => {
        expect(debtServiceBetween(rows, '2026-09-01', '2026-10-31')).toBeCloseTo(2200 + 2190, 2);
    });

    it('intervalo sem parcela devolve zero, não NaN', () => {
        expect(debtServiceBetween(rows, '2020-01-01', '2020-12-31')).toBe(0);
    });
});

describe('CET', () => {
    it('sem custo nenhum, o CET bate com a taxa contratada (1% a.m. ≈ 12,68% a.a.)', () => {
        const rows = buildSchedule({
            ...base, principal: 100_000, system: 'PRICE', installmentCount: 60,
            firstDueDate: '2026-10-01',
        });
        const taxa = cet(rows, 100_000, '2026-09-01');
        expect(taxa).not.toBeNull();
        expect(taxa!).toBeGreaterThan(12);
        expect(taxa!).toBeLessThan(13.5);
    });

    it('líquido menor que o contratado encarece o CET', () => {
        const rows = buildSchedule({
            ...base, principal: 100_000, system: 'PRICE', installmentCount: 60,
            firstDueDate: '2026-10-01',
        });
        const cheio = cet(rows, 100_000, '2026-09-01')!;
        // R$ 3.000 de IOF/tarifa retidos na liberação.
        const comCustos = cet(rows, 97_000, '2026-09-01')!;
        expect(comCustos).toBeGreaterThan(cheio);
    });

    it('devolve null quando não há como calcular', () => {
        expect(cet([], 100_000, '2026-09-01')).toBeNull();
        expect(cet(buildSchedule(base), 0, '2026-09-01')).toBeNull();
    });
});

describe('calculateXIRR', () => {
    it('fluxo sem sinal oposto não tem raiz — null, não zero', () => {
        expect(calculateXIRR([
            { date: '2026-01-01', amount: 100 },
            { date: '2027-01-01', amount: 100 },
        ])).toBeNull();
    });

    it('dobrar o dinheiro em um ano é 100% a.a.', () => {
        const taxa = calculateXIRR([
            { date: '2026-01-01', amount: 1000 },
            { date: '2027-01-01', amount: -2000 },
        ]);
        expect(taxa).not.toBeNull();
        expect(taxa!).toBeCloseTo(1, 2);
    });

    it('datas irregulares não quebram', () => {
        const taxa = calculateXIRR([
            { date: '2026-01-15', amount: 10_000 },
            { date: '2026-04-03', amount: -3000 },
            { date: '2026-11-20', amount: -4000 },
            { date: '2027-06-08', amount: -4000 },
        ]);
        expect(taxa).not.toBeNull();
        expect(taxa!).toBeGreaterThan(0);
    });
});

describe('Guardas', () => {
    it('principal zero ou negativo não gera cronograma', () => {
        expect(buildSchedule({ ...base, principal: 0 })).toEqual([]);
        expect(buildSchedule({ ...base, principal: -1 })).toEqual([]);
    });

    it('zero parcelas não gera cronograma', () => {
        expect(buildSchedule({ ...base, installmentCount: 0 })).toEqual([]);
    });

    it('MANUAL sem linhas não gera cronograma', () => {
        expect(buildSchedule({ ...base, system: 'MANUAL', manualRows: [] })).toEqual([]);
    });

    it('carência maior que o prazo não trava nem gera parcela negativa', () => {
        const rows = buildSchedule({
            ...base, principal: 10_000, installmentCount: 6, gracePrincipalPeriods: 99,
        });
        expect(rows).toHaveLength(6);
        expect(rows[5].closingBalance).toBe(0);
        expect(rows.every((r) => r.amortization >= 0 && r.total >= 0)).toBe(true);
    });

    it('taxa zero: só devolve o principal, sem NaN', () => {
        const rows = buildSchedule({
            ...base, principal: 12_000, nominalRate: 0, system: 'PRICE', installmentCount: 12,
        });
        expect(scheduleTotals(rows).interest).toBe(0);
        expect(scheduleTotals(rows).amortization).toBeCloseTo(12_000, 2);
        expect(rows[11].closingBalance).toBe(0);
    });
});
