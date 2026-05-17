import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertCircle, Building2, Check, ChevronDown, ChevronUp,
    Clock, ExternalLink, FileText, Loader2, RefreshCw,
    Search, TrendingDown, X,
} from 'lucide-react';
import { invoiceService } from '../services/invoiceService';
import { Invoice } from '../types/financial';
import type { Organization } from '../types';

type InvoiceRow = Invoice & { supplierName?: string };
type StatusFilter = 'all' | 'pending' | 'approved' | 'paid' | 'rejected' | 'overdue';

const STATUS_PT: Record<string, string> = {
    pending: 'Pendente',
    approved: 'Aprovado',
    rejected: 'Rejeitado',
    paid: 'Pago',
};

const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

function isOverdue(inv: InvoiceRow) {
    if (!inv.dueDate) return false;
    if (['paid', 'rejected'].includes(inv.status)) return false;
    return new Date(inv.dueDate + 'T00:00:00') < today();
}

function StatusBadge({ inv }: { inv: InvoiceRow }) {
    if (isOverdue(inv)) {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-red-50 text-red-700 border border-red-100">
                <AlertCircle className="w-2.5 h-2.5" /> Atrasado
            </span>
        );
    }
    const map: Record<string, string> = {
        paid: 'bg-green-50 text-green-700 border-green-100',
        approved: 'bg-blue-50 text-blue-700 border-blue-100',
        pending: 'bg-yellow-50 text-yellow-700 border-yellow-100',
        rejected: 'bg-gray-50 text-gray-500 border-gray-100',
    };
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${map[inv.status] ?? 'bg-gray-50 text-gray-500 border-gray-100'}`}>
            {STATUS_PT[inv.status] ?? inv.status}
        </span>
    );
}

function fmt(v: number | undefined) {
    if (v == null) return '—';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d: string | undefined) {
    if (!d) return '—';
    return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
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

    const [selectedOrgId, setSelectedOrgId] = useState<string>('ALL');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [vencDe, setVencDe] = useState('');
    const [vencAte, setVencAte] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    const effectiveOrgId = selectedOrgId === 'ALL' ? undefined : selectedOrgId;

    async function carregar(orgId?: string) {
        setLoading(true);
        setError(null);
        try {
            const data = await invoiceService.listAll(orgId);
            setInvoices(data);
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
        } catch (e: any) {
            alert('Erro: ' + (e.message ?? 'Falha ao marcar como pago'));
        } finally {
            setMarcandoPago(null);
        }
    }

    const filtered = useMemo(() => {
        return invoices.filter(inv => {
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
    }, [invoices, statusFilter, vencDe, vencAte, search]);

    const summary = useMemo(() => {
        const now = today();
        const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
        const fimMes = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const em7 = new Date(now); em7.setDate(em7.getDate() + 7);

        let aPagar = 0, venc7 = 0, atrasado = 0, pagoMes = 0;
        invoices.forEach(inv => {
            const due = inv.dueDate ? new Date(inv.dueDate + 'T00:00:00') : null;
            if (inv.status === 'paid') {
                const criado = new Date(inv.createdAt);
                if (criado >= inicioMes && criado <= fimMes) pagoMes += inv.amount ?? 0;
            } else if (inv.status !== 'rejected') {
                aPagar += inv.amount ?? 0;
                if (due) {
                    if (due < now) atrasado += inv.amount ?? 0;
                    else if (due <= em7) venc7 += inv.amount ?? 0;
                }
            }
        });
        return { aPagar, venc7, atrasado, pagoMes };
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
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { label: 'A Pagar', value: summary.aPagar, color: 'blue', onClick: () => setStatusFilter('all') },
                            { label: 'Vence em 7d', value: summary.venc7, color: 'yellow', onClick: () => { setStatusFilter('all'); const d = new Date(); d.setDate(d.getDate() + 7); setVencAte(d.toISOString().slice(0, 10)); setVencDe(new Date().toISOString().slice(0, 10)); } },
                            { label: 'Em Atraso', value: summary.atrasado, color: 'red', onClick: () => setStatusFilter('overdue') },
                            { label: 'Pago no Mês', value: summary.pagoMes, color: 'green', onClick: () => setStatusFilter('paid') },
                        ].map(card => (
                            <button
                                key={card.label}
                                onClick={card.onClick}
                                className={`bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-${card.color}-300 hover:shadow-sm transition-all`}
                            >
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{card.label}</p>
                                <p className={`text-xl font-bold text-${card.color}-600`}>{fmt(card.value)}</p>
                            </button>
                        ))}
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
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${statusFilter === s ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                    >
                                        {s === 'all' ? 'Todos' : s === 'overdue' ? 'Atrasado' : STATUS_PT[s]}
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={() => setShowFilters(v => !v)}
                                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50"
                            >
                                {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                Filtros
                            </button>
                        </div>

                        {showFilters && (
                            <div className="flex gap-3 pt-2 border-t border-gray-100">
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <span>Vencimento:</span>
                                    <input type="date" value={vencDe} onChange={e => setVencDe(e.target.value)}
                                        className="border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-red-400" />
                                    <span>até</span>
                                    <input type="date" value={vencAte} onChange={e => setVencAte(e.target.value)}
                                        className="border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-red-400" />
                                    {(vencDe || vencAte) && (
                                        <button onClick={() => { setVencDe(''); setVencAte(''); }} className="text-red-500 hover:text-red-700">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

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
                                        <th className="text-left px-4 py-3">Fornecedor / Documento</th>
                                        <th className="text-left px-4 py-3">Origem</th>
                                        <th className="text-right px-4 py-3">Valor</th>
                                        <th className="text-center px-4 py-3">Vencimento</th>
                                        <th className="text-center px-4 py-3">Status</th>
                                        <th className="text-right px-4 py-3">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filtered.map(inv => {
                                        const dueDate = inv.dueDate ? new Date(inv.dueDate + 'T00:00:00') : null;
                                        const overdue = isOverdue(inv);
                                        const fromBoleto = (inv.notes ?? '').includes('[boleto:');

                                        return (
                                            <tr key={inv.id} className={`hover:bg-gray-50 transition-colors ${overdue ? 'bg-red-50/30' : ''}`}>
                                                <td className="px-4 py-3">
                                                    <p className="font-medium text-gray-900 truncate max-w-xs">{inv.supplierName ?? '—'}</p>
                                                    <p className="text-xs text-gray-400 truncate max-w-xs">{inv.fileName}</p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {fromBoleto ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-indigo-50 text-indigo-700 border border-indigo-100">
                                                            <FileText className="w-2.5 h-2.5" /> Boleto
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-gray-50 text-gray-500 border border-gray-100">
                                                            Manual
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right font-semibold text-gray-900">
                                                    {fmt(inv.amount)}
                                                </td>
                                                <td className={`px-4 py-3 text-center text-xs font-medium ${overdue ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                                                    {fmtDate(inv.dueDate)}
                                                    {overdue && dueDate && (
                                                        <div className="text-[10px] text-red-500">
                                                            {Math.floor((today().getTime() - dueDate.getTime()) / 86400000)}d atraso
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <StatusBadge inv={inv} />
                                                </td>
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

                                                        {/* Marcar como pago */}
                                                        {!['paid', 'rejected'].includes(inv.status) && (
                                                            <button
                                                                onClick={() => handleMarcarPago(inv)}
                                                                disabled={marcandoPago === inv.id}
                                                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 text-xs font-semibold border border-green-200 disabled:opacity-50 transition-colors"
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
                                        <td colSpan={2} className="px-4 py-2 text-xs text-gray-500">
                                            {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
                                        </td>
                                        <td className="px-4 py-2 text-right text-sm font-bold text-gray-900">
                                            {fmt(filtered.filter(i => !['paid', 'rejected'].includes(i.status)).reduce((s, i) => s + (i.amount ?? 0), 0))}
                                        </td>
                                        <td colSpan={3} className="px-4 py-2 text-xs text-gray-400 text-right">total a pagar (filtrado)</td>
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}
