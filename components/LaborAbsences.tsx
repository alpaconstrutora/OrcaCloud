import React, { useState, useRef } from 'react';
import {
    CalendarDays, Plus, Check, X, Clock, AlertTriangle, ChevronDown,
    Loader2, Search, FileText, RotateCcw, Umbrella, Stethoscope,
    Baby, ShieldAlert, Ban, HelpCircle, Upload, Eye, Trash2
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    laborService, Employee,
    Absence, AbsenceTipo, AbsenceStatus,
    VacationBalance
} from '../services/laborService';
import { laborKeys } from '../lib/queryKeys';
import { STALE } from '../lib/queryClient';

// ── Helpers ──────────────────────────────────────────────────────────────────

const TIPO_CONFIG: Record<AbsenceTipo, { label: string; color: string; bg: string; icon: React.ElementType }> = {
    FERIAS:               { label: 'Férias',             color: 'text-indigo-700',  bg: 'bg-indigo-100',  icon: Umbrella },
    ATESTADO:             { label: 'Atestado',           color: 'text-teal-700',    bg: 'bg-teal-100',    icon: Stethoscope },
    FALTA:                { label: 'Falta',              color: 'text-rose-700',    bg: 'bg-rose-100',    icon: Ban },
    LICENCA_MATERNIDADE:  { label: 'Lic. Maternidade',   color: 'text-pink-700',    bg: 'bg-pink-100',    icon: Baby },
    LICENCA_PATERNIDADE:  { label: 'Lic. Paternidade',   color: 'text-blue-700',    bg: 'bg-blue-100',    icon: Baby },
    LICENCA_MEDICA:       { label: 'Lic. Médica',        color: 'text-amber-700',   bg: 'bg-amber-100',   icon: Stethoscope },
    AFASTAMENTO_INSS:     { label: 'Afastamento INSS',   color: 'text-orange-700',  bg: 'bg-orange-100',  icon: ShieldAlert },
    SUSPENSAO:            { label: 'Suspensão',          color: 'text-red-700',     bg: 'bg-red-100',     icon: ShieldAlert },
    OUTROS:               { label: 'Outros',             color: 'text-slate-700',   bg: 'bg-slate-100',   icon: HelpCircle },
};

const STATUS_CONFIG: Record<AbsenceStatus, { label: string; color: string; bg: string }> = {
    SOLICITADO: { label: 'Solicitado', color: 'text-amber-700',  bg: 'bg-amber-100' },
    APROVADO:   { label: 'Aprovado',   color: 'text-emerald-700',bg: 'bg-emerald-100' },
    REJEITADO:  { label: 'Rejeitado',  color: 'text-rose-700',   bg: 'bg-rose-100' },
    CANCELADO:  { label: 'Cancelado',  color: 'text-slate-500',  bg: 'bg-slate-100' },
};

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all';

const InputGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
        {children}
    </div>
);

function calcDias(inicio: string, fim: string): number {
    if (!inicio || !fim) return 0;
    const d1 = new Date(inicio), d2 = new Date(fim);
    if (d2 < d1) return 0;
    return Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1;
}

// ── Modal de Ausência ────────────────────────────────────────────────────────

// ── CLT Vacation validation ──────────────────────────────────────────────────
// CLT art. 130, 134, 135, 143

interface CltIssue {
    severity: 'error' | 'warning';
    msg: string;
}

function computeCltIssues(
    dias: number,
    form: Partial<Absence>,
    selectedBalance: VacationBalance | undefined,
    existingFeriasPeriod: Absence[],   // FERIAS aprovadas/solicitadas mesmo período aquisitivo
): CltIssue[] {
    if (form.tipo !== 'FERIAS' || !form.data_inicio || !form.data_fim || dias <= 0) return [];
    const issues: CltIssue[] = [];

    if (!selectedBalance) return issues;

    // Dias restantes
    const restantes = selectedBalance.dias_restantes ?? 0;
    if (dias > restantes) {
        issues.push({ severity: 'error', msg: `Período excede o saldo: você tem ${restantes} dia(s) disponível(is) para este período aquisitivo.` });
    }

    // Máximo 3 fracionamentos (art. 134)
    const existingCount = existingFeriasPeriod.filter(a =>
        a.status !== 'CANCELADO' && a.status !== 'REJEITADO'
    ).length;
    if (existingCount >= 3) {
        issues.push({ severity: 'error', msg: `CLT art. 134: férias já foram fracionadas em ${existingCount} período(s). Máximo permitido: 3 períodos.` });
    }

    // Mínimo 14 dias para o primeiro período; 5 dias para os demais (art. 134 §1 e §2)
    const jaGozados = selectedBalance.dias_gozados;
    const isFirstPeriod = jaGozados === 0 && existingCount === 0;
    if (isFirstPeriod && dias < 14) {
        issues.push({ severity: 'error', msg: `CLT art. 134 §1: o primeiro período de férias não pode ser inferior a 14 dias corridos (solicitado: ${dias} dias).` });
    } else if (!isFirstPeriod && dias < 5) {
        issues.push({ severity: 'error', msg: `CLT art. 134 §2: períodos subsequentes de férias não podem ser inferiores a 5 dias corridos (solicitado: ${dias} dias).` });
    }

    // Período concessivo — deve iniciar antes do vencimento (art. 135)
    if (selectedBalance.vencimento && form.data_inicio > selectedBalance.vencimento) {
        issues.push({ severity: 'error', msg: `CLT art. 135: as férias devem ser iniciadas antes do vencimento do período concessivo (${selectedBalance.vencimento}). Risco de pagamento em dobro.` });
    } else if (selectedBalance.vencimento) {
        const daysUntilExpiry = Math.ceil((new Date(selectedBalance.vencimento).getTime() - Date.now()) / 86400000);
        if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) {
            issues.push({ severity: 'warning', msg: `Período concessivo vence em ${daysUntilExpiry} dia(s) (${selectedBalance.vencimento}). Conceda as férias antes dessa data para evitar pagamento em dobro.` });
        }
    }

    // Abono pecuniário — aviso informativo (art. 143): máx. 10 dias / 1/3 do direito
    const maxAbono = Math.min(10, Math.floor(selectedBalance.dias_direito / 3));
    if (selectedBalance.dias_vendidos > maxAbono) {
        issues.push({ severity: 'error', msg: `CLT art. 143: abono pecuniário excede o limite. Máximo: ${maxAbono} dia(s) (1/3 de ${selectedBalance.dias_direito} dias de direito).` });
    }

    return issues;
}

interface AbsenceFormProps {
    orgId: string;
    employees: Employee[];
    vacationBalances: VacationBalance[];
    existingAbsences?: Absence[];
    onClose: () => void;
    onSaved: () => void;
}

const AbsenceForm: React.FC<AbsenceFormProps> = ({ orgId, employees, vacationBalances, existingAbsences = [], onClose, onSaved }) => {
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<Partial<Absence>>({
        org_id: orgId,
        employee_id: '',
        tipo: 'FERIAS',
        data_inicio: '',
        data_fim: '',
        status: 'SOLICITADO',
        motivo: '',
        vacation_period_start: '',
    });
    const [atestadoFile, setAtestadoFile] = useState<File | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const set = <K extends keyof Absence>(k: K, v: Absence[K]) =>
        setForm(p => ({ ...p, [k]: v }));

    const dias = calcDias(form.data_inicio || '', form.data_fim || '');

    const employeeBalances = vacationBalances.filter(b =>
        b.employee_id === form.employee_id && b.dias_restantes! > 0
    );

    const selectedBalance = employeeBalances.find(b => b.periodo_inicio === form.vacation_period_start);

    const existingFeriasSamePeriod = existingAbsences.filter(a =>
        a.employee_id === form.employee_id &&
        a.tipo === 'FERIAS' &&
        a.vacation_period_start === form.vacation_period_start
    );

    const cltIssues = computeCltIssues(dias, form, selectedBalance, existingFeriasSamePeriod);
    const cltErrors = cltIssues.filter(i => i.severity === 'error');
    const cltWarnings = cltIssues.filter(i => i.severity === 'warning');

    const handleSave = async () => {
        if (!form.employee_id) { alert('Selecione um colaborador.'); return; }
        if (!form.data_inicio || !form.data_fim) { alert('Preencha as datas.'); return; }
        if (new Date(form.data_fim!) < new Date(form.data_inicio!)) {
            alert('Data fim deve ser igual ou posterior à data início.');
            return;
        }
        if (form.tipo === 'FERIAS' && !form.vacation_period_start) {
            alert('Selecione o período aquisitivo para as férias.');
            return;
        }
        // Bloqueia erros CLT críticos
        if (form.tipo === 'FERIAS' && cltErrors.length > 0) {
            alert('Não é possível registrar:\n\n' + cltErrors.map(e => '• ' + e.msg).join('\n'));
            return;
        }
        setSaving(true);
        try {
            const { employee_name: _, dias: _d, ...cleanForm } = form as Absence;
            const created = await laborService.createAbsence({
                ...cleanForm,
                org_id: orgId,
                vacation_period_start: form.tipo === 'FERIAS' ? form.vacation_period_start : undefined,
            } as any);

            if (atestadoFile && created?.id) {
                await laborService.uploadAbsenceAtestado(created.id, orgId, atestadoFile);
            }
            onSaved();
        } catch (err: any) {
            alert('Erro ao registrar: ' + (err.message || 'Tente novamente.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-600 to-indigo-700">
                    <div>
                        <h2 className="text-lg font-black text-white">Nova Ausência / Afastamento</h2>
                        <p className="text-indigo-200 text-xs mt-0.5">Férias, atestados, licenças e outros</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors"><X className="w-5 h-5" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <InputGroup label="Colaborador *">
                        <div className="relative">
                            <select value={form.employee_id} onChange={e => set('employee_id', e.target.value)} className={inputCls + ' appearance-none pr-8'}>
                                <option value="">Selecione...</option>
                                {employees.filter(e => e.status === 'ATIVO').map(e => (
                                    <option key={e.id} value={e.id}>{e.name} — {e.role}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        </div>
                    </InputGroup>

                    <InputGroup label="Tipo *">
                        <div className="relative">
                            <select value={form.tipo} onChange={e => set('tipo', e.target.value as AbsenceTipo)} className={inputCls + ' appearance-none pr-8'}>
                                {(Object.entries(TIPO_CONFIG) as [AbsenceTipo, typeof TIPO_CONFIG[AbsenceTipo]][]).map(([k, v]) => (
                                    <option key={k} value={k}>{v.label}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        </div>
                    </InputGroup>

                    {/* Período aquisitivo (apenas férias) */}
                    {form.tipo === 'FERIAS' && form.employee_id && (
                        <InputGroup label="Período Aquisitivo *">
                            {employeeBalances.length === 0 ? (
                                <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-xs font-bold text-amber-700">
                                    Nenhum saldo de férias disponível para este colaborador. Crie um período na aba Saldos.
                                </div>
                            ) : (
                                <div className="relative">
                                    <select
                                        value={form.vacation_period_start}
                                        onChange={e => set('vacation_period_start', e.target.value)}
                                        className={inputCls + ' appearance-none pr-8'}
                                    >
                                        <option value="">Selecione o período...</option>
                                        {employeeBalances.map(b => (
                                            <option key={b.id} value={b.periodo_inicio}>
                                                {b.periodo_inicio} → {b.periodo_fim} · {b.dias_restantes}d restantes · vence {b.vencimento}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                </div>
                            )}
                        </InputGroup>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <InputGroup label="Data Início *">
                            <input type="date" value={form.data_inicio} onChange={e => set('data_inicio', e.target.value)} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Data Fim *">
                            <input type="date" value={form.data_fim} onChange={e => set('data_fim', e.target.value)} className={inputCls} />
                        </InputGroup>
                    </div>

                    {dias > 0 && (
                        <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 flex items-center gap-2">
                            <CalendarDays className="w-4 h-4 text-indigo-600 shrink-0" />
                            <span className="text-xs font-black text-indigo-800">{dias} dia{dias !== 1 ? 's' : ''} de afastamento</span>
                            {form.tipo === 'FERIAS' && selectedBalance && (
                                <span className="text-xs text-slate-500 ml-auto">Saldo disponível: <strong>{selectedBalance.dias_restantes}d</strong></span>
                            )}
                        </div>
                    )}

                    {/* Validações CLT — erros */}
                    {cltErrors.length > 0 && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                            <p className="text-[10px] font-black text-rose-700 uppercase tracking-widest flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Violação CLT — não pode prosseguir
                            </p>
                            {cltErrors.map((e, i) => (
                                <p key={i} className="text-xs text-rose-700 font-medium">• {e.msg}</p>
                            ))}
                        </div>
                    )}

                    {/* Validações CLT — avisos */}
                    {cltWarnings.length > 0 && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                            <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Atenção CLT
                            </p>
                            {cltWarnings.map((w, i) => (
                                <p key={i} className="text-xs text-amber-700 font-medium">• {w.msg}</p>
                            ))}
                        </div>
                    )}

                    <InputGroup label="Motivo / Observação">
                        <textarea value={form.motivo || ''} onChange={e => set('motivo', e.target.value)} className={inputCls + ' resize-none h-20'} placeholder="Descreva o motivo ou observações relevantes..." />
                    </InputGroup>

                    {/* Upload atestado */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            Atestado / Documento (opcional)
                        </label>
                        <div
                            onClick={() => fileRef.current?.click()}
                            className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-all"
                        >
                            {atestadoFile ? (
                                <div className="flex items-center justify-center gap-2 text-indigo-700">
                                    <FileText className="w-4 h-4" />
                                    <span className="text-xs font-bold">{atestadoFile.name}</span>
                                    <button onClick={e => { e.stopPropagation(); setAtestadoFile(null); }} className="ml-2 text-slate-400 hover:text-rose-500">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-1">
                                    <Upload className="w-5 h-5 text-slate-300" />
                                    <span className="text-xs text-slate-400 font-medium">Clique para anexar atestado ou documento</span>
                                </div>
                            )}
                        </div>
                        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => setAtestadoFile(e.target.files?.[0] || null)} />
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-bold text-sm shadow-lg disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {saving ? 'Registrando...' : 'Registrar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Modal de Rejeição ────────────────────────────────────────────────────────

const RejectModal: React.FC<{ onConfirm: (reason: string) => void; onClose: () => void }> = ({ onConfirm, onClose }) => {
    const [reason, setReason] = useState('');
    return (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
                <h3 className="text-sm font-black text-slate-900">Motivo da Rejeição</h3>
                <textarea value={reason} onChange={e => setReason(e.target.value)} className={inputCls + ' resize-none h-24'} placeholder="Descreva o motivo (opcional)..." />
                <div className="flex gap-3 justify-end">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
                    <button onClick={() => onConfirm(reason)} className="px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-bold hover:bg-rose-700">Confirmar Rejeição</button>
                </div>
            </div>
        </div>
    );
};

// ── Modal de Novo Período ────────────────────────────────────────────────────

interface NewPeriodFormProps {
    orgId: string;
    employees: Employee[];
    onClose: () => void;
    onSaved: () => void;
}

const NewPeriodForm: React.FC<NewPeriodFormProps> = ({ orgId, employees, onClose, onSaved }) => {
    const [saving, setSaving] = useState(false);
    const [employeeId, setEmployeeId] = useState('');
    const [periodoInicio, setPeriodoInicio] = useState('');

    const handleSave = async () => {
        if (!employeeId || !periodoInicio) { alert('Preencha todos os campos.'); return; }
        setSaving(true);
        try {
            await laborService.createVacationPeriod(employeeId, orgId, periodoInicio);
            onSaved();
        } catch (err: any) {
            alert('Erro: ' + (err.message || 'Tente novamente.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-emerald-600 to-emerald-700">
                    <h2 className="text-base font-black text-white">Novo Período Aquisitivo</h2>
                    <button onClick={onClose} className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white"><X className="w-4 h-4" /></button>
                </div>
                <div className="p-6 space-y-4">
                    <InputGroup label="Colaborador *">
                        <div className="relative">
                            <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className={inputCls + ' appearance-none pr-8'}>
                                <option value="">Selecione...</option>
                                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        </div>
                    </InputGroup>
                    <InputGroup label="Início do Período Aquisitivo *">
                        <input type="date" value={periodoInicio} onChange={e => setPeriodoInicio(e.target.value)} className={inputCls} />
                    </InputGroup>
                    <p className="text-[11px] text-slate-400">O período fim e o vencimento serão calculados automaticamente (+1 ano e +2 anos).</p>
                </div>
                <div className="px-6 py-4 border-t flex justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-50">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        Criar Período
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Componente principal ─────────────────────────────────────────────────────

interface LaborAbsencesProps {
    orgId: string;
    employees: Employee[];
    onRefresh?: () => void;
}

type AbsView = 'requests' | 'balances';

const LaborAbsences: React.FC<LaborAbsencesProps> = ({ orgId, employees }) => {
    const qc = useQueryClient();
    const [view, setView] = useState<AbsView>('requests');
    const [search, setSearch] = useState('');
    const [filterTipo, setFilterTipo] = useState<AbsenceTipo | ''>('');
    const [filterStatus, setFilterStatus] = useState<AbsenceStatus | ''>('');
    const [filterEmployee, setFilterEmployee] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [showNewPeriod, setShowNewPeriod] = useState(false);
    const [rejectTarget, setRejectTarget] = useState<string | null>(null);

    const absencesKey = [...laborKeys.all, 'absences', orgId, filterTipo, filterStatus, filterEmployee];
    const balancesKey = [...laborKeys.all, 'vacationBalances', orgId, filterEmployee];
    const alertsKey   = [...laborKeys.all, 'vacationAlerts', orgId];

    const { data: absences = [], isLoading: loadingAbs } = useQuery({
        queryKey: absencesKey,
        queryFn: () => laborService.listAbsences({
            orgId,
            tipo: filterTipo || undefined,
            status: filterStatus || undefined,
            employeeId: filterEmployee || undefined,
        }),
        staleTime: STALE.fast,
        enabled: !!orgId,
    });

    const { data: balances = [], isLoading: loadingBal } = useQuery({
        queryKey: balancesKey,
        queryFn: () => laborService.listVacationBalances(orgId, filterEmployee || undefined),
        staleTime: STALE.normal,
        enabled: !!orgId,
    });

    const { data: vacationAlerts = [] } = useQuery({
        queryKey: alertsKey,
        queryFn: () => laborService.getVacationAlerts(orgId),
        staleTime: STALE.normal,
        enabled: !!orgId,
    });

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: [...laborKeys.all, 'absences', orgId] });
        qc.invalidateQueries({ queryKey: [...laborKeys.all, 'vacationBalances', orgId] });
        qc.invalidateQueries({ queryKey: alertsKey });
    };

    const approveMutation = useMutation({
        mutationFn: (id: string) => laborService.approveAbsence(id, 'gestor'),
        onSuccess: invalidate,
    });

    const rejectMutation = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) =>
            laborService.rejectAbsence(id, 'gestor', reason),
        onSuccess: invalidate,
    });

    const cancelMutation = useMutation({
        mutationFn: (id: string) => laborService.cancelAbsence(id),
        onSuccess: invalidate,
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => laborService.deleteAbsence(id),
        onSuccess: invalidate,
    });

    // KPIs
    const pending  = absences.filter(a => a.status === 'SOLICITADO').length;
    const approved = absences.filter(a => a.status === 'APROVADO').length;
    const totalDaysOut = absences.filter(a => a.status === 'APROVADO').reduce((s, a) => s + (a.dias || 0), 0);

    const filteredAbsences = absences.filter(a =>
        !search ||
        (a.employee_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (a.motivo || '').toLowerCase().includes(search.toLowerCase())
    );

    const filteredBalances = balances.filter(b =>
        !search || (b.employee_name || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* Alerta de férias vencendo */}
            {vacationAlerts.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-black text-amber-900 uppercase tracking-tight">
                            {vacationAlerts.length} período{vacationAlerts.length > 1 ? 's' : ''} de férias vencendo em 60 dias
                        </p>
                        <p className="text-[11px] text-amber-700 mt-1">
                            {vacationAlerts.slice(0, 3).map(a => `${a.employee_name} (vence ${a.vencimento})`).join(' · ')}
                            {vacationAlerts.length > 3 && ` e mais ${vacationAlerts.length - 3}…`}
                        </p>
                    </div>
                </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Solicitações Pendentes', value: pending,    color: 'text-amber-700',   bg: 'bg-amber-50' },
                    { label: 'Ausências Aprovadas',    value: approved,   color: 'text-emerald-700', bg: 'bg-emerald-50' },
                    { label: 'Dias Afastados',         value: totalDaysOut, color: 'text-indigo-700', bg: 'bg-indigo-50' },
                    { label: 'Alertas de Férias',      value: vacationAlerts.length, color: 'text-rose-700', bg: 'bg-rose-50' },
                ].map(({ label, value, color, bg }) => (
                    <div key={label} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                        <p className={`text-2xl font-black ${color} ${bg} px-2 py-0.5 rounded-lg inline-block`}>{value}</p>
                    </div>
                ))}
            </div>

            {/* Controls */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
                <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1">
                    {([['requests', 'Solicitações', Clock], ['balances', 'Saldos de Férias', CalendarDays]] as const).map(([id, label, Icon]) => (
                        <button
                            key={id}
                            onClick={() => setView(id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${view === id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {label}
                            {id === 'requests' && pending > 0 && (
                                <span className="px-1.5 py-0.5 bg-amber-500 text-white text-[9px] font-black rounded-full">{pending}</span>
                            )}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-100 w-40" />
                    </div>

                    {view === 'requests' && (
                        <>
                            <div className="relative">
                                <select value={filterTipo} onChange={e => setFilterTipo(e.target.value as AbsenceTipo | '')} className="pl-3 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none appearance-none">
                                    <option value="">Todos os tipos</option>
                                    {(Object.entries(TIPO_CONFIG) as [AbsenceTipo, typeof TIPO_CONFIG[AbsenceTipo]][]).map(([k, v]) => (
                                        <option key={k} value={k}>{v.label}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                            </div>
                            <div className="relative">
                                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as AbsenceStatus | '')} className="pl-3 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none appearance-none">
                                    <option value="">Todos os status</option>
                                    {(Object.entries(STATUS_CONFIG) as [AbsenceStatus, typeof STATUS_CONFIG[AbsenceStatus]][]).map(([k, v]) => (
                                        <option key={k} value={k}>{v.label}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                            </div>
                        </>
                    )}

                    <div className="relative">
                        <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} className="pl-3 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none appearance-none">
                            <option value="">Todos</option>
                            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                    </div>

                    <button
                        onClick={() => view === 'requests' ? setShowForm(true) : setShowNewPeriod(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-bold text-xs shadow-md"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        {view === 'requests' ? 'Nova Ausência' : 'Novo Período'}
                    </button>
                </div>
            </div>

            {/* Solicitações */}
            {view === 'requests' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    {loadingAbs ? (
                        <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-indigo-500 animate-spin" /></div>
                    ) : filteredAbsences.length === 0 ? (
                        <div className="text-center py-16">
                            <CalendarDays className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-black text-slate-400">Nenhuma ausência registrada</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {filteredAbsences.map(absence => {
                                const tipo = TIPO_CONFIG[absence.tipo];
                                const status = STATUS_CONFIG[absence.status];
                                const TipoIcon = tipo.icon;
                                return (
                                    <div key={absence.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                                        <div className="flex items-start gap-4">
                                            <div className={`p-2.5 rounded-xl ${tipo.bg} shrink-0`}>
                                                <TipoIcon className={`w-4 h-4 ${tipo.color}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3 flex-wrap">
                                                    <span className="text-sm font-black text-slate-900">{absence.employee_name || '—'}</span>
                                                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${tipo.bg} ${tipo.color}`}>{tipo.label}</span>
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${status.bg} ${status.color}`}>{status.label}</span>
                                                </div>
                                                <div className="flex items-center gap-4 mt-1 flex-wrap">
                                                    <span className="text-xs text-slate-500 font-medium">
                                                        {absence.data_inicio} → {absence.data_fim}
                                                    </span>
                                                    <span className="text-xs font-black text-slate-700">{absence.dias}d</span>
                                                    {absence.motivo && (
                                                        <span className="text-xs text-slate-400 truncate max-w-[200px]">{absence.motivo}</span>
                                                    )}
                                                    {absence.atestado_url && (
                                                        <span className="flex items-center gap-1 text-xs text-indigo-600 font-bold">
                                                            <FileText className="w-3 h-3" /> Atestado
                                                        </span>
                                                    )}
                                                </div>
                                                {absence.rejection_reason && (
                                                    <p className="text-[11px] text-rose-600 font-bold mt-1">Motivo: {absence.rejection_reason}</p>
                                                )}
                                            </div>
                                            {/* Ações */}
                                            <div className="flex items-center gap-2 shrink-0">
                                                {absence.status === 'SOLICITADO' && (
                                                    <>
                                                        <button
                                                            onClick={() => approveMutation.mutate(absence.id)}
                                                            disabled={approveMutation.isPending}
                                                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg text-[10px] font-black transition-all"
                                                        >
                                                            <Check className="w-3 h-3" /> Aprovar
                                                        </button>
                                                        <button
                                                            onClick={() => setRejectTarget(absence.id)}
                                                            className="flex items-center gap-1 px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg text-[10px] font-black transition-all"
                                                        >
                                                            <X className="w-3 h-3" /> Rejeitar
                                                        </button>
                                                    </>
                                                )}
                                                {absence.status === 'APROVADO' && (
                                                    <button
                                                        onClick={() => { if (confirm('Cancelar esta ausência?')) cancelMutation.mutate(absence.id); }}
                                                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black transition-all"
                                                    >
                                                        <RotateCcw className="w-3 h-3" /> Cancelar
                                                    </button>
                                                )}
                                                {(absence.status === 'REJEITADO' || absence.status === 'CANCELADO') && (
                                                    <button
                                                        onClick={() => { if (confirm('Excluir este registro?')) deleteMutation.mutate(absence.id); }}
                                                        className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Saldos de Férias */}
            {view === 'balances' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    {loadingBal ? (
                        <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-indigo-500 animate-spin" /></div>
                    ) : filteredBalances.length === 0 ? (
                        <div className="text-center py-16">
                            <Umbrella className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-black text-slate-400">Nenhum saldo de férias cadastrado</p>
                            <p className="text-xs text-slate-400 mt-1">Crie períodos aquisitivos para os colaboradores.</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    {['Colaborador', 'Período Aquisitivo', 'Vencimento', 'Direito', 'Gozados', 'Vendidos', 'Restantes', 'Status'].map(h => (
                                        <th key={h} className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredBalances.map(bal => {
                                    const today = new Date().toISOString().split('T')[0];
                                    const vencendo = bal.vencimento && bal.vencimento <= new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0];
                                    const vencido  = bal.vencimento && bal.vencimento < today;
                                    return (
                                        <tr key={bal.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                            <td className="px-4 py-3 text-sm font-bold text-slate-900">{bal.employee_name}</td>
                                            <td className="px-4 py-3 text-xs text-slate-600 font-medium">{bal.periodo_inicio} → {bal.periodo_fim}</td>
                                            <td className="px-4 py-3">
                                                <span className={`text-xs font-black ${vencido ? 'text-rose-700' : vencendo ? 'text-amber-700' : 'text-slate-600'}`}>
                                                    {vencido ? '⚠ ' : vencendo ? '⏰ ' : ''}{bal.vencimento}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm font-black text-slate-700">{bal.dias_direito}d</td>
                                            <td className="px-4 py-3 text-sm font-black text-indigo-700">{bal.dias_gozados}d</td>
                                            <td className="px-4 py-3 text-sm font-medium text-slate-500">{bal.dias_vendidos}d</td>
                                            <td className="px-4 py-3">
                                                <span className={`text-sm font-black px-2 py-0.5 rounded-lg ${(bal.dias_restantes || 0) > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                    {bal.dias_restantes}d
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                                    bal.status === 'ABERTO'  ? 'bg-emerald-100 text-emerald-700' :
                                                    bal.status === 'PARCIAL' ? 'bg-amber-100 text-amber-700' :
                                                    bal.status === 'GOZADO'  ? 'bg-slate-100 text-slate-500' :
                                                    'bg-rose-100 text-rose-700'
                                                }`}>
                                                    {bal.status}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Modais */}
            {showForm && (
                <AbsenceForm
                    orgId={orgId}
                    employees={employees}
                    vacationBalances={balances}
                    existingAbsences={absences}
                    onClose={() => setShowForm(false)}
                    onSaved={() => { setShowForm(false); invalidate(); }}
                />
            )}
            {showNewPeriod && (
                <NewPeriodForm
                    orgId={orgId}
                    employees={employees}
                    onClose={() => setShowNewPeriod(false)}
                    onSaved={() => { setShowNewPeriod(false); invalidate(); }}
                />
            )}
            {rejectTarget && (
                <RejectModal
                    onConfirm={(reason) => { rejectMutation.mutate({ id: rejectTarget, reason }); setRejectTarget(null); }}
                    onClose={() => setRejectTarget(null)}
                />
            )}
        </div>
    );
};

export default LaborAbsences;
