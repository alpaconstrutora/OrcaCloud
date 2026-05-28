import React, { useState, useEffect, useCallback } from 'react';
import {
    BarChart3, Loader2, AlertCircle, Building2,
    TrendingUp, FileText, ShoppingCart, Users,
    CalendarX, CalendarClock, ArrowLeft,
} from 'lucide-react';
import { CompanyConsolidated, CompanyTarget, COMPANY_TIPO_LABELS, REGIME_TRIBUTARIO_LABELS } from '../types';
import { companyService } from '../services/companyService';

interface Props {
    orgId: string;
    onBack: () => void;
}

const brl = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const pct = (v?: number | null) => v != null ? `${v.toFixed(1)}%` : null;

// ─── Barra de progresso simples ──────────────────────────────

const ProgressBar: React.FC<{ value: number; max: number; color?: string }> = ({
    value, max, color = 'bg-blue-500'
}) => {
    const pctVal = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return (
        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${color}`}
                style={{ width: `${pctVal}%` }} />
        </div>
    );
};

// ─── Card de empresa ─────────────────────────────────────────

const CompanyCard: React.FC<{
    data: CompanyConsolidated;
    target?: CompanyTarget;
}> = ({ data, target }) => {
    const anoAtual = new Date().getFullYear();
    const hasTarget = target && target.ano === anoAtual;

    return (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                <div className="w-2.5 h-10 rounded-full flex-shrink-0"
                    style={{ backgroundColor: data.cor_sistema }} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-black text-gray-900 text-sm truncate">{data.razao_social}</p>
                        {data.is_headquarters && (
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Sede</span>
                        )}
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            data.status === 'ativa' ? 'bg-green-100 text-green-700' :
                            data.status === 'encerrada' ? 'bg-red-100 text-red-600' :
                            'bg-gray-100 text-gray-500'
                        }`}>{data.status}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-wide">
                        {COMPANY_TIPO_LABELS[data.tipo]}
                        {data.regime_tributario && ` · ${REGIME_TRIBUTARIO_LABELS[data.regime_tributario]}`}
                    </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                    {data.docs_vencidos > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                            <CalendarX className="w-3 h-3" />{data.docs_vencidos}
                        </span>
                    )}
                    {data.docs_vencendo > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            <CalendarClock className="w-3 h-3" />{data.docs_vencendo}
                        </span>
                    )}
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-y divide-gray-100">
                <div className="px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Obras</p>
                    <p className="text-xl font-black text-gray-900">{data.qtd_obras}</p>
                    {hasTarget && target.qtd_obras_meta != null && (
                        <div className="mt-1 space-y-0.5">
                            <ProgressBar value={data.qtd_obras} max={target.qtd_obras_meta} color="bg-blue-500" />
                            <p className="text-[10px] text-gray-400">meta {target.qtd_obras_meta}</p>
                        </div>
                    )}
                </div>
                <div className="px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Contratos</p>
                    <p className="text-xl font-black text-gray-900">{data.qtd_contratos}</p>
                </div>
                <div className="px-4 py-3 col-span-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Receita Contratada</p>
                    <p className="text-xl font-black text-gray-900">{brl(data.receita_contratada)}</p>
                    {hasTarget && target.faturamento_meta != null && (
                        <div className="mt-1 space-y-0.5">
                            <ProgressBar
                                value={data.receita_contratada}
                                max={target.faturamento_meta}
                                color={data.receita_contratada >= target.faturamento_meta ? 'bg-green-500' : 'bg-blue-500'} />
                            <p className="text-[10px] text-gray-400">
                                meta {brl(target.faturamento_meta)}
                                {' · '}{pct((data.receita_contratada / target.faturamento_meta) * 100) ?? ''}
                            </p>
                        </div>
                    )}
                </div>
                <div className="px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Pedidos Aprov.</p>
                    <p className="text-lg font-black text-gray-900">{data.compras_aprovadas}</p>
                </div>
                <div className="px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Sócios</p>
                    <p className="text-lg font-black text-gray-900">{data.qtd_socios}</p>
                </div>
                <div className="px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Contas</p>
                    <p className="text-lg font-black text-gray-900">{data.qtd_contas}</p>
                </div>
            </div>

            {/* Meta do ano se houver */}
            {hasTarget && target.margem_alvo_pct != null && (
                <div className="px-4 py-2 bg-blue-50/50 border-t border-blue-100 flex items-center gap-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Meta {anoAtual}</span>
                    {target.margem_alvo_pct != null && (
                        <span className="text-[10px] text-blue-600">Margem alvo: <strong>{pct(target.margem_alvo_pct)}</strong></span>
                    )}
                    {target.ebitda_alvo != null && (
                        <span className="text-[10px] text-blue-600">EBITDA: <strong>{brl(target.ebitda_alvo)}</strong></span>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── Dashboard principal ──────────────────────────────────────

const CompanyGroupDashboard: React.FC<Props> = ({ orgId, onBack }) => {
    const [data, setData] = useState<CompanyConsolidated[]>([]);
    const [targets, setTargets] = useState<Record<string, CompanyTarget | undefined>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const consolidated = await companyService.getConsolidatedGroup(orgId);
            setData(consolidated);

            // Busca meta do ano corrente por empresa
            const anoAtual = new Date().getFullYear();
            const targetsMap: Record<string, CompanyTarget | undefined> = {};
            await Promise.all(
                consolidated.map(async c => {
                    const list = await companyService.listTargets(c.company_id);
                    targetsMap[c.company_id] = list.find(t => t.ano === anoAtual);
                })
            );
            setTargets(targetsMap);
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => { load(); }, [load]);

    // Totais consolidados
    const totais = data.reduce(
        (acc, c) => ({
            obras: acc.obras + c.qtd_obras,
            contratos: acc.contratos + c.qtd_contratos,
            receita: acc.receita + c.receita_contratada,
            compras: acc.compras + c.compras_aprovadas,
            docsVencidos: acc.docsVencidos + c.docs_vencidos,
            docsVencendo: acc.docsVencendo + c.docs_vencendo,
        }),
        { obras: 0, contratos: 0, receita: 0, compras: 0, docsVencidos: 0, docsVencendo: 0 }
    );

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Cabeçalho */}
            <div className="flex items-start gap-4">
                <button onClick={onBack}
                    className="mt-0.5 p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors flex-shrink-0">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight italic border-l-4 border-blue-600 pl-4">
                        Dashboard do Grupo
                    </h2>
                    <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1 pl-4">
                        Visão consolidada de todas as empresas
                    </p>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span className="text-sm font-medium">Carregando dados consolidados...</span>
                </div>
            ) : (
                <>
                    {/* Totalizadores */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {[
                            { label: 'Empresas', value: data.length, icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50' },
                            { label: 'Obras', value: totais.obras, icon: BarChart3, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                            { label: 'Contratos', value: totais.contratos, icon: FileText, color: 'text-purple-600', bg: 'bg-purple-50' },
                            { label: 'Rec. Contratada', value: brl(totais.receita), icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
                            { label: 'Pedidos Aprov.', value: totais.compras, icon: ShoppingCart, color: 'text-orange-600', bg: 'bg-orange-50' },
                            { label: 'Docs. Alerta', value: totais.docsVencidos + totais.docsVencendo, icon: CalendarClock,
                              color: (totais.docsVencidos + totais.docsVencendo) > 0 ? 'text-red-600' : 'text-gray-400',
                              bg: (totais.docsVencidos + totais.docsVencendo) > 0 ? 'bg-red-50' : 'bg-gray-50' },
                        ].map(kpi => (
                            <div key={kpi.label} className="bg-white border border-gray-200 rounded-2xl p-4">
                                <div className={`w-8 h-8 rounded-xl ${kpi.bg} flex items-center justify-center mb-2`}>
                                    <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                                </div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{kpi.label}</p>
                                <p className={`text-lg font-black ${kpi.color}`}>{kpi.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Cards por empresa */}
                    {data.length === 0 ? (
                        <div className="flex flex-col items-center py-12 text-gray-400 gap-2">
                            <Users className="w-8 h-8 opacity-30" />
                            <p className="text-sm font-medium">Nenhuma empresa encontrada.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {data.map(c => (
                                <CompanyCard
                                    key={c.company_id}
                                    data={c}
                                    target={targets[c.company_id]}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default CompanyGroupDashboard;
