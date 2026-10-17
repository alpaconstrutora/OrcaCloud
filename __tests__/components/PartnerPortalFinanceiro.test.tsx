// @vitest-environment jsdom
/**
 * Portal do Parceiro › Financeiro no desenho das Comissões do Corretor (17/10/2026).
 * Plano: docs/planos/2026-10-17-parceiro-financeiro-visual-corretor.md (item 5).
 *   - um cartão por contrato; com um contrato só, ele já nasce aberto e fecha no clique;
 *   - o chip filtra as parcelas dentro do cartão;
 *   - o recibo da parcela paga chama onBaixarRecibo(id);
 *   - "Anexar NF" não existe na prévia do gestor.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), functions: { invoke: vi.fn() } } }));

import PartnerPortalFinanceiro, { type FinanceiroParceiro } from '../../components/partner/PartnerPortalFinanceiro';

const FIN: FinanceiroParceiro = {
    contracts: [{ id: 'c1', number: 'CTS-010-036-0001', title: 'Serviço de Faxina' }],
    installments: [
        { id: 'p1', contract_id: 'c1', transaction_date: '2021-08-10', amount: 600, description: 'Parcela paga', status: 'CONCILIATED', business_status: 'PAGO', recibo_numero: 1 },
        { id: 'p2', contract_id: 'c1', transaction_date: '2022-02-10', amount: 600, description: 'Parcela vencida', status: 'PENDING', business_status: null },
        { id: 'p3', contract_id: 'c1', transaction_date: '2099-01-10', amount: 600, description: 'Parcela futura', status: 'PENDING', business_status: null },
    ],
    measurements: [{
        id: 'm1', contract_id: 'c1', number: 3, period_start: '2026-09-01', period_end: '2026-09-30', status: 'Aprovada',
        total_value: 1000, retention_value: 50, net_value: 950, invoice_url: null,
    }],
    retention: { retained: 50, released: 0, balance: 50 },
};

const renderizar = (over: Partial<React.ComponentProps<typeof PartnerPortalFinanceiro>> = {}) => {
    const onBaixarRecibo = vi.fn();
    render(
        <PartnerPortalFinanceiro
            financials={FIN} loading={false} invoiceUploadError={null} erroRecibo={null}
            baixandoRecibo={null} onBaixarRecibo={onBaixarRecibo} uploadingInvoiceFor={null}
            isPreview={false} onUploadInvoice={vi.fn()}
            {...over}
        />,
    );
    return { onBaixarRecibo };
};

describe('PartnerPortalFinanceiro', () => {
    it('contrato único nasce aberto, mostra as parcelas e fecha no clique', () => {
        renderizar();
        const cartao = screen.getByRole('button', { name: /CTS-010-036-0001/ });
        expect(cartao).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('Parcela vencida')).toBeInTheDocument();
        expect(screen.getByText('Em atraso')).toBeInTheDocument();
        fireEvent.click(cartao);
        expect(cartao).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByText('Parcela vencida')).toBeNull();
    });

    it('chip "Pagas" deixa só a parcela paga dentro do cartão', () => {
        renderizar();
        fireEvent.click(screen.getByRole('button', { name: 'Pagas (1)' }));
        expect(screen.getByText('Parcela paga')).toBeInTheDocument();
        expect(screen.queryByText('Parcela vencida')).toBeNull();
        expect(screen.queryByText('Parcela futura')).toBeNull();
        expect(screen.getByText('Parcelas pagas (1)')).toBeInTheDocument();
    });

    it('recibo da parcela paga chama onBaixarRecibo com o id da parcela', () => {
        const { onBaixarRecibo } = renderizar();
        fireEvent.click(screen.getByRole('button', { name: 'Nº 000001' }));
        expect(onBaixarRecibo).toHaveBeenCalledWith('p1');
    });

    it('"Anexar NF" aparece no acesso real do parceiro', () => {
        renderizar();
        expect(screen.getByLabelText('Anexar NF da medição 3')).toBeInTheDocument();
    });

    it('prévia do gestor não oferece anexar NF', () => {
        renderizar({ isPreview: true });
        expect(screen.queryByLabelText('Anexar NF da medição 3')).toBeNull();
        expect(screen.getByText(/Medição Nº 3/)).toBeInTheDocument();
    });
});
