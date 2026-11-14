/**
 * O que veio das abas Resultados e Simulação para a Análise de Venda de Ativos
 * (plano docs/planos/2026-11-14-venda-de-ativos-unidades-analise-contrato-tabela.md,
 * item 7): ranking de corretores, origem das vendas e a projeção de esgotamento.
 */
import { describe, it, expect } from 'vitest';
import {
    brokersOfDeals,
    originsOfDeals,
    projecaoDeEsgotamento,
    SEM_CORRETOR_LABEL,
    ORIGEM_NAO_INFORMADA,
    type SaleDeal,
} from '../lib/salesAnalysis';

const deal = (over: Partial<SaleDeal>): SaleDeal => ({ id: Math.random().toString(36).slice(2), type: 'SALE', value: 100, ...over });

describe('brokersOfDeals', () => {
    const deals = [
        deal({ broker_id: 'b1', broker_name: 'Ana', status: 'CONTRATO', value: 500 }),
        deal({ broker_id: 'b1', broker_name: 'Ana', status: 'PENDING', value: 300 }),
        deal({ broker_id: 'b2', broker_name: 'Bruno', status: 'ASSINATURA', value: 900 }),
        deal({ broker_id: 'b3', broker_name: 'Carla', status: 'CANCELLED', value: 999 }),
        deal({ status: 'CONTRATO', value: 5000 }),
    ];
    const r = brokersOfDeals(deals);

    it('ordena pelo VGV vendido e deixa "Sem corretor" por último, mesmo vendendo mais', () => {
        expect(r.map(b => b.name)).toEqual(['Bruno', 'Ana', SEM_CORRETOR_LABEL]);
    });

    it('conta negociações, vendidas, VGV vendido e o valor em aberto', () => {
        expect(r[1]).toMatchObject({ brokerId: 'b1', deals: 2, sold: 1, vgvSold: 500, openValue: 300 });
    });

    it('negociação cancelada não entra (ela é o "Distratos")', () => {
        expect(r.some(b => b.brokerId === 'b3')).toBe(false);
    });
});

describe('originsOfDeals', () => {
    it('agrupa pelo canal, sem canal vira "Não informado" e vai por último', () => {
        const r = originsOfDeals([
            deal({ origin_channel: 'Direto', status: 'CONTRATO', value: 100 }),
            deal({ origin_channel: null, status: 'PENDING', value: 50 }),
            deal({ origin_channel: ' ', status: 'PENDING', value: 50 }),
            deal({ origin_channel: 'Imobiliária / Corretor', status: 'PENDING', value: 10 }),
            deal({ origin_channel: 'Imobiliária / Corretor', status: 'RESERVA', value: 20 }),
            deal({ origin_channel: 'Direto', status: 'CANCELLED', value: 999 }),
        ]);
        expect(r).toEqual([
            { label: 'Imobiliária / Corretor', deals: 2, sold: 0, value: 30 },
            { label: 'Direto', deals: 1, sold: 1, value: 100 },
            { label: ORIGEM_NAO_INFORMADA, deals: 2, sold: 0, value: 100 },
        ]);
    });
});

describe('projecaoDeEsgotamento', () => {
    const meses = (contagens: number[]) => contagens.map((count, i) => ({ month: `2026-${String(i + 1).padStart(2, '0')}`, label: '', count, value: 0 }));
    const scope = {
        unitStatus: { sold: 10, reserved: 2, available: 7, exchanged: 4, other: 1, total: 24 },
        vgvSold: 1_000_000,
        vgvUnsold: 500_000,
        salesByMonth: meses([1, 0, 2, 0, 0, 3, 0, 0, 0, 0, 0, 0]),
    };
    const agora = new Date(2026, 10, 14);

    it('divide só o estoque que falta (sem vendidas nem permutadas)', () => {
        const p = projecaoDeEsgotamento(scope, 2, 0, agora);
        expect(p.estoque).toBe(10);
        expect(p.meses).toBe(5);
        expect(p.mesDoFim).toBe('2027-04');
    });

    it('a velocidade real é a média de vendas dos últimos 12 meses', () => {
        expect(projecaoDeEsgotamento(scope, 1, 0, agora).velocidadeReal).toBe(0.5);
    });

    it('o ajuste de preço vale só sobre o VGV a vender', () => {
        const p = projecaoDeEsgotamento(scope, 1, 10, agora);
        expect(p.vgvAVender).toBeCloseTo(550_000);
        expect(p.vgvProjetado).toBeCloseTo(1_550_000);
    });

    it('sem velocidade ou sem estoque não há prazo', () => {
        expect(projecaoDeEsgotamento(scope, 0, 0, agora).meses).toBeNull();
        const vendido = { ...scope, unitStatus: { ...scope.unitStatus, reserved: 0, available: 0, other: 0 } };
        expect(projecaoDeEsgotamento(vendido, 2, 0, agora)).toMatchObject({ estoque: 0, meses: null, mesDoFim: null });
    });
});
