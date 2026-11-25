// @vitest-environment jsdom
/**
 * Qualidade (SiAC), fase 1 — aba "Por obra"
 * (docs/planos/2026-11-25-qualidade-siac-pbqph.md, "Telas (rascunho)", bullet "Por obra").
 * O serviço é simulado: aqui se prova o que a tela MOSTRA e CHAMA.
 *
 *  (a) o seletor traz só as obras do store (que já vem sem projeto de sistema), recortadas pela
 *      organização do topo; em "Todas" trazem-se todas;
 *  (b) a tabela mostra só itens ATIVOS da organização da obra; o DISPENSADO não aparece;
 *  (c) "não se aplica" sem motivo não chama `excluirDaObra`; com motivo chama (projectId, itemId, motivo);
 *  (d) a exceção gravada aparece como "não se aplica — motivo"; "voltar a aplicar" chama `reincluirNaObra`;
 *  (e) sem permissão de editar, os controles desligados dizem por quê em título alcançável;
 *  (f) falha ao carregar as exceções NÃO mostra tabela vazia: mostra o erro e deixa tentar de novo.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ItemControlado } from '../../types/qualidadeSiac';
import { MOTIVO_SEM_EDICAO_QUALIDADE } from '../../utils/permissaoQualidadeSiac';

const listarExclusoes = vi.fn();
const excluirDaObra = vi.fn();
const reincluirNaObra = vi.fn();

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../services/qualidadeSiacService', () => ({
    qualidadeSiacService: {
        listarExclusoes: (...a: unknown[]) => listarExclusoes(...a),
        excluirDaObra: (...a: unknown[]) => excluirDaObra(...a),
        reincluirNaObra: (...a: unknown[]) => reincluirNaObra(...a),
    },
}));

import { useStore } from '../../store/useStore';
import { ConfirmProvider } from '../../components/ui/confirm';
import { PorObra } from '../../components/qualidade/PorObra';

const item = (p: Partial<ItemControlado>): ItemControlado => ({
    id: 'i', organization_id: 'org-a', tipo: 'SERVICO', nome: 'Serviço', etapa: 'Estrutura', origem: 'ANEXO4',
    anexo4_numero: null, chave_padrao: null, substitui_item_id: null, situacao: 'ATIVO', justificativa: null,
    procedure_document_id: null, training_course_id: null, ordem: 0, codigos: [], ...p,
});

const ITENS: ItemControlado[] = [
    item({ id: 'a1', nome: 'Alvenaria', ordem: 1 }),
    item({ id: 'a2', nome: 'Concretagem', ordem: 2 }),
    item({ id: 'a3', nome: 'Pintura (dispensado)', ordem: 3, situacao: 'DISPENSADO', justificativa: 'não executa' }),
    item({ id: 'a4', nome: 'Cimento', tipo: 'MATERIAL', ordem: 4, etapa: null }),
    item({ id: 'b1', nome: 'Serviço da B', organization_id: 'org-b', ordem: 1 }),
];

const obra = (id: string, name: string, org: string) => ({ id, name, organization_id: org, settings: {}, budget: [] });

const montar = (podeEditar = true) =>
    render(<ConfirmProvider><PorObra itens={ITENS} podeEditar={podeEditar} /></ConfirmProvider>);

const linhaDe = (nome: string) => screen.getByText(nome).closest('tr') as HTMLElement;

beforeEach(() => {
    localStorage.clear();
    listarExclusoes.mockReset().mockResolvedValue([]);
    excluirDaObra.mockReset().mockResolvedValue(undefined);
    reincluirNaObra.mockReset().mockResolvedValue(undefined);
    useStore.setState({
        activeOrganizationId: 'org-a',
        activeEmpresaId: null,
        organizations: [
            { id: 'org-a', name: 'Construtora A', address: {}, members: [] },
            { id: 'org-b', name: 'Construtora B', address: {}, members: [] },
        ] as never,
        projects: [obra('p1', 'Residencial Sol', 'org-a'), obra('p2', 'Torre Lua', 'org-b')] as never,
        viewFocus: null,
    });
});

describe('Qualidade (SiAC) — por obra', () => {
    it('(a) o seletor traz só as obras da organização do topo', async () => {
        montar();
        const seletor = await screen.findByLabelText('Obra');
        const opcoes = within(seletor).getAllByRole('option').map(o => o.textContent);
        expect(opcoes).toEqual(['Residencial Sol']);
        await waitFor(() => expect(listarExclusoes).toHaveBeenCalledWith('p1'));
    });

    it('(a2) em "Todas" o seletor traz as obras de todas as organizações', async () => {
        useStore.setState({ activeOrganizationId: null, activeEmpresaId: null });
        montar();
        const seletor = await screen.findByLabelText('Obra');
        const opcoes = within(seletor).getAllByRole('option').map(o => o.textContent);
        expect(opcoes).toEqual(['Residencial Sol', 'Torre Lua']);
    });

    it('(b) mostra só itens ATIVOS da organização da obra', async () => {
        montar();
        await screen.findByText('Alvenaria');
        expect(screen.getByText('Concretagem')).toBeTruthy();
        expect(screen.getByText('Cimento')).toBeTruthy();
        expect(screen.queryByText('Pintura (dispensado)')).toBeNull();
        expect(screen.queryByText('Serviço da B')).toBeNull();
        expect(within(linhaDe('Alvenaria')).getByText('aplica')).toBeTruthy();
    });

    it('(c) "não se aplica" sem motivo não grava; com motivo grava (obra, item, motivo)', async () => {
        const user = userEvent.setup();
        montar();
        await screen.findByText('Alvenaria');
        await user.click(within(linhaDe('Alvenaria')).getByRole('button', { name: 'Não se aplica' }));

        const campo = await screen.findByLabelText('Motivo');
        await user.click(screen.getByRole('button', { name: 'Registrar exceção' }));
        expect(excluirDaObra).not.toHaveBeenCalled();
        expect(screen.getByText('Informe o motivo.')).toBeTruthy();

        await user.type(campo, '   ');
        await user.click(screen.getByRole('button', { name: 'Registrar exceção' }));
        expect(excluirDaObra).not.toHaveBeenCalled();

        await user.type(campo, 'Obra sem alvenaria: estrutura metálica');
        await user.click(screen.getByRole('button', { name: 'Registrar exceção' }));
        await waitFor(() => expect(excluirDaObra).toHaveBeenCalledWith('p1', 'a1', 'Obra sem alvenaria: estrutura metálica'));
        // recarrega as exceções depois de gravar
        await waitFor(() => expect(listarExclusoes).toHaveBeenCalledTimes(2));
    });

    it('(d) a exceção aparece com o motivo e "voltar a aplicar" a remove', async () => {
        listarExclusoes.mockResolvedValue([{ item_id: 'a2', motivo: 'Concreto usinado terceirizado' }]);
        const user = userEvent.setup();
        montar();
        await screen.findByText('Concretagem');
        await waitFor(() => expect(within(linhaDe('Concretagem')).getByText('não se aplica — Concreto usinado terceirizado')).toBeTruthy());
        expect(within(linhaDe('Alvenaria')).getByText('aplica')).toBeTruthy();
        await user.click(within(linhaDe('Concretagem')).getByRole('button', { name: 'Voltar a aplicar' }));
        await waitFor(() => expect(reincluirNaObra).toHaveBeenCalledWith('p1', 'a2'));
        await waitFor(() => expect(listarExclusoes).toHaveBeenCalledTimes(2));
    });

    it('(e) sem permissão de editar, os controles desligam e o motivo fica num título alcançável', async () => {
        listarExclusoes.mockResolvedValue([{ item_id: 'a2', motivo: 'x' }]);
        montar(false);
        await screen.findByText('Alvenaria');
        const botao = within(linhaDe('Alvenaria')).getByRole('button', { name: 'Não se aplica' }) as HTMLButtonElement;
        expect(botao.disabled).toBe(true);
        expect(botao.closest('[title]')?.getAttribute('title')).toBe(MOTIVO_SEM_EDICAO_QUALIDADE);
        await waitFor(() => expect(within(linhaDe('Concretagem')).getByRole('button', { name: 'Voltar a aplicar' })).toBeTruthy());
        const volta = within(linhaDe('Concretagem')).getByRole('button', { name: 'Voltar a aplicar' }) as HTMLButtonElement;
        expect(volta.disabled).toBe(true);
        expect(volta.closest('[title]')?.getAttribute('title')).toBe(MOTIVO_SEM_EDICAO_QUALIDADE);
    });

    it('(f) falha ao carregar as exceções: mostra o erro, não a tabela, e deixa tentar de novo', async () => {
        listarExclusoes.mockRejectedValueOnce(new Error('rede caiu'));
        const user = userEvent.setup();
        montar();
        await screen.findByText(/Não foi possível carregar as exceções da obra: rede caiu/);
        expect(screen.queryByRole('table')).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
        await screen.findByText('Alvenaria');
        expect(listarExclusoes).toHaveBeenCalledTimes(2);
    });
});
