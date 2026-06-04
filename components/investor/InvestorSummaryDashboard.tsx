import React from 'react';
import { TrendingUp, DollarSign, Wallet, Building2, Pencil } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Line } from 'recharts';
import { AIInsight } from '../../services/aiService';
import AIInsightCard from '../AIInsightCard';
import CUBMarketPanel from '../CUBMarketPanel';
import { HoldingItem, HistoricalPoint } from './types';

interface Props {
    cubValue: number;
    equity: string;
    activeWorks: number;
    monthlyYield?: string;
    historicalData: HistoricalPoint[];
    holdings: HoldingItem[];
    isAdmin: boolean;
    showSelic: boolean;
    showIpca: boolean;
    showIgpm: boolean;
    onToggleSelic: () => void;
    onToggleIpca: () => void;
    onToggleIgpm: () => void;
    loadingAI: boolean;
    aiInsight: AIInsight | null;
    onEditField: (key: 'monthlyYield' | 'totalCotas', val: string | number) => void;
    onNavigateToHoldings: () => void;
    openInput: (label: string, defaultValue: string, onConfirm: (val: string) => void) => void;
}

const InvestorSummaryDashboard: React.FC<Props> = ({
    cubValue, equity, activeWorks, monthlyYield,
    historicalData, holdings, isAdmin,
    showSelic, showIpca, showIgpm,
    onToggleSelic, onToggleIpca, onToggleIgpm,
    loadingAI, aiInsight, onEditField, onNavigateToHoldings, openInput,
}) => {
    const stats = [
        { key: 'equity', label: 'Patrimônio em Cotas', icon: <Wallet className="w-6 h-6" />, color: 'blue', val: equity || 'R$ 0,00' },
        { key: 'monthlyYield', label: 'Rendimento Mensal', icon: <TrendingUp className="w-6 h-6" />, color: 'emerald', val: monthlyYield || '—' },
        {
            key: 'cub', label: 'CUB Referência (R8N)',
            icon: <DollarSign className="w-6 h-6" />, color: 'indigo',
            val: cubValue ? cubValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Calculando...'
        },
        { key: 'activeWorks', label: 'Obras Ativas', icon: <Building2 className="w-6 h-6" />, color: 'purple', val: activeWorks || 0 },
    ];

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {(loadingAI || aiInsight) && (
                <div className="max-w-4xl">
                    <AIInsightCard
                        loading={loadingAI}
                        title={aiInsight?.title || 'IA Advisor'}
                        content={aiInsight?.content || ''}
                        type={aiInsight?.type || 'info'}
                        onAction={() => alert('Em breve: Chat completo com o consultor de investimentos.')}
                    />
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {stats.map((stat) => (
                    <div key={stat.key} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative group/stat">
                        <div className="flex justify-between items-start mb-4">
                            <div className={`p-2 bg-${stat.color}-50 text-${stat.color}-600 rounded-lg`}>
                                {stat.icon}
                            </div>
                            {isAdmin && (stat.key === 'monthlyYield' || stat.key === 'totalCotas') && (
                                <button
                                    onClick={() => openInput(stat.label, String(stat.val), (res) => {
                                        if (res) onEditField(
                                            stat.key as 'monthlyYield' | 'totalCotas',
                                            stat.key === 'totalCotas' ? parseInt(res) : res
                                        );
                                    })}
                                    className="p-1 bg-gray-50 text-gray-400 rounded-lg hover:text-indigo-600 opacity-0 group-hover/stat:opacity-100 transition-opacity"
                                >
                                    <Pencil className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                        <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                        <h3 className="text-2xl font-bold text-gray-900">{stat.val}</h3>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex flex-wrap items-center gap-4">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-blue-600" />
                                Evolução de Patrimônio
                            </h3>
                            <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-xl border border-gray-100">
                                {[
                                    { label: 'Selic', active: showSelic, toggle: onToggleSelic, color: 'bg-[#CDA434]' },
                                    { label: 'IPCA', active: showIpca, toggle: onToggleIpca, color: 'bg-indigo-600' },
                                    { label: 'IGP-M', active: showIgpm, toggle: onToggleIgpm, color: 'bg-emerald-600' },
                                ].map(b => (
                                    <button
                                        key={b.label}
                                        onClick={b.toggle}
                                        className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${b.active ? `${b.color} text-white shadow-sm` : 'text-gray-400 hover:bg-gray-200'}`}
                                    >
                                        {b.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={historicalData}>
                                <defs>
                                    <linearGradient id="colorYield" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                <Area type="monotone" dataKey="yield" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorYield)" />
                                {showSelic && <Line type="monotone" dataKey="selic" stroke="#CDA434" strokeWidth={2} dot={false} />}
                                {showIpca && <Line type="monotone" dataKey="ipca" stroke="#6366f1" strokeWidth={2} dot={false} />}
                                {showIgpm && <Line type="monotone" dataKey="igpm" stroke="#10b981" strokeWidth={2} dot={false} />}
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-6">Minhas Participações</h3>
                    <div className="space-y-6">
                        {holdings.slice(0, 3).map((proj, i) => (
                            <div key={i} className="flex flex-col gap-2 p-4 border border-gray-50 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer">
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-gray-900">{proj.name}</span>
                                    <span className="text-[10px] bg-blue-100 text-blue-700 font-black px-2 py-0.5 rounded-lg uppercase">{proj.cota} Cotas</span>
                                </div>
                                <div className="flex justify-between items-end text-xs">
                                    <span className="text-gray-500 font-medium">{proj.status}</span>
                                    <span className="font-bold text-blue-600">{proj.progress}%</span>
                                </div>
                            </div>
                        ))}
                        <button
                            onClick={onNavigateToHoldings}
                            className="w-full py-2 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors border-t border-gray-50 pt-4"
                        >
                            Ver todos os empreendimentos
                        </button>
                    </div>
                    <section className="space-y-6 mt-6">
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
                            <h3 className="text-xl font-black text-gray-900 tracking-tight">Benchmarks e Mercado</h3>
                        </div>
                        <CUBMarketPanel />
                    </section>
                </div>
            </div>
        </div>
    );
};

export default InvestorSummaryDashboard;
