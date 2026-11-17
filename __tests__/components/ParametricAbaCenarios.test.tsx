// @vitest-environment jsdom
/**
 * Orçamento paramétrico › Inteligência de Mercado: a aba "Cenários" existia como painel desde o
 * início, mas sem botão — inalcançável (achado de 16/11/2026, pedido "Corrigir estes pontos").
 * Agora a aba aparece, mostra quantos cenários foram salvos e abre o "Gerenciador de Cenários".
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(async () => ({ data: [], error: null })) } }));
vi.mock('../../services/parametricService', async (original) => {
    const real = (await original()) as { parametricService: Record<string, unknown> };
    return {
        parametricService: {
            ...real.parametricService,
            calculateTotalEstimatedValueAsync: vi.fn(async () => 1_000_000),
            // Com valor: desde 17/11/2026 "Salvar cenário" fica desligado quando o orçamento dá R$ 0,00.
            generateParametricBudgetAsync: vi.fn(async () => [{ id: 'i1', subPhase: '01.01.01 Fundação', sinapiItem: { price: 800_000 } }]),
            getHistoricalCubDataAsync: vi.fn(async () => []),
            getRegionalComparisonDataAsync: vi.fn(async () => []),
            getMixComparisonAsync: vi.fn(async () => null),
        },
    };
});

import ParametricEstimator from '../../components/ParametricEstimator';
import { ConfirmProvider } from '../../components/ui/confirm';

const SETTINGS = { id: 'p1', name: 'Obra', area: 1000, standard: 'R8-N', location: 'MS', bdi: 25, kFactor: 1 } as never;

/** Os cenários moram nas configurações do projeto: o App troca as configurações a cada gravação. */
function Tela() {
    const [settings, setSettings] = React.useState(SETTINGS);
    return (
        <ConfirmProvider>
            <ParametricEstimator settings={settings} onUpdateBudget={vi.fn()} onUpdateSettings={s => setSettings(s as never)} onNavigate={vi.fn()} />
        </ConfirmProvider>
    );
}

describe('Paramétrico › aba Cenários', () => {
    it('a aba existe, conta os cenários salvos e abre o gerenciador', async () => {
        render(<Tela />);
        const salvar = await screen.findByRole('button', { name: /Salvar cenário/i });
        await waitFor(() => expect((salvar as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(salvar);
        fireEvent.click(screen.getByRole('button', { name: 'Inteligência de Mercado' }));
        const aba = screen.getByRole('button', { name: 'Cenários (1)' });
        fireEvent.click(aba);
        expect(await screen.findByText('Gerenciador de Cenários')).toBeTruthy();
        expect(screen.getByText(/Cenário 1 \(R8-N\)/)).toBeTruthy();
    });
});
