import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertCircle, Building2, Check, ChevronDown, ChevronUp,
    Clock, ExternalLink, FileText, Landmark, Loader2, RefreshCw,
    Search, TrendingDown, X, DollarSign, AlertTriangle,
} from 'lucide-react';
import { invoiceService } from '../services/invoiceService';
import { Invoice } from '../types/financial';
import type { Organization } from '../types';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import { Money, formatMoney, formatDateBR } from './ui/Format';
import PagarBoletoAsaasModal from './PagarBoletoAsaasModal';
import { KpiCard } from './ui/KpiCard';

type InvoiceRow = Invoice & { supplierName?: string; supplierOrganizationId?: string };

/** Extrai o boleto_id da marcação `[boleto:{id}]` gravada em invoices.notes (ver boletoService.aprovarECriarInvoice). */
function extractBoletoId(notes: string | undefined): string | null {
    const m = (notes ?? '').match(/\[boleto:([0-9a-f-]{36})\]/i);
    return m ? m[1] : null;
}
type StatusFilter = 'all' | 'pending' | 'approved' | 'paid' | 'rejected' | 'overdue';

const STATUS_PT: Record<string, string> = {
    pending: 'Pendente',
    approved: 'Aprovado',
    rejected: 'Rejeitado',
    paid: 'Pago',
};

const CONTAS_COLUMNS: ColumnConfig[] = [
    { key: 'supplier', label: 'Fornecedor / Documento', sortable: true },
    { key: 'origem', label: 'Origem', sortable: true },
    { key: 'valor', label: 'Valor', sortable: true },
    { key: 'vencimento', label: 'Vencimento', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
];

const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

function isOverdue(inv: InvoiceRow) {
    if (!inv.dueDate) return false;
    if (['paid', 'rejected'].includes(inv.status)) return false;
    return new Date(inv.dueDate + 'T00:00:00') < today();
}

// Padrão guia seção 8 — texto simples, sem pílula
function StatusBadge({ inv }: { inv: InvoiceRow }) {
    if (isOverdue(inv)) {
        return <span className="text-sm font-normal text-red-600">Atrasado</span>;
    }
    const colors: Record<string, string> = {
        paid: 'text-green-700',
        approved: 'text-blue-700',
        pending: 'text-yellow-700',
        rejected: 'text-gray-500',
    };
    return (
        <span className={`text-sm font-normal ${colors[inv.status] ?? 'text-gray-500'}`}>
            {STATUS_PT[inv.status] ?? inv.status}
        </span>
    );
}

interface Props {
    organizationId?: string;
    organizations?: Organization[];
    onOrgChange?: (id: string) => void;
}

export default function ContasPagarManager({ organizationId, organizations, onOrgChange }: Props) {
    const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [marcandoPago, setMarcandoPago] = useState<string | null>(null);
    const [pagandoAsaas, setPagandoAsaas] = useState<InvoiceRow | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkLoading, setBulkLoading] = useState(false);

    const [selectedOrgId, setSelectedOrgId] = useState<string>('ALL');
    // F2: filtros sobrevivem a navegação/reload (mesmo padrão de useTableColumns).
    const [search, setSearch] = usePersistedState('contasPagarManagerFilters:search', '');
    const [statusFilter, setStatusFilter] = usePersistedState<StatusFilter>('contasPagarManagerFilters:status', 'all');
    const [vencDe, setVencDe] = usePersistedState('contasPagarManagerFilters:vencDe', '');
    const [vencAte, setVencAte] = usePersistedState('contasPagarManagerFilters:vencAte', '');
    const [showFilters, setShowFilters] = useState(false);
    const tableColumns = useTableColumns(CONTAS_COLUMNS, 'contasPagarManagerColumns');

    // Toast de Notificação — Seção 13 do guia
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const effectiveOrgId = selectedOrgId === 'ALL' ? undefined : selectedOrgId;

    async function carregar(orgId?: string) {
        setLoading(true);
        setError(null);
        try {
            const data = await invoiceService.listAll(orgId);
            setInvoices(data);
            setSelectedIds(new Set());
        } catch (e: any) {
            setError(e.message ?? 'Erro ao carregar contas a pagar');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { carregar(effectiveOrgId); }, [effectiveOrgId]);

    function handleOrgChange(id: string) {
        setSelectedOrgId(id);
        if (id !== 'ALL') onOrgChange?.(id);
    }

    async function handleMarcarPago(inv: InvoiceRow) {
        setMarcandoPago(inv.id);
        try {
            await invoiceService.marcarPago(inv.id);
            setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'paid' } : i));
            notify('Conta marcada como paga.');
        } catch (e: any) {
            notify('Erro: ' + (e.message ?? 'Falha ao marcar como pago'), 'error');
        } finally {
            setMarcandoPago(null);
        }
    }

    const filtered = useMemo(() => {
        let result = invoices.filter(inv => {
            if (statusFilter === 'overdue') { if (!isOverdue(inv)) return false; }
            else if (statusFilter !== 'all') { if (inv.status !== statusFilter) return false; }
            if (vencDe && inv.dueDate && inv.dueDate < vencDe) return false;
            if (vencAte && inv.dueDate && inv.dueDate > vencAte) return false;
            if (search) {
                const q = search.toLowerCase();
                const hit = (inv.supplierName ?? '').toLowerCase().includes(q)
                    || (inv.fileName ?? '').toLowerCase().includes(q)
                    || (inv.notes ?? '').toLowerCase().includes(q);
                if (!hit) return false;
            }
            return true;
        });

        // Ordenação
        if (tableColumns.sortColumn) {
            result.sort((a, b) => {
                let va: any, vb: any;
                switch (tableColumns.sortColumn) {
                    case 'supplier':
                        va = (a.supplierName ?? '').toLowerCase();
                        vb = (b.supplierName ?? '').toLowerCase();
                        break;
                    case 'origem':
                        va = ((a.notes ?? '').includes('[boleto:') ? 'Boleto' : 'Manual');
                        vb = ((b.notes ?? '').includes('[boleto:') ? 'Boleto' : 'Manual');
                        break;
                    case 'valor':
                        va = a.amount ?? 0;
                        vb = b.amount ?? 0;
                        break;
                    case 'vencimento':
                        va = a.dueDate ?? '';
                        vb = b.dueDate ?? '';
                        break;
                    case 'status':
                        va = a.status;
                        vb = b.status;
                        break;
                    default:
                        return 0;
                }
                if (va < vb) return tableColumns.sortDirection === 'asc' ? -1 : 1;
                if (va > vb) return tableColumns.sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return result;
    }, [invoices, statusFilter, vencDe, vencAte, search, tableColumns.sortColumn, tableColumns.sortDirection]);

    /** Só linhas ainda pagáveis (não pagas/rejeitadas) podem entrar em ação em massa. */
    const isSelectable = (inv: InvoiceRow) => !['paid', 'rejected'].includes(inv.status);
    const selectableVisible = useMemo(() => filtered.filter(isSelectable), [filtered]);
    // Interseção da seleção com o que está visível+pagável (poda filtros que mudaram).
    const selectedVisible = useMemo(
        () => selectableVisible.filter(inv => selectedIds.has(inv.id)),
        [selectableVisible, selectedIds],
    );
    const allVisibleSelected = selectableVisible.length > 0 && selectedVisible.length === selectableVisible.length;
    const selectedTotal = selectedVisible.reduce((s, i) => s + (i.amount ?? 0), 0);

    function toggleRow(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }
    function toggleAllVisible() {
        setSelectedIds(prev => {
            if (allVisibleSelected) {
                const next = new Set(prev);
                selectableVisible.forEach(inv => next.delete(inv.id));
                return next;
            }
            const next = new Set(prev);
            selectableVisible.forEach(inv => next.add(inv.id));
            return next;
        });
    }
    const clearSelection = () => setSelectedIds(new Set());

    async function handleBulkPago() {
        const alvos = selectedVisible;
        if (alvos.length === 0) return;
        setBulkLoading(true);
        const okIds: string[] = [];
        const falhas: string[] = [];
        for (const inv of alvos) {
            try {
                await invoiceService.marcarPago(inv.id);
                okIds.push(inv.id);
            } catch {
                falhas.push(inv.supplierName ?? inv.id);
            }
        }
        if (okIds.length) {
            const okSet = new Set(okIds);
            setInvoices(prev => prev.map(i => okSet.has(i.id) ? { ...i, status: 'paid' } : i));
        }
        setSelectedIds(prev => {
            const next = new Set(prev);
            okIds.forEach(id => next.delete(id));
            return next;
        });
        setBulkLoading(false);
        if (falhas.length) {
            notify(`${okIds.length} marcada(s) como paga(s). Falha em ${falhas.length}: ${falhas.join(', ')}`, 'error');
        } else if (okIds.length) {
            notify(`${okIds.length} conta${okIds.length !== 1 ? 's' : ''} marcada${okIds.length !== 1 ? 's' : ''} como paga${okIds.length !== 1 ? 's' : ''}.`);
        }
    }

    const summary = useMemo(() => {
        const now = today();
        const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
        const fimMes = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const em7 = new Date(now); em7.setDate(em7.getDate() + 7);

        let aPagar = 0, venc7 = 0, atrasado = 0, pagoMes = 0;
        let qtdAPagar = 0, qtdVenc7 = 0, qtdAtrasado = 0, qtdPagoMes = 0;
        invoices.forEach(inv => {
            const due = inv.dueDate ? new Date(inv.dueDate + 'T00:00:00') : null;
            if (inv.status === 'paid') {
                const criado = new Date(inv.createdAt);
                if (criado >= inicioMes && criado <= fimMes) { pagoMes += inv.amount ?? 0; qtdPagoMes++; }
            } else if (inv.status !== 'rejected') {
                aPagar += inv.amount ?? 0;
                qtdAPagar++;
                if (due) {
                    if (due < now) { atrasado += inv.amount ?? 0; qtdAtrasado++; }
                    else if (due <= em7) { venc7 += inv.amount ?? 0; qtdVenc7++; }
                }
            }
        });
        return { aPagar, venc7, atrasado, pagoMes, qtdAPagar, qtdVenc7, qtdAtrasado, qtdPagoMes };
    }, [invoices]);

    return (
        <div className="h-full flex flex-col bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center">
                            <TrendingDown className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">Contas a Pagar</h1>
                            <p className="text-xs text-gray-500">Invoices e boletos aprovados</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Org selector */}
                        {organizations && organizations.length > 1 && (
                            <div className="relative flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                                <Building2 className="w-3.5 h-3.5 text-gray-400" />
                                <select
                                    value={selectedOrgId}
                                    onChange={e => handleOrgChange(e.target.value)}
                                    className="bg-transparent outline-none text-gray-700 font-medium pr-5 cursor-pointer"
                                >
                                    <option value="ALL">Todas as Organizações</option>
                                    {organizations.map(o => (
                                        <option key={o.id} value={o.id}>{o.name}</option>
                                    ))}
                                </select>
                                <ChevronDown className="w-3.5 h-3.5 text-gray-400 pointer-events-none absolute right-2" />
                            </div>
                        )}

                        <button
                            onClick={() => carregar(effectiveOrgId)}
                            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                            title="Recarregar"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-auto">
                <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <KpiCard
                            label="A Pagar"
                            value={formatMoney(summary.aPagar)}
                            sub={`${summary.qtdAPagar} conta${summary.qtdAPagar !== 1 ? 's' : ''} em aberto`}
                            icon={<DollarSign className="w-5 h-5" />}
                            color="blue"
                            onClick={() => setStatusFilter('all')}
                        />
                        <KpiCard
                            label="Vence em 7 dias"
                            value={formatMoney(summary.venc7)}
                            sub={`${summary.qtdVenc7} conta${summary.qtdVenc7 !== 1 ? 's' : ''} próximas`}
                            icon={<Clock className="w-5 h-5" />}
                            color="amber"
                            onClick={() => { setStatusFilter('all'); const d = new Date(); d.setDate(d.getDate() + 7); setVencAte(d.toISOString().slice(0, 10)); setVencDe(new Date().toISOString().slice(0, 10)); }}
                        />
                        <KpiCard
                            label="Em Atraso"
                            value={formatMoney(summary.atrasado)}
                            sub={`${summary.qtdAtrasado} conta${summary.qtdAtrasado !== 1 ? 's' : ''} vencidas`}
                            icon={<AlertTriangle className="w-5 h-5" />}
                            color="red"
                            onClick={() => setStatusFilter('overdue')}
                        />
                        <KpiCard
                            label="Pago no Mês"
                            value={formatMoney(summary.pagoMes)}
                            sub={`${summary.qtdPagoMes} conta${summary.qtdPagoMes !== 1 ? 's' : ''} quitadas`}
                            icon={<Check className="w-5 h-5" />}
                            color="emerald"
                            onClick={() => setStatusFilter('paid')}
                        />
                    </div>

                    {/* Barra de busca e filtros */}
                    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                        <div className="flex gap-3">
                            <div className="flex-1 relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Buscar fornecedor, arquivo, observação..."
                                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-red-400"
                                />
                                {search && (
                                    <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Status pills */}
                            <div className="flex gap-1.5">
                                {(['all', 'pending', 'approved', 'overdue', 'paid'] as StatusFilter[]).map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setStatusFilter(s)}
                                        className={`px-3 py-1.5 rounded-lg text-form-input font-semibold transition-colors ${statusFilter === s ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                    >
                                        {s === 'all' ? 'Todos' : s === 'overdue' ? 'Atrasado' : STATUS_PT[s]}
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={() => setShowFilters(v => !v)}
                                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-button font-semibold text-gray-600 hover:bg-gray-50"
                            >
                                {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                Filtros
                            </button>
                            <ColumnConfigButton
                                columns={CONTAS_COLUMNS}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                        </div>

                        {showFilters && (
                            <div className="flex gap-3 pt-2 border-t border-gray-100">
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <span>Vencimento:</span>
                                    <input type="date" value={vencDe} onChange={e => setVencDe(e.target.value)}
                                        className="border border-gray-200 rounded-lg px-2 py-1 text-form-input outline-none focus:border-red-400" />
                                    <span>até</span>
                                    <input type="date" value={vencAte} onChange={e => setVencAte(e.target.value)}
                                        className="border border-gray-200 rounded-lg px-2 py-1 text-form-input outline-none focus:border-red-400" />
                                    {(vencDe || vencAte) && (
                                        <button onClick={() => { setVencDe(''); setVencAte(''); }} className="text-red-500 hover:text-red-700">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Barra de ação em massa (F3) */}
                    {selectedVisible.length > 0 && (
                        <div className="flex items-center gap-4 bg-red-600 text-white rounded-xl px-4 py-3 shadow-sm">
                            <span className="text-sm font-semibold">
                                {selectedVisible.length} selecionada{selectedVisible.length !== 1 ? 's' : ''}
                                <span className="ml-2 font-normal text-red-100">{formatMoney(selectedTotal)}</span>
                            </span>
                            <div className="flex-1" />
                            <button
                                onClick={handleBulkPago}
                                disabled={bulkLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-60 transition-colors"
                            >
                                {bulkLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                Marcar como pago
                            </button>
                            <button
                                onClick={clearSelection}
                                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm font-medium text-red-100 hover:text-white hover:bg-red-500 transition-colors"
                            >
                                <X className="w-3.5 h-3.5" /> Limpar
                            </button>
                        </div>
                    )}

                    {/* Tabela */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        {loading ? (
                            <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span className="text-sm">Carregando...</span>
                            </div>
                        ) : error ? (
                            <div className="flex items-center justify-center py-16 gap-2 text-red-500">
                                <AlertCircle className="w-5 h-5" />
                                <span className="text-sm">{error}</span>
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <FileText className="w-10 h-10 mb-3 opacity-30" />
                                <p className="text-sm font-medium">Nenhuma conta encontrada</p>
                                <p className="text-xs mt-1">Aprove um boleto para ele aparecer aqui</p>
                            </div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                        <th className="w-10 px-4 py-3 text-center">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer disabled:opacity-40"
                                                checked={allVisibleSelected}
                                                disabled={selectableVisible.length === 0}
                                                onChange={toggleAllVisible}
                                                title="Selecionar todos (pagáveis)"
                                            />
                                        </th>
                                        {tableColumns.visibleColumns.includes('supplier') && (
                                            <SortableHeader
                                                label="Fornecedor / Documento"
                                                colKey="supplier"
                                                sortable={true}
                                                sortColumn={tableColumns.sortColumn}
                                                sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                className="text-left px-4 py-3"
                                            />
                                        )}
                                        {tableColumns.visibleColumns.includes('origem') && (
                                            <SortableHeader
                                                label="Origem"
                                                colKey="origem"
                                                sortable={true}
                                                sortColumn={tableColumns.sortColumn}
                                                sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                className="text-left px-4 py-3"
                                            />
                                        )}
                                        {tableColumns.visibleColumns.includes('valor') && (
                                            <SortableHeader
                                                label="Valor"
                                                colKey="valor"
                                                sortable={true}
                                                sortColumn={tableColumns.sortColumn}
                                                sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                className="text-right px-4 py-3"
                                            />
                                        )}
                                        {tableColumns.visibleColumns.includes('vencimento') && (
                                            <SortableHeader
                                                label="Vencimento"
                                                colKey="vencimento"
                                                sortable={true}
                                                sortColumn={tableColumns.sortColumn}
                                                sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                className="text-center px-4 py-3"
                                            />
                                        )}
                                        {tableColumns.visibleColumns.includes('status') && (
                                            <SortableHeader
                                                label="Status"
                                                colKey="status"
                                                sortable={true}
                                                sortColumn={tableColumns.sortColumn}
                                                sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                className="text-center px-4 py-3"
                                            />
                                        )}
                                        <th className="text-right px-4 py-3">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filtered.map(inv => {
                                        const dueDate = inv.dueDate ? new Date(inv.dueDate + 'T00:00:00') : null;
                                        const overdue = isOverdue(inv);
                                        const fromBoleto = (inv.notes ?? '').includes('[boleto:');

                                        return (
                                            <tr key={inv.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(inv.id) ? 'bg-red-50/60' : overdue ? 'bg-red-50/30' : ''}`}>
                                                <td className="w-10 px-4 py-3 text-center">
                                                    {isSelectable(inv) ? (
                                                        <input
                                                            type="checkbox"
                                                            className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                                                            checked={selectedIds.has(inv.id)}
                                                            onChange={() => toggleRow(inv.id)}
                                                        />
                                                    ) : null}
                                                </td>
                                                {tableColumns.visibleColumns.includes('supplier') && (
                                                    <td className="px-4 py-3">
                                                        <p className="text-sm font-normal text-gray-900 truncate max-w-xs">{inv.supplierName ?? '—'}</p>
                                                        <p className="text-xs text-gray-400 truncate max-w-xs">{inv.fileName}</p>
                                                    </td>
                                                )}
                                                {tableColumns.visibleColumns.includes('origem') && (
                                                    <td className="px-4 py-3">
                                                        <span className={`text-sm font-normal ${fromBoleto ? 'text-indigo-700' : 'text-gray-500'}`}>
                                                            {fromBoleto ? 'Boleto' : 'Manual'}
                                                        </span>
                                                    </td>
                                                )}
                                                {tableColumns.visibleColumns.includes('valor') && (
                                                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                                                        <Money value={inv.amount} />
                                                    </td>
                                                )}
                                                {tableColumns.visibleColumns.includes('vencimento') && (
                                                    <td className={`px-4 py-3 text-center text-sm font-normal ${overdue ? 'text-red-600' : 'text-gray-600'}`}>
                                                        {formatDateBR(inv.dueDate)}
                                                        {overdue && dueDate && (
                                                            <div className="text-xs text-red-500">
                                                                {Math.floor((today().getTime() - dueDate.getTime()) / 86400000)}d atraso
                                                            </div>
                                                        )}
                                                    </td>
                                                )}
                                                {tableColumns.visibleColumns.includes('status') && (
                                                    <td className="px-4 py-3 text-center">
                                                        <StatusBadge inv={inv} />
                                                    </td>
                                                )}
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-end gap-2">
                                                        {/* Ver documento */}
                                                        {inv.filePath && (
                                                            <a
                                                                href={invoiceService.getInvoiceUrl(inv.filePath)}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                                                                title="Ver documento"
                                                            >
                                                                <ExternalLink className="w-3.5 h-3.5" />
                                                            </a>
                                                        )}

                                                        {/* Pagar via Asaas — só para invoices originados de boleto com linha digitável */}
                                                        {!['paid', 'rejected'].includes(inv.status) && fromBoleto && inv.supplierOrganizationId && (
                                                            <button
                                                                onClick={() => setPagandoAsaas(inv)}
                                                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-button font-semibold border border-emerald-200 transition-colors"
                                                                title="Pagar via Asaas"
                                                            >
                                                                <Landmark className="w-3 h-3" />
                                                                Pagar via Asaas
                                                            </button>
                                                        )}

                                                        {/* Marcar como pago */}
                                                        {!['paid', 'rejected'].includes(inv.status) && (
                                                            <button
                                                                onClick={() => handleMarcarPago(inv)}
                                                                disabled={marcandoPago === inv.id}
                                                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 text-button font-semibold border border-green-200 disabled:opacity-50 transition-colors"
                                                                title="Marcar como pago"
                                                            >
                                                                {marcandoPago === inv.id ? (
                                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                                ) : (
                                                                    <Check className="w-3 h-3" />
                                                                )}
                                                                Pago
                                                            </button>
                                                        )}
                                                        {inv.status === 'paid' && (
                                                            <span className="flex items-center gap-1 text-xs text-green-600 font-semibold">
                                                                <Check className="w-3 h-3" /> Quitado
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-gray-50 border-t border-gray-200">
                                        <td colSpan={3} className="px-4 py-2 text-table-body text-gray-500">
                                            {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
                                        </td>
                                        <td className="px-4 py-2 text-right text-sm font-medium text-gray-900">
                                            {formatMoney(filtered.filter(i => !['paid', 'rejected'].includes(i.status)).reduce((s, i) => s + (i.amount ?? 0), 0))}
                                        </td>
                                        <td colSpan={3} className="px-4 py-2 text-table-body text-gray-400 text-right">total a pagar (filtrado)</td>
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>

                </div>
            </div>

            {pagandoAsaas && (() => {
                const boletoId = extractBoletoId(pagandoAsaas.notes);
                if (!boletoId || !pagandoAsaas.supplierOrganizationId) return null;
                return (
                    <PagarBoletoAsaasModal
                        organizationId={pagandoAsaas.supplierOrganizationId}
                        boletoId={boletoId}
                        supplierName={pagandoAsaas.supplierName}
                        amount={pagandoAsaas.amount}
                        dueDate={pagandoAsaas.dueDate}
                        onClose={() => setPagandoAsaas(null)}
                        onPaid={() => {
                            setPagandoAsaas(null);
                            notify('Pagamento enviado à Asaas. O status será atualizado automaticamente assim que o banco confirmar.');
                            carregar(effectiveOrgId);
                        }}
                    />
                );
            })()}

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
