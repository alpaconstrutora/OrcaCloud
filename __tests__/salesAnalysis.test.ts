/**
 * Venda de Ativos › Análise — plano docs/planos/2026-10-27-vendas-aba-analise.md.
 *
 * Trava as duas coisas que fazem a aba confiável: a regra de "vendida"
 * escolhida pelo usuário (com contrato) e a PARTIÇÃO — linhas somam o total,
 * rodapé sem busca = topo.
 */
import { describe, it, expect } from 'vitest';
import {
    groupSalesAnalysis,
    summarizeSalesRows,
    groupSalesByClientType,
    saleDealStage,
    receivableSchedule,
    SEM_EMPREENDIMENTO,
    type SaleProperty,
    type SaleDeal,
} from '../lib/salesAnalysis';

const AGORA = new Date(2026, 9, 27); // 27/10/2026

const predio = (id: string): SaleProperty => ({ id, type: 'BUILDING', name: id });
const und = (id: string, parent: string, status: string, price: number, extra: Partial<SaleProperty> = {}): SaleProperty => ({
    id, parent_id: parent, status, price, private_area: 50, name: `Apto ${id}`, block: 'A', floor: 1, ...extra,
});

const properties: SaleProperty[] = [
    predio('p1'), predio('p2'),
    und('101', 'p1', 'RESERVED', 500_000),   // negociação em Contrato → vendida
    und('102', 'p1', 'RESERVED', 400_000),   // negociação em Reserva → reservada
    und('103', 'p1', 'AVAILABLE', 450_000),
    und('104', 'p1', 'SOLD', 300_000),       // vendida sem negociação (legado)
    und('105', 'p1', 'EXCHANGED', 350_000),  // permutada — fora da base vendável
    und('201', 'p2', 'RESERVED', 1_000_000), // Assinatura → vendida
    und('202', 'p2', 'AVAILABLE', 0),        // sem preço
    { id: 'avulso', status: 'AVAILABLE', price: 200_000, name: 'Lote 9' }, // sem empreendimento
];

const deals: SaleDeal[] = [
    { id: 'd1', type: 'SALE', status: 'CONTRATO', property_id: '101', value: 480_000, date: '2026-09-15', client_id: 'c1' },
    { id: 'd2', type: 'SALE', status: 'RESERVA', property_id: '102', value: 390_000, date: '2026-10-01', client_id: 'c2' },
    { id: 'd3', type: 'SALE', status: 'ASSINATURA', property_id: '201', value: 1_000_000, date: '2025-01-10', client_id: 'c1' },
    { id: 'd4', type: 'SALE', status: 'CANCELLED', property_id: '103', value: 440_000, date: '2026-08-01' },
];

const emp = { p1: { id: 'e1', name: 'Garden' }, p2: { id: 'e2', name: 'Torre Sul' } };

const contracts = [
    { id: 'k1', deal_id: 'd1', status: 'Ativo' },
    { id: 'k3', deal_id: 'd3', status: 'Ativo' },
];
const receivablesByContract = new Map([
    ['k1', [
        { amount: 100_000, due_date: '2026-06-01', settled: false },   // > 90 dias
        { amount: 50_000, due_date: '2026-10-10', settled: false },    // 1–30
        { amount: 80_000, due_date: '2026-11-20', settled: false },    // a vencer
        { amount: 30_000, due_date: '2026-05-01', settled: true },
    ]],
    ['k3', [{ amount: 200_000, due_date: '2027-02-01', settled: false }]],
]);

const montar = (comContratos = true) => groupSalesAnalysis({
    properties,
    deals,
    empreendimentoByProperty: emp,
    contracts: comContratos ? contracts : null,
    receivablesByContract: comContratos ? receivablesByContract : null,
    now: AGORA,
});

describe('saleDealStage — "vendida = com contrato"', () => {
    it('Contrato, Assinatura e Concluído são venda; Proposta/Aprovação/Reserva não', () => {
        expect(['CONTRATO', 'ASSINATURA', 'COMPLETED'].map(saleDealStage)).toEqual(['sold', 'sold', 'sold']);
        expect(['IN_NEGOTIATION', 'PENDING', 'RESERVA', 'WAITING_PAYMENT', null].map(saleDealStage))
            .toEqual(['open', 'open', 'open', 'open', 'open']);
        expect(saleDealStage('CANCELLED')).toBe('cancelled');
    });
});

describe('groupSalesAnalysis', () => {
    const { rows, byId, total } = montar();

    it('status derivado: contrato vende, SOLD legado vende, permuta sai da base', () => {
        const g = byId.get('e1')!;
        expect(g.unitStatus).toMatchObject({ sold: 2, reserved: 1, available: 1, exchanged: 1, total: 5 });
        expect(g.sellableCount).toBe(4);
        expect(g.soldRate).toBe(0.5);
        // a negociação cancelada não ocupa a 103
        expect(g.units.find(u => u.id === '103')!.status).toBe('available');
    });

    it('SOLD sem negociação conta como vendida mas fica fora do VGV, com contagem para o aviso', () => {
        const g = byId.get('e1')!;
        expect(g.vgvSold).toBe(480_000);
        expect(g.soldWithoutDeal).toBe(1);
        // VGV a vender = tabela das reservadas + disponíveis (102 + 103)
        expect(g.vgvUnsold).toBe(850_000);
        expect(g.vgvTotal).toBe(1_330_000);
    });

    it('unidade sem preço fica fora do VGV a vender e é contada', () => {
        const s = byId.get('e2')!;
        expect(s.unsoldWithoutPrice).toBe(1);
        expect(s.vgvUnsold).toBe(0);
    });

    it('imóvel sem vínculo cai em "Sem empreendimento", por último', () => {
        expect(rows[rows.length - 1].empreendimentoId).toBe(SEM_EMPREENDIMENTO);
    });

    it('PARTIÇÃO: as somáveis das linhas fecham com o total', () => {
        const soma = (f: (r: typeof total) => number) => rows.reduce((a, r) => a + f(r), 0);
        expect(soma(r => r.unitsCount)).toBe(total.unitsCount);
        expect(soma(r => r.soldCount)).toBe(total.soldCount);
        expect(soma(r => r.vgvSold)).toBe(total.vgvSold);
        expect(soma(r => r.vgvUnsold)).toBe(total.vgvUnsold);
        expect(soma(r => r.openDealsValue)).toBe(total.openDealsValue);
        expect(soma(r => r.aging!.totalOpen)).toBe(total.aging!.totalOpen);
        expect(soma(r => r.aging!.over90)).toBe(total.aging!.over90);
    });

    it('rodapé sem busca = topo (médias ponderadas, não simples)', () => {
        const f = summarizeSalesRows(rows);
        expect(f.soldRate).toBeCloseTo(total.soldRate!, 10);
        expect(f.vgvSoldRate).toBeCloseTo(total.vgvSoldRate!, 10);
        expect(f.discountRate).toBeCloseTo(total.discount.rate!, 10);
        expect(f.valuePerSqmAvg).toBeCloseTo(total.valuePerSqm.avg!, 10);
        expect(f.receivableOpen).toBe(total.aging!.totalOpen);
        expect(f.ticket).toBeCloseTo(total.ticket!, 10);
    });

    it('desconto é agregado: Σ venda ÷ Σ tabela − 1', () => {
        // d1 480k/500k e d3 1M/1M → 1,48M / 1,5M − 1
        expect(total.discount.rate).toBeCloseTo(1_480_000 / 1_500_000 - 1, 10);
        expect(total.discount.count).toBe(2);
    });

    it('funil tem todas as etapas, cancelada fora', () => {
        expect(total.funnel.map(e => e.label)).toEqual(['Proposta', 'Aprovação', 'Reserva', 'Contrato', 'Assinatura', 'Concluído']);
        expect(total.funnel.find(e => e.status === 'RESERVA')!.value).toBe(390_000);
        expect(total.cancelledCount).toBe(1);
        expect(total.openDealsCount).toBe(1);
    });

    it('velocidade: 90 dias e 12 meses pela data da negociação', () => {
        expect(total.sales90).toEqual({ count: 1, value: 480_000 }); // d3 é de 2025
        expect(total.salesByMonth).toHaveLength(12);
        expect(total.salesByMonth[11].month).toBe('2026-10');
        expect(total.salesByMonth.find(m => m.month === '2026-09')!.value).toBe(480_000);
    });

    it('cobrança por contrato chega ao balde e à unidade', () => {
        const g = byId.get('e1')!;
        expect(g.aging!.over90).toBe(100_000);
        expect(g.aging!.totalOverdue).toBe(150_000);
        expect(g.collection!.received).toBe(30_000);
        const u101 = g.units.find(u => u.id === '101')!;
        expect(u101.overdue).toBe(150_000);
        expect(u101.overdue90).toBe(100_000);
        expect(u101.receivedRatio).toBeCloseTo(30_000 / 480_000, 10);
        expect(u101.stageLabel).toBe('Contrato');
    });

    it('sem contratos carregados, cobrança é "não medido" (null), nunca zero', () => {
        const semK = montar(false);
        expect(semK.total.aging).toBeNull();
        expect(semK.total.collection).toBeNull();
        expect(semK.total.contractsCount).toBeNull();
        expect(semK.total.units.every(u => u.receivedRatio === null)).toBe(true);
        expect(summarizeSalesRows(semK.rows).receivableOpen).toBeNull();
    });

    it('sem unidade vendável, % vendido é null — não 0%', () => {
        const so = groupSalesAnalysis({ properties: [und('x', 'p9', 'EXCHANGED', 1)], deals: [], empreendimentoByProperty: {}, now: AGORA });
        expect(so.total.soldRate).toBeNull();
        expect(so.total.ticket).toBeNull();
    });
});

describe('negociação de várias unidades', () => {
    it('cada unidade recebe a SUA parte do valor (rateio pela tabela), não o valor cheio', () => {
        const r = groupSalesAnalysis({
            properties: [predio('p'), und('a', 'p', 'RESERVED', 300_000), und('b', 'p', 'RESERVED', 100_000)],
            deals: [{ id: 'm', status: 'CONTRATO', property_id: 'a', units: [{ property_id: 'a' }, { property_id: 'b' }], value: 360_000 }],
            empreendimentoByProperty: {},
            now: AGORA,
        });
        const [a, b] = ['a', 'b'].map(id => r.total.units.find(u => u.id === id)!);
        expect(a.dealValue + b.dealValue).toBeCloseTo(360_000, 6);
        expect(a.dealValue).toBeCloseTo(270_000, 6);
        expect(a.dealUnits).toBe(2);
        expect(r.total.soldCount).toBe(2);
        expect(r.total.soldDealsCount).toBe(1);
    });
});

describe('receivableSchedule', () => {
    it('só o que vence de hoje em diante, por mês; vencido fica no aging', () => {
        const s = receivableSchedule(receivablesByContract.get('k1')!, AGORA);
        expect(s.months[0].month).toBe('2026-10');
        expect(s.months.find(m => m.month === '2026-11')!.value).toBe(80_000);
        expect(s.within30.value).toBe(80_000);
        expect(s.months.reduce((a, m) => a + m.value, 0)).toBe(80_000);
    });
});

describe('groupSalesByClientType', () => {
    it('só vendas, por categoria; sem categoria por último', () => {
        const r = groupSalesByClientType({
            deals,
            properties,
            clients: [{ id: 'c1', category: 'Investidor' }, { id: 'c2', category: 'Morador' }],
        });
        expect(r.rows.map(x => x.label)).toEqual(['Investidor']);
        expect(r.rows[0]).toMatchObject({ clientCount: 1, salesCount: 2, vgv: 1_480_000 });
        expect(r.total.salesCount).toBe(2);
    });
});
