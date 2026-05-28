import React, { useState, useMemo } from 'react';
import {
    TrendingUp, TrendingDown, Users, UserPlus, UserMinus,
    Target, BarChart3, Activity, Calendar, Loader2, RefreshCw,
    Plus, X, Check, AlertTriangle, Building2, Clock,
    DollarSign, Percent, ChevronDown, Trash2, Settings,
    ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    hrAnalyticsService,
    HrMonthlySnapshot, TurnoverEvent, TurnoverTipo,
    ProductivityByProject, RetentionCohort, HrTarget
} from '../services/hrAnalyticsService';
import { STALE } from '../lib/queryClient';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = {
    pct: (v?: number | null) => v != null ? `${v.toFixed(1)}%` : '–',
    num: (v?: number | null) => v != null ? v.toLocaleString('pt-BR') : '–',
    brl: (v?: number | null) => v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : '–',
    mes: (iso: string) => {
        const d = new Date(iso + 'T12:00:00');
        return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
    },
    date: (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR'),
};

const TIPO_CONFIG: Record<TurnoverTipo, { label: string; color: string; bg: string; icon: React.ElementType }> = {
    ADMISSAO:             { label: 'Admissão',      color: 'text-emerald-700', bg: 'bg-emerald-100', icon: UserPlus },
    DEMISSAO_VOLUNTARIA:  { label: 'Saída voluntária', color: 'text-amber-700', bg: 'bg-amber-100', icon: UserMinus },
    DEMISSAO_INVOLUNTARIA:{ label: 'Desligamento',  color: 'text-red-700',     bg: 'bg-red-100',     icon: UserMinus },
    TRANSFERENCIA:        { label: 'Transferência', color: 'text-blue-700',    bg: 'bg-blue-100',    icon: Building2 },
    PROMOCAO:             { label: 'Promoção',      color: 'text-violet-700',  bg: 'bg-violet-100',  icon: TrendingUp },
    REBAIXAMENTO:         { label: 'Rebaixamento',  color: 'text-slate-600',   bg: 'bg-slate-100',   icon: TrendingDown },
};

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-300 transition-all';
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
        {children}
    </div>
);

// ── Mini bar chart (CSS) ──────────────────────────────────────────────────────

const SparkBar: React.FC<{ value: number; max: number; color: string; label: string; sub?: string }> = ({ value, max, color, label, sub }) => (
    <div className="flex items-center gap-3">
        <p className="text-xs font-bold text-slate-600 w-20 shrink-0 truncate">{label}</p>
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${color}`}
                style={{ width: `${max > 0 ? Math.min((value / max) * 100, 100) : 0}%` }} />
        </div>
        <p className="text-xs font-black text-slate-700 w-16 text-right shrink-0">{sub ?? value}</p>
    </div>
);

// Linha temporal simples com barras verticais
const TimelineBars: React.FC<{
    data: { label: string; value: number; meta?: number }[];
    color: string;
    metaColor?: string;
    unit?: string;
    maxOverride?: number;
}> = ({ data, color, metaColor = 'bg-red-300', unit = '%', maxOverride }) => {
    const max = maxOverride ?? Math.max(...data.map(d => Math.max(d.value, d.meta ?? 0)), 1);
    return (
        <div className="flex items-end gap-1.5 h-28">
            {data.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 hidden group-hover:flex flex-col items-center">
                        <div className="bg-slate-800 text-white text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap">
                            {d.label}: {d.value}{unit}
                            {d.meta != null && ` | meta: ${d.meta}${unit}`}
                        </div>
                        <div className="w-1.5 h-1.5 bg-slate-800 rotate-45 -mt-1" />
                    </div>
                    <div className="w-full flex items-end gap-0.5 h-24">
                        <div className={`flex-1 ${color} rounded-t-md transition-all duration-500`}
                            style={{ height: `${max > 0 ? (d.value / max) * 100 : 0}%` }} />
                        {d.meta != null && (
                            <div className={`w-1 ${metaColor} rounded-t-sm opacity-70`}
                                style={{ height: `${max > 0 ? (d.meta / max) * 100 : 0}%` }} />
                        )}
                    </div>
                    <span className="text-[8px] text-slate-400 font-bold truncate w-full text-center">{d.label}</span>
                </div>
            ))}
        </div>
    );
};

// KPI com delta
const KpiCard: React.FC<{
    label: string; value: string; sub?: string;
    icon: React.ElementType; color: string;
    delta?: number; deltaInvert?: boolean;
}> = ({ label, value, sub, icon: Icon, color, delta, deltaInvert }) => {
    const positive = delta != null && (deltaInvert ? delta < 0 : delta > 0);
    const negative = delta != null && (deltaInvert ? delta > 0 : delta < 0);
    return (
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-start justify-between mb-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{label}</p>
                <div className={`p-2 rounded-xl bg-${color}-50`}>
                    <Icon className={`w-4 h-4 text-${color}-600`} />
                </div>
            </div>
            <p className="text-3xl font-black text-slate-900 tracking-tighter">{value}</p>
            <div className="flex items-center gap-2 mt-2">
                {sub && <p className="text-[11px] text-slate-400 font-medium">{sub}</p>}
                {delta != null && (
                    <span className={`flex items-center gap-0.5 text-[10px] font-black px-1.5 py-0.5 rounded-lg ${
                        positive ? 'bg-emerald-100 text-emerald-700' :
                        negative ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-500'
                    }`}>
                        {positive ? <ArrowUpRight className="w-3 h-3" /> : negative ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                        {Math.abs(delta).toFixed(1)}%
                    </span>
                )}
            </div>
        </div>
    );
};

// ── Modal Movimentação ────────────────────────────────────────────────────────

interface EventFormProps {
    orgId: string;
    employees: { id: string; name: string }[];
    onClose: () => void;
    onSaved: () => void;
}

const EventForm: React.FC<EventFormProps> = ({ orgId, employees, onClose, onSaved }) => {
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<Partial<TurnoverEvent>>({
        org_id: orgId,
        tipo: 'ADMISSAO',
        data_evento: new Date().toISOString().split('T')[0],
    });
    const set = (k: keyof TurnoverEvent, v: unknown) => setForm(p => ({ ...p, [k]: v }));

    const handleSave = async () => {
        if (!form.employee_id || !form.tipo || !form.data_evento) {
            alert('Colaborador, tipo e data são obrigatórios.'); return;
        }
        setSaving(true);
        try {
            await hrAnalyticsService.createTurnoverEvent(form as any);
            onSaved();
        } catch (e: any) {
            alert(e.message || 'Erro ao salvar.');
        } finally {
            setSaving(false);
        }
    };

    const tipo = form.tipo as TurnoverTipo;
    const isSaida = tipo?.includes('DEMISSAO');
    const isEntrada = tipo === 'ADMISSAO' || tipo === 'PROMOCAO';
    const isTransf = tipo === 'TRANSFERENCIA';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <h2 className="text-base font-black text-slate-900">Registrar Movimentação</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Colaborador">
                            <select className={inputCls} value={form.employee_id || ''}
                                onChange={e => set('employee_id', e.target.value)}>
                                <option value="">Selecionar...</option>
                                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                        </Field>
                        <Field label="Data do evento">
                            <input type="date" className={inputCls} value={form.data_evento || ''}
                                onChange={e => set('data_evento', e.target.value)} />
                        </Field>
                    </div>
                    <Field label="Tipo de movimentação">
                        <div className="grid grid-cols-3 gap-2">
                            {(Object.entries(TIPO_CONFIG) as [TurnoverTipo, typeof TIPO_CONFIG[TurnoverTipo]][]).map(([k, v]) => {
                                const Icon = v.icon;
                                const active = form.tipo === k;
                                return (
                                    <button key={k} type="button" onClick={() => set('tipo', k)}
                                        className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border-2 text-xs font-bold transition-all
                                            ${active ? `${v.bg} border-current ${v.color}` : 'border-slate-100 text-slate-400 hover:border-slate-200'}`}>
                                        <Icon className="w-3.5 h-3.5 shrink-0" />
                                        <span className="truncate">{v.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </Field>
                    <Field label="Motivo / Observação">
                        <textarea className={`${inputCls} resize-none`} rows={2}
                            value={form.motivo || ''} onChange={e => set('motivo', e.target.value)}
                            placeholder="Descreva o contexto da movimentação..." />
                    </Field>
                    {isSaida && (
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="Cargo na saída">
                                <input className={inputCls} value={form.cargo_saida || ''}
                                    onChange={e => set('cargo_saida', e.target.value)} />
                            </Field>
                            <Field label="Salário na saída">
                                <input type="number" className={inputCls} value={form.salario_saida || ''}
                                    onChange={e => set('salario_saida', Number(e.target.value))} />
                            </Field>
                        </div>
                    )}
                    {isEntrada && (
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="Cargo na entrada">
                                <input className={inputCls} value={form.cargo_entrada || ''}
                                    onChange={e => set('cargo_entrada', e.target.value)} />
                            </Field>
                            <Field label="Salário na entrada">
                                <input type="number" className={inputCls} value={form.salario_entrada || ''}
                                    onChange={e => set('salario_entrada', Number(e.target.value))} />
                            </Field>
                        </div>
                    )}
                    {isTransf && (
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="Origem">
                                <input className={inputCls} value={form.origem_ref || ''}
                                    onChange={e => set('origem_ref', e.target.value)} placeholder="Obra ou dep. de origem" />
                            </Field>
                            <Field label="Destino">
                                <input className={inputCls} value={form.destino_ref || ''}
                                    onChange={e => set('destino_ref', e.target.value)} placeholder="Obra ou dep. de destino" />
                            </Field>
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
                    <button onClick={handleSave} disabled={saving}
                        className="flex items-center gap-2 px-5 py-2 bg-sky-600 text-white text-sm font-bold rounded-xl hover:bg-sky-700 transition-colors disabled:opacity-50 shadow-lg shadow-sky-900/20">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Registrar
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Modal Metas ───────────────────────────────────────────────────────────────

interface TargetFormProps {
    orgId: string;
    ano: number;
    existing?: HrTarget | null;
    onClose: () => void;
    onSaved: () => void;
}

const TargetForm: React.FC<TargetFormProps> = ({ orgId, ano, existing, onClose, onSaved }) => {
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<HrTarget>({
        org_id: orgId, ano,
        turnover_max_pct: existing?.turnover_max_pct,
        absenteismo_max_pct: existing?.absenteismo_max_pct,
        horas_extras_max_pct: existing?.horas_extras_max_pct,
        eficiencia_min_pct: existing?.eficiencia_min_pct,
    });

    const handleSave = async () => {
        setSaving(true);
        try {
            await hrAnalyticsService.upsertTarget(form);
            onSaved();
        } catch (e: any) {
            alert(e.message || 'Erro ao salvar.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm">
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <h2 className="text-base font-black text-slate-900">Metas de RH — {ano}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    {[
                        { key: 'turnover_max_pct',      label: 'Turnover máximo (%)',         hint: 'Ex: 5 para 5% ao mês' },
                        { key: 'absenteismo_max_pct',   label: 'Absenteísmo máximo (%)',      hint: 'Ex: 3' },
                        { key: 'horas_extras_max_pct',  label: 'Horas extras máximas (%)',    hint: 'Ex: 10 das horas totais' },
                        { key: 'eficiencia_min_pct',    label: 'Eficiência mínima (%)',       hint: 'Ex: 80' },
                    ].map(({ key, label, hint }) => (
                        <Field key={key} label={label}>
                            <input type="number" step="0.1" className={inputCls}
                                placeholder={hint}
                                value={(form as any)[key] ?? ''}
                                onChange={e => setForm(p => ({ ...p, [key]: e.target.value ? Number(e.target.value) : undefined }))} />
                        </Field>
                    ))}
                </div>
                <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
                    <button onClick={handleSave} disabled={saving}
                        className="flex items-center gap-2 px-5 py-2 bg-sky-600 text-white text-sm font-bold rounded-xl hover:bg-sky-700 transition-colors disabled:opacity-50 shadow-lg shadow-sky-900/20">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Salvar metas
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

interface LaborBIAnalyticsProps {
    orgId: string;
    employees: { id: string; name: string; status?: string }[];
}

type MainTab = 'turnover' | 'retencao' | 'produtividade' | 'movimentacoes';

const LaborBIAnalytics: React.FC<LaborBIAnalyticsProps> = ({ orgId, employees }) => {
    const qc = useQueryClient();
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().toISOString().slice(0, 7) + '-01';

    const [mainTab, setMainTab] = useState<MainTab>('turnover');
    const [showEventForm, setShowEventForm] = useState(false);
    const [showTargetForm, setShowTargetForm] = useState(false);
    const [generating, setGenerating] = useState(false);

    // Queries
    const { data: snapshots = [], isLoading: loadSnap, refetch: refetchSnap } = useQuery({
        queryKey: ['hr-snapshots', orgId],
        queryFn: () => hrAnalyticsService.getSnapshots(orgId, 24),
        enabled: !!orgId,
        staleTime: STALE.normal,
    });

    const { data: events = [], isLoading: loadEvents, refetch: refetchEvents } = useQuery({
        queryKey: ['hr-turnover-events', orgId],
        queryFn: () => hrAnalyticsService.getTurnoverEvents(orgId),
        enabled: !!orgId && mainTab === 'movimentacoes',
        staleTime: STALE.normal,
    });

    const { data: productivity = [], isLoading: loadProd } = useQuery({
        queryKey: ['hr-productivity', orgId],
        queryFn: () => hrAnalyticsService.getProductivityByProject(orgId),
        enabled: !!orgId && mainTab === 'produtividade',
        staleTime: STALE.normal,
    });

    const { data: cohorts = [], isLoading: loadCohorts } = useQuery({
        queryKey: ['hr-retention', orgId],
        queryFn: () => hrAnalyticsService.getRetentionCohorts(orgId),
        enabled: !!orgId && mainTab === 'retencao',
        staleTime: STALE.normal,
    });

    const { data: target } = useQuery({
        queryKey: ['hr-target', orgId, currentYear],
        queryFn: () => hrAnalyticsService.getTarget(orgId, currentYear),
        enabled: !!orgId,
        staleTime: STALE.slow,
    });

    const deleteEventMut = useMutation({
        mutationFn: (id: string) => hrAnalyticsService.deleteTurnoverEvent(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-turnover-events', orgId] }),
        onError: (e: any) => alert(e.message || 'Erro.'),
    });

    const handleGenerateSnapshot = async () => {
        setGenerating(true);
        try {
            const res = await hrAnalyticsService.generateSnapshot(orgId, currentMonth);
            alert(`Snapshot gerado: ${res.headcount_fim} colaboradores • Turnover ${res.turnover_rate}%`);
            refetchSnap();
        } catch (e: any) {
            alert(e.message || 'Erro ao gerar snapshot.');
        } finally {
            setGenerating(false);
        }
    };

    // Dados ordenados cronologicamente para o gráfico (últimos 12 meses)
    const chartData = useMemo(() =>
        [...snapshots].reverse().slice(-12).map(s => ({
            label: fmt.mes(s.ano_mes),
            value: s.turnover_rate ?? 0,
            meta: target?.turnover_max_pct,
        })),
        [snapshots, target]
    );

    const absenteismoData = useMemo(() =>
        [...snapshots].reverse().slice(-12).map(s => ({
            label: fmt.mes(s.ano_mes),
            value: s.absenteismo_rate ?? 0,
            meta: target?.absenteismo_max_pct,
        })),
        [snapshots, target]
    );

    // KPIs do mês mais recente
    const latest = snapshots[0];
    const prev = snapshots[1];
    const turnoverDelta = latest && prev ? latest.turnover_rate - (prev.turnover_rate ?? 0) : undefined;
    const headcountDelta = latest && prev ? ((latest.headcount_fim - prev.headcount_fim) / Math.max(prev.headcount_fim, 1)) * 100 : undefined;

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-sky-600" />
                        BI Avançado — Analytics RH
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">Turnover, retenção, produtividade e movimentações</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowTargetForm(true)}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
                        <Target className="w-3.5 h-3.5" /> Metas {currentYear}
                    </button>
                    <button onClick={handleGenerateSnapshot} disabled={generating}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-sky-600 bg-sky-50 hover:bg-sky-100 rounded-xl transition-colors disabled:opacity-50 border border-sky-200">
                        {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Snapshot do mês
                    </button>
                </div>
            </div>

            {/* KPIs executivos */}
            <div className="grid grid-cols-4 gap-4">
                <KpiCard label="Headcount atual" value={fmt.num(latest?.headcount_fim)} icon={Users} color="sky"
                    sub={`${fmt.num(latest?.admissoes)} adm • ${fmt.num(latest?.demissoes)} dem`}
                    delta={headcountDelta} />
                <KpiCard label="Turnover mês" value={fmt.pct(latest?.turnover_rate)} icon={TrendingDown} color="amber"
                    sub={`Média 3m: ${fmt.pct(latest?.turnover_media_3m)}`}
                    delta={turnoverDelta} deltaInvert />
                <KpiCard label="Absenteísmo" value={fmt.pct(latest?.absenteismo_rate)} icon={Clock} color="rose"
                    sub={`${fmt.num(latest?.dias_ausencia)} dias de ausência`}
                    delta={latest && prev ? latest.absenteismo_rate! - (prev.absenteismo_rate ?? 0) : undefined} deltaInvert />
                <KpiCard label="Custo médio/colaborador" value={fmt.brl(latest?.custo_medio_colaborador)} icon={DollarSign} color="emerald"
                    sub={`Folha total: ${fmt.brl(latest?.custo_folha_total)}`} />
            </div>

            {/* Metas inline alert */}
            {target && latest && latest.turnover_rate > (target.turnover_max_pct ?? Infinity) && (
                <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 font-bold">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Turnover ({fmt.pct(latest.turnover_rate)}) acima da meta ({fmt.pct(target.turnover_max_pct)}) — atenção necessária.
                </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
                {([
                    ['turnover', 'Turnover'],
                    ['retencao', 'Retenção'],
                    ['produtividade', 'Produtividade'],
                    ['movimentacoes', 'Movimentações'],
                ] as [MainTab, string][]).map(([v, label]) => (
                    <button key={v} onClick={() => setMainTab(v)}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${mainTab === v ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {/* ── Tab: Turnover ── */}
            {mainTab === 'turnover' && (
                <div className="space-y-4">
                    {loadSnap ? (
                        <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-sky-600 animate-spin" /></div>
                    ) : snapshots.length === 0 ? (
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-16 text-center">
                            <BarChart3 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-bold text-slate-400">Nenhum snapshot gerado ainda.</p>
                            <p className="text-xs text-slate-300 mt-1">Clique em "Snapshot do mês" para gerar os dados do período atual.</p>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                {/* Gráfico turnover */}
                                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Taxa de Turnover Mensal</h3>
                                        <div className="flex items-center gap-3 text-[10px] text-slate-400 font-bold">
                                            <span className="flex items-center gap-1"><span className="w-3 h-2 bg-amber-400 rounded-sm inline-block" />Real</span>
                                            {target?.turnover_max_pct && <span className="flex items-center gap-1"><span className="w-3 h-2 bg-red-300 rounded-sm inline-block" />Meta</span>}
                                        </div>
                                    </div>
                                    <TimelineBars data={chartData} color="bg-amber-400" unit="%" />
                                </div>
                                {/* Gráfico absenteísmo */}
                                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Absenteísmo Mensal</h3>
                                        <div className="flex items-center gap-3 text-[10px] text-slate-400 font-bold">
                                            <span className="flex items-center gap-1"><span className="w-3 h-2 bg-rose-400 rounded-sm inline-block" />Real</span>
                                            {target?.absenteismo_max_pct && <span className="flex items-center gap-1"><span className="w-3 h-2 bg-red-300 rounded-sm inline-block" />Meta</span>}
                                        </div>
                                    </div>
                                    <TimelineBars data={absenteismoData} color="bg-rose-400" unit="%" />
                                </div>
                            </div>

                            {/* Tabela histórica */}
                            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100">
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Histórico Mensal</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-50">
                                                {['Mês', 'HC início', 'HC fim', 'Adm.', 'Dem.', 'Turnover', 'Média 3m', 'Absenteísmo', 'Custo folha'].map(h => (
                                                    <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {snapshots.map(s => {
                                                const overMeta = target?.turnover_max_pct && s.turnover_rate > target.turnover_max_pct;
                                                return (
                                                    <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-4 py-3 font-bold text-slate-700">{fmt.mes(s.ano_mes)}</td>
                                                        <td className="px-4 py-3 text-slate-500">{s.headcount_inicio}</td>
                                                        <td className="px-4 py-3 font-bold text-slate-800">{s.headcount_fim}</td>
                                                        <td className="px-4 py-3 text-emerald-600 font-bold">+{s.admissoes}</td>
                                                        <td className="px-4 py-3 text-red-500 font-bold">-{s.demissoes}</td>
                                                        <td className="px-4 py-3">
                                                            <span className={`font-black text-sm ${overMeta ? 'text-red-600' : 'text-amber-600'}`}>
                                                                {fmt.pct(s.turnover_rate)}
                                                            </span>
                                                            {overMeta && <AlertTriangle className="w-3 h-3 text-red-500 inline ml-1" />}
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-400 text-xs">{fmt.pct(s.turnover_media_3m)}</td>
                                                        <td className="px-4 py-3 text-slate-500">{fmt.pct(s.absenteismo_rate)}</td>
                                                        <td className="px-4 py-3 text-slate-600">{fmt.brl(s.custo_folha_total)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── Tab: Retenção ── */}
            {mainTab === 'retencao' && (
                <div className="space-y-4">
                    {loadCohorts ? (
                        <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-sky-600 animate-spin" /></div>
                    ) : cohorts.length === 0 ? (
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-16 text-center">
                            <Users className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-bold text-slate-400">Sem dados de retenção calculados.</p>
                        </div>
                    ) : (
                        <>
                            {/* KPIs de retenção */}
                            <div className="grid grid-cols-3 gap-4">
                                {(() => {
                                    const avgRetencao = cohorts.reduce((s, c) => s + c.taxa_retencao_pct, 0) / cohorts.length;
                                    const avgPermanencia = cohorts.reduce((s, c) => s + c.permanencia_media_dias, 0) / cohorts.length;
                                    const totalAdm = cohorts.reduce((s, c) => s + c.admitidos, 0);
                                    return [
                                        { label: 'Taxa retenção média', value: fmt.pct(avgRetencao), icon: Users, color: 'emerald' },
                                        { label: 'Permanência média', value: `${Math.round(avgPermanencia)}d`, icon: Calendar, color: 'sky' },
                                        { label: 'Total admitidos (histórico)', value: fmt.num(totalAdm), icon: UserPlus, color: 'violet' },
                                    ];
                                })().map(({ label, value, icon: Icon, color }) => (
                                    <div key={label} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                                        <div className="flex items-center justify-between mt-2">
                                            <span className="text-2xl font-black text-slate-900">{value}</span>
                                            <div className={`p-2 bg-${color}-50 rounded-xl`}>
                                                <Icon className={`w-4 h-4 text-${color}-600`} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Barras de retenção por coorte */}
                            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Taxa de Retenção por Coorte de Admissão</h3>
                                <div className="space-y-3">
                                    {cohorts.slice(0, 18).map(c => (
                                        <SparkBar key={c.coorte_mes}
                                            label={fmt.mes(c.coorte_mes)}
                                            value={c.taxa_retencao_pct}
                                            max={100}
                                            color={c.taxa_retencao_pct >= 80 ? 'bg-emerald-400' : c.taxa_retencao_pct >= 50 ? 'bg-amber-400' : 'bg-red-400'}
                                            sub={`${c.ainda_ativos}/${c.admitidos} (${fmt.pct(c.taxa_retencao_pct)})`} />
                                    ))}
                                </div>
                            </div>

                            {/* Tabela detalhada */}
                            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-100">
                                            {['Coorte', 'Admitidos', 'Ainda ativos', 'Retenção', 'Permanência média'].map(h => (
                                                <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cohorts.map(c => (
                                            <tr key={c.coorte_mes} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                                <td className="px-4 py-3 font-bold text-slate-700">{fmt.mes(c.coorte_mes)}</td>
                                                <td className="px-4 py-3 text-slate-500">{c.admitidos}</td>
                                                <td className="px-4 py-3 font-bold text-emerald-700">{c.ainda_ativos}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`font-black ${c.taxa_retencao_pct >= 80 ? 'text-emerald-700' : c.taxa_retencao_pct >= 50 ? 'text-amber-700' : 'text-red-600'}`}>
                                                        {fmt.pct(c.taxa_retencao_pct)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-500">{c.permanencia_media_dias} dias</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── Tab: Produtividade ── */}
            {mainTab === 'produtividade' && (
                <div className="space-y-4">
                    {loadProd ? (
                        <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-sky-600 animate-spin" /></div>
                    ) : productivity.length === 0 ? (
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-16 text-center">
                            <Activity className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-bold text-slate-400">Nenhuma métrica de produtividade registrada.</p>
                            <p className="text-xs text-slate-300 mt-1">Os dados são populados via Controle Operacional ou manualmente.</p>
                        </div>
                    ) : (
                        <>
                            {/* Barras eficiência por obra */}
                            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Eficiência de MO por Obra (%)</h3>
                                <div className="space-y-3">
                                    {productivity.map(p => (
                                        <SparkBar key={p.project_id || 'sem-obra'}
                                            label={p.projeto_nome || 'Sem obra'}
                                            value={p.eficiencia_media_pct ?? 0}
                                            max={100}
                                            color={(p.eficiencia_media_pct ?? 0) >= (target?.eficiencia_min_pct ?? 80) ? 'bg-emerald-400' : 'bg-amber-400'}
                                            sub={fmt.pct(p.eficiencia_media_pct)} />
                                    ))}
                                </div>
                            </div>

                            {/* Tabela desvio de custo */}
                            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100">
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Desvio de Custo MO por Obra</h3>
                                </div>
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-50">
                                            {['Obra', 'HH produtivo', 'Custo MO', 'Previsto', 'Realizado', 'Desvio', 'IDC'].map(h => (
                                                <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {productivity.map(p => {
                                            const desvio = p.desvio_custo_pct ?? 0;
                                            return (
                                                <tr key={p.project_id || 'x'} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-4 py-3 font-bold text-slate-800">{p.projeto_nome || 'Sem obra'}</td>
                                                    <td className="px-4 py-3 text-slate-500">{fmt.num(p.hh_total)}h</td>
                                                    <td className="px-4 py-3 text-slate-600">{fmt.brl(p.custo_total_mdo)}</td>
                                                    <td className="px-4 py-3 text-slate-500">{fmt.brl(p.custo_previsto_total)}</td>
                                                    <td className="px-4 py-3 text-slate-600 font-bold">{fmt.brl(p.custo_realizado_total)}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`font-black text-sm flex items-center gap-1 ${desvio > 0 ? 'text-red-600' : desvio < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                            {desvio > 0 ? <ArrowUpRight className="w-3 h-3" /> : desvio < 0 ? <ArrowDownRight className="w-3 h-3" /> : null}
                                                            {desvio > 0 ? '+' : ''}{fmt.pct(desvio)}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`font-black ${(p.idc_medio ?? 1) >= 1 ? 'text-emerald-700' : 'text-red-600'}`}>
                                                            {p.idc_medio?.toFixed(3) ?? '–'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── Tab: Movimentações ── */}
            {mainTab === 'movimentacoes' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-400 font-medium">Histórico de admissões, saídas, promoções e transferências</p>
                        <button onClick={() => setShowEventForm(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white text-sm font-bold rounded-xl hover:bg-sky-700 transition-colors shadow-lg shadow-sky-900/20">
                            <Plus className="w-4 h-4" /> Registrar
                        </button>
                    </div>

                    {loadEvents ? (
                        <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-sky-600 animate-spin" /></div>
                    ) : events.length === 0 ? (
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-16 text-center">
                            <Activity className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-bold text-slate-400">Nenhuma movimentação registrada.</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100">
                                        {['Data', 'Colaborador', 'Tipo', 'Detalhe', 'Motivo', ''].map(h => (
                                            <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {events.map(ev => {
                                        const cfg = TIPO_CONFIG[ev.tipo];
                                        const Icon = cfg.icon;
                                        return (
                                            <tr key={ev.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                                <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmt.date(ev.data_evento)}</td>
                                                <td className="px-4 py-3 font-bold text-slate-800">{ev.employee_nome || '–'}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black ${cfg.color} ${cfg.bg}`}>
                                                        <Icon className="w-3 h-3" />
                                                        {cfg.label}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-500 text-xs">
                                                    {ev.cargo_saida && `De: ${ev.cargo_saida}`}
                                                    {ev.cargo_entrada && `Para: ${ev.cargo_entrada}`}
                                                    {ev.origem_ref && `${ev.origem_ref} → ${ev.destino_ref}`}
                                                </td>
                                                <td className="px-4 py-3 text-slate-400 text-xs max-w-[160px] truncate">{ev.motivo || '–'}</td>
                                                <td className="px-4 py-3">
                                                    <button onClick={() => { if (confirm('Excluir movimentação?')) deleteEventMut.mutate(ev.id); }}
                                                        className="p-1.5 hover:bg-red-100 rounded-lg transition-colors">
                                                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Modals */}
            {showEventForm && (
                <EventForm orgId={orgId} employees={employees}
                    onClose={() => setShowEventForm(false)}
                    onSaved={() => { setShowEventForm(false); refetchEvents(); }} />
            )}
            {showTargetForm && (
                <TargetForm orgId={orgId} ano={currentYear} existing={target}
                    onClose={() => setShowTargetForm(false)}
                    onSaved={() => { setShowTargetForm(false); qc.invalidateQueries({ queryKey: ['hr-target', orgId, currentYear] }); }} />
            )}
        </div>
    );
};

export default LaborBIAnalytics;
