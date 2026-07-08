import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertCircle, Check, ChevronDown, ChevronUp, Copy, ExternalLink,
    FileText, Loader2, Mail, QrCode, RefreshCw, Search, Slash, Landmark,
} from 'lucide-react';
import { clientChargeService } from '../services/clientChargeService';
import type { ClientCharge } from '../services/clientChargeService';
import { formatMoney as fmt, formatDateBR as fmtDate } from './ui/Format';
import KpiCard from './ui/KpiCard';
import { usePersistedState } from './ui/TableUtils';
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

// ─── main ────────────────────────────────────────────────────

interface Props {
    organizationId: string;
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

    // Toast de Notificação — Seção 13 do guia
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const load = useCallback(async () => {
        if (!organizationId) return;
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
        return r;
    }, [rows, filter, search]);

    /** Mesmo critério do handleCancel: precisa estar ativa e vinculada a um recebível. */
    const isSelectable = (c: ClientCharge) => c.status !== 'CANCELLED' && !PAID.includes(c.status) && !!c.transaction_id;
    const selectableVisible = useMemo(() => filtered.filter(isSelectable), [filtered]);
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
                await clientChargeService.cancel(organizationId, c.transaction_id!);
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
            const r = await clientChargeService.resend(organizationId, c.id);
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
            await clientChargeService.cancel(organizationId, c.transaction_id);
            await load();
            notify('Cobrança cancelada.');
        } catch (e) {
            notify('Erro: ' + (e instanceof Error ? e.message : 'Falha ao cancelar'), 'error');
        } finally {
            setCancelling(null);
        }
    }

    return (
        <div className="w-full min-h-screen bg-gray-50/50 p-4 sm:p-8">
            <div className="max-w-[1600px] mx-auto space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/20">
                            <Landmark className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Cobranças</h1>
                            <p className="text-sm font-medium text-gray-500 mt-1">Boletos e PIX emitidos aos clientes via Asaas</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={load} className="flex items-center gap-2 px-4 py-3 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-bold rounded-[1.25rem] transition-all active:scale-95 shadow-sm" title="Atualizar">
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">Atualizar</span>
                        </button>
                    </div>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <KpiCard label="Total Emitido" value={fmt(kpis.emitido)}  sub={`${rows.filter(c => c.status !== 'CANCELLED').length} cobranças`} icon={<Landmark className="w-5 h-5" />} color="gray" />
                    <KpiCard label="Recebido"      value={fmt(kpis.recebido)} sub={`${rows.filter(c => PAID.includes(c.status)).length} pagas`}     icon={<Check className="w-5 h-5" />}    color="emerald" />
                    <KpiCard label="Pendente"      value={fmt(kpis.pendente)} sub={`${rows.filter(c => c.status === 'PENDING').length} aguardando`}  icon={<RefreshCw className="w-5 h-5" />} color="blue" />
                    <KpiCard label="Vencido"       value={fmt(kpis.vencido)}  sub={`${rows.filter(c => c.status === 'OVERDUE').length} em atraso`}   icon={<AlertCircle className="w-5 h-5" />} color={kpis.vencido > 0 ? 'red' : 'gray'} />
                </div>

                {/* Toolbar e Search */}
                <div className="bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col xl:flex-row gap-4 items-center mb-6">
                    <div className="relative flex-1 w-full group">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-emerald-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Buscar por cliente, descrição ou ID Asaas..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-12 pr-6 py-4 bg-gray-50 border border-transparent rounded-[1.5rem] text-sm font-medium focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                        />
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pb-4 xl:pb-0 scrollbar-hide shrink-0 w-full xl:w-auto">
                        {FILTERS.map(f => {
                            const isActive = filter === f.id;
                            return (
                                <button
                                    key={f.id}
                                    onClick={() => setFilter(f.id)}
                                    className={`flex items-center gap-2 px-4 py-4 rounded-[1.25rem] transition-all active:scale-95 shadow-sm text-sm font-semibold uppercase tracking-wider whitespace-nowrap ${
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
                </div>

            {/* Barra de ação em massa (F3) */}
            {selectedVisible.length > 0 && (
                <div className="flex items-center gap-4 bg-red-600 text-white px-6 py-4 rounded-[1.5rem] flex-shrink-0 shadow-lg animate-in fade-in slide-in-from-bottom-4 z-50">
                    <span className="text-sm font-semibold">
                        {selectedVisible.length} selecionada{selectedVisible.length !== 1 ? 's' : ''}
                        <span className="ml-2 font-normal text-red-100">{fmt(selectedTotal)}</span>
                    </span>
                    <div className="flex-1" />
                    <button
                        onClick={handleBulkCancel}
                        disabled={bulkLoading}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-red-700 text-sm font-bold hover:bg-red-50 disabled:opacity-60 transition-colors"
                    >
                        {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Slash className="w-4 h-4" />}
                        Cancelar
                    </button>
                    <button
                        onClick={clearSelection}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-bold text-red-100 hover:text-white hover:bg-red-500 transition-colors"
                    >
                        Limpar
                    </button>
                </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
                {error && (
                    <div className="m-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-semibold">{error}</div>
                )}
                {loading ? (
                    <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                        <Landmark className="w-12 h-12 mb-3 opacity-30" />
                        <p className="text-base font-semibold">Nenhuma cobrança encontrada</p>
                        <p className="text-sm mt-1">Emita boletos/PIX em Contas a Receber</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 font-semibold uppercase text-xs tracking-wider border-b border-gray-200">
                                    <th className="w-10 px-6 py-2 text-center border-r border-gray-100">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-40"
                                            checked={allVisibleSelected}
                                            disabled={selectableVisible.length === 0}
                                            onChange={toggleAllVisible}
                                            title="Selecionar todas (canceláveis)"
                                        />
                                    </th>
                                    {['Cliente', 'Descrição', 'Tipo', 'Vencimento', 'Valor', 'Status', 'Ações'].map(h => (
                                        <th key={h} className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-left">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {filtered.map(c => {
                                    const isOverdue = c.status === 'OVERDUE';
                                    const isCancelled = c.status === 'CANCELLED';
                                    const active = !isCancelled && !PAID.includes(c.status);
                                    return (
                                        <React.Fragment key={c.id}>
                                            <tr className={`group hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${selectedIds.has(c.id) ? 'bg-red-50/60 hover:bg-red-50' : isOverdue ? 'bg-red-50/10' : ''} ${isCancelled ? 'opacity-50' : ''}`}>
                                                <td className="w-10 px-6 py-2.5 text-center border-r border-gray-100">
                                                    {isSelectable(c) ? (
                                                        <input
                                                            type="checkbox"
                                                            className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                                            checked={selectedIds.has(c.id)}
                                                            onChange={() => toggleRow(c.id)}
                                                        />
                                                    ) : null}
                                                </td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-900 max-w-[160px] truncate">{c.party_name ?? '—'}</td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700 max-w-[200px] truncate">{c.description ?? '—'}</td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{c.billing_type === 'PIX' ? 'PIX' : c.billing_type === 'UNDEFINED' ? 'Boleto+PIX' : 'Boleto'}</td>
                                                <td className={`px-6 py-2.5 border-r border-gray-100 text-sm font-normal whitespace-nowrap ${isOverdue ? 'text-red-600' : 'text-gray-700'}`}>{fmtDate(c.due_date)}</td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-gray-800 whitespace-nowrap">{fmt(c.value)}</td>
                                                <td className="px-6 py-2.5 border-r border-gray-100">
                                                    <StatusBadge status={c.status} />
                                                </td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    <div className="flex items-center gap-1.5">
                                                        {(c.bank_slip_url || c.invoice_url || c.pix_payload) && (
                                                            <button onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                                                                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1">
                                                                {expanded === c.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Links
                                                            </button>
                                                        )}
                                                        {active && (
                                                            <button onClick={() => handleCancel(c)} disabled={cancelling === c.id}
                                                                className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1">
                                                                {cancelling === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Slash className="w-3 h-3" />} Cancelar
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                            {expanded === c.id && (
                                                <tr className="bg-gray-50/60 border-b border-gray-100">
                                                    <td colSpan={8} className="px-6 py-4">
                                                        <div className="flex flex-wrap gap-3">
                                                            {c.bank_slip_url && (
                                                                <a href={c.bank_slip_url} target="_blank" rel="noreferrer"
                                                                    className="flex items-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 rounded-lg text-xs font-bold text-blue-700 transition-colors">
                                                                    <FileText className="w-3.5 h-3.5" /> Boleto (PDF) <ExternalLink className="w-3 h-3" />
                                                                </a>
                                                            )}
                                                            {c.billing_type !== 'PIX' && !PAID.includes(c.status) && c.status !== 'CANCELLED' && c.asaas_payment_id && (
                                                                <button onClick={() => handleResend(c)} disabled={resending === c.id}
                                                                    className="flex items-center gap-2 px-3 py-2 bg-violet-50 hover:bg-violet-100 rounded-lg text-xs font-bold text-violet-700 transition-colors disabled:opacity-50">
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
                                                                    className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold text-gray-700 transition-colors">
                                                                    <ExternalLink className="w-3.5 h-3.5" /> Página de pagamento
                                                                </a>
                                                            )}
                                                            {c.pix_payload && (
                                                                <button onClick={() => copyPix(c)}
                                                                    className="flex items-center gap-2 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 rounded-lg text-xs font-bold text-emerald-700 transition-colors">
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
                <div className="flex justify-center mt-6">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{filtered.length} cobrança{filtered.length !== 1 ? 's' : ''}</p>
                </div>
            )}
            </div>

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
