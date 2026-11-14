/**
 * Contratos de Serviço › Análise — plano docs/planos/2026-11-13-contratos-servico-aba-analise.md.
 *
 * Trava o que faz a aba confiável: a regra de "contratado" escolhida pelo
 * usuário (Aprovado em diante) e a PARTIÇÃO — linhas somam o total, rodapé
 * sem busca = topo, `null` onde não houve medida.
 */
import { describe, it, expect } from 'vitest';
import {
    groupServiceContractsAnalysis,
    summarizeServiceRows,
    serviceContractStage,
    serviceContractSituation,
    SEM_CLIENTE,
    type AnalysisServiceContract,
    type AnalysisMeasurement,
} from '../lib/serviceContractAnalysis';
import type { Receivable } from '../lib/rentalExecutive';

const AGORA = new Date(2026, 10, 13); // 13/11/2026

const contrato = (id: string, client: string | null, status: string, valor: number, extra: Partial<AnalysisServiceContract> = {}): AnalysisServiceContract => ({
    id, client_id: client, status, original_value: valor, current_value: valor,
    start_date: '2026-06-01', end_date: '2027-06-01', number: id, title: `Contrato ${id}`, billing_mode: 'MEDICAO', ...extra,
});

const contracts: AnalysisServiceContract[] = [
    contrato('k1', 'c1', 'Ativo', 120_000, { original_value: 100_000 }),            // aditivo +20%
    contrato('k2', 'c1', 'Minuta', 50_000),                                           // negociação, com parcela
    contrato('k3', 'c2', 'Assinado', 200_000, { end_date: '2026-12-20' }),             // vence em 37 dias
    contrato('k4', 'c2', 'Concluído', 80_000, { start_date: '2025-01-10', end_date: '2025-10-10', billing_mode: 'SINAL_PARCELAS' }),
    contrato('k5', 'c2', 'Cancelado', 999_000),                                       // fora de tudo
    contrato('k6', null, 'Ativo', 30_000, { end_date: '2026-10-01', start_date: null }), // vigência vencida, sem início
    contrato('k7', 'c3', 'Status inventado', 10_000),                                 // desconhecido = negociação
];

const receivables = new Map<string, Receivable[]>([
    ['k1', [
        { amount: 40_000, due_date: '2026-07-01', settled: true },
        { amount: 40_000, due_date: '2026-07-20', settled: false },  // > 90 dias vencida
        { amount: 40_000, due_date: '2026-12-01', settled: false },  // a vencer
    ]],
    ['k2', [{ amount: 50_000, due_date: '2026-11-01', settled: false }]], // negociação com parcela, 12 dias vencida
    ['k4', [{ amount: 100_000, due_date: '2025-05-01', settled: true }]],  // faturado a mais que o valor
    ['k5', [{ amount: 999_000, due_date: '2026-01-01', settled: false }]], // cancelado: fora
]);

const measurements: AnalysisMeasurement[] = [
    { contract_id: 'k1', status: 'Processada', total_value: 30_000 },
    { contract_id: 'k1', status: 'Paga', total_value: 18_000 },
    { contract_id: 'k1', status: 'Pendente', total_value: 12_000 },
    { contract_id: 'k1', status: 'Cancelada', total_value: 7_000 },
    { contract_id: 'k2', status: 'Processada', total_value: 5_000 },      // negociação: não conta
];

const clientNames = new Map([['c1', 'Paróquia Divino'], ['c2', 'Hospital Sul'], ['c3', 'Escola Norte']]);

const run = (over: Partial<Parameters<typeof groupServiceContractsAnalysis>[0]> = {}) =>
    groupServiceContractsAnalysis({ contracts, receivablesByContract: receivables, measurements, clientNames, now: AGORA, ...over });

describe('regra de "contratado" (Aprovado em diante — decisão de 13/11/2026)', () => {
    it('separa contratado, negociação e cancelado', () => {
        for (const s of ['Aprovado', 'Assinado', 'Ativo', 'Suspenso', 'Concluído', 'Encerrado']) expect(serviceContractStage(s)).toBe('contracted');
        for (const s of ['Rascunho', 'Minuta', 'Revisão', 'Enviado']) expect(serviceContractStage(s)).toBe('negotiation');
        expect(serviceContractStage('Cancelado')).toBe('cancelled');
    });
    it('status desconhecido ou vazio NÃO infla a carteira', () => {
        expect(serviceContractStage('Status inventado')).toBe('negotiation');
        expect(serviceContractStage(null)).toBe('negotiation');
        expect(serviceContractSituation('Suspenso')).toBe('vigente');
        expect(serviceContractSituation('Encerrado')).toBe('encerrado');
    });
});

describe('total da carteira', () => {
    const { total } = run();
    it('carteira contratada = vigente + encerrado, sem cancelado', () => {
        expect(total.contractedCount).toBe(4); // k1, k3, k4, k6
        expect(total.contractedValue).toBe(120_000 + 200_000 + 80_000 + 30_000);
        expect(total.negotiationCount).toBe(2); // k2, k7
        expect(total.negotiationValue).toBe(60_000);
        expect(total.cancelledCount).toBe(1);
        expect(total.contractsCount).toBe(7);
    });
    it('variação = vigente − original dos contratados', () => {
        expect(total.variation).toBe(20_000);
        expect(total.variationRate).toBeCloseTo(20_000 / 410_000);
        expect(total.ticket).toBeCloseTo(430_000 / 4);
    });
    it('vigência: vence em 90 dias, vencida e sem início', () => {
        expect(total.active.count).toBe(3); // k1, k3, k6
        expect(total.expiring90).toEqual({ count: 1, value: 200_000 });
        expect(total.expiredActive).toBe(1);
        expect(total.contractedWithoutStart).toBe(1);
    });
    it('medido = só medição aprovada de contratado', () => {
        expect(total.measurement?.measured).toBe(48_000);
        expect(total.measurement?.pending).toEqual({ count: 1, value: 12_000 });
        // Base: contratados faturados por medição (k1, k3, k6) — k4 é parcelado.
        expect(total.measurement?.base).toBe(350_000);
        expect(total.measurement?.rate).toBeCloseTo(48_000 / 350_000);
    });
    it('cobrança inclui negociação com parcela e exclui cancelado', () => {
        expect(total.aging?.billed).toBe(120_000 + 50_000 + 100_000);
        expect(total.aging?.received).toBe(140_000);
        expect(total.aging?.over90).toBe(40_000);
        expect(total.aging?.totalOverdue).toBe(90_000);
        expect(total.negotiationWithReceivables).toBe(1);
    });
    it('saldo a faturar é por contrato e nunca negativo', () => {
        // k1: 120−120 = 0 · k3: 200 · k4: 80−100 → 0 · k6: 30.
        expect(total.toBill).toBe(230_000);
    });
    it('série de início: últimos 12 meses, contratados', () => {
        expect(total.startedByMonth).toHaveLength(12);
        expect(total.startedByMonth[11].month).toBe('2026-11');
        const jun = total.startedByMonth.find(m => m.month === '2026-06');
        expect(jun).toEqual(expect.objectContaining({ count: 2, value: 320_000 })); // k1 + k3
    });
    it('status presentes, na ordem do ciclo de vida', () => {
        expect(total.byStatus.map(s => s.status)).toEqual(['Minuta', 'Assinado', 'Ativo', 'Concluído', 'Cancelado', 'Status inventado']);
    });
});

describe('partição por cliente', () => {
    const { rows, total, byId } = run();
    it('cada contrato em um balde; "Sem cliente" por último', () => {
        expect(rows.map(r => r.clientId)).toEqual(['c2', 'c1', 'c3', SEM_CLIENTE]);
        expect(byId.get('c1')?.name).toBe('Paróquia Divino');
        expect(rows.reduce((a, r) => a + r.contractsCount, 0)).toBe(total.contractsCount);
    });
    it('rodapé sem busca = topo', () => {
        const f = summarizeServiceRows(rows);
        expect(f.contractedValue).toBe(total.contractedValue);
        expect(f.negotiationValue).toBe(total.negotiationValue);
        expect(f.variationRate).toBeCloseTo(total.variationRate!);
        expect(f.measured).toBe(total.measurement!.measured);
        expect(f.measuredRate).toBeCloseTo(total.measurement!.rate!);
        expect(f.toBill).toBe(total.toBill);
        expect(f.receivableOpen).toBe(total.aging!.totalOpen);
        expect(f.overdue90).toBe(total.aging!.over90);
        expect(f.received).toBe(total.aging!.received);
        expect(f.expiring90Count).toBe(total.expiring90.count);
    });
    it('linha do tempo: uma linha por contrato, com medido e atraso', () => {
        expect(total.timeline).toHaveLength(7);
        const k1 = total.timeline.find(t => t.id === 'k1')!;
        expect(k1.measuredRate).toBeCloseTo(48_000 / 120_000);
        expect(k1.overdue).toBe(40_000);
        expect(total.timeline.find(t => t.id === 'k4')!.measuredRate).toBeNull(); // parcelado não mede
        expect(total.timeline.find(t => t.id === 'k3')!.expiring).toBe(true);
        expect(total.timeline.find(t => t.id === 'k6')!.expired).toBe(true);
        expect(total.timeline[total.timeline.length - 1].id).toBe('k6'); // sem início no fim
    });
});

describe('"não medido" nunca vira zero', () => {
    it('sem parcelas: cobrança e saldo a faturar null', () => {
        const { total, rows } = run({ receivablesByContract: null });
        expect(total.aging).toBeNull();
        expect(total.toBill).toBeNull();
        expect(summarizeServiceRows(rows).receivableOpen).toBeNull();
    });
    it('sem medições: medido null', () => {
        const { total, rows } = run({ measurements: null });
        expect(total.measurement).toBeNull();
        expect(total.timeline.find(t => t.id === 'k1')!.measuredRate).toBeNull();
        expect(summarizeServiceRows(rows).measured).toBeNull();
    });
    it('carteira vazia: taxas null', () => {
        const { total, rows } = run({ contracts: [] });
        expect(rows).toHaveLength(0);
        expect(total.variationRate).toBeNull();
        expect(total.ticket).toBeNull();
        expect(total.measurement?.rate).toBeNull();
    });
});
