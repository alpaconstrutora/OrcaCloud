// @vitest-environment jsdom
/**
 * ImovibIndiceDeCorrecao (item 2.6 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md):
 * escolher o índice com a taxa vazia preenche a taxa com a média da série; sem
 * série, a tela diz que a taxa segue a inflação geral.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const list = vi.fn();
vi.mock('../../services/contractIndexService', () => ({ contractIndexService: { list: (...a: unknown[]) => list(...a) } }));
vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import ImovibIndiceDeCorrecao from '../../components/ImovibIndiceDeCorrecao';

const serie = (taxa: number) => Array.from({ length: 13 }, (_, i) => {
    const d = new Date(Date.UTC(2025, 5 + i, 1));
    return { id: String(i), organization_id: null, index_name: 'INCC-M', reference_month: d.toISOString().slice(0, 10), value: 100 * Math.pow(1 + taxa / 100, i), created_at: '' };
});

const props = (over: Record<string, unknown> = {}) => ({
    rotulo: 'Índice da obra', campoNome: 'inflation_index_obra' as const, campoTaxa: 'cost_index_rate_monthly' as const,
    nome: null, taxa: null, inflacaoGeral: 0.4, organizationId: 'org', salvar: vi.fn().mockResolvedValue(undefined), ...over,
});

describe('ImovibIndiceDeCorrecao', () => {
    beforeEach(() => list.mockReset());

    it('escolher o índice com a taxa vazia grava o nome e, quando a série chega, a média', async () => {
        list.mockResolvedValue(serie(0.5));
        const user = userEvent.setup();
        const p = props();
        const { rerender } = render(<ImovibIndiceDeCorrecao {...p} />);
        await user.selectOptions(screen.getByLabelText('Índice da obra'), 'INCC-M');
        expect(p.salvar).toHaveBeenCalledWith({ inflation_index_obra: 'INCC-M' });
        // O pai recarrega o estudo com o nome gravado.
        rerender(<ImovibIndiceDeCorrecao {...p} nome="INCC-M" />);
        await waitFor(() => expect(p.salvar).toHaveBeenCalledWith({ cost_index_rate_monthly: 0.5 }));
    });

    it('troca rápida de índice: a série do índice anterior chegando atrasada não grava a taxa', async () => {
        let resolverIncc!: (v: unknown) => void;
        list.mockImplementation((nome: string) => (nome === 'INCC'
            ? new Promise(r => { resolverIncc = r; })
            : Promise.resolve(serie(0.3))));
        const user = userEvent.setup();
        const p = props();
        const { rerender } = render(<ImovibIndiceDeCorrecao {...p} />);
        await user.selectOptions(screen.getByLabelText('Índice da obra'), 'INCC');
        rerender(<ImovibIndiceDeCorrecao {...p} nome="INCC" />);
        // Antes da série do INCC voltar, troca para IPCA.
        await user.selectOptions(screen.getByLabelText('Índice da obra'), 'IPCA');
        resolverIncc(serie(0.5));
        await new Promise(r => setTimeout(r, 20));
        expect(p.salvar).not.toHaveBeenCalledWith({ cost_index_rate_monthly: 0.5 });
        rerender(<ImovibIndiceDeCorrecao {...p} nome="IPCA" />);
        await waitFor(() => expect(p.salvar).toHaveBeenCalledWith({ cost_index_rate_monthly: 0.3 }));
    });

    it('com taxa já preenchida, escolher o índice não troca a taxa', async () => {
        list.mockResolvedValue(serie(0.5));
        const user = userEvent.setup();
        const p = props({ taxa: 0.7 });
        const { rerender } = render(<ImovibIndiceDeCorrecao {...p} />);
        await user.selectOptions(screen.getByLabelText('Índice da obra'), 'INCC-M');
        rerender(<ImovibIndiceDeCorrecao {...p} nome="INCC-M" />);
        await waitFor(() => expect(screen.getByRole('button', { name: /0,5% a\.m\./ })).toBeEnabled());
        expect(p.salvar).not.toHaveBeenCalledWith({ cost_index_rate_monthly: 0.5 });
    });

    it('sem série: diz que a taxa segue a inflação geral e o botão explica por quê está desligado', async () => {
        list.mockResolvedValue([]);
        render(<ImovibIndiceDeCorrecao {...props({ nome: 'INCC' })} />);
        await waitFor(() => expect(screen.getByText('Sem taxa própria: segue a inflação geral (0,4% a.m.).')).toBeInTheDocument());
        const botao = screen.getByRole('button', { name: 'Usar a média dos últimos 12 meses' });
        expect(botao).toBeDisabled();
        expect(botao.getAttribute('title')).toMatch(/Não há série do INCC/);
    });
});
