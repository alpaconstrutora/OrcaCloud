import React, { useState, useRef } from 'react';
import {
    CalendarDays, Plus, Check, X, Clock, AlertTriangle, ChevronDown,
    Loader2, Search, FileText, RotateCcw, Umbrella, Stethoscope,
    Baby, ShieldAlert, Ban, HelpCircle, Upload,
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { KpiCard } from './ui/KpiCard';
import { useConfirm } from './ui/confirm';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import LaborScopeBar from './LaborScopeBar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    laborService, Employee,
    Absence, AbsenceTipo, AbsenceStatus,
    VacationBalance
} from '../services/laborService';
import { laborKeys } from '../lib/queryKeys';
import { STALE } from '../lib/queryClient';

// ── Helpers ──────────────────────────────────────────────────────────────────

// Texto simples colorido — sem pílula/fundo/uppercase (guia §8). `bg` mantido
// só para o ícone do card de solicitação (decorativo, não é badge de status).
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

const STATUS_CONFIG: Record<AbsenceStatus, { label: string; color: string }> = {
    SOLICITADO: { label: 'Solicitado', color: 'text-amber-700' },
    APROVADO:   { label: 'Aprovado',   color: 'text-emerald-700' },
    REJEITADO:  { label: 'Rejeitado',  color: 'text-rose-700' },
    CANCELADO:  { label: 'Cancelado',  color: 'text-slate-500' },
};

const BALANCE_STATUS_COLORS: Record<string, string> = {
    ABERTO:  'text-emerald-700',
    PARCIAL: 'text-amber-700',
    GOZADO:  'text-slate-500',
};

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-[6px] text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all';

const InputGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-500">{label}</label>
        {children}
    </div>
);

function calcDias(inicio: string, fim: string): number {
    if (!inicio || !fim) return 0;
    const d1 = new Date(inicio), d2 = new Date(fim);
    if (d2 < d1) return 0;
    return Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1;
}

function useToast() {
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };
    const Toast = () => notification ? (
        <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
            notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
            <AlertCircleIcon />
            {notification.message}
        </div>
    ) : null;
    return { notify, Toast };
}

const AlertCircleIcon = () => <AlertTriangle className="w-4 h-4 shrink-0" />;

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
    notify: (message: string, type?: 'success' | 'error') => void;
}

const AbsenceForm: React.FC<AbsenceFormProps> = ({ orgId, employees, vacationBalances, existingAbsences = [], onClose, onSaved, notify }) => {
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
        if (!form.employee_id) { notify('Selecione um colaborador.', 'error'); return; }
        if (!form.data_inicio || !form.data_fim) { notify('Preencha as datas.', 'error'); return; }
        if (new Date(form.data_fim!) < new Date(form.data_inicio!)) {
            notify('Data fim deve ser igual ou posterior à data início.', 'error');
            return;
        }
        if (form.tipo === 'FERIAS' && !form.vacation_period_start) {
            notify('Selecione o período aquisitivo para as férias.', 'error');
            return;
        }
        // Bloqueia erros CLT críticos
        if (form.tipo === 'FERIAS' && cltErrors.length > 0) {
            notify('Não é possível registrar: ' + cltErrors.map(e => e.msg).join(' '), 'error');
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
            notify('Erro ao registrar: ' + (err.message || 'Tente novamente.'), 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-600 to-indigo-700">
                    <div>
                        <h3 className="text-lg font-black text-white">Nova ausência / afastamento</h3>
                        <p className="text-indigo-200 text-xs mt-0.5">Férias, atestados, licenças e outros</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-[6px] text-white transition-colors"><X className="w-5 h-5" /></button>
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
                        <InputGroup label="Período aquisitivo *">
                            {employeeBalances.length === 0 ? (
                                <div className="p-3 bg-amber-50 rounded-[6px] border border-amber-100 text-xs font-medium text-amber-700">
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
                        <InputGroup label="Data início *">
                            <input type="date" value={form.data_inicio} onChange={e => set('data_inicio', e.target.value)} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Data fim *">
                            <input type="date" value={form.data_fim} onChange={e => set('data_fim', e.target.value)} className={inputCls} />
                        </InputGroup>
                    </div>

                    {dias > 0 && (
                        <div className="p-3 bg-indigo-50 rounded-[6px] border border-indigo-100 flex items-center gap-2">
                            <CalendarDays className="w-4 h-4 text-indigo-600 shrink-0" />
                            <span className="text-xs font-semibold text-indigo-800">{dias} dia{dias !== 1 ? 's' : ''} de afastamento</span>
                            {form.tipo === 'FERIAS' && selectedBalance && (
                                <span className="text-xs text-slate-500 ml-auto">Saldo disponível: <strong>{selectedBalance.dias_restantes}d</strong></span>
                            )}
                        </div>
                    )}

                    {/* Validações CLT — erros */}
                    {cltErrors.length > 0 && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-[6px] space-y-1">
                            <p className="text-xs font-semibold text-rose-700 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Violação CLT — não pode prosseguir
                            </p>
                            {cltErrors.map((e, i) => (
                                <p key={i} className="text-xs text-rose-700 font-medium">• {e.msg}</p>
                            ))}
                        </div>
                    )}

                    {/* Validações CLT — avisos */}
                    {cltWarnings.length > 0 && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-[6px] space-y-1">
                            <p className="text-xs font-semibold text-amber-700 flex items-center gap-1">
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
                        <label className="text-xs font-semibold text-slate-500">
                            Atestado / documento (opcional)
                        </label>
                        <div
                            onClick={() => fileRef.current?.click()}
                            className="border-2 border-dashed border-slate-200 rounded-[10px] p-4 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-all"
                        >
                            {atestadoFile ? (
                                <div className="flex items-center justify-center gap-2 text-indigo-700">
                                    <FileText className="w-4 h-4" />
                                    <span className="text-xs font-medium">{atestadoFile.name}</span>
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
                    <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] transition-all">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 h-9 px-3.5 bg-indigo-600 text-white rounded-[6px] hover:bg-indigo-700 transition-all font-medium text-[13px] disabled:opacity-50">
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-[10px] shadow-xl w-full max-w-sm p-6 space-y-4">
                <h3 className="text-sm font-black text-slate-900">Motivo da rejeição</h3>
                <textarea value={reason} onChange={e => setReason(e.target.value)} className={inputCls + ' resize-none h-24'} placeholder="Descreva o motivo (opcional)..." />
                <div className="flex gap-3 justify-end">
                    <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Cancelar</button>
                    <button onClick={() => onConfirm(reason)} className="h-9 px-4 bg-rose-600 text-white rounded-[6px] text-sm font-medium hover:bg-rose-700">Confirmar rejeição</button>
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
    notify: (message: string, type?: 'success' | 'error') => void;
}

const NewPeriodForm: React.FC<NewPeriodFormProps> = ({ orgId, employees, onClose, onSaved, notify }) => {
    const [saving, setSaving] = useState(false);
    const [employeeId, setEmployeeId] = useState('');
    const [periodoInicio, setPeriodoInicio] = useState('');

    const handleSave = async () => {
        if (!employeeId || !periodoInicio) { notify('Preencha todos os campos.', 'error'); return; }
        setSaving(true);
        try {
            await laborService.createVacationPeriod(employeeId, orgId, periodoInicio);
            onSaved();
        } catch (err: any) {
            notify('Erro: ' + (err.message || 'Tente novamente.'), 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-[10px] shadow-xl w-full max-w-sm flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-emerald-600 to-emerald-700">
                    <h3 className="text-base font-black text-white">Novo período aquisitivo</h3>
                    <button onClick={onClose} className="p-1.5 bg-white/10 hover:bg-white/20 rounded-[6px] text-white"><X className="w-4 h-4" /></button>
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
                    <InputGroup label="Início do período aquisitivo *">
                        <input type="date" value={periodoInicio} onChange={e => setPeriodoInicio(e.target.value)} className={inputCls} />
                    </InputGroup>
                    <p className="text-xs text-slate-400">O período fim e o vencimento serão calculados automaticamente (+1 ano e +2 anos).</p>
                </div>
                <div className="px-6 py-4 border-t flex justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 h-9 px-3.5 bg-emerald-600 text-white rounded-[6px] font-medium text-[13px] hover:bg-emerald-700 disabled:opacity-50">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        Criar período
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
    organizations: Array<{ id: string; name: string }>;
}

type AbsView = 'requests' | 'balances';

const BALANCE_COLUMNS: ColumnConfig[] = [
    { key: 'employee', label: 'Colaborador', sortable: true },
    { key: 'periodo', label: 'Período aquisitivo', sortable: true },
    { key: 'prazo', label: 'Prazo concessivo', sortable: true },
    { key: 'direito', label: 'Direito', sortable: true },
    { key: 'gozados', label: 'Gozados', sortable: true },
    { key: 'vendidos', label: 'Vendidos', sortable: true },
    { key: 'restantes', label: 'Restantes', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
];

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX.
const BALANCE_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    employee: { label: 'Colaborador', className: 'px-4 py-2 border-r border-gray-100' },
    periodo: { label: 'Período aquisitivo', className: 'px-4 py-2 border-r border-gray-100' },
    prazo: { label: 'Prazo concessivo', className: 'px-4 py-2 border-r border-gray-100 min-w-[180px]' },
    direito: { label: 'Direito', className: 'px-4 py-2 border-r border-gray-100' },
    gozados: { label: 'Gozados', className: 'px-4 py-2 border-r border-gray-100' },
    vendidos: { label: 'Vendidos', className: 'px-4 py-2 border-r border-gray-100' },
    restantes: { label: 'Restantes', className: 'px-4 py-2 border-r border-gray-100' },
    status: { label: 'Status', className: 'px-4 py-2' },
};

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `tableColumns.orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna.
function renderBalanceCell(key: string, bal: VacationBalance): React.ReactNode {
    switch (key) {
        case 'employee':
            return <span className="text-sm font-normal text-gray-900">{bal.employee_name}</span>;
        case 'periodo':
            return <span className="text-sm font-normal text-gray-600 whitespace-nowrap">{bal.periodo_inicio} → {bal.periodo_fim}</span>;
        case 'prazo': {
            const today = new Date().toISOString().split('T')[0];
            const vencendo = bal.vencimento && bal.vencimento <= new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0];
            const vencido = bal.vencimento && bal.vencimento < today;
            // Barra de progresso do período concessivo
            // concessivo = periodo_fim → vencimento (12 meses)
            const start = new Date(bal.periodo_fim).getTime();
            const end = new Date(bal.vencimento!).getTime();
            const now = Date.now();
            const pct = Math.min(100, Math.max(0, Math.round((now - start) / (end - start) * 100)));
            const barColor = vencido ? 'bg-rose-500' : vencendo ? 'bg-amber-400' : pct > 50 ? 'bg-indigo-400' : 'bg-emerald-400';
            const daysLeft = Math.ceil((end - now) / 86400000);
            return (
                <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-medium ${vencido ? 'text-rose-700' : vencendo ? 'text-amber-700' : 'text-gray-600'}`}>
                            {vencido ? '⚠ Vencido' : vencendo ? `⏰ ${daysLeft}d restantes` : `${daysLeft}d restantes`}
                        </span>
                        <span className="text-xs text-gray-400">{bal.vencimento}</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                </div>
            );
        }
        case 'direito':
            return <span className="text-sm font-normal text-gray-700">{bal.dias_direito}d</span>;
        case 'gozados':
            return <span className="text-sm font-normal text-indigo-600">{bal.dias_gozados}d</span>;
        case 'vendidos':
            return <span className="text-sm font-normal text-gray-500">{bal.dias_vendidos}d</span>;
        case 'restantes':
            return <span className={(bal.dias_restantes || 0) > 0 ? 'text-sm font-normal text-emerald-700' : 'text-sm font-normal text-gray-500'}>{bal.dias_restantes}d</span>;
        case 'status':
            return <span className={`text-sm font-normal ${BALANCE_STATUS_COLORS[bal.status] ?? 'text-rose-700'}`}>{bal.status}</span>;
        default:
            return null;
    }
}

const LaborAbsences: React.FC<LaborAbsencesProps> = ({ orgId, employees, onRefresh, organizations }) => {
    const qc = useQueryClient();
    const confirm = useConfirm();
    const { notify, Toast } = useToast();
    const [view, setView] = usePersistedState<AbsView>('laborAbsences:view', 'requests');
    const [search, setSearch] = usePersistedState('laborAbsences:search', '');
    const [filterTipo, setFilterTipo] = usePersistedState<AbsenceTipo | ''>('laborAbsences:tipo', '');
    const [filterStatus, setFilterStatus] = usePersistedState<AbsenceStatus | ''>('laborAbsences:status', '');
    const [filterEmployee, setFilterEmployee] = usePersistedState('laborAbsences:employee', '');
    const [showForm, setShowForm] = useState(false);
    const [showNewPeriod, setShowNewPeriod] = useState(false);
    const [rejectTarget, setRejectTarget] = useState<string | null>(null);
    const tableColumns = useTableColumns(BALANCE_COLUMNS, 'laborAbsencesBalanceColumns');

    const absencesKey = [...laborKeys.all, 'absences', orgId, filterTipo, filterStatus, filterEmployee];
    const balancesKey = [...laborKeys.all, 'vacationBalances', orgId, filterEmployee];
    const alertsKey = [...laborKeys.all, 'vacationAlerts', orgId];
    const readyKey  = [...laborKeys.all, 'vacationReady',  orgId];

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

    const { data: vacationReady = [] } = useQuery({
        queryKey: readyKey,
        queryFn: () => laborService.getVacationReady(orgId),
        staleTime: STALE.normal,
        enabled: !!orgId,
    });

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: [...laborKeys.all, 'absences', orgId] });
        qc.invalidateQueries({ queryKey: [...laborKeys.all, 'vacationBalances', orgId] });
        qc.invalidateQueries({ queryKey: alertsKey });
        qc.invalidateQueries({ queryKey: readyKey });
    };

    const approveMutation = useMutation({
        mutationFn: (id: string) => laborService.approveAbsence(id, 'gestor'),
        onSuccess: () => { invalidate(); notify('Ausência aprovada.'); },
        onError: () => notify('Erro ao aprovar.', 'error'),
    });

    const rejectMutation = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) =>
            laborService.rejectAbsence(id, 'gestor', reason),
        onSuccess: () => { invalidate(); notify('Ausência rejeitada.'); },
        onError: () => notify('Erro ao rejeitar.', 'error'),
    });

    const cancelMutation = useMutation({
        mutationFn: (id: string) => laborService.cancelAbsence(id),
        onSuccess: () => { invalidate(); notify('Ausência cancelada.'); },
        onError: () => notify('Erro ao cancelar.', 'error'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => laborService.deleteAbsence(id),
        onSuccess: () => { invalidate(); notify('Registro excluído.'); },
        onError: () => notify('Erro ao excluir.', 'error'),
    });

    const handleCancel = async (absence: Absence) => {
        const ok = await confirm({ title: 'Cancelar ausência?', message: 'Esta ausência aprovada será cancelada.', variant: 'warning', confirmLabel: 'Cancelar ausência' });
        if (ok) cancelMutation.mutate(absence.id);
    };

    const handleDelete = async (absence: Absence) => {
        const ok = await confirm({ title: 'Excluir registro?', message: 'Este registro será removido permanentemente.', variant: 'danger', confirmLabel: 'Excluir' });
        if (ok) deleteMutation.mutate(absence.id);
    };

    // KPIs
    const pending  = absences.filter(a => a.status === 'SOLICITADO').length;
    const approved = absences.filter(a => a.status === 'APROVADO').length;
    const totalDaysOut = absences.filter(a => a.status === 'APROVADO').reduce((s, a) => s + (a.dias || 0), 0);

    const filteredAbsences = absences.filter(a =>
        !search ||
        (a.employee_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (a.motivo || '').toLowerCase().includes(search.toLowerCase())
    );

    const filteredBalancesBase = balances.filter(b =>
        !search || (b.employee_name || '').toLowerCase().includes(search.toLowerCase())
    );

    const filteredBalances = React.useMemo(() => {
        if (!tableColumns.sortColumn) return filteredBalancesBase;
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        return [...filteredBalancesBase].sort((a, b) => {
            switch (tableColumns.sortColumn) {
                case 'employee': return dir * (a.employee_name || '').localeCompare(b.employee_name || '');
                case 'periodo': return dir * a.periodo_inicio.localeCompare(b.periodo_inicio);
                case 'prazo': return dir * (a.vencimento || '').localeCompare(b.vencimento || '');
                case 'direito': return dir * (a.dias_direito - b.dias_direito);
                case 'gozados': return dir * (a.dias_gozados - b.dias_gozados);
                case 'vendidos': return dir * (a.dias_vendidos - b.dias_vendidos);
                case 'restantes': return dir * ((a.dias_restantes || 0) - (b.dias_restantes || 0));
                case 'status': return dir * a.status.localeCompare(b.status);
                default: return 0;
            }
        });
    }, [filteredBalancesBase, tableColumns.sortColumn, tableColumns.sortDirection]);

    return (
        <div className="space-y-6">
            {/* Cabeçalho de tela (§20) */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Férias e ausências</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Solicitações, saldos e alertas de vencimento de férias.</p>
            </div>

            {/* Alerta: férias disponíveis para agendar */}
            {vacationReady.length > 0 && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-[10px] flex items-start gap-3">
                    <Umbrella className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="text-xs font-semibold text-emerald-900">
                            {vacationReady.length} colaborador{vacationReady.length > 1 ? 'es' : ''} com férias disponíveis para agendar
                        </p>
                        <p className="text-xs text-emerald-700 mt-1">
                            {vacationReady.slice(0, 3).map(v => `${v.employee_name} (${v.dias_restantes}d disponíveis · vence ${v.vencimento})`).join(' · ')}
                            {vacationReady.length > 3 && ` e mais ${vacationReady.length - 3}…`}
                        </p>
                        <button
                            onClick={() => setView('balances')}
                            className="mt-2 text-xs font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
                        >
                            Ver saldos →
                        </button>
                    </div>
                </div>
            )}

            {/* Alerta de férias vencendo */}
            {vacationAlerts.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-[10px] flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-semibold text-amber-900">
                            {vacationAlerts.length} período{vacationAlerts.length > 1 ? 's' : ''} de férias vencendo em 60 dias — risco de pagamento em dobro
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                            {vacationAlerts.slice(0, 3).map(a => `${a.employee_name} (vence ${a.vencimento})`).join(' · ')}
                            {vacationAlerts.length > 3 && ` e mais ${vacationAlerts.length - 3}…`}
                        </p>
                    </div>
                </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <KpiCard label="Solicitações Pendentes" value={`${pending}`} icon={<Clock className="w-5 h-5" />} color="amber" />
                <KpiCard label="Ausências Aprovadas" value={`${approved}`} icon={<Check className="w-5 h-5" />} color="emerald" />
                <KpiCard label="Dias Afastados" value={`${totalDaysOut}`} icon={<CalendarDays className="w-5 h-5" />} color="indigo" />
                <KpiCard label="Disponíveis p/ Agendar" value={`${vacationReady.length}`} icon={<Umbrella className="w-5 h-5" />} color="emerald" />
                <KpiCard label="Alertas de Vencimento" value={`${vacationAlerts.length}`} icon={<AlertTriangle className="w-5 h-5" />} color="rose" />
            </div>

            <LaborScopeBar
                onRefresh={onRefresh || (() => {})}
            />

            {/* Abas + Toolbar acoplada (§5.2) */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white space-y-3">
                    <div className="flex items-center gap-1 bg-slate-100 rounded-[10px] p-1 w-fit">
                        {([['requests', 'Solicitações', Clock], ['balances', 'Saldo de Férias', CalendarDays]] as const).map(([id, label, Icon]) => (
                            <button
                                key={id}
                                onClick={() => setView(id)}
                                className={`flex items-center gap-2 h-8 px-3.5 rounded-[6px] text-sm font-medium transition-all ${view === id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {label}
                                {id === 'requests' && pending > 0 && (
                                    <span className="px-1.5 py-0.5 bg-amber-500 text-white text-[9px] font-black rounded-full">{pending}</span>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Buscar colaborador..."
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                            />
                        </div>

                        {view === 'requests' && (
                            <>
                                <select value={filterTipo} onChange={e => setFilterTipo(e.target.value as AbsenceTipo | '')} className="h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium outline-none">
                                    <option value="">Todos os tipos</option>
                                    {(Object.entries(TIPO_CONFIG) as [AbsenceTipo, typeof TIPO_CONFIG[AbsenceTipo]][]).map(([k, v]) => (
                                        <option key={k} value={k}>{v.label}</option>
                                    ))}
                                </select>
                                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as AbsenceStatus | '')} className="h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium outline-none">
                                    <option value="">Todos os status</option>
                                    {(Object.entries(STATUS_CONFIG) as [AbsenceStatus, typeof STATUS_CONFIG[AbsenceStatus]][]).map(([k, v]) => (
                                        <option key={k} value={k}>{v.label}</option>
                                    ))}
                                </select>
                            </>
                        )}

                        <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} className="h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium outline-none">
                            <option value="">Todos</option>
                            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>

                        {view === 'balances' && (
                            <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                <ColumnConfigButton
                                    columns={BALANCE_COLUMNS}
                                    visibleColumns={tableColumns.visibleColumns}
                                    showColumnConfig={tableColumns.showColumnConfig}
                                    onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                    onToggleColumn={tableColumns.toggleColumn}
                                    onReset={tableColumns.resetColumns}
                                />
                            </div>
                        )}

                        <button
                            onClick={() => view === 'requests' ? setShowForm(true) : setShowNewPeriod(true)}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-indigo-600 text-white rounded-[6px] hover:bg-indigo-700 transition-all font-medium text-[13px] active:scale-95 shrink-0"
                        >
                            <Plus className="w-[15px] h-[15px]" />
                            {view === 'requests' ? 'Nova ausência' : 'Novo período'}
                        </button>
                    </div>
                </div>

                {/* Solicitações */}
                {view === 'requests' && (
                    loadingAbs ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500">Carregando...</p>
                        </div>
                    ) : filteredAbsences.length === 0 ? (
                        <div className="text-center py-12">
                            <CalendarDays className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma ausência registrada</h3>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {filteredAbsences.map(absence => {
                                const tipo = TIPO_CONFIG[absence.tipo];
                                const status = STATUS_CONFIG[absence.status];
                                const TipoIcon = tipo.icon;
                                return (
                                    <div key={absence.id} className="p-4 hover:bg-gray-50/50 transition-colors">
                                        <div className="flex items-start gap-4">
                                            <div className={`p-2.5 rounded-[10px] ${tipo.bg} shrink-0`}>
                                                <TipoIcon className={`w-4 h-4 ${tipo.color}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3 flex-wrap">
                                                    <span className="text-sm font-normal text-gray-900">{absence.employee_name || '—'}</span>
                                                    <span className={`text-sm font-normal ${tipo.color}`}>{tipo.label}</span>
                                                    <span className={`text-sm font-normal ${status.color}`}>{status.label}</span>
                                                </div>
                                                <div className="flex items-center gap-4 mt-1 flex-wrap">
                                                    <span className="text-xs text-gray-500 font-medium">
                                                        {absence.data_inicio} → {absence.data_fim}
                                                    </span>
                                                    <span className="text-xs font-medium text-gray-700">{absence.dias}d</span>
                                                    {absence.motivo && (
                                                        <span className="text-xs text-gray-400 truncate max-w-[200px]">{absence.motivo}</span>
                                                    )}
                                                    {absence.atestado_url && (
                                                        <span className="flex items-center gap-1 text-xs text-indigo-600 font-medium">
                                                            <FileText className="w-3 h-3" /> Atestado
                                                        </span>
                                                    )}
                                                </div>
                                                {absence.rejection_reason && (
                                                    <p className="text-xs text-rose-600 font-medium mt-1">Motivo: {absence.rejection_reason}</p>
                                                )}
                                            </div>
                                            {/* Ações */}
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {absence.status === 'SOLICITADO' && (
                                                    <>
                                                        <ActionIconButton
                                                            kind="edit"
                                                            icon={<Check className="w-4 h-4" />}
                                                            title="Aprovar"
                                                            onClick={() => approveMutation.mutate(absence.id)}
                                                            disabled={approveMutation.isPending}
                                                        />
                                                        <ActionIconButton
                                                            kind="delete"
                                                            icon={<X className="w-4 h-4" />}
                                                            title="Rejeitar"
                                                            onClick={() => setRejectTarget(absence.id)}
                                                        />
                                                    </>
                                                )}
                                                {absence.status === 'APROVADO' && (
                                                    <ActionIconButton
                                                        kind="edit"
                                                        icon={<RotateCcw className="w-4 h-4" />}
                                                        title="Cancelar"
                                                        onClick={() => handleCancel(absence)}
                                                    />
                                                )}
                                                {(absence.status === 'REJEITADO' || absence.status === 'CANCELADO') && (
                                                    <ActionIconButton kind="delete" onClick={() => handleDelete(absence)} />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )
                )}

                {/* Saldos de Férias */}
                {view === 'balances' && (
                    loadingBal ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500">Carregando...</p>
                        </div>
                    ) : filteredBalances.length === 0 ? (
                        <div className="text-center py-12">
                            <Umbrella className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum saldo de férias cadastrado</h3>
                            <p className="text-sm text-gray-500">Crie períodos aquisitivos para os colaboradores.</p>
                        </div>
                    ) : (
                        <div className="overflow-auto max-h-[70vh]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        {tableColumns.orderedVisibleColumns.map(key => {
                                            const def = BALANCE_COLUMN_HEADERS[key];
                                            if (!def) return null;
                                            return (
                                                <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                    onSort={tableColumns.handleColumnSort}
                                                    onMoveColumn={tableColumns.moveColumn}
                                                    className={def.className} />
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {filteredBalances.map(bal => {
                                        return (
                                            <tr key={bal.id} className="hover:bg-blue-50/50 transition-colors">
                                                {tableColumns.orderedVisibleColumns.map(key => (
                                                    <td key={key} className={`px-4 py-2.5 border-r border-gray-100 last:border-r-0 ${key === 'prazo' ? 'min-w-[180px]' : ''}`}>
                                                        {renderBalanceCell(key, bal)}
                                                    </td>
                                                ))}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )
                )}
            </div>

            {/* Modais */}
            {showForm && (
                <AbsenceForm
                    orgId={orgId}
                    employees={employees}
                    vacationBalances={balances}
                    existingAbsences={absences}
                    onClose={() => setShowForm(false)}
                    onSaved={() => { setShowForm(false); invalidate(); notify('Ausência registrada.'); }}
                    notify={notify}
                />
            )}
            {showNewPeriod && (
                <NewPeriodForm
                    orgId={orgId}
                    employees={employees}
                    onClose={() => setShowNewPeriod(false)}
                    onSaved={() => { setShowNewPeriod(false); invalidate(); notify('Período aquisitivo criado.'); }}
                    notify={notify}
                />
            )}
            {rejectTarget && (
                <RejectModal
                    onConfirm={(reason) => { rejectMutation.mutate({ id: rejectTarget, reason }); setRejectTarget(null); }}
                    onClose={() => setRejectTarget(null)}
                />
            )}
            <Toast />
        </div>
    );
};

export default LaborAbsences;
