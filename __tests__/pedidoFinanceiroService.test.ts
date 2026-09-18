/**
 * Regras puras da aba Financeiro do Portal do Fornecedor.
 * Pedido de 17/09/2026, docs/planos/2026-09-17-portal-fornecedor-aba-financeiro.md
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: { rpc: async () => ({ data: {}, error: null }) } }));

import {
    mapFinanceiroRow, mapPedidoComFinanceiroRow, resumirParcelas,
    linhasDaAbaFinanceiro, descreverCondicoes,
} from '../services/pedidoFinanceiroService';
import { PAYABLE_STATUS } from '../components/supplier/portal/status';
import type { ParcelaStatus, PedidoComFinanceiro } from '../types';

type Parcelas = PedidoComFinanceiro['financeiro']['parcelas'];

const pedido = (over: Partial<PedidoComFinanceiro> & { parcelas?: Parcelas }): PedidoComFinanceiro => ({
    orderId: over.orderId ?? 'o1',
    number: over.number ?? 'PO-1',
    projectName: 'Garden',
    status: 'Recebido',
    total: over.total ?? 0,
    financeiro: {
        condicoes: { paymentTermType: 'Parcelado', paymentInstallments: 2, paymentDays: 30 },
        parcelas: over.parcelas ?? [],
    },
});
const parcela = (n: number, status: ParcelaStatus, amount: number, dueDate: string) =>
    ({ id: `p${n}`, numero: n, totalParcelas: 3, dueDate, amount, status });

describe('mapFinanceiroRow', () => {
    it('converte snake_case e amount numeric (string) em número', () => {
        const f = mapFinanceiroRow({
            condicoes: { payment_method: 'Boleto', payment_term_type: 'Parcelado', payment_days: 30, payment_installments: 8, notes: null },
            parcelas: [{ id: 'a', numero: 1, total_parcelas: 8, due_date: '2026-04-11', amount: '561.25', payment_date: null, effective_status: 'VENCIDO' }],
        });
        expect(f.condicoes).toEqual({ paymentMethod: 'Boleto', paymentTermType: 'Parcelado', paymentDays: 30, paymentInstallments: 8, notes: undefined });
        expect(f.parcelas[0]).toEqual({ id: 'a', numero: 1, totalParcelas: 8, dueDate: '2026-04-11', amount: 561.25, paymentDate: undefined, status: 'VENCIDO' });
    });

    it('aguenta null/ausente (pedido sem financeiro)', () => {
        expect(mapFinanceiroRow(null).parcelas).toEqual([]);
        expect(mapFinanceiroRow({}).condicoes.paymentTermType).toBeUndefined();
    });

    it('mapPedidoComFinanceiroRow: total numérico e obra "-" quando ausente', () => {
        const p = mapPedidoComFinanceiroRow({ order_id: 'o', number: 'PO-9', status: 'Enviado', total: '74.81', project_name: null, financeiro: null });
        expect(p.total).toBe(74.81);
        expect(p.projectName).toBe('-');
        expect(p.financeiro.parcelas).toEqual([]);
    });
});

describe('resumirParcelas — os KPIs somam parcelas, não o total do pedido', () => {
    it('PAGO 100 / VENCIDO 200 / PREVISTO 300 → recebido 100, em aberto 500, vencido 200', () => {
        const r = resumirParcelas([pedido({ total: 9999, parcelas: [
            parcela(1, 'PAGO', 100, '2026-01-10'),
            parcela(2, 'VENCIDO', 200, '2026-02-10'),
            parcela(3, 'PREVISTO', 300, '2026-12-10'),
        ] })]);
        expect(r.recebido).toBe(100);
        expect(r.emAberto).toBe(500);
        expect(r.vencido).toBe(200);
    });

    it('próximo vencimento = a parcela em aberto de menor data, com o nº do pedido', () => {
        const r = resumirParcelas([
            pedido({ number: 'PO-A', parcelas: [parcela(1, 'PREVISTO', 1, '2026-12-01')] }),
            pedido({ orderId: 'o2', number: 'PO-B', parcelas: [parcela(1, 'VENCIDO', 1, '2026-03-01'), parcela(2, 'PAGO', 1, '2026-01-01')] }),
        ]);
        expect(r.proximoVencimento?.dueDate).toBe('2026-03-01');
        expect(r.proximoVencimento?.pedidoNumber).toBe('PO-B');
    });

    it('CANCELADO não entra em nenhum KPI', () => {
        const r = resumirParcelas([pedido({ parcelas: [parcela(1, 'CANCELADO', 50, '2026-01-01')] })]);
        expect(r).toEqual({ emAberto: 0, vencido: 0, recebido: 0 });
    });
});

describe('linhasDaAbaFinanceiro', () => {
    it('uma linha por parcela, ordenadas por vencimento; pedido sem parcela vira 1 linha no fim', () => {
        const linhas = linhasDaAbaFinanceiro([
            pedido({ orderId: 'sem', number: 'PO-SEM' }),
            pedido({ orderId: 'com', number: 'PO-COM', parcelas: [parcela(2, 'PREVISTO', 1, '2026-06-01'), parcela(1, 'PAGO', 1, '2026-05-01')] }),
        ]);
        expect(linhas.map(l => l.parcela?.dueDate ?? 'SEM')).toEqual(['2026-05-01', '2026-06-01', 'SEM']);
        expect(linhas[2].pedido.number).toBe('PO-SEM');
        expect(linhas[2].parcela).toBeUndefined();
    });
});

describe('descreverCondicoes', () => {
    it('Parcelado 3x · 30 dias / À vista · 28 dias / só o termo sem prazo', () => {
        expect(descreverCondicoes({ paymentTermType: 'Parcelado', paymentInstallments: 3, paymentDays: 30 })).toBe('Parcelado 3x · 30 dias');
        expect(descreverCondicoes({ paymentTermType: 'Vista', paymentDays: 28 })).toBe('À vista · 28 dias');
        expect(descreverCondicoes({})).toBe('À vista');
    });
});

describe('PAYABLE_STATUS cobre todo ParcelaStatus (sem pílula muda)', () => {
    it('cada status tem rótulo e tom', () => {
        const todos: ParcelaStatus[] = ['PAGO', 'VENCIDO', 'PREVISTO', 'APROVADO', 'PARCIAL', 'RENEGOCIADO', 'CANCELADO', 'EMITIDO', 'ENVIADO'];
        todos.forEach(s => {
            expect(PAYABLE_STATUS[s].label.length).toBeGreaterThan(0);
            expect(PAYABLE_STATUS[s].tone).toBeTruthy();
        });
    });
});
