// @vitest-environment jsdom
/**
 * Teste de estresse e gráficos da aba Sensibilidade e Risco (pendências da Fase 3
 * do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 */
import React from 'react';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import ImovibEstresseCard from '../../components/ImovibEstresseCard';
import ImovibTornadoCard from '../../components/ImovibTornadoCard';
import ImovibMonteCarloCard from '../../components/ImovibMonteCarloCard';
import { CHOQUES_PADRAO } from '../../utils/imovibSensibilidade';
import { baseStudy } from '../fixtures/imovibEstudos';

const estudo = (extra: Record<string, unknown> = {}) =>
    ({ ...baseStudy(extra as never), organization_id: 'org', version: '1.0', created_at: '', updated_at: '' }) as never;

describe('Teste de estresse', () => {
    it('atalho que passa do limite do controle: o controle mostra o valor de verdade', async () => {
        const user = userEvent.setup();
        render(<ImovibEstresseCard study={estudo({ sales_duration_months: 48 })} />);
        await user.click(screen.getByRole('button', { name: 'Vendas levam o dobro do tempo' }));
        const controle = screen.getByLabelText('Prazo das vendas') as HTMLInputElement;
        expect(Number(controle.value)).toBe(48);
    });

    it('indicador que não mudou não fica verde nem vermelho', () => {
        // Sem financiamento, mexer nos juros não muda nada.
        render(<ImovibEstresseCard study={estudo({ financing_percent: 0 })} />);
        fireEvent.change(screen.getByLabelText('Juros do financiamento'), { target: { value: '2' } });
        const linha = screen.getByRole('row', { name: /^VPL/ });
        const celula = within(linha).getAllByRole('cell')[2];
        expect(celula.className).not.toMatch(/emerald|red/);
    });
});

describe('Gráficos com nome acessível (§28)', () => {
    it('tornado: role=img com os números no nome', () => {
        render(<ImovibTornadoCard study={estudo()} choques={CHOQUES_PADRAO} onChoques={() => {}} />);
        const fig = screen.getByRole('img', { name: /Tornado/ });
        expect(fig.getAttribute('aria-label')).toMatch(/Preço de venda/);
        expect(fig.getAttribute('aria-label')).toMatch(/\d/);
    });

    it('Monte Carlo: histograma com role=img e os percentis no nome', async () => {
        const user = userEvent.setup();
        render(<ImovibMonteCarloCard study={estudo()} cenarios={[]} choques={CHOQUES_PADRAO} />);
        await user.clear(screen.getByRole('spinbutton', { name: /Sorteios/ }));
        await user.type(screen.getByRole('spinbutton', { name: /Sorteios/ }), '200');
        await user.click(screen.getByRole('button', { name: 'Simular' }));
        const fig = await waitFor(() => screen.getByRole('img', { name: /Distribuição do VPL/ }), { timeout: 10_000 });
        expect(fig.getAttribute('aria-label')).toMatch(/P10/);
        expect(fig.getAttribute('aria-label')).toMatch(/200 sorteios/);
    }, 15_000);
});
