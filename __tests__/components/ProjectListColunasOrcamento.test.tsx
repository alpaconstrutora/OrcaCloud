// @vitest-environment jsdom
/**
 * Engenharia › Orçamentos (lista) — colunas do cadastro no "Colunas visíveis" (21/11/2026).
 * Pedido: "na tabela de Orçamentos, Colunas visíveis nao contem todas as faltam colunas.
 * inclui-las". Plano: docs/planos/2026-11-21-orcamentos-colunas.md.
 */
import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
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

// Itens de cada orçamento (`projects.budget`): o hook real faz a busca; aqui o teste controla.
const itens = vi.hoisted(() => ({
    estado: 'pronto' as 'carregando' | 'pronto' | 'erro',
    orcamentos: {} as Record<string, unknown[]>,
    chamadas: [] as { ids: readonly string[]; ativo: boolean }[],
}));
vi.mock('../../hooks/useOrcamentosDaLista', () => ({
    useOrcamentosDaLista: (ids: readonly string[], ativo: boolean) => {
        itens.chamadas.push({ ids, ativo });
        return { orcamentos: ativo ? itens.orcamentos : {}, estado: itens.estado, tentarDeNovo: vi.fn() };
    },
}));

import ProjectList from '../../components/ProjectList';
import { useStore } from '../../store/useStore';

const item = (quantity: number, price: number, bdi?: number) => ({ id: `i${quantity}${price}`, quantity, bdi, sinapiItem: { price } });

const PROJETOS = [
    {
        id: 'p1', name: 'Igreja', created_at: '2026-01-01', updated_at: '2026-01-03', organization_id: 'org-a',
        settings: { classification: 'ORCAMENTO', bdi: 25, database: 'SINAPI', referenceMonth: '01/2025', area: 250, standard: 'R8-N', city: '', state: 'SP', startDate: '2026-11-21' },
    },
    {
        id: 'p2', name: 'Garden', created_at: '2026-01-01', updated_at: '2026-01-02', organization_id: 'org-b',
        settings: { classification: 'ORCAMENTO', bdi: 0, database: 'SINAPI', referenceMonth: '12/2025', area: 100, standard: 'R8-N', city: 'Cambuí', state: 'MG' },
    },
];
// Igreja: 2 × 100 com o BDI global (25%) + 1 × 100 com BDI próprio de 10% = 250 + 110.
// Garden: 3 × 1.000 sem BDI.
const ITENS = { p1: [item(2, 100), item(1, 100, 10)], p2: [item(3, 1000)] };

const montar = async (classificationFilter: 'ORCAMENTO' | 'OBRA' = 'ORCAMENTO', projetos: unknown[] = PROJETOS) => {
    const r = render(
        <ConfirmProvider>
            <ProjectList
                onLoadProject={vi.fn()} onEditProject={vi.fn()} onNewProject={vi.fn()}
                onDuplicateProject={vi.fn()} onImportProject={vi.fn()} onExportProject={vi.fn()}
                projects={projetos as never} classificationFilter={classificationFilter}
            />
        </ConfirmProvider>,
    );
    await act(async () => { await new Promise(res => setTimeout(res, 30)); });
    return r;
};

const abrirSeletor = () => fireEvent.click(screen.getByRole('button', { name: 'Configurar colunas' }));
const opcoesDoSeletor = () => within(screen.getByRole('dialog')).getAllByRole('checkbox').map(c => c.closest('label')!.textContent!.trim());
const cabecalhos = (container: HTMLElement) => Array.from(container.querySelectorAll('thead th')).map(th => th.textContent!.trim()).filter(Boolean);
const ligar = (rotulo: string) => fireEvent.click(within(screen.getByRole('dialog')).getByLabelText(rotulo));
/** Texto da célula da coluna `rotulo` na linha do orçamento `nome`. */
const celula = (container: HTMLElement, nome: string, rotulo: string) => {
    const idx = cabecalhos(container).indexOf(rotulo);
    const linha = Array.from(container.querySelectorAll('tbody tr')).find(tr => tr.textContent!.includes(nome))!;
    return (linha.querySelectorAll('td')[idx] as HTMLElement).textContent!.replace(/ /g, ' ').trim();
};

beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* sem storage */ }
    itens.estado = 'pronto';
    itens.orcamentos = ITENS;
    itens.chamadas = [];
    useStore.setState({ organizations: [{ id: 'org-a', name: 'Alpa Construtora' }, { id: 'org-b', name: 'Garden SPE' }] as never });
});

describe('Orçamentos (lista) — colunas do cadastro', () => {
    it('o seletor lista Organização e as colunas novas; Obras não ganham nenhuma delas', async () => {
        await montar('ORCAMENTO');
        abrirSeletor();
        const opcoes = opcoesDoSeletor();
        for (const r of ['Organização', 'Valor total', 'Base de preço', 'BDI', 'Área', 'Padrão', 'Local', 'Início previsto', 'Término previsto']) {
            expect(opcoes).toContain(r);
        }
    });

    it('Obras: nada muda no seletor', async () => {
        await montar('OBRA', []);
        abrirSeletor();
        const opcoes = opcoesDoSeletor();
        for (const r of ['Organização', 'Valor total', 'Base de preço', 'BDI', 'Área', 'Padrão', 'Local', 'Início previsto', 'Término previsto']) {
            expect(opcoes).not.toContain(r);
        }
        // e a busca dos itens não roda fora do Orçamento
        expect(itens.chamadas.every(c => !c.ativo)).toBe(true);
    });

    it('Valor total entra visível e é a conta do Preço Final (BDI do item vence o global)', async () => {
        const { container } = await montar();
        // Logo depois do nome do orçamento — no fim só aparecia rolando a tabela.
        const hs = cabecalhos(container);
        expect(hs[hs.indexOf('Orçamento') + 1]).toBe('Valor total');
        expect(celula(container, 'Igreja', 'Valor total')).toBe('R$ 360,00');
        expect(celula(container, 'Garden', 'Valor total')).toBe('R$ 3.000,00');
        // O resto do cadastro entra escondido.
        expect(cabecalhos(container)).not.toContain('Base de preço');
    });

    it('Valor total: carregando mostra "…", falha mostra "—" com o motivo — nunca R$ 0', async () => {
        itens.estado = 'carregando';
        const r1 = await montar();
        expect(celula(r1.container, 'Igreja', 'Valor total')).toBe('…');
        r1.unmount();
        itens.estado = 'erro';
        const r2 = await montar();
        expect(celula(r2.container, 'Igreja', 'Valor total')).toBe('—');
        expect(r2.container.querySelector('[title="Não foi possível carregar os itens deste orçamento"]')).toBeTruthy();
    });

    it('desligar Valor total para de buscar os itens', async () => {
        await montar();
        expect(itens.chamadas.at(-1)?.ativo).toBe(true);
        abrirSeletor();
        ligar('Valor total');
        expect(itens.chamadas.at(-1)?.ativo).toBe(false);
    });

    it('ligar as colunas do cadastro mostra os valores formatados; sem dado = "—"', async () => {
        const { container } = await montar();
        // Organização já vem visível no Orçamento (nunca foi escondida por padrão); o nome vem do store.
        expect(cabecalhos(container)).toContain('Organização');
        abrirSeletor();
        for (const r of ['Base de preço', 'BDI', 'Área', 'Padrão', 'Local', 'Início previsto', 'Término previsto']) ligar(r);
        expect(celula(container, 'Igreja', 'Organização')).toBe('Alpa Construtora');
        expect(celula(container, 'Garden', 'Organização')).toBe('Garden SPE');
        expect(celula(container, 'Igreja', 'Base de preço')).toBe('SINAPI · 01/2025');
        expect(celula(container, 'Igreja', 'BDI')).toBe('25%');
        expect(celula(container, 'Garden', 'BDI')).toBe('0%');
        expect(celula(container, 'Igreja', 'Área')).toBe('250 m²');
        expect(celula(container, 'Igreja', 'Padrão')).toBe('R8-N');
        expect(celula(container, 'Igreja', 'Local')).toBe('SP');
        expect(celula(container, 'Garden', 'Local')).toBe('Cambuí/MG');
        expect(celula(container, 'Igreja', 'Início previsto')).toBe('21/11/2026');
        expect(celula(container, 'Garden', 'Início previsto')).toBe('—');
        expect(celula(container, 'Igreja', 'Término previsto')).toBe('—');
    });

    it('ordena pelo Valor total que a célula mostra', async () => {
        const { container } = await montar();
        const nomesNaOrdem = () => Array.from(container.querySelectorAll('tbody tr')).map(tr => (tr.textContent!.includes('Garden') ? 'Garden' : 'Igreja'));
        fireEvent.click(within(container.querySelector('thead')!).getByText('Valor total'));
        expect(nomesNaOrdem()).toEqual(['Igreja', 'Garden']);
        fireEvent.click(within(container.querySelector('thead')!).getByText('Valor total'));
        expect(nomesNaOrdem()).toEqual(['Garden', 'Igreja']);
    });
});

describe('Orçamentos × Planejamento na mesma instância (AppRouter troca só as props)', () => {
    const PLANEJAMENTO = { id: 'pl1', name: 'Cronograma Garden', created_at: '2026-01-01', updated_at: '2026-01-01', settings: { classification: 'PLANEJAMENTO' } };
    const props = { onLoadProject: vi.fn(), onEditProject: vi.fn(), onNewProject: vi.fn(), onDuplicateProject: vi.fn(), onImportProject: vi.fn(), onExportProject: vi.fn() };
    const tela = (classificationFilter: 'ORCAMENTO' | 'PLANEJAMENTO') => (
        <ConfirmProvider><ProjectList {...props} projects={[...PROJETOS, PLANEJAMENTO] as never} classificationFilter={classificationFilter} /></ConfirmProvider>
    );

    it('ir do Planejamento aos Orçamentos não traz Avanço/Prazo/Término/Início', async () => {
        const r = render(tela('PLANEJAMENTO'));
        await act(async () => { await new Promise(res => setTimeout(res, 30)); });
        expect(cabecalhos(r.container)).toContain('Avanço');
        r.rerender(tela('ORCAMENTO'));
        await act(async () => { await new Promise(res => setTimeout(res, 30)); });
        const hs = cabecalhos(r.container);
        for (const h of ['Avanço', 'Prazo', 'Término', 'Início']) expect(hs).not.toContain(h);
        expect(hs).toContain('Valor total');
        expect(JSON.parse(localStorage.getItem('projectListColumns')!).visibleColumns).not.toContain('avanco');
    });

    it('preferência já gravada com colunas de outra tela não aparece na tabela', async () => {
        localStorage.setItem('projectListColumns', JSON.stringify({
            visibleColumns: ['code', 'name', 'avanco', 'prazo', 'termino', 'inicio', 'valor-total'],
            knownColumns: ['code', 'name', 'avanco', 'prazo', 'termino', 'inicio', 'valor-total'],
            columnOrder: ['code', 'name', 'avanco', 'prazo', 'termino', 'inicio', 'valor-total'],
        }));
        const { container } = await montar();
        const hs = cabecalhos(container);
        for (const h of ['Avanço', 'Prazo', 'Término', 'Início']) expect(hs).not.toContain(h);
        expect(hs).toEqual(expect.arrayContaining(['Código', 'Orçamento', 'Valor total']));
    });
});

describe('quem já tem a preferência gravada (antes das colunas novas)', () => {
    it('Valor total entra logo depois de Orçamento; as do cadastro, escondidas', async () => {
        const antigas = ['code', 'name', 'tipo-obra', 'organization', 'empreendimento', 'linked', 'client', 'created', 'updated', 'status-budget', 'status-obra', 'lock', 'actions'];
        localStorage.setItem('projectListColumns', JSON.stringify({ visibleColumns: antigas, knownColumns: antigas, columnOrder: antigas }));
        const { container } = await montar();
        const hs = cabecalhos(container);
        expect(hs[hs.indexOf('Orçamento') + 1]).toBe('Valor total');
        expect(hs).not.toContain('Base de preço');
        expect(hs).not.toContain('BDI');
    });
});
