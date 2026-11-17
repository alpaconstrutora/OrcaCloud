// @vitest-environment jsdom
/**
 * Mapa de Cotação: fechar compra, aceitar e recusar proposta pedem confirmação pelo diálogo do app
 * (`useConfirm`, guia §14) — antes era um modal feito à mão (`pendingConfirm`), em caixa alta.
 * Pedido de 16/11/2026 ("Corrigir estes pontos"). Cancelar não grava nada.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const { cot } = vi.hoisted(() => ({
    cot: {
        listRequests: vi.fn(),
        listResponses: vi.fn(),
        selectWinner: vi.fn(async () => undefined),
        respondToCounterProposal: vi.fn(async () => undefined),
        sendCounterProposal: vi.fn(async () => undefined),
    },
}));

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(async () => ({ data: [], error: null })) } }));
vi.mock('../../services/quotationService', () => ({ quotationService: cot }));
vi.mock('../../services/projectService', () => ({ projectService: { loadProject: vi.fn(async () => null) } }));
vi.mock('../../services/appSettingsService', () => ({ appSettingsService: { get: () => ({ supplierNameDisplay: 'name' }) } }));
vi.mock('../../services/quotationNumberRegenService', () => ({
    getQuotationNumberLockReason: vi.fn(async () => null),
    regenerateQuotationNumber: vi.fn(),
}));

import SupplyChainQuotationComparison from '../../components/SupplyChainQuotationComparison';
import { ConfirmProvider } from '../../components/ui/confirm';

const ITEM = { code: 'C30', description: 'Concreto', unit: 'm³', quantity: 10 };
const resposta = (id: string, negotiationStatus: string) => ({
    id, requestId: 'req1', supplierId: `s-${id}`, supplierName: `Fornecedor ${id}`, status: 'Enviada', negotiationStatus,
    items: [{ ...ITEM, unitPrice: 500, total: 5000 }],
});

function abrir() {
    const onBack = vi.fn();
    render(
        <ConfirmProvider>
            <SupplyChainQuotationComparison requestId="req1" onBack={onBack} />
        </ConfirmProvider>,
    );
    return onBack;
}

describe('Mapa de Cotação › confirmações pelo diálogo do app', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        cot.listRequests.mockResolvedValue([{ id: 'req1', number: 'COT-1', projectId: '', title: 'Concreto', deadline: '2026-12-01', status: 'Em Análise', items: [ITEM], invitedSupplierIds: [] }]);
        cot.listResponses.mockResolvedValue([resposta('a', 'Original'), resposta('b', 'Nova Proposta')]);
    });

    it('fechar compra: pergunta no diálogo do app (nunca no nativo); cancelar não seleciona', async () => {
        const nativo = vi.spyOn(window, 'confirm');
        abrir();
        fireEvent.click(await screen.findByRole('button', { name: /Fechar Compra/ }));
        expect(await screen.findByText('Selecionar este fornecedor como vencedor?')).toBeTruthy();
        expect(nativo).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
        await waitFor(() => expect(screen.queryByText('Selecionar este fornecedor como vencedor?')).toBeNull());
        expect(cot.selectWinner).not.toHaveBeenCalled();
    });

    it('fechar compra confirmado: seleciona o vencedor e volta', async () => {
        const onBack = abrir();
        fireEvent.click(await screen.findByRole('button', { name: /Fechar Compra/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Fechar compra' }));
        await waitFor(() => expect(cot.selectWinner).toHaveBeenCalledWith('req1', 'a'));
        await waitFor(() => expect(onBack).toHaveBeenCalled());
    });

    it('recusar a proposta do fornecedor pede confirmação e só então responde', async () => {
        abrir();
        fireEvent.click(await screen.findByRole('button', { name: /^Recusar$/ }));
        expect(await screen.findByText('Recusar esta proposta?')).toBeTruthy();
        expect(cot.respondToCounterProposal).not.toHaveBeenCalled();
        const botoes = screen.getAllByRole('button', { name: 'Recusar' });
        fireEvent.click(botoes[botoes.length - 1]);
        await waitFor(() => expect(cot.respondToCounterProposal).toHaveBeenCalledWith('b', false, 'Comprador'));
    });
});
