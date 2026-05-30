import React from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Download } from 'lucide-react';
import { financialReportService } from '../services/financialReportService';
import { useToast } from '../hooks/useToast';
import type { CashFlowSummary, CashFlowGranularity } from '../types/financial';

function formatBRL(v: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function formatBRLShort(v: number): string {
    if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000)    return `R$ ${(v / 1_000).toFixed(0)}k`;
    return formatBRL(v);
}

interface KPIProps { label: string; value: number; icon: React.ElementType; color: string; positive?: boolean }
function KPICard({ label, value, icon: Icon, color, positive }: KPIProps) {
    const isPos = positive !== undefined ? positive : value >= 0;
    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-start gap-4 shadow-sm">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                <Icon className="w-5 h-5" />
            </div>
            <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
                <p className={`text-xl font-black mt-0.5 ${isPos ? 'text-gray-900' : 'text-red-600'}`}>
                    {formatBRL(value)}
                </p>
            </div>
        </div>
    );
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-xs space-y-1 min-w-[180px]">
            <p className="font-black text-gray-700 mb-2">{label}</p>
            {payload.map(p => (
                <div key={p.name} className="flex justify-between gap-4">
                    <span style={{ color: p.color }} className="font-semibold">{p.name}</span>
                    <span className="font-bold text-gray-900 tabular-nums">{formatBRL(p.value)}</span>
                </div>
            ))}
        </div>
    );
};

interface CashFlowDashboardProps {
    organizationId: string;
}

const CashFlowDashboard: React.FC<CashFlowDashboardProps> = ({ organizationId }) => {
    const { showToast } = useToast();
    const now = new Date();
    const [dateFrom, setDateFrom] = React.useState(`${now.getFullYear()}-01-01`);
    const [dateTo,   setDateTo]   = React.useState(`${now.getFullYear()}-12-31`);
    const [granularity, setGranularity] = React.useState<CashFlowGranularity>('month');
    const [data, setData]   = React.useState<CashFlowSummary | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [chartMode, setChartMode] = React.useState<'acumulado' | 'periodo'>('acumulado');

    const load = React.useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const d = await financialReportService.getCashFlow(organizationId, dateFrom, dateTo, granularity);
            setData(d);
        } catch (e: unknown) {
            showToast('Erro ao carregar fluxo de caixa', 'error');
            console.error('[CashFlow]', e);
        } finally {
            setLoading(false);
        }
    }, [organizationId, dateFrom, dateTo, granularity, showToast]);

    React.useEffect(() => { load(); }, [load]);

    const chartData = React.useMemo(() => {
        if (!data) return [];
        return data.points.map(p => ({
            name:           p.period_label,
            'Entradas':     p.credit_real,
            'Saídas':       -p.debit_real,
            'Saldo':        p.saldo_real,
            'Acumulado':    p.saldo_acumulado,
            'Previsto':     p.saldo_prev,
        }));
    }, [data]);

    const exportCSV = () => {
        if (!data) return;
        const rows = ['Período,Entradas,Saídas,Saldo,Acumulado',
            ...data.points.map(p =>
                `"${p.period_label}",${p.credit_real},${p.debit_real},${p.saldo_real},${p.saldo_acumulado}`
            )];
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
        a.download = `FluxoCaixa_${dateFrom}_${dateTo}.csv`;
        a.click();
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Fluxo de Caixa</h1>
                    <p className="text-gray-400 text-sm mt-1 font-medium">
                        Entradas e saídas realizadas vs. previstas no período.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                    <span className="text-gray-400 text-sm">até</span>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                    <select
                        value={granularity}
                        onChange={e => setGranularity(e.target.value as CashFlowGranularity)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                    >
                        <option value="day">Diário</option>
                        <option value="week">Semanal</option>
                        <option value="month">Mensal</option>
                    </select>
                    <button onClick={load}
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all">
                        Atualizar
                    </button>
                    <button onClick={exportCSV}
                        className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 flex items-center gap-2 transition-all">
                        <Download className="w-4 h-4" /> CSV
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-40 text-sm text-gray-400">Carregando fluxo de caixa...</div>
            ) : !data ? null : (
                <>
                    {/* KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <KPICard label="Total Entradas"    value={data.total_entradas}      icon={TrendingUp}   color="bg-green-50 text-green-600"  positive={true} />
                        <KPICard label="Total Saídas"      value={-data.total_saidas}       icon={TrendingDown} color="bg-red-50 text-red-600"     positive={false} />
                        <KPICard label="Saldo Realizado"   value={data.saldo_final}         icon={DollarSign}   color="bg-blue-50 text-blue-600"    positive={data.saldo_final >= 0} />
                        <KPICard label="Saldo c/ Previsto" value={data.saldo_previsto_final} icon={DollarSign}  color="bg-purple-50 text-purple-600" positive={data.saldo_previsto_final >= 0} />
                    </div>

                    {/* Toggle gráfico */}
                    <div className="flex gap-2">
                        {(['acumulado', 'periodo'] as const).map(m => (
                            <button key={m} onClick={() => setChartMode(m)}
                                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                                    chartMode === m ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-blue-300'
                                }`}
                            >
                                {m === 'acumulado' ? 'Saldo Acumulado' : 'Por Período'}
                            </button>
                        ))}
                    </div>

                    {/* Gráfico */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <ResponsiveContainer width="100%" height={320}>
                            {chartMode === 'acumulado' ? (
                                <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                                    <defs>
                                        <linearGradient id="gradAcum" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="gradPrev" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.10} />
                                            <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                                    <YAxis tickFormatter={formatBRLShort} tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={80} />
                                    <ReferenceLine y={0} stroke="#e5e7eb" />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <Area type="monotone" dataKey="Acumulado" stroke="#2563eb" fill="url(#gradAcum)" strokeWidth={2} dot={false} />
                                    <Area type="monotone" dataKey="Previsto"  stroke="#a855f7" fill="url(#gradPrev)" strokeWidth={2} dot={false} strokeDasharray="5 3" />
                                </AreaChart>
                            ) : (
                                <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                                    <defs>
                                        <linearGradient id="gradEnt" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%"  stopColor="#16a34a" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="gradSai" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%"  stopColor="#dc2626" stopOpacity={0.10} />
                                            <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                                    <YAxis tickFormatter={formatBRLShort} tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={80} />
                                    <ReferenceLine y={0} stroke="#e5e7eb" />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <Area type="monotone" dataKey="Entradas" stroke="#16a34a" fill="url(#gradEnt)" strokeWidth={2} dot={false} />
                                    <Area type="monotone" dataKey="Saídas"   stroke="#dc2626" fill="url(#gradSai)" strokeWidth={2} dot={false} />
                                    <Area type="monotone" dataKey="Saldo"    stroke="#2563eb" fill="none"          strokeWidth={2} dot={false} strokeDasharray="4 2" />
                                </AreaChart>
                            )}
                        </ResponsiveContainer>
                    </div>

                    {/* Tabela de períodos */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                            <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider">Detalhamento por Período</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-100">
                                        <th className="px-4 py-2.5 text-left text-xs font-black text-gray-400 uppercase tracking-wider">Período</th>
                                        <th className="px-4 py-2.5 text-right text-xs font-black text-gray-400 uppercase tracking-wider">Entradas</th>
                                        <th className="px-4 py-2.5 text-right text-xs font-black text-gray-400 uppercase tracking-wider">Saídas</th>
                                        <th className="px-4 py-2.5 text-right text-xs font-black text-gray-400 uppercase tracking-wider">Saldo</th>
                                        <th className="px-4 py-2.5 text-right text-xs font-black text-gray-400 uppercase tracking-wider">Acumulado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {data.points.map(p => (
                                        <tr key={p.period_label} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-2.5 text-sm font-semibold text-gray-700">{p.period_label}</td>
                                            <td className="px-4 py-2.5 text-sm text-right tabular-nums text-green-600 font-semibold">{formatBRL(p.credit_real)}</td>
                                            <td className="px-4 py-2.5 text-sm text-right tabular-nums text-red-500 font-semibold">{formatBRL(p.debit_real)}</td>
                                            <td className={`px-4 py-2.5 text-sm text-right tabular-nums font-bold ${p.saldo_real >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                                                {formatBRL(p.saldo_real)}
                                            </td>
                                            <td className={`px-4 py-2.5 text-sm text-right tabular-nums font-black ${p.saldo_acumulado >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                                {formatBRL(p.saldo_acumulado)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default CashFlowDashboard;
