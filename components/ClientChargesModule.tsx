import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertCircle, Check, ChevronDown, ChevronUp, Copy, ExternalLink,
    FileText, Loader2, Mail, QrCode, RefreshCw, Search, Slash, Landmark, MoveHorizontal,
} from 'lucide-react';
import { clientChargeService } from '../services/clientChargeService';
import type { ClientCharge } from '../services/clientChargeService';
import { formatMoney as fmt, formatDateBR as fmtDate } from './ui/Format';
import KpiCard from './ui/KpiCard';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';
import { useConfirm } from './ui/confirm';

// Asaas status → rótulo + cor. Padrão guia seção 8 — texto simples, sem pílula.
const STATUS_META: Record<string, { label: string; cls: string }> = {
    PENDING:   { label: 'Pendente',   cls: 'text-blue-600' },
    RECEIVED:  { label: 'Recebido',   cls: 'text-emerald-600' },
    CONFIRMED: { label: 'Confirmado', cls: 'text-emerald-600' },
    OVERDUE:   { label: 'Vencido',    cls: 'text-red-600' },
    REFUNDED:  { label: 'Estornado',  cls: 'text-amber-600' },
    CANCELLED: { label: 'Cancelado',  cls: 'text-gray-500' },
};

const PAID = ['RECEIVED', 'CONFIRMED'];

function StatusBadge({ status }: { status: string }) {
    const m = STATUS_META[status] ?? { label: status, cls: 'text-gray-500' };
    return (
        <span className={`inline-flex items-center gap-1 text-sm font-normal ${m.cls}`}>
            {status === 'OVERDUE' && <AlertCircle className="w-3 h-3" />}
            {m.label}
        </span>
    );
}

type StatusFilter = 'all' | 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
const FILTERS: { id: StatusFilter; label: string }[] = [
    { id: 'all',       label: 'Todas' },
    { id: 'PENDING',   label: 'Pendentes' },
    { id: 'PAID',      label: 'Pagas' },
    { id: 'OVERDUE',   label: 'Vencidas' },
    { id: 'CANCELLED', label: 'Canceladas' },
];

const CHARGES_COLUMNS: ColumnConfig[] = [
    { key: 'party_name',  label: 'Cliente',     sortable: true },
    { key: 'description', label: 'Descrição',   sortable: true },
    { key: 'billing_type', label: 'Tipo',       sortable: true },
    { key: 'due_date',    label: 'Vencimento',  sortable: true },
    { key: 'value',       label: 'Valor',       sortable: true },
    { key: 'status',      label: 'Status',      sortable: true },
    { key: 'actions',     label: 'Ações',       sortable: false },
];

// Larguras padrão de coluna — redimensionável via useResizableColumns (§6.1).
const DEFAULT_COL_WIDTHS: Record<string, number> = {
    party_name: 180, description: 220, billing_type: 120, due_date: 140, value: 140, status: 140, actions: 180,
};

// ─── main ────────────────────────────────────────────────────

interface Props {
    organizationId: string | null;
}

export default function ClientChargesModule({ organizationId }: Props) {
    const confirm = useConfirm();
    const [rows, setRows]         = useState<ClientCharge[]>([]);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState<string | null>(null);
    const [search, setSearch]     = usePersistedState('clientChargesModuleFilters:search', '');
    const [filter, setFilter]     = usePersistedState<StatusFilter>('clientChargesModuleFilters:status', 'all');
    const [expanded, setExpanded] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [cancelling, setCancelling]   = useState<string | null>(null);
    const [resending, setResending]     = useState<string | null>(null);
    const [resentId, setResentId]       = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkLoading, setBulkLoading] = useState(false);
    const tableColumns = useTableColumns(CHARGES_COLUMNS, 'clientChargesModuleColumns');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'clientChargesModuleColWidths');
    // Largura total = soma exata das colunas visíveis + checkbox fixo de 40px. NUNCA
    // w-full/100% junto com table-layout:fixed (§6.1).
    const tableTotalWidth = 40
        + (['party_name', 'description', 'billing_type', 'due_date', 'value', 'status'] as const)
            .reduce((sum, key) => sum + (tableColumns.visibleColumns.includes(key) ? cols.getWidth(key) : 0), 0)
        + cols.getWidth('actions');

    // Toast de Notificação — Seção 13 do guia
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await clientChargeService.list(organizationId, { limit: 500 });
            setRows(data);
            setSelectedIds(new Set());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao carregar cobranças');
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => {
        let r = rows;
        if (filter === 'PAID')       r = r.filter(c => PAID.includes(c.status));
        else if (filter !== 'all')   r = r.filter(c => c.status === filter);
        if (search) {
            const q = search.toLowerCase();
            r = r.filter(c =>
                (c.party_name ?? '').toLowerCase().includes(q) ||
                (c.description ?? '').toLowerCase().includes(q) ||
                (c.asaas_payment_id ?? '').toLowerCase().includes(q),
            );
        }
        if (tableColumns.sortColumn) {
            r = [...r].sort((a, b) => {
                let va: string | number, vb: string | number;
                switch (tableColumns.sortColumn) {
                    case 'party_name':   va = (a.party_name ?? '').toLowerCase();   vb = (b.party_name ?? '').toLowerCase();   break;
                    case 'description':  va = (a.description ?? '').toLowerCase();  vb = (b.description ?? '').toLowerCase();  break;
                    case 'billing_type': va = a.billing_type ?? '';                 vb = b.billing_type ?? '';                 break;
                    case 'due_date':     va = a.due_date ?? '';                     vb = b.due_date ?? '';                     break;
                    case 'value':        va = a.value ?? 0;                         vb = b.value ?? 0;                         break;
                    case 'status':       va = a.status;                             vb = b.status;                             break;
                    default:             return 0;
                }
                if (va < vb) return tableColumns.sortDirection === 'asc' ? -1 : 1;
                if (va > vb) return tableColumns.sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return r;
    }, [rows, filter, search, tableColumns.sortColumn, tableColumns.sortDirection]);

    /** Mesmo critério do handleCancel: precisa estar ativa e vinculada a um recebível. */
    const isSelectable = (c: ClientCharge) => c.status !== 'CANCELLED' && !PAID.includes(c.status) && !!c.transaction_id;
    const selectableVisible = useMemo(() => filtered.filter(isSelectable), [filtered]);
    const selectableIndexById = useMemo(
        () => new Map(selectableVisible.map((c, i) => [c.id, i])),
        [selectableVisible],
    );
    const selectedVisible = useMemo(
        () => selectableVisible.filter(c => selectedIds.has(c.id)),
        [selectableVisible, selectedIds],
    );
    const allVisibleSelected = selectableVisible.length > 0 && selectedVisible.length === selectableVisible.length;
    const selectedTotal = selectedVisible.reduce((s, c) => s + (c.value ?? 0), 0);

    function toggleRow(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    const [lastCheckedIndex, setLastCheckedIndex] = useState<number | null>(null);

    /** §10.1 — Shift+clique seleciona o intervalo entre a última linha marcada e a atual. */
    function handleRowCheck(id: string, index: number, shiftKey: boolean) {
        if (shiftKey && lastCheckedIndex !== null) {
            const [start, end] = lastCheckedIndex < index ? [lastCheckedIndex, index] : [index, lastCheckedIndex];
            const rangeIds = selectableVisible.slice(start, end + 1).map(c => c.id);
            setSelectedIds(prev => new Set([...prev, ...rangeIds]));
        } else {
            toggleRow(id);
            setLastCheckedIndex(index);
        }
    }
    function toggleAllVisible() {
        setSelectedIds(prev => {
            if (allVisibleSelected) {
                const next = new Set(prev);
                selectableVisible.forEach(c => next.delete(c.id));
                return next;
            }
            const next = new Set(prev);
            selectableVisible.forEach(c => next.add(c.id));
            return next;
        });
    }
    const clearSelection = () => setSelectedIds(new Set());

    async function handleBulkCancel() {
        const alvos = selectedVisible;
        if (alvos.length === 0) return;
        const ok = await confirm({
            title: 'Cancelar cobranças?',
            message: `Cancelar ${alvos.length} cobrança${alvos.length !== 1 ? 's' : ''} (${fmt(selectedTotal)})? O boleto/PIX será invalidado no Asaas.`,
            variant: 'danger',
            confirmLabel: 'Cancelar cobranças',
        });
        if (!ok) return;
        setBulkLoading(true);
        const falhas: string[] = [];
        let okCount = 0;
        for (const c of alvos) {
            try {
                await clientChargeService.cancel(c.organization_id, c.transaction_id!);
                okCount++;
            } catch {
                falhas.push(c.party_name ?? c.id);
            }
        }
        setBulkLoading(false);
        setSelectedIds(new Set());
        await load();
        if (falhas.length) {
            notify(`${okCount} cancelada(s). Falha em ${falhas.length}: ${falhas.join(', ')}`, 'error');
        } else {
            notify(`${okCount} cobrança${okCount !== 1 ? 's' : ''} cancelada${okCount !== 1 ? 's' : ''}.`);
        }
    }

    const kpis = useMemo(() => {
        let emitido = 0, recebido = 0, pendente = 0, vencido = 0;
        for (const c of rows) {
            if (c.status === 'CANCELLED') continue;
            emitido += c.value;
            if (PAID.includes(c.status))    recebido += c.value;
            else if (c.status === 'OVERDUE') vencido += c.value;
            else if (c.status === 'PENDING') pendente += c.value;
        }
        return { emitido, recebido, pendente, vencido };
    }, [rows]);

    function copyPix(c: ClientCharge) {
        if (!c.pix_payload) return;
        navigator.clipboard.writeText(c.pix_payload);
        setCopiedId(c.id);
        setTimeout(() => setCopiedId(null), 2000);
    }

    async function handleResend(c: ClientCharge) {
        setResending(c.id); setResentId(null);
        try {
            const r = await clientChargeService.resend(c.organization_id, c.id);
            setResentId(c.id);
            setTimeout(() => setResentId(null), 3000);
            notify(r.email ? `Boleto reenviado para ${r.email}` : 'Boleto reenviado.');
        } catch (e) {
            notify('Erro: ' + (e instanceof Error ? e.message : 'Falha ao reenviar'), 'error');
        } finally {
            setResending(null);
        }
    }

    async function handleCancel(c: ClientCharge) {
        if (!c.transaction_id) {
            notify('Esta cobrança não está vinculada a um recebível e não pode ser cancelada por aqui.', 'error');
            return;
        }
        const ok = await confirm({
            title: 'Cancelar cobrança?',
            message: `Cancelar a cobrança de ${fmt(c.value)} de ${c.party_name ?? 'cliente'}? O boleto/PIX será invalidado no Asaas.`,
            variant: 'danger',
            confirmLabel: 'Cancelar cobrança',
        });
        if (!ok) return;
        setCancelling(c.id);
        try {
            await clientChargeService.cancel(c.organization_id, c.transaction_id);
            await load();
            notify('Cobrança cancelada.');
        } catch (e) {
            notify('Erro: ' + (e instanceof Error ? e.message : 'Falha ao cancelar'), 'error');
        } finally {
            setCancelling(null);
        }
    }

    return (
        <div className="space-y-6">
            {/* Header — §20 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Cobranças</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Boletos e PIX emitidos aos clientes via Asaas</p>
                </div>
                <button
                    onClick={load}
                    className="h-9 w-9 flex items-center justify-center bg-emerald-50 text-emerald-600 rounded-[6px] hover:bg-emerald-600 hover:text-white transition-all active:scale-95"
                    title="Atualizar"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard shadow={false} size="sm" label="Total Emitido" value={fmt(kpis.emitido)}  sub={`${rows.filter(c => c.status !== 'CANCELLED').length} cobranças`} icon={<Landmark className="w-4 h-4" />} color="gray" />
                <KpiCard shadow={false} size="sm" label="Recebido"      value={fmt(kpis.recebido)} sub={`${rows.filter(c => PAID.includes(c.status)).length} pagas`}     icon={<Check className="w-4 h-4" />}    color="emerald" />
                <KpiCard shadow={false} size="sm" label="Pendente"      value={fmt(kpis.pendente)} sub={`${rows.filter(c => c.status === 'PENDING').length} aguardando`}  icon={<RefreshCw className="w-4 h-4" />} color="blue" />
                <KpiCard shadow={false} size="sm" label="Vencido"       value={fmt(kpis.vencido)}  sub={`${rows.filter(c => c.status === 'OVERDUE').length} em atraso`}   icon={<AlertCircle className="w-4 h-4" />} color={kpis.vencido > 0 ? 'red' : 'gray'} />
            </div>

            {/* Barra de ação em massa (§10) */}
            {selectedVisible.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/20">
                    <span className="flex-1 text-sm font-bold whitespace-nowrap">
                        {selectedVisible.length} selecionada{selectedVisible.length !== 1 ? 's' : ''}
                        <span className="ml-2 font-normal opacity-75">· {fmt(selectedTotal)}</span>
                    </span>
                    <button
                        onClick={handleBulkCancel}
                        disabled={bulkLoading}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50 disabled:opacity-60 transition-colors"
                    >
                        {bulkLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Slash className="w-3.5 h-3.5" />}
                        Cancelar
                    </button>
                    <button
                        onClick={clearSelection}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-500 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-blue-400 transition-colors"
                    >
                        Desmarcar
                    </button>
                </div>
            )}

            {/* Toolbar acoplada dentro do card da tabela (mesmo padrão do ÒPURA Docs/GED):
                régua de busca+filtros §5.1 (escala compacta §16) separada da tabela por border-b. */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                <div className="p-4 border-b border-gray-100">
                    <div className="flex flex-col xl:flex-row gap-2.5 items-center">
                        <div className="relative flex-1 w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por cliente, descrição ou ID Asaas..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                            />
                        </div>
                        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide shrink-0 w-full xl:w-auto">
                            {FILTERS.map(f => {
                                const isActive = filter === f.id;
                                return (
                                    <button
                                        key={f.id}
                                        onClick={() => setFilter(f.id)}
                                        className={`h-9 px-3 rounded-[6px] transition-all active:scale-95 text-sm font-medium whitespace-nowrap ${
                                            isActive
                                                ? 'bg-emerald-600 text-white'
                                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white'
                                        }`}
                                    >
                                        {f.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Separador entre grupo "filtrar" e grupo "visualizar" (§5.1) */}
                        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={CHARGES_COLUMNS.filter(c => c.key !== 'actions')}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                            {/* Autofit sob comando explícito — nunca automático (§6.1.2).
                                Duplo clique no divisor segue "restaurar padrão". */}
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
                {error && (
                    <div className="m-4 p-4 bg-red-50 border border-red-200 rounded-[10px] text-sm text-red-700 font-semibold">{error}</div>
                )}
                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando cobranças...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-12">
                        <Landmark className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma cobrança encontrada</h3>
                        <p className="text-sm text-gray-500">Emita boletos/PIX em Contas a Receber</p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                            <colgroup>
                                <col style={{ width: '40px' }} /> {/* checkbox */}
                                {tableColumns.visibleColumns.includes('party_name') && <col data-col-key="party_name" style={{ width: `${cols.getWidth('party_name')}px` }} />}
                                {tableColumns.visibleColumns.includes('description') && <col data-col-key="description" style={{ width: `${cols.getWidth('description')}px` }} />}
                                {tableColumns.visibleColumns.includes('billing_type') && <col data-col-key="billing_type" style={{ width: `${cols.getWidth('billing_type')}px` }} />}
                                {tableColumns.visibleColumns.includes('due_date') && <col data-col-key="due_date" style={{ width: `${cols.getWidth('due_date')}px` }} />}
                                {tableColumns.visibleColumns.includes('value') && <col data-col-key="value" style={{ width: `${cols.getWidth('value')}px` }} />}
                                {tableColumns.visibleColumns.includes('status') && <col data-col-key="status" style={{ width: `${cols.getWidth('status')}px` }} />}
                                {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio, para a
                                    borda de "Ações" não andar a cada redimensionamento. */}
                                <col />
                                {tableColumns.visibleColumns.includes('actions') && <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />}
                            </colgroup>
                            {/* thead sentence case (§6.2) — escala compacta, sticky (§6.5) */}
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <th className="w-10 px-6 py-2 text-center border-r border-gray-100">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
                                            checked={allVisibleSelected}
                                            disabled={selectableVisible.length === 0}
                                            onChange={toggleAllVisible}
                                            title="Selecionar todas (canceláveis)"
                                        />
                                    </th>
                                    {tableColumns.visibleColumns.includes('party_name') && (
                                        <SortableHeader label="Cliente" colKey="party_name" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 text-left overflow-hidden">
                                            <cols.ResizeHandle colKey="party_name" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('description') && (
                                        <SortableHeader label="Descrição" colKey="description" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 text-left overflow-hidden">
                                            <cols.ResizeHandle colKey="description" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('billing_type') && (
                                        <SortableHeader label="Tipo" colKey="billing_type" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 text-left overflow-hidden">
                                            <cols.ResizeHandle colKey="billing_type" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('due_date') && (
                                        <SortableHeader label="Vencimento" colKey="due_date" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 text-left overflow-hidden">
                                            <cols.ResizeHandle colKey="due_date" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('value') && (
                                        <SortableHeader label="Valor" colKey="value" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 text-left overflow-hidden">
                                            <cols.ResizeHandle colKey="value" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('status') && (
                                        <SortableHeader label="Status" colKey="status" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 text-left overflow-hidden">
                                            <cols.ResizeHandle colKey="status" />
                                        </SortableHeader>
                                    )}
                                    {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-6 py-2 text-left relative overflow-hidden text-table-header font-semibold text-gray-500">
                                            Ações
                                            <cols.ResizeHandle colKey="actions" />
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {filtered.map(c => {
                                    const isOverdue = c.status === 'OVERDUE';
                                    const isCancelled = c.status === 'CANCELLED';
                                    const active = !isCancelled && !PAID.includes(c.status);
                                    return (
                                        <React.Fragment key={c.id}>
                                            <tr className={`group hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${selectedIds.has(c.id) ? 'bg-blue-50/60 hover:bg-blue-50' : isOverdue ? 'bg-red-50/10' : ''} ${isCancelled ? 'opacity-50' : ''}`}>
                                                <td className="w-10 px-6 py-2.5 text-center border-r border-gray-100">
                                                    {isSelectable(c) ? (
                                                        <input
                                                            type="checkbox"
                                                            title="Dica: segure Shift e clique para selecionar um intervalo"
                                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                            checked={selectedIds.has(c.id)}
                                                            onChange={e => handleRowCheck(c.id, selectableIndexById.get(c.id) ?? 0, (e.nativeEvent as MouseEvent).shiftKey)}
                                                        />
                                                    ) : null}
                                                </td>
                                                {tableColumns.visibleColumns.includes('party_name') && (
                                                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-900 max-w-[160px] truncate">{c.party_name ?? '—'}</td>
                                                )}
                                                {tableColumns.visibleColumns.includes('description') && (
                                                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700 max-w-[200px] truncate">{c.description ?? '—'}</td>
                                                )}
                                                {tableColumns.visibleColumns.includes('billing_type') && (
                                                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{c.billing_type === 'PIX' ? 'PIX' : c.billing_type === 'UNDEFINED' ? 'Boleto+PIX' : 'Boleto'}</td>
                                                )}
                                                {tableColumns.visibleColumns.includes('due_date') && (
                                                    <td className={`px-6 py-2.5 border-r border-gray-100 text-sm font-normal whitespace-nowrap ${isOverdue ? 'text-red-600' : 'text-gray-700'}`}>{fmtDate(c.due_date)}</td>
                                                )}
                                                {tableColumns.visibleColumns.includes('value') && (
                                                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-gray-800 whitespace-nowrap">{fmt(c.value)}</td>
                                                )}
                                                {tableColumns.visibleColumns.includes('status') && (
                                                    <td className="px-6 py-2.5 border-r border-gray-100">
                                                        <StatusBadge status={c.status} />
                                                    </td>
                                                )}
                                                {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                                <td aria-hidden="true" className="border-r border-gray-100"></td>
                                                {tableColumns.visibleColumns.includes('actions') && (
                                                <td className="px-6 py-2.5">
                                                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                        {(c.bank_slip_url || c.invoice_url || c.pix_payload) && (
                                                            <button onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                                                                className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all flex items-center gap-1">
                                                                {expanded === c.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} Links
                                                            </button>
                                                        )}
                                                        {active && (
                                                            <button onClick={() => handleCancel(c)} disabled={cancelling === c.id}
                                                                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-[6px] transition-all flex items-center gap-1 text-sm font-medium">
                                                                {cancelling === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Slash className="w-3.5 h-3.5" />} Cancelar
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                                )}
                                            </tr>
                                            {expanded === c.id && (
                                                <tr className="bg-gray-50/60 border-b border-gray-100">
                                                    {/* +2: checkbox + espaçador (não estão em visibleColumns) */}
                                                    <td colSpan={2 + tableColumns.visibleColumns.length} className="px-6 py-4">
                                                        <div className="flex flex-wrap gap-3">
                                                            {c.bank_slip_url && (
                                                                <a href={c.bank_slip_url} target="_blank" rel="noreferrer"
                                                                    className="flex items-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 rounded-[6px] text-xs font-bold text-blue-700 transition-colors">
                                                                    <FileText className="w-3.5 h-3.5" /> Boleto (PDF) <ExternalLink className="w-3 h-3" />
                                                                </a>
                                                            )}
                                                            {c.billing_type !== 'PIX' && !PAID.includes(c.status) && c.status !== 'CANCELLED' && c.asaas_payment_id && (
                                                                <button onClick={() => handleResend(c)} disabled={resending === c.id}
                                                                    className="flex items-center gap-2 px-3 py-2 bg-violet-50 hover:bg-violet-100 rounded-[6px] text-xs font-bold text-violet-700 transition-colors disabled:opacity-50">
                                                                    {resending === c.id
                                                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                        : resentId === c.id
                                                                            ? <Check className="w-3.5 h-3.5" />
                                                                            : <Mail className="w-3.5 h-3.5" />}
                                                                    {resentId === c.id ? 'Enviado!' : 'Segunda Via'}
                                                                </button>
                                                            )}
                                                            {c.invoice_url && (
                                                                <a href={c.invoice_url} target="_blank" rel="noreferrer"
                                                                    className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-[6px] text-xs font-bold text-gray-700 transition-colors">
                                                                    <ExternalLink className="w-3.5 h-3.5" /> Página de pagamento
                                                                </a>
                                                            )}
                                                            {c.pix_payload && (
                                                                <button onClick={() => copyPix(c)}
                                                                    className="flex items-center gap-2 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 rounded-[6px] text-xs font-bold text-emerald-700 transition-colors">
                                                                    <QrCode className="w-3.5 h-3.5" /> {copiedId === c.id ? 'Copiado!' : 'Copiar PIX'} <Copy className="w-3 h-3" />
                                                                </button>
                                                            )}
                                                            {c.paid_at && (
                                                                <span className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-green-700">
                                                                    <Check className="w-3.5 h-3.5" /> Pago em {fmtDate(c.paid_at)}
                                                                </span>
                                                            )}
                                                            {c.asaas_payment_id && (
                                                                <span className="flex items-center px-3 py-2 text-xs font-mono text-gray-400">{c.asaas_payment_id}</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Footer */}
            {!loading && (
                <div className="flex justify-center">
                    <p className="text-xs text-gray-400">{filtered.length} cobrança{filtered.length !== 1 ? 's' : ''}</p>
                </div>
            )}

            {/* Toast de Notificação — padrão guia seção 13 */}
            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </div>
    );
}
