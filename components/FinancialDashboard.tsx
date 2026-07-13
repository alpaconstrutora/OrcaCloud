import React, { useState, useEffect, useCallback } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell,
} from 'recharts';
import {
    TrendingUp, TrendingDown, DollarSign, AlertTriangle,
    ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight,
    ReceiptText, CreditCard, Landmark, BarChart3, ArrowRight,
} from 'lucide-react';
import { financialOverviewService } from '../services/financialOverviewService';
import { approvalService } from '../services/approvalService';
import type { FinancialKPIs, FinancialTopSupplier, DREProjectSummary } from '../types/financial';
import { KpiCard } from './ui/KpiCard';

// ─── helpers ────────────────────────────────────────────────
function formatBRL(v: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}
function formatBRLShort(v: number): string {
    if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000)    return `R$ ${(v / 1_000).toFixed(0)}k`;
    return formatBRL(v);
}
function isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
}

// ─── period helpers ──────────────────────────────────────────
type PeriodPreset = 'month' | 'quarter' | 'year';

function getPeriodBounds(preset: PeriodPreset, offset: number): { from: Date; to: Date; label: string } {
    const now = new Date();
    if (preset === 'month') {
        const y = now.getFullYear();
        const m = now.getMonth() + offset;
        const from = new Date(y, m, 1);
        const to   = new Date(y, m + 1, 0);
        return {
            from, to,
            label: from.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
        };
    }
    if (preset === 'quarter') {
        const q = Math.floor(now.getMonth() / 3) + offset;
        const qNorm = ((q % 4) + 4) % 4;
        const yearAdj = now.getFullYear() + Math.floor(q / 4);
        const from = new Date(yearAdj, qNorm * 3, 1);
        const to   = new Date(yearAdj, qNorm * 3 + 3, 0);
        return {
            from, to,
            label: `T${qNorm + 1}/${yearAdj}`,
        };
    }
    // year
    const y = now.getFullYear() + offset;
    return {
        from: new Date(y, 0, 1),
        to:   new Date(y, 11, 31),
        label: String(y),
    };
}

// ─── sub-components ──────────────────────────────────────────

const CustomBarTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-xs space-y-1 min-w-[200px]">
            <p className="font-black text-gray-700 mb-2 truncate max-w-[220px]">{label}</p>
            {payload.map(p => (
                <div key={p.name} className="flex justify-between gap-4">
                    <span style={{ color: p.color }} className="font-semibold">{p.name}</span>
                    <span className="font-bold text-gray-900 tabular-nums">{formatBRL(p.value)}</span>
                </div>
            ))}
        </div>
    );
};

// ─── main component ──────────────────────────────────────────

interface FinancialDashboardProps {
    organizationId: string | null;
    onNavigate?: (view: string) => void;
}

const FinancialDashboard: React.FC<FinancialDashboardProps> = ({ organizationId, onNavigate }) => {
    const [preset, setPreset]   = useState<PeriodPreset>('month');
    const [offset, setOffset]   = useState(0);

    const [kpis, setKpis]               = useState<FinancialKPIs | null>(null);
    const [topProjects, setTopProjects]  = useState<DREProjectSummary[]>([]);
    const [topSuppliers, setTopSuppliers] = useState<FinancialTopSupplier[]>([]);
    const [loading, setLoading]          = useState(true);
    const [error, setError]              = useState<string | null>(null);

    // Pendências de aprovação (enforcement soft) — independente do período
    const [pendingQtd, setPendingQtd]   = useState(0);
    const [pendingSoma, setPendingSoma] = useState(0);

    useEffect(() => {
        approvalService.getPendingSummary(organizationId)
            .then(s => {
                setPendingQtd(s.reduce((a, x) => a + Number(x.qtd), 0));
                setPendingSoma(s.reduce((a, x) => a + Number(x.soma), 0));
            })
            .catch(() => {});
    }, [organizationId]);

    const period = getPeriodBounds(preset, offset);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const from = isoDate(period.from);
            const to   = isoDate(period.to);
            const [k, projects, suppliers] = await Promise.all([
                financialOverviewService.getKPIs(organizationId, from, to),
                financialOverviewService.getTopProjects(organizationId, from, to),
                financialOverviewService.getTopSuppliers(organizationId, from, to, 8),
            ]);
            setKpis(k);
            setTopProjects(projects.slice(0, 8));
            setTopSuppliers(suppliers);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao carregar dados');
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [organizationId, preset, offset]);

    useEffect(() => { load(); }, [load]);

    const projectsChartData = topProjects.map(p => ({
        name: p.project_name.length > 20 ? p.project_name.slice(0, 18) + '…' : p.project_name,
        fullName: p.project_name,
        Receita: p.receita,
        Custo:   p.custo,
    }));

    const Spinner = () => (
        <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-500">Carregando...</p>
        </div>
    );

    return (
        <div className="space-y-6 p-6">

            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-black text-gray-900">Dashboard Financeiro</h1>
                    <p className="text-sm text-gray-400 mt-0.5">Visão executiva consolidada</p>
                </div>

                {/* Period controls */}
                <div className="flex items-center gap-2 flex-wrap">
                    {(['month', 'quarter', 'year'] as PeriodPreset[]).map(p => (
                        <button
                            key={p}
                            onClick={() => { setPreset(p); setOffset(0); }}
                            className={`px-3 py-1.5 rounded-lg text-button font-black uppercase tracking-widest transition-all ${
                                preset === p
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                        >
                            {p === 'month' ? 'Mês' : p === 'quarter' ? 'Trimestre' : 'Ano'}
                        </button>
                    ))}
                    <div className="flex items-center gap-1 border border-gray-200 rounded-lg overflow-hidden">
                        <button
                            onClick={() => setOffset(o => o - 1)}
                            className="px-2 py-1.5 hover:bg-gray-50 text-gray-500 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="px-3 text-xs font-bold text-gray-700 whitespace-nowrap min-w-[120px] text-center">
                            {period.label}
                        </span>
                        <button
                            onClick={() => setOffset(o => o + 1)}
                            disabled={offset >= 0}
                            className="px-2 py-1.5 hover:bg-gray-50 text-gray-500 transition-colors disabled:opacity-30"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 font-semibold">
                    {error}
                </div>
            )}

            {/* ── Pendências de aprovação (soft) ── */}
            {pendingQtd > 0 && (
                <button
                    onClick={() => onNavigate?.('financial-approval')}
                    className="w-full flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-left hover:bg-amber-100 transition-colors"
                >
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <div className="flex-1">
                        <p className="text-sm font-black text-amber-800">
                            {pendingQtd} {pendingQtd === 1 ? 'item acima da alçada sem aprovação' : 'itens acima da alçada sem aprovação'} ({formatBRL(pendingSoma)})
                        </p>
                        <p className="text-xs text-amber-600/80 mt-0.5">Clique para revisar a fila de aprovação.</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-amber-600 flex-shrink-0" />
                </button>
            )}

            {loading ? <Spinner /> : (
                <>
                    {/* ── KPI Cards ── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        <KpiCard
                            label="A Receber"
                            value={formatBRLShort(kpis?.a_receber ?? 0)}
                            icon={<TrendingUp className="w-5 h-5" />}
                            color="blue"
                            onClick={() => onNavigate?.('project-financial')}
                        />
                        <KpiCard
                            label="Recebido"
                            value={formatBRLShort(kpis?.recebido ?? 0)}
                            icon={<ArrowUpRight className="w-5 h-5" />}
                            color="emerald"
                            onClick={() => onNavigate?.('project-financial')}
                        />
                        <KpiCard
                            label="A Pagar"
                            value={formatBRLShort(kpis?.a_pagar ?? 0)}
                            icon={<CreditCard className="w-5 h-5" />}
                            color="orange"
                            onClick={() => onNavigate?.('contas-a-pagar')}
                        />
                        <KpiCard
                            label="Pago"
                            value={formatBRLShort(kpis?.pago ?? 0)}
                            icon={<ArrowDownRight className="w-5 h-5" />}
                            color="gray"
                            onClick={() => onNavigate?.('contas-a-pagar')}
                        />
                        <KpiCard
                            label="Boletos Vencidos"
                            value={formatBRLShort(kpis?.boletos_vencidos_valor ?? 0)}
                            sub={kpis?.boletos_vencidos_count ? `${kpis.boletos_vencidos_count} boleto${kpis.boletos_vencidos_count !== 1 ? 's' : ''}` : undefined}
                            icon={<AlertTriangle className="w-5 h-5" />}
                            color={(kpis?.boletos_vencidos_valor ?? 0) > 0 ? 'red' : 'gray'}
                            onClick={() => onNavigate?.('financial-boletos')}
                        />
                    </div>

                    {/* ── Resultado do período ── */}
                    {kpis && (
                        <div className={`rounded-2xl border p-4 flex items-center gap-4 ${
                            kpis.resultado_periodo >= 0
                                ? 'bg-green-50 border-green-100'
                                : 'bg-red-50 border-red-100'
                        }`}>
                            <DollarSign className={`w-5 h-5 flex-shrink-0 ${kpis.resultado_periodo >= 0 ? 'text-green-600' : 'text-red-500'}`} />
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest text-gray-500">Resultado do período (realizado)</p>
                                <p className={`text-lg font-black ${kpis.resultado_periodo >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                    {kpis.resultado_periodo >= 0 ? '+' : ''}{formatBRL(kpis.resultado_periodo)}
                                </p>
                            </div>
                            <p className="text-xs text-gray-400 ml-auto">{period.label}</p>
                        </div>
                    )}

                    {/* ── Charts row ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                        {/* Receita vs Custo por obra */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider">Obras — Receita × Custo</h2>
                                <button
                                    onClick={() => onNavigate?.('controladoria')}
                                    className="flex items-center gap-1 text-button text-blue-600 font-bold hover:underline"
                                >
                                    Ver DRE <ArrowRight className="w-3 h-3" />
                                </button>
                            </div>
                            {projectsChartData.length === 0 ? (
                                <div className="flex items-center justify-center h-48 text-sm text-gray-400">
                                    Sem movimentação no período
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart
                                        data={projectsChartData}
                                        layout="vertical"
                                        margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
                                        barCategoryGap="30%"
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                                        <XAxis
                                            type="number"
                                            tickFormatter={v => formatBRLShort(v)}
                                            tick={{ fontSize: 10, fill: '#9ca3af' }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            type="category"
                                            dataKey="name"
                                            tick={{ fontSize: 10, fill: '#6b7280' }}
                                            axisLine={false}
                                            tickLine={false}
                                            width={90}
                                        />
                                        <Tooltip content={<CustomBarTooltip />} />
                                        <Bar dataKey="Receita" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={14} />
                                        <Bar dataKey="Custo"   fill="#f97316" radius={[0, 4, 4, 0]} maxBarSize={14} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        {/* Top fornecedores */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider">Top Fornecedores — AP</h2>
                                <button
                                    onClick={() => onNavigate?.('financial-boletos')}
                                    className="flex items-center gap-1 text-button text-blue-600 font-bold hover:underline"
                                >
                                    Ver boletos <ArrowRight className="w-3 h-3" />
                                </button>
                            </div>
                            {topSuppliers.length === 0 ? (
                                <div className="flex items-center justify-center h-48 text-sm text-gray-400">
                                    Sem boletos no período
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {topSuppliers.map((s, i) => (
                                        <div key={i} className="flex items-center gap-3">
                                            <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-xs font-black text-gray-500 flex-shrink-0">
                                                {i + 1}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <p className="text-xs font-bold text-gray-800 truncate">{s.supplier_name}</p>
                                                    <p className="text-xs font-black text-gray-900 ml-2 whitespace-nowrap">{formatBRLShort(s.total_valor)}</p>
                                                </div>
                                                <div className="w-full bg-gray-100 rounded-full h-1.5">
                                                    <div
                                                        className="bg-orange-400 h-1.5 rounded-full transition-all"
                                                        style={{ width: `${Math.min(s.pct, 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                            <span className="text-xs font-black text-gray-400 w-10 text-right flex-shrink-0">
                                                {s.pct.toFixed(0)}%
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Quick links ── */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { label: 'Boletos', icon: ReceiptText, view: 'financial-boletos',  color: 'text-blue-600',  bg: 'bg-blue-50'  },
                            { label: 'Contas a Pagar', icon: CreditCard, view: 'contas-a-pagar', color: 'text-orange-500', bg: 'bg-orange-50' },
                            { label: 'Fluxo de Caixa', icon: TrendingDown, view: 'financial-cashflow', color: 'text-teal-600', bg: 'bg-teal-50' },
                            { label: 'Controladoria', icon: BarChart3, view: 'controladoria', color: 'text-purple-600', bg: 'bg-purple-50' },
                        ].map(item => (
                            <button
                                key={item.view}
                                onClick={() => onNavigate?.(item.view)}
                                className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md hover:border-gray-200 transition-all text-left"
                            >
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${item.bg}`}>
                                    <item.icon className={`w-4 h-4 ${item.color}`} />
                                </div>
                                <span className="text-xs font-black text-gray-700">{item.label}</span>
                                <ArrowRight className="w-3 h-3 text-gray-300 ml-auto" />
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default FinancialDashboard;
