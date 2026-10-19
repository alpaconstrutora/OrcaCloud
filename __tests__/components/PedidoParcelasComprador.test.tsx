// @vitest-environment jsdom
/**
 * Pedido › aba Financeiro (comprador): parcelas no Contas a Pagar (19/10/2026).
 * Plano: docs/planos/2026-10-19-pedido-financeiro-parcelas.md
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
vi.mock('../../services/pedidoFinanceiroService', async (orig) => {
    const real = await orig<typeof import('../../services/pedidoFinanceiroService')>();
    return { ...real, pedidoFinanceiroService: { ...real.pedidoFinanceiroService, get: (...a: unknown[]) => get(...a) } };
});

import PedidoParcelasComprador from '../../components/PedidoParcelasComprador';

const parcela = (n: number, status: string, amount: number, extra: Record<string, unknown> = {}) => ({
    id: `p${n}`, numero: n, totalParcelas: 3, dueDate: `2026-1${n}-10`, amount, status, ...extra,
});

describe('PedidoParcelasComprador', () => {
    beforeEach(() => { get.mockReset(); localStorage.clear(); });

    it('lista as parcelas do pedido com status e totais (pago / em aberto / vencido)', async () => {
        get.mockResolvedValue({
            condicoes: {},
            parcelas: [
                parcela(1, 'PAGO', 250, { paymentDate: '2026-11-09' }),
                parcela(2, 'VENCIDO', 250),
                parcela(3, 'PREVISTO', 253.1),
            ],
        });
        render(<PedidoParcelasComprador orderId="o1" />);
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
        render(<PedidoParcelasComprador orderId="o1" />);
        await waitFor(() => expect(screen.getByText('Parcelas ainda não geradas')).toBeTruthy());
        expect(screen.queryByText(/^Total /)).toBeNull();
    });

    it('erro na leitura vira aviso — não "parcelas não geradas"', async () => {
        get.mockRejectedValue(new Error('boom'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        render(<PedidoParcelasComprador orderId="o1" />);
        await waitFor(() => expect(screen.getByText(/Não foi possível carregar as parcelas/)).toBeTruthy());
        expect(screen.queryByText('Parcelas ainda não geradas')).toBeNull();
    });
});
