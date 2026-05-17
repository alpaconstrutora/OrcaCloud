import React, { useState, useMemo } from 'react';
import { BarChart3, TrendingUp, Users, Target, Award, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import type { BrokerAnalyticsData } from '../../types';

interface BrokerAnalyticsProps {
    organizationId: string;
}

const generateDemoAnalytics = (): BrokerAnalyticsData => ({
    period: 'Março 2026',
    rankings: [
        { broker_name: 'Carlos Andrade', sales: 8, volume: 2480000, conversion_rate: 42 },
        { broker_name: 'Maria Santos', sales: 7, volume: 2150000, conversion_rate: 38 },
        { broker_name: 'João Lima', sales: 6, volume: 1920000, conversion_rate: 35 },
        { broker_name: 'Ana Ferreira', sales: 5, volume: 1680000, conversion_rate: 31 },
        { broker_name: 'Pedro Costa', sales: 4, volume: 1350000, conversion_rate: 28 },
    ],
    channel_performance: [
        { channel: 'Imobiliária', leads: 45, conversions: 18, rate: 40 },
        { channel: 'Site', leads: 38, conversions: 12, rate: 32 },
        { channel: 'Plantão', leads: 28, conversions: 15, rate: 54 },
        { channel: 'Indicação', leads: 22, conversions: 11, rate: 50 },
        { channel: 'Redes Sociais', leads: 15, conversions: 4, rate: 27 },
    ],
    monthly_sales: [
        { month: 'Out', count: 5, volume: 1800000 },
        { month: 'Nov', count: 8, volume: 2900000 },
        { month: 'Dez', count: 6, volume: 2200000 },
        { month: 'Jan', count: 10, volume: 3600000 },
        { month: 'Fev', count: 12, volume: 4300000 },
        { month: 'Mar', count: 9, volume: 3200000 },
    ],
    proposal_funnel: [
        { stage: 'Propostas Enviadas', count: 48 },
        { stage: 'Em Análise', count: 12 },
        { stage: 'Aprovadas', count: 30 },
        { stage: 'Rejeitadas', count: 6 },
    ],
    top_units: [
        { unit: '802', block: 'Torre A', views: 89, proposals: 5 },
        { unit: '1201', block: 'Torre B', views: 76, proposals: 4 },
        { unit: '503', block: 'Torre A', views: 65, proposals: 3 },
        { unit: '1502', block: 'Torre B', views: 58, proposals: 3 },
        { unit: '604', block: 'Torre A', views: 42, proposals: 2 },
    ],
    avg_sale_time_days: 18,
    approval_rate: 62.5,
});

const BrokerAnalytics: React.FC<BrokerAnalyticsProps> = ({ organizationId }) => {
    const [data] = useState<BrokerAnalyticsData>(generateDemoAnalytics);

    const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

    const maxMonthlySales = Math.max(...data.monthly_sales.map(m => m.count));
    const maxChannelLeads = Math.max(...data.channel_performance.map(c => c.leads));

    return (
        <div className="space-y-6">
            {/* KPI Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Vendas no Mês</p>
                            <p className="text-3xl font-black text-gray-900 mt-1">{data.monthly_sales[data.monthly_sales.length - 1].count}</p>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-xl">
                            <TrendingUp className="w-5 h-5 text-emerald-600" />
                        </div>
                    </div>
                    <div className="flex items-center gap-1 mt-2 text-xs">
                        <ArrowDownRight className="w-3 h-3 text-red-500" />
                        <span className="text-red-500 font-bold">-25%</span>
                        <span className="text-gray-400">vs. mês anterior</span>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Volume (VGV)</p>
                            <p className="text-3xl font-black text-gray-900 mt-1">{formatCurrency(data.monthly_sales[data.monthly_sales.length - 1].volume)}</p>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-xl">
                            <BarChart3 className="w-5 h-5 text-blue-600" />
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Tempo Médio de Venda</p>
                            <p className="text-3xl font-black text-gray-900 mt-1">{data.avg_sale_time_days}<span className="text-lg text-gray-400"> dias</span></p>
                        </div>
                        <div className="p-3 bg-amber-50 rounded-xl">
                            <Target className="w-5 h-5 text-amber-600" />
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Taxa de Aprovação</p>
                            <p className="text-3xl font-black text-gray-900 mt-1">{data.approval_rate}<span className="text-lg text-gray-400">%</span></p>
                        </div>
                        <div className="p-3 bg-purple-50 rounded-xl">
                            <Award className="w-5 h-5 text-purple-600" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Monthly Sales Chart */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <h3 className="text-sm font-black text-gray-900 mb-4">Vendas Mensais</h3>
                    <div className="flex items-end gap-3 h-48">
                        {data.monthly_sales.map((m, i) => (
                            <div key={m.month} className="flex-1 flex flex-col items-center gap-2">
                                <span className="text-[10px] font-bold text-gray-500">{m.count}</span>
                                <div className="w-full bg-gray-100 rounded-t-lg relative" style={{ height: '100%' }}>
                                    <div className={`absolute bottom-0 w-full rounded-t-lg transition-all ${i === data.monthly_sales.length - 1 ? 'bg-indigo-500' : 'bg-indigo-200'}`}
                                        style={{ height: `${(m.count / maxMonthlySales) * 100}%` }} />
                                </div>
                                <span className="text-[10px] font-bold text-gray-400">{m.month}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Proposal Funnel */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <h3 className="text-sm font-black text-gray-900 mb-4">Funil de Propostas</h3>
                    <div className="space-y-3">
                        {data.proposal_funnel.map((stage, i) => {
                            const maxCount = data.proposal_funnel[0].count;
                            const pct = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
                            const colors = ['bg-indigo-500', 'bg-blue-400', 'bg-emerald-500', 'bg-red-400'];
                            return (
                                <div key={stage.stage}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="font-bold text-gray-700">{stage.stage}</span>
                                        <span className="font-black text-gray-900">{stage.count}</span>
                                    </div>
                                    <div className="bg-gray-100 rounded-full h-8 overflow-hidden">
                                        <div className={`${colors[i]} h-full rounded-full flex items-center justify-end pr-3 transition-all`}
                                            style={{ width: `${Math.max(10, pct)}%` }}>
                                            <span className="text-[10px] font-black text-white">{Math.round(pct)}%</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Channel Performance */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <h3 className="text-sm font-black text-gray-900 mb-4">Performance por Canal</h3>
                    <div className="space-y-4">
                        {data.channel_performance.map(ch => (
                            <div key={ch.channel} className="flex items-center gap-4">
                                <div className="w-24 text-xs font-bold text-gray-700 truncate">{ch.channel}</div>
                                <div className="flex-1">
                                    <div className="flex gap-1 h-6">
                                        <div className="bg-indigo-400 rounded-l-md h-full flex items-center justify-center transition-all"
                                            style={{ width: `${(ch.leads / maxChannelLeads) * 100}%` }}>
                                            <span className="text-[9px] font-bold text-white px-1">{ch.leads}L</span>
                                        </div>
                                        <div className="bg-emerald-500 rounded-r-md h-full flex items-center justify-center transition-all"
                                            style={{ width: `${(ch.conversions / maxChannelLeads) * 100}%` }}>
                                            <span className="text-[9px] font-bold text-white px-1">{ch.conversions}V</span>
                                        </div>
                                    </div>
                                </div>
                                <span className={`text-xs font-black w-10 text-right ${ch.rate >= 40 ? 'text-emerald-600' : ch.rate >= 30 ? 'text-amber-600' : 'text-red-600'}`}>
                                    {ch.rate}%
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-4 mt-4 pt-3 border-t border-gray-100">
                        <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-3 h-3 rounded bg-indigo-400 inline-block" />Leads</span>
                        <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" />Vendas</span>
                    </div>
                </div>

                {/* Top Corretores */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <h3 className="text-sm font-black text-gray-900 mb-4">Top Corretores — {data.period}</h3>
                    <div className="space-y-3">
                        {data.rankings.map((r, i) => (
                            <div key={r.broker_name} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                                <span className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-[11px] ${i < 3 ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                    {i + 1}
                                </span>
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-gray-900">{r.broker_name}</p>
                                    <p className="text-[10px] text-gray-400">{formatCurrency(r.volume)} • {r.conversion_rate}% conversão</p>
                                </div>
                                <span className="text-sm font-black text-indigo-600">{r.sales} vendas</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top Units */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm lg:col-span-2">
                    <h3 className="text-sm font-black text-gray-900 mb-4">Unidades Mais Procuradas</h3>
                    <div className="grid grid-cols-5 gap-3">
                        {data.top_units.map((u, i) => (
                            <div key={`${u.unit}-${u.block}`} className="bg-gray-50 rounded-xl p-4 text-center hover:bg-indigo-50 transition-colors">
                                <p className="text-xs font-black text-indigo-600">Unidade {u.unit}</p>
                                <p className="text-[10px] text-gray-400 mb-2">{u.block}</p>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[10px]">
                                        <span className="text-gray-400">Views</span>
                                        <span className="font-bold text-gray-700">{u.views}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                        <span className="text-gray-400">Propostas</span>
                                        <span className="font-bold text-indigo-600">{u.proposals}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BrokerAnalytics;
