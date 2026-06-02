import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Gift, Plus, Users, User, Check, X, AlertTriangle, ShieldAlert,
    Loader2, Trophy, Calculator, Zap, Trash2, Power, Paperclip,
    TrendingUp, Building2, Play, Info, Search,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
    incentiveService, IncentiveEvent, HabitualityFlag, IncentiveRule,
    RuleType, RuleScope, ApprovalStatus, PerformanceRow, RuleRunResult,
} from '../services/incentiveService';
import { PayrollRubric } from '../services/payrollService';

// ─── Tipos de props ─────────────────────────────────────────
interface EmployeeLite { id: string; name: string; status?: string }
interface TeamLite { id: string; name: string }
interface ProjectLite { id: string; name?: string; title?: string }

interface Props {
    orgId: string;
    employees: EmployeeLite[];
    teams: TeamLite[];
    projects: ProjectLite[];
}

type SubTab = 'launch' | 'approvals' | 'habituality' | 'rules' | 'performance' | 'simulator';

const brl = (v: number) => `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().split('T')[0];
const monthStartStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };

const STATUS_STYLE: Record<ApprovalStatus, string> = {
    RASCUNHO: 'bg-slate-100 text-slate-500 border-slate-200',
    PENDENTE: 'bg-amber-50 text-amber-600 border-amber-100',
    APROVADO: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    REJEITADO: 'bg-rose-50 text-rose-600 border-rose-100',
};

const RULE_TYPES: { id: RuleType; label: string }[] = [
    { id: 'ASSIDUIDADE', label: 'Assiduidade' },
    { id: 'PRODUTIVIDADE', label: 'Produtividade' },
    { id: 'SEGURANCA', label: 'Segurança' },
    { id: 'PRAZO', label: 'Prazo' },
    { id: 'META_OBRA', label: 'Meta da Obra' },
    { id: 'QUALIDADE', label: 'Qualidade' },
    { id: 'RETENCAO', label: 'Retenção' },
];

const projName = (p: ProjectLite) => p.name || p.title || '';

// ════════════════════════════════════════════════════════════
const LaborIncentivos: React.FC<Props> = ({ orgId, employees, teams, projects }) => {
    const [tab, setTab] = useState<SubTab>('launch');
    const [rubrics, setRubrics] = useState<PayrollRubric[]>([]);

    useEffect(() => { incentiveService.listIncentiveRubrics().then(setRubrics).catch(console.error); }, []);

    const tabs: { id: SubTab; label: string; icon: React.ElementType }[] = [
        { id: 'launch', label: 'Lançamentos', icon: Plus },
        { id: 'approvals', label: 'Aprovações', icon: Check },
        { id: 'habituality', label: 'Habitualidade', icon: ShieldAlert },
        { id: 'rules', label: 'Regras', icon: Zap },
        { id: 'performance', label: 'Performance', icon: Trophy },
        { id: 'simulator', label: 'Simulador', icon: Calculator },
    ];

    if (!orgId) {
        return (
            <div className="p-12 text-center bg-white rounded-3xl border border-slate-100">
                <Building2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Selecione uma organização específica para gerir incentivos.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-200">
                    <Gift className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Incentivos &amp; Produtividade</h2>
                    <p className="text-slate-400 text-[11px] font-bold uppercase tracking-widest">Gratificações, metas e proteção contra habitualidade</p>
                </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
                {tabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${tab === t.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
                    >
                        <t.icon size={14} /> {t.label}
                    </button>
                ))}
            </div>

            {tab === 'launch' && <LaunchTab orgId={orgId} employees={employees} teams={teams} projects={projects} rubrics={rubrics} />}
            {tab === 'approvals' && <ApprovalsTab orgId={orgId} />}
            {tab === 'habituality' && <HabitualityTab orgId={orgId} />}
            {tab === 'rules' && <RulesTab orgId={orgId} projects={projects} rubrics={rubrics} />}
            {tab === 'performance' && <PerformanceTab orgId={orgId} />}
            {tab === 'simulator' && <SimulatorTab projects={projects} />}
        </div>
    );
};

// ─── Card wrapper ───────────────────────────────────────────
const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div className={`bg-white rounded-3xl border border-slate-100 shadow-sm p-6 ${className}`}>{children}</div>
);
const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">{children}</label>
);
const inputCls = 'w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all outline-none';

// ════════════════════════════════════════════════════════════
// 1) LANÇAMENTOS
// ════════════════════════════════════════════════════════════
const LaunchTab: React.FC<{ orgId: string; employees: EmployeeLite[]; teams: TeamLite[]; projects: ProjectLite[]; rubrics: PayrollRubric[] }> =
({ orgId, employees, teams, projects, rubrics }) => {
    const [mode, setMode] = useState<'individual' | 'collective'>('individual');
    const [rubricCode, setRubricCode] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [teamId, setTeamId] = useState('');
    const [projectId, setProjectId] = useState('');
    const [amount, setAmount] = useState(0);
    const [distMode, setDistMode] = useState<'equal' | 'per_member'>('per_member');
    const [justification, setJustification] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const [recent, setRecent] = useState<IncentiveEvent[]>([]);
    const [msg, setMsg] = useState<string | null>(null);

    const activeEmployees = useMemo(() => employees.filter(e => e.status !== 'DESLIGADO' && e.status !== 'INATIVO'), [employees]);

    const loadRecent = useCallback(() => {
        incentiveService.listEvents(orgId).then(r => setRecent(r.slice(0, 25))).catch(console.error);
    }, [orgId]);
    useEffect(() => { loadRecent(); }, [loadRecent]);

    const uploadAttachment = async (): Promise<string | null> => {
        if (!file) return null;
        const path = `${orgId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
        const { error } = await supabase.storage.from('incentive-evidence').upload(path, file);
        if (error) throw error;
        return supabase.storage.from('incentive-evidence').getPublicUrl(path).data.publicUrl;
    };

    const handleSubmit = async () => {
        setMsg(null);
        if (!rubricCode) return setMsg('Selecione o tipo de incentivo.');
        if (!justification.trim()) return setMsg('A justificativa é obrigatória.');
        if (amount <= 0) return setMsg('Informe um valor maior que zero.');
        if (mode === 'individual' && !employeeId) return setMsg('Selecione o colaborador.');
        if (mode === 'collective' && !teamId) return setMsg('Selecione a equipe.');

        setSaving(true);
        try {
            const attachment_url = await uploadAttachment();
            const rubric = rubrics.find(r => r.code === rubricCode);
            const desc = rubric?.name || rubricCode;
            if (mode === 'individual') {
                await incentiveService.launchIndividual({
                    org_id: orgId, employee_id: employeeId, rubric_code: rubricCode, amount,
                    description: desc, justification, project_id: projectId || null, attachment_url,
                });
                setMsg('✓ Incentivo lançado e enviado para aprovação.');
            } else {
                const res = await incentiveService.launchCollective({
                    org_id: orgId, team_id: teamId, rubric_code: rubricCode, total_amount: amount,
                    mode: distMode, description: desc, justification, attachment_url,
                });
                setMsg(`✓ ${res.count} lançamentos criados para a equipe (aprovação pendente).`);
            }
            setAmount(0); setJustification(''); setFile(null);
            loadRecent();
        } catch (e) {
            setMsg(`Erro: ${(e as Error).message}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Form */}
            <Card className="lg:col-span-2 space-y-4">
                <div className="flex gap-2">
                    {(['individual', 'collective'] as const).map(m => (
                        <button key={m} onClick={() => setMode(m)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest border transition-all ${mode === m ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-100'}`}>
                            {m === 'individual' ? <User size={14} /> : <Users size={14} />}
                            {m === 'individual' ? 'Individual' : 'Coletivo'}
                        </button>
                    ))}
                </div>

                <div>
                    <Label>Tipo de Incentivo</Label>
                    <select className={inputCls} value={rubricCode} onChange={e => setRubricCode(e.target.value)}>
                        <option value="">Selecione...</option>
                        {rubrics.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
                    </select>
                </div>

                {mode === 'individual' ? (
                    <>
                        <div>
                            <Label>Colaborador</Label>
                            <select className={inputCls} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
                                <option value="">Selecione...</option>
                                {activeEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <Label>Obra (opcional)</Label>
                            <select className={inputCls} value={projectId} onChange={e => setProjectId(e.target.value)}>
                                <option value="">— Sem obra —</option>
                                {projects.map(p => <option key={p.id} value={p.id}>{projName(p)}</option>)}
                            </select>
                        </div>
                        <div>
                            <Label>Valor (R$)</Label>
                            <input type="number" step="0.01" className={inputCls} value={amount || ''} onChange={e => setAmount(parseFloat(e.target.value) || 0)} />
                        </div>
                    </>
                ) : (
                    <>
                        <div>
                            <Label>Equipe</Label>
                            <select className={inputCls} value={teamId} onChange={e => setTeamId(e.target.value)}>
                                <option value="">Selecione...</option>
                                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <Label>Distribuição</Label>
                            <div className="flex gap-2">
                                {([['per_member', 'Valor por pessoa'], ['equal', 'Rateio do total']] as const).map(([v, l]) => (
                                    <button key={v} onClick={() => setDistMode(v)}
                                        className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${distMode === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-400 border-slate-100'}`}>
                                        {l}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <Label>{distMode === 'equal' ? 'Valor total a ratear (R$)' : 'Valor por colaborador (R$)'}</Label>
                            <input type="number" step="0.01" className={inputCls} value={amount || ''} onChange={e => setAmount(parseFloat(e.target.value) || 0)} />
                        </div>
                    </>
                )}

                <div>
                    <Label>Justificativa (obrigatória)</Label>
                    <textarea className={`${inputCls} h-20 resize-none`} value={justification} onChange={e => setJustification(e.target.value)} placeholder="Motivo do incentivo, meta atingida, etc." />
                </div>

                <div>
                    <Label>Comprovante (opcional)</Label>
                    <label className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-all">
                        <Paperclip size={14} className="text-slate-400" />
                        <span className="text-xs font-bold text-slate-500 truncate">{file ? file.name : 'Anexar arquivo'}</span>
                        <input type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
                    </label>
                </div>

                {msg && (
                    <div className={`p-3 rounded-xl text-xs font-bold ${msg.startsWith('✓') ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{msg}</div>
                )}

                <button onClick={handleSubmit} disabled={saving}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus size={16} />} Lançar Incentivo
                </button>
            </Card>

            {/* Recent */}
            <Card className="lg:col-span-3">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4">Lançamentos Recentes</h3>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {recent.length === 0 && <p className="text-center py-10 text-slate-300 text-xs font-bold uppercase">Nenhum lançamento ainda</p>}
                    {recent.map(ev => (
                        <div key={ev.id} className="flex items-center justify-between p-3 bg-slate-50/60 rounded-xl border border-slate-100">
                            <div className="min-w-0">
                                <p className="text-xs font-black text-slate-800 truncate">{ev.employee_name || ev.employee_id}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate">{ev.description} • {ev.reference_date}</p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <span className="text-xs font-black text-indigo-600">{brl(ev.amount)}</span>
                                <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${STATUS_STYLE[ev.approval_status]}`}>{ev.approval_status}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
};

// ════════════════════════════════════════════════════════════
// 2) APROVAÇÕES
// ════════════════════════════════════════════════════════════
const ApprovalsTab: React.FC<{ orgId: string }> = ({ orgId }) => {
    const [pending, setPending] = useState<IncentiveEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        incentiveService.listEvents(orgId, { status: 'PENDENTE' })
            .then(setPending).catch(console.error).finally(() => setLoading(false));
    }, [orgId]);
    useEffect(() => { load(); }, [load]);

    const act = async (fn: () => Promise<void>, id: string) => {
        setBusy(id);
        try { await fn(); load(); } catch (e) { alert((e as Error).message); } finally { setBusy(null); }
    };

    const total = pending.reduce((s, e) => s + e.amount, 0);

    if (loading) return <Card><div className="flex justify-center py-10"><Loader2 className="animate-spin text-indigo-500" /></div></Card>;

    return (
        <Card>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Aguardando Aprovação ({pending.length})</h3>
                <span className="text-xs font-black text-amber-600">{brl(total)} em aberto</span>
            </div>
            {pending.length === 0 ? (
                <p className="text-center py-10 text-slate-300 text-xs font-bold uppercase">Nada pendente 🎉</p>
            ) : (
                <div className="space-y-2">
                    {pending.map(ev => (
                        <div key={ev.id} className="flex items-center justify-between gap-3 p-4 bg-amber-50/40 rounded-2xl border border-amber-100">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-black text-slate-800 truncate">{ev.employee_name || ev.employee_id} — <span className="text-indigo-600">{brl(ev.amount)}</span></p>
                                <p className="text-[11px] font-bold text-slate-500 truncate">{ev.description} • {ev.reference_date}</p>
                                {ev.justification && <p className="text-[11px] text-slate-400 italic truncate">"{ev.justification}"</p>}
                                {ev.attachment_url && <a href={ev.attachment_url} target="_blank" rel="noreferrer" className="text-[10px] font-black text-indigo-500 uppercase flex items-center gap-1 mt-0.5"><Paperclip size={10} /> Comprovante</a>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button disabled={busy === ev.id} onClick={() => act(() => incentiveService.approveEvent(ev.id!), ev.id!)}
                                    className="p-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-all disabled:opacity-50" title="Aprovar">
                                    {busy === ev.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check size={16} />}
                                </button>
                                <button disabled={busy === ev.id} onClick={() => {
                                    const reason = prompt('Motivo da rejeição:');
                                    if (reason) act(() => incentiveService.rejectEvent(ev.id!, reason), ev.id!);
                                }}
                                    className="p-2.5 bg-white text-rose-500 border border-rose-100 rounded-xl hover:bg-rose-50 transition-all disabled:opacity-50" title="Rejeitar">
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
};

// ════════════════════════════════════════════════════════════
// 3) HABITUALIDADE
// ════════════════════════════════════════════════════════════
const HabitualityTab: React.FC<{ orgId: string }> = ({ orgId }) => {
    const [windowMonths, setWindowMonths] = useState(6);
    const [threshold, setThreshold] = useState(3);
    const [flags, setFlags] = useState<HabitualityFlag[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(() => {
        setLoading(true);
        incentiveService.computeHabituality(orgId, windowMonths, threshold)
            .then(setFlags).catch(console.error).finally(() => setLoading(false));
    }, [orgId, windowMonths, threshold]);
    useEffect(() => { load(); }, [load]);

    const habituals = flags.filter(f => f.is_habitual);
    const totalReflexo = habituals.reduce((s, f) => s + f.estimated_annual_reflexo, 0);

    return (
        <div className="space-y-4">
            <Card className="bg-gradient-to-br from-rose-50 to-white border-rose-100">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-rose-100 rounded-2xl"><ShieldAlert className="w-6 h-6 text-rose-600" /></div>
                    <div className="flex-1">
                        <h3 className="text-sm font-black text-rose-900 uppercase tracking-tight">Guarda de Habitualidade</h3>
                        <p className="text-[11px] font-bold text-rose-500 mt-0.5">
                            {habituals.length} incentivo(s) viraram verba habitual — risco de reflexos (FGTS, INSS, 13º, férias).
                            Passivo anual estimado: <strong>{brl(totalReflexo)}</strong>.
                        </p>
                    </div>
                </div>
            </Card>

            <Card>
                <div className="flex flex-wrap items-end gap-4 mb-4">
                    <div>
                        <Label>Janela (meses)</Label>
                        <input type="number" min={2} max={12} className={`${inputCls} w-28`} value={windowMonths} onChange={e => setWindowMonths(Math.max(2, parseInt(e.target.value) || 6))} />
                    </div>
                    <div>
                        <Label>Limiar p/ habitual</Label>
                        <input type="number" min={2} max={12} className={`${inputCls} w-28`} value={threshold} onChange={e => setThreshold(Math.max(2, parseInt(e.target.value) || 3))} />
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mb-3">Pago em ≥ {threshold} dos últimos {windowMonths} meses → habitual</p>
                </div>

                {loading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-indigo-500" /></div> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                                    <th className="py-3 px-2">Colaborador</th>
                                    <th className="py-3 px-2">Incentivo</th>
                                    <th className="py-3 px-2 text-center">Meses pagos</th>
                                    <th className="py-3 px-2 text-right">Média mensal</th>
                                    <th className="py-3 px-2 text-right">Reflexo anual est.</th>
                                    <th className="py-3 px-2 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {flags.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-slate-300 text-xs font-bold uppercase">Sem incentivos no período</td></tr>}
                                {flags.map((f, i) => (
                                    <tr key={i} className={f.is_habitual ? 'bg-rose-50/40' : ''}>
                                        <td className="py-3 px-2 text-sm font-bold text-slate-700">{f.employee_name}</td>
                                        <td className="py-3 px-2 text-xs font-bold text-slate-500">{f.rubric_name}</td>
                                        <td className="py-3 px-2 text-center text-sm font-black text-slate-800">{f.months_paid}/{f.window_months}</td>
                                        <td className="py-3 px-2 text-right text-xs font-bold text-slate-600">{brl(f.avg_monthly_amount)}</td>
                                        <td className="py-3 px-2 text-right text-xs font-black text-rose-600">{f.is_habitual ? brl(f.estimated_annual_reflexo) : '—'}</td>
                                        <td className="py-3 px-2 text-center">
                                            {f.is_habitual
                                                ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-rose-100 text-rose-700"><AlertTriangle size={10} /> Habitual</span>
                                                : <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-emerald-50 text-emerald-600">Eventual</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
};

// ════════════════════════════════════════════════════════════
// 4) REGRAS
// ════════════════════════════════════════════════════════════
const emptyRule = (orgId: string): IncentiveRule => ({
    org_id: orgId, name: '', rule_type: 'ASSIDUIDADE', scope: 'EMPLOYEE',
    target_rubric_code: 'INC_ASSIDUIDADE', condition: { min_days: 22, max_faltas: 0 }, amount: 0, active: true,
});

const RulesTab: React.FC<{ orgId: string; projects: ProjectLite[]; rubrics: PayrollRubric[] }> = ({ orgId, projects, rubrics }) => {
    const [rules, setRules] = useState<IncentiveRule[]>([]);
    const [editing, setEditing] = useState<IncentiveRule | null>(null);
    const [loading, setLoading] = useState(true);
    const [runResult, setRunResult] = useState<RuleRunResult | null>(null);
    const [running, setRunning] = useState(false);
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());

    const load = useCallback(() => {
        setLoading(true);
        incentiveService.listRules(orgId).then(setRules).catch(console.error).finally(() => setLoading(false));
    }, [orgId]);
    useEffect(() => { load(); }, [load]);

    const save = async () => {
        if (!editing) return;
        try { await incentiveService.saveRule(editing); setEditing(null); load(); }
        catch (e) { alert((e as Error).message); }
    };

    const runRules = async () => {
        setRunning(true); setRunResult(null);
        try { setRunResult(await incentiveService.runRules(orgId, { month, year })); load(); }
        catch (e) { alert((e as Error).message); } finally { setRunning(false); }
    };

    return (
        <div className="space-y-4">
            {/* Runner */}
            <Card className="bg-gradient-to-br from-indigo-50 to-white border-indigo-100">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2.5 bg-indigo-600 rounded-xl"><Play className="w-4 h-4 text-white" /></div>
                        <div>
                            <h3 className="text-sm font-black text-indigo-900 uppercase tracking-tight">Rodar Regras da Competência</h3>
                            <p className="text-[10px] font-bold text-indigo-400 uppercase">Gera propostas PENDENTES — nunca paga automaticamente</p>
                        </div>
                    </div>
                    <div className="flex items-end gap-2 ml-auto">
                        <div><Label>Mês</Label><input type="number" min={1} max={12} className={`${inputCls} w-20`} value={month} onChange={e => setMonth(parseInt(e.target.value) || month)} /></div>
                        <div><Label>Ano</Label><input type="number" className={`${inputCls} w-24`} value={year} onChange={e => setYear(parseInt(e.target.value) || year)} /></div>
                        <button onClick={runRules} disabled={running}
                            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-[11px] uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50">
                            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap size={14} />} Rodar
                        </button>
                    </div>
                </div>
                {runResult && (
                    <div className="mt-4 p-3 bg-white rounded-xl border border-indigo-100 text-xs font-bold text-slate-600">
                        <span className="text-emerald-600">{runResult.created} criados</span> • <span className="text-slate-400">{runResult.skipped} ignorados</span>
                        {runResult.details.slice(0, 8).map((d, i) => (
                            <div key={i} className="text-[11px] text-slate-400 mt-1">{d.employee_name}: {brl(d.amount)} — {d.reason}</div>
                        ))}
                    </div>
                )}
            </Card>

            {/* List + editor */}
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Regras Configuradas</h3>
                <button onClick={() => setEditing(emptyRule(orgId))}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl font-black text-[11px] uppercase tracking-widest hover:bg-slate-800">
                    <Plus size={14} /> Nova Regra
                </button>
            </div>

            {loading ? <Card><div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-500" /></div></Card> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {rules.length === 0 && <Card className="md:col-span-2"><p className="text-center py-6 text-slate-300 text-xs font-bold uppercase">Nenhuma regra. Crie a primeira.</p></Card>}
                    {rules.map(r => (
                        <Card key={r.id} className="flex items-center justify-between">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${r.active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                    <p className="text-sm font-black text-slate-800 truncate">{r.name || '(sem nome)'}</p>
                                </div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mt-0.5">{r.rule_type} • {r.scope} • {r.target_rubric_code}{r.amount ? ` • ${brl(r.amount)}` : ''}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => incentiveService.toggleRule(r.id!, !r.active).then(load)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title={r.active ? 'Desativar' : 'Ativar'}><Power size={15} /></button>
                                <button onClick={() => setEditing(r)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Editar"><Search size={15} /></button>
                                <button onClick={() => { if (confirm('Excluir regra?')) incentiveService.deleteRule(r.id!).then(load); }} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg" title="Excluir"><Trash2 size={15} /></button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {editing && <RuleEditor rule={editing} setRule={setEditing} onSave={save} onCancel={() => setEditing(null)} projects={projects} rubrics={rubrics} />}
        </div>
    );
};

const RuleEditor: React.FC<{ rule: IncentiveRule; setRule: (r: IncentiveRule) => void; onSave: () => void; onCancel: () => void; projects: ProjectLite[]; rubrics: PayrollRubric[] }> =
({ rule, setRule, onSave, onCancel, projects, rubrics }) => {
    const upd = (patch: Partial<IncentiveRule>) => setRule({ ...rule, ...patch });
    const updCond = (patch: Record<string, unknown>) => setRule({ ...rule, condition: { ...rule.condition, ...patch } });
    const c = rule.condition as Record<string, number>;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-white w-full max-w-2xl rounded-3xl shadow-2xl p-8 max-h-[92vh] overflow-y-auto space-y-4">
                <h3 className="text-lg font-black text-slate-900">{rule.id ? 'Editar' : 'Nova'} Regra de Incentivo</h3>

                <div><Label>Nome</Label><input className={inputCls} value={rule.name} onChange={e => upd({ name: e.target.value })} placeholder="Ex: Prêmio assiduidade mensal" /></div>

                <div className="grid grid-cols-2 gap-4">
                    <div><Label>Tipo</Label>
                        <select className={inputCls} value={rule.rule_type} onChange={e => {
                            const rt = e.target.value as RuleType;
                            const defaults: Record<RuleType, Record<string, unknown>> = {
                                ASSIDUIDADE: { min_days: 22, max_faltas: 0 },
                                PRODUTIVIDADE: { min_productivity_pct: 100, rate_per_unit: 0 },
                                SEGURANCA: { dias_sem_acidente: 60, exclude_quase_acidente: true },
                                PRAZO: {}, META_OBRA: {}, QUALIDADE: {}, RETENCAO: {},
                            };
                            upd({ rule_type: rt, condition: defaults[rt], target_rubric_code: `INC_${rt}` });
                        }}>
                            {RULE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                    </div>
                    <div><Label>Rubrica-alvo</Label>
                        <select className={inputCls} value={rule.target_rubric_code} onChange={e => upd({ target_rubric_code: e.target.value })}>
                            {rubrics.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div><Label>Escopo</Label>
                        <select className={inputCls} value={rule.scope} onChange={e => upd({ scope: e.target.value as RuleScope })}>
                            <option value="EMPLOYEE">Todos os colaboradores</option>
                            <option value="TEAM">Por equipe</option>
                            <option value="PROJECT">Por obra (alocação)</option>
                        </select>
                    </div>
                    <div><Label>Obra (opcional)</Label>
                        <select className={inputCls} value={rule.project_id || ''} onChange={e => upd({ project_id: e.target.value || null })}>
                            <option value="">— Todas —</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{projName(p)}</option>)}
                        </select>
                    </div>
                </div>

                {/* Condições por tipo */}
                {rule.rule_type === 'ASSIDUIDADE' && (
                    <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl">
                        <div><Label>Dias mínimos presentes</Label><input type="number" className={inputCls} value={c.min_days ?? 22} onChange={e => updCond({ min_days: parseInt(e.target.value) || 0 })} /></div>
                        <div><Label>Faltas máximas</Label><input type="number" className={inputCls} value={c.max_faltas ?? 0} onChange={e => updCond({ max_faltas: parseInt(e.target.value) || 0 })} /></div>
                        <div className="col-span-2"><Label>Valor do prêmio (R$)</Label><input type="number" step="0.01" className={inputCls} value={rule.amount || ''} onChange={e => upd({ amount: parseFloat(e.target.value) || 0 })} /></div>
                    </div>
                )}
                {rule.rule_type === 'PRODUTIVIDADE' && (
                    <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl">
                        <div><Label>Produtividade mínima (%)</Label><input type="number" className={inputCls} value={c.min_productivity_pct ?? 100} onChange={e => updCond({ min_productivity_pct: parseFloat(e.target.value) || 0 })} /></div>
                        <div><Label>R$ por unidade produzida</Label><input type="number" step="0.01" className={inputCls} value={c.rate_per_unit ?? 0} onChange={e => updCond({ rate_per_unit: parseFloat(e.target.value) || 0 })} /></div>
                        <div className="col-span-2 flex items-start gap-2 text-[10px] text-slate-400 font-bold"><Info size={12} className="mt-0.5 shrink-0" /> Se "R$/unidade" = 0, usa o valor fixo abaixo.</div>
                        <div className="col-span-2"><Label>Valor fixo alternativo (R$)</Label><input type="number" step="0.01" className={inputCls} value={rule.amount || ''} onChange={e => upd({ amount: parseFloat(e.target.value) || 0 })} /></div>
                    </div>
                )}
                {rule.rule_type === 'SEGURANCA' && (
                    <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl">
                        <div><Label>Dias sem acidente</Label><input type="number" className={inputCls} value={c.dias_sem_acidente ?? 60} onChange={e => updCond({ dias_sem_acidente: parseInt(e.target.value) || 0 })} /></div>
                        <div><Label>Prêmio coletivo (R$/pessoa)</Label><input type="number" step="0.01" className={inputCls} value={rule.amount || ''} onChange={e => upd({ amount: parseFloat(e.target.value) || 0 })} /></div>
                        <label className="col-span-2 flex items-center gap-2 text-[11px] font-bold text-slate-500 cursor-pointer">
                            <input type="checkbox" checked={(rule.condition as Record<string, unknown>).exclude_quase_acidente !== false} onChange={e => updCond({ exclude_quase_acidente: e.target.checked })} />
                            Ignorar "quase-acidentes" na contagem
                        </label>
                        <p className="col-span-2 text-[10px] text-slate-400 font-bold flex items-start gap-1"><ShieldAlert size={12} className="mt-0.5 shrink-0" /> Lê o módulo SST (acidentes). Se houve acidente na janela, ninguém do escopo recebe. Restrinja a uma obra no campo "Obra" acima para premiar por canteiro.</p>
                    </div>
                )}
                {!['ASSIDUIDADE', 'PRODUTIVIDADE', 'SEGURANCA'].includes(rule.rule_type) && (
                    <div className="p-4 bg-slate-50 rounded-2xl">
                        <Label>Valor fixo por colaborador do escopo (R$)</Label>
                        <input type="number" step="0.01" className={inputCls} value={rule.amount || ''} onChange={e => upd({ amount: parseFloat(e.target.value) || 0 })} />
                        <p className="text-[10px] text-slate-400 font-bold mt-2 flex items-center gap-1"><Info size={12} /> Disparo manual: aplica o valor a todos do escopo ao rodar a competência.</p>
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <button onClick={onCancel} className="px-5 py-2.5 text-slate-400 font-black text-xs uppercase tracking-widest hover:text-slate-600">Cancelar</button>
                    <button onClick={onSave} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700">Salvar Regra</button>
                </div>
            </div>
        </div>
    );
};

// ════════════════════════════════════════════════════════════
// 5) PERFORMANCE
// ════════════════════════════════════════════════════════════
const PerformanceTab: React.FC<{ orgId: string }> = ({ orgId }) => {
    const [start, setStart] = useState(monthStartStr());
    const [end, setEnd] = useState(today());
    const [data, setData] = useState<{ byEmployee: PerformanceRow[]; byProject: PerformanceRow[]; total: number } | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(() => {
        setLoading(true);
        incentiveService.getPerformance(orgId, start, end).then(setData).catch(console.error).finally(() => setLoading(false));
    }, [orgId, start, end]);
    useEffect(() => { load(); }, [load]);

    const Bars: React.FC<{ rows: PerformanceRow[]; title: string }> = ({ rows, title }) => {
        const max = Math.max(1, ...rows.map(r => r.total));
        return (
            <Card>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4">{title}</h3>
                <div className="space-y-3">
                    {rows.length === 0 && <p className="text-center py-6 text-slate-300 text-xs font-bold uppercase">Sem dados</p>}
                    {rows.slice(0, 10).map((r, i) => (
                        <div key={r.key} className="flex items-center gap-3">
                            <span className="w-5 text-[10px] font-black text-slate-400">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between mb-1">
                                    <span className="text-xs font-bold text-slate-700 truncate">{r.name}</span>
                                    <span className="text-xs font-black text-slate-900 ml-2">{brl(r.total)}</span>
                                </div>
                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(r.total / max) * 100}%` }} />
                                </div>
                            </div>
                            <span className="text-[10px] text-slate-400 w-10 text-right">{r.count}x</span>
                        </div>
                    ))}
                </div>
            </Card>
        );
    };

    return (
        <div className="space-y-4">
            <Card className="flex flex-wrap items-end gap-4">
                <div><Label>De</Label><input type="date" className={inputCls} value={start} onChange={e => setStart(e.target.value)} /></div>
                <div><Label>Até</Label><input type="date" className={inputCls} value={end} onChange={e => setEnd(e.target.value)} /></div>
                <div className="ml-auto text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total pago (aprovado)</p>
                    <p className="text-2xl font-black text-indigo-600 flex items-center gap-2 justify-end"><TrendingUp size={20} /> {brl(data?.total || 0)}</p>
                </div>
            </Card>
            {loading ? <Card><div className="flex justify-center py-10"><Loader2 className="animate-spin text-indigo-500" /></div></Card> : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Bars rows={data?.byEmployee || []} title="Ranking por Colaborador" />
                    <Bars rows={data?.byProject || []} title="Por Obra" />
                </div>
            )}
        </div>
    );
};

// ════════════════════════════════════════════════════════════
// 6) SIMULADOR
// ════════════════════════════════════════════════════════════
const SimulatorTab: React.FC<{ projects: ProjectLite[] }> = ({ projects }) => {
    const [projectId, setProjectId] = useState('');
    const [rate, setRate] = useState(10);
    const [phase, setPhase] = useState('');
    const [start, setStart] = useState(monthStartStr());
    const [end, setEnd] = useState(today());
    const [result, setResult] = useState<Awaited<ReturnType<typeof incentiveService.simulate>> | null>(null);
    const [loading, setLoading] = useState(false);

    const run = async () => {
        if (!projectId) return;
        setLoading(true);
        try { setResult(await incentiveService.simulate({ project_id: projectId, rate_per_unit: rate, phase: phase || undefined, start, end })); }
        catch (e) { alert((e as Error).message); } finally { setLoading(false); }
    };

    return (
        <div className="space-y-4">
            <Card className="space-y-4">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Simulador de Bônus por Produção</h3>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div className="md:col-span-2"><Label>Obra</Label>
                        <select className={inputCls} value={projectId} onChange={e => setProjectId(e.target.value)}>
                            <option value="">Selecione...</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{projName(p)}</option>)}
                        </select>
                    </div>
                    <div><Label>R$ / unidade</Label><input type="number" step="0.01" className={inputCls} value={rate} onChange={e => setRate(parseFloat(e.target.value) || 0)} /></div>
                    <div><Label>Fase (opcional)</Label><input className={inputCls} value={phase} onChange={e => setPhase(e.target.value)} placeholder="Ex: Estrutura" /></div>
                    <div className="flex items-end"><button onClick={run} disabled={loading || !projectId} className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-[11px] uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator size={14} />} Simular</button></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div><Label>De</Label><input type="date" className={inputCls} value={start} onChange={e => setStart(e.target.value)} /></div>
                    <div><Label>Até</Label><input type="date" className={inputCls} value={end} onChange={e => setEnd(e.target.value)} /></div>
                </div>
            </Card>

            {result && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="text-center"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Produção total</p><p className="text-3xl font-black text-slate-900">{result.total_qty} <span className="text-sm text-slate-400">{result.unit}</span></p></Card>
                        <Card className="text-center bg-indigo-50 border-indigo-100"><p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Bônus projetado</p><p className="text-3xl font-black text-indigo-600">{brl(result.projected_bonus)}</p></Card>
                        <Card className="text-center"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Colaboradores</p><p className="text-3xl font-black text-slate-900">{result.per_employee.length}</p></Card>
                    </div>
                    <Card>
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-3">Distribuição por Colaborador</h3>
                        <div className="space-y-2">
                            {result.per_employee.length === 0 && <p className="text-center py-6 text-slate-300 text-xs font-bold uppercase">Sem produção registrada nesse filtro</p>}
                            {result.per_employee.map(e => (
                                <div key={e.employee_id} className="flex items-center justify-between p-3 bg-slate-50/60 rounded-xl">
                                    <span className="text-sm font-bold text-slate-700">{e.name}</span>
                                    <span className="text-xs font-bold text-slate-400">{e.qty} {result.unit} → <span className="text-indigo-600 font-black">{brl(e.bonus)}</span></span>
                                </div>
                            ))}
                        </div>
                    </Card>
                </>
            )}
        </div>
    );
};

export default LaborIncentivos;
