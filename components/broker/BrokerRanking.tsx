import React, { useState, useMemo } from 'react';
import { Trophy, TrendingUp, TrendingDown, Minus, Target, Award, Star, Flame, Zap, Medal } from 'lucide-react';
import type { BrokerRankEntry, BrokerBadge } from '../../types';

interface BrokerRankingProps {
    brokerEmail: string;
}

const BADGE_ICONS: Record<string, any> = { star: Star, flame: Flame, zap: Zap, trophy: Trophy, medal: Medal, award: Award };

const generateDemoRanking = (email: string): BrokerRankEntry[] => {
    const names = ['Carlos Andrade', 'Maria Santos', 'João Lima', 'Ana Ferreira', 'Pedro Costa', 'Laura Mendes', 'Rafael Alves', 'Camila Rocha'];
    const badgePool: BrokerBadge[] = [
        { id: 'b1', name: 'Primeira Venda', icon: 'star', description: 'Fechou a primeira venda', earned_at: '2026-01-15' },
        { id: 'b2', name: 'Top 3', icon: 'trophy', description: 'Ficou entre os 3 melhores', earned_at: '2026-02-01' },
        { id: 'b3', name: 'Hat-trick', icon: 'flame', description: '3 vendas em um mês', earned_at: '2026-02-15' },
        { id: 'b4', name: 'Maratonista', icon: 'zap', description: '10 propostas enviadas', earned_at: '2026-02-20' },
        { id: 'b5', name: 'Milhão', icon: 'medal', description: 'R$ 1M em vendas', earned_at: '2026-03-01' },
    ];

    return names.map((name, i) => ({
        id: `rank-${i + 1}`,
        broker_id: `br-${i + 1}`,
        broker_name: name,
        broker_email: i === 2 ? email : `${name.toLowerCase().replace(' ', '.')}@corretor.com`,
        sales_count: 8 - i + Math.floor(Math.random() * 3),
        sales_volume: (2500000 - i * 280000) + Math.floor(Math.random() * 200000),
        leads_converted: 12 - i + Math.floor(Math.random() * 4),
        proposals_sent: 15 - i + Math.floor(Math.random() * 5),
        position: i + 1,
        previous_position: i === 0 ? 2 : i === 1 ? 1 : i === 2 ? 4 : i + 1,
        badges: badgePool.slice(0, Math.max(1, 5 - i)),
        goal_sales: 10,
        goal_volume: 3000000,
    }));
};

const BrokerRanking: React.FC<BrokerRankingProps> = ({ brokerEmail }) => {
    const [ranking] = useState<BrokerRankEntry[]>(() => generateDemoRanking(brokerEmail));
    const [period, setPeriod] = useState<'mes' | 'trimestre' | 'ano'>('mes');

    const me = useMemo(() => ranking.find(r => r.broker_email === brokerEmail), [ranking, brokerEmail]);

    const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

    const PositionBadge = ({ pos, prev }: { pos: number; prev?: number }) => {
        const diff = prev ? prev - pos : 0;
        return (
            <div className="flex items-center gap-2">
                <span className={`text-2xl font-black ${pos <= 3 ? 'text-amber-500' : 'text-gray-400'}`}>
                    {pos}º
                </span>
                {diff > 0 && <span className="flex items-center text-emerald-500 text-xs font-bold"><TrendingUp className="w-3 h-3" />+{diff}</span>}
                {diff < 0 && <span className="flex items-center text-red-500 text-xs font-bold"><TrendingDown className="w-3 h-3" />{diff}</span>}
                {diff === 0 && prev && <Minus className="w-3 h-3 text-gray-300" />}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {/* My Progress Card */}
            {me && (
                <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 rounded-2xl p-6 text-white shadow-xl shadow-indigo-500/20">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest">Minha Posição</p>
                            <div className="flex items-center gap-3 mt-1">
                                <span className="text-5xl font-black">{me.position}º</span>
                                {me.previous_position && me.previous_position > me.position && (
                                    <span className="flex items-center gap-1 px-3 py-1 bg-emerald-500/20 rounded-full text-emerald-300 text-sm font-bold">
                                        <TrendingUp className="w-4 h-4" />Subiu {me.previous_position - me.position}
                                    </span>
                                )}
                            </div>
                        </div>
                        <Trophy className="w-16 h-16 text-amber-400/30" />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                            <p className="text-[10px] text-indigo-200 font-bold uppercase">Vendas</p>
                            <p className="text-xl font-black">{me.sales_count}<span className="text-sm font-bold text-indigo-300">/{me.goal_sales}</span></p>
                            <div className="mt-1.5 bg-white/20 rounded-full h-1.5">
                                <div className="bg-emerald-400 rounded-full h-1.5 transition-all" style={{ width: `${Math.min(100, (me.sales_count / me.goal_sales) * 100)}%` }} />
                            </div>
                        </div>
                        <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                            <p className="text-[10px] text-indigo-200 font-bold uppercase">Volume</p>
                            <p className="text-xl font-black">{formatCurrency(me.sales_volume)}</p>
                            <div className="mt-1.5 bg-white/20 rounded-full h-1.5">
                                <div className="bg-amber-400 rounded-full h-1.5 transition-all" style={{ width: `${Math.min(100, (me.sales_volume / me.goal_volume) * 100)}%` }} />
                            </div>
                        </div>
                        <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                            <p className="text-[10px] text-indigo-200 font-bold uppercase">Leads Convertidos</p>
                            <p className="text-xl font-black">{me.leads_converted}</p>
                        </div>
                        <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                            <p className="text-[10px] text-indigo-200 font-bold uppercase">Propostas</p>
                            <p className="text-xl font-black">{me.proposals_sent}</p>
                        </div>
                    </div>
                    {/* My Badges */}
                    {me.badges.length > 0 && (
                        <div className="flex gap-2 mt-4 pt-4 border-t border-white/10">
                            {me.badges.map(badge => {
                                const Icon = BADGE_ICONS[badge.icon] || Award;
                                return (
                                    <div key={badge.id} title={badge.description}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-full backdrop-blur-sm hover:bg-white/20 transition-colors cursor-default">
                                        <Icon className="w-3.5 h-3.5 text-amber-400" />
                                        <span className="text-[10px] font-bold text-white">{badge.name}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Period Selector */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-gray-900">Ranking Geral</h3>
                <div className="flex bg-gray-100 rounded-xl p-1">
                    {(['mes', 'trimestre', 'ano'] as const).map(p => (
                        <button key={p} onClick={() => setPeriod(p)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${period === p ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}>
                            {p === 'mes' ? 'Mês' : p === 'trimestre' ? 'Trimestre' : 'Ano'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Ranking Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="divide-y divide-gray-50">
                    {ranking.map((entry, i) => {
                        const isMe = entry.broker_email === brokerEmail;
                        const podium = entry.position <= 3;
                        return (
                            <div key={entry.id}
                                className={`flex items-center justify-between p-4 transition-colors ${isMe ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : 'hover:bg-gray-50'}`}>
                                <div className="flex items-center gap-4">
                                    <PositionBadge pos={entry.position} prev={entry.previous_position} />
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm ${podium ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                        {entry.broker_name.split(' ').map(n => n[0]).join('')}
                                    </div>
                                    <div>
                                        <p className={`text-sm font-bold ${isMe ? 'text-indigo-700' : 'text-gray-900'}`}>
                                            {entry.broker_name} {isMe && <span className="text-[10px] text-indigo-400 ml-1">(você)</span>}
                                        </p>
                                        <div className="flex gap-1 mt-0.5">
                                            {entry.badges.slice(0, 3).map(b => {
                                                const Icon = BADGE_ICONS[b.icon] || Award;
                                                return <Icon key={b.id} className="w-3 h-3 text-amber-500" title={b.name} />;
                                            })}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-8 text-right">
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase">Vendas</p>
                                        <p className="text-sm font-black text-gray-900">{entry.sales_count}</p>
                                    </div>
                                    <div className="hidden md:block">
                                        <p className="text-[10px] font-black text-gray-400 uppercase">Volume</p>
                                        <p className="text-sm font-black text-gray-900">{formatCurrency(entry.sales_volume)}</p>
                                    </div>
                                    <div className="hidden md:block">
                                        <p className="text-[10px] font-black text-gray-400 uppercase">Conversão</p>
                                        <p className="text-sm font-black text-gray-900">{entry.leads_converted}</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default BrokerRanking;
