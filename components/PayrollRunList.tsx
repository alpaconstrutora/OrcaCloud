import React, { useMemo } from 'react';
import {
    Plus, Calculator, Calendar, History, RefreshCw,
    AlertTriangle, ChevronRight, Wallet, CheckCircle2, Clock3, FileText,
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { PayrollRun } from '../services/payrollService';
import { formatDate } from '../lib/payrollUIHelpers';
import { formatMoney as fmtBRL } from './ui/Format';
import { KpiCard } from './ui/KpiCard';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader } from './ui/TableUtils';

interface PayrollRunListProps {
    runs: PayrollRun[];
    orgId: string;
    organizations: Array<{ id: string; name: string }>;
    loading: boolean;
    typeFilter: string;
    monthFilter: string;
    yearFilter: string;
    localOrgId: string;
    search: string;
    runTotals: Record<string, number>;
    onTypeFilter: (v: string) => void;
    onMonthFilter: (v: string) => void;
    onYearFilter: (v: string) => void;
    onLocalOrgId: (v: string) => void;
    onSearch: (v: string) => void;
    onSelectRun: (run: PayrollRun) => void;
    onDeleteRun: (id: string) => void;
    onDuplicateRun: (id: string) => void;
    onNewRun: () => void;
    onRefresh: () => void;
}

const TYPE_LABELS: Record<string, string> = {
    mensal: 'Mensal',
    adiantamento: 'Adiantamento',
    ferias: 'Férias',
    decimo_terceiro: '13º Salário',
    rescisao: 'Rescisão',
};

// Texto simples colorido — sem pílula/fundo/uppercase (guia §8).
const TYPE_COLORS: Record<string, string> = {
    mensal:          'text-indigo-700',
    adiantamento:    'text-amber-700',
    ferias:          'text-emerald-700',
    decimo_terceiro: 'text-violet-700',
    rescisao:        'text-rose-700',
};

const STATUS_COLORS: Record<string, string> = {
    FECHADO: 'text-emerald-700',
    RASCUNHO: 'text-amber-700',
};

const COLUMNS: ColumnConfig[] = [
    { key: 'period', label: 'Período', sortable: true },
    { key: 'organization', label: 'Organização', sortable: true },
    { key: 'value', label: 'Valor total', sortable: true },
    { key: 'type', label: 'Tipo', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const PayrollRunList: React.FC<PayrollRunListProps> = ({
    runs, orgId, organizations, loading,
    typeFilter, monthFilter, yearFilter, localOrgId, search, runTotals,
    onTypeFilter, onMonthFilter, onYearFilter, onLocalOrgId, onSearch,
    onSelectRun, onDeleteRun, onDuplicateRun, onNewRun, onRefresh,
}) => {
    const tableColumns = useTableColumns(COLUMNS, 'payrollRunListColumns');

    const orgName = (id: string) => organizations.find(o => o.id === id)?.name ?? '—';

    const filteredRuns = useMemo(() => {
        const term = search.trim().toLowerCase();
        const base = !term ? runs : runs.filter(r =>
            orgName(r.org_id).toLowerCase().includes(term) ||
            formatDate(r.start_date).toLowerCase().includes(term) ||
            formatDate(r.end_date).toLowerCase().includes(term)
        );
        if (!tableColumns.sortColumn) return base;
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        return [...base].sort((a, b) => {
            switch (tableColumns.sortColumn) {
                case 'period': return dir * a.start_date.localeCompare(b.start_date);
                case 'organization': return dir * orgName(a.org_id).localeCompare(orgName(b.org_id));
                case 'value': return dir * ((runTotals[a.id] || 0) - (runTotals[b.id] || 0));
                case 'type': return dir * a.type.localeCompare(b.type);
                case 'status': return dir * a.status.localeCompare(b.status);
                default: return 0;
            }
        });
    }, [runs, search, tableColumns.sortColumn, tableColumns.sortDirection, runTotals, organizations]);

    const totalValue = runs.reduce((s, r) => s + (runTotals[r.id] || 0), 0);
    const closedCount = runs.filter(r => r.status === 'FECHADO').length;
    const draftCount = runs.filter(r => r.status !== 'FECHADO').length;

    return (
        <div className="space-y-6">
            {/* Cabeçalho de tela (§20) */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Gestão de Folha de Pagamento</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Ciclos de folha, cálculo de INSS, FGTS e IRRF por período.</p>
                </div>
                <button
                    onClick={onNewRun}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-indigo-600 text-white rounded-[6px] hover:bg-indigo-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                >
                    {!orgId || orgId === 'all' ? (<><Calculator className="w-[15px] h-[15px]" /> Gerar folhas em lote</>) : (<><Plus className="w-[15px] h-[15px]" /> Nova folha</>)}
                </button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard label="Ciclos no Período" value={`${runs.length}`} icon={<FileText className="w-5 h-5" />} color="indigo" />
                <KpiCard label="Valor Total" value={fmtBRL(totalValue)} icon={<Wallet className="w-5 h-5" />} color="blue" />
                <KpiCard label="Fechadas" value={`${closedCount}`} icon={<CheckCircle2 className="w-5 h-5" />} color="emerald" />
                <KpiCard label="Em Rascunho" value={`${draftCount}`} icon={<Clock3 className="w-5 h-5" />} color="amber" />
            </div>

            {/* Toolbar acoplada à tabela (§5.2) */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white space-y-3">
                    {/* Abas de tipo (Todas / Mensal / Adiantamento / Férias / 13º / Rescisão) */}
                    <div className="flex flex-wrap items-center gap-1 bg-gray-50 p-1 rounded-[10px] border border-gray-100 max-w-full">
                        {['all', 'mensal', 'adiantamento', 'ferias', 'decimo_terceiro', 'rescisao'].map(t => (
                            <button
                                key={t}
                                onClick={() => onTypeFilter(t)}
                                className={`h-7 px-3 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${typeFilter === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                {t === 'all' ? 'Todas' : (TYPE_LABELS[t] ?? t)}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por organização ou período..."
                                value={search}
                                onChange={e => onSearch(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                            />
                        </div>

                        <select
                            value={monthFilter}
                            onChange={e => onMonthFilter(e.target.value)}
                            className="h-9 px-3 rounded-[6px] text-sm font-medium bg-white border border-gray-200 text-gray-600 outline-none"
                        >
                            <option value="all">Mês (todos)</option>
                            {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'].map((m, i) => (
                                <option key={m} value={i}>{m}</option>
                            ))}
                        </select>
                        <select
                            value={yearFilter}
                            onChange={e => onYearFilter(e.target.value)}
                            className="h-9 px-3 rounded-[6px] text-sm font-medium bg-white border border-gray-200 text-gray-600 outline-none"
                        >
                            <option value="all">Ano (todos)</option>
                            <option value="2025">2025</option>
                            <option value="2026">2026</option>
                            <option value="2027">2027</option>
                        </select>
                        {orgId === 'all' && (
                            <select
                                value={localOrgId}
                                onChange={e => onLocalOrgId(e.target.value)}
                                className="h-9 px-3 rounded-[6px] text-sm font-medium bg-indigo-50 border border-transparent text-indigo-700 outline-none min-w-[150px]"
                            >
                                <option value="">Empresa (todas)</option>
                                {organizations.map(org => (
                                    <option key={org.id} value={org.id}>{org.name}</option>
                                ))}
                            </select>
                        )}

                        <button
                            onClick={onRefresh}
                            title="Atualizar"
                            className="h-9 w-9 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-[6px] hover:bg-indigo-600 hover:text-white transition-all active:scale-95 shrink-0"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>

                        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={COLUMNS.filter(c => c.key !== 'actions')}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filteredRuns.length === 0 ? (
                    <div className="text-center py-12">
                        <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum ciclo encontrado</h3>
                        <p className="text-sm text-gray-500">Clique em "Nova folha" para iniciar o cálculo do período.</p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.visibleColumns.includes('period') && (
                                        <SortableHeader label="Período" colKey="period" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('organization') && (
                                        <SortableHeader label="Organização" colKey="organization" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('value') && (
                                        <SortableHeader label="Valor total" colKey="value" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 text-right" />
                                    )}
                                    {tableColumns.visibleColumns.includes('type') && (
                                        <SortableHeader label="Tipo" colKey="type" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('status') && (
                                        <SortableHeader label="Status" colKey="status" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredRuns.map(run => {
                                    const isClosed = run.status === 'FECHADO';
                                    const hasWarning = run.validation_logs && run.validation_logs.length > 0;
                                    return (
                                        <tr
                                            key={run.id}
                                            onClick={() => onSelectRun(run)}
                                            className="hover:bg-indigo-50/50 transition-colors cursor-pointer group"
                                        >
                                            {tableColumns.visibleColumns.includes('period') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    <div className="flex items-center gap-2">
                                                        <Calendar className={`w-3.5 h-3.5 shrink-0 ${isClosed ? 'text-emerald-500' : 'text-amber-500'}`} />
                                                        <span className="text-sm font-normal text-gray-700 whitespace-nowrap">
                                                            {formatDate(run.start_date)}
                                                            <span className="text-gray-400 mx-1">→</span>
                                                            {formatDate(run.end_date)}
                                                        </span>
                                                    </div>
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('organization') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                    {orgName(run.org_id)}
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('value') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right">
                                                    {runTotals[run.id] != null ? (
                                                        <span className="text-sm font-medium text-gray-800">{fmtBRL(runTotals[run.id])}</span>
                                                    ) : (
                                                        <span className="text-sm font-normal text-gray-300">—</span>
                                                    )}
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('type') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    <span className={`text-sm font-normal ${TYPE_COLORS[run.type] ?? 'text-gray-600'}`}>
                                                        {TYPE_LABELS[run.type] ?? run.type}{run.subtype ? ` · ${run.subtype}` : ''}
                                                    </span>
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('status') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className={`text-sm font-normal ${STATUS_COLORS[run.status] ?? 'text-gray-600'}`}>
                                                            {isClosed ? 'Fechado' : 'Rascunho'}
                                                        </span>
                                                        {hasWarning && <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                                                    </div>
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('actions') && (
                                                <td className="px-6 py-2.5 text-right">
                                                    <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                        <ActionIconButton kind="duplicate" title="Duplicar" onClick={() => onDuplicateRun(run.id)} />
                                                        <ActionIconButton kind="delete" onClick={() => onDeleteRun(run.id)} />
                                                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:translate-x-0.5 transition-transform" />
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PayrollRunList;
