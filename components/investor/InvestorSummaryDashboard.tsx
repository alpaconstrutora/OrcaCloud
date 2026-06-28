import React from 'react';
import { TrendingUp, Wallet, Building2, ArrowRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { AIInsight } from '../../services/aiService';
import AIInsightCard from '../AIInsightCard';
import { HoldingItem, HistoricalPoint } from './types';

interface Props {
    equity: string;
    activeWorks: number;
    /** % de rendimento mensal calculado de dividendos/aportes reais. null = sem dados suficientes. */
    monthlyYieldPct: number | null;
    totalContributed: number;
    totalDividends: number;
    historicalData: HistoricalPoint[];
    holdings: HoldingItem[];
    isAdmin: boolean;
    loadingAI: boolean;
    aiInsight: AIInsight | null;
    onNavigateToHoldings: () => void;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const InvestorSummaryDashboard: React.FC<Props> = ({
    equity, activeWorks,
    monthlyYieldPct, totalContributed, totalDividends,
    historicalData, holdings, isAdmin,
    loadingAI, aiInsight, onNavigateToHoldings,
}) => {
    const stats = [
        {
            label: 'Patrimônio em Cotas',
            icon: <Wallet className="w-5 h-5" />,
            color: 'blue',
            val: equity || 'R$ 0,00',
            sub: totalContributed > 0 ? `${fmt(totalContributed)} aportados` : undefined,
        },
        {
            label: 'Rendimento Mensal Médio',
            icon: <TrendingUp className="w-5 h-5" />,
            color: 'emerald',
            val: monthlyYieldPct != null ? `${monthlyYieldPct.toFixed(2)}% a.m.` : '—',
            sub: totalDividends > 0 ? `${fmt(totalDividends)} distribuídos` : 'Sem distribuições registradas',
        },
        {
            label: 'Obras Ativas',
            icon: <Building2 className="w-5 h-5" />,
            color: 'purple',
            val: String(activeWorks || 0),
            sub: Number(activeWorks) > 0 ? `${holdings.filter(h => (h.progress ?? 0) < 100).length} em execução` : undefined,
        },
    ];

    const hasHistory = historicalData.length > 0;

    // Dados por projeto para gráfico de barras (capital investido + dividendos por obra)
    const perProjectData = holdings.map(h => ({
        name: h.name.length > 20 ? h.name.slice(0, 18) + '…' : h.name,
        Aportado: h.invested ?? 0,
        Patrimônio: Number(h.equity) || 0,
    })).filter(d => d.Aportado > 0 || d.Patrimônio > 0);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {(loadingAI || aiInsight) && (
                <AIInsightCard
                    loading={loadingAI}
                    title={aiInsight?.title || 'IA Advisor'}
                    content={aiInsight?.content || ''}
                    type={aiInsight?.type || 'info'}
                    onAction={() => {}}
                />
            )}

            {/* KPI cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((s) => (
                    <div key={s.label} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                        <div className={`inline-flex p-2 rounded-lg bg-${s.color}-50 text-${s.color}-600 mb-4`}>
                            {s.icon}
                        </div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
                        <p className="text-2xl font-black text-gray-900 tracking-tight">{s.val}</p>
                        {s.sub && <p className="text-xs text-gray-400 mt-1">{s.sub}</p>}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Gráfico histórico */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest mb-1 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-blue-600" />
                        Capital Investido — Evolução Mensal
                    </h3>
                    <p className="text-xs text-gray-400 mb-4">Baseado em aportes com data de pagamento registrada</p>

                    {hasHistory ? (
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={historicalData}>
                                    <defs>
                                        <linearGradient id="gradCapital" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                    <YAxis
                                        axisLine={false} tickLine={false}
                                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                                        tickFormatter={(v: number) => v >= 1000000 ? `R$${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`}
                                    />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}
                                        formatter={((value: any, name: any) => {
                                            if (name === 'yield') return [value?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 'Capital Investido'];
                                            return [value, name];
                                        }) as any}
                                    />
                                    <Area type="monotone" dataKey="yield" name="yield" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#gradCapital)" dot={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-56 flex flex-col items-center justify-center text-center gap-2">
                            <TrendingUp className="w-10 h-10 text-gray-100" />
                            <p className="text-sm font-bold text-gray-300">Nenhum aporte com data de pagamento registrada</p>
                            <p className="text-xs text-gray-300">Registre aportes com data de pagamento para ver a evolução</p>
                        </div>
                    )}
                </div>

                {/* Participações */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
                    <h3 className="text-form-label font-bold text-gray-400 uppercase tracking-widest mb-4">Minhas Participações</h3>
                    {holdings.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center">
                            <p className="text-xs text-gray-300 font-bold text-center">Nenhuma participação registrada</p>
                        </div>
                    ) : (
                        <div className="space-y-3 flex-1">
                            {holdings.slice(0, 4).map((proj, i) => (
                                <div key={i} className="p-3 rounded-xl border border-gray-50 hover:bg-gray-50 transition-colors">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-sm font-bold text-gray-900 leading-tight">{proj.name}</span>
                                        <span className="text-xs bg-blue-50 text-blue-600 font-bold px-2 py-0.5 rounded-lg ml-2 whitespace-nowrap">{proj.cota}</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-1.5 mb-1">
                                        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${proj.progress ?? 0}%` }} />
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-400">
                                        <span>{proj.status}</span>
                                        <span className="font-bold text-blue-500">{proj.progress ?? 0}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <button onClick={onNavigateToHoldings} className="mt-4 flex items-center justify-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors pt-3 border-t border-gray-50">
                        Ver todas as participações <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Gráfico por projeto (só mostra se há dados) */}
            {perProjectData.length > 0 && (
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest mb-1">Capital por Empreendimento</h3>
                    <p className="text-xs text-gray-400 mb-4">Aportado vs. Patrimônio estimado por obra</p>
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={perProjectData} barGap={4}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}
                                    formatter={((v: any) => [v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), '']) as any}
                                />
                                <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
                                <Bar dataKey="Aportado" fill="#bfdbfe" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="Patrimônio" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InvestorSummaryDashboard;
