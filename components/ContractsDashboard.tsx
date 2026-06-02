import React, { useEffect, useState, useCallback } from 'react';
import {
    FileText, AlertTriangle, TrendingUp, Clock, DollarSign,
    CheckCircle2, XCircle, RotateCcw, ChevronRight, RefreshCw,
} from 'lucide-react';
import { contractService } from '../services/contractService';
import { Contract } from '../types';

interface Props {
    organizationId: string;
    onViewContract: (id: string) => void;
}

const fmt = (n: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');

const daysUntil = (dateStr: string) => {
    const diff = new Date(dateStr + 'T12:00:00').getTime() - Date.now();
    return Math.ceil(diff / 86400000);
};

const STATUS_LABEL: Record<string, string> = {
    Rascunho: 'Rascunho', Enviado: 'Enviado', Ativo: 'Ativo',
    Suspenso: 'Suspenso', Encerrado: 'Encerrado', Cancelado: 'Cancelado',
};
const STATUS_DOT: Record<string, string> = {
    Ativo: 'bg-emerald-500', Enviado: 'bg-blue-500', Rascunho: 'bg-gray-400',
    Suspenso: 'bg-amber-500', Encerrado: 'bg-gray-300', Cancelado: 'bg-red-400',
};

export const ContractsDashboard: React.FC<Props> = ({ organizationId, onViewContract }) => {
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'alerts' | 'active' | 'all'>('alerts');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await contractService.listContracts(undefined, organizationId);
            setContracts(data);
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => { load(); }, [load]);

    // ── KPIs ────────────────────────────────────────────────────────────────
    const active = contracts.filter(c => c.status === 'Ativo');
    const rascunho = contracts.filter(c => c.status === 'Rascunho' || c.status === 'Enviado');
    const totalReceita = active.reduce((s, c) => s + (c.current_value ?? 0), 0);
    const today = new Date();

    const vencendo30 = active.filter(c => {
        if (!c.end_date || c.is_recurring) return false;
        const d = daysUntil(c.end_date);
        return d >= 0 && d <= 30;
    });
    const vencendo90 = active.filter(c => {
        if (!c.end_date || c.is_recurring) return false;
        const d = daysUntil(c.end_date);
        return d > 30 && d <= 90;
    });
    const vencidos = contracts.filter(c => {
        if (!c.end_date || c.status !== 'Ativo' || c.is_recurring) return false;
        return daysUntil(c.end_date) < 0;
    });
    const reajustePendente = active.filter(c =>
        c.reajuste_index && c.reajuste_proximo && daysUntil(c.reajuste_proximo) <= 30
    );
    const semAprovacao = contracts.filter(c => c.approval_status === 'PENDENTE');

    // ── Alertas consolidados ────────────────────────────────────────────────
    type Alert = { id: string; level: 'critical' | 'warning' | 'info'; label: string; contract: Contract };
    const alerts: Alert[] = [
        ...vencidos.map(c => ({ id: c.id, level: 'critical' as const, label: `Vencido há ${Math.abs(daysUntil(c.end_date!))} dia(s)`, contract: c })),
        ...vencendo30.map(c => ({ id: c.id, level: 'warning' as const, label: `Vence em ${daysUntil(c.end_date!)} dia(s)`, contract: c })),
        ...reajustePendente.map(c => ({ id: c.id, level: 'warning' as const, label: `Reajuste ${c.reajuste_index} em ${daysUntil(c.reajuste_proximo!)} dia(s)`, contract: c })),
        ...semAprovacao.map(c => ({ id: c.id, level: 'info' as const, label: 'Aguardando aprovação', contract: c })),
        ...vencendo90.map(c => ({ id: c.id, level: 'info' as const, label: `Vence em ${daysUntil(c.end_date!)} dia(s)`, contract: c })),
    ];

    const kpis = [
        {
            label: 'Contratos Ativos', value: active.length.toString(),
            sub: `${rascunho.length} em rascunho/enviado`,
            icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50',
        },
        {
            label: 'Receita Contratada', value: fmt(totalReceita),
            sub: `${active.filter(c => c.is_recurring).length} recorrentes`,
            icon: DollarSign, color: 'text-blue-600', bg: 'bg-blue-50',
        },
        {
            label: 'Vencendo em 30 dias', value: vencendo30.length.toString(),
            sub: `${vencidos.length} já vencido(s)`,
            icon: Clock, color: vencendo30.length > 0 ? 'text-amber-600' : 'text-gray-400', bg: vencendo30.length > 0 ? 'bg-amber-50' : 'bg-gray-50',
        },
        {
            label: 'Reajustes Pendentes', value: reajustePendente.length.toString(),
            sub: `${semAprovacao.length} aguardando aprovação`,
            icon: RotateCcw, color: reajustePendente.length > 0 ? 'text-orange-600' : 'text-gray-400', bg: reajustePendente.length > 0 ? 'bg-orange-50' : 'bg-gray-50',
        },
    ];

    const tabContracts = tab === 'alerts'
        ? alerts.map(a => a.contract).filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i)
        : tab === 'active' ? active
        : contracts;

    return (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Carteira de Contratos</h2>
                <button onClick={load} disabled={loading} className="text-gray-400 hover:text-gray-700 disabled:opacity-50">
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {kpis.map(k => (
                    <div key={k.label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 space-y-3">
                        <div className={`w-9 h-9 ${k.bg} rounded-xl flex items-center justify-center`}>
                            <k.icon size={18} className={k.color} />
                        </div>
                        <div>
                            <p className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">{loading ? '…' : k.value}</p>
                            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mt-0.5">{k.label}</p>
                            <p className="text-[11px] text-gray-400 mt-1">{k.sub}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
                {([
                    { id: 'alerts', label: `Alertas${alerts.length > 0 ? ` (${alerts.length})` : ''}` },
                    { id: 'active', label: `Ativos (${active.length})` },
                    { id: 'all',    label: `Todos (${contracts.length})` },
                ] as const).map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            tab === t.id ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Alert badges quando na aba Alertas */}
            {tab === 'alerts' && alerts.length === 0 && !loading && (
                <div className="flex flex-col items-center gap-3 py-12 text-gray-400">
                    <CheckCircle2 size={32} strokeWidth={1} className="text-emerald-400" />
                    <p className="text-sm">Nenhum alerta. Carteira saudável.</p>
                </div>
            )}

            {/* Tabela */}
            {(tab !== 'alerts' || alerts.length > 0) && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                    {loading ? (
                        <div className="space-y-px">
                            {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-gray-50 dark:bg-gray-700/50 animate-pulse" />)}
                        </div>
                    ) : tabContracts.length === 0 ? (
                        <div className="py-12 text-center text-sm text-gray-400">Nenhum contrato encontrado.</div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Número</th>
                                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Título</th>
                                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                                    <th className="text-center px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Vencimento</th>
                                    {tab === 'alerts' && <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Alerta</th>}
                                    <th className="w-8" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                                {tabContracts.map(c => {
                                    const contractAlerts = alerts.filter(a => a.id === c.id);
                                    const topAlert = contractAlerts[0];
                                    const endDays = c.end_date && !c.is_recurring ? daysUntil(c.end_date) : null;
                                    return (
                                        <tr key={c.id} onClick={() => onViewContract(c.id)}
                                            className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer">
                                            <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-700 dark:text-blue-400">{c.number}</td>
                                            <td className="px-4 py-3 text-gray-900 dark:text-white font-medium max-w-[200px] truncate">{c.title}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-200">
                                                {fmt(c.current_value ?? 0)}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                                                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[c.status] ?? 'bg-gray-300'}`} />
                                                    {STATUS_LABEL[c.status] ?? c.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-500">
                                                {c.is_recurring ? (
                                                    <span className="text-blue-500">Recorrente</span>
                                                ) : c.end_date ? (
                                                    <span className={endDays !== null && endDays < 0 ? 'text-red-600 font-semibold' : endDays !== null && endDays <= 30 ? 'text-amber-600 font-semibold' : ''}>
                                                        {fmtDate(c.end_date)}
                                                        {endDays !== null && endDays < 0 && ` (vencido)`}
                                                    </span>
                                                ) : '—'}
                                            </td>
                                            {tab === 'alerts' && (
                                                <td className="px-4 py-3">
                                                    {topAlert && (
                                                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                                            topAlert.level === 'critical' ? 'bg-red-100 text-red-700' :
                                                            topAlert.level === 'warning'  ? 'bg-amber-100 text-amber-700' :
                                                                                             'bg-blue-100 text-blue-700'
                                                        }`}>
                                                            {topAlert.level === 'critical' && <XCircle size={11} />}
                                                            {topAlert.level === 'warning'  && <AlertTriangle size={11} />}
                                                            {topAlert.label}
                                                        </span>
                                                    )}
                                                </td>
                                            )}
                                            <td className="px-3 py-3 text-gray-300">
                                                <ChevronRight size={14} />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Distribuição por status */}
            {tab === 'all' && !loading && contracts.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(
                        contracts.reduce((acc, c) => { acc[c.status] = (acc[c.status] ?? 0) + 1; return acc; }, {} as Record<string, number>)
                    ).map(([status, count]) => (
                        <div key={status} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center gap-3">
                            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status] ?? 'bg-gray-300'}`} />
                            <span className="text-sm text-gray-700 dark:text-gray-200 font-medium flex-1">{STATUS_LABEL[status] ?? status}</span>
                            <span className="text-sm font-bold text-gray-900 dark:text-white">{count}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ContractsDashboard;
