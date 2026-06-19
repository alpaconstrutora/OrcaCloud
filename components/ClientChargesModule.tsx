import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertCircle, Check, ChevronDown, ChevronUp, Copy, ExternalLink,
    FileText, Loader2, QrCode, RefreshCw, Search, Slash, Landmark,
} from 'lucide-react';
import { clientChargeService } from '../services/clientChargeService';
import type { ClientCharge } from '../services/clientChargeService';

// ─── helpers ────────────────────────────────────────────────

function fmt(v: number | undefined | null) {
    if (v == null) return '—';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtDate(d: string | undefined | null) {
    if (!d) return '—';
    const [y, m, day] = d.slice(0, 10).split('-');
    return `${day}/${m}/${y}`;
}

// Asaas status → rótulo + cor
const STATUS_META: Record<string, { label: string; cls: string }> = {
    PENDING:   { label: 'Pendente',   cls: 'bg-gray-100 text-gray-600 border-gray-200' },
    RECEIVED:  { label: 'Recebido',   cls: 'bg-green-50 text-green-700 border-green-100' },
    CONFIRMED: { label: 'Confirmado', cls: 'bg-green-50 text-green-700 border-green-100' },
    OVERDUE:   { label: 'Vencido',    cls: 'bg-red-50 text-red-700 border-red-100' },
    REFUNDED:  { label: 'Estornado',  cls: 'bg-orange-50 text-orange-700 border-orange-100' },
    CANCELLED: { label: 'Cancelado',  cls: 'bg-gray-50 text-gray-400 border-gray-100' },
};

const PAID = ['RECEIVED', 'CONFIRMED'];

function StatusBadge({ status }: { status: string }) {
    const m = STATUS_META[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600 border-gray-200' };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${m.cls}`}>
            {status === 'OVERDUE' && <AlertCircle className="w-2.5 h-2.5 mr-1" />}
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
    const [rows, setRows]         = useState<ClientCharge[]>([]);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState<string | null>(null);
    const [search, setSearch]     = useState('');
    const [filter, setFilter]     = useState<StatusFilter>('all');
    const [expanded, setExpanded] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [cancelling, setCancelling] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        setError(null);
        try {
            const data = await clientChargeService.list(organizationId, { limit: 500 });
            setRows(data);
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

    async function handleCancel(c: ClientCharge) {
        if (!c.transaction_id) {
            alert('Esta cobrança não está vinculada a um recebível e não pode ser cancelada por aqui.');
            return;
        }
        if (!confirm(`Cancelar a cobrança de ${fmt(c.value)} de ${c.party_name ?? 'cliente'}? O boleto/PIX será invalidado no Asaas.`)) return;
        setCancelling(c.id);
        try {
            await clientChargeService.cancel(organizationId, c.transaction_id);
            await load();
        } catch (e) {
            alert('Erro: ' + (e instanceof Error ? e.message : 'Falha ao cancelar'));
        } finally {
            setCancelling(null);
        }
    }

    return (
        <div className="h-full flex flex-col bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
                            <Landmark className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">Cobranças</h1>
                            <p className="text-xs text-gray-500">Boletos e PIX emitidos aos clientes via Asaas</p>
                        </div>
                    </div>
                    <button onClick={load} className="p-2 hover:bg-gray-100 rounded-xl transition-colors" title="Atualizar">
                        <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                    {[
                        { label: 'Total Emitido', value: kpis.emitido,  color: 'text-gray-900' },
                        { label: 'Recebido',      value: kpis.recebido, color: 'text-green-700' },
                        { label: 'Pendente',      value: kpis.pendente, color: 'text-blue-700' },
                        { label: 'Vencido',       value: kpis.vencido,  color: kpis.vencido > 0 ? 'text-red-600' : 'text-gray-700' },
                    ].map(k => (
                        <div key={k.label} className="bg-gray-50 rounded-xl p-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">{k.label}</p>
                            <p className={`text-base font-black ${k.color}`}>{fmt(k.value)}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Toolbar */}
            <div className="bg-white border-b border-gray-100 px-6 py-3 flex-shrink-0">
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por cliente, descrição ou ID Asaas..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                    </div>
                    <div className="flex items-center gap-1 overflow-x-auto">
                        {FILTERS.map(f => (
                            <button
                                key={f.id}
                                onClick={() => setFilter(f.id)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                                    filter === f.id ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                {error && (
                    <div className="m-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-semibold">{error}</div>
                )}
                {loading ? (
                    <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                        <Landmark className="w-10 h-10 mb-3 opacity-30" />
                        <p className="text-sm font-semibold">Nenhuma cobrança encontrada</p>
                        <p className="text-xs mt-1">Emita boletos/PIX em Contas a Receber</p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                            <tr>
                                {['Cliente', 'Descrição', 'Tipo', 'Vencimento', 'Valor', 'Status', 'Ações'].map(h => (
                                    <th key={h} className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-500 whitespace-nowrap">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filtered.map(c => {
                                const isOverdue = c.status === 'OVERDUE';
                                const isCancelled = c.status === 'CANCELLED';
                                const active = !isCancelled && !PAID.includes(c.status);
                                return (
                                    <React.Fragment key={c.id}>
                                        <tr className={`hover:bg-gray-50 transition-colors ${isOverdue ? 'bg-red-50/30' : ''} ${isCancelled ? 'opacity-50' : ''}`}>
                                            <td className="px-4 py-3 font-semibold text-gray-900 max-w-[160px] truncate">{c.party_name ?? '—'}</td>
                                            <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{c.description ?? '—'}</td>
                                            <td className="px-4 py-3 text-gray-500 text-xs">{c.billing_type === 'PIX' ? 'PIX' : c.billing_type === 'UNDEFINED' ? 'Boleto+PIX' : 'Boleto'}</td>
                                            <td className={`px-4 py-3 font-mono text-xs whitespace-nowrap ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-600'}`}>{fmtDate(c.due_date)}</td>
                                            <td className="px-4 py-3 font-black text-gray-900 whitespace-nowrap">{fmt(c.value)}</td>
                                            <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1.5">
                                                    {(c.bank_slip_url || c.invoice_url || c.pix_payload) && (
                                                        <button onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                                                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors flex items-center gap-1">
                                                            {expanded === c.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Links
                                                        </button>
                                                    )}
                                                    {active && (
                                                        <button onClick={() => handleCancel(c)} disabled={cancelling === c.id}
                                                            className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors flex items-center gap-1">
                                                            {cancelling === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Slash className="w-3 h-3" />} Cancelar
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                        {expanded === c.id && (
                                            <tr className="bg-gray-50/60">
                                                <td colSpan={7} className="px-4 py-3">
                                                    <div className="flex flex-wrap gap-2">
                                                        {c.bank_slip_url && (
                                                            <a href={c.bank_slip_url} target="_blank" rel="noreferrer"
                                                                className="flex items-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 rounded-lg text-xs font-bold text-blue-700 transition-colors">
                                                                <FileText className="w-3.5 h-3.5" /> Boleto (PDF) <ExternalLink className="w-3 h-3" />
                                                            </a>
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
                                                            <span className="flex items-center px-3 py-2 text-[10px] font-mono text-gray-400">{c.asaas_payment_id}</span>
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
                )}
            </div>

            {/* Footer */}
            {!loading && (
                <div className="bg-white border-t border-gray-100 px-6 py-2 flex-shrink-0">
                    <p className="text-xs text-gray-400">{filtered.length} cobrança{filtered.length !== 1 ? 's' : ''}</p>
                </div>
            )}
        </div>
    );
}
