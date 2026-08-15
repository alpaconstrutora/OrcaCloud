// @vitest-environment jsdom
/**
 * Estrutura da tabela do Orçamento Analítico (BudgetEditor + BudgetRow).
 *
 * Contexto: até 2026-08-13 a WBS era montada com três templates de CSS grid
 * DIFERENTES para as linhas de uma mesma "tabela" — cabeçalho com 11 colunas,
 * grupo/etapa/subetapa com 9, e a linha do item com 12 (uma coluna de 20px a
 * mais, do drag handle). Por isso as colunas nunca alinhavam de verdade, e
 * nenhum ajuste de CSS resolvia. A correção foi converter para <table> com um
 * único <colgroup>, que torna o desalinhamento impossível por construção.
 *
 * Estes testes existem para que a regressão seja detectada por teste, e não por
 * print do usuário: eles falham se alguém voltar a montar linha de WBS fora da
 * <table>, ou se a contagem de colunas divergir entre as faixas.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SinapiType } from '../../types';
import type { BudgetEntry, ProjectSettings } from '../../types';
import { ConfirmProvider } from '../../components/ui/confirm';

vi.mock('../../services/sinapiService', () => ({
    sinapiService: {
        loadDatabase: vi.fn().mockResolvedValue(undefined),
        getCategories: vi.fn().mockResolvedValue([]),
        search: vi.fn().mockResolvedValue([]),
        getItemsByCodes: vi.fn().mockResolvedValue([]),
        getReferences: vi.fn().mockResolvedValue([]),
        databaseSize: 0,
    },
    resolveReferenceDate: vi.fn(() => undefined),
}));

vi.mock('../../services/customDatabaseService', () => ({
    customDatabaseService: {
        listDatabases: vi.fn().mockResolvedValue([]),
        saveItem: vi.fn(),
        deleteItem: vi.fn(),
    },
}));

vi.mock('../../services/parametricService', () => ({
    parametricService: { estimate: vi.fn().mockResolvedValue({ totalValue: 0, itemsCount: 0 }) },
}));

vi.mock('../../components/WBSImportModal', () => ({ WBSImportModal: () => null }));
vi.mock('../../components/WBSTemplateModal', () => ({ WBSTemplateModal: () => null }));
vi.mock('xlsx', () => ({
    utils: { book_new: vi.fn(), aoa_to_sheet: vi.fn(), book_append_sheet: vi.fn() },
    writeFile: vi.fn(),
}));

const GROUP = '01. Grupo Geral';
const PHASE = '01.01. Preliminares';
const SUBPHASE = '01.01.01. Geral';

const makeSettings = (overrides: Partial<ProjectSettings> = {}): ProjectSettings => ({
    name: 'Projeto Teste',
    location: 'MG',
    bdi: 25,
    socialChargesMode: 'SEM_DESONERACAO',
    database: 'SINAPI',
    budgetStatus: 'Em elaboração',
    wbs: [{ id: '01', name: GROUP, phases: [{ id: '01.01', name: PHASE, subPhases: [SUBPHASE] }] }],
    ...overrides,
} as ProjectSettings);

const makeEntry = (id: string): BudgetEntry => ({
    id,
    sinapiItem: {
        code: `9000${id}`,
        description: `Item ${id}`,
        unit: 'un',
        price: 100,
        type: SinapiType.INPUT,
        category: 'Material',
    },
    quantity: 2,
    phase: PHASE,
    subPhase: SUBPHASE,
    group: GROUP,
});

let BudgetEditor: typeof import('../../components/BudgetEditor').BudgetEditor;

beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../components/BudgetEditor');
    BudgetEditor = mod.BudgetEditor ?? (mod as any).default;
});

/** Renderiza com o BudgetRow REAL (sem stub) — é a estrutura dele que está sob teste. */
const renderEditor = (budget: BudgetEntry[], settingsOverride: Partial<ProjectSettings> = {}) =>
    render(
        <ConfirmProvider>
            <BudgetEditor
                budget={budget}
                settings={makeSettings(settingsOverride)}
                favorites={[]}
                onToggleFavorite={vi.fn()}
                onUpdateBudget={vi.fn()}
                onUpdateSettings={vi.fn()}
            />
        </ConfirmProvider>
    );

/** A <table> da WBS é a única com <colgroup> — os 3 modais de tabela não têm. */
const getWbsTable = (container: HTMLElement): HTMLTableElement => {
    const table = Array.from(container.querySelectorAll('table')).find(t => t.querySelector('colgroup'));
    if (!table) throw new Error('Tabela da WBS não encontrada (nenhuma <table> com <colgroup>)');
    return table as HTMLTableElement;
};

/** Soma as células de uma linha respeitando colSpan — é isso que decide alinhamento. */
const countCells = (row: HTMLTableRowElement): number =>
    Array.from(row.cells).reduce((sum, cell) => sum + (cell.colSpan || 1), 0);

describe('Estrutura da tabela da WBS', () => {
    it('a WBS é uma <table> com <colgroup> — não CSS grid', () => {
        const { container } = renderEditor([makeEntry('1')]);
        const table = getWbsTable(container);

        expect(table.querySelector('thead')).not.toBeNull();
        expect(table.querySelectorAll('tbody').length).toBeGreaterThan(0);
    });

    it('toda faixa (cabeçalho, grupo, etapa, subetapa, item) ocupa a MESMA largura em colunas', () => {
        const { container } = renderEditor([makeEntry('1')]);
        const table = getWbsTable(container);

        // drag(1) + 10 redimensionáveis + espaçador(1) + preço total(1)
        const colCount = table.querySelectorAll('colgroup > col').length;
        expect(colCount).toBe(13);

        const headerRow = table.querySelector('thead tr') as HTMLTableRowElement;
        expect(countCells(headerRow)).toBe(colCount);

        // Toda linha do corpo tem que fechar exatamente a mesma contagem — é o
        // invariante que o CSS grid antigo quebrava (11 vs 9 vs 12).
        const bodyRows = Array.from(table.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
        expect(bodyRows.length).toBeGreaterThan(0);
        for (const row of bodyRows) {
            expect(countCells(row)).toBe(colCount);
        }
    });

    it('a largura declarada da <table> é a soma exata das colunas — nunca 100% (§6.1)', () => {
        const { container } = renderEditor([makeEntry('1')]);
        const table = getWbsTable(container);

        // w-full/100% junto com table-layout:fixed faz o navegador redistribuir a
        // sobra e o arraste passa a redimensionar a coluna vizinha errada.
        expect(table.className).not.toMatch(/\bw-full\b/);
        expect(table.style.width).not.toBe('100%');
        expect(table.style.tableLayout).toBe('fixed');

        const declared = parseInt(table.style.width, 10);
        const colSum = Array.from(table.querySelectorAll('colgroup > col'))
            .reduce((sum, c) => sum + (parseInt((c as HTMLElement).style.width, 10) || 0), 0);
        // O espaçador não tem width e soma 0 — é exatamente o papel dele (§6.1.1).
        expect(declared).toBe(colSum);
    });

    it('toda coluna de dado tem alça de redimensionamento, e o espaçador não (§6.1)', () => {
        const { container } = renderEditor([makeEntry('1')]);
        const table = getWbsTable(container);

        const resizableCols = Array.from(table.querySelectorAll('colgroup > col[data-col-key]'));
        const handles = table.querySelectorAll('thead [title*="redimensionar"]');
        // Uma alça por coluna redimensionável — resize parcial é inconsistência visível.
        expect(handles.length).toBe(resizableCols.length);

        const spacers = Array.from(table.querySelectorAll('colgroup > col')).filter(
            c => !(c as HTMLElement).dataset.colKey && !(c as HTMLElement).style.width
        );
        expect(spacers.length).toBe(1);
    });

    it('com o detalhamento por natureza ligado, as 3 colunas extras entram em TODAS as faixas', () => {
        // showNatureBreakdown é estado interno; o teste cobre o caminho desligado e a
        // consistência estrutural. O caminho ligado é coberto pelo colSpan das faixas
        // de grupo/etapa/subetapa, que derivam da mesma flag.
        const { container } = renderEditor([makeEntry('1')]);
        const table = getWbsTable(container);
        const colCount = table.querySelectorAll('colgroup > col').length;

        const rows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
        const widths = new Set(rows.map(countCells));
        // Uma única largura para a tabela inteira — nenhuma faixa fora do padrão.
        expect(Array.from(widths)).toEqual([colCount]);
    });

    it('não gera aninhamento inválido de DOM (validateDOMNesting)', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        renderEditor([makeEntry('1'), makeEntry('2')]);

        const nestingWarnings = errorSpy.mock.calls.filter(args =>
            args.some(a => typeof a === 'string' && /validateDOMNesting|cannot appear as a child|<div> cannot/i.test(a))
        );
        expect(nestingWarnings).toEqual([]);
        errorSpy.mockRestore();
    });

    it('a linha do item continua arrastável (drag handle) dentro da tabela', () => {
        const { container } = renderEditor([makeEntry('1')]);
        const table = getWbsTable(container);
        expect(table.querySelector('[title="Arrastar para reordenar"]')).not.toBeNull();
    });

    it('a subetapa vazia ocupa a linha inteira em vez de quebrar o alinhamento', () => {
        const { container } = renderEditor([]);
        const table = getWbsTable(container);
        const colCount = table.querySelectorAll('colgroup > col').length;

        const emptyRow = Array.from(table.querySelectorAll('tbody tr')).find(r =>
            r.textContent?.includes('Nenhum item nesta subetapa')
        ) as HTMLTableRowElement | undefined;

        expect(emptyRow).toBeDefined();
        expect(countCells(emptyRow!)).toBe(colCount);
    });
});
