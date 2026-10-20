// @vitest-environment jsdom
/**
 * Pedido › aba Financeiro (comprador): parcelas no Contas a Pagar (19/10/2026).
 * Plano: docs/planos/2026-10-19-pedido-financeiro-parcelas.md
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
vi.mock('../../services/pedidoFinanceiroService', async (orig) => {
    const real = await orig<typeof import('../../services/pedidoFinanceiroService')>();
    return { ...real, pedidoFinanceiroService: { ...real.pedidoFinanceiroService, get: (...a: unknown[]) => get(...a) } };
});

const sync = vi.fn();
vi.mock('../../services/financialService', () => ({
    financialService: { syncOrderToFinance: (...a: unknown[]) => sync(...a) },
}));
let confirmou = true;
const confirmFn = vi.fn(async () => confirmou);
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => confirmFn }));

import PedidoParcelasComprador from '../../components/PedidoParcelasComprador';
import type { PurchaseOrder } from '../../types';

const pedido = (status: string) => ({
    id: 'o1', number: 'PCO-1', status, items: [{ total: 700 }, { total: 53.1 }],
    paymentTermType: 'Vista', paymentDays: 30, actualDeliveryDate: '2026-10-19',
}) as unknown as PurchaseOrder;

const parcela = (n: number, status: string, amount: number, extra: Record<string, unknown> = {}) => ({
    id: `p${n}`, numero: n, totalParcelas: 3, dueDate: `2026-1${n}-10`, amount, status, ...extra,
});

describe('PedidoParcelasComprador', () => {
    beforeEach(() => { get.mockReset(); sync.mockReset(); confirmFn.mockClear(); confirmou = true; localStorage.clear(); });

    it('lista as parcelas do pedido com status e totais (pago / em aberto / vencido)', async () => {
        get.mockResolvedValue({
            condicoes: {},
            parcelas: [
                parcela(1, 'PAGO', 250, { paymentDate: '2026-11-09' }),
                parcela(2, 'VENCIDO', 250),
                parcela(3, 'PREVISTO', 253.1),
            ],
        });
        render(<PedidoParcelasComprador pedido={pedido('Recebido')} />);
        await waitFor(() => expect(screen.getByText('1/3')).toBeTruthy());
        expect(get).toHaveBeenCalledWith('o1');
        expect(screen.getByText('2/3')).toBeTruthy();
        expect(screen.getByText('Pago')).toBeTruthy();
        expect(screen.getByText('Vencido')).toBeTruthy();
        expect(screen.getByText('Pendente')).toBeTruthy();
        const rodape = screen.getByText(/^Total /).closest('td')!;
        expect(rodape.textContent).toMatch(/Total R\$\s?753,10/);
        expect(rodape.textContent).toMatch(/Pago R\$\s?250,00/);
        expect(rodape.textContent).toMatch(/Em aberto R\$\s?503,10/);
        expect(rodape.textContent).toMatch(/Vencido R\$\s?250,00/);
    });

    it('sem parcelas: estado vazio explica quando elas nascem', async () => {
        get.mockResolvedValue({ condicoes: {}, parcelas: [] });
        render(<PedidoParcelasComprador pedido={pedido('Recebido')} />);
        await waitFor(() => expect(screen.getByText('Parcelas ainda não geradas')).toBeTruthy());
        expect(screen.queryByText(/^Total /)).toBeNull();
    });

    it('erro na leitura vira aviso — não "parcelas não geradas"', async () => {
        get.mockRejectedValue(new Error('boom'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        render(<PedidoParcelasComprador pedido={pedido('Recebido')} />);
        await waitFor(() => expect(screen.getByText(/Não foi possível carregar as parcelas/)).toBeTruthy());
        expect(screen.queryByText('Parcelas ainda não geradas')).toBeNull();
    });
});

describe('PedidoParcelasComprador · Gerar título a pagar (compra sem nota)', () => {
    beforeEach(() => { get.mockReset(); sync.mockReset(); confirmFn.mockClear(); confirmou = true; localStorage.clear(); });

    it('sem parcelas e Recebido: confirma, gera com permitirSemNota e recarrega a tabela', async () => {
        get.mockResolvedValueOnce({ condicoes: {}, parcelas: [] })
           .mockResolvedValueOnce({ condicoes: {}, parcelas: [parcela(1, 'PREVISTO', 753.1)] });
        sync.mockResolvedValue({ gerou: 1 });
        render(<PedidoParcelasComprador pedido={pedido('Recebido')} />);
        const botao = await screen.findByRole('button', { name: /Gerar título a pagar/ });
        fireEvent.click(botao);
        await waitFor(() => expect(sync).toHaveBeenCalledWith('o1', { permitirSemNota: true }));
        const [opcoesDoConfirm] = confirmFn.mock.calls[0] as unknown as [{ message: string }];
        expect(opcoesDoConfirm.message).toMatch(/1 parcela somando R\$\s?753,10/);
        await waitFor(() => expect(screen.getByText('1/3')).toBeTruthy());
        expect(screen.queryByRole('button', { name: /Gerar título a pagar/ })).toBeNull();
    });

    it('cancelar a confirmação não gera nada', async () => {
        get.mockResolvedValue({ condicoes: {}, parcelas: [] });
        confirmou = false;
        render(<PedidoParcelasComprador pedido={pedido('Recebido')} />);
        fireEvent.click(await screen.findByRole('button', { name: /Gerar título a pagar/ }));
        await waitFor(() => expect(confirmFn).toHaveBeenCalled());
        expect(sync).not.toHaveBeenCalled();
    });

    it('antes da entrega: botão desligado, com o motivo à vista', async () => {
        get.mockResolvedValue({ condicoes: {}, parcelas: [] });
        render(<PedidoParcelasComprador pedido={pedido('Confirmado')} />);
        const botao = await screen.findByRole('button', { name: /Gerar título a pagar/ }) as HTMLButtonElement;
        expect(botao.disabled).toBe(true);
        expect(screen.getByText(/Disponível depois da entrega/)).toBeTruthy();
    });

    it('a geração recusada pelo serviço aparece no card', async () => {
        get.mockResolvedValue({ condicoes: {}, parcelas: [] });
        sync.mockResolvedValue({ pulou: 'sem-obra', motivo: 'O pedido não tem obra — as parcelas moram no financeiro da obra.' });
        render(<PedidoParcelasComprador pedido={pedido('Recebido')} />);
        fireEvent.click(await screen.findByRole('button', { name: /Gerar título a pagar/ }));
        await waitFor(() => expect(screen.getByText(/não tem obra/)).toBeTruthy());
    });

    it('com parcelas já geradas, o botão não aparece', async () => {
        get.mockResolvedValue({ condicoes: {}, parcelas: [parcela(1, 'PREVISTO', 10)] });
        render(<PedidoParcelasComprador pedido={pedido('Recebido')} />);
        await waitFor(() => expect(screen.getByText('1/3')).toBeTruthy());
        expect(screen.queryByRole('button', { name: /Gerar título a pagar/ })).toBeNull();
    });
});
