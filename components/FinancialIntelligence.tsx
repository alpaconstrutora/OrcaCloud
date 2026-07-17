import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle, BarChart2, Bell, Brain, Calendar, ChevronDown, ChevronUp,
    Loader2, Mail, Pencil, Plus, RefreshCw, Send, ShieldAlert, Trash2, TrendingDown, TrendingUp,
} from 'lucide-react';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { financialIntelligenceService } from '../services/financialIntelligenceService';
import type {
    FinancialAlert, ProjectScorecard, CashflowProjectionPoint,
} from '../services/financialIntelligenceService';
import {
    reportScheduleService,
} from '../services/reportScheduleService';
import type { ReportSchedule, ReportFrequency, ReportType } from '../services/reportScheduleService';
import { KpiCard } from './ui/KpiCard';
import { usePersistedState } from './ui/TableUtils';
import { useConfirm } from './ui/confirm';

// ─── helpers ────────────────────────────────────────────────

function fmt(v: number | null | undefined, compact = false) {
    if (v == null) return '—';
    if (compact && Math.abs(v) >= 1_000_000)
        return (v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' M';
    if (compact && Math.abs(v) >= 1_000)
        return (v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' k';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso: string) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y.slice(2)}`;
}

const SEVERITY_STYLES = {
    HIGH:   { bar: 'bg-red-500',    badge: 'bg-red-50 text-red-700 border-red-200',   icon: 'text-red-500',    label: 'Alto'   },
    MEDIUM: { bar: 'bg-amber-400',  badge: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'text-amber-500', label: 'Médio' },
    LOW:    { bar: 'bg-blue-400',   badge: 'bg-blue-50 text-blue-700 border-blue-200',  icon: 'text-blue-500',   label: 'Baixo'  },
};

const ALERT_TYPE_LABELS: Record<string, string> = {
    CASHFLOW_RISK:          'Risco de Caixa',
    OVERDUE_HIGH:           'Inadimplência Crítica',
    OVERDUE_AGING:          'Taxa de Inadimplência',
    MARGIN_LOW:             'Margem Baixa',
    SUPPLIER_CONCENTRATION: 'Concentração de Fornecedor',
};

const RISCO_COLORS = { HIGH: '#ef4444', MEDIUM: '#f59e0b', OK: '#22c55e' };
const HORIZON_OPTIONS = [
    { label: '30 dias', value: 30 },
    { label: '60 dias', value: 60 },
    { label: '90 dias', value: 90 },
    { label: '180 dias', value: 180 },
];

// ─── sub-components ─────────────────────────────────────────

function AlertCard({ alert }: { alert: FinancialAlert }) {
    const [open, setOpen] = useState(false);
    const s = SEVERITY_STYLES[alert.severity];
    return (
        <div className={`rounded-xl border ${s.badge} overflow-hidden`}>
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-start gap-3 p-4 text-left"
            >
                <ShieldAlert className={`w-4 h-4 mt-0.5 flex-shrink-0 ${s.icon}`} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black uppercase tracking-widest opacity-60">
                            {ALERT_TYPE_LABELS[alert.alert_type] ?? alert.alert_type}
                        </span>
                        <span className={`text-sm font-normal ${s.icon}`}>
                            {s.label}
                        </span>
                    </div>
                    <p className="text-sm font-bold mt-0.5 truncate">{alert.title}</p>
                </div>
                {alert.amount != null && (
                    <span className="font-black text-sm whitespace-nowrap ml-2">
                        {fmt(Math.abs(alert.amount), true)}
                    </span>
                )}
                {open ? <ChevronUp className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
            </button>
            {open && (
                <div className="px-4 pb-4 pt-0 text-xs text-current opacity-80 leading-relaxed border-t border-current/10">
                    {alert.description}
                </div>
            )}
        </div>
    );
}

function CashflowTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number }[]; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs">
            <p className="font-bold text-gray-700 mb-1">{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ color: '#3b82f6' }}>{p.name}: {fmt(p.value)}</p>
            ))}
        </div>
    );
}

// ─── schedule helpers ────────────────────────────────────────

const FREQ_LABEL: Record<ReportFrequency, string> = {
    DAILY: 'Diário', WEEKLY: 'Semanal', MONTHLY: 'Mensal',
};
const DOW_LABEL = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const REPORT_TYPE_LABEL: Record<ReportType, string> = {
    ALERTS: 'Alertas', SCORECARD: 'Scorecard', CASHFLOW: 'Projeção',
};

function scheduleNextRun(s: ReportSchedule): string {
    if (!s.is_active) return 'Inativo';
    const lines = [`${s.hour}h`];
    if (s.frequency === 'WEEKLY'  && s.day_of_week  != null) lines.unshift(DOW_LABEL[s.day_of_week]);
    if (s.frequency === 'MONTHLY' && s.day_of_month != null) lines.unshift(`Dia ${s.day_of_month}`);
    return `${FREQ_LABEL[s.frequency]} · ${lines.join(' ')}`;
}

// ─── Schedule Form ───────────────────────────────────────────

const EMPTY_SCHEDULE: Partial<ReportSchedule> = {
    name: '', frequency: 'WEEKLY', day_of_week: 1, day_of_month: 1, hour: 8,
    recipients: [], report_types: ['ALERTS', 'SCORECARD', 'CASHFLOW'], is_active: true,
};

function ScheduleForm({
    organizationId, initial, onSave, onCancel,
}: {
    organizationId: string;
    initial?: ReportSchedule | null;
    onSave: (s: ReportSchedule) => void;
    onCancel: () => void;
}) {
    const [form, setForm] = useState<Partial<ReportSchedule>>(
        initial ? { ...initial } : { ...EMPTY_SCHEDULE, organization_id: organizationId }
    );
    const [recipientInput, setRecipientInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    function set(k: keyof ReportSchedule, v: unknown) {
        setForm(f => ({ ...f, [k]: v }));
    }

    function toggleType(t: ReportType) {
        const types = form.report_types ?? [];
        set('report_types', types.includes(t) ? types.filter(x => x !== t) : [...types, t]);
    }

    function addRecipient() {
        const email = recipientInput.trim().toLowerCase();
        if (!email || !email.includes('@')) return;
        const list = form.recipients ?? [];
        if (!list.includes(email)) set('recipients', [...list, email]);
        setRecipientInput('');
    }

    function removeRecipient(email: string) {
        set('recipients', (form.recipients ?? []).filter(e => e !== email));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.name?.trim()) { setErr('Nome obrigatório'); return; }
        if (!form.recipients?.length) { setErr('Adicione pelo menos um destinatário'); return; }
        if (!form.report_types?.length) { setErr('Selecione pelo menos um tipo de relatório'); return; }
        setSaving(true); setErr(null);
        try {
            const saved = await reportScheduleService.save({ ...form, organization_id: organizationId } as ReportSchedule);
            onSave(saved);
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Erro ao salvar');
        } finally {
            setSaving(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <h3 className="text-sm font-black text-gray-900">{initial ? 'Editar Agendamento' : 'Novo Agendamento'}</h3>
            {err && <p className="text-xs text-red-600 font-semibold">{err}</p>}

            {/* Nome */}
            <div>
                <label className="text-form-label font-bold text-gray-500 uppercase tracking-widest block mb-1">Nome</label>
                <input
                    value={form.name ?? ''}
                    onChange={e => set('name', e.target.value)}
                    placeholder="Ex: Relatório Semanal da Gestão"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
            </div>

            {/* Frequência + Dia + Hora */}
            <div className="grid grid-cols-3 gap-3">
                <div>
                    <label className="text-form-label font-bold text-gray-500 uppercase tracking-widest block mb-1">Frequência</label>
                    <select
                        value={form.frequency ?? 'WEEKLY'}
                        onChange={e => set('frequency', e.target.value as ReportFrequency)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                        <option value="DAILY">Diário</option>
                        <option value="WEEKLY">Semanal</option>
                        <option value="MONTHLY">Mensal</option>
                    </select>
                </div>
                {form.frequency === 'WEEKLY' && (
                    <div>
                        <label className="text-form-label font-bold text-gray-500 uppercase tracking-widest block mb-1">Dia da Semana</label>
                        <select
                            value={form.day_of_week ?? 1}
                            onChange={e => set('day_of_week', Number(e.target.value))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                        >
                            {DOW_LABEL.map((d, i) => <option key={i} value={i}>{d}</option>)}
                        </select>
                    </div>
                )}
                {form.frequency === 'MONTHLY' && (
                    <div>
                        <label className="text-form-label font-bold text-gray-500 uppercase tracking-widest block mb-1">Dia do Mês</label>
                        <input
                            type="number" min={1} max={28}
                            value={form.day_of_month ?? 1}
                            onChange={e => set('day_of_month', Number(e.target.value))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                    </div>
                )}
                <div>
                    <label className="text-form-label font-bold text-gray-500 uppercase tracking-widest block mb-1">Horário (BRT)</label>
                    <select
                        value={form.hour ?? 8}
                        onChange={e => set('hour', Number(e.target.value))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                        {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Tipos de relatório */}
            <div>
                <label className="text-form-label font-bold text-gray-500 uppercase tracking-widest block mb-2">Incluir no e-mail</label>
                <div className="flex gap-2 flex-wrap">
                    {(['ALERTS', 'SCORECARD', 'CASHFLOW'] as ReportType[]).map(t => {
                        const active = (form.report_types ?? []).includes(t);
                        return (
                            <button
                                key={t} type="button" onClick={() => toggleType(t)}
                                className={`px-3 py-1.5 rounded-lg text-form-label font-black transition-all ${
                                    active ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                }`}
                            >
                                {REPORT_TYPE_LABEL[t]}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Destinatários */}
            <div>
                <label className="text-button font-bold text-gray-500 uppercase tracking-widest block mb-1">Destinatários</label>
                <div className="flex gap-2">
                    <input
                        value={recipientInput}
                        onChange={e => setRecipientInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRecipient(); } }}
                        placeholder="email@exemplo.com"
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <button
                        type="button" onClick={addRecipient}
                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                        <Plus className="w-4 h-4 text-gray-600" />
                    </button>
                </div>
                {(form.recipients ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {(form.recipients ?? []).map(email => (
                            <span key={email} className="flex items-center gap-1 bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-2.5 py-1 text-xs font-semibold">
                                <Mail className="w-3 h-3" />
                                {email}
                                <button type="button" onClick={() => removeRecipient(email)} className="hover:text-violet-900 ml-0.5">×</button>
                            </span>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex gap-2 pt-2">
                <button
                    type="submit" disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-black hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    {initial ? 'Salvar' : 'Criar Agendamento'}
                </button>
                <button type="button" onClick={onCancel} className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm font-semibold">
                    Cancelar
                </button>
            </div>
        </form>
    );
}

// ─── Schedule Card ───────────────────────────────────────────

function ScheduleCard({
    schedule, onEdit, onDelete, onToggle, onSendNow,
}: {
    schedule: ReportSchedule;
    onEdit: () => void;
    onDelete: () => void;
    onToggle: () => void;
    onSendNow: () => void;
}) {
    return (
        <div className={`bg-white rounded-2xl border p-4 flex items-start gap-4 transition-opacity ${!schedule.is_active ? 'opacity-60' : 'border-gray-100'}`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${schedule.is_active ? 'bg-violet-100' : 'bg-gray-100'}`}>
                <Calendar className={`w-4.5 h-4.5 ${schedule.is_active ? 'text-violet-600' : 'text-gray-400'}`} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-gray-900 truncate">{schedule.name}</p>
                    {!schedule.is_active && (
                        <span className="text-[9px] font-black uppercase px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">Pausado</span>
                    )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{scheduleNextRun(schedule)}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                    {schedule.report_types.map(t => (
                        <span key={t} className="text-[9px] font-black uppercase px-1.5 py-0.5 bg-violet-50 text-violet-700 rounded">
                            {REPORT_TYPE_LABEL[t as ReportType]}
                        </span>
                    ))}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                    {schedule.recipients.map(e => (
                        <span key={e} className="text-[9px] text-gray-400 font-mono">{e}</span>
                    ))}
                </div>
                {schedule.last_sent_at && (
                    <p className="text-xs text-gray-400 mt-1">
                        Último envio: {new Date(schedule.last_sent_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
                <button
                    onClick={onSendNow} title="Enviar agora"
                    className="p-1.5 hover:bg-violet-50 rounded-lg transition-colors text-violet-600"
                >
                    <Send className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={onToggle} title={schedule.is_active ? 'Pausar' : 'Ativar'}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    <Bell className={`w-3.5 h-3.5 ${schedule.is_active ? 'text-gray-500' : 'text-gray-300'}`} />
                </button>
                <button onClick={onEdit} title="Editar" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                    <Pencil className="w-3.5 h-3.5 text-gray-400" />
                </button>
                <button onClick={onDelete} title="Excluir" className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
            </div>
        </div>
    );
}

// ─── tabs ────────────────────────────────────────────────────

type Tab = 'alertas' | 'obras' | 'projecao' | 'agendamento';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'alertas',     label: 'Alertas',            icon: ShieldAlert  },
    { id: 'obras',       label: 'Scorecard de Obras',  icon: BarChart2    },
    { id: 'projecao',    label: 'Projeção de Caixa',   icon: TrendingUp   },
    { id: 'agendamento', label: 'Agendamentos',         icon: Calendar     },
];

// ─── main ────────────────────────────────────────────────────

interface Props {
    organizationId: string | null;
    onNavigate?: (view: string) => void;
}

export default function FinancialIntelligence({ organizationId, onNavigate }: Props) {
    const confirm = useConfirm();
    const [tab, setTab]               = usePersistedState<Tab>('financialIntelligence:tab', 'alertas');
    const [alerts, setAlerts]         = useState<FinancialAlert[]>([]);
    const [scorecards, setScorecards] = useState<ProjectScorecard[]>([]);
    const [projection, setProjection] = useState<CashflowProjectionPoint[]>([]);
    const [horizon, setHorizon]       = usePersistedState('financialIntelligence:horizon', 90);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState<string | null>(null);

    // ── Agendamentos ──────────────────────────────────────────
    const [schedules, setSchedules]         = useState<ReportSchedule[]>([]);
    const [schedLoading, setSchedLoading]   = useState(false);
    const [schedError, setSchedError]       = useState<string | null>(null);
    const [showForm, setShowForm]           = useState(false);
    const [editTarget, setEditTarget]       = useState<ReportSchedule | null>(null);
    const [sendingId, setSendingId]         = useState<string | null>(null);
    const [sendMsg, setSendMsg]             = useState<string | null>(null);

    // Em "Todas as organizações" editar usa a org do próprio agendamento;
    // só criar um novo exige que o usuário escolha uma.
    const scheduleFormOrganizationId = organizationId || editTarget?.organization_id;

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [a, s, p] = await Promise.all([
                financialIntelligenceService.getAlerts(organizationId),
                financialIntelligenceService.getProjectScorecards(organizationId),
                financialIntelligenceService.getCashflowProjection(organizationId, horizon),
            ]);
            setAlerts(a);
            setScorecards(s);
            setProjection(p);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao carregar');
        } finally {
            setLoading(false);
        }
    }, [organizationId, horizon]);

    useEffect(() => { load(); }, [load]);

    const loadSchedules = useCallback(async () => {
        if (!organizationId) return;
        setSchedLoading(true); setSchedError(null);
        try { setSchedules(await reportScheduleService.list(organizationId)); }
        catch (e) { setSchedError(e instanceof Error ? e.message : 'Erro'); }
        finally { setSchedLoading(false); }
    }, [organizationId]);

    useEffect(() => { if (tab === 'agendamento') loadSchedules(); }, [tab, loadSchedules]);

    async function handleScheduleSave(s: ReportSchedule) {
        setSchedules(prev => prev.some(x => x.id === s.id) ? prev.map(x => x.id === s.id ? s : x) : [...prev, s]);
        setShowForm(false); setEditTarget(null);
    }

    async function handleDelete(id: string) {
        const ok = await confirm({ title: 'Excluir agendamento?', variant: 'danger', confirmLabel: 'Excluir' });
        if (!ok) return;
        await reportScheduleService.remove(id);
        setSchedules(prev => prev.filter(s => s.id !== id));
    }

    async function handleToggle(s: ReportSchedule) {
        await reportScheduleService.toggleActive(s.id, !s.is_active);
        setSchedules(prev => prev.map(x => x.id === s.id ? { ...x, is_active: !x.is_active } : x));
    }

    async function handleSendNow(s: ReportSchedule) {
        setSendingId(s.id); setSendMsg(null);
        try {
            const r = await reportScheduleService.sendNow(s.organization_id, s.id);
            setSendMsg(r.message);
            setSchedules(prev => prev.map(x => x.id === s.id ? { ...x, last_sent_at: new Date().toISOString() } : x));
        } catch (e) {
            setSendMsg(`Erro: ${e instanceof Error ? e.message : 'Falha no envio'}`);
        } finally {
            setSendingId(null);
        }
    }

    const summary = useMemo(() => {
        const high   = alerts.filter(a => a.severity === 'HIGH').length;
        const medium = alerts.filter(a => a.severity === 'MEDIUM').length;
        const obrasRisco  = scorecards.filter(s => s.risco !== 'OK').length;
        const margemMedia = scorecards.length > 0
            ? scorecards.reduce((acc, s) => acc + s.margem_pct, 0) / scorecards.length
            : 0;
        const saldoFinal = projection.length > 0 ? projection[projection.length - 1].saldo_acum : 0;
        return { high, medium, obrasRisco, margemMedia, saldoFinal };
    }, [alerts, scorecards, projection]);

    const projectionSampled = useMemo(() => {
        if (projection.length <= 30) return projection;
        const step = Math.ceil(projection.length / 30);
        return projection.filter((_, i) => i % step === 0 || i === projection.length - 1);
    }, [projection]);

    return (
        <div className="h-full flex flex-col bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center">
                            <Brain className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">Inteligência Financeira</h1>
                            <p className="text-xs text-gray-500">Alertas automáticos, scorecard de obras e projeção de caixa</p>
                        </div>
                    </div>
                    <button
                        onClick={load}
                        className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                        title="Atualizar"
                    >
                        <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {/* KPI summary row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <KpiCard
                        label="Alertas Críticos"
                        value={String(summary.high)}
                        sub={`${summary.medium} médios`}
                        icon={<ShieldAlert className="w-5 h-5" />}
                        color={summary.high > 0 ? 'red' : 'gray'}
                    />
                    <KpiCard
                        label="Obras em Risco"
                        value={String(summary.obrasRisco)}
                        sub={`de ${scorecards.length} obras ativas`}
                        icon={<AlertTriangle className="w-5 h-5" />}
                        color={summary.obrasRisco > 0 ? 'amber' : 'gray'}
                    />
                    <KpiCard
                        label="Margem Média"
                        value={`${summary.margemMedia.toFixed(1)}%`}
                        sub="média das obras ativas"
                        icon={<BarChart2 className="w-5 h-5" />}
                        color={summary.margemMedia < 10 ? 'red' : summary.margemMedia < 20 ? 'amber' : 'emerald'}
                    />
                    <KpiCard
                        label={`Saldo Projetado (${horizon}d)`}
                        value={fmt(summary.saldoFinal, true)}
                        icon={summary.saldoFinal < 0 ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
                        color={summary.saldoFinal < 0 ? 'red' : 'emerald'}
                    />
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white border-b border-gray-100 px-6 flex-shrink-0">
                <div className="flex gap-1">
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex items-center gap-2 px-4 py-3 text-button font-black uppercase tracking-widest border-b-2 transition-all ${
                                tab === t.id
                                    ? 'border-violet-600 text-violet-700'
                                    : 'border-transparent text-gray-400 hover:text-gray-700'
                            }`}
                        >
                            <t.icon className="w-3.5 h-3.5" />
                            {t.label}
                            {t.id === 'alertas' && alerts.length > 0 && (
                                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                                    summary.high > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                                }`}>
                                    {alerts.length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                {error && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-semibold">{error}</div>
                )}
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                    </div>
                ) : (
                    <>
                        {/* ── Tab: Alertas ─────────────────────────── */}
                        {tab === 'alertas' && (
                            <div className="max-w-2xl space-y-3">
                                {alerts.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                                        <ShieldAlert className="w-10 h-10 mb-3 opacity-30" />
                                        <p className="text-sm font-semibold">Nenhum alerta ativo</p>
                                        <p className="text-xs mt-1">Todos os indicadores estão dentro dos limites</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex gap-3 mb-4">
                                            {(['HIGH','MEDIUM','LOW'] as const).map(sev => {
                                                const cnt = alerts.filter(a => a.severity === sev).length;
                                                if (!cnt) return null;
                                                const s = SEVERITY_STYLES[sev];
                                                return (
                                                    <div key={sev} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold ${s.badge}`}>
                                                        <span className={`w-2 h-2 rounded-full ${s.bar}`} />
                                                        {cnt} {s.label}{cnt > 1 ? 's' : ''}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {alerts.map((a, i) => <AlertCard key={i} alert={a} />)}
                                    </>
                                )}
                            </div>
                        )}

                        {/* ── Tab: Obras ───────────────────────────── */}
                        {tab === 'obras' && (
                            <div className="space-y-4">
                                {scorecards.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                                        <BarChart2 className="w-10 h-10 mb-3 opacity-30" />
                                        <p className="text-sm font-semibold">Nenhuma obra com dados financeiros</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Gráfico de margem por obra */}
                                        <div className="bg-white rounded-2xl border border-gray-100 p-5">
                                            <h3 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-4">
                                                Margem por Obra (%)
                                            </h3>
                                            <ResponsiveContainer width="100%" height={220}>
                                                <BarChart
                                                    data={scorecards.slice(0, 10)}
                                                    layout="vertical"
                                                    margin={{ top: 0, right: 60, left: 0, bottom: 0 }}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                                                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                                                    <YAxis type="category" dataKey="project_name" tick={{ fontSize: 10 }} width={120} />
                                                    <Tooltip formatter={(v: unknown) => [`${(v as number).toFixed(1)}%`, 'Margem']} />
                                                    <Bar dataKey="margem_pct" radius={[0, 4, 4, 0]}>
                                                        {scorecards.slice(0, 10).map((s, i) => (
                                                            <Cell key={i} fill={s.margem_pct < 0 ? '#ef4444' : s.margem_pct < 10 ? '#f59e0b' : '#22c55e'} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>

                                        {/* Tabela de scorecards */}
                                        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-50 text-gray-500 font-semibold uppercase text-xs tracking-wider border-b border-gray-200">
                                                    <tr>
                                                        {['Obra', 'Receita Real.', 'Custo Real.', 'Margem', 'AR Pendente', 'AP Pendente', 'Saldo Proj.', 'Risco'].map(h => (
                                                            <th key={h} className="px-4 py-3 text-left whitespace-nowrap">
                                                                {h}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {scorecards.map(s => (
                                                        <tr key={s.project_id} className="hover:bg-gray-50 transition-colors">
                                                            <td className="px-4 py-3 text-sm font-normal text-gray-900 max-w-[180px] truncate">{s.project_name}</td>
                                                            <td className="px-4 py-3 text-sm font-normal text-gray-700 whitespace-nowrap">{fmt(s.receita_realizada, true)}</td>
                                                            <td className="px-4 py-3 text-sm font-normal text-gray-700 whitespace-nowrap">{fmt(s.custo_realizado, true)}</td>
                                                            <td className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${s.margem_pct < 0 ? 'text-red-600' : s.margem_pct < 10 ? 'text-amber-600' : 'text-green-700'}`}>
                                                                {s.margem_pct.toFixed(1)}%
                                                            </td>
                                                            <td className="px-4 py-3 text-sm font-normal text-blue-700 whitespace-nowrap">{fmt(s.ar_pendente, true)}</td>
                                                            <td className="px-4 py-3 text-sm font-normal text-orange-700 whitespace-nowrap">{fmt(s.ap_pendente, true)}</td>
                                                            <td className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${s.saldo_projetado < 0 ? 'text-red-600' : 'text-green-700'}`}>
                                                                {fmt(s.saldo_projetado, true)}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <span
                                                                    className="inline-block w-2.5 h-2.5 rounded-full"
                                                                    style={{ backgroundColor: RISCO_COLORS[s.risco] }}
                                                                    title={s.risco}
                                                                />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* ── Tab: Agendamento ─────────────────────── */}
                        {tab === 'agendamento' && (
                            <div className="max-w-2xl space-y-4">
                                {/* Feedback de envio */}
                                {sendMsg && (
                                    <div className={`p-3 rounded-xl text-sm font-semibold border ${
                                        sendMsg.startsWith('Erro') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'
                                    }`}>
                                        {sendMsg}
                                    </div>
                                )}

                                {/* Header ação */}
                                <div className="flex items-center justify-between">
                                    <p className="text-xs text-gray-500">Relatórios enviados automaticamente por e-mail com alertas, scorecard e projeção.</p>
                                    {!showForm && !editTarget && (
                                        <button
                                            onClick={() => { setShowForm(true); setEditTarget(null); setSendMsg(null); }}
                                            disabled={!organizationId}
                                            title={!organizationId ? 'Selecione uma organização específica para criar um agendamento' : undefined}
                                            className="flex items-center gap-2 px-3 py-2 bg-violet-600 text-white rounded-xl text-button font-black hover:bg-violet-700 transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            Novo
                                        </button>
                                    )}
                                </div>

                                {/* Formulário */}
                                {(showForm || editTarget) && scheduleFormOrganizationId && (
                                    <ScheduleForm
                                        organizationId={scheduleFormOrganizationId}
                                        initial={editTarget}
                                        onSave={handleScheduleSave}
                                        onCancel={() => { setShowForm(false); setEditTarget(null); }}
                                    />
                                )}

                                {/* Lista */}
                                {schedLoading ? (
                                    <div className="flex items-center justify-center py-10">
                                        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                                    </div>
                                ) : schedError ? (
                                    <p className="text-sm text-red-600">{schedError}</p>
                                ) : schedules.length === 0 && !showForm ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                                        <Calendar className="w-10 h-10 mb-3 opacity-30" />
                                        <p className="text-sm font-semibold">Nenhum agendamento configurado</p>
                                        <p className="text-xs mt-1">Crie um agendamento para receber relatórios por e-mail</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {schedules.map(s => (
                                            <div key={s.id} className="relative">
                                                {sendingId === s.id && (
                                                    <div className="absolute inset-0 bg-white/70 rounded-2xl flex items-center justify-center z-10">
                                                        <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
                                                    </div>
                                                )}
                                                <ScheduleCard
                                                    schedule={s}
                                                    onEdit={() => { setEditTarget(s); setShowForm(false); setSendMsg(null); }}
                                                    onDelete={() => handleDelete(s.id)}
                                                    onToggle={() => handleToggle(s)}
                                                    onSendNow={() => handleSendNow(s)}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Instrução cron */}
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
                                    <p className="font-black mb-1">Ativar disparos automáticos</p>
                                    <p>No Supabase Dashboard → Database → Cron Jobs, crie um job com frequência <code className="bg-amber-100 px-1 rounded">0 * * * *</code> chamando a função <code className="bg-amber-100 px-1 rounded">financial-report-notifier</code>.</p>
                                </div>
                            </div>
                        )}

                        {/* ── Tab: Projeção ────────────────────────── */}
                        {tab === 'projecao' && (
                            <div className="space-y-4">
                                {/* Horizon selector */}
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-gray-500">Horizonte:</span>
                                    {HORIZON_OPTIONS.map(h => (
                                        <button
                                            key={h.value}
                                            onClick={() => setHorizon(h.value)}
                                            className={`px-3 py-1.5 rounded-lg text-button font-black transition-all ${
                                                horizon === h.value
                                                    ? 'bg-violet-600 text-white'
                                                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                                            }`}
                                        >
                                            {h.label}
                                        </button>
                                    ))}
                                </div>

                                {projection.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                                        <TrendingDown className="w-10 h-10 mb-3 opacity-30" />
                                        <p className="text-sm font-semibold">Sem títulos pendentes para projetar</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Saldo acumulado */}
                                        <div className="bg-white rounded-2xl border border-gray-100 p-5">
                                            <h3 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-4">
                                                Saldo Acumulado Projetado
                                            </h3>
                                            <ResponsiveContainer width="100%" height={240}>
                                                <AreaChart data={projectionSampled} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                                                    <defs>
                                                        <linearGradient id="grad-acum" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.15} />
                                                            <stop offset="95%" stopColor="#7c3aed" stopOpacity={0}    />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                                    <XAxis dataKey="data_ref" tickFormatter={fmtDate} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                                                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmt(v, true)} width={72} />
                                                    <Tooltip content={<CashflowTooltip />} formatter={(v: unknown) => fmt(v as number)} labelFormatter={(iso: unknown) => fmtDate(iso as string)} />
                                                    <Area
                                                        type="monotone"
                                                        dataKey="saldo_acum"
                                                        name="Saldo Acumulado"
                                                        stroke="#7c3aed"
                                                        strokeWidth={2}
                                                        fill="url(#grad-acum)"
                                                        dot={false}
                                                    />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>

                                        {/* Entradas vs Saídas diárias */}
                                        <div className="bg-white rounded-2xl border border-gray-100 p-5">
                                            <h3 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-4">
                                                Entradas × Saídas por Dia
                                            </h3>
                                            <ResponsiveContainer width="100%" height={180}>
                                                <BarChart data={projectionSampled} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                                    <XAxis dataKey="data_ref" tickFormatter={fmtDate} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                                                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmt(v, true)} width={72} />
                                                    <Tooltip formatter={(v: unknown) => fmt(v as number)} labelFormatter={(iso: unknown) => fmtDate(iso as string)} />
                                                    <Bar dataKey="cr_previsto" name="Entradas" fill="#22c55e" radius={[2, 2, 0, 0]} stackId="a" />
                                                    <Bar dataKey="db_previsto" name="Saídas"   fill="#f97316" radius={[2, 2, 0, 0]} stackId="b" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>

                                        {/* Resumo final */}
                                        <div className="grid grid-cols-3 gap-3">
                                            {[
                                                { label: 'Total Previsto Entrar',  value: projection.reduce((a, p) => a + p.cr_previsto, 0), color: 'text-green-700' },
                                                { label: 'Total Previsto Sair',    value: projection.reduce((a, p) => a + p.db_previsto, 0), color: 'text-orange-700' },
                                                { label: `Saldo Final (${horizon}d)`, value: summary.saldoFinal, color: summary.saldoFinal < 0 ? 'text-red-600' : 'text-violet-700' },
                                            ].map(k => (
                                                <div key={k.label} className="bg-white rounded-xl border border-gray-100 p-4">
                                                    <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-1">{k.label}</p>
                                                    <p className={`text-base font-black ${k.color}`}>{fmt(k.value, true)}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
