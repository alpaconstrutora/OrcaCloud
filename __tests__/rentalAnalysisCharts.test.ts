import { describe, it, expect } from 'vitest';
import {
    unitStatusBreakdown,
    leaseExpirySchedule,
    receivablesAging,
} from '../lib/rentalAnalysisCharts';
import { collectionSnapshot, wale, type Receivable } from '../lib/rentalExecutive';

/**
 * O que estes testes protegem: as séries dos gráficos são PARTIÇÕES do mesmo
 * insumo dos KPIs — cada unidade, contrato e parcela cai em exatamente um
 * balde, e a soma dos baldes fecha com o KPI vizinho. Gráfico que discorda do
 * número ao lado é pior que nenhum gráfico.
 */

const AGORA = new Date('2026-09-12T12:00:00');

describe('unitStatusBreakdown', () => {
    it('cada unidade cai em um balde e a soma fecha com o total', () => {
        const r = unitStatusBreakdown([
            { status: 'RENTED' }, { status: 'RENTED' },
            { status: 'AVAILABLE' },
            { status: 'RESERVED' },
            { status: 'MAINTENANCE' },
            { status: 'SOLD' }, { status: null }, {},
        ]);
        expect(r).toEqual({ rented: 2, available: 1, reserved: 1, maintenance: 1, other: 3, total: 8 });
        expect(r.rented + r.available + r.reserved + r.maintenance + r.other).toBe(r.total);
    });

    it('carteira vazia é zero em tudo (é medição, não ausência de dado)', () => {
        expect(unitStatusBreakdown([]).total).toBe(0);
    });
});

describe('leaseExpirySchedule', () => {
    const contratos = [
        { end_date: '2026-09-20', value: 1000, active: true },   // 8 dias — mês corrente
        { end_date: '2026-10-05', value: 2000, active: true },   // 23 dias — mês seguinte
        { end_date: '2026-12-31', value: 3000, active: true },   // 110 dias
        { end_date: '2027-08-31', value: 4000, active: true },   // 353 dias — último mês do horizonte
        { end_date: '2027-09-01', value: 5000, active: true },   // 354 dias — 13º mês: fora do horizonte
        { end_date: '2029-01-01', value: 6000, active: true },   // além de 365
        { end_date: '2026-09-01', value: 7000, active: true },   // vencido e ainda vigente
        { end_date: null, value: 8000, active: true },           // sem término
        { end_date: '2026-09-15', value: 9000, active: false },  // encerrado: não entra
    ];
    const s = leaseExpirySchedule(contratos, AGORA);

    it('gera exatamente 12 meses consecutivos a partir do mês corrente, com rótulo pt-BR', () => {
        expect(s.months).toHaveLength(12);
        expect(s.months[0]).toMatchObject({ month: '2026-09', label: 'set/26' });
        expect(s.months[11]).toMatchObject({ month: '2027-08', label: 'ago' });
        // O ano só aparece onde muda — e no primeiro rótulo.
        expect(s.months.map(m => m.label)).toEqual(['set/26', 'out', 'nov', 'dez', 'jan/27', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago']);
        // Mês sem vencimento existe, com zero — o eixo não pode pular meses.
        expect(s.months.find(m => m.month === '2026-11')).toMatchObject({ count: 0, value: 0 });
    });

    it('cada vigente cai em um balde de mês, ou em "além do horizonte", "vencido" ou "sem término"', () => {
        const nosMeses = s.months.reduce((acc, m) => acc + m.count, 0);
        expect(nosMeses + s.beyondHorizon.count + s.expired.count + s.noEndDate).toBe(s.activeCount);
        expect(s.activeCount).toBe(8);
        expect(s.months.find(m => m.month === '2026-09')).toMatchObject({ count: 1, value: 1000 });
        expect(s.months.find(m => m.month === '2027-08')).toMatchObject({ count: 1, value: 4000 });
        expect(s.beyondHorizon).toEqual({ count: 2, value: 11000 });
        expect(s.expired).toEqual({ count: 1, value: 7000 });
        expect(s.noEndDate).toBe(1);
    });

    it('acumulados por prazo contam a partir de hoje e são inclusivos', () => {
        expect(s.within30).toEqual({ count: 2, value: 3000 });
        expect(s.within90).toEqual({ count: 2, value: 3000 });
        expect(s.within180).toEqual({ count: 3, value: 6000 });
        expect(s.within365).toEqual({ count: 5, value: 15000 });
    });

    it('"vencido e vigente" bate com o expiredStillActive do WALE para o mesmo insumo', () => {
        const w = wale(contratos.map((c, i) => ({ id: String(i), ...c })), AGORA);
        expect(s.expired.count).toBe(w.expiredStillActive);
        expect(s.noEndDate).toBe(w.missingEndDate);
    });

    it('sem contrato vigente devolve horizonte vazio, não null (a lista existia)', () => {
        const vazio = leaseExpirySchedule([{ end_date: '2026-10-01', value: 1, active: false }], AGORA);
        expect(vazio.activeCount).toBe(0);
        expect(vazio.months.every(m => m.count === 0)).toBe(true);
    });
});

describe('receivablesAging', () => {
    const parcelas: Receivable[] = [
        { amount: 100, due_date: '2026-09-20', settled: false },  // a vencer
        { amount: 110, due_date: '2026-09-12', settled: false },  // vence hoje: ainda não atrasada
        { amount: 200, due_date: '2026-09-01', settled: false },  // 11 dias
        { amount: 300, due_date: '2026-07-31', settled: false },  // 43 dias
        { amount: 400, due_date: '2026-06-30', settled: false },  // 74 dias
        { amount: 500, due_date: '2026-05-31', settled: false },  // 104 dias
        { amount: 600, due_date: '2026-01-10', settled: true },   // recebida: fora do aberto
        { amount: 700, due_date: null, settled: false },          // sem vencimento
    ];
    const a = receivablesAging(parcelas, AGORA);

    it('cada parcela em aberto cai em uma faixa e a soma fecha', () => {
        expect(a.notDue).toBe(100 + 110 + 700);
        expect(a.late1_30).toBe(200);
        expect(a.late31_60).toBe(300);
        expect(a.late61_90).toBe(400);
        expect(a.over90).toBe(500);
        expect(a.notDue + a.late1_30 + a.late31_60 + a.late61_90 + a.over90).toBe(a.totalOpen);
        expect(a.totalOverdue).toBe(200 + 300 + 400 + 500);
        expect(a.received).toBe(600);
        expect(a.billed).toBe(a.totalOpen + a.received);
        expect(a.withoutDueDate).toBe(1);
    });

    it('as bordas das faixas são as mesmas do KPI de cobrança (collectionSnapshot)', () => {
        const c = collectionSnapshot(parcelas, AGORA);
        expect(a.over90).toBe(c.overdue90);
        expect(a.late61_90).toBe(c.overdue60);
        expect(a.late31_60).toBe(c.overdue30);
        expect(a.received).toBe(c.received);
        expect(a.billed).toBe(c.billed);
    });
});
