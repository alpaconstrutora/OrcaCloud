/**
 * Correção monetária: capitalizada no saldo, NÃO cobrada de novo na parcela.
 *
 * ─── A DÍVIDA QUE ISTO FECHA ────────────────────────────────────────────────
 *
 * Até 09/09/2026 o motor fazia as duas coisas: somava a correção ao SALDO
 * (`saldo = saldo + correcao`, e o saldo é o que a amortização paga) **e** a
 * somava a `row.total` como componente próprio da parcela. O mesmo dinheiro
 * saía duas vezes. Medido antes da correção — 100 mil, 24 parcelas, SAC, juros
 * 1% a.m., indexador 0,5% a.m.:
 *
 *     Σ amortização 106.188,70 · Σ correção 6.188,70 · Σ total 125.816,72
 *     Σ amortização − principal = 6.188,70  ← exatamente a Σ da correção
 *
 * E a duplicidade chegava ao Contas a Pagar, porque a emissão cria uma linha
 * por componente e CORRECAO era um deles.
 *
 * ─── O DEFEITO QUE A CORREÇÃO INGÊNUA TERIA INTRODUZIDO ─────────────────────
 *
 * Tirar a correção do total, sozinho, deixaria um BALÃO: a amortização do SAC
 * era `principal ÷ amortizantes`, fixa, então todo o crescimento do saldo se
 * acumulava e caía na última parcela — 23 de R$ 4.166,67 e uma de R$ 10.355,29.
 * Por isso o SAC passou a dividir o SALDO pelas parcelas restantes.
 */
import { describe, it, expect } from 'vitest';
import { buildSchedule, verificarFechamento, type DebtScheduleParams } from '../utils/debtAmortization';

const serieMensal = (fator: number) => {
    const s: Record<string, number> = {};
    for (let a = 2020; a <= 2030; a++) for (let m = 1; m <= 12; m++)
        s[`${a}-${String(m).padStart(2, '0')}`] = fator;
    return s;
};

const INDEXADO = {
    principal: 100000, firstDueDate: '2021-01-10', installmentCount: 24,
    installmentPeriod: 'MENSAL', system: 'SAC', nominalRate: 1, ratePeriod: 'MENSAL',
    indexSeries: serieMensal(1.005), indexPct: 100,
} as DebtScheduleParams;

const SIMPLES = {
    principal: 57000, firstDueDate: '2021-07-26', installmentCount: 44,
    installmentPeriod: 'MENSAL', system: 'SAC', nominalRate: 0.41, ratePeriod: 'MENSAL',
} as DebtScheduleParams;

describe('a correção não é cobrada duas vezes', () => {
    it('o total da parcela é amortização + juros + encargos, sem a correção', () => {
        for (const r of buildSchedule(INDEXADO)) {
            expect(r.total).toBeCloseTo(
                r.amortization + r.interest + r.iof + r.insurance + r.fees, 2,
            );
        }
    });

    it('a correção continua no saldo — a amortização a paga', () => {
        const rows = buildSchedule(INDEXADO);
        const somaAmort = rows.reduce((a, r) => a + r.amortization, 0);
        const somaCorrecao = rows.reduce((a, r) => a + r.monetaryCorrection, 0);
        expect(somaCorrecao).toBeGreaterThan(0);
        expect(somaAmort).toBeCloseTo(100000 + somaCorrecao, 1);
        expect(verificarFechamento(rows, 100000)).toBeNull();
    });

    it('o total pago cai — e fecha na soma dos componentes de caixa', () => {
        const rows = buildSchedule(INDEXADO);
        const total = rows.reduce((a, r) => a + r.total, 0);
        const caixa = rows.reduce(
            (a, r) => a + r.amortization + r.interest + r.iof + r.insurance + r.fees, 0,
        );

        // O total é exatamente o caixa — nada de correção somada por fora.
        expect(total).toBeCloseTo(caixa, 1);

        // E é menor que os R$ 125.816,72 medidos com a duplicidade. Não dá para
        // afirmar "menor por exatamente a correção": o SAC passou a dividir o
        // saldo pelas restantes, então o caminho do saldo — e portanto os juros
        // e a própria correção — mudaram junto. O que importa é a ordem de
        // grandeza da duplicidade que sumiu.
        expect(total).toBeLessThan(125816.72);
        expect(125816.72 - total).toBeGreaterThan(5000);
    });

    it('a correção segue registrada na linha, como memória de cálculo', () => {
        expect(buildSchedule(INDEXADO).some(r => r.monetaryCorrection > 0)).toBe(true);
    });
});

describe('SAC dividindo o saldo pelas restantes', () => {
    it('contrato SEM indexador é idêntico ao de antes — amortização constante', () => {
        const amorts = buildSchedule(SIMPLES).map(r => r.amortization);
        // 57.000 / 44 = 1.295,4545… → 1.295,45, com o centavo de resíduo
        // distribuído em vez de despejado na última parcela.
        for (const a of amorts) expect(a).toBeCloseTo(1295.45, 1);
        expect(Math.max(...amorts) - Math.min(...amorts)).toBeLessThanOrEqual(0.01);
    });

    it('contrato indexado não tem mais balão na última parcela', () => {
        const amorts = buildSchedule(INDEXADO).map(r => r.amortization);
        const primeira = amorts[0];
        const ultima = amorts[amorts.length - 1];
        // Antes: 4.166,67 → 10.355,29 (2,5×). Agora cresce suavemente.
        expect(ultima).toBeGreaterThan(primeira);
        expect(ultima / primeira).toBeLessThan(1.3);
    });

    it('fecha em todos os sistemas, com e sem indexador', () => {
        for (const system of ['SAC', 'PRICE', 'SACRE', 'AMERICANO', 'BULLET'] as const) {
            expect(verificarFechamento(buildSchedule({ ...SIMPLES, system }), 57000), system).toBeNull();
            expect(verificarFechamento(buildSchedule({ ...INDEXADO, system }), 100000), system).toBeNull();
        }
    });
});
