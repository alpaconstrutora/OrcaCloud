import React, { useEffect, useMemo, useState } from 'react';
import { Search, MoveHorizontal, Inbox } from 'lucide-react';
import {
    ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader,
    usePersistedState, usePersistedScopedSearch, useResizableColumns,
} from './TableUtils';

/**
 * Tabela padrão — §5.2 (toolbar acoplada) + §6.1 (redimensionar/autofit) de
 * `docs/ui_ux_guia_unificado.md`, em componente. Ver §6.10 do guia.
 *
 * O que ele embute, para a tela não copiar à mão (e divergir na cópia):
 *  - busca persistida (§3) — `usePersistedState`, ou escopada por registro
 *    (`searchScope`) quando a tabela vive dentro de um pedido/contrato;
 *  - engrenagem de colunas visíveis + botão de autofit `MoveHorizontal` (§6.1.2),
 *    autofit só sob comando — nunca automático;
 *  - `<table>` com largura = SOMA exata das colunas (nunca `w-full` com
 *    `table-layout: fixed`), `<colgroup>` e `<col />` espaçador ANTES de "Ações"
 *    nas três listas (§6.1.1);
 *  - `SortableHeader` sentence case (§6.2) com `ResizeHandle` e arrastar coluna;
 *  - `px-6 py-2.5 border-r border-gray-100` em toda célula (§6.6/§7.2), ou `px-3`
 *    com `dense` quando a tabela está dentro de `Sheet`/modal (§6.9);
 *  - cabeçalho fixo (§6.5), loading (§11) e empty state (§12) sem moldura própria;
 *  - paginação §6.7 OPT-IN (`pagination`): o corte acontece DEPOIS da busca e da
 *    ordenação, que vivem aqui dentro — fatiar `rows` do lado de fora faria a
 *    busca enxergar só a página. Sem a prop, nada muda: rolagem com cabeçalho
 *    fixo, como as tabelas de RH sempre foram.
 *
 * A tela declara só: colunas (com largura inicial), `renderCell`, `sortValue`,
 * `searchText` e, se houver, `actions`. Tipografia das células continua sendo
 * responsabilidade de quem renderiza (§7): `text-sm font-normal text-gray-700`,
 * `font-medium` só em valor financeiro.
 */
export interface StandardTableColumn extends ColumnConfig {
    /** Largura inicial em px — o autofit e o arraste ajustam a partir daqui. */
    width: number;
    align?: 'left' | 'right' | 'center';
}

interface StandardTableProps<T> {
    /** Colunas de DADO — "Ações" entra por `actions`, não aqui. */
    columns: StandardTableColumn[];
    /** Chave única da tabela no localStorage (colunas, larguras e busca derivam dela). */
    storageKey: string;
    rows: T[];
    rowKey: (row: T) => string;
    renderCell: (key: string, row: T) => React.ReactNode;
    /** Valor comparável por coluna para ordenar. Sem ele, ordena por `row[key]`. */
    sortValue?: (key: string, row: T) => string | number | boolean | null | undefined;
    /** Texto em que a busca procura. Sem ele, a toolbar não tem campo de busca
     *  (só aceitável quando a tela já filtra por fora e diz por quê). */
    searchText?: (row: T) => string;
    searchPlaceholder?: string;
    /** Busca controlada pela tela (quando o mesmo termo filtra outra visão — ex.: cards/lista).
     *  Sem estes dois, a tabela guarda a própria busca persistida. */
    search?: string;
    onSearchChange?: (value: string) => void;
    /** Tabela dentro de um registro (pedido, contrato): a busca é guardada por
     *  {escopo, termo} e some ao trocar de registro — ver `usePersistedScopedSearch`. */
    searchScope?: string;
    /** Coluna "Ações" — sempre a última, sempre visível, nunca ordenável (§9). */
    actions?: { render: (row: T) => React.ReactNode; width?: number; label?: string };
    onRowClick?: (row: T) => void;
    rowClassName?: (row: T) => string;
    loading?: boolean;
    empty?: { icon?: React.ReactNode; title: string; subtitle?: string };
    /** §6.9 — dentro de `Sheet`/modal a largura é escassa: `px-3` em vez de `px-6`. */
    dense?: boolean;
    /** Controles extras da toolbar (selects de filtro, `AdvancedFilterPanel`). */
    filters?: React.ReactNode;
    /** Slot no fim da toolbar (ex.: ação primária §17 quando não há barra §5.3). */
    toolbarRight?: React.ReactNode;
    /** Linha(s) acima da toolbar dentro do mesmo card — ex.: sub-abas (§19.1 acoplada). */
    toolbarTop?: React.ReactNode;
    /** Rodapé dentro do card (totais, avisos). Vem DEPOIS do rodapé de paginação, se houver. */
    footer?: React.ReactNode;
    /** Paginação §6.7 (opt-in). Tamanho da página persiste por `storageKey`;
     *  a página atual NÃO — volta para a 1 a cada mudança de busca/recorte/ordenação.
     *  "Selecionar todos" (§10) passa a marcar só a página visível.
     *  ⚠️ O recorte é detectado pela IDENTIDADE de `rows`: a tela deve passar um
     *  array estável (`useMemo`), não um `.filter()` inline — senão a página zera
     *  a cada render. */
    pagination?: { pageSizes?: number[]; defaultPageSize?: number };
    /** Linha extra no fim do `<tbody>` (totais). Recebe o número de colunas visíveis. */
    renderTotals?: (visibleCount: number) => React.ReactNode;
    /** Linha de detalhe logo abaixo da linha — só renderiza quando devolve algo. */
    renderExpanded?: (row: T, visibleCount: number) => React.ReactNode;
    maxHeight?: string;
    /** Sem moldura própria — quando a tabela já vive dentro de um card do pai. */
    bare?: boolean;
    /** Seleção em lote (§10): coluna de checkbox à esquerda, só nas linhas que
     *  `canSelect` aceita. "Selecionar todos" marca só as linhas visíveis. */
    selection?: {
        selected: Set<string>;
        onChange: (next: Set<string>) => void;
        canSelect?: (row: T) => boolean;
    };
}

export function StandardTable<T>({
    columns, storageKey, rows, rowKey, renderCell, sortValue, searchText, searchPlaceholder = 'Buscar...',
    search: controlledSearch, onSearchChange, searchScope, actions, onRowClick, rowClassName, loading, empty, dense, filters, toolbarRight, toolbarTop,
    footer, renderTotals, renderExpanded, maxHeight = '70vh', bare, selection, pagination,
}: StandardTableProps<T>) {
    const allColumns: ColumnConfig[] = useMemo(
        () => (actions ? [...columns, { key: 'actions', label: actions.label ?? 'Ações', sortable: false }] : columns),
        [columns, actions],
    );
    const defaultWidths = useMemo(() => {
        const w: Record<string, number> = {};
        columns.forEach(c => { w[c.key] = c.width; });
        if (actions) w.actions = actions.width ?? 120;
        return w;
    }, [columns, actions]);

    const tableColumns = useTableColumns(allColumns, `${storageKey}:columns`);
    const cols = useResizableColumns(defaultWidths, `${storageKey}:widths`);

    // Busca persistida (§3). Escopada quando a tabela vive dentro de um registro.
    const [plainSearch, setPlainSearch] = usePersistedState<string>(`${storageKey}:search`, '');
    // Chave própria: os dois hooks sempre rodam (regra dos hooks) e gravam formatos diferentes.
    const [scopedSearch, setScopedSearch] = usePersistedScopedSearch(`${storageKey}:searchScoped`, searchScope ?? '');
    const search = controlledSearch !== undefined ? controlledSearch : searchScope !== undefined ? scopedSearch : plainSearch;
    const setSearch = onSearchChange ?? (searchScope !== undefined ? setScopedSearch : setPlainSearch);

    const byKey = useMemo(() => Object.fromEntries(columns.map(c => [c.key, c])), [columns]);
    const getSort = sortValue ?? ((key: string, row: T) => (row as Record<string, unknown>)[key] as string | number | null);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        const base = term && searchText ? rows.filter(r => searchText(r).toLowerCase().includes(term)) : rows;
        const col = tableColumns.sortColumn;
        if (!col || col === 'actions') return base;
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        return [...base].sort((a, b) => {
            const va = getSort(col, a);
            const vb = getSort(col, b);
            if (va == null && vb == null) return 0;
            if (va == null) return 1;
            if (vb == null) return -1;
            if (typeof va === 'number' && typeof vb === 'number') return dir * (va - vb);
            if (typeof va === 'boolean' && typeof vb === 'boolean') return dir * (Number(va) - Number(vb));
            return dir * String(va).localeCompare(String(vb), 'pt-BR', { numeric: true });
        });
    }, [rows, search, searchText, tableColumns.sortColumn, tableColumns.sortDirection, getSort]);

    // Paginação §6.7 — só quando a tela pede. Tamanho persiste, página atual não.
    const pageSizes = pagination?.pageSizes ?? [50, 100, 200, 500];
    const [pageSize, setPageSize] = usePersistedState<number>(`${storageKey}:pageSize`, pagination?.defaultPageSize ?? pageSizes[0]);
    const [page, setPage] = useState(1);
    // Qualquer mudança de recorte (linhas, busca, ordenação, tamanho) volta para a 1.
    useEffect(() => { setPage(1); }, [rows, search, tableColumns.sortColumn, tableColumns.sortDirection, pageSize]);
    const totalPages = pagination ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
    const currentPage = Math.min(page, totalPages);
    const pageStart = pagination ? (currentPage - 1) * pageSize : 0;
    const visibleRows = useMemo(
        () => (pagination ? filtered.slice(pageStart, pageStart + pageSize) : filtered),
        [pagination, filtered, pageStart, pageSize],
    );

    const dataKeys = tableColumns.orderedVisibleColumns.filter(k => k !== 'actions' && byKey[k]);
    const showActions = !!actions && tableColumns.visibleColumns.includes('actions');

    // Largura = SOMA exata das colunas visíveis (§6.1) — nunca w-full com table-layout: fixed.
    const tableTotalWidth = dataKeys.reduce((sum, k) => sum + cols.getWidth(k), 0) + (showActions ? cols.getWidth('actions') : 0);

    const px = dense ? 'px-3' : 'px-6';
    const alignClass = (key: string) => {
        const a = byKey[key]?.align;
        return a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : '';
    };
    const visibleCount = dataKeys.length + 1 + (showActions ? 1 : 0) + (selection ? 1 : 0);

    // Seleção em lote (§10) — só sobre as linhas visíveis e selecionáveis.
    const selectableVisible = selection ? visibleRows.filter(r => selection.canSelect?.(r) ?? true) : [];
    const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every(r => selection!.selected.has(rowKey(r)));
    const toggleAllVisible = () => {
        if (!selection) return;
        const next = new Set(selection.selected);
        if (allVisibleSelected) selectableVisible.forEach(r => next.delete(rowKey(r)));
        else selectableVisible.forEach(r => next.add(rowKey(r)));
        selection.onChange(next);
    };
    const toggleOne = (id: string) => {
        if (!selection) return;
        const next = new Set(selection.selected);
        if (next.has(id)) next.delete(id); else next.add(id);
        selection.onChange(next);
    };

    return (
        <div className={bare ? '' : 'bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden'}>
            {/* Toolbar acoplada (§5.2) — sem moldura própria; a única linha é o border-b */}
            <div className="p-2 border-b border-gray-100 bg-white space-y-3">
                {toolbarTop}
                <div className="flex flex-col md:flex-row gap-2.5 items-center">
                    {searchText && (
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder={searchPlaceholder}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                    )}
                    {filters && <div className="flex flex-wrap items-center gap-2 shrink-0">{filters}</div>}
                    {!searchText && !filters && <div className="flex-1" />}
                    <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>
                    <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                        <ColumnConfigButton
                            columns={columns}
                            visibleColumns={tableColumns.visibleColumns}
                            showColumnConfig={tableColumns.showColumnConfig}
                            onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                            onToggleColumn={tableColumns.toggleColumn}
                            onReset={tableColumns.resetColumns}
                        />
                        {/* Autofit sob comando explícito, nunca automático (§6.1.2) */}
                        <button
                            onClick={() => cols.autoFit()}
                            className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                            title="Ajustar largura das colunas ao conteúdo"
                        >
                            <MoveHorizontal className="w-4 h-4" />
                        </button>
                    </div>
                    {toolbarRight}
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-12">
                    {empty?.icon ?? <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-4" />}
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{empty?.title ?? 'Nenhum registro encontrado'}</h3>
                    <p className="text-sm text-gray-500">{empty?.subtitle ?? (search ? 'Tente ajustar a busca.' : '')}</p>
                </div>
            ) : (
                <div className="overflow-auto" style={{ maxHeight }}>
                    <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth + (selection ? 40 : 0), minWidth: '100%' }}>
                        <colgroup>
                            {selection && <col style={{ width: '40px' }} />}
                            {dataKeys.map(key => (
                                <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                            ))}
                            {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio */}
                            <col />
                            {showActions && <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />}
                        </colgroup>
                        <thead>
                            <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                {selection && (
                                    <th className="w-10 px-4 py-2 border-r border-gray-100 text-center">
                                        <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
                                            checked={allVisibleSelected} disabled={selectableVisible.length === 0} onChange={toggleAllVisible} />
                                    </th>
                                )}
                                {dataKeys.map(key => (
                                    <SortableHeader key={key} colKey={key} label={byKey[key].label} sortable={byKey[key].sortable !== false} uppercase={false}
                                        sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                        onSort={tableColumns.handleColumnSort}
                                        onMoveColumn={tableColumns.moveColumn}
                                        className={`${px} py-2 border-r border-gray-100 overflow-hidden ${alignClass(key)}`}>
                                        <cols.ResizeHandle colKey={key} />
                                    </SortableHeader>
                                ))}
                                {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                <th aria-hidden="true" className="border-r border-gray-100" />
                                {showActions && (
                                    <th className={`${px} py-2 text-right relative overflow-hidden text-sm font-semibold text-gray-500`}>
                                        {actions!.label ?? 'Ações'}
                                        <cols.ResizeHandle colKey="actions" />
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {visibleRows.map(row => (
                                <React.Fragment key={rowKey(row)}>
                                <tr
                                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                                    className={`hover:bg-blue-50/50 transition-colors ${onRowClick ? 'cursor-pointer' : ''} ${rowClassName?.(row) ?? ''}`}
                                >
                                    {selection && (
                                        <td className="px-4 py-2.5 border-r border-gray-100 text-center" onClick={e => e.stopPropagation()}>
                                            {(selection.canSelect?.(row) ?? true) && (
                                                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    checked={selection.selected.has(rowKey(row))} onChange={() => toggleOne(rowKey(row))} />
                                            )}
                                        </td>
                                    )}
                                    {dataKeys.map(key => (
                                        <td key={key} className={`${px} py-2.5 border-r border-gray-100 ${alignClass(key)}`}>
                                            {renderCell(key, row)}
                                        </td>
                                    ))}
                                    {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                    <td aria-hidden="true" className="border-r border-gray-100"></td>
                                    {showActions && (
                                        <td className={`${px} py-2.5 text-right`} onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-1.5">{actions!.render(row)}</div>
                                        </td>
                                    )}
                                </tr>
                                {renderExpanded?.(row, visibleCount)}
                                </React.Fragment>
                            ))}
                            {renderTotals?.(visibleCount)}
                        </tbody>
                    </table>
                </div>
            )}
            {/* Rodapé de paginação §6.7 — mesmo desenho do Extrato (BankReconciliation) */}
            {pagination && !loading && filtered.length > 0 && (
                <div className="flex items-center justify-between gap-4 px-6 py-3 border-t border-gray-100 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                        <span>{`${pageStart + 1}–${Math.min(pageStart + pageSize, filtered.length)} de ${filtered.length.toLocaleString('pt-BR')}`}</span>
                        <select
                            value={pageSize}
                            onChange={e => setPageSize(Number(e.target.value))}
                            className="h-8 px-2 rounded-[6px] border border-gray-200 bg-white text-sm text-gray-600"
                            title="Linhas por página"
                        >
                            {pageSizes.map(n => <option key={n} value={n}>{n} por página</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, Math.min(p, totalPages) - 1))}
                            disabled={currentPage <= 1}
                            className="h-8 px-3 rounded-[6px] border border-gray-200 bg-white text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                            Anterior
                        </button>
                        <span>Página {currentPage} de {totalPages}</span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, Math.min(p, totalPages) + 1))}
                            disabled={currentPage >= totalPages}
                            className="h-8 px-3 rounded-[6px] border border-gray-200 bg-white text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                            Próxima
                        </button>
                    </div>
                </div>
            )}
            {footer}
        </div>
    );
}

export default StandardTable;
