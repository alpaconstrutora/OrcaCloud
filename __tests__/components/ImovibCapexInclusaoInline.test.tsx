// @vitest-environment jsdom
/**
 * Item 5.7 do plano docs/planos/2026-10-12-imovib-viabilidade-correcoes.md.
 *
 * "Novo" numa categoria do CAPEX abria `window.prompt`. Agora abre uma linha
 * inline (nome + Adicionar + Cancelar): Enter confirma, Esc cancela, nome
 * repetido avisa com a mesma mensagem da UNIQUE do banco, e no modo só leitura
 * o "Novo" fica desabilitado com o motivo.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const rubricas = [
    { id: 'r1', study_id: 'estudo-1', category: '1. Terreno', name: 'ITBI na Aquisição', value_type: 'percent', value: 3, base: 'terreno' },
];
const seedCapexTemplate = vi.fn();
const upsertCapexItems = vi.fn();
vi.mock('../../services/imovibService', () => ({
    imovibService: {
        seedCapexTemplate: (...a: unknown[]) => seedCapexTemplate(...a),
        upsertCapexItems: (...a: unknown[]) => upsertCapexItems(...a),
    },
}));
vi.mock('../../services/empreendimentoService', () => ({
    empreendimentoService: { listRegulatoryZonesByImovibStudy: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../lib/supabase', () => ({
    supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } },
}));

import ImovibCapexForm from '../../components/ImovibCapexForm';
import { ConfirmProvider } from '../../components/ui/confirm';
import { ToastProvider } from '../../components/ui/toast';
import { ImovibEdicaoProvider } from '../../hooks/useImovibEdicao';

const estudo = { id: 'estudo-1', name: 'Teste', capex_mode: 'detailed', capex_seeded_at: '2026-10-12', blocks: [] } as never;

const montar = (pode = true) =>
    render(
        <ToastProvider>
            <ConfirmProvider>
                <ImovibEdicaoProvider value={pode ? { pode: true } : { pode: false, motivo: 'Sem permissão' }}>
                    <ImovibCapexForm study={estudo} onDataChanged={vi.fn()} />
                </ImovibEdicaoProvider>
            </ConfirmProvider>
        </ToastProvider>,
    );

describe('ImovibCapexForm — inclusão inline de rubrica', () => {
    beforeEach(() => {
        seedCapexTemplate.mockReset().mockResolvedValue(rubricas);
        upsertCapexItems.mockReset().mockImplementation(async (novos: any[]) =>
            novos.map((n, i) => ({ ...n, id: `novo-${i}` })));
        vi.spyOn(window, 'prompt').mockImplementation(() => { throw new Error('window.prompt não pode ser chamado'); });
    });

    it('Novo abre a linha; Enter adiciona e fecha', async () => {
        const user = userEvent.setup();
        montar();
        await user.click(await screen.findByRole('button', { name: /Novo/ }));

        const nome = screen.getByLabelText('Nome da nova rubrica em 1. Terreno');
        expect(document.activeElement).toBe(nome);
        await user.type(nome, 'Georreferenciamento{Enter}');

        await waitFor(() => expect(upsertCapexItems).toHaveBeenCalledTimes(1));
        expect(upsertCapexItems.mock.calls[0][0][0]).toMatchObject({ category: '1. Terreno', name: 'Georreferenciamento', value: 0 });
        await waitFor(() => expect(screen.queryByLabelText('Nome da nova rubrica em 1. Terreno')).toBeNull());
        expect(screen.getByDisplayValue('Georreferenciamento')).toBeInTheDocument();
    });

    it('Esc cancela sem gravar; Adicionar fica desabilitado com o motivo enquanto o nome está vazio', async () => {
        const user = userEvent.setup();
        montar();
        await user.click(await screen.findByRole('button', { name: /Novo/ }));

        const adicionar = screen.getByRole('button', { name: /Adicionar/ });
        expect(adicionar).toBeDisabled();
        expect(adicionar).toHaveAttribute('title', 'Digite o nome da rubrica');

        await user.type(screen.getByLabelText('Nome da nova rubrica em 1. Terreno'), 'Qualquer{Escape}');
        expect(screen.queryByLabelText('Nome da nova rubrica em 1. Terreno')).toBeNull();
        expect(upsertCapexItems).not.toHaveBeenCalled();
    });

    it('nome repetido na categoria: avisa e não grava', async () => {
        const user = userEvent.setup();
        montar();
        await user.click(await screen.findByRole('button', { name: /Novo/ }));
        await user.type(screen.getByLabelText('Nome da nova rubrica em 1. Terreno'), 'ITBI na Aquisição{Enter}');
        expect(await screen.findByText('Já existe a rubrica "ITBI na Aquisição" em 1. Terreno.')).toBeInTheDocument();
        expect(upsertCapexItems).not.toHaveBeenCalled();
    });

    it('só leitura: Novo desabilitado com o motivo', async () => {
        montar(false);
        const novo = await screen.findByRole('button', { name: /Novo/ });
        expect(novo).toBeDisabled();
        expect(novo).toHaveAttribute('title', 'Sem permissão');
    });
});
