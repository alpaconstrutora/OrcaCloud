// @vitest-environment jsdom
/**
 * Portal do Fornecedor — aba Financeiro (link público) e a casca do app.
 * Pedido de 17/09/2026, docs/planos/2026-09-17-portal-fornecedor-aba-financeiro.md
 *
 * Cobre o que typecheck e `check-ui-standard.sh` não veem:
 *  1. os KPIs somam PARCELAS (não o total do pedido) — recebido/em aberto/vencido;
 *  2. o filtro "Vencidas" conta só o que está vencido;
 *  3. pedido sem parcela vira UMA linha com as condições e "A gerar";
 *  4. clicar no nº do pedido abre o detalhe (`onOpenOrder` com o id);
 *  5. a casca do app (fornecedor logado) busca pela RPC em lote e mostra a
 *     mesma leitura.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { PedidoComFinanceiro, PurchaseOrder, Supplier } from '../../types';

const getFinancials = vi.fn();
const rpc = vi.fn();

vi.mock('../../services/supplierPortalTokenService', () => ({
    supplierPortalTokenService: { getFinancials: (...a: unknown[]) => getFinancials(...a) },
}));
vi.mock('../../lib/supabase', () => ({
    supabase: { rpc: (...a: unknown[]) => rpc(...a) },
}));

import PortalFinanceiro from '../../components/supplier/portal/PortalFinanceiro';
import SupplierFinanceiroTab from '../../components/supplier/SupplierFinanceiroTab';

const SUPPLIER = { id: 'sup1', name: 'MCC' } as Supplier;

const COM_PARCELAS: PedidoComFinanceiro = {
    orderId: 'o1', number: 'PO-551252', projectName: 'Garden', status: 'Recebido', total: 9999,
    financeiro: {
        condicoes: { paymentTermType: 'Parcelado', paymentInstallments: 3, paymentDays: 30 },
        parcelas: [
            { id: 'p1', numero: 1, totalParcelas: 3, dueDate: '2026-01-10', amount: 100, status: 'PAGO' },
            { id: 'p2', numero: 2, totalParcelas: 3, dueDate: '2026-02-10', amount: 200, status: 'VENCIDO' },
            { id: 'p3', numero: 3, totalParcelas: 3, dueDate: '2099-12-10', amount: 300, status: 'PREVISTO' },
        ],
    },
};
const SEM_PARCELAS: PedidoComFinanceiro = {
    orderId: 'o2', number: 'PO-590657', projectName: 'Garden', status: 'Enviado', total: 74.81,
    financeiro: { condicoes: { paymentTermType: 'Parcelado', paymentInstallments: 2, paymentDays: 30 }, parcelas: [] },
};

const ORDERS_APP: PurchaseOrder[] = [
    { id: 'o1', number: 'PO-551252', projectName: 'Garden', status: 'Recebido', supplierId: 'sup1', projectId: 'pr', deliveryDate: '2026-03-10',
      items: [{ code: 'x', description: 'x', unit: 'un', quantity: 1, unitPrice: 9999, total: 9999 }] },
    { id: 'o2', number: 'PO-590657', projectName: 'Garden', status: 'Enviado', supplierId: 'sup1', projectId: 'pr', deliveryDate: '2026-03-10',
      paymentTermType: 'Parcelado', paymentInstallments: 2, paymentDays: 30,
      items: [{ code: 'y', description: 'y', unit: 'un', quantity: 1, unitPrice: 74.81, total: 74.81 }] },
];

// O DOM traz NBSP entre "R$" e o número e o getByText normaliza para espaço; regex tolera os dois.
const brl = (inteiro: string) => new RegExp(`R\\$\\s?${inteiro},00`);

describe('PortalFinanceiro (link público)', () => {
    beforeEach(() => {
        getFinancials.mockReset();
        getFinancials.mockResolvedValue([COM_PARCELAS, SEM_PARCELAS]);
    });

    it('KPIs somam parcelas: recebido 100, em aberto 500, vencido 200', async () => {
        render(<PortalFinanceiro supplier={SUPPLIER} orders={[]} portalToken="tok" onOpenOrder={() => {}} />);
        await waitFor(() => expect(getFinancials).toHaveBeenCalledWith('tok'));
        // fmtBRL do kit não mostra centavos.
        await waitFor(() => expect(screen.getByText('R$ 500')).toBeTruthy());
        expect(screen.getByText('R$ 200')).toBeTruthy();
        expect(screen.getByText('R$ 100')).toBeTruthy();
        // O total do pedido (9999) NÃO entra em KPI nenhum.
        expect(screen.queryByText('R$ 9.999')).toBeNull();
    });

    it('filtro "Vencidas" conta 1 e mostra só a parcela vencida', async () => {
        const user = userEvent.setup();
        render(<PortalFinanceiro supplier={SUPPLIER} orders={[]} portalToken="tok" onOpenOrder={() => {}} />);
        const aba = await screen.findByRole('button', { name: /Vencidas/ });
        expect(aba.textContent).toContain('1');
        await user.click(aba);
        const tabela = screen.getByRole('table');
        expect(within(tabela).getAllByRole('row')).toHaveLength(2); // cabeçalho + 1
        expect(within(tabela).getByText('2/3')).toBeTruthy();
    });

    it('pedido sem parcela vira uma linha com as condições e "A gerar"', async () => {
        render(<PortalFinanceiro supplier={SUPPLIER} orders={[]} portalToken="tok" onOpenOrder={() => {}} />);
        await screen.findByText('Parcelado 2x · 30 dias');
        expect(screen.getByText('A gerar')).toBeTruthy();
        const tabela = screen.getByRole('table');
        // 3 parcelas + 1 pedido sem parcela + cabeçalho
        expect(within(tabela).getAllByRole('row')).toHaveLength(5);
    });

    it('clicar no nº do pedido abre o detalhe com o id', async () => {
        const user = userEvent.setup();
        const onOpenOrder = vi.fn();
        render(<PortalFinanceiro supplier={SUPPLIER} orders={[]} portalToken="tok" onOpenOrder={onOpenOrder} />);
        const botoes = await screen.findAllByRole('button', { name: 'PO-551252' });
        await user.click(botoes[0]);
        expect(onOpenOrder).toHaveBeenCalledWith('o1');
    });
});

describe('SupplierFinanceiroTab (app, fornecedor logado)', () => {
    beforeEach(() => {
        rpc.mockReset();
        rpc.mockResolvedValue({
            data: {
                o1: {
                    condicoes: { payment_term_type: 'Parcelado', payment_installments: 3, payment_days: 30 },
                    parcelas: COM_PARCELAS.financeiro.parcelas.map(p => ({
                        id: p.id, numero: p.numero, total_parcelas: p.totalParcelas, due_date: p.dueDate,
                        amount: String(p.amount), payment_date: null, effective_status: p.status,
                    })),
                },
                // o2 não vem: sem parcelas, condições ficam as do próprio pedido.
            },
            error: null,
        });
    });

    it('busca em lote pela RPC do logado e mostra parcelas + pedido "A gerar"', async () => {
        render(<SupplierFinanceiroTab supplier={SUPPLIER} orders={ORDERS_APP} onOpenOrder={() => {}} />);
        await waitFor(() => expect(rpc).toHaveBeenCalledWith('purchase_orders_financeiro', { p_order_ids: ['o1', 'o2'] }));
        await screen.findByText('2/3');
        expect(screen.getByText('Parcelado 2x · 30 dias')).toBeTruthy();
        expect(screen.getByText('A gerar')).toBeTruthy();
        // KPI em aberto = 500,00 (formatCurrency do app, com centavos)
        expect(screen.getByText(brl('500'))).toBeTruthy();
        // 200,00 aparece no KPI Vencido E na linha da parcela 2/3.
        expect(screen.getAllByText(brl('200'))).toHaveLength(2);
    });
});
