import React, { useMemo } from 'react';
import {
    Plus, Calculator, Calendar, History, RefreshCw,
    AlertTriangle, ChevronRight, Wallet, CheckCircle2, Clock3, FileText, MoveHorizontal,
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { PayrollRun } from '../services/payrollService';
import { formatDate } from '../lib/payrollUIHelpers';
import { formatMoney as fmtBRL } from './ui/Format';
import { KpiCard } from './ui/KpiCard';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, useResizableColumns } from './ui/TableUtils';

interface PayrollRunListProps {
    runs: PayrollRun[];
    orgId: string;
    /** Só para resolver o nome da org na coluna Empresa — não há seletor nesta tela. */
    organizations: Array<{ id: string; name: string }>;
    /** Cadastros das duas dimensões contábeis — só para resolver o NOME nas colunas. */
    costCenters: Array<{ id: string; name: string }>;
    planoContas: Array<{ id: string; name: string }>;
    loading: boolean;
    typeFilter: string;
    monthFilter: string;
    yearFilter: string;
    search: string;
    runTotals: Record<string, number>;
    onTypeFilter: (v: string) => void;
    onMonthFilter: (v: string) => void;
    onYearFilter: (v: string) => void;
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
    // Duas dimensões contábeis DISTINTAS: Centro de Custo sai de
    // `cost_centers_v2`, Plano de Contas de `plano_de_contas`. Não confundir
    // uma com a outra nem com Categoria Financeira (`financial_categories`).
    { key: 'cost_center', label: 'Centro de Custo', sortable: true },
    { key: 'plano_contas', label: 'Plano de Contas', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const DEFAULT_COL_WIDTHS: Record<string, number> = {
    period: 220, organization: 200, value: 160, type: 180,
    cost_center: 200, plano_contas: 200, status: 140, actions: 100,
};

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX. 'actions' fica de fora: é célula fixa, não entra no arraste.
const PAYROLL_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    period:       { label: 'Período',      className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    organization: { label: 'Organização',  className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    value:        { label: 'Valor total',  className: 'px-6 py-2 border-r border-gray-100 text-right overflow-hidden' },
    type:         { label: 'Tipo',         className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    cost_center:  { label: 'Centro de Custo', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    plano_contas: { label: 'Plano de Contas', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    status:       { label: 'Status',       className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
};

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `tableColumns.orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna.
function renderPayrollCell(
    key: string,
    run: PayrollRun,
    ctx: {
        orgName: (id: string) => string;
        runTotals: Record<string, number>;
        costCenterName: (id?: string | null) => string;
        planoContasName: (id?: string | null) => string;
    },
): React.ReactNode {
    const isClosed = run.status === 'FECHADO';
    const hasWarning = run.validation_logs && run.validation_logs.length > 0;
    switch (key) {
        case 'period':
            return (
                <div className="flex items-center gap-2">
                    <Calendar className={`w-3.5 h-3.5 shrink-0 ${isClosed ? 'text-emerald-500' : 'text-amber-500'}`} />
                    <span className="text-sm font-normal text-gray-700 whitespace-nowrap">
                        {formatDate(run.start_date)}
                        <span className="text-gray-400 mx-1">→</span>
                        {formatDate(run.end_date)}
                    </span>
                </div>
            );
        case 'organization':
            return <span className="text-sm font-normal text-gray-600">{ctx.orgName(run.org_id)}</span>;
        case 'value':
            return (
                <div className="text-right">
                    {ctx.runTotals[run.id] != null ? (
                        <span className="text-sm font-medium text-gray-800">{fmtBRL(ctx.runTotals[run.id])}</span>
                    ) : (
                        <span className="text-sm font-normal text-gray-300">—</span>
                    )}
                </div>
            );
        case 'type':
            return (
                <span className={`text-sm font-normal ${TYPE_COLORS[run.type] ?? 'text-gray-600'}`}>
                    {TYPE_LABELS[run.type] ?? run.type}{run.subtype ? ` · ${run.subtype}` : ''}
                </span>
            );
        // Texto livre de largura fixa: `truncate` só recorta com `block`, e o
        // `title` devolve o texto inteiro no hover (§6.1.2 do guia de UI).
        case 'cost_center': {
            const nome = ctx.costCenterName(run.cost_center_id);
            return nome
                ? <span className="block truncate text-sm font-normal text-gray-700" title={nome}>{nome}</span>
                : <span className="text-sm font-normal text-gray-300">—</span>;
        }
        case 'plano_contas': {
            const nome = ctx.planoContasName(run.plano_de_contas_id);
            return nome
                ? <span className="block truncate text-sm font-normal text-gray-700" title={nome}>{nome}</span>
                : <span className="text-sm font-normal text-gray-300">—</span>;
        }
        case 'status':
            return (
                <div className="flex items-center gap-1.5">
                    <span className={`text-sm font-normal ${STATUS_COLORS[run.status] ?? 'text-gray-600'}`}>
                        {isClosed ? 'Fechado' : 'Rascunho'}
                    </span>
                    {hasWarning && <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                </div>
            );
        default:
            return null;
    }
}

const PayrollRunList: React.FC<PayrollRunListProps> = ({
    runs, orgId, organizations, costCenters, planoContas, loading,
    typeFilter, monthFilter, yearFilter, search, runTotals,
    onTypeFilter, onMonthFilter, onYearFilter, onSearch,
    onSelectRun, onDeleteRun, onDuplicateRun, onNewRun, onRefresh,
}) => {
    const tableColumns = useTableColumns(COLUMNS, 'payrollRunListColumns');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'payrollRunListColWidths');

    const orgName = (id: string) => organizations.find(o => o.id === id)?.name ?? '—';
    const costCenterName  = (id?: string | null) => (id ? costCenters.find(c => c.id === id)?.name ?? '' : '');
    const planoContasName = (id?: string | null) => (id ? planoContas.find(p => p.id === id)?.name ?? '' : '');

    // Largura total = soma exata das colunas visíveis (nunca w-full — ver §6.1 do guia de UI).
    const tableTotalWidth = tableColumns.orderedVisibleColumns.reduce((sum, key) => sum + cols.getWidth(key), 0);

    const filteredRuns = useMemo(() => {
        const term = search.trim().toLowerCase();
        const base = !term ? runs : runs.filter(r =>
            orgName(r.org_id).toLowerCase().includes(term) ||
            formatDate(r.start_date).toLowerCase().includes(term) ||
            formatDate(r.end_date).toLowerCase().includes(term) ||
            costCenterName(r.cost_center_id).toLowerCase().includes(term) ||
            planoContasName(r.plano_de_contas_id).toLowerCase().includes(term)
        );
        if (!tableColumns.sortColumn) return base;
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        return [...base].sort((a, b) => {
            switch (tableColumns.sortColumn) {
                case 'period': return dir * a.start_date.localeCompare(b.start_date);
                case 'organization': return dir * orgName(a.org_id).localeCompare(orgName(b.org_id));
                case 'value': return dir * ((runTotals[a.id] || 0) - (runTotals[b.id] || 0));
                case 'type': return dir * a.type.localeCompare(b.type);
                case 'cost_center': return dir * costCenterName(a.cost_center_id).localeCompare(costCenterName(b.cost_center_id));
                case 'plano_contas': return dir * planoContasName(a.plano_de_contas_id).localeCompare(planoContasName(b.plano_de_contas_id));
                case 'status': return dir * a.status.localeCompare(b.status);
                default: return 0;
            }
        });
    }, [runs, search, tableColumns.sortColumn, tableColumns.sortDirection, runTotals, organizations, costCenters, planoContas]);

    const totalValue = runs.reduce((s, r) => s + (runTotals[r.id] || 0), 0);
    const closedCount = runs.filter(r => r.status === 'FECHADO').length;
    const draftCount = runs.filter(r => r.status !== 'FECHADO').length;

    return (
        <div className="space-y-6">
            {/* Título e barra de abas vivem no pai (`LaborPayroll`), que é quem
                conhece a aba ativa — §19.3/§20 do guia de UI. O filtro de tipo
                de folha, que era uma segunda barra de abas aqui, virou um
                <select> na toolbar da tabela: navegação e recorte não podem
                usar a mesma régua visual. */}

            {/* 3. KPI cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                <KpiCard label="Ciclos no Período" value={`${runs.length}`} icon={<FileText className="w-5 h-5" />} color="indigo" />
                <KpiCard label="Valor Total" value={fmtBRL(totalValue)} icon={<Wallet className="w-5 h-5" />} color="blue" />
                <KpiCard label="Fechadas" value={`${closedCount}`} icon={<CheckCircle2 className="w-5 h-5" />} color="emerald" />
                <KpiCard label="Em Rascunho" value={`${draftCount}`} icon={<Clock3 className="w-5 h-5" />} color="amber" />
            </div>

            {/* 4. Tabela com toolbar acoplada — busca, escopo (mês/ano), colunas/autofit e ação primária */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white space-y-3">
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

                        {/* Tipo de folha — era barra de abas até 2026-08-23, virou
                            recorte junto de Mês/Ano quando a tela ganhou abas de
                            navegação (Ciclos / Alocações). */}
                        <select
                            value={typeFilter}
                            onChange={e => onTypeFilter(e.target.value)}
                            className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer shrink-0"
                        >
                            <option value="all">Tipo (todos)</option>
                            {['mensal', 'adiantamento', 'ferias', 'decimo_terceiro', 'rescisao'].map(t => (
                                <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>
                            ))}
                        </select>

                        {/* Sem seletor de organização aqui: vem do seletor global do topo. */}
                        <select
                            value={monthFilter}
                            onChange={e => onMonthFilter(e.target.value)}
                            className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer shrink-0"
                        >
                            <option value="all">Mês (todos)</option>
                            {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'].map((m, i) => (
                                <option key={m} value={i}>{m}</option>
                            ))}
                        </select>
                        <select
                            value={yearFilter}
                            onChange={e => onYearFilter(e.target.value)}
                            className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer shrink-0"
                        >
                            <option value="all">Ano (todos)</option>
                            <option value="2025">2025</option>
                            <option value="2026">2026</option>
                            <option value="2027">2027</option>
                        </select>

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
                            {/* Autofit sob comando explícito — nunca automático (§6.1.2 do guia de UI) */}
                            <button
                                onClick={() => cols.autoFit()}
                                className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                title="Ajustar largura das colunas ao conteúdo"
                            >
                                <MoveHorizontal className="w-4 h-4" />
                            </button>
                        </div>

                        <button
                            onClick={onNewRun}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-indigo-600 text-white rounded-[6px] hover:bg-indigo-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                        >
                            {!orgId || orgId === 'all' ? (<><Calculator className="w-[15px] h-[15px]" /> Gerar folhas em lote</>) : (<><Plus className="w-[15px] h-[15px]" /> Nova folha</>)}
                        </button>
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
                        <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                            <colgroup>
                                {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                    <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                                ))}
                                {/* espaçador — absorve a folga ANTES de "Ações" (§6.1.1 do guia de UI) */}
                                <col />
                                <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                            </colgroup>
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => {
                                        const def = PAYROLL_COLUMN_HEADERS[key];
                                        if (!def) return null;
                                        return (
                                            <SortableHeader
                                                key={key}
                                                colKey={key}
                                                label={def.label}
                                                sortable={def.sortable !== false}
                                                uppercase={false}
                                                sortColumn={tableColumns.sortColumn}
                                                sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                onMoveColumn={tableColumns.moveColumn}
                                                className={def.className}
                                            >
                                                <cols.ResizeHandle colKey={key} />
                                            </SortableHeader>
                                        );
                                    })}
                                    {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500 relative overflow-hidden">
                                            Ações
                                            <cols.ResizeHandle colKey="actions" />
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredRuns.map(run => {
                                    return (
                                        <tr
                                            key={run.id}
                                            onClick={() => onSelectRun(run)}
                                            className="hover:bg-indigo-50/50 transition-colors cursor-pointer group"
                                        >
                                            {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                                <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 overflow-hidden">
                                                    {renderPayrollCell(key, run, { orgName, runTotals, costCenterName, planoContasName })}
                                                </td>
                                            ))}
                                            {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                            <td aria-hidden="true" className="border-r border-gray-100"></td>
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
