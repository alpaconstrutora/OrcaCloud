import React, { useMemo } from 'react';
import {
    Play, FileText, CheckCircle2, History, Loader2, AlertCircle,
    ArrowLeft, X, ShieldAlert, Plus, RefreshCw, Search, MoveHorizontal,
    Users, TrendingUp, DollarSign,
} from 'lucide-react';
import { PayrollRun } from '../services/payrollService';
import { formatDate } from '../lib/payrollUIHelpers';
import { formatMoney } from './ui/Format';
import Button from './ui/Button';
import ActionIconButton from './ui/ActionIconButton';
import { KpiCard } from './ui/KpiCard';
import { ColumnConfig, useTableColumns, useResizableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';

interface PayrollRunDetailProps {
    run: PayrollRun;
    orgId: string;
    results: any[];
    resultsLoading: boolean;
    executing: boolean;
    onBack: () => void;
    onCloseRun: () => void;
    onReopenRun: () => void;
    onResyncFinance?: () => void;
    onReprocessRun: () => void;
    onDeleteRun: (id: string) => void;
    onOpenEventModal: (employeeId: string, employeeName: string) => void;
    onViewPaystub: (runId: string, employeeId: string) => void;
}

// Coluna Org só existe em modo "todas as organizações" (sem orgId no escopo) —
// por isso fica de fora do array quando orgId está definido, em vez de só
// oculta via ColumnConfig (não faz sentido nem oferecer o toggle).
const BASE_COLUMNS: ColumnConfig[] = [
    { key: 'org', label: 'Org', sortable: true },
    { key: 'employee', label: 'Colaborador', sortable: true },
    { key: 'base_salary', label: 'Salário base', sortable: true },
    { key: 'gross', label: 'Proventos', sortable: true },
    { key: 'discounts', label: 'Descontos', sortable: true },
    { key: 'net', label: 'Líquido', sortable: true },
    { key: 'employer_cost', label: 'Custo empresa', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const DEFAULT_COL_WIDTHS: Record<string, number> = {
    org: 90, employee: 220, base_salary: 140, gross: 130, discounts: 130, net: 130, employer_cost: 150, actions: 110,
};

const PayrollRunDetail: React.FC<PayrollRunDetailProps> = ({
    run, orgId, results, resultsLoading, executing,
    onBack, onCloseRun, onReopenRun, onReprocessRun, onDeleteRun,
    onOpenEventModal, onViewPaystub, onResyncFinance,
}) => {
    const [showAuditModal, setShowAuditModal] = React.useState(false);
    const [search, setSearch] = usePersistedState<string>('payrollRunDetail:search', '');

    const columns = useMemo(() => (orgId ? BASE_COLUMNS.filter(c => c.key !== 'org') : BASE_COLUMNS), [orgId]);
    const tableColumns = useTableColumns(columns, 'payrollRunDetailColumns');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'payrollRunDetailColWidths');

    // KPIs no topo somam a folha inteira — não mudam com a busca da tabela.
    const totalGross        = results.reduce((s, r) => s + (r.gross || 0), 0);
    const totalDiscounts    = results.reduce((s, r) => s + (r.discounts || 0), 0);
    const totalNet          = results.reduce((s, r) => s + (r.net || 0), 0);
    const totalEmployerCost = results.reduce((s, r) => s + (r.employer_cost || 0), 0);

    const filteredResults = useMemo(() => {
        const term = search.trim().toLowerCase();
        const base = !term ? results : results.filter((r: any) =>
            r.employee?.name?.toLowerCase().includes(term) ||
            r.employee?.role?.toLowerCase().includes(term)
        );
        if (!tableColumns.sortColumn) return base;
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        return [...base].sort((a: any, b: any) => {
            switch (tableColumns.sortColumn) {
                case 'org': return dir * (a.employee?.org_id || '').localeCompare(b.employee?.org_id || '');
                case 'employee': return dir * (a.employee?.name || '').localeCompare(b.employee?.name || '');
                case 'base_salary': return dir * ((a.employee?.base_salary || 0) - (b.employee?.base_salary || 0));
                case 'gross': return dir * ((a.gross || 0) - (b.gross || 0));
                case 'discounts': return dir * ((a.discounts || 0) - (b.discounts || 0));
                case 'net': return dir * ((a.net || 0) - (b.net || 0));
                case 'employer_cost': return dir * ((a.employer_cost || 0) - (b.employer_cost || 0));
                default: return 0;
            }
        });
    }, [results, search, tableColumns.sortColumn, tableColumns.sortDirection]);

    // Rodapé soma só o que está VISÍVEL na tabela (respeita a busca) — diferente
    // dos KPIs acima, que são o resumo da folha inteira.
    const footerBaseSalary   = filteredResults.reduce((s, r) => s + (r.employee?.base_salary || 0), 0);
    const footerGross        = filteredResults.reduce((s, r) => s + (r.gross || 0), 0);
    const footerDiscounts    = filteredResults.reduce((s, r) => s + (r.discounts || 0), 0);
    const footerNet          = filteredResults.reduce((s, r) => s + (r.net || 0), 0);
    const footerEmployerCost = filteredResults.reduce((s, r) => s + (r.employer_cost || 0), 0);

    // §6.1: largura da tabela é a SOMA exata das colunas visíveis, nunca w-full.
    const tableTotalWidth = columns
        .filter(c => c.key !== 'actions')
        .reduce((sum, c) => sum + (tableColumns.visibleColumns.includes(c.key) ? cols.getWidth(c.key) : 0), 0)
        + cols.getWidth('actions');

    return (
        <div className="space-y-6">
            <button
                onClick={onBack}
                className="flex items-center gap-1.5 h-8 px-2.5 -ml-2.5 rounded-[6px] text-sm font-medium text-gray-500 hover:bg-gray-100 transition-all"
            >
                <ArrowLeft className="w-4 h-4" /> Voltar à lista
            </button>

            {/* 1. Título */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Detalhes da Folha</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">
                    Período: {formatDate(run.start_date)} a {formatDate(run.end_date)}
                </p>
            </div>

            {/* 3. KPI cards */}
            {results.length > 0 && !resultsLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                    <KpiCard label="Colaboradores" value={results.length} icon={<Users className="w-5 h-5" />} color="gray" />
                    <KpiCard label="Total proventos" value={formatMoney(totalGross)} sub={`Descontos: ${formatMoney(totalDiscounts)}`} icon={<TrendingUp className="w-5 h-5" />} color="indigo" />
                    <KpiCard label="Total líquido" value={formatMoney(totalNet)} icon={<CheckCircle2 className="w-5 h-5" />} color="emerald" />
                    <KpiCard label="Custo total empresa" value={formatMoney(totalEmployerCost)} icon={<DollarSign className="w-5 h-5" />} color="blue" />
                </div>
            )}

            {/* 4. Toolbar de botões — status (escopo) à esquerda, ações à direita */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <span className={`text-sm font-medium ${run.status === 'FECHADO' ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {run.status}
                    </span>
                    {run.validation_logs && run.validation_logs.length > 0 && (
                        <button
                            onClick={() => setShowAuditModal(true)}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-[6px] hover:bg-rose-100 font-medium text-[13px] transition-all active:scale-95"
                        >
                            <ShieldAlert className="w-[15px] h-[15px]" /> Auditoria ({run.validation_logs.length})
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {run.status === 'FECHADO' ? (
                        <>
                            <button
                                disabled={executing}
                                onClick={onResyncFinance}
                                title="Re-executa a sincronização com o módulo financeiro sem reabrir a folha"
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-emerald-50 text-emerald-700 rounded-[6px] hover:bg-emerald-100 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                            >
                                {executing ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <RefreshCw className="w-[15px] h-[15px]" />}
                                Re-sincronizar financeiro
                            </button>
                            <button
                                disabled={executing}
                                onClick={onReopenRun}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-gray-100 text-gray-600 rounded-[6px] hover:bg-gray-200 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                            >
                                <History className="w-[15px] h-[15px]" /> Reabrir folha
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                disabled={executing}
                                onClick={onReprocessRun}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-indigo-50 text-indigo-600 rounded-[6px] hover:bg-indigo-100 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                            >
                                {executing ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Play className="w-[15px] h-[15px]" />}
                                Reprocessar
                            </button>
                            {/* Ação primária da tela (§17) — único elemento azul sólido */}
                            <button
                                disabled={executing}
                                onClick={onCloseRun}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                            >
                                <CheckCircle2 className="w-[15px] h-[15px]" /> Fechar folha
                            </button>
                        </>
                    )}
                    <ActionIconButton kind="delete" title="Excluir ciclo" onClick={() => onDeleteRun(run.id)} />
                </div>
            </div>

            {/* Modal de Auditoria */}
            {showAuditModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
                    <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-rose-50/30">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
                                    <ShieldAlert size={20} />
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-800 text-lg">Relatório de auditoria</h3>
                                    <p className="text-xs font-medium text-rose-600">Divergências detectadas vs. referência oficial</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setShowAuditModal(false)} className="hover:bg-rose-100 text-rose-400 rounded-xl">
                                <X size={20} />
                            </Button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-6">
                            {run.validation_logs?.map((log: any, idx: number) => (
                                <div key={idx} className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-bold text-slate-800">{log.employee_name}</p>
                                        <span className="text-xs font-medium text-rose-600">Erro fiscal</span>
                                    </div>
                                    <div className="space-y-2">
                                        {log.differences.map((diff: any, dIdx: number) => (
                                            <div key={dIdx} className="grid grid-cols-4 gap-2 items-center text-xs p-2 bg-white rounded-xl shadow-sm">
                                                <div className="font-medium text-slate-400">{diff.field}</div>
                                                <div className="text-slate-600">Sis: <span className="font-medium text-slate-800">{formatMoney(diff.system)}</span></div>
                                                <div className="text-slate-600">Ref: <span className="font-medium text-indigo-600">{formatMoney(diff.reference)}</span></div>
                                                <div className="text-right font-medium text-rose-600">Δ {formatMoney(diff.diff)}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
                            <button
                                onClick={() => setShowAuditModal(false)}
                                className="flex items-center h-9 px-3.5 bg-gray-100 text-gray-700 rounded-[6px] font-medium text-[13px] hover:bg-gray-200 transition-all active:scale-95"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 5. Tabela com toolbar de busca acoplada */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por colaborador ou função..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>

                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={columns.filter(c => c.key !== 'actions')}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                            <div className="w-px h-5 bg-gray-200 mx-0.5"></div>
                            <button
                                onClick={() => cols.autoFit()}
                                className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                title="Ajustar largura das colunas ao conteúdo"
                            >
                                <MoveHorizontal className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {resultsLoading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando resultados...</p>
                    </div>
                ) : filteredResults.length === 0 ? (
                    <div className="text-center py-12">
                        <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum resultado processado</h3>
                        {run.status === 'RASCUNHO' && (
                            <button onClick={onReprocessRun} className="text-blue-600 font-medium text-sm hover:underline">Processar agora</button>
                        )}
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth }}>
                            <colgroup>
                                {columns.filter(c => c.key !== 'actions').map(c => (
                                    tableColumns.visibleColumns.includes(c.key) && (
                                        <col key={c.key} data-col-key={c.key} style={{ width: `${cols.getWidth(c.key)}px` }} />
                                    )
                                ))}
                                {/* espaçador antes de Ações — §6.1.1 */}
                                <col />
                                {tableColumns.visibleColumns.includes('actions') && (
                                    <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                                )}
                            </colgroup>
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {columns.filter(c => c.key !== 'actions').map(c => (
                                        tableColumns.visibleColumns.includes(c.key) && (
                                            <SortableHeader
                                                key={c.key}
                                                colKey={c.key}
                                                label={c.label}
                                                sortable={c.sortable}
                                                uppercase={false}
                                                sortColumn={tableColumns.sortColumn}
                                                sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                className={`px-6 py-2 border-r border-gray-100 overflow-hidden ${c.key === 'employee' ? '' : 'text-right'}`}
                                            >
                                                <cols.ResizeHandle colKey={c.key} />
                                            </SortableHeader>
                                        )
                                    ))}
                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredResults.map((res: any) => (
                                    <tr key={res.id} className="hover:bg-blue-50/50 transition-colors">
                                        {tableColumns.visibleColumns.includes('org') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">
                                                {res.employee?.org_id?.substring(0, 8)}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('employee') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100">
                                                <p className="text-sm font-normal text-gray-700">{res.employee?.name}</p>
                                                <p className="text-xs font-normal text-gray-400">{res.employee?.role}</p>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('base_salary') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-gray-800">
                                                {formatMoney(res.employee?.base_salary)}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('gross') && (
                                            <td
                                                onClick={() => onOpenEventModal(res.employee_id, res.employee?.name)}
                                                className="px-6 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-indigo-600 cursor-pointer hover:underline"
                                            >
                                                {formatMoney(res.gross)}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('discounts') && (
                                            <td
                                                onClick={() => onOpenEventModal(res.employee_id, res.employee?.name)}
                                                className="px-6 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-rose-600 cursor-pointer hover:underline"
                                            >
                                                {formatMoney(res.discounts)}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('net') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-emerald-700">
                                                {formatMoney(res.net)}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('employer_cost') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-gray-900">
                                                {formatMoney(res.employer_cost)}
                                            </td>
                                        )}
                                        <td aria-hidden="true"></td>
                                        {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                                    <ActionIconButton kind="view" title="Ver holerite" icon={<FileText className="w-4 h-4" />} onClick={() => onViewPaystub(run.id, res.employee_id)} />
                                                    {['RASCUNHO', 'PROCESSANDO'].includes(run.status) && (
                                                        <ActionIconButton kind="edit" title="Lançar bônus/desconto" icon={<Plus className="w-4 h-4" />} onClick={() => onOpenEventModal(res.employee_id, res.employee?.name)} />
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                            {filteredResults.length > 1 && !resultsLoading && (
                                <tfoot>
                                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                                        {tableColumns.visibleColumns.includes('org') && <td />}
                                        {tableColumns.visibleColumns.includes('employee') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-semibold text-gray-500">
                                                Total ({filteredResults.length})
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('base_salary') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-gray-700">
                                                {formatMoney(footerBaseSalary)}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('gross') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-indigo-700">{formatMoney(footerGross)}</td>
                                        )}
                                        {tableColumns.visibleColumns.includes('discounts') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-rose-600">{formatMoney(footerDiscounts)}</td>
                                        )}
                                        {tableColumns.visibleColumns.includes('net') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-emerald-700">{formatMoney(footerNet)}</td>
                                        )}
                                        {tableColumns.visibleColumns.includes('employer_cost') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-gray-900">{formatMoney(footerEmployerCost)}</td>
                                        )}
                                        <td />
                                        {tableColumns.visibleColumns.includes('actions') && <td />}
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PayrollRunDetail;
