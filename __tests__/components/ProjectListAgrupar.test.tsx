// @vitest-environment jsdom
/**
 * Engenharia › Orçamentos (lista) — "Agrupar" (guia de UI §6.12, pedido de 2026-11-14):
 * seletor de campo (Status, Status Obra, Bloqueio, Tipo de Obra), ordem dos grupos
 * (Crescente/Decrescente) e recolher/expandir todos, na toolbar acoplada.
 * Só na lista de Orçamentos — Obras/Planejamento/Diário não ganharam o controle.
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ConfirmProvider } from '../../components/ui/confirm';

vi.mock('../../services/projectService', () => ({
    projectService: {
        listProjects: vi.fn().mockResolvedValue([]),
        // p2 tem pedido vinculado → Bloqueado; os demais, Livre.
        getOrderCounts: vi.fn().mockResolvedValue({ p2: 1 }),
        deleteProject: vi.fn(),
    },
}));
vi.mock('../../services/empreendimentoService', () => ({
    empreendimentoService: { mapObrasToEmpreendimentos: vi.fn().mockResolvedValue({}) },
}));
vi.mock('../../components/ExcelImportModal', () => ({ default: () => null }));

import ProjectList from '../../components/ProjectList';

const orc = (id: string, name: string, settings: Record<string, unknown>) => ({
    id, name, created_at: '2026-01-01', updated_at: '2026-01-01',
    settings: { classification: 'ORCAMENTO', ...settings },
});

const PROJETOS = [
    orc('p1', 'Igreja', { budgetStatus: 'Em andamento', obraStatus: 'Não Iniciado' }),
    orc('p2', 'Garden', { budgetStatus: 'Em andamento', obraStatus: 'Em andamento' }),
    orc('p3', 'Furnas', { budgetStatus: 'Fechado', obraStatus: 'Não Iniciado' }),
];

const montar = async (classificationFilter?: 'ORCAMENTO' | 'OBRA') => {
    const r = render(
        <ConfirmProvider>
            <ProjectList
                onLoadProject={vi.fn()} onEditProject={vi.fn()} onNewProject={vi.fn()}
                onDuplicateProject={vi.fn()} onImportProject={vi.fn()} onExportProject={vi.fn()}
                projects={PROJETOS} classificationFilter={classificationFilter}
            />
        </ConfirmProvider>,
    );
    await act(async () => { await new Promise(res => setTimeout(res, 30)); });
    return r;
};

/** Rótulos das linhas de grupo, na ordem da tela. */
const grupos = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('tbody td[colspan] span.font-semibold')).map(s => s.textContent);

const nomes = () => ['Igreja', 'Garden', 'Furnas'].filter(n => screen.queryByText(n));

beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* sem storage: o padrão já é "Agrupar" */ }
});

describe('Orçamentos (lista) — Agrupar', () => {
    it('mostra o seletor, a ordem dos grupos e o recolher/expandir — desligados sem agrupamento', async () => {
        await montar('ORCAMENTO');
        expect(screen.getByTitle('Agrupar os orçamentos')).toBeTruthy();
        expect((screen.getByLabelText('Ordem dos grupos') as HTMLSelectElement).disabled).toBe(true);
        expect((screen.getByRole('button', { name: 'Recolher todos os grupos' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('agrupa por Status Obra na ordem do fluxo; Decrescente inverte', async () => {
        const { container } = await montar('ORCAMENTO');
        fireEvent.change(screen.getByTitle('Agrupar os orçamentos'), { target: { value: 'status-obra' } });
        expect(grupos(container)).toEqual(['Não Iniciado', 'Em andamento']);
        fireEvent.change(screen.getByLabelText('Ordem dos grupos'), { target: { value: 'desc' } });
        expect(grupos(container)).toEqual(['Em andamento', 'Não Iniciado']);
    });

    it('agrupa por Bloqueio com o mesmo texto da célula (Bloqueado antes de Livre)', async () => {
        const { container } = await montar('ORCAMENTO');
        fireEvent.change(screen.getByTitle('Agrupar os orçamentos'), { target: { value: 'bloqueio' } });
        expect(grupos(container)).toEqual(['Bloqueado', 'Livre']);
    });

    it('agrupa por Tipo de Obra: sem tipo cai em "Sem tipo de obra"', async () => {
        const { container } = await montar('ORCAMENTO');
        fireEvent.change(screen.getByTitle('Agrupar os orçamentos'), { target: { value: 'tipo-obra' } });
        expect(grupos(container)).toEqual(['Sem tipo de obra']);
    });

    it('recolher todos esconde as linhas; expandir volta', async () => {
        await montar('ORCAMENTO');
        fireEvent.change(screen.getByTitle('Agrupar os orçamentos'), { target: { value: 'status' } });
        expect(nomes()).toEqual(['Igreja', 'Garden', 'Furnas']);
        fireEvent.click(screen.getByRole('button', { name: 'Recolher todos os grupos' }));
        expect(nomes()).toEqual([]);
        fireEvent.click(screen.getByRole('button', { name: 'Expandir todos os grupos' }));
        expect(nomes()).toEqual(['Igreja', 'Garden', 'Furnas']);
    });

    it('não aparece na lista de Obras', async () => {
        await montar('OBRA');
        expect(screen.queryByTitle('Agrupar os orçamentos')).toBeNull();
    });
});
