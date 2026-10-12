// @vitest-environment jsdom
/**
 * Pendência da Fase 5 do plano docs/planos/2026-10-12-imovib-viabilidade-correcoes.md:
 * o seletor de notas ESG (`StarRating`) era declarado DENTRO do render de
 * ImovibEsgReportForm — a cada renderização o React o tratava como componente
 * novo e remontava os botões. O teste trava: depois de uma nova renderização o
 * botão é o MESMO nó, e o clique grava a nota no campo certo.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const updateStudy = vi.fn().mockResolvedValue(undefined);
vi.mock('../../services/imovibService', () => ({
    imovibService: { updateStudy: (...a: unknown[]) => updateStudy(...a) },
}));
vi.mock('../../lib/supabase', () => ({
    supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } },
}));

import ImovibEsgReportForm from '../../components/ImovibEsgReportForm';

const estudo = { id: 'estudo-1', name: 'Teste', esg_environmental_score: 2, esg_social_score: 3, esg_governance_score: 4, blocks: [] } as never;

describe('ImovibEsgReportForm — notas ESG', () => {
    beforeEach(() => updateStudy.mockClear());

    it('o botão de nota é o MESMO nó depois de renderizar de novo', () => {
        const { rerender } = render(<ImovibEsgReportForm study={estudo} onDataChanged={vi.fn()} />);
        const antes = screen.getByRole('button', { name: 'Ambiental (E): nota 3 de 5' });
        rerender(<ImovibEsgReportForm study={{ ...(estudo as object) } as never} onDataChanged={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'Ambiental (E): nota 3 de 5' })).toBe(antes);
    });

    it('clicar numa nota marca até ela e grava no campo da dimensão', async () => {
        render(<ImovibEsgReportForm study={estudo} onDataChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Governança (G): nota 5 de 5' }));
        expect(screen.getByRole('button', { name: 'Governança (G): nota 5 de 5' })).toHaveAttribute('aria-pressed', 'true');
        await vi.waitFor(() => expect(updateStudy).toHaveBeenCalled());
        const [id, campos] = updateStudy.mock.calls[0];
        expect(id).toBe('estudo-1');
        expect(campos).toMatchObject({ esg_governance_score: 5 });
    });
});
