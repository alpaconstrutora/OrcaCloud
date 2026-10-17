import { describe, it, expect } from 'vitest';
import {
    agruparParcelasPorContrato, resumoFinanceiroParceiro, situacaoExibida, SEM_CONTRATO, ParcelaParceiro,
} from '../components/partner/PartnerPortalFinanceiro';

const HOJE = new Date(2026, 8, 30, 10, 0, 0); // 30/09/2026

const parcela = (id: string, data: string, amount: number, status = 'PENDING', business_status: string | null = null): ParcelaParceiro =>
    ({ id, transaction_date: data, amount, description: id, status, business_status });

describe('Portal do Parceiro › Financeiro — situação e KPIs', () => {
    it('aberta com vencimento antes de hoje é VENCIDA; hoje ainda é ABERTA', () => {
        expect(situacaoExibida(parcela('a', '2026-09-29', 1), HOJE)).toBe('VENCIDA');
        expect(situacaoExibida(parcela('b', '2026-09-30', 1), HOJE)).toBe('ABERTA');
        expect(situacaoExibida(parcela('c', '2026-10-15', 1), HOJE)).toBe('ABERTA');
    });

    it('paga e cancelada nunca viram vencida, mesmo com data passada', () => {
        expect(situacaoExibida(parcela('p', '2026-01-01', 1, 'CONCILIATED'), HOJE)).toBe('PAGA');
        expect(situacaoExibida(parcela('x', '2026-01-01', 1, 'CANCELLED'), HOJE)).toBe('CANCELADA');
    });

    it('resumo: em aberto inclui vencido; cancelada não entra em nada; próximo = aberta mais antiga', () => {
        const r = resumoFinanceiroParceiro([
            parcela('v1', '2026-09-01', 100),
            parcela('v2', '2026-09-20', 50),
            parcela('f1', '2026-10-10', 200),
            parcela('pg', '2026-08-01', 300, 'CONCILIATED'),
            parcela('cx', '2026-09-05', 999, 'CANCELLED'),
        ], HOJE);
        expect(r.emAberto).toBe(350);
        expect(r.vencido).toBe(150);
        expect(r.recebido).toBe(300);
        expect(r.total).toBe(650); // em aberto + recebido; a cancelada fica de fora
        expect(r.proximoVencimento?.id).toBe('v1');
    });

    it('sem parcela aberta não há próximo vencimento', () => {
        expect(resumoFinanceiroParceiro([], HOJE).proximoVencimento).toBeNull();
    });
});

describe('Portal do Parceiro › Financeiro — um cartão por contrato', () => {
    const doContrato = (contract_id: string | null, id: string, data: string, amount: number, status = 'PENDING'): ParcelaParceiro =>
        ({ ...parcela(id, data, amount, status), contract_id });
    const CONTRATOS = [
        { id: 'c1', number: 'CTS-1', title: 'Faxina' },
        { id: 'c2', number: 'CTS-2', title: null },
        { id: 'c3', number: 'CTS-3', title: 'Sem parcela' },
    ];

    it('agrupa pelo contract_id na ordem dos contratos, ordena por vencimento e pula contrato sem parcela', () => {
        const g = agruparParcelasPorContrato([
            doContrato('c2', 'b1', '2026-10-10', 10),
            doContrato('c1', 'a2', '2026-11-10', 20),
            doContrato('c1', 'a1', '2026-10-10', 30),
        ], CONTRATOS, HOJE);
        expect(g.map(x => x.id)).toEqual(['c1', 'c2']);
        expect(g[0].linhas.map(l => l.p.id)).toEqual(['a1', 'a2']);
        expect(g[0].total).toBe(50);
        expect(g[0].proximoVencimento).toBe('2026-10-10');
    });

    it('situação do contrato: Em atraso ganha de Em dia; tudo pago = Quitado; tudo cancelado = Cancelado', () => {
        const g = agruparParcelasPorContrato([
            doContrato('c1', 'v', '2026-09-01', 100),               // vencida
            doContrato('c1', 'f', '2026-10-20', 100),               // a vencer
            doContrato('c1', 'p', '2026-08-01', 100, 'CONCILIATED'),
            doContrato('c2', 'p2', '2026-08-01', 70, 'CONCILIATED'),
            doContrato('c2', 'x2', '2026-09-01', 999, 'CANCELLED'),
            doContrato('c3', 'x3', '2026-09-01', 5, 'CANCELLED'),
        ], CONTRATOS, HOJE);
        const porId = Object.fromEntries(g.map(x => [x.id, x]));
        expect(porId.c1.situacao).toBe('EM_ATRASO');
        expect(porId.c1).toMatchObject({ total: 300, recebido: 100, pagas: 1, vencidas: 1, proximoVencimento: '2026-09-01' });
        expect(porId.c2.situacao).toBe('QUITADO');
        expect(porId.c2.total).toBe(70); // cancelada não soma
        expect(porId.c3.situacao).toBe('CANCELADO');
        expect(agruparParcelasPorContrato([doContrato('c1', 'f', '2026-10-20', 1)], CONTRATOS, HOJE)[0].situacao).toBe('EM_DIA');
    });

    it('parcela sem contrato (ou de contrato fora da lista) vai para "Outras parcelas", no fim', () => {
        const g = agruparParcelasPorContrato([
            doContrato(null, 's1', '2026-10-01', 1),
            doContrato('zz', 's2', '2026-10-02', 1),
            doContrato('c1', 'a', '2026-10-03', 1),
        ], CONTRATOS, HOJE);
        expect(g.map(x => x.id)).toEqual(['c1', SEM_CONTRATO]);
        expect(g[1].numero).toBe('Outras parcelas');
        expect(g[1].linhas.map(l => l.p.id)).toEqual(['s1', 's2']);
    });
});
