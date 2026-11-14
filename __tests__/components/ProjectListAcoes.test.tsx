// @vitest-environment jsdom
/**
 * Coluna de ações da lista de Orçamentos (crítica de 2026-11-14, guia §9.1):
 * o clique na linha já abre o Orçamento Analítico, então não há "Ver Detalhes"
 * (que abria o formulário de dados, igual ao lápis) nem, na grade, o ícone
 * "Orçamento Analítico" que repetia o clique no card. Obras mantêm o "Ver Detalhes".
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ConfirmProvider } from '../../components/ui/confirm';

vi.mock('../../services/projectService', () => ({
    projectService: {
        listProjects: vi.fn().mockResolvedValue([]),
        getOrderCounts: vi.fn().mockResolvedValue({}),
        deleteProject: vi.fn(),
    },
}));
vi.mock('../../services/empreendimentoService', () => ({
    empreendimentoService: { mapObrasToEmpreendimentos: vi.fn().mockResolvedValue({}) },
}));
vi.mock('../../components/ExcelImportModal', () => ({ default: () => null }));

import ProjectList from '../../components/ProjectList';

const PROJETOS = [
    { id: 'o1', name: 'Garden', created_at: '2026-01-01', updated_at: '2026-01-01', settings: { classification: 'ORCAMENTO', budgetStatus: 'Em andamento' } },
    { id: 'b1', name: 'Obra Garden', created_at: '2026-01-01', updated_at: '2026-01-01', settings: { classification: 'OBRA', obraStatus: 'Em andamento' } },
];

const montar = async (classificationFilter: 'ORCAMENTO' | 'OBRA') => {
    const props = {
        onLoadProject: vi.fn(), onEditProject: vi.fn(), onNewProject: vi.fn(), onDuplicateProject: vi.fn(),
        onImportProject: vi.fn(), onExportProject: vi.fn(), onRowClick: vi.fn(),
    };
    render(
        <ConfirmProvider>
            <ProjectList {...props} projects={PROJETOS} classificationFilter={classificationFilter} />
        </ConfirmProvider>,
    );
    await act(async () => { await new Promise(res => setTimeout(res, 30)); });
    return props;
};

beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* sem storage: o padrão já é modo lista */ }
});

describe('Orçamentos — coluna de ações sem duplicata (§9.1)', () => {
    it('não mostra "Ver Detalhes"; o lápis diz o que edita e abre o formulário', async () => {
        const props = await montar('ORCAMENTO');
        expect(screen.queryByText('Ver Detalhes')).toBeNull();
        fireEvent.click(screen.getByTitle('Editar dados do orçamento'));
        expect(props.onEditProject).toHaveBeenCalledWith('o1');
        expect(props.onRowClick).not.toHaveBeenCalled();
    });

    it('o clique na linha continua abrindo o orçamento', async () => {
        const props = await montar('ORCAMENTO');
        fireEvent.click(screen.getByText('Garden'));
        expect(props.onRowClick).toHaveBeenCalledWith('o1');
    });

    it('na grade não há o ícone "Orçamento Analítico" repetindo o clique no card', async () => {
        await montar('ORCAMENTO');
        fireEvent.click(screen.getByTitle('Visualização em Grade'));
        expect(screen.queryByTitle('Orçamento Analítico')).toBeNull();
        expect(screen.getByTitle('Editar dados do orçamento')).toBeTruthy();
    });

    it('Obras mantêm o "Ver Detalhes"', async () => {
        await montar('OBRA');
        expect(screen.getByText('Ver Detalhes')).toBeTruthy();
    });
});

describe('Orçamentos — Código e Orçamento fixos à esquerda (crítica 2026-11-14, passo 2)', () => {
    const fixa = (el: HTMLElement | null) => el?.closest('th,td') as HTMLElement | null;

    it('fixa Código e Orçamento, com border-separate (o collapse vazava texto na costura)', async () => {
        await montar('ORCAMENTO');
        const tabela = document.querySelector('table') as HTMLTableElement;
        expect(tabela.className).toContain('border-separate');
        const thNome = fixa(screen.getByText('Orçamento', { selector: 'th *' }));
        expect(thNome?.style.position).toBe('sticky');
        expect(thNome?.style.zIndex).toBe('30'); // acima da alça de redimensionar (z-20)
        const tdNome = fixa(screen.getByText('Garden'));
        expect(tdNome?.style.position).toBe('sticky');
        expect(tdNome?.style.left).toBe('118px'); // depois da coluna Código
        expect(tdNome?.className).toContain('border-b');
    });

    it('Obras não mudam: border-collapse e nada fixo', async () => {
        await montar('OBRA');
        expect((document.querySelector('table') as HTMLTableElement).className).toContain('border-collapse');
        expect(fixa(screen.getByText('Obra Garden'))?.style.position).toBe('');
    });
});
