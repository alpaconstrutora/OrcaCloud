import React from 'react';
import { Activity, TrendingUp, Building2, Target, Gauge, Calendar, Loader2, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { BrokerHealthKPI } from '../../types';
import { brokerHealthService } from '../../services/brokerHealthService';
import { STALE } from '../../lib/queryClient';

interface BrokerHealthPanelProps {
    organizationId: string;
}

const BrokerHealthPanel: React.FC<BrokerHealthPanelProps> = ({ organizationId }) => {
    const [projectId, setProjectId] = React.useState<string | null>(null);

    const { data: projectOptions = [] } = useQuery({
        queryKey: ['broker-health-projects', organizationId],
        queryFn: () => brokerHealthService.listProjectsWithSales(organizationId),
        staleTime: STALE.normal,
        enabled: !!organizationId && organizationId !== 'demo',
    });

    const { data: health, isLoading, error } = useQuery<BrokerHealthKPI | null>({
        queryKey: ['broker-health', organizationId, projectId],
        queryFn: () => brokerHealthService.getHealthData(organizationId, projectId),
        staleTime: STALE.normal,
        enabled: !!organizationId && organizationId !== 'demo',
    });

    const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

    if (isLoading) return (
        <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
    );

    if (error || !health) return (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <AlertTriangle className="w-10 h-10" />
            <p className="text-sm font-bold">Nenhum dado de empreendimento encontrado.</p>
            <p className="text-xs">Cadastre unidades no módulo Comercial para visualizar a saúde do estoque.</p>
        </div>
    );

    const soldPct = health.total_units > 0 ? (health.sold_units / health.total_units) * 100 : 0;
    const reservedPct = health.total_units > 0 ? (health.reserved_units / health.total_units) * 100 : 0;
    const availablePct = health.total_units > 0 ? (health.available_units / health.total_units) * 100 : 0;

    const ivvColor = health.ivv >= 5 ? 'text-emerald-600' : health.ivv >= 3 ? 'text-amber-600' : 'text-red-600';
    const ivvBg = health.ivv >= 5 ? 'bg-emerald-50' : health.ivv >= 3 ? 'bg-amber-50' : 'bg-red-50';

    return (
        <div className="space-y-6">
            {/* Project Hero */}
            <div className="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-xl">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Saúde do Empreendimento</p>
                        <h2 className="text-2xl font-black mt-1">{health.project_name}</h2>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Só com mais de 1 empreendimento a escolha faz sentido — com 0 ou 1,
                            "Todos" e o próprio projeto são o mesmo número. */}
                        {projectOptions.length > 1 && (
                            <select
                                value={projectId ?? ''}
                                onChange={e => setProjectId(e.target.value || null)}
                                title="Filtrar por empreendimento"
                                className="h-9 pl-3 pr-8 bg-white/10 border border-white/20 text-white text-xs font-bold rounded-lg outline-none focus:ring-2 focus:ring-white/30 cursor-pointer"
                            >
                                <option value="" className="text-gray-900">Todos os empreendimentos</option>
                                {projectOptions.map(p => (
                                    <option key={p.id} value={p.id} className="text-gray-900">{p.name}</option>
                                ))}
                            </select>
                        )}
                        <Activity className="w-10 h-10 text-slate-500" />
                    </div>
                </div>

                {/* Stock Donut (CSS) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white/5 rounded-xl p-4 backdrop-blur-sm">
                        <p className="text-xs text-slate-400 font-bold uppercase">Total</p>
                        <p className="text-3xl font-black">{health.total_units}</p>
                        <p className="text-xs text-slate-500 mt-1">unidades</p>
                    </div>
                    <div className="bg-emerald-500/10 rounded-xl p-4 backdrop-blur-sm border border-emerald-500/20">
                        <p className="text-xs text-emerald-300 font-bold uppercase">Vendidas</p>
                        <p className="text-3xl font-black text-emerald-400">{health.sold_units}</p>
                        <p className="text-xs text-emerald-400/60 mt-1">{soldPct.toFixed(0)}%</p>
                    </div>
                    <div className="bg-amber-500/10 rounded-xl p-4 backdrop-blur-sm border border-amber-500/20">
                        <p className="text-xs text-amber-300 font-bold uppercase">Reservadas</p>
                        <p className="text-3xl font-black text-amber-400">{health.reserved_units}</p>
                        <p className="text-xs text-amber-400/60 mt-1">{reservedPct.toFixed(0)}%</p>
                    </div>
                    <div className="bg-blue-500/10 rounded-xl p-4 backdrop-blur-sm border border-blue-500/20">
                        <p className="text-xs text-blue-300 font-bold uppercase">Disponíveis</p>
                        <p className="text-3xl font-black text-blue-400">{health.available_units}</p>
                        <p className="text-xs text-blue-400/60 mt-1">{availablePct.toFixed(0)}%</p>
                    </div>
                </div>

                {/* Stock Bar */}
                <div className="mt-4 bg-white/10 rounded-full h-4 flex overflow-hidden">
                    <div className="bg-emerald-500 h-full transition-all" style={{ width: `${soldPct}%` }} title="Vendidas" />
                    <div className="bg-amber-500 h-full transition-all" style={{ width: `${reservedPct}%` }} title="Reservadas" />
                    <div className="bg-blue-500 h-full transition-all" style={{ width: `${availablePct}%` }} title="Disponíveis" />
                </div>
                <div className="flex gap-4 mt-2">
                    <span className="flex items-center gap-1 text-xs text-slate-400"><span className="w-2 h-2 rounded-full bg-emerald-500" />Vendidas</span>
                    <span className="flex items-center gap-1 text-xs text-slate-400"><span className="w-2 h-2 rounded-full bg-amber-500" />Reservadas</span>
                    <span className="flex items-center gap-1 text-xs text-slate-400"><span className="w-2 h-2 rounded-full bg-blue-500" />Disponíveis</span>
                </div>
            </div>

            {/* Health KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className={`rounded-2xl p-5 border shadow-sm ${ivvBg}`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">IVV</p>
                            <p className={`text-3xl font-black ${ivvColor} mt-1`}>{health.ivv}%</p>
                            <p className="text-xs text-gray-400 mt-0.5">Índ. Veloc. de Vendas/mês</p>
                        </div>
                        <Gauge className={`w-6 h-6 ${ivvColor}`} />
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Estoque Esgota Em</p>
                            <p className="text-3xl font-black text-gray-900 mt-1">{health.months_to_sell}<span className="text-lg text-gray-400"> meses</span></p>
                        </div>
                        <Calendar className="w-6 h-6 text-gray-400" />
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Canal Dominante</p>
                            <p className="text-xl font-black text-gray-900 mt-1">{health.top_channel}</p>
                        </div>
                        <Target className="w-6 h-6 text-gray-400" />
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Ticket Médio</p>
                            <p className="text-xl font-black text-gray-900 mt-1">{formatCurrency(health.avg_ticket)}</p>
                        </div>
                        <TrendingUp className="w-6 h-6 text-gray-400" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* VGV Progress */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <h3 className="text-sm font-black text-gray-900 mb-4">VGV — Vendido vs. Projetado</h3>
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="font-bold text-gray-600">VGV Vendido</span>
                                <span className="font-black text-emerald-600">{formatCurrency(health.vgv_sold)}</span>
                            </div>
                            <div className="bg-gray-100 rounded-full h-5">
                                <div className="bg-emerald-500 rounded-full h-5 flex items-center justify-end pr-2 transition-all"
                                    style={{ width: `${(health.vgv_sold / health.vgv_total) * 100}%` }}>
                                    <span className="text-[9px] font-black text-white">{((health.vgv_sold / health.vgv_total) * 100).toFixed(0)}%</span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="font-bold text-gray-600">VGV Total</span>
                                <span className="font-black text-gray-900">{formatCurrency(health.vgv_total)}</span>
                            </div>
                            <div className="bg-gray-100 rounded-full h-5">
                                <div className="bg-gray-400 rounded-full h-5 w-full" />
                            </div>
                        </div>
                        <div className="pt-3 border-t border-gray-100 flex justify-between">
                            <span className="text-xs font-bold text-gray-500">Restante</span>
                            <span className="text-xs font-black text-gray-900">{formatCurrency(health.vgv_total - health.vgv_sold)}</span>
                        </div>
                    </div>
                </div>

                {/* Mix de Vendas */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <h3 className="text-sm font-black text-gray-900 mb-4">Mix de Vendas por Tipologia</h3>
                    <div className="space-y-3">
                        {health.mix_sales.map(mix => {
                            const color = mix.pct >= 40 ? 'bg-emerald-500' : mix.pct >= 30 ? 'bg-indigo-500' : 'bg-gray-400';
                            return (
                                <div key={mix.typology}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="font-bold text-gray-700">{mix.typology}</span>
                                        <span className="font-black text-gray-900">{mix.sold}/{mix.total}</span>
                                    </div>
                                    <div className="bg-gray-100 rounded-full h-4 overflow-hidden">
                                        <div className={`${color} h-full rounded-full flex items-center justify-end pr-2 transition-all`}
                                            style={{ width: `${mix.pct}%` }}>
                                            <span className="text-[9px] font-black text-white">{mix.pct}%</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Absorption Curve */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm lg:col-span-2">
                    <h3 className="text-sm font-black text-gray-900 mb-4">Curva de Absorção</h3>
                    <div className="flex items-end gap-2 h-48">
                        {health.absorption_curve.map((point, i) => {
                            const maxVal = Math.max(...health.absorption_curve.map(p => Math.max(p.sold_cumulative, p.projected)));
                            const projH = (point.projected / maxVal) * 100;
                            const soldH = point.sold_cumulative > 0 ? (point.sold_cumulative / maxVal) * 100 : 0;
                            return (
                                /* `h-full` sozinho (sem altura explícita aqui) nunca resolvia: o pai
                                   usa `items-end`, que sombreia o item a ALTURA DE CONTEÚDO (não o
                                   estica para os 192px do h-48) — então o `h-full` de baixo virava
                                   `auto` e toda barra, real ou projetada, media 0px. Precisa da
                                   altura explícita aqui (resolve contra o h-48 do pai, que é fixo). */
                                <div key={point.month} className="flex-1 h-full flex flex-col items-center gap-1">
                                    {/* `flex-1` (não `h-full`): este é item de um flex-col com o rótulo
                                        do mês ao lado — `h-full` tentaria ocupar os 192px inteiros e
                                        empurraria o rótulo pra fora; `flex-1` divide o espaço certo. */}
                                    <div className="w-full flex-1 relative flex items-end">
                                        {/* Projected */}
                                        <div className="absolute bottom-0 w-full bg-indigo-100 rounded-t-md transition-all"
                                            style={{ height: `${projH}%` }} />
                                        {/* Actual */}
                                        {soldH > 0 && (
                                            <div className="absolute bottom-0 w-full bg-emerald-500 rounded-t-md transition-all z-10"
                                                style={{ height: `${soldH}%` }} />
                                        )}
                                    </div>
                                    <span className="text-[9px] font-bold text-gray-400">{point.month}</span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100">
                        <span className="flex items-center gap-1 text-xs text-gray-400"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" />Real</span>
                        <span className="flex items-center gap-1 text-xs text-gray-400"><span className="w-3 h-3 rounded bg-indigo-100 inline-block" />Projetado</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BrokerHealthPanel;
