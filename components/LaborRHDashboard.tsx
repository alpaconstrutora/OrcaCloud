import React, { useState } from 'react';
import {
    Users, TrendingDown, TrendingUp, DollarSign, Clock, AlertTriangle,
    HardHat, BookOpen, Umbrella, FileText, Activity, Calendar,
    Loader2, RefreshCw, ChevronRight, UserCheck, UserMinus, Stethoscope
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { laborService, RhKpis, Employee, LaborCostSummary } from '../services/laborService';
import { laborKeys } from '../lib/queryKeys';
import { STALE } from '../lib/queryClient';

// ── KPI Card ─────────────────────────────────────────────────────────────────

const KpiCard: React.FC<{
    label: string;
    value: string | number;
    sub?: string;
    icon: React.ElementType;
    color: string;
    trend?: 'up' | 'down' | 'neutral';
    trendLabel?: string;
    onClick?: () => void;
}> = ({ label, value, sub, icon: Icon, color, trend, trendLabel, onClick }) => (
    <div
        onClick={onClick}
        className={`bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden ${onClick ? 'cursor-pointer hover:shadow-md hover:border-slate-200 transition-all' : ''}`}
    >
        <div className={`absolute top-0 right-0 w-24 h-24 rounded-full opacity-30 -mr-8 -mt-8`}
            style={{ background: `var(--tw-${color}-50, #eff6ff)` }} />
        <div className="relative z-10">
            <div className="flex items-start justify-between mb-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{label}</p>
                <div className={`p-2 rounded-xl bg-${color}-100`}>
                    <Icon className={`w-4 h-4 text-${color}-600`} />
                </div>
            </div>
            <p className="text-3xl font-black text-slate-900 tracking-tighter">{value}</p>
            <div className="flex items-center gap-2 mt-2">
                {sub && <p className="text-[11px] text-slate-400 font-medium">{sub}</p>}
                {trendLabel && trend && (
                    <span className={`flex items-center gap-0.5 text-[10px] font-black px-1.5 py-0.5 rounded-lg ${
                        trend === 'up'   ? 'bg-rose-100 text-rose-700' :
                        trend === 'down' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-slate-100 text-slate-500'
                    }`}>
                        {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : trend === 'down' ? <TrendingDown className="w-3 h-3" /> : null}
                        {trendLabel}
                    </span>
                )}
            </div>
        </div>
    </div>
);

// ── Alert Item ────────────────────────────────────────────────────────────────

const AlertItem: React.FC<{
    count: number;
    label: string;
    icon: React.ElementType;
    color: string;
    onClick?: () => void;
}> = ({ count, label, icon: Icon, color, onClick }) => (
    <button
        onClick={onClick}
        disabled={count === 0}
        className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left w-full ${
            count > 0
                ? `border-${color}-200 bg-${color}-50 hover:bg-${color}-100`
                : 'border-slate-100 bg-slate-50 opacity-50 cursor-default'
        }`}
    >
        <div className={`p-2 rounded-lg ${count > 0 ? `bg-${color}-100` : 'bg-slate-100'}`}>
            <Icon className={`w-4 h-4 ${count > 0 ? `text-${color}-600` : 'text-slate-400'}`} />
        </div>
        <div className="flex-1 min-w-0">
            <p className={`text-xs font-black ${count > 0 ? `text-${color}-900` : 'text-slate-500'}`}>{label}</p>
        </div>
        <span className={`text-lg font-black px-2.5 py-1 rounded-xl ${
            count > 0 ? `bg-${color}-100 text-${color}-700` : 'bg-slate-100 text-slate-400'
        }`}>
            {count}
        </span>
        {count > 0 && <ChevronRight className={`w-3.5 h-3.5 text-${color}-400 shrink-0`} />}
    </button>
);

// ── Bar Chart simples ──────────────────────────────────────────────────────────

const BarChart: React.FC<{
    data: { label: string; value: number; color?: string }[];
    title: string;
    valueFormat?: (v: number) => string;
}> = ({ data, title, valueFormat }) => {
    const max = Math.max(...data.map(d => d.value), 1);
    return (
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">{title}</h3>
            <div className="space-y-3">
                {data.slice(0, 8).map((d, i) => (
                    <div key={i} className="flex items-center gap-3">
                        <p className="text-xs font-bold text-slate-600 w-28 shrink-0 truncate">{d.label}</p>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-700 ${d.color || 'bg-indigo-500'}`}
                                style={{ width: `${(d.value / max) * 100}%` }}
                            />
                        </div>
                        <p className="text-xs font-black text-slate-700 w-20 text-right shrink-0">
                            {valueFormat ? valueFormat(d.value) : d.value}
                        </p>
                    </div>
                ))}
                {data.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">Sem dados no período</p>
                )}
            </div>
        </div>
    );
};

// ── Componente principal ─────────────────────────────────────────────────────

interface LaborRHDashboardProps {
    orgId: string;
    employees: Employee[];
    costSummary: LaborCostSummary | null;
    onNavigate?: (tab: string) => void;
}

const LaborRHDashboard: React.FC<LaborRHDashboardProps> = ({ orgId, employees, costSummary, onNavigate }) => {
    const today = new Date().toISOString().split('T')[0];
    const [refDate] = useState(today);

    const { data: kpis, isLoading, error, refetch } = useQuery<RhKpis>({
        queryKey: laborKeys.rhKpis(orgId, refDate),
        queryFn: () => laborService.getRhKpis(orgId, refDate),
        staleTime: STALE.normal,
        enabled: !!orgId,
    });

    // Distribuição por função (dos colaboradores ativos locais)
    const byRole = React.useMemo(() => {
        const map = new Map<string, number>();
        employees.filter(e => e.status === 'ATIVO').forEach(e => {
            map.set(e.role, (map.get(e.role) || 0) + 1);
        });
        return Array.from(map.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);
    }, [employees]);

    // Custo por obra (do costSummary)
    const byProject = React.useMemo(() =>
        (costSummary?.byProject || [])
            .sort((a, b) => b.cost - a.cost)
            .map(p => ({
                label: p.project_name,
                value: p.cost,
                color: 'bg-indigo-400',
            }))
    , [costSummary]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                <p className="text-slate-400 font-medium text-sm">Calculando KPIs do RH...</p>
            </div>
        );
    }

    if (error || !kpis) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
                <AlertTriangle className="w-10 h-10 text-amber-400" />
                <p className="text-slate-500 text-sm font-bold">Não foi possível carregar os KPIs.</p>
                <p className="text-xs text-slate-400">A função RPC pode ainda estar sendo criada no banco. Execute a migration e tente novamente.</p>
                <button onClick={() => refetch()} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700">
                    <RefreshCw className="w-4 h-4" /> Tentar novamente
                </button>
            </div>
        );
    }

    const mesAtual = new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Dashboard Executivo RH</h2>
                    <p className="text-xs text-slate-400 font-medium mt-0.5 capitalize">{mesAtual}</p>
                </div>
                <button onClick={() => refetch()} className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 transition-all text-xs font-bold">
                    <RefreshCw className="w-3.5 h-3.5" /> Atualizar
                </button>
            </div>

            {/* Headcount KPIs */}
            <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Headcount</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <KpiCard label="Total de Colaboradores" value={kpis.headcount.total} icon={Users} color="indigo"
                        sub={`${kpis.headcount.ativos} ativos`} />
                    <KpiCard label="Ativos" value={kpis.headcount.ativos} icon={UserCheck} color="emerald"
                        sub={`${kpis.headcount.afastados} afastados`} />
                    <KpiCard label="Em Férias" value={kpis.headcount.em_ferias} icon={Umbrella} color="blue"
                        sub="no mês atual"
                        onClick={() => onNavigate?.('labor-absences')} />
                    <KpiCard label="Afastados" value={kpis.headcount.afastados} icon={Stethoscope} color="amber"
                        sub="INSS / licença" />
                </div>
            </div>

            {/* Movimentação + Custos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Movimentação no Mês</p>
                    <div className="grid grid-cols-2 gap-4">
                        <KpiCard label="Admissões" value={kpis.periodo.admitidos} icon={UserCheck} color="emerald"
                            trendLabel={kpis.periodo.admitidos > 0 ? '+' + kpis.periodo.admitidos : undefined} trend="neutral" />
                        <KpiCard label="Desligamentos" value={kpis.periodo.desligados} icon={UserMinus} color="rose"
                            trendLabel={kpis.periodo.desligados > 0 ? String(kpis.periodo.desligados) : undefined}
                            trend={kpis.periodo.desligados > 0 ? 'up' : 'neutral'} />
                        <div className="col-span-2">
                            <KpiCard label="Turnover" value={`${kpis.periodo.turnover_pct}%`} icon={Activity} color="orange"
                                sub="desligamentos / headcount"
                                trend={kpis.periodo.turnover_pct > 5 ? 'up' : kpis.periodo.turnover_pct === 0 ? 'neutral' : 'down'}
                                trendLabel={kpis.periodo.turnover_pct > 5 ? 'Acima do ideal' : kpis.periodo.turnover_pct === 0 ? 'Estável' : 'Saudável'} />
                        </div>
                    </div>
                </div>

                <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Custos e Horas</p>
                    <div className="grid grid-cols-1 gap-4">
                        <KpiCard label="Custo MO Aprovado (mês)" icon={DollarSign} color="indigo"
                            value={`R$ ${kpis.custos.custo_mes.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`}
                            sub="horas aprovadas"
                            onClick={() => onNavigate?.('labor-costs')} />
                        <KpiCard label="Horas Extras" value={`${kpis.custos.horas_extras.toFixed(0)}h`} icon={Clock} color="amber"
                            sub="no mês"
                            trend={kpis.custos.horas_extras > 80 ? 'up' : 'neutral'}
                            trendLabel={kpis.custos.horas_extras > 80 ? 'Elevado' : undefined}
                            onClick={() => onNavigate?.('labor-timetracking')} />
                        <KpiCard label="Absenteísmo" value={`${kpis.qualidade.absenteismo_pct}%`} icon={Calendar} color="rose"
                            sub="dias ausentes / dias úteis"
                            trend={kpis.qualidade.absenteismo_pct > 4 ? 'up' : 'neutral'}
                            trendLabel={kpis.qualidade.absenteismo_pct > 4 ? 'Acima do ideal' : 'Normal'} />
                    </div>
                </div>
            </div>

            {/* Alertas */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Alertas Pendentes
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <AlertItem count={kpis.alertas.treinamentos_vencendo} label="Treinamentos vencendo em 30 dias"
                        icon={BookOpen} color="amber" onClick={() => onNavigate?.('labor-trainings')} />
                    <AlertItem count={kpis.alertas.docs_vencendo} label="Documentos (ASO/NR) vencendo"
                        icon={FileText} color="rose" onClick={() => onNavigate?.('labor-documents')} />
                    <AlertItem count={kpis.alertas.epis_estoque_baixo} label="EPIs com estoque abaixo do mínimo"
                        icon={HardHat} color="orange" onClick={() => onNavigate?.('labor-epis')} />
                    <AlertItem count={kpis.alertas.ferias_vencendo} label="Férias vencendo em 60 dias"
                        icon={Umbrella} color="blue" onClick={() => onNavigate?.('labor-absences')} />
                </div>
            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <BarChart
                    title="Colaboradores por Função"
                    data={byRole.map(d => ({ ...d, color: 'bg-indigo-500' }))}
                    valueFormat={v => `${v} pessoa${v !== 1 ? 's' : ''}`}
                />
                <BarChart
                    title="Custo de MO por Obra"
                    data={byProject}
                    valueFormat={v => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`}
                />
            </div>
        </div>
    );
};

export default LaborRHDashboard;
