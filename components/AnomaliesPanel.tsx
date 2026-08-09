import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ShieldAlert, Copy, TrendingUp, RefreshCw, Landmark, FileText, AlertTriangle, Search, MoveHorizontal, ChevronDown, AlertCircle,
} from 'lucide-react';
import { reconciliationAnomalyService } from '../services/reconciliationAnomalyService';
import { useToast } from '../hooks/useToast';
import { KpiCard } from './ui/KpiCard';
import { ColumnConfig, useTableColumns, useResizableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import type { ReconciliationAnomalies } from '../types/financial';

function sortValue<T>(row: T, key: string): unknown {
    return (row as unknown as Record<string, unknown>)[key];
}

function formatBRL(v: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}
function formatDate(d?: string | null): string {
    if (!d) return '—';
    const [y, m, day] = d.split('T')[0].split('-');
    return `${day}/${m}/${y}`;
}

const DUPLICATE_COLUMNS: ColumnConfig[] = [
    { key: 'party', label: 'Contraparte', sortable: true },
    { key: 'source', label: 'Origem', sortable: true },
    // Datas = date_a + date_b combinados — sem valor único óbvio pra ordenar (§6.3, exceção documentada).
    { key: 'dates', label: 'Datas', sortable: false },
    { key: 'days_apart', label: 'Intervalo', sortable: true },
    { key: 'amount', label: 'Valor', sortable: true },
];
const DUPLICATE_COL_WIDTHS: Record<string, number> = { party: 220, source: 120, dates: 190, days_apart: 110, amount: 130 };

const OUTLIER_COLUMNS: ColumnConfig[] = [
    { key: 'party', label: 'Contraparte', sortable: true },
    { key: 'category', label: 'Categoria', sortable: true },
    { key: 'dt', label: 'Data', sortable: true },
    { key: 'avg_a', label: 'Média histórica', sortable: true },
    { key: 'z', label: 'Desvio', sortable: true },
    { key: 'amount', label: 'Valor', sortable: true },
];
const OUTLIER_COL_WIDTHS: Record<string, number> = { party: 220, category: 150, dt: 110, avg_a: 140, z: 100, amount: 130 };

interface TableCardProps {
    title: string;
    subtitle: string;
    icon: React.ElementType;
    accentBg: string;
    accentText: string;
    count: number;
    searchValue: string;
    onSearchChange: (v: string) => void;
    searchPlaceholder: string;
    columns: ColumnConfig[];
    tableColumns: ReturnType<typeof useTableColumns>;
    cols: ReturnType<typeof useResizableColumns>;
    loading: boolean;
    children: React.ReactNode;
}
function TableCard({
    title, subtitle, icon: Icon, accentBg, accentText, count,
    searchValue, onSearchChange, searchPlaceholder,
    columns, tableColumns, cols, loading, children,
}: TableCardProps) {
    const [open, setOpen] = useState(true);
    return (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors">
                <div className={`w-9 h-9 rounded-[6px] flex items-center justify-center flex-shrink-0 ${accentBg} ${accentText}`}>
                    <Icon className="w-4 h-4" />
                </div>
                <div className="text-left flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800">{title}</p>
                    <p className="text-xs text-gray-400 font-medium">{subtitle}</p>
                </div>
                <span className={`text-sm font-semibold ${count > 0 ? accentText : 'text-gray-300'}`}>{count}</span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="border-t border-gray-100">
                    <div className="p-3 border-b border-gray-100 flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                value={searchValue}
                                onChange={e => onSearchChange(e.target.value)}
                                placeholder={searchPlaceholder}
                                className="w-full h-9 pl-9 pr-4 bg-gray-50 border border-transparent rounded-[6px] text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={columns}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                            <button
                                onClick={() => cols.autoFit()}
                                className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                title="Ajustar largura das colunas ao conteúdo"
                            >
                                <MoveHorizontal className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    {loading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500 text-sm">Carregando...</p>
                        </div>
                    ) : count === 0 ? (
                        <div className="text-center py-10">
                            <Icon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                            <h3 className="text-sm font-bold text-gray-900 mb-1">Nada suspeito por aqui</h3>
                            <p className="text-xs text-gray-500">Nenhuma ocorrência deste tipo no momento.</p>
                        </div>
                    ) : (
                        <div className="overflow-auto max-h-[420px]">{children}</div>
                    )}
                </div>
            )}
        </div>
    );
}

interface AnomaliesPanelProps {
    organizationId: string | null;
}

const AnomaliesPanel: React.FC<AnomaliesPanelProps> = ({ organizationId }) => {
    const { localToast, showToast } = useToast();
    const [data, setData] = useState<ReconciliationAnomalies | null>(null);
    const [loading, setLoading] = useState(false);

    const [dupSearch, setDupSearch] = usePersistedState<string>('anomalies:dupSearch', '');
    const [outlierSearch, setOutlierSearch] = usePersistedState<string>('anomalies:outlierSearch', '');

    const dupTableColumns = useTableColumns(DUPLICATE_COLUMNS, 'anomaliesDupColumns');
    const outlierTableColumns = useTableColumns(OUTLIER_COLUMNS, 'anomaliesOutlierColumns');
    const dupCols = useResizableColumns(DUPLICATE_COL_WIDTHS, 'anomaliesDupColWidths');
    const outlierCols = useResizableColumns(OUTLIER_COL_WIDTHS, 'anomaliesOutlierColWidths');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setData(await reconciliationAnomalyService.getAnomalies(organizationId));
        } catch (e) {
            console.error('[AnomaliesPanel]', e);
            showToast('Erro ao carregar anomalias', 'error');
        } finally {
            setLoading(false);
        }
    }, [organizationId, showToast]);

    useEffect(() => { load(); }, [load]);

    const c = data?.counts ?? { duplicates: 0, value_outliers: 0 };

    const dupRows = useMemo(() => {
        const term = dupSearch.trim().toLowerCase();
        const rows = (data?.duplicates ?? []).filter(d => !term || d.party.toLowerCase().includes(term));
        const key = dupTableColumns.sortColumn;
        if (!key) return rows;
        const dir = dupTableColumns.sortDirection === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            const av = sortValue(a, key); const bv = sortValue(b, key);
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
            return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
        });
    }, [data?.duplicates, dupSearch, dupTableColumns.sortColumn, dupTableColumns.sortDirection]);

    const outlierRows = useMemo(() => {
        const term = outlierSearch.trim().toLowerCase();
        const rows = (data?.value_outliers ?? []).filter(o => !term || o.party.toLowerCase().includes(term));
        const key = outlierTableColumns.sortColumn;
        if (!key) return rows;
        const dir = outlierTableColumns.sortDirection === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            const av = sortValue(a, key); const bv = sortValue(b, key);
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
            return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
        });
    }, [data?.value_outliers, outlierSearch, outlierTableColumns.sortColumn, outlierTableColumns.sortDirection]);

    const dupVisible = DUPLICATE_COLUMNS.filter(col => dupTableColumns.visibleColumns.includes(col.key));
    const dupTableWidth = dupVisible.reduce((s, col) => s + dupCols.getWidth(col.key), 0);

    const outlierVisible = OUTLIER_COLUMNS.filter(col => outlierTableColumns.visibleColumns.includes(col.key));
    const outlierTableWidth = outlierVisible.reduce((s, col) => s + outlierCols.getWidth(col.key), 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400 font-medium">
                    Análise dos últimos 180 dias. Sinais para investigação — nenhuma alteração é feita automaticamente.
                </p>
                <button
                    onClick={load}
                    disabled={loading}
                    className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95 disabled:opacity-50"
                    title="Atualizar"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <KpiCard label="Possíveis duplicidades" value={c.duplicates} icon={<Copy className="w-5 h-5" />} color="red" />
                <KpiCard label="Valores fora do padrão" value={c.value_outliers} icon={<TrendingUp className="w-5 h-5" />} color="amber" />
            </div>

            {/* Duplicidades */}
            <TableCard
                title="Possíveis duplicidades"
                subtitle="Mesmo valor, direção e contraparte numa janela de até 7 dias"
                icon={Copy}
                accentBg="bg-red-50" accentText="text-red-600"
                count={c.duplicates}
                searchValue={dupSearch} onSearchChange={setDupSearch}
                searchPlaceholder="Buscar por contraparte..."
                columns={DUPLICATE_COLUMNS} tableColumns={dupTableColumns} cols={dupCols}
                loading={loading}
            >
                <table ref={dupCols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: dupTableWidth }}>
                    <colgroup>
                        {dupVisible.map(col => <col key={col.key} data-col-key={col.key} style={{ width: `${dupCols.getWidth(col.key)}px` }} />)}
                    </colgroup>
                    <thead>
                        <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                            {dupTableColumns.visibleColumns.includes('party') && (
                                <SortableHeader colKey="party" label="Contraparte" uppercase={false}
                                    sortColumn={dupTableColumns.sortColumn} sortDirection={dupTableColumns.sortDirection} onSort={dupTableColumns.handleColumnSort}
                                    className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                    <dupCols.ResizeHandle colKey="party" />
                                </SortableHeader>
                            )}
                            {dupTableColumns.visibleColumns.includes('source') && (
                                <SortableHeader colKey="source" label="Origem" uppercase={false}
                                    sortColumn={dupTableColumns.sortColumn} sortDirection={dupTableColumns.sortDirection} onSort={dupTableColumns.handleColumnSort}
                                    className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                    <dupCols.ResizeHandle colKey="source" />
                                </SortableHeader>
                            )}
                            {dupTableColumns.visibleColumns.includes('dates') && (
                                <SortableHeader colKey="dates" label="Datas" sortable={false} uppercase={false}
                                    className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                    <dupCols.ResizeHandle colKey="dates" />
                                </SortableHeader>
                            )}
                            {dupTableColumns.visibleColumns.includes('days_apart') && (
                                <SortableHeader colKey="days_apart" label="Intervalo" uppercase={false}
                                    sortColumn={dupTableColumns.sortColumn} sortDirection={dupTableColumns.sortDirection} onSort={dupTableColumns.handleColumnSort}
                                    className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                    <dupCols.ResizeHandle colKey="days_apart" />
                                </SortableHeader>
                            )}
                            {dupTableColumns.visibleColumns.includes('amount') && (
                                <SortableHeader colKey="amount" label="Valor" uppercase={false}
                                    sortColumn={dupTableColumns.sortColumn} sortDirection={dupTableColumns.sortDirection} onSort={dupTableColumns.handleColumnSort}
                                    className="px-6 py-2 overflow-hidden">
                                    <dupCols.ResizeHandle colKey="amount" />
                                </SortableHeader>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {dupRows.map(d => (
                            <tr key={`${d.id_a}-${d.id_b}`} className="hover:bg-blue-50/50 transition-colors">
                                {dupTableColumns.visibleColumns.includes('party') && (
                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                        <div className="flex items-center gap-2 min-w-0">
                                            {d.source === 'BANK'
                                                ? <Landmark className="w-4 h-4 text-gray-400 shrink-0" />
                                                : <FileText className="w-4 h-4 text-gray-400 shrink-0" />}
                                            <span className="truncate">{d.party}</span>
                                        </div>
                                    </td>
                                )}
                                {dupTableColumns.visibleColumns.includes('source') && (
                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                        {d.source === 'BANK' ? 'Extrato' : 'Lançamentos'}
                                    </td>
                                )}
                                {dupTableColumns.visibleColumns.includes('dates') && (
                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                        {formatDate(d.date_a)} e {formatDate(d.date_b)}
                                    </td>
                                )}
                                {dupTableColumns.visibleColumns.includes('days_apart') && (
                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-red-600">{d.days_apart}d</td>
                                )}
                                {dupTableColumns.visibleColumns.includes('amount') && (
                                    <td className={`px-6 py-2.5 text-sm font-medium ${d.direction === 'CREDIT' ? 'text-emerald-700' : 'text-gray-800'}`}>
                                        {formatBRL(d.amount)} <span className="text-xs text-gray-400 font-normal">×2</span>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </TableCard>

            {/* Valores fora do padrão */}
            <TableCard
                title="Valores fora do padrão"
                subtitle="Pagamento muito acima do histórico do fornecedor (z-score ≥ 3)"
                icon={TrendingUp}
                accentBg="bg-amber-50" accentText="text-amber-600"
                count={c.value_outliers}
                searchValue={outlierSearch} onSearchChange={setOutlierSearch}
                searchPlaceholder="Buscar por contraparte..."
                columns={OUTLIER_COLUMNS} tableColumns={outlierTableColumns} cols={outlierCols}
                loading={loading}
            >
                <table ref={outlierCols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: outlierTableWidth }}>
                    <colgroup>
                        {outlierVisible.map(col => <col key={col.key} data-col-key={col.key} style={{ width: `${outlierCols.getWidth(col.key)}px` }} />)}
                    </colgroup>
                    <thead>
                        <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                            {outlierTableColumns.visibleColumns.includes('party') && (
                                <SortableHeader colKey="party" label="Contraparte" uppercase={false}
                                    sortColumn={outlierTableColumns.sortColumn} sortDirection={outlierTableColumns.sortDirection} onSort={outlierTableColumns.handleColumnSort}
                                    className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                    <outlierCols.ResizeHandle colKey="party" />
                                </SortableHeader>
                            )}
                            {outlierTableColumns.visibleColumns.includes('category') && (
                                <SortableHeader colKey="category" label="Categoria" uppercase={false}
                                    sortColumn={outlierTableColumns.sortColumn} sortDirection={outlierTableColumns.sortDirection} onSort={outlierTableColumns.handleColumnSort}
                                    className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                    <outlierCols.ResizeHandle colKey="category" />
                                </SortableHeader>
                            )}
                            {outlierTableColumns.visibleColumns.includes('dt') && (
                                <SortableHeader colKey="dt" label="Data" uppercase={false}
                                    sortColumn={outlierTableColumns.sortColumn} sortDirection={outlierTableColumns.sortDirection} onSort={outlierTableColumns.handleColumnSort}
                                    className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                    <outlierCols.ResizeHandle colKey="dt" />
                                </SortableHeader>
                            )}
                            {outlierTableColumns.visibleColumns.includes('avg_a') && (
                                <SortableHeader colKey="avg_a" label="Média histórica" uppercase={false}
                                    sortColumn={outlierTableColumns.sortColumn} sortDirection={outlierTableColumns.sortDirection} onSort={outlierTableColumns.handleColumnSort}
                                    className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                    <outlierCols.ResizeHandle colKey="avg_a" />
                                </SortableHeader>
                            )}
                            {outlierTableColumns.visibleColumns.includes('z') && (
                                <SortableHeader colKey="z" label="Desvio" uppercase={false}
                                    sortColumn={outlierTableColumns.sortColumn} sortDirection={outlierTableColumns.sortDirection} onSort={outlierTableColumns.handleColumnSort}
                                    className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                    <outlierCols.ResizeHandle colKey="z" />
                                </SortableHeader>
                            )}
                            {outlierTableColumns.visibleColumns.includes('amount') && (
                                <SortableHeader colKey="amount" label="Valor" uppercase={false}
                                    sortColumn={outlierTableColumns.sortColumn} sortDirection={outlierTableColumns.sortDirection} onSort={outlierTableColumns.handleColumnSort}
                                    className="px-6 py-2 overflow-hidden">
                                    <outlierCols.ResizeHandle colKey="amount" />
                                </SortableHeader>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {outlierRows.map(o => (
                            <tr key={o.id} className="hover:bg-blue-50/50 transition-colors">
                                {outlierTableColumns.visibleColumns.includes('party') && (
                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                                            <span className="truncate">{o.party}</span>
                                        </div>
                                    </td>
                                )}
                                {outlierTableColumns.visibleColumns.includes('category') && (
                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{o.category || '—'}</td>
                                )}
                                {outlierTableColumns.visibleColumns.includes('dt') && (
                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{formatDate(o.dt)}</td>
                                )}
                                {outlierTableColumns.visibleColumns.includes('avg_a') && (
                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{formatBRL(o.avg_a)} ({o.n})</td>
                                )}
                                {outlierTableColumns.visibleColumns.includes('z') && (
                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-amber-600">{o.z}×</td>
                                )}
                                {outlierTableColumns.visibleColumns.includes('amount') && (
                                    <td className="px-6 py-2.5 text-sm font-medium text-red-600">{formatBRL(o.amount)}</td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </TableCard>

            {localToast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {localToast.message}
                </div>
            )}
        </div>
    );
};

export default AnomaliesPanel;
