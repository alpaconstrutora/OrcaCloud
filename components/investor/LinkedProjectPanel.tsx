import React from 'react';
import { TrendingUp, TrendingDown, Minus, AlertCircle, RefreshCw, Camera } from 'lucide-react';
import { opportunityProjectService, ProjectPitchData } from '../../services/opportunityProjectService';
import ObraTimeline from './ObraTimeline';
import ProjectGallery from '../ProjectGallery';

interface Props {
    projectId: string;
    organizationId: string;
    costEstimate?: number | null; // campo da oportunidade — o prometido
}

const fmtBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

const fmtBRLCompact = (v: number) => {
    if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (Math.abs(v) >= 1_000)     return `R$ ${(v / 1_000).toFixed(0)}k`;
    return fmtBRL(v);
};

const CostDelta: React.FC<{ realizado: number; estimado: number }> = ({ realizado, estimado }) => {
    if (estimado <= 0) return null;
    const pct = ((realizado - estimado) / estimado) * 100;
    const over = pct > 5;
    const under = pct < -5;
    const Icon = over ? TrendingUp : under ? TrendingDown : Minus;
    const color = over ? 'text-red-600' : under ? 'text-emerald-600' : 'text-gray-500';
    const bg    = over ? 'bg-red-50 border-red-200' : under ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200';
    const label = over
        ? `+${pct.toFixed(1)}% acima do estimado`
        : under
            ? `${pct.toFixed(1)}% abaixo do estimado`
            : 'dentro do estimado';
    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold border ${bg} ${color}`}>
            <Icon className="w-3 h-3" />
            {label}
        </span>
    );
};

const LinkedProjectPanel: React.FC<Props> = ({ projectId, organizationId, costEstimate }) => {
    const [data, setData] = React.useState<ProjectPitchData | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(false);

    const load = React.useCallback(() => {
        setLoading(true);
        setError(false);
        opportunityProjectService.getPitchData(projectId, organizationId)
            .then(setData)
            .catch(() => setError(true))
            .finally(() => setLoading(false));
    }, [projectId, organizationId]);

    React.useEffect(() => { load(); }, [load]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span className="text-sm">Carregando dados da obra...</span>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-600">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>Não foi possível carregar os dados da obra. <button onClick={load} className="underline font-bold">Tentar novamente</button></span>
            </div>
        );
    }

    const { project, financials, milestones, physicalProgress } = data;
    const hasGallery = project.diaryImages.length > 0;
    const nextMilestone = milestones.find(m => m.status !== 'completed');
    const completedCount = milestones.filter(m => m.status === 'completed').length;

    return (
        <div className="space-y-6">
            {/* ── Progresso físico ─────────────────────────────────── */}
            <div className="bg-[#0B1727] rounded-2xl p-6 text-white">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-black text-blue-300 uppercase tracking-widest">Progresso Físico</span>
                    <span className="text-3xl font-black">{physicalProgress}%</span>
                </div>
                <div className="h-3 bg-white/10 rounded-full overflow-hidden mb-3">
                    <div
                        className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 rounded-full transition-all duration-700"
                        style={{ width: `${physicalProgress}%` }}
                    />
                </div>
                <div className="flex items-center justify-between text-xs text-white/50">
                    <span>{completedCount} de {milestones.length} marco{milestones.length !== 1 ? 's' : ''} concluído{completedCount !== 1 ? 's' : ''}</span>
                    {nextMilestone && (
                        <span>Próximo: <span className="text-white/80 font-bold">{nextMilestone.name}</span>
                            {nextMilestone.planned_date && (
                                <span className="text-white/40"> · {new Date(nextMilestone.planned_date + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}</span>
                            )}
                        </span>
                    )}
                </div>
            </div>

            {/* ── Custo realizado vs estimado ───────────────────── */}
            {financials && (
                <div>
                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest block mb-3">Custo: realizado vs estimado</span>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                            <p className="text-xs font-black text-amber-600 uppercase tracking-wider mb-1">Custo realizado</p>
                            <p className="text-xl font-black text-amber-900">{fmtBRLCompact(financials.custo_realizado)}</p>
                        </div>
                        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                            <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-1">Custo estimado</p>
                            <p className="text-xl font-black text-gray-800">
                                {costEstimate ? fmtBRLCompact(costEstimate) : '—'}
                            </p>
                        </div>
                    </div>
                    {costEstimate != null && costEstimate > 0 && financials.custo_realizado > 0 && (
                        <div className="mt-3 flex items-center gap-3">
                            {/* Barra de consumo do orçamento */}
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full ${financials.custo_realizado > costEstimate ? 'bg-red-400' : 'bg-amber-400'}`}
                                    style={{ width: `${Math.min(100, (financials.custo_realizado / costEstimate) * 100)}%` }}
                                />
                            </div>
                            <span className="text-xs font-bold text-gray-500 whitespace-nowrap">
                                {((financials.custo_realizado / costEstimate) * 100).toFixed(0)}% consumido
                            </span>
                        </div>
                    )}
                    {costEstimate != null && costEstimate > 0 && financials.custo_realizado > 0 && (
                        <div className="mt-2">
                            <CostDelta realizado={financials.custo_realizado} estimado={costEstimate} />
                        </div>
                    )}
                    {financials.receita_realizada > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-3">
                            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
                                <p className="text-xs font-black text-blue-600 uppercase tracking-wider mb-1">Receita realizada</p>
                                <p className="text-xl font-black text-blue-900">{fmtBRLCompact(financials.receita_realizada)}</p>
                            </div>
                            <div className={`rounded-2xl p-4 border ${financials.resultado_liquido >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                                <p className={`text-xs font-black uppercase tracking-wider mb-1 ${financials.resultado_liquido >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    Resultado líquido
                                </p>
                                <p className={`text-xl font-black ${financials.resultado_liquido >= 0 ? 'text-emerald-900' : 'text-red-700'}`}>
                                    {fmtBRLCompact(financials.resultado_liquido)}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Timeline ─────────────────────────────────────────── */}
            {milestones.length > 0 && (
                <div>
                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest block mb-3">Cronograma da obra</span>
                    <div className="bg-gray-50 rounded-2xl p-4">
                        <ObraTimeline
                            projectId={projectId}
                            organizationId={organizationId}
                            isAdmin={false}
                        />
                    </div>
                </div>
            )}

            {/* ── Galeria ──────────────────────────────────────────── */}
            {hasGallery ? (
                <div>
                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest block mb-3">Evolução visual da obra</span>
                    <ProjectGallery images={project.diaryImages} allowFallback={false} />
                </div>
            ) : (
                <div className="flex items-center gap-3 py-6 px-4 bg-gray-50 rounded-2xl border border-gray-100 text-gray-400">
                    <Camera className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm">Nenhuma foto registrada no diário da obra ainda.</span>
                </div>
            )}
        </div>
    );
};

export default LinkedProjectPanel;
