import React, { useState, useEffect, useCallback } from 'react';
import {
    TrendingUp,
    TrendingDown,
    Clock,
    AlertTriangle,
    CheckCircle2,
    Activity,
    Target,
    Zap,
    BarChart2,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';
import {
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';
import { HierarchyNode, ProjectSchedule, BudgetEntry } from '../../types';
import { scheduleConstraintsService, weeklyCommitmentsService } from '../../services/scheduleConstraintsService';

// ─── Helpers ──────────────────────────────────────────────────

const today = () => new Date().toISOString().split('T')[0];

const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
};

const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

function daysBetween(a: string, b: string): number {
    return Math.round(
        (new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000
    );
}

function elapsedFraction(start: string, end: string): number {
    const t = today();
    if (t <= start) return 0;
    if (t >= end) return 1;
    return daysBetween(start, t) / Math.max(1, daysBetween(start, end));
}

function flatLeaves(nodes: HierarchyNode[]): HierarchyNode[] {
    const acc: HierarchyNode[] = [];
    const walk = (n: HierarchyNode) => {
        if (n.type === 'item') acc.push(n);
        (n.children || []).forEach(walk);
    };
    nodes.forEach(walk);
    return acc;
}

function computeKpis(
    hierarchy: HierarchyNode[],
    schedule: ProjectSchedule,
    budget: BudgetEntry[],
    financialValues: Record<string, number>,
) {
    const leaves = flatLeaves(hierarchy);
    const todayStr = today();

    const budgetById: Record<string, BudgetEntry> = {};
    budget.forEach(b => { budgetById[b.id] = b; });

    let totalBudget = 0;
    let ev = 0;
    let pv = 0;
    let physicalWeightedSum = 0;
    let physicalWeightTotal = 0;
    let atrasadas = 0;

    leaves.forEach(leaf => {
        const sched = schedule.itemSchedules?.find(s => s.id === leaf.id);
        const b = budgetById[leaf.id];
        const budgeted = b ? b.quantity * b.sinapiItem.price : (leaf.budgetedTotal ?? 0);
        totalBudget += budgeted;

        const realPct = (sched?.manualRealPct ?? 0) / 100;
        if (budgeted > 0) {
            physicalWeightedSum += realPct * budgeted;
            physicalWeightTotal += budgeted;
        }
        ev += realPct * budgeted;

        const s = sched?.earlyStart ?? sched?.startDate;
        const e = sched?.earlyFinish ?? sched?.endDate;
        if (s && e) pv += elapsedFraction(s, e) * budgeted;
        if (e && e < todayStr && realPct < 1) atrasadas++;
    });

    const physicalPct = physicalWeightTotal > 0 ? (physicalWeightedSum / physicalWeightTotal) * 100 : 0;

    // AC (Actual Cost) — custo real, exclusivamente financeiro (compras já realizadas).
    // Antes deste cálculo usar o mapa combinado (max físico×financeiro) inflava o AC
    // sempre que o físico estava à frente das compras, distorcendo CPI/EAC.
    const ac = Object.values(financialValues).reduce((s, v) => s + v, 0);
    const financialPct = totalBudget > 0 ? (ac / totalBudget) * 100 : 0;

    // EVM real: SPI (prazo) e CPI (custo). BAC = orçamento total; EAC = previsão de custo
    // final assumindo a mesma eficiência (CPI) observada até aqui; ETC = quanto falta gastar.
    const spi = pv > 0 ? ev / pv : null;
    const bac = totalBudget;
    const cpi = ac > 0 ? ev / ac : null;
    const eac = cpi !== null && cpi > 0 ? bac / cpi : null;
    const etc = eac !== null ? Math.max(0, eac - ac) : null;

    const criticalItems = leaves.filter(l => {
        const sched = schedule.itemSchedules?.find(s => s.id === l.id);
        return sched?.isCritical;
    });

    const projectEnd = schedule.itemSchedules?.reduce((max, s) => {
        const e = s.earlyFinish ?? s.endDate;
        if (!e) return max;
        return !max || e > max ? e : max;
    }, '') ?? schedule.endDate ?? '';

    let baselineEnd = '';
    let devioDias: number | null = null;
    if (schedule.activeBaselineId && schedule.baselines) {
        const bl = schedule.baselines.find(b => b.id === schedule.activeBaselineId);
        if (bl) {
            baselineEnd = Object.values(bl.itemDates).reduce((max, d) => {
                return !max || d.endDate > max ? d.endDate : max;
            }, '');
            if (baselineEnd && projectEnd) devioDias = daysBetween(baselineEnd, projectEnd);
        }
    }

    return {
        physicalPct, financialPct, spi,
        ac, bac, cpi, eac, etc,
        criticalItems, criticalCount: criticalItems.length,
        atrasadas, projectEnd, baselineEnd, devioDias,
        totalLeaves: leaves.length,
    };
}

// ─── Chart data type (same shape as chartDataWithCumulative) ──

export interface SCurveEntry {
    name: string;
    valor: number;
    realizado: number;
    realizadoFisico: number;
    acumulado: number;
    acumuladoRealizado: number;
    acumuladoRealizadoFisico: number;
}

// ─── Props ────────────────────────────────────────────────────

interface Props {
    hierarchy: HierarchyNode[];
    schedule: ProjectSchedule;
    budget: BudgetEntry[];
    financialValues: Record<string, number>;
    chartData: SCurveEntry[];
    organizationId?: string;
    projectId?: string;
}

// ─── Component ────────────────────────────────────────────────

export const CommandCenterPanel: React.FC<Props> = ({
    hierarchy, schedule, budget, financialValues, chartData,
    organizationId, projectId,
}) => {
    const [ppcLast, setPpcLast] = useState<number | null>(null);
    const [ppcAccum, setPpcAccum] = useState<number | null>(null);
    const [openConstraints, setOpenConstraints] = useState<number | null>(null);
    const [loadingKpis, setLoadingKpis] = useState(true);
    const [simulatorOpen, setSimulatorOpen] = useState(false);

    const kpis = React.useMemo(
        () => computeKpis(hierarchy, schedule, budget, financialValues),
        [hierarchy, schedule, budget, financialValues]
    );

    const load = useCallback(async () => {
        if (!organizationId || !projectId) { setLoadingKpis(false); return; }
        setLoadingKpis(true);
        try {
            const [ppcRows, constraints] = await Promise.all([
                weeklyCommitmentsService.getPpc(organizationId, projectId),
                scheduleConstraintsService.listByProject(organizationId, projectId),
            ]);
            const open = constraints.filter(c => c.status === 'open').length;
            setOpenConstraints(open);
            const totalP = ppcRows.reduce((s, w) => s + w.plannedCount, 0);
            const totalC = ppcRows.reduce((s, w) => s + w.completedCount, 0);
            setPpcAccum(totalP > 0 ? Math.round((totalC / totalP) * 100) : null);
            const last = ppcRows[ppcRows.length - 1];
            setPpcLast(last?.ppc ?? null);
        } catch { /* silently */ } finally {
            setLoadingKpis(false);
        }
    }, [organizationId, projectId]);

    useEffect(() => { load(); }, [load]);

    // Use last 14 periods for chart legibility
    const chartSlice = chartData.slice(-14);

    return (
        <div className="space-y-5">
            {/* Title */}
            <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-bold text-gray-800">Centro de Comando</h2>
                <span className="text-xs text-gray-400">{fmtDate(today())}</span>
            </div>

            {/* ── KPI cards row 1 ── */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <KpiCard label="Avanço Físico" value={fmtPct(kpis.physicalPct)}
                    sub={`${kpis.totalLeaves} atividades`} color="blue"
                    icon={<Target className="w-4 h-4" />} />
                <KpiCard label="Avanço Financeiro" value={fmtPct(kpis.financialPct)}
                    sub={kpis.physicalPct > kpis.financialPct ? '▲ físico à frente' : kpis.physicalPct < kpis.financialPct ? '▼ financeiro à frente' : 'empatados'}
                    color="indigo" icon={<BarChart2 className="w-4 h-4" />} />
                <KpiCard label="SPI" value={kpis.spi !== null ? kpis.spi.toFixed(2) : '—'}
                    sub={kpis.spi === null ? 'sem datas' : kpis.spi >= 1 ? 'no prazo' : 'atrasado'}
                    color={kpis.spi === null ? 'gray' : kpis.spi >= 1 ? 'emerald' : 'red'}
                    icon={<Zap className="w-4 h-4" />}
                    tooltip="Schedule Performance Index = Valor Agregado / Valor Planejado" />
                <KpiCard label="PPC acumulado"
                    value={loadingKpis ? '…' : ppcAccum !== null ? `${ppcAccum}%` : '—'}
                    sub={loadingKpis ? '' : ppcLast !== null ? `Últ. sem.: ${ppcLast}%` : 'sem dados'}
                    color={ppcAccum === null ? 'gray' : ppcAccum >= 80 ? 'emerald' : ppcAccum >= 60 ? 'amber' : 'red'}
                    icon={<CheckCircle2 className="w-4 h-4" />} />
            </div>

            {/* ── KPI cards row EVM (custo) ── */}
            <div className="grid grid-cols-3 gap-3">
                <KpiCard label="CPI" value={kpis.cpi !== null ? kpis.cpi.toFixed(2) : '—'}
                    sub={kpis.cpi === null ? 'sem compras registradas' : kpis.cpi >= 1 ? 'dentro do orçamento' : 'acima do orçamento'}
                    color={kpis.cpi === null ? 'gray' : kpis.cpi >= 1 ? 'emerald' : 'red'}
                    icon={<BarChart2 className="w-4 h-4" />}
                    tooltip="Cost Performance Index = Valor Agregado / Custo Real" />
                <KpiCard label="Custo final previsto (EAC)"
                    value={kpis.eac !== null ? fmtBRL(kpis.eac) : '—'}
                    sub={kpis.eac !== null ? `Orçado: ${fmtBRL(kpis.bac)}` : 'sem CPI calculável'}
                    color={kpis.eac === null ? 'gray' : kpis.eac > kpis.bac ? 'red' : 'emerald'}
                    icon={<TrendingUp className="w-4 h-4" />}
                    tooltip="Estimate at Completion = Orçamento Total / CPI" />
                <KpiCard label="Falta gastar (ETC)"
                    value={kpis.etc !== null ? fmtBRL(kpis.etc) : '—'}
                    sub={`Gasto até agora: ${fmtBRL(kpis.ac)}`}
                    color={kpis.etc === null ? 'gray' : 'amber'}
                    icon={<Clock className="w-4 h-4" />}
                    tooltip="Estimate to Complete = EAC − Custo Real" />
            </div>

            {/* ── KPI cards row 2 ── */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <KpiCard label="Término previsto" value={fmtDate(kpis.projectEnd)}
                    sub={kpis.devioDias !== null
                        ? kpis.devioDias === 0 ? 'no prazo da baseline'
                        : kpis.devioDias > 0 ? `${kpis.devioDias}d de atraso`
                        : `${Math.abs(kpis.devioDias)}d adiantado`
                        : 'sem baseline ativa'}
                    color={kpis.devioDias === null ? 'gray' : kpis.devioDias <= 0 ? 'emerald' : kpis.devioDias <= 14 ? 'amber' : 'red'}
                    icon={<Clock className="w-4 h-4" />} />
                <KpiCard label="Desvio de prazo"
                    value={kpis.devioDias !== null ? `${kpis.devioDias > 0 ? '+' : ''}${kpis.devioDias}d` : '—'}
                    sub={kpis.baselineEnd ? `Baseline: ${fmtDate(kpis.baselineEnd)}` : 'ative uma baseline'}
                    color={kpis.devioDias === null ? 'gray' : kpis.devioDias <= 0 ? 'emerald' : kpis.devioDias <= 14 ? 'amber' : 'red'}
                    icon={kpis.devioDias !== null && kpis.devioDias > 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />} />
                <KpiCard label="Atividades atrasadas" value={String(kpis.atrasadas)}
                    sub={`de ${kpis.totalLeaves} no total`}
                    color={kpis.atrasadas === 0 ? 'emerald' : kpis.atrasadas <= 3 ? 'amber' : 'red'}
                    icon={<AlertTriangle className="w-4 h-4" />} />
                <KpiCard label="Restrições abertas"
                    value={loadingKpis ? '…' : openConstraints !== null ? String(openConstraints) : '—'}
                    sub={`${kpis.criticalCount} ativ. críticas`}
                    color={openConstraints === null ? 'gray' : openConstraints === 0 ? 'emerald' : openConstraints <= 3 ? 'amber' : 'red'}
                    icon={<AlertTriangle className="w-4 h-4" />} />
            </div>

            {/* ── Curva S dupla: Físico × Financeiro (reusa dados já calculados) ── */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <h3 className="text-xs font-bold text-gray-700 mb-1">Curva S — Físico × Financeiro</h3>
                <p className="text-xs text-gray-400 mb-4">Planejado × avanço físico (diário) × avanço financeiro (compras), acumulados</p>
                {chartSlice.length === 0 ? (
                    <div className="flex items-center justify-center py-10 text-xs text-gray-400">
                        Configure datas e distribuições nas atividades para gerar a curva S.
                    </div>
                ) : (
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartSlice} margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                <YAxis yAxisId="left" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={56} />
                                <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={56} />
                                <Tooltip
                                    formatter={(value: unknown) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0)}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: 11 }}
                                />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Bar yAxisId="left" dataKey="valor" name="Previsto (M)" barSize={20} fill="#bfdbfe" radius={[4, 4, 0, 0]} />
                                <Line yAxisId="right" type="monotone" dataKey="acumulado" name="Previsto (Acum)" stroke="#3b82f6" strokeWidth={2} dot={false} />
                                <Line yAxisId="right" type="monotone" dataKey="acumuladoRealizadoFisico" name="Realizado Físico (Acum)" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                                <Line yAxisId="right" type="monotone" dataKey="acumuladoRealizado" name="Realizado Financeiro (Acum)" stroke="#f59e0b" strokeWidth={2} dot={false} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* ── Caminho crítico ── */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs font-bold text-gray-700">Caminho Crítico ({kpis.criticalCount} atividades)</span>
                </div>
                {kpis.criticalItems.length === 0 ? (
                    <div className="px-5 py-8 text-center text-xs text-gray-400">
                        Execute o Auto Programar para calcular o caminho crítico.
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
                        {kpis.criticalItems.slice(0, 20).map(item => {
                            const sched = schedule.itemSchedules?.find(s => s.id === item.id);
                            const realPct = sched?.manualRealPct ?? 0;
                            const end = sched?.earlyFinish ?? sched?.endDate;
                            const overdue = end && end < today() && realPct < 100;
                            return (
                                <div key={item.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50/50">
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${overdue ? 'bg-red-500' : 'bg-orange-400'}`} />
                                    <span className="text-xs font-medium text-gray-800 flex-1 truncate">{item.name}</span>
                                    <span className="text-xs text-gray-400 shrink-0">{fmtDate(end)}</span>
                                    <div className="w-16 shrink-0">
                                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${realPct >= 100 ? 'bg-emerald-400' : overdue ? 'bg-red-400' : 'bg-blue-400'}`}
                                                style={{ width: `${Math.min(realPct, 100)}%` }}
                                            />
                                        </div>
                                        <span className="text-[9px] text-gray-400">{realPct}%</span>
                                    </div>
                                </div>
                            );
                        })}
                        {kpis.criticalItems.length > 20 && (
                            <div className="px-5 py-2 text-center text-xs text-gray-400">
                                +{kpis.criticalItems.length - 20} atividades críticas não exibidas
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Simulador de impacto ── */}
            <DelaySimulator
                open={simulatorOpen}
                setOpen={setSimulatorOpen}
                criticalItems={kpis.criticalItems}
                schedule={schedule}
                projectEnd={kpis.projectEnd}
            />
        </div>
    );
};

// ─── KpiCard ─────────────────────────────────────────────────

const COLOR_MAP = {
    blue:    { bg: 'bg-blue-50',    border: 'border-blue-100',    text: 'text-blue-700',    icon: 'text-blue-400' },
    indigo:  { bg: 'bg-indigo-50',  border: 'border-indigo-100',  text: 'text-indigo-700',  icon: 'text-indigo-400' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-700', icon: 'text-emerald-400' },
    amber:   { bg: 'bg-amber-50',   border: 'border-amber-100',   text: 'text-amber-700',   icon: 'text-amber-400' },
    red:     { bg: 'bg-red-50',     border: 'border-red-100',     text: 'text-red-700',      icon: 'text-red-400' },
    gray:    { bg: 'bg-gray-50',    border: 'border-gray-100',    text: 'text-gray-700',    icon: 'text-gray-400' },
};

const KpiCard: React.FC<{
    label: string; value: string; sub?: string;
    color: keyof typeof COLOR_MAP; icon?: React.ReactNode; tooltip?: string;
}> = ({ label, value, sub, color, icon, tooltip }) => {
    const c = COLOR_MAP[color];
    return (
        <div className={`${c.bg} border ${c.border} rounded-xl px-4 py-3`} title={tooltip}>
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{label}</span>
                {icon && <span className={c.icon}>{icon}</span>}
            </div>
            <div className={`text-2xl font-black ${c.text}`}>{value}</div>
            {sub && <div className="text-xs text-gray-400 mt-0.5 truncate">{sub}</div>}
        </div>
    );
};

// ─── DelaySimulator ───────────────────────────────────────────

const DelaySimulator: React.FC<{
    open: boolean; setOpen: (v: boolean) => void;
    criticalItems: HierarchyNode[]; schedule: ProjectSchedule; projectEnd: string;
}> = ({ open, setOpen, criticalItems, schedule, projectEnd }) => {
    const [selectedId, setSelectedId] = useState('');
    const [delayDays, setDelayDays] = useState(7);

    const selectedSched = schedule.itemSchedules?.find(s => s.id === selectedId);
    const float = selectedSched?.totalFloat ?? 0;
    const netImpact = Math.max(0, delayDays - float);
    const newEnd = projectEnd && netImpact > 0
        ? new Date(new Date(projectEnd + 'T00:00:00Z').getTime() + netImpact * 86400000).toISOString().split('T')[0]
        : projectEnd;

    return (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-purple-500" />
                    <span className="text-xs font-bold text-gray-700">Simulador de Impacto de Atraso</span>
                    <span className="text-xs text-gray-400">— "Se atrasar N dias, o término muda?"</span>
                </div>
                {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {open && (
                <div className="px-5 py-4 space-y-4">
                    {criticalItems.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-4">
                            Execute o Auto Programar para calcular o caminho crítico.
                        </p>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Atividade</label>
                                    <select
                                        value={selectedId}
                                        onChange={e => setSelectedId(e.target.value)}
                                        className="w-full text-form-input border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 outline-none bg-white"
                                    >
                                        <option value="">Selecione…</option>
                                        {criticalItems.map(item => {
                                            const sched = schedule.itemSchedules?.find(s => s.id === item.id);
                                            const f = sched?.totalFloat ?? 0;
                                            return (
                                                <option key={item.id} value={item.id}>
                                                    {item.name} {f > 0 ? `(folga: ${f}d)` : '(crítico)'}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Atraso (dias)</label>
                                    <input
                                        type="number" min={1} max={365} value={delayDays}
                                        onChange={e => setDelayDays(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="w-full text-form-input border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 outline-none"
                                    />
                                </div>
                            </div>

                            {selectedId && (
                                <div className={`rounded-xl px-5 py-4 border ${netImpact > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                                    <div className="flex items-center gap-6 text-sm">
                                        <div>
                                            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">Término atual</div>
                                            <div className="font-black text-gray-800 mt-0.5">{fmtDate(projectEnd)}</div>
                                        </div>
                                        <div className="text-gray-300 text-lg">→</div>
                                        <div>
                                            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">Novo término</div>
                                            <div className={`font-black mt-0.5 ${netImpact > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                                {fmtDate(newEnd)}
                                            </div>
                                        </div>
                                        <div className="ml-auto text-right">
                                            {netImpact > 0 ? (
                                                <div className="text-red-700">
                                                    <div className="text-2xl font-black">+{netImpact}d</div>
                                                    <div className="text-xs">impacto no projeto</div>
                                                    {float > 0 && <div className="text-xs text-gray-500">absorveu {float}d de folga</div>}
                                                </div>
                                            ) : (
                                                <div className="text-emerald-700">
                                                    <div className="text-2xl font-black">Sem impacto</div>
                                                    <div className="text-xs">folga de {float}d absorve o atraso</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
