import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Search, RefreshCw, MoveHorizontal, Plus, TrendingUp, Wallet, CalendarClock,
    History, Loader2, Paperclip, AlertTriangle,
} from 'lucide-react';
import {
    ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader,
    usePersistedState, useResizableColumns,
} from './ui/TableUtils';
import { useConfirm } from './ui/confirm';
import { KpiCard } from './ui/KpiCard';
import ActionIconButton from './ui/ActionIconButton';
import { formatMoney, formatDateBR } from './ui/Format';
import {
    laborService, EmployeeSalaryRecord, SalaryChangeType,
} from '../services/laborService';
import { orgGovernanceService } from '../services/orgGovernanceService';
import { OrgRole } from '../types';
import { supabase } from '../lib/supabase';
import LaborSalaryRecordSheet, { SALARY_CHANGE_LABELS, SalaryRecordSubmit } from './LaborSalaryRecordSheet';

const SALARY_COLUMNS: ColumnConfig[] = [
    { key: 'effective_date', label: 'Vigência', sortable: true },
    { key: 'change_type', label: 'Motivo', sortable: true },
    { key: 'previous_salary', label: 'Salário anterior', sortable: true },
    { key: 'new_salary', label: 'Novo salário', sortable: true },
    { key: 'delta_value', label: 'Variação (R$)', sortable: true },
    { key: 'delta_pct', label: 'Variação (%)', sortable: true },
    { key: 'role', label: 'Cargo', sortable: true },
    // Contexto e metadados nascem ocultos: a visão inicial cabe no card do
    // formulário sem rolagem horizontal. Ligáveis na engrenagem.
    { key: 'jornada', label: 'Jornada', sortable: true, defaultHidden: true },
    { key: 'contract_type', label: 'Contrato', sortable: true, defaultHidden: true },
    { key: 'attachment', label: 'Anexo', sortable: false, defaultHidden: true },
    { key: 'notes', label: 'Observações', sortable: false, defaultHidden: true },
    { key: 'source', label: 'Origem', sortable: true, defaultHidden: true },
];

// Larguras aproximadas do container real da aba (o card do formulário, ~1100px).
const DEFAULT_COL_WIDTHS: Record<string, number> = {
    effective_date: 120, change_type: 140, previous_salary: 150, new_salary: 150,
    delta_value: 140, delta_pct: 120, role: 180, jornada: 110, contract_type: 120,
    attachment: 110, notes: 240, source: 110, actions: 110,
};

const SALARY_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    effective_date: { label: 'Vigência', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    change_type: { label: 'Motivo', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    previous_salary: { label: 'Salário anterior', className: 'px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap overflow-hidden' },
    new_salary: { label: 'Novo salário', className: 'px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap overflow-hidden' },
    delta_value: { label: 'Variação (R$)', className: 'px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap overflow-hidden' },
    delta_pct: { label: 'Variação (%)', className: 'px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap overflow-hidden' },
    role: { label: 'Cargo', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    jornada: { label: 'Jornada', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    contract_type: { label: 'Contrato', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    attachment: { label: 'Anexo', sortable: false, className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    notes: { label: 'Observações', sortable: false, className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    source: { label: 'Origem', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
};

// Texto simples colorido — sem pílula/fundo/uppercase (ui_ux_guia_unificado.md §8).
const CHANGE_TYPE_COLORS: Record<SalaryChangeType, string> = {
    ADMISSAO: 'text-gray-600',
    MERITO: 'text-emerald-700',
    PROMOCAO: 'text-indigo-700',
    DISSIDIO: 'text-blue-700',
    ENQUADRAMENTO: 'text-amber-700',
    REDUCAO: 'text-red-700',
    AJUSTE: 'text-gray-600',
    OUTRO: 'text-gray-600',
};

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Variação em relação ao valor anterior. Na admissão não existe "anterior" —
 * value e pct são null, e não zero: o primeiro salário não é um aumento de
 * R$ 2.800,00, é o ponto de partida.
 */
function computeDelta(r: EmployeeSalaryRecord): { value: number | null; pct: number | null } {
    const prev = r.previous_salary;
    if (prev == null) return { value: null, pct: null };
    const value = r.new_salary - prev;
    return { value, pct: prev > 0 ? (value / prev) * 100 : null };
}

interface LaborEmployeeSalaryHistoryProps {
    employeeId: string;
    /** Empresa do colaborador — de onde vem o catálogo de cargos. */
    empresaId?: string | null;
    currentSalary: number;
    defaults: {
        org_role_id: string | null;
        role_label: string | null;
        jornada_horas_semana: number | null;
        contract_type: string | null;
    };
    /**
     * Fecha a mão dupla: a aba grava direto no banco, mas o `form` state do
     * LaborEmployeeForm ainda segura o base_salary antigo — sem este callback,
     * clicar "Salvar Alterações" regravaria o valor velho por cima.
     */
    onSalaryApplied: (snapshot: { base_salary: number; hourly_cost: number; daily_cost: number }) => void;
}

const LaborEmployeeSalaryHistory: React.FC<LaborEmployeeSalaryHistoryProps> = ({
    employeeId, empresaId, currentSalary, defaults, onSalaryApplied,
}) => {
    const confirm = useConfirm();

    const [records, setRecords] = useState<EmployeeSalaryRecord[]>([]);
    const [orgRoles, setOrgRoles] = useState<OrgRole[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [editing, setEditing] = useState<EmployeeSalaryRecord | null>(null);

    const [searchTerm, setSearchTerm] = usePersistedState('employeeSalaryHistory:search', '');
    const [typeFilter, setTypeFilter] = usePersistedState('employeeSalaryHistory:type', 'all');

    const tableColumns = useTableColumns(SALARY_COLUMNS, 'employeeSalaryHistoryColumns');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'employeeSalaryHistoryColWidths');

    const loadRecords = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            setRecords(await laborService.listSalaryHistory(employeeId));
        } catch (err) {
            console.error('[LaborEmployeeSalaryHistory] load error:', err);
            setError(err instanceof Error ? err.message : 'Erro ao carregar o histórico salarial.');
        } finally {
            setIsLoading(false);
        }
    }, [employeeId]);

    useEffect(() => { loadRecords(); }, [loadRecords]);

    useEffect(() => {
        if (!empresaId) { setOrgRoles([]); return; }
        let cancelled = false;
        orgGovernanceService.listRoles(empresaId)
            .then(data => { if (!cancelled) setOrgRoles(data); })
            .catch(() => { if (!cancelled) setOrgRoles([]); });
        return () => { cancelled = true; };
    }, [empresaId]);

    // Depois de qualquer escrita, o banco pode ter mexido em employees — traz o
    // snapshot de volta pro formulário.
    const syncFormSalary = useCallback(async () => {
        try {
            const snapshot = await laborService.getEmployeeSalarySnapshot(employeeId);
            if (snapshot) onSalaryApplied(snapshot);
        } catch (err) {
            console.error('[LaborEmployeeSalaryHistory] snapshot error:', err);
        }
    }, [employeeId, onSalaryApplied]);

    const handleSubmit = async (data: SalaryRecordSubmit) => {
        if (editing) {
            const updated = await laborService.updateSalaryRecord(editing.id, employeeId, {
                effective_date: data.effective_date,
                new_salary: data.new_salary,
                change_type: data.change_type,
                org_role_id: data.org_role_id,
                role_label: data.role_label,
                jornada_horas_semana: data.jornada_horas_semana,
                contract_type: data.contract_type,
                notes: data.notes,
            });
            // §22: atualiza o array local, sem recarregar a tabela inteira
            setRecords(prev => prev
                .map(r => (r.id === updated.id ? { ...r, ...updated, org_role_name: data.role_label } : r))
                .sort((a, b) => b.effective_date.localeCompare(a.effective_date)));
        } else {
            const created = await laborService.registerSalaryChange({
                employee_id: employeeId,
                effective_date: data.effective_date,
                new_salary: data.new_salary,
                change_type: data.change_type,
                org_role_id: data.org_role_id,
                role_label: data.role_label,
                jornada_horas_semana: data.jornada_horas_semana,
                contract_type: data.contract_type,
                notes: data.notes,
            }, data.file);
            setRecords(prev => [{ ...created, org_role_name: data.role_label }, ...prev]
                .sort((a, b) => b.effective_date.localeCompare(a.effective_date)));
        }
        await syncFormSalary();
    };

    const handleDelete = async (record: EmployeeSalaryRecord) => {
        const ok = await confirm({
            title: 'Excluir registro salarial?',
            message: `O lançamento de ${formatDateBR(record.effective_date)} (${formatMoney(record.new_salary)}) será removido e o salário vigente do colaborador será recalculado.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await laborService.deleteSalaryRecord(record.id, employeeId, record.file_url);
            setRecords(prev => prev.filter(r => r.id !== record.id));
            await syncFormSalary();
        } catch (err) {
            console.error('[LaborEmployeeSalaryHistory] delete error:', err);
            setError(err instanceof Error ? err.message : 'Erro ao excluir o registro.');
        }
    };

    const handleDownload = (record: EmployeeSalaryRecord) => {
        if (!record.file_url) return;
        const { data } = supabase.storage.from('organization-assets').getPublicUrl(record.file_url);
        window.open(data.publicUrl, '_blank');
    };

    const openNew = () => { setEditing(null); setSheetOpen(true); };
    const openEdit = (record: EmployeeSalaryRecord) => { setEditing(record); setSheetOpen(true); };

    const filteredRecords = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        const list = records.filter(r => {
            if (typeFilter !== 'all' && r.change_type !== typeFilter) return false;
            if (!term) return true;
            return [
                SALARY_CHANGE_LABELS[r.change_type],
                r.org_role_name, r.role_label, r.notes, r.contract_type,
                formatDateBR(r.effective_date), String(r.new_salary),
            ].some(v => v?.toString().toLowerCase().includes(term));
        });

        const { sortColumn, sortDirection } = tableColumns;
        if (!sortColumn) return list;
        const dir = sortDirection === 'asc' ? 1 : -1;
        return [...list].sort((a, b) => {
            const pick = (r: EmployeeSalaryRecord): string | number => {
                switch (sortColumn) {
                    case 'effective_date': return r.effective_date;
                    case 'change_type': return SALARY_CHANGE_LABELS[r.change_type];
                    case 'previous_salary': return r.previous_salary ?? 0;
                    case 'new_salary': return r.new_salary;
                    case 'delta_value': return computeDelta(r).value ?? 0;
                    case 'delta_pct': return computeDelta(r).pct ?? 0;
                    case 'role': return r.org_role_name || '';
                    case 'jornada': return r.jornada_horas_semana ?? 0;
                    case 'contract_type': return r.contract_type || '';
                    case 'source': return r.source;
                    default: return '';
                }
            };
            const va = pick(a); const vb = pick(b);
            if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
            return String(va).localeCompare(String(vb)) * dir;
        });
    }, [records, searchTerm, typeFilter, tableColumns]);

    // KPIs — sempre sobre o histórico completo, não sobre o recorte filtrado.
    const kpis = useMemo(() => {
        const applied = records.filter(r => r.effective_date <= todayISO());
        const chronological = [...applied].sort((a, b) => a.effective_date.localeCompare(b.effective_date));
        const first = chronological[0];
        const last = chronological[chronological.length - 1];
        const raises = records.filter(r => r.change_type !== 'ADMISSAO').length;
        const accumulated = first && last && first.new_salary > 0
            ? ((last.new_salary - first.new_salary) / first.new_salary) * 100
            : null;
        const lastDelta = last ? computeDelta(last) : null;
        return { last, lastDelta, raises, accumulated, scheduled: records.length - applied.length };
    }, [records]);

    const tableTotalWidth =
        tableColumns.orderedVisibleColumns.reduce((sum, key) => sum + cols.getWidth(key), 0)
        + cols.getWidth('actions');

    function renderCell(key: string, r: EmployeeSalaryRecord): React.ReactNode {
        const delta = computeDelta(r);
        const deltaTone = delta.value == null ? 'text-gray-400'
            : delta.value > 0 ? 'text-emerald-700'
            : delta.value < 0 ? 'text-red-700' : 'text-gray-400';
        switch (key) {
            case 'effective_date':
                return (
                    <span className="text-sm text-gray-700">
                        {formatDateBR(r.effective_date)}
                        {r.effective_date > todayISO() && (
                            <span className="block text-xs text-amber-600">Programado</span>
                        )}
                    </span>
                );
            case 'change_type':
                return <span className={`text-sm ${CHANGE_TYPE_COLORS[r.change_type]}`}>{SALARY_CHANGE_LABELS[r.change_type]}</span>;
            case 'previous_salary':
                return <span className="block text-sm text-gray-500 text-right">{r.previous_salary != null ? formatMoney(r.previous_salary) : '—'}</span>;
            case 'new_salary':
                return <span className="block text-sm text-gray-900 text-right">{formatMoney(r.new_salary)}</span>;
            case 'delta_value':
                return (
                    <span className={`block text-sm text-right ${deltaTone}`}>
                        {delta.value == null ? '—' : `${delta.value >= 0 ? '+' : '−'}${formatMoney(Math.abs(delta.value))}`}
                    </span>
                );
            case 'delta_pct':
                return (
                    <span className={`block text-sm text-right ${deltaTone}`}>
                        {delta.pct == null || delta.value == null ? '—' : `${delta.value >= 0 ? '+' : '−'}${Math.abs(delta.pct).toFixed(2)}%`}
                    </span>
                );
            case 'role':
                return <span className="text-sm text-gray-700">{r.org_role_name || r.role_label || '—'}</span>;
            case 'jornada':
                return <span className="text-sm text-gray-700">{r.jornada_horas_semana != null ? `${r.jornada_horas_semana}h` : '—'}</span>;
            case 'contract_type':
                return <span className="text-sm text-gray-700">{r.contract_type || '—'}</span>;
            case 'attachment':
                return r.file_url
                    ? <span className="text-sm text-gray-700 flex items-center gap-1.5"><Paperclip className="w-3.5 h-3.5 text-gray-400" />{r.file_name || 'Arquivo'}</span>
                    : <span className="text-sm text-gray-400">—</span>;
            case 'notes':
                return <span className="text-sm text-gray-500">{r.notes || '—'}</span>;
            case 'source':
                return <span className="text-sm text-gray-500">{r.source === 'AUTO' ? 'Automático' : 'Manual'}</span>;
            default:
                return null;
        }
    }

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-3">
            {/* KPIs (§4) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard label="Salário vigente" value={formatMoney(currentSalary)}
                    sub={kpis.scheduled > 0 ? `${kpis.scheduled} reajuste(s) programado(s)` : undefined}
                    icon={<Wallet className="w-5 h-5" />} color="indigo" />
                <KpiCard label="Último reajuste"
                    value={kpis.last ? formatDateBR(kpis.last.effective_date) : '—'}
                    sub={kpis.lastDelta?.pct != null && kpis.lastDelta.value != null
                        ? `${kpis.lastDelta.value >= 0 ? '+' : '−'}${Math.abs(kpis.lastDelta.pct).toFixed(2)}%`
                        : undefined}
                    icon={<CalendarClock className="w-5 h-5" />} color="blue" />
                <KpiCard label="Variação acumulada"
                    value={kpis.accumulated != null ? `${kpis.accumulated >= 0 ? '+' : '−'}${Math.abs(kpis.accumulated).toFixed(2)}%` : '—'}
                    sub="Desde o primeiro registro"
                    icon={<TrendingUp className="w-5 h-5" />} color="emerald" />
                <KpiCard label="Reajustes" value={kpis.raises}
                    sub={`${records.length} registro(s) no total`}
                    icon={<History className="w-5 h-5" />} color="amber" />
            </div>

            {/* Toolbar de botões §5.3 — ação primária isolada */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm">
                <p className="text-sm text-gray-500">
                    Registrar aqui atualiza o salário base do colaborador a partir da data de vigência.
                </p>
                <button
                    onClick={openNew}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all active:scale-95 font-medium text-[13px] shrink-0"
                >
                    <Plus className="w-4 h-4" />
                    Registrar reajuste
                </button>
            </div>

            {/* Banner de erro fica FORA do card acoplado (§5.2) */}
            {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-[10px] p-3">
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            {/* Toolbar acoplada §5.2 — toolbar e tabela em um único card */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por motivo, cargo, valor ou observação..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>

                        <select
                            value={typeFilter}
                            onChange={e => setTypeFilter(e.target.value)}
                            className="h-9 text-sm font-normal text-gray-700 bg-white border border-gray-200 rounded-[6px] px-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        >
                            <option value="all">Todos os motivos</option>
                            {(Object.keys(SALARY_CHANGE_LABELS) as SalaryChangeType[]).map(t => (
                                <option key={t} value={t}>{SALARY_CHANGE_LABELS[t]}</option>
                            ))}
                        </select>

                        <button
                            onClick={loadRecords}
                            className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                            title="Atualizar"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>

                        {/* Separador entre grupo "filtrar" e grupo "visualizar" */}
                        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={SALARY_COLUMNS}
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
                </div>

                {isLoading ? (
                    <div className="text-center py-12">
                        <Loader2 className="w-6 h-6 text-blue-600 animate-spin mx-auto" />
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filteredRecords.length === 0 ? (
                    // Empty state §12 — sem moldura própria dentro do card acoplado
                    <div className="text-center py-12">
                        <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum registro encontrado</h3>
                        <p className="text-sm text-gray-500">
                            {searchTerm || typeFilter !== 'all'
                                ? 'Tente ajustar seus filtros de busca.'
                                : 'Registre o primeiro reajuste no botão acima.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table ref={cols.tableRef} className="text-left border-collapse"
                            style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                            <colgroup>
                                {tableColumns.orderedVisibleColumns.map(key => (
                                    <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                                ))}
                                {/* espaçador antes de "Ações" (§6.1) — absorve a sobra no meio,
                                    mantendo "Ações" colada na borda direita do card */}
                                <col />
                                <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                            </colgroup>
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.orderedVisibleColumns.map(key => {
                                        const def = SALARY_COLUMN_HEADERS[key];
                                        if (!def) return null;
                                        return (
                                            <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                onMoveColumn={tableColumns.moveColumn}
                                                className={def.className}>
                                                <cols.ResizeHandle colKey={key} />
                                            </SortableHeader>
                                        );
                                    })}
                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                    <th className="px-6 py-2 text-right relative overflow-hidden text-table-header font-semibold text-gray-500">
                                        Ações
                                        <cols.ResizeHandle colKey="actions" />
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredRecords.map(record => (
                                    <tr key={record.id} className="hover:bg-blue-50/50 transition-colors group">
                                        {tableColumns.orderedVisibleColumns.map(key => (
                                            <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                {renderCell(key, record)}
                                            </td>
                                        ))}
                                        <td aria-hidden="true" className="border-r border-gray-100"></td>
                                        <td className="px-6 py-2.5 text-right">
                                            <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                                {record.file_url && (
                                                    <ActionIconButton kind="download" title="Baixar anexo" onClick={() => handleDownload(record)} />
                                                )}
                                                <ActionIconButton kind="edit" onClick={() => openEdit(record)} />
                                                <ActionIconButton kind="delete" onClick={() => handleDelete(record)} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <LaborSalaryRecordSheet
                open={sheetOpen}
                onClose={() => { setSheetOpen(false); setEditing(null); }}
                record={editing}
                currentSalary={currentSalary}
                orgRoles={orgRoles}
                defaults={defaults}
                onSubmit={handleSubmit}
            />
        </div>
    );
};

export default LaborEmployeeSalaryHistory;
