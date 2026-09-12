import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    TrendingUp, TrendingDown, Users, UserPlus, UserMinus,
    Target, BarChart3, Activity, Calendar, Loader2, RefreshCw,
    Plus, X, Check, AlertTriangle, Building2, Clock,
    DollarSign, Percent, ChevronDown, Settings,
    ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react';
import { KpiCard as KpiCardBase, type KpiColor } from './ui/KpiCard';
import ActionIconButton from './ui/ActionIconButton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    hrAnalyticsService,
    HrMonthlySnapshot, TurnoverEvent, TurnoverTipo,
    ProductivityByProject, RetentionCohort, HrTarget
} from '../services/hrAnalyticsService';
import { STALE } from '../lib/queryClient';
import Button from './ui/Button';
import { useConfirm } from './ui/confirm';
import TabsBar from './ui/TabsBar';
import StandardTable, { StandardTableColumn } from './ui/StandardTable';

// ── Colunas das tabelas padrão (§6.10) ────────────────────────────────────────

const ORG_COLUMN: StandardTableColumn = { key: 'org', label: 'Organização', sortable: true, width: 180 };

const SNAPSHOT_COLUMNS: StandardTableColumn[] = [
    { key: 'mes', label: 'Mês', sortable: true, width: 100 },
    { key: 'hc_inicio', label: 'HC início', sortable: true, width: 100, align: 'right' },
    { key: 'hc_fim', label: 'HC fim', sortable: true, width: 100, align: 'right' },
    { key: 'adm', label: 'Adm.', sortable: true, width: 90, align: 'right' },
    { key: 'dem', label: 'Dem.', sortable: true, width: 90, align: 'right' },
    { key: 'turnover', label: 'Turnover', sortable: true, width: 110, align: 'right' },
    { key: 'media3m', label: 'Média 3m', sortable: true, width: 110, align: 'right' },
    { key: 'absenteismo', label: 'Absenteísmo', sortable: true, width: 120, align: 'right' },
    { key: 'custo', label: 'Custo folha', sortable: true, width: 140, align: 'right' },
];

const COHORT_COLUMNS: StandardTableColumn[] = [
    { key: 'coorte', label: 'Coorte', sortable: true, width: 120 },
    { key: 'admitidos', label: 'Admitidos', sortable: true, width: 110, align: 'right' },
    { key: 'ativos', label: 'Ainda ativos', sortable: true, width: 120, align: 'right' },
    { key: 'retencao', label: 'Retenção', sortable: true, width: 110, align: 'right' },
    { key: 'permanencia', label: 'Permanência média', sortable: true, width: 160, align: 'right' },
];

const PROD_COLUMNS: StandardTableColumn[] = [
    { key: 'obra', label: 'Obra', sortable: true, width: 220 },
    { key: 'hh', label: 'HH produtivo', sortable: true, width: 120, align: 'right' },
    { key: 'custo', label: 'Custo MO', sortable: true, width: 130, align: 'right' },
    { key: 'previsto', label: 'Previsto', sortable: true, width: 130, align: 'right' },
    { key: 'realizado', label: 'Realizado', sortable: true, width: 130, align: 'right' },
    { key: 'desvio', label: 'Desvio', sortable: true, width: 110, align: 'right' },
    { key: 'idc', label: 'IDC', sortable: true, width: 90, align: 'right' },
];

const EVENT_COLUMNS: StandardTableColumn[] = [
    { key: 'data', label: 'Data', sortable: true, width: 110 },
    { key: 'colaborador', label: 'Colaborador', sortable: true, width: 220 },
    { key: 'tipo', label: 'Tipo', sortable: true, width: 150 },
    { key: 'detalhe', label: 'Detalhe', sortable: true, width: 220 },
    { key: 'motivo', label: 'Motivo', sortable: true, width: 200 },
];

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
        <label className="text-xs font-black text-slate-500 uppercase tracking-widest">{label}</label>
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
                        <div className="bg-slate-800 text-white text-xs font-bold px-2 py-1 rounded-lg whitespace-nowrap">
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
// Wrapper fino sobre o KpiCard canônico (guia §4) — mantém a assinatura antiga;
// o delta vira sufixo da dica (▲/▼ + percentual).
const KpiCard: React.FC<{
    label: string; value: string; sub?: string;
    icon: React.ElementType; color: string;
    delta?: number; deltaInvert?: boolean;
}> = ({ label, value, sub, icon: Icon, color, delta }) => {
    const seta = delta == null ? '' : delta > 0 ? '▲ ' : delta < 0 ? '▼ ' : '• ';
    const dica = [sub, delta != null ? `${seta}${Math.abs(delta).toFixed(1)}%` : undefined].filter(Boolean).join(' · ');
    return (
        <KpiCardBase label={label} value={value} sub={dica || undefined} icon={<Icon className="w-4 h-4" />} color={color as KpiColor} />
    );
};

// ── Modal Movimentação ────────────────────────────────────────────────────────

interface EventFormProps {
    orgId: string | null;
    employees: { id: string; name: string }[];
    onClose: () => void;
    onSaved: () => void;
}

const EventForm: React.FC<EventFormProps> = ({ orgId, employees, onClose, onSaved }) => {
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<Partial<TurnoverEvent>>({
        org_id: orgId ?? undefined,
        tipo: 'ADMISSAO',
        data_evento: new Date().toISOString().split('T')[0],
    });
    const set = (k: keyof TurnoverEvent, v: unknown) => setForm(p => ({ ...p, [k]: v }));

    const handleSave = async () => {
        // Escrita exige organização específica (REGRA #5, exceção 4):
        // em "Todas as organizações" não há org para gravar.
        if (!orgId) { alert('Selecione uma organização específica no seletor do topo para cadastrar.'); return; }
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
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="w-5 h-5 text-slate-400" />
                    </Button>
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
                    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
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
    orgId: string | null;
    ano: number;
    existing?: HrTarget | null;
    onClose: () => void;
    onSaved: () => void;
}

const TargetForm: React.FC<TargetFormProps> = ({ orgId, ano, existing, onClose, onSaved }) => {
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<HrTarget>({
        org_id: orgId ?? '', ano,
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
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="w-5 h-5 text-slate-400" />
                    </Button>
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
                    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
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
    orgId: string | null;
    employees: { id: string; name: string; status?: string }[];
    organizations: Array<{ id: string; name: string }>;
    onRefresh: () => void;
}

type MainTab = 'turnover' | 'retencao' | 'produtividade' | 'movimentacoes';

const LaborBIAnalytics: React.FC<LaborBIAnalyticsProps> = ({ orgId, employees, organizations, onRefresh }) => {
    const qc = useQueryClient();
    const confirm = useConfirm();
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().toISOString().slice(0, 7) + '-01';

    const [mainTab, setMainTab] = useState<MainTab>('turnover');
    const [showEventForm, setShowEventForm] = useState(false);
    const [showTargetForm, setShowTargetForm] = useState(false);
    const [generating, setGenerating] = useState(false);
    const backfillRan = useRef(false);

    // Queries
    // Sem `enabled: !!orgId` nas queries desta tela — com "Todas as organizações"
    // a RLS recorta sozinha e a tela não pode ficar vazia (REGRA #5).
    const { data: snapshots = [], isLoading: loadSnap, refetch: refetchSnap } = useQuery({
        queryKey: ['hr-snapshots', orgId],
        queryFn: () => hrAnalyticsService.getSnapshots(orgId, 24),
        staleTime: STALE.normal,
    });

    const { data: events = [], isLoading: loadEvents, refetch: refetchEvents } = useQuery({
        queryKey: ['hr-turnover-events', orgId],
        queryFn: () => hrAnalyticsService.getTurnoverEvents(orgId),
        enabled: mainTab === 'movimentacoes',
        staleTime: STALE.normal,
    });

    const { data: productivity = [], isLoading: loadProd } = useQuery({
        queryKey: ['hr-productivity', orgId],
        queryFn: () => hrAnalyticsService.getProductivityByProject(orgId),
        enabled: mainTab === 'produtividade',
        staleTime: STALE.normal,
    });

    const { data: cohorts = [], isLoading: loadCohorts } = useQuery({
        queryKey: ['hr-retention', orgId],
        queryFn: () => hrAnalyticsService.getRetentionCohorts(orgId),
        enabled: mainTab === 'retencao',
        staleTime: STALE.normal,
    });

    const { data: target } = useQuery({
        queryKey: ['hr-target', orgId, currentYear],
        queryFn: () => hrAnalyticsService.getTarget(orgId, currentYear),
        staleTime: STALE.slow,
    });

    const deleteEventMut = useMutation({
        mutationFn: (id: string) => hrAnalyticsService.deleteTurnoverEvent(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-turnover-events', orgId] }),
        onError: (e: any) => alert(e.message || 'Erro.'),
    });

    // Auto-backfill: se snapshots carregou e está vazio, gera os últimos 12 meses uma única vez
    useEffect(() => {
        if (!loadSnap && snapshots.length === 0 && orgId && !backfillRan.current) {
            backfillRan.current = true;
            setGenerating(true);
            hrAnalyticsService.backfillSnapshots(orgId, 12)
                .then(() => refetchSnap())
                .finally(() => setGenerating(false));
        }
    }, [loadSnap, snapshots.length, orgId]);

    const handleGenerateSnapshot = async () => {
        if (!orgId) { alert('Selecione uma organização específica no seletor do topo para gravar.'); return; }
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

    // "Todas as organizacoes" nao esconde a tela (REGRA #5). Como snapshot,
    // coorte e produtividade sao por organizacao, o corte escolhido e UMA LINHA
    // POR ORGANIZACAO: as tabelas ganham a coluna Organizacao e a chave do React
    // passa a incluir o org_id. Somar taxas de organizacoes diferentes daria
    // numero errado, entao os KPIs de taxa ficam em branco nesse modo.
    const isAllOrgs = !orgId;
    const nomeOrg = (id?: string) => organizations.find(o => o.id === id)?.name ?? '—';
    // Em "Todas as organizações" cada tabela ganha a coluna Organização na frente.
    const withOrg = (base: StandardTableColumn[]) => (isAllOrgs ? [ORG_COLUMN, ...base] : base);

    // KPIs do mês mais recente. Em "Todas as organizações" há uma linha por
    // organização no mesmo mês: headcount/admissões/demissões são contagens e
    // somam; turnover, absenteísmo e custo médio são TAXAS/MÉDIAS e não somam —
    // ficam em branco, com a leitura por organização na tabela abaixo.
    const mesMaisRecente = snapshots[0]?.ano_mes;
    const doMesAtual = snapshots.filter(s => s.ano_mes === mesMaisRecente);
    const soma = (rows: HrMonthlySnapshot[], campo: 'headcount_fim' | 'admissoes' | 'demissoes') =>
        rows.reduce((acc, r) => acc + (r[campo] ?? 0), 0);

    const latest = snapshots[0];
    const prev = snapshots[1];
    const headcountConsolidado = isAllOrgs ? soma(doMesAtual, 'headcount_fim') : latest?.headcount_fim;
    const admissoesConsolidadas = isAllOrgs ? soma(doMesAtual, 'admissoes') : latest?.admissoes;
    const demissoesConsolidadas = isAllOrgs ? soma(doMesAtual, 'demissoes') : latest?.demissoes;
    const turnoverDelta = latest && prev ? latest.turnover_rate - (prev.turnover_rate ?? 0) : undefined;
    const headcountDelta = latest && prev ? ((latest.headcount_fim - prev.headcount_fim) / Math.max(prev.headcount_fim, 1)) * 100 : undefined;


    return (
        <div className="space-y-6">
            {/* 1. Título */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">BI Analytics RH</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Turnover, retenção, produtividade e movimentações.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowTargetForm(true)}
                        className="flex items-center gap-1.5 px-3 py-2 text-button font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
                        <Target className="w-3.5 h-3.5" /> Metas {currentYear}
                    </button>
                    <button onClick={handleGenerateSnapshot} disabled={generating}
                        className="flex items-center gap-1.5 px-3 py-2 text-button font-bold text-sky-600 bg-sky-50 hover:bg-sky-100 rounded-xl transition-colors disabled:opacity-50 border border-sky-200">
                        {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Snapshot do mês
                    </button>
                </div>
            </div>

            {/* KPIs executivos */}
            <div className="grid grid-cols-4 gap-4">
                <KpiCard label="Headcount atual" value={fmt.num(headcountConsolidado)} icon={Users} color="sky"
                    sub={isAllOrgs
                        ? `${fmt.num(admissoesConsolidadas)} adm • ${fmt.num(demissoesConsolidadas)} dem • ${doMesAtual.length} org.`
                        : `${fmt.num(latest?.admissoes)} adm • ${fmt.num(latest?.demissoes)} dem`}
                    delta={isAllOrgs ? undefined : headcountDelta} />
                <KpiCard label="Turnover mês" value={isAllOrgs ? '—' : fmt.pct(latest?.turnover_rate)} icon={TrendingDown} color="amber"
                    sub={isAllOrgs ? 'Taxa por organização — ver tabela' : `Média 3m: ${fmt.pct(latest?.turnover_media_3m)}`}
                    delta={isAllOrgs ? undefined : turnoverDelta} deltaInvert />
                <KpiCard label="Absenteísmo" value={isAllOrgs ? '—' : fmt.pct(latest?.absenteismo_rate)} icon={Clock} color="rose"
                    sub={isAllOrgs ? 'Taxa por organização — ver tabela' : `${fmt.num(latest?.dias_ausencia)} dias de ausência`}
                    delta={isAllOrgs || !(latest && prev) ? undefined : latest.absenteismo_rate! - (prev.absenteismo_rate ?? 0)} deltaInvert />
                <KpiCard label="Custo médio/colaborador" value={isAllOrgs ? '—' : fmt.brl(latest?.custo_medio_colaborador)} icon={DollarSign} color="emerald"
                    sub={isAllOrgs ? 'Média por organização — ver tabela' : `Folha total: ${fmt.brl(latest?.custo_folha_total)}`} />
            </div>

            {/* Metas inline alert */}
            {!isAllOrgs && target && latest && latest.turnover_rate > (target.turnover_max_pct ?? Infinity) && (
                <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 font-bold">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Turnover ({fmt.pct(latest.turnover_rate)}) acima da meta ({fmt.pct(target.turnover_max_pct)}) — atenção necessária.
                </div>
            )}

            {/* Toolbar de abas (§19.1) */}
            <TabsBar
                tabs={[
                    { id: 'turnover', label: 'Turnover' },
                    { id: 'retencao', label: 'Retenção' },
                    { id: 'produtividade', label: 'Produtividade' },
                    { id: 'movimentacoes', label: 'Movimentações', badge: events.length },
                ]}
                value={mainTab}
                onChange={setMainTab}
            />

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
                            {isAllOrgs ? (
                                /* Os graficos sao serie temporal de UMA organizacao: em "Todas" o
                                   mesmo mes aparece uma vez por organizacao e as barras se
                                   empilhariam como se fossem meses distintos. A leitura correta
                                   nesse modo e a tabela abaixo, uma linha por organizacao. */
                                <div className="flex items-center gap-3 p-4 bg-sky-50 border border-sky-100 rounded-2xl text-xs text-sky-800 font-bold">
                                    <BarChart3 className="w-4 h-4 shrink-0" />
                                    Gráficos mensais exigem uma organização específica. Abaixo, uma linha por organização e mês.
                                </div>
                            ) : (
                            <div className="grid grid-cols-2 gap-4">
                                {/* Gráfico turnover */}
                                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Taxa de Turnover Mensal</h3>
                                        <div className="flex items-center gap-3 text-xs text-slate-400 font-bold">
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
                                        <div className="flex items-center gap-3 text-xs text-slate-400 font-bold">
                                            <span className="flex items-center gap-1"><span className="w-3 h-2 bg-rose-400 rounded-sm inline-block" />Real</span>
                                            {target?.absenteismo_max_pct && <span className="flex items-center gap-1"><span className="w-3 h-2 bg-red-300 rounded-sm inline-block" />Meta</span>}
                                        </div>
                                    </div>
                                    <TimelineBars data={absenteismoData} color="bg-rose-400" unit="%" />
                                </div>
                            </div>
                            )}

                            {/* Histórico mensal — tabela padrão (§6.10) */}
                            <div>
                                <h3 className="text-sm font-black text-slate-900 mb-3">Histórico mensal</h3>
                                <StandardTable<HrMonthlySnapshot>
                                    storageKey="labor:bi:historico"
                                    columns={withOrg(SNAPSHOT_COLUMNS)}
                                    rows={snapshots}
                                    rowKey={r => `${r.org_id}|${r.id}`}
                                    searchText={r => `${nomeOrg(r.org_id)} ${fmt.mes(r.ano_mes)}`}
                                    searchPlaceholder="Buscar mês..."
                                    sortValue={(key, r) => {
                                        switch (key) {
                                            case 'org': return nomeOrg(r.org_id);
                                            case 'mes': return r.ano_mes;
                                            case 'hc_inicio': return r.headcount_inicio;
                                            case 'hc_fim': return r.headcount_fim;
                                            case 'adm': return r.admissoes;
                                            case 'dem': return r.demissoes;
                                            case 'turnover': return r.turnover_rate;
                                            case 'media3m': return r.turnover_media_3m ?? null;
                                            case 'absenteismo': return r.absenteismo_rate ?? null;
                                            case 'custo': return r.custo_folha_total ?? null;
                                            default: return null;
                                        }
                                    }}
                                    renderCell={(key, r) => {
                                        const overMeta = !!target?.turnover_max_pct && r.turnover_rate > target.turnover_max_pct;
                                        switch (key) {
                                            case 'org': return <span className="text-sm font-normal text-gray-600">{nomeOrg(r.org_id)}</span>;
                                            case 'mes': return <span className="text-sm font-normal text-gray-700">{fmt.mes(r.ano_mes)}</span>;
                                            case 'hc_inicio': return <span className="text-sm font-normal text-gray-600">{r.headcount_inicio}</span>;
                                            case 'hc_fim': return <span className="text-sm font-normal text-gray-700">{r.headcount_fim}</span>;
                                            case 'adm': return <span className="text-sm font-normal text-emerald-600">+{r.admissoes}</span>;
                                            case 'dem': return <span className="text-sm font-normal text-red-500">-{r.demissoes}</span>;
                                            case 'turnover': return (
                                                <span className={`text-sm font-normal ${overMeta ? 'text-red-600' : 'text-amber-600'}`}>
                                                    {fmt.pct(r.turnover_rate)}
                                                    {overMeta && <AlertTriangle className="w-3 h-3 text-red-500 inline ml-1" />}
                                                </span>
                                            );
                                            case 'media3m': return <span className="text-sm font-normal text-gray-600">{fmt.pct(r.turnover_media_3m)}</span>;
                                            case 'absenteismo': return <span className="text-sm font-normal text-gray-600">{fmt.pct(r.absenteismo_rate)}</span>;
                                            case 'custo': return <span className="text-sm font-medium text-gray-800">{fmt.brl(r.custo_folha_total)}</span>;
                                            default: return null;
                                        }
                                    }}
                                    empty={{ title: 'Nenhum snapshot no período' }}
                                />
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
                                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{label}</p>
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

                            {/* Coortes — tabela padrão (§6.10) */}
                            <StandardTable<RetentionCohort>
                                storageKey="labor:bi:coortes"
                                columns={withOrg(COHORT_COLUMNS)}
                                rows={cohorts}
                                rowKey={c => `${c.org_id}|${c.coorte_mes}`}
                                searchText={c => `${nomeOrg(c.org_id)} ${fmt.mes(c.coorte_mes)}`}
                                searchPlaceholder="Buscar coorte..."
                                sortValue={(key, c) => {
                                    switch (key) {
                                        case 'org': return nomeOrg(c.org_id);
                                        case 'coorte': return c.coorte_mes;
                                        case 'admitidos': return c.admitidos;
                                        case 'ativos': return c.ainda_ativos;
                                        case 'retencao': return c.taxa_retencao_pct;
                                        case 'permanencia': return c.permanencia_media_dias;
                                        default: return null;
                                    }
                                }}
                                renderCell={(key, c) => {
                                    switch (key) {
                                        case 'org': return <span className="text-sm font-normal text-gray-600">{nomeOrg(c.org_id)}</span>;
                                        case 'coorte': return <span className="text-sm font-normal text-gray-700">{fmt.mes(c.coorte_mes)}</span>;
                                        case 'admitidos': return <span className="text-sm font-normal text-gray-600">{c.admitidos}</span>;
                                        case 'ativos': return <span className="text-sm font-normal text-emerald-700">{c.ainda_ativos}</span>;
                                        case 'retencao': return (
                                            <span className={`text-sm font-normal ${c.taxa_retencao_pct >= 80 ? 'text-emerald-700' : c.taxa_retencao_pct >= 50 ? 'text-amber-700' : 'text-red-600'}`}>
                                                {fmt.pct(c.taxa_retencao_pct)}
                                            </span>
                                        );
                                        case 'permanencia': return <span className="text-sm font-normal text-gray-600">{c.permanencia_media_dias} dias</span>;
                                        default: return null;
                                    }
                                }}
                                empty={{ title: 'Sem coortes calculadas' }}
                            />
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

                            {/* Desvio de custo por obra — tabela padrão (§6.10) */}
                            <div>
                                <h3 className="text-sm font-black text-slate-900 mb-3">Desvio de custo de MO por obra</h3>
                                <StandardTable<ProductivityByProject>
                                    storageKey="labor:bi:desvio"
                                    columns={withOrg(PROD_COLUMNS)}
                                    rows={productivity}
                                    rowKey={p => `${p.org_id}|${p.project_id || 'sem-obra'}`}
                                    searchText={p => `${nomeOrg(p.org_id)} ${p.projeto_nome ?? 'Sem obra'}`}
                                    searchPlaceholder="Buscar obra..."
                                    sortValue={(key, p) => {
                                        switch (key) {
                                            case 'org': return nomeOrg(p.org_id);
                                            case 'obra': return p.projeto_nome ?? 'Sem obra';
                                            case 'hh': return p.hh_total ?? null;
                                            case 'custo': return p.custo_total_mdo ?? null;
                                            case 'previsto': return p.custo_previsto_total ?? null;
                                            case 'realizado': return p.custo_realizado_total ?? null;
                                            case 'desvio': return p.desvio_custo_pct ?? 0;
                                            case 'idc': return p.idc_medio ?? null;
                                            default: return null;
                                        }
                                    }}
                                    renderCell={(key, p) => {
                                        const desvio = p.desvio_custo_pct ?? 0;
                                        switch (key) {
                                            case 'org': return <span className="text-sm font-normal text-gray-600">{nomeOrg(p.org_id)}</span>;
                                            case 'obra': return <span className="text-sm font-normal text-gray-700">{p.projeto_nome || 'Sem obra'}</span>;
                                            case 'hh': return <span className="text-sm font-normal text-gray-600">{fmt.num(p.hh_total)}h</span>;
                                            case 'custo': return <span className="text-sm font-medium text-gray-800">{fmt.brl(p.custo_total_mdo)}</span>;
                                            case 'previsto': return <span className="text-sm font-medium text-gray-800">{fmt.brl(p.custo_previsto_total)}</span>;
                                            case 'realizado': return <span className="text-sm font-medium text-gray-800">{fmt.brl(p.custo_realizado_total)}</span>;
                                            case 'desvio': return (
                                                <span className={`text-sm font-normal inline-flex items-center gap-1 ${desvio > 0 ? 'text-red-600' : desvio < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                                                    {desvio > 0 ? <ArrowUpRight className="w-3 h-3" /> : desvio < 0 ? <ArrowDownRight className="w-3 h-3" /> : null}
                                                    {desvio > 0 ? '+' : ''}{fmt.pct(desvio)}
                                                </span>
                                            );
                                            case 'idc': return (
                                                <span className={`text-sm font-normal ${(p.idc_medio ?? 1) >= 1 ? 'text-emerald-700' : 'text-red-600'}`}>
                                                    {p.idc_medio?.toFixed(3) ?? '–'}
                                                </span>
                                            );
                                            default: return null;
                                        }
                                    }}
                                    empty={{ title: 'Sem dados de produtividade' }}
                                />
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

                    <StandardTable<TurnoverEvent>
                        storageKey="labor:bi:movimentacoes"
                        columns={withOrg(EVENT_COLUMNS)}
                        rows={events}
                        rowKey={ev => ev.id}
                        loading={loadEvents}
                        searchText={ev => `${nomeOrg(ev.org_id)} ${ev.employee_nome ?? ''} ${TIPO_CONFIG[ev.tipo].label} ${ev.motivo ?? ''} ${ev.cargo_saida ?? ''} ${ev.cargo_entrada ?? ''}`}
                        searchPlaceholder="Buscar colaborador, tipo ou motivo..."
                        sortValue={(key, ev) => {
                            switch (key) {
                                case 'org': return nomeOrg(ev.org_id);
                                case 'data': return ev.data_evento;
                                case 'colaborador': return ev.employee_nome ?? '';
                                case 'tipo': return TIPO_CONFIG[ev.tipo].label;
                                case 'detalhe': return ev.cargo_saida || ev.cargo_entrada || ev.origem_ref || '';
                                case 'motivo': return ev.motivo ?? '';
                                default: return null;
                            }
                        }}
                        renderCell={(key, ev) => {
                            const cfg = TIPO_CONFIG[ev.tipo];
                            const Icon = cfg.icon;
                            switch (key) {
                                case 'org': return <span className="text-sm font-normal text-gray-600">{nomeOrg(ev.org_id)}</span>;
                                case 'data': return <span className="text-sm font-normal text-gray-600 whitespace-nowrap">{fmt.date(ev.data_evento)}</span>;
                                case 'colaborador': return <span className="text-sm font-normal text-gray-700">{ev.employee_nome || '–'}</span>;
                                case 'tipo': return (
                                    <span className={`inline-flex items-center gap-1.5 text-sm font-normal ${cfg.color}`}>
                                        <Icon className="w-3 h-3" />
                                        {cfg.label}
                                    </span>
                                );
                                case 'detalhe': return (
                                    <span className="text-sm font-normal text-gray-600">
                                        {ev.cargo_saida && `De: ${ev.cargo_saida}`}
                                        {ev.cargo_entrada && `Para: ${ev.cargo_entrada}`}
                                        {ev.origem_ref && `${ev.origem_ref} → ${ev.destino_ref}`}
                                    </span>
                                );
                                case 'motivo': return <span className="block truncate text-sm font-normal text-gray-600" title={ev.motivo || ''}>{ev.motivo || '–'}</span>;
                                default: return null;
                            }
                        }}
                        actions={{
                            width: 90,
                            render: ev => (
                                <ActionIconButton kind="delete" size="sm" onClick={async () => { const ok = await confirm({ title: 'Excluir movimentação?', message: 'Esta ação não pode ser desfeita.', variant: 'danger', confirmLabel: 'Excluir' }); if (ok) deleteEventMut.mutate(ev.id); }} />
                            ),
                        }}
                        empty={{ icon: <Activity className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhuma movimentação registrada' }}
                    />
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
