// @vitest-environment jsdom
/**
 * Simulação de Monte Carlo sem travar a tela (pendência da Fase 3 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 */
import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import ImovibMonteCarloCard from '../../components/ImovibMonteCarloCard';
import { CHOQUES_PADRAO } from '../../utils/imovibSensibilidade';
import { baseStudy } from '../fixtures/imovibEstudos';

const tela = () => {
    const user = userEvent.setup();
    render(<ImovibMonteCarloCard study={{ ...baseStudy(), organization_id: 'org', version: '1.0', created_at: '', updated_at: '' } as never} cenarios={[]} choques={CHOQUES_PADRAO} />);
    const card = screen.getByText('Simulação de Monte Carlo').closest('div.bg-white') as HTMLElement;
    return { user, card };
};

describe('Monte Carlo em lotes', () => {
    it('mostra o progresso e, no fim, o resultado', async () => {
        const { user, card } = tela();
        await user.clear(within(card).getByRole('spinbutton', { name: /Sorteios/ }));
        await user.type(within(card).getByRole('spinbutton', { name: /Sorteios/ }), '400');
        await user.click(within(card).getByRole('button', { name: 'Simular' }));
        expect(within(card).getByRole('progressbar', { name: /Sorteios feitos/ })).toBeTruthy();
        await waitFor(() => expect(within(card).getByText(/Chance de VPL negativo/i)).toBeTruthy(), { timeout: 10_000 });
        expect(within(card).queryByRole('progressbar')).toBeNull();
    });

    it('cancelar para a simulação e não deixa resultado pela metade', async () => {
        const { user, card } = tela();
        await user.clear(within(card).getByRole('spinbutton', { name: /Sorteios/ }));
        await user.type(within(card).getByRole('spinbutton', { name: /Sorteios/ }), '20000');
        await user.click(within(card).getByRole('button', { name: 'Simular' }));
        await user.click(within(card).getByRole('button', { name: 'Cancelar' }));
        await waitFor(() => expect(within(card).getByRole('button', { name: 'Simular' })).toBeTruthy());
        expect(within(card).queryByText(/Chance de VPL negativo/i)).toBeNull();
    });

    it('semente 0 é recusada com o motivo (repetiria a semente 1)', async () => {
        const { user, card } = tela();
        const semente = within(card).getByRole('spinbutton', { name: /Semente/ });
        await user.clear(semente);
        await user.type(semente, '0');
        const botao = within(card).getByRole('button', { name: 'Simular' }) as HTMLButtonElement;
        expect(botao.disabled).toBe(true);
        expect(botao.getAttribute('title')).toMatch(/de 1 em diante/);
    });
});
