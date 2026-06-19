import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle, BarChart2, Brain, ChevronDown, ChevronUp,
    Loader2, RefreshCw, ShieldAlert, TrendingDown, TrendingUp,
} from 'lucide-react';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { financialIntelligenceService } from '../services/financialIntelligenceService';
import type {
    FinancialAlert, ProjectScorecard, CashflowProjectionPoint,
} from '../services/financialIntelligenceService';

// ─── helpers ────────────────────────────────────────────────

function fmt(v: number | null | undefined, compact = false) {
    if (v == null) return '—';
    if (compact && Math.abs(v) >= 1_000_000)
        return (v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' M';
    if (compact && Math.abs(v) >= 1_000)
        return (v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' k';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso: string) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y.slice(2)}`;
}

const SEVERITY_STYLES = {
    HIGH:   { bar: 'bg-red-500',    badge: 'bg-red-50 text-red-700 border-red-200',   icon: 'text-red-500',    label: 'Alto'   },
    MEDIUM: { bar: 'bg-amber-400',  badge: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'text-amber-500', label: 'Médio' },
    LOW:    { bar: 'bg-blue-400',   badge: 'bg-blue-50 text-blue-700 border-blue-200',  icon: 'text-blue-500',   label: 'Baixo'  },
};

const ALERT_TYPE_LABELS: Record<string, string> = {
    CASHFLOW_RISK:          'Risco de Caixa',
    OVERDUE_HIGH:           'Inadimplência Crítica',
    OVERDUE_AGING:          'Taxa de Inadimplência',
    MARGIN_LOW:             'Margem Baixa',
    SUPPLIER_CONCENTRATION: 'Concentração de Fornecedor',
};

const RISCO_COLORS = { HIGH: '#ef4444', MEDIUM: '#f59e0b', OK: '#22c55e' };
const HORIZON_OPTIONS = [
    { label: '30 dias', value: 30 },
    { label: '60 dias', value: 60 },
    { label: '90 dias', value: 90 },
    { label: '180 dias', value: 180 },
];

// ─── sub-components ─────────────────────────────────────────

function AlertCard({ alert }: { alert: FinancialAlert }) {
    const [open, setOpen] = useState(false);
    const s = SEVERITY_STYLES[alert.severity];
    return (
        <div className={`rounded-xl border ${s.badge} overflow-hidden`}>
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-start gap-3 p-4 text-left"
            >
                <ShieldAlert className={`w-4 h-4 mt-0.5 flex-shrink-0 ${s.icon}`} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black uppercase tracking-widest opacity-60">
                            {ALERT_TYPE_LABELS[alert.alert_type] ?? alert.alert_type}
                        </span>
                        <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${s.badge}`}>
                            {s.label}
                        </span>
                    </div>
                    <p className="text-sm font-bold mt-0.5 truncate">{alert.title}</p>
                </div>
                {alert.amount != null && (
                    <span className="font-black text-sm whitespace-nowrap ml-2">
                        {fmt(Math.abs(alert.amount), true)}
                    </span>
                )}
                {open ? <ChevronUp className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
            </button>
            {open && (
                <div className="px-4 pb-4 pt-0 text-xs text-current opacity-80 leading-relaxed border-t border-current/10">
                    {alert.description}
                </div>
            )}
        </div>
    );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
    return (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">{label}</p>
            <p className={`text-xl font-black ${color ?? 'text-gray-900'}`}>{value}</p>
            {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
    );
}

function CashflowTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number }[]; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs">
            <p className="font-bold text-gray-700 mb-1">{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ color: '#3b82f6' }}>{p.name}: {fmt(p.value)}</p>
            ))}
        </div>
    );
}

// ─── tabs ────────────────────────────────────────────────────

type Tab = 'alertas' | 'obras' | 'projecao';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'alertas',  label: 'Alertas',            icon: ShieldAlert  },
    { id: 'obras',    label: 'Scorecard de Obras',  icon: BarChart2    },
    { id: 'projecao', label: 'Projeção de Caixa',   icon: TrendingUp   },
];

// ─── main ────────────────────────────────────────────────────

interface Props {
    organizationId: string;
    onNavigate?: (view: string) => void;
}

export default function FinancialIntelligence({ organizationId, onNavigate }: Props) {
    const [tab, setTab]               = useState<Tab>('alertas');
    const [alerts, setAlerts]         = useState<FinancialAlert[]>([]);
    const [scorecards, setScorecards] = useState<ProjectScorecard[]>([]);
    const [projection, setProjection] = useState<CashflowProjectionPoint[]>([]);
    const [horizon, setHorizon]       = useState(90);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        setError(null);
        try {
            const [a, s, p] = await Promise.all([
                financialIntelligenceService.getAlerts(organizationId),
                financialIntelligenceService.getProjectScorecards(organizationId),
                financialIntelligenceService.getCashflowProjection(organizationId, horizon),
            ]);
            setAlerts(a);
            setScorecards(s);
            setProjection(p);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao carregar');
        } finally {
            setLoading(false);
        }
    }, [organizationId, horizon]);

    useEffect(() => { load(); }, [load]);

    const summary = useMemo(() => {
        const high   = alerts.filter(a => a.severity === 'HIGH').length;
        const medium = alerts.filter(a => a.severity === 'MEDIUM').length;
        const obrasRisco  = scorecards.filter(s => s.risco !== 'OK').length;
        const margemMedia = scorecards.length > 0
            ? scorecards.reduce((acc, s) => acc + s.margem_pct, 0) / scorecards.length
            : 0;
        const saldoFinal = projection.length > 0 ? projection[projection.length - 1].saldo_acum : 0;
        return { high, medium, obrasRisco, margemMedia, saldoFinal };
    }, [alerts, scorecards, projection]);

    const projectionSampled = useMemo(() => {
        if (projection.length <= 30) return projection;
        const step = Math.ceil(projection.length / 30);
        return projection.filter((_, i) => i % step === 0 || i === projection.length - 1);
    }, [projection]);

    return (
        <div className="h-full flex flex-col bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center">
                            <Brain className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">Inteligência Financeira</h1>
                            <p className="text-xs text-gray-500">Alertas automáticos, scorecard de obras e projeção de caixa</p>
                        </div>
                    </div>
                    <button
                        onClick={load}
                        className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                        title="Atualizar"
                    >
                        <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {/* KPI summary row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                    <KpiCard
                        label="Alertas Críticos"
                        value={String(summary.high)}
                        sub={`${summary.medium} médios`}
                        color={summary.high > 0 ? 'text-red-600' : 'text-gray-900'}
                    />
                    <KpiCard
                        label="Obras em Risco"
                        value={String(summary.obrasRisco)}
                        sub={`de ${scorecards.length} obras ativas`}
                        color={summary.obrasRisco > 0 ? 'text-amber-600' : 'text-gray-900'}
                    />
                    <KpiCard
                        label="Margem Média"
                        value={`${summary.margemMedia.toFixed(1)}%`}
                        sub="média das obras ativas"
                        color={summary.margemMedia < 10 ? 'text-red-600' : summary.margemMedia < 20 ? 'text-amber-600' : 'text-green-700'}
                    />
                    <KpiCard
                        label={`Saldo Projetado (${horizon}d)`}
                        value={fmt(summary.saldoFinal, true)}
                        color={summary.saldoFinal < 0 ? 'text-red-600' : 'text-green-700'}
                    />
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white border-b border-gray-100 px-6 flex-shrink-0">
                <div className="flex gap-1">
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${
                                tab === t.id
                                    ? 'border-violet-600 text-violet-700'
                                    : 'border-transparent text-gray-400 hover:text-gray-700'
                            }`}
                        >
                            <t.icon className="w-3.5 h-3.5" />
                            {t.label}
                            {t.id === 'alertas' && alerts.length > 0 && (
                                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                                    summary.high > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                                }`}>
                                    {alerts.length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                {error && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-semibold">{error}</div>
                )}
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                    </div>
                ) : (
                    <>
                        {/* ── Tab: Alertas ─────────────────────────── */}
                        {tab === 'alertas' && (
                            <div className="max-w-2xl space-y-3">
                                {alerts.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                                        <ShieldAlert className="w-10 h-10 mb-3 opacity-30" />
                                        <p className="text-sm font-semibold">Nenhum alerta ativo</p>
                                        <p className="text-xs mt-1">Todos os indicadores estão dentro dos limites</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex gap-3 mb-4">
                                            {(['HIGH','MEDIUM','LOW'] as const).map(sev => {
                                                const cnt = alerts.filter(a => a.severity === sev).length;
                                                if (!cnt) return null;
                                                const s = SEVERITY_STYLES[sev];
                                                return (
                                                    <div key={sev} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold ${s.badge}`}>
                                                        <span className={`w-2 h-2 rounded-full ${s.bar}`} />
                                                        {cnt} {s.label}{cnt > 1 ? 's' : ''}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {alerts.map((a, i) => <AlertCard key={i} alert={a} />)}
                                    </>
                                )}
                            </div>
                        )}

                        {/* ── Tab: Obras ───────────────────────────── */}
                        {tab === 'obras' && (
                            <div className="space-y-4">
                                {scorecards.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                                        <BarChart2 className="w-10 h-10 mb-3 opacity-30" />
                                        <p className="text-sm font-semibold">Nenhuma obra com dados financeiros</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Gráfico de margem por obra */}
                                        <div className="bg-white rounded-2xl border border-gray-100 p-5">
                                            <h3 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-4">
                                                Margem por Obra (%)
                                            </h3>
                                            <ResponsiveContainer width="100%" height={220}>
                                                <BarChart
                                                    data={scorecards.slice(0, 10)}
                                                    layout="vertical"
                                                    margin={{ top: 0, right: 60, left: 0, bottom: 0 }}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                                                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                                                    <YAxis type="category" dataKey="project_name" tick={{ fontSize: 10 }} width={120} />
                                                    <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, 'Margem']} />
                                                    <Bar dataKey="margem_pct" radius={[0, 4, 4, 0]}>
                                                        {scorecards.slice(0, 10).map((s, i) => (
                                                            <Cell key={i} fill={s.margem_pct < 0 ? '#ef4444' : s.margem_pct < 10 ? '#f59e0b' : '#22c55e'} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>

                                        {/* Tabela de scorecards */}
                                        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-50 border-b border-gray-100">
                                                    <tr>
                                                        {['Obra', 'Receita Real.', 'Custo Real.', 'Margem', 'AR Pendente', 'AP Pendente', 'Saldo Proj.', 'Risco'].map(h => (
                                                            <th key={h} className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-500 whitespace-nowrap">
                                                                {h}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {scorecards.map(s => (
                                                        <tr key={s.project_id} className="hover:bg-gray-50 transition-colors">
                                                            <td className="px-4 py-3 font-semibold text-gray-900 max-w-[180px] truncate">{s.project_name}</td>
                                                            <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">{fmt(s.receita_realizada, true)}</td>
                                                            <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">{fmt(s.custo_realizado, true)}</td>
                                                            <td className={`px-4 py-3 font-black text-xs whitespace-nowrap ${s.margem_pct < 0 ? 'text-red-600' : s.margem_pct < 10 ? 'text-amber-600' : 'text-green-700'}`}>
                                                                {s.margem_pct.toFixed(1)}%
                                                            </td>
                                                            <td className="px-4 py-3 font-mono text-xs text-blue-700 whitespace-nowrap">{fmt(s.ar_pendente, true)}</td>
                                                            <td className="px-4 py-3 font-mono text-xs text-orange-700 whitespace-nowrap">{fmt(s.ap_pendente, true)}</td>
                                                            <td className={`px-4 py-3 font-black text-xs whitespace-nowrap ${s.saldo_projetado < 0 ? 'text-red-600' : 'text-green-700'}`}>
                                                                {fmt(s.saldo_projetado, true)}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <span
                                                                    className="inline-block w-2.5 h-2.5 rounded-full"
                                                                    style={{ backgroundColor: RISCO_COLORS[s.risco] }}
                                                                    title={s.risco}
                                                                />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* ── Tab: Projeção ────────────────────────── */}
                        {tab === 'projecao' && (
                            <div className="space-y-4">
                                {/* Horizon selector */}
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-gray-500">Horizonte:</span>
                                    {HORIZON_OPTIONS.map(h => (
                                        <button
                                            key={h.value}
                                            onClick={() => setHorizon(h.value)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                                                horizon === h.value
                                                    ? 'bg-violet-600 text-white'
                                                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                                            }`}
                                        >
                                            {h.label}
                                        </button>
                                    ))}
                                </div>

                                {projection.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                                        <TrendingDown className="w-10 h-10 mb-3 opacity-30" />
                                        <p className="text-sm font-semibold">Sem títulos pendentes para projetar</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Saldo acumulado */}
                                        <div className="bg-white rounded-2xl border border-gray-100 p-5">
                                            <h3 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-4">
                                                Saldo Acumulado Projetado
                                            </h3>
                                            <ResponsiveContainer width="100%" height={240}>
                                                <AreaChart data={projectionSampled} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                                                    <defs>
                                                        <linearGradient id="grad-acum" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.15} />
                                                            <stop offset="95%" stopColor="#7c3aed" stopOpacity={0}    />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                                    <XAxis dataKey="data_ref" tickFormatter={fmtDate} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                                                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmt(v, true)} width={72} />
                                                    <Tooltip content={<CashflowTooltip />} formatter={(v: number) => fmt(v)} labelFormatter={fmtDate} />
                                                    <Area
                                                        type="monotone"
                                                        dataKey="saldo_acum"
                                                        name="Saldo Acumulado"
                                                        stroke="#7c3aed"
                                                        strokeWidth={2}
                                                        fill="url(#grad-acum)"
                                                        dot={false}
                                                    />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>

                                        {/* Entradas vs Saídas diárias */}
                                        <div className="bg-white rounded-2xl border border-gray-100 p-5">
                                            <h3 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-4">
                                                Entradas × Saídas por Dia
                                            </h3>
                                            <ResponsiveContainer width="100%" height={180}>
                                                <BarChart data={projectionSampled} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                                    <XAxis dataKey="data_ref" tickFormatter={fmtDate} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                                                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmt(v, true)} width={72} />
                                                    <Tooltip formatter={(v: number) => fmt(v)} labelFormatter={fmtDate} />
                                                    <Bar dataKey="cr_previsto" name="Entradas" fill="#22c55e" radius={[2, 2, 0, 0]} stackId="a" />
                                                    <Bar dataKey="db_previsto" name="Saídas"   fill="#f97316" radius={[2, 2, 0, 0]} stackId="b" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>

                                        {/* Resumo final */}
                                        <div className="grid grid-cols-3 gap-3">
                                            {[
                                                { label: 'Total Previsto Entrar',  value: projection.reduce((a, p) => a + p.cr_previsto, 0), color: 'text-green-700' },
                                                { label: 'Total Previsto Sair',    value: projection.reduce((a, p) => a + p.db_previsto, 0), color: 'text-orange-700' },
                                                { label: `Saldo Final (${horizon}d)`, value: summary.saldoFinal, color: summary.saldoFinal < 0 ? 'text-red-600' : 'text-violet-700' },
                                            ].map(k => (
                                                <div key={k.label} className="bg-white rounded-xl border border-gray-100 p-4">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">{k.label}</p>
                                                    <p className={`text-base font-black ${k.color}`}>{fmt(k.value, true)}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
