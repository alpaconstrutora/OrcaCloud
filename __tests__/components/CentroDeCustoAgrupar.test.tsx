// @vitest-environment jsdom
/**
 * "Agrupar" em Minha Organização › Centro de custo. Pedido de 24/10/2026,
 * docs/planos/2026-10-24-centro-de-custo-agrupar.md
 *
 * A tela é uma árvore (grupo → centro de custo). Agrupar ACHATA a lista nos centros de
 * custo e os divide por Grupo, Organização (só em "Todas"), Empreendimento ou Obra.
 * Tela montada de verdade, com os serviços simulados.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const ctx = vi.hoisted(() => ({ orgId: 'orgA' as string | null }));

vi.mock('../../lib/supabase', () => ({ supabase: { from: () => ({}), rpc: vi.fn(async () => ({ data: [], error: null })) } }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock('../../store/useStore', () => {
    const estado = { organizations: [{ id: 'orgA', name: 'Alpa' }, { id: 'orgB', name: 'Beta' }] };
    const useStore = (sel?: (s: unknown) => unknown) => (sel ? sel(estado) : estado);
    useStore.getState = () => estado;
    return { useStore };
});
vi.mock('../../hooks/useOrgContext', () => ({
    useOrgContext: () => ({ orgId: ctx.orgId }),
    useOrgWriteTarget: () => ({ resolveWriteOrg: vi.fn(), orgTargetModal: null }),
    forEachTargetOrg: vi.fn(),
}));

const cc = (id: string, name: string, org: string, parent: string | null, project: string | null = null, emp: string | null = null) => ({
    id, code: id.toUpperCase(), name, organization_id: org, parent_id: parent, project_id: project, empreendimento_id: emp, description: null,
});
const CENTROS = [
    cc('g1', 'Obras', 'orgA', null),
    cc('g2', 'Despesas', 'orgA', null),
    cc('g3', 'Vazio', 'orgA', null),
    cc('c1', 'Cimento', 'orgA', 'g1', 'p1', 'e1'),
    cc('c2', 'Areia', 'orgA', 'g1', 'p1', 'e1'),
    cc('c3', 'Aluguel', 'orgA', 'g2'),
    cc('c4', 'Energia', 'orgB', 'g2'),
];
vi.mock('../../services/costCenterService', () => ({ costCenterService: { list: vi.fn(async () => CENTROS) } }));
vi.mock('../../services/projectService', () => ({
    projectService: { listProjects: vi.fn(async () => [{ id: 'p1', name: 'Obra Garden', settings: { classification: 'OBRA' } }]) },
}));
vi.mock('../../services/empreendimentoService', () => ({
    empreendimentoService: {
        mapObrasToEmpreendimentos: vi.fn(async () => ({})),
        list: vi.fn(async () => [{ id: 'e1', name: 'Residencial Sol', organization_id: 'orgA' }]),
    },
}));
vi.mock('../../services/empreendimentoLinksService', () => ({ empreendimentoLinksService: {} }));
vi.mock('../../services/empreendimentoAuditService', () => ({ empreendimentoAuditService: {} }));
vi.mock('../../services/exportService', () => ({ exportService: { exportCostCentersV2: vi.fn(), downloadCostCenterV2Template: vi.fn() } }));

import CostCenterModule from '../../components/CostCenterModule';

const SELETOR = 'Agrupar os centros de custo';
const rotulosDeGrupo = () => Array.from(document.querySelectorAll('span.font-semibold.text-slate-800')).map(e => e.textContent);
const agrupar = (campo: string) => fireEvent.change(screen.getByTitle(SELETOR), { target: { value: campo } });
const abrir = async () => {
    render(<CostCenterModule />);
    await screen.findByText('Obras');
};

beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    ctx.orgId = 'orgA';
});

describe('Centro de custo › Agrupar', () => {
    it('sem agrupamento é a árvore de sempre; ordem dos grupos e recolher ficam desligados com o motivo', async () => {
        await abrir();
        expect(screen.getByText('Vazio')).toBeTruthy();                       // grupo sem filho aparece na árvore
        expect(rotulosDeGrupo()).toEqual([]);
        expect((screen.getByLabelText('Ordem dos grupos') as HTMLSelectElement).disabled).toBe(true);
        expect((screen.getByLabelText('Recolher todos os grupos') as HTMLButtonElement).disabled).toBe(true);
    });

    it('por Obra: só centros de custo, "Sem obra" no fim, grupo-pai fora', async () => {
        await abrir();
        await screen.findByTitle(SELETOR);
        agrupar('obra');
        await waitFor(() => expect(rotulosDeGrupo()).toEqual(['Obra Garden', 'Sem obra']));
        expect(screen.getByText('Cimento')).toBeTruthy();
        expect(screen.getByText('Aluguel')).toBeTruthy();
        expect(screen.queryByText('Vazio')).toBeNull();                       // grupo-pai sem filho não é linha agrupável
    });

    it('por Empreendimento usa o nome que a coluna mostra', async () => {
        await abrir();
        agrupar('empreendimento');
        await waitFor(() => expect(rotulosDeGrupo()).toEqual(['Residencial Sol', 'Sem empreendimento']));
    });

    it('por Grupo: Crescente A→Z e Decrescente inverte', async () => {
        await abrir();
        agrupar('grupo');
        expect(rotulosDeGrupo()).toEqual(['Despesas', 'Obras']);
        fireEvent.change(screen.getByLabelText('Ordem dos grupos'), { target: { value: 'desc' } });
        expect(rotulosDeGrupo()).toEqual(['Obras', 'Despesas']);
    });

    it('"Sem obra" continua no fim também em Decrescente', async () => {
        await abrir();
        agrupar('obra');
        await waitFor(() => expect(rotulosDeGrupo()).toEqual(['Obra Garden', 'Sem obra']));
        fireEvent.change(screen.getByLabelText('Ordem dos grupos'), { target: { value: 'desc' } });
        expect(rotulosDeGrupo()).toEqual(['Obra Garden', 'Sem obra']);
    });

    it('recolher esconde as linhas do grupo; a contagem é do grupo inteiro', async () => {
        await abrir();
        agrupar('grupo');
        const obras = screen.getByText('Obras', { selector: 'span.font-semibold.text-slate-800' });
        expect(obras.parentElement!.textContent).toContain('2');               // Cimento + Areia, sem "R$" (cadastro, sem dinheiro)
        expect(obras.parentElement!.textContent).not.toContain('R$');
        fireEvent.click(obras.closest('div')!);
        expect(screen.queryByText('Cimento')).toBeNull();
        expect(screen.getByText('Aluguel')).toBeTruthy();
    });

    it('a busca recorta os centros de custo antes de agrupar', async () => {
        await abrir();
        agrupar('grupo');
        fireEvent.change(screen.getByPlaceholderText(/Pesquisar por código/), { target: { value: 'areia' } });
        expect(rotulosDeGrupo()).toEqual(['Obras']);
    });

    it('"Organização" só é opção em "Todas as organizações"', async () => {
        await abrir();
        expect(Array.from((screen.getByTitle(SELETOR) as HTMLSelectElement).options).map(o => o.value)).not.toContain('organizacao');
    });

    it('em "Todas", agrupa por Organização e uma escolha guardada some ao voltar para uma organização', async () => {
        ctx.orgId = null;
        const { unmount } = render(<CostCenterModule />);
        await screen.findByText('Obras');
        agrupar('organizacao');
        await waitFor(() => expect(rotulosDeGrupo()).toEqual(['Alpa', 'Beta']));
        unmount();

        ctx.orgId = 'orgA';
        render(<CostCenterModule />);
        await screen.findByText('Obras');
        expect(rotulosDeGrupo()).toEqual([]);                                  // "Organização" não existe mais: vale como sem agrupamento
        expect((screen.getByTitle(SELETOR) as HTMLSelectElement).value).toBe('none');
    });
});
