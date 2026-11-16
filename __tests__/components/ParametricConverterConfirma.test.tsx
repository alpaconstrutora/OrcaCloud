// @vitest-environment jsdom
/**
 * Orçamento paramétrico › "Converter para Analítico": confirmação pelo diálogo do app (`useConfirm`,
 * guia §14), não pelo `window.confirm()` nativo. Pedido de 16/11/2026 (alertas antigos do
 * check-ui-standard.sh). A conversão SUBSTITUI o orçamento existente: cancelar não pode converter.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(async () => ({ data: [], error: null })) } }));
vi.mock('../../services/parametricService', async (original) => {
    const real = (await original()) as { parametricService: Record<string, unknown> };
    return {
        parametricService: {
            ...real.parametricService,
            calculateTotalEstimatedValueAsync: vi.fn(async () => 1_000_000),
            generateParametricBudgetAsync: vi.fn(async () => []),
            getHistoricalCubDataAsync: vi.fn(async () => []),
            getRegionalComparisonDataAsync: vi.fn(async () => []),
            getMixComparisonAsync: vi.fn(async () => null),
        },
    };
});

import ParametricEstimator from '../../components/ParametricEstimator';
import { ConfirmProvider } from '../../components/ui/confirm';

const SETTINGS = { id: 'p1', name: 'Obra', area: 1000, standard: 'R8-N', location: 'MS', bdi: 25, kFactor: 1 } as never;

function abrir() {
    const onUpdateBudget = vi.fn();
    const onNavigate = vi.fn();
    render(
        <ConfirmProvider>
            <ParametricEstimator settings={SETTINGS} onUpdateBudget={onUpdateBudget} onUpdateSettings={vi.fn()} onNavigate={onNavigate} />
        </ConfirmProvider>,
    );
    return { onUpdateBudget, onNavigate };
}

describe('Paramétrico › converter para analítico', () => {
    beforeEach(() => vi.clearAllMocks());

    it('pergunta no diálogo do app (nunca no nativo) e cancelar não converte', async () => {
        const nativo = vi.spyOn(window, 'confirm');
        const { onUpdateBudget } = abrir();
        fireEvent.click(await screen.findByRole('button', { name: /Converter para Analítico/ }));
        expect(await screen.findByText('Converter a estimativa financeira em orçamento analítico?')).toBeTruthy();
        expect(screen.getByText(/substitui qualquer orçamento existente/)).toBeTruthy();
        expect(nativo).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
        await waitFor(() => expect(screen.queryByText('Converter a estimativa financeira em orçamento analítico?')).toBeNull());
        expect(onUpdateBudget).not.toHaveBeenCalled();
    });

    it('confirmar converte e leva ao orçamento analítico', async () => {
        const { onUpdateBudget, onNavigate } = abrir();
        fireEvent.click(await screen.findByRole('button', { name: /Converter para Analítico/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Converter' }));
        await waitFor(() => expect(onUpdateBudget).toHaveBeenCalled());
        expect(onNavigate).toHaveBeenCalledWith('analytic');
    });
});
