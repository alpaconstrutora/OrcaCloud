import React, { useState, useRef, useMemo } from 'react';
import {
    BookOpen, Plus, X, ChevronDown, Loader2, Search,
    AlertTriangle, FileText, Eye,
    Upload, Award, Users, Shield, CheckCircle2, XCircle,
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { KpiCard } from './ui/KpiCard';
import { useConfirm } from './ui/confirm';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import LaborScopeBar from './LaborScopeBar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    laborService, Employee,
    TrainingCourse, TrainingCategoria, EmployeeTraining
} from '../services/laborService';
import { laborKeys } from '../lib/queryKeys';
import { STALE } from '../lib/queryClient';
import Button from './ui/Button';

// ── Helpers ──────────────────────────────────────────────────────────────────

// Texto simples colorido — sem pílula/fundo/uppercase (guia §8).
const CAT_CONFIG: Record<TrainingCategoria, { label: string; color: string }> = {
    NR_OBRIGATORIA: { label: 'NR Obrigatória', color: 'text-rose-700' },
    INTEGRACAO:     { label: 'Integração',     color: 'text-indigo-700' },
    DDS:            { label: 'DDS',            color: 'text-amber-700' },
    QUALIDADE:      { label: 'Qualidade',      color: 'text-emerald-700' },
    LIDERANCA:      { label: 'Liderança',      color: 'text-purple-700' },
    TECNICO:        { label: 'Técnico',        color: 'text-blue-700' },
    OUTROS:         { label: 'Outros',         color: 'text-slate-700' },
};

const STATUS_COLORS: Record<string, string> = {
    ATIVO:    'text-emerald-700',
    VENCIDO:  'text-rose-700',
    PENDENTE: 'text-amber-700',
};

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-[6px] text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all';
const InputGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-500">{label}</label>
        {children}
    </div>
);

const ROLES = [
    'Mestre de Obras','Pedreiro','Servente','Carpinteiro','Encanador',
    'Eletricista','Pintor','Armador','Topógrafo','Soldador',
    'Operador de Máquina','Técnico em Edificações','Engenheiro','Arquiteto','Outros'
];

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
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {notification.message}
        </div>
    ) : null;
    return { notify, Toast };
}

// ── Formulário de Curso ──────────────────────────────────────────────────────

interface CourseFormProps {
    orgId: string;
    course?: TrainingCourse | null;
    onClose: () => void;
    onSaved: () => void;
    notify: (message: string, type?: 'success' | 'error') => void;
}

const CourseForm: React.FC<CourseFormProps> = ({ orgId, course, onClose, onSaved, notify }) => {
    const isEditing = !!course;
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<Partial<TrainingCourse>>({
        org_id: orgId,
        nome: course?.nome || '',
        descricao: course?.descricao || '',
        nr_referencia: course?.nr_referencia || '',
        categoria: course?.categoria || 'NR_OBRIGATORIA',
        carga_horaria: course?.carga_horaria ?? 8,
        validade_meses: course?.validade_meses ?? undefined,
        instrutor: course?.instrutor || '',
        is_obrigatorio: course?.is_obrigatorio ?? false,
        roles_obrigatorios: course?.roles_obrigatorios || [],
        status: course?.status || 'ATIVO',
    });

    const set = <K extends keyof TrainingCourse>(k: K, v: TrainingCourse[K]) =>
        setForm(p => ({ ...p, [k]: v }));

    const toggleRole = (role: string) =>
        set('roles_obrigatorios', (form.roles_obrigatorios || []).includes(role)
            ? (form.roles_obrigatorios || []).filter(r => r !== role)
            : [...(form.roles_obrigatorios || []), role]
        );

    const handleSave = async () => {
        if (!form.nome?.trim()) { notify('Nome é obrigatório.', 'error'); return; }
        setSaving(true);
        try {
            if (isEditing && course?.id) {
                await laborService.updateTrainingCourse(course.id, form);
            } else {
                await laborService.createTrainingCourse(form as Omit<TrainingCourse, 'id' | 'created_at' | 'updated_at'>);
            }
            onSaved();
        } catch (err: any) {
            notify('Erro: ' + (err.message || 'Tente novamente.'), 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
                <div className="px-6 py-5 border-b flex items-center justify-between bg-gradient-to-r from-emerald-600 to-emerald-700">
                    <div>
                        <h3 className="text-lg font-black text-white">{isEditing ? 'Editar curso' : 'Novo curso / treinamento'}</h3>
                        <p className="text-emerald-100 text-xs mt-0.5">Catálogo de treinamentos da organização</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-[6px] text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <InputGroup label="Nome *">
                                <input value={form.nome} onChange={e => set('nome', e.target.value)} className={inputCls} placeholder="Ex: NR-35 — Trabalho em Altura" />
                            </InputGroup>
                        </div>
                        <InputGroup label="Categoria *">
                            <div className="relative">
                                <select value={form.categoria} onChange={e => set('categoria', e.target.value as TrainingCategoria)} className={inputCls + ' appearance-none pr-8'}>
                                    {(Object.entries(CAT_CONFIG) as [TrainingCategoria, typeof CAT_CONFIG[TrainingCategoria]][]).map(([k, v]) => (
                                        <option key={k} value={k}>{v.label}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                        </InputGroup>
                        <InputGroup label="NR de referência">
                            <input value={form.nr_referencia || ''} onChange={e => set('nr_referencia', e.target.value)} className={inputCls} placeholder="Ex: NR-35" />
                        </InputGroup>
                        <InputGroup label="Carga horária (h)">
                            <input type="number" min="0" step="0.5" value={form.carga_horaria} onChange={e => set('carga_horaria', parseFloat(e.target.value) || 0)} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Validade (meses, vazio = sem validade)">
                            <input type="number" min="0" value={form.validade_meses ?? ''} onChange={e => set('validade_meses', e.target.value ? parseInt(e.target.value) : undefined)} className={inputCls} placeholder="Ex: 12, 24..." />
                        </InputGroup>
                        <div className="md:col-span-2">
                            <InputGroup label="Instrutor padrão">
                                <input value={form.instrutor || ''} onChange={e => set('instrutor', e.target.value)} className={inputCls} />
                            </InputGroup>
                        </div>
                        <div className="md:col-span-2">
                            <InputGroup label="Descrição">
                                <textarea value={form.descricao || ''} onChange={e => set('descricao', e.target.value)} className={inputCls + ' resize-none h-16'} />
                            </InputGroup>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => set('is_obrigatorio', !form.is_obrigatorio)}
                            className={`flex items-center gap-2 h-9 px-3 rounded-[6px] border text-sm font-medium transition-all ${form.is_obrigatorio ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                        >
                            <Shield className="w-3.5 h-3.5" />
                            {form.is_obrigatorio ? 'Obrigatório' : 'Não obrigatório'}
                        </button>
                    </div>

                    {form.is_obrigatorio && (
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-slate-500">Funções que exigem este treinamento</p>
                            <div className="grid grid-cols-2 gap-1.5">
                                {ROLES.map(role => {
                                    const sel = (form.roles_obrigatorios || []).includes(role);
                                    return (
                                        <button key={role} type="button" onClick={() => toggleRole(role)}
                                            className={`text-left h-8 px-2.5 rounded-[6px] text-sm font-medium border transition-all ${sel ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                                            {role}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
                <div className="px-6 py-4 border-t flex items-center justify-end gap-3 bg-slate-50/50">
                    <Button variant="ghost" size="lg" onClick={onClose}>Cancelar</Button>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 h-9 px-3.5 bg-emerald-600 text-white rounded-[6px] hover:bg-emerald-700 font-medium text-[13px] disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {saving ? 'Salvando...' : (isEditing ? 'Salvar' : 'Criar curso')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Formulário de Treinamento de Colaborador ──────────────────────────────────

interface TrainingRecordFormProps {
    orgId: string;
    employees: Employee[];
    courses: TrainingCourse[];
    onClose: () => void;
    onSaved: () => void;
    notify: (message: string, type?: 'success' | 'error') => void;
}

const TrainingRecordForm: React.FC<TrainingRecordFormProps> = ({ orgId, employees, courses, onClose, onSaved, notify }) => {
    const [saving, setSaving] = useState(false);
    const [certFile, setCertFile] = useState<File | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const [form, setForm] = useState({
        org_id: orgId,
        employee_id: '',
        course_id: '',
        data_realizacao: new Date().toISOString().split('T')[0],
        data_validade: '',
        instrutor: '',
        local: '',
        carga_horaria: undefined as number | undefined,
        nota: undefined as number | undefined,
        aprovado: true,
        status: 'ATIVO' as EmployeeTraining['status'],
        observacoes: '',
    });

    const selectedCourse = courses.find(c => c.id === form.course_id);

    const handleSave = async () => {
        if (!form.employee_id || !form.course_id || !form.data_realizacao) {
            notify('Colaborador, curso e data são obrigatórios.', 'error');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                ...form,
                carga_horaria: form.carga_horaria || selectedCourse?.carga_horaria,
                data_validade: form.data_validade || undefined,
            };
            const created = await laborService.createEmployeeTraining(payload as any);
            if (certFile && created?.id) {
                await laborService.uploadTrainingCertificado(created.id, orgId, certFile);
            }
            onSaved();
        } catch (err: any) {
            notify('Erro: ' + (err.message || 'Tente novamente.'), 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
                <div className="px-6 py-5 border-b flex items-center justify-between bg-gradient-to-r from-indigo-600 to-indigo-700">
                    <div>
                        <h3 className="text-lg font-black text-white">Registrar treinamento</h3>
                        <p className="text-indigo-200 text-xs mt-0.5">Vincula treinamento realizado ao colaborador</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-[6px] text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <InputGroup label="Colaborador *">
                        <div className="relative">
                            <select value={form.employee_id} onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))} className={inputCls + ' appearance-none pr-8'}>
                                <option value="">Selecione...</option>
                                {employees.filter(emp => emp.status === 'ATIVO').map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.name} — {emp.role}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        </div>
                    </InputGroup>
                    <InputGroup label="Curso / treinamento *">
                        <div className="relative">
                            <select value={form.course_id} onChange={e => setForm(p => ({ ...p, course_id: e.target.value }))} className={inputCls + ' appearance-none pr-8'}>
                                <option value="">Selecione...</option>
                                {courses.filter(c => c.status === 'ATIVO').map(c => (
                                    <option key={c.id} value={c.id}>{c.nome}{c.nr_referencia ? ` (${c.nr_referencia})` : ''}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        </div>
                    </InputGroup>
                    {selectedCourse && (
                        <div className="p-3 bg-emerald-50 rounded-[6px] border border-emerald-100 text-xs font-medium text-emerald-800 flex items-center gap-2">
                            <Award className="w-4 h-4 text-emerald-600 shrink-0" />
                            {selectedCourse.carga_horaria}h
                            {selectedCourse.validade_meses ? ` · Validade: ${selectedCourse.validade_meses} meses` : ' · Sem validade'}
                            {selectedCourse.nr_referencia && ` · ${selectedCourse.nr_referencia}`}
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <InputGroup label="Data de realização *">
                            <input type="date" value={form.data_realizacao} onChange={e => setForm(p => ({ ...p, data_realizacao: e.target.value }))} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Data de validade (deixe em branco para calcular automaticamente)">
                            <input type="date" value={form.data_validade} onChange={e => setForm(p => ({ ...p, data_validade: e.target.value }))} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Instrutor">
                            <input value={form.instrutor} onChange={e => setForm(p => ({ ...p, instrutor: e.target.value }))} className={inputCls} placeholder={selectedCourse?.instrutor || ''} />
                        </InputGroup>
                        <InputGroup label="Local">
                            <input value={form.local} onChange={e => setForm(p => ({ ...p, local: e.target.value }))} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Nota (0-10)">
                            <input type="number" min="0" max="10" step="0.1" value={form.nota ?? ''} onChange={e => setForm(p => ({ ...p, nota: e.target.value ? parseFloat(e.target.value) : undefined }))} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Resultado">
                            <div className="relative">
                                <select value={form.aprovado ? 'true' : 'false'} onChange={e => setForm(p => ({ ...p, aprovado: e.target.value === 'true' }))} className={inputCls + ' appearance-none pr-8'}>
                                    <option value="true">Aprovado</option>
                                    <option value="false">Reprovado</option>
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                        </InputGroup>
                    </div>
                    <InputGroup label="Observações">
                        <textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} className={inputCls + ' resize-none h-16'} />
                    </InputGroup>
                    {/* Certificado */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500">Certificado (opcional)</label>
                        <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-slate-200 rounded-[10px] p-3 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-all">
                            {certFile ? (
                                <div className="flex items-center justify-center gap-2 text-indigo-700">
                                    <FileText className="w-4 h-4" />
                                    <span className="text-xs font-medium">{certFile.name}</span>
                                    <button onClick={e => { e.stopPropagation(); setCertFile(null); }} className="ml-2 text-slate-400 hover:text-rose-500"><X className="w-3.5 h-3.5" /></button>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center gap-2">
                                    <Upload className="w-4 h-4 text-slate-300" />
                                    <span className="text-xs text-slate-400 font-medium">Anexar certificado PDF/imagem</span>
                                </div>
                            )}
                        </div>
                        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => setCertFile(e.target.files?.[0] || null)} />
                    </div>
                </div>
                <div className="px-6 py-4 border-t flex items-center justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 h-9 px-3.5 bg-indigo-600 text-white rounded-[6px] hover:bg-indigo-700 font-medium text-[13px] disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {saving ? 'Registrando...' : 'Registrar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Componente principal ─────────────────────────────────────────────────────

interface LaborTrainingsProps {
    orgId: string;
    employees: Employee[];
    onRefresh?: () => void;
    organizations: Array<{ id: string; name: string }>;
    selectedOrgId?: string;
    onSelectedOrgIdChange: (orgId: string | undefined) => void;
}

type TView = 'records' | 'catalog';

const RECORD_COLUMNS: ColumnConfig[] = [
    { key: 'employee', label: 'Colaborador', sortable: true },
    { key: 'course', label: 'Curso / NR', sortable: true },
    { key: 'realizado', label: 'Realizado em', sortable: true },
    { key: 'validade', label: 'Validade', sortable: true },
    { key: 'nota', label: 'Nota', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const COURSE_COLUMNS: ColumnConfig[] = [
    { key: 'nome', label: 'Curso', sortable: true },
    { key: 'categoria', label: 'Categoria', sortable: true },
    { key: 'nr', label: 'NR', sortable: true },
    { key: 'carga', label: 'Carga', sortable: true },
    { key: 'validade', label: 'Validade', sortable: true },
    { key: 'obrigatorio', label: 'Obrigatório', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const LaborTrainings: React.FC<LaborTrainingsProps> = ({ orgId, employees, onRefresh, organizations, selectedOrgId, onSelectedOrgIdChange }) => {
    const qc = useQueryClient();
    const confirm = useConfirm();
    const { notify, Toast } = useToast();
    const [view, setView] = usePersistedState<TView>('laborTrainings:view', 'records');
    const [search, setSearch] = usePersistedState('laborTrainings:search', '');
    const [filterEmployee, setFilterEmployee] = usePersistedState('laborTrainings:employee', '');
    const [filterStatus, setFilterStatus] = usePersistedState<EmployeeTraining['status'] | ''>('laborTrainings:status', '');
    const [showCourseForm, setShowCourseForm] = useState(false);
    const [editingCourse, setEditingCourse] = useState<TrainingCourse | null>(null);
    const [showRecordForm, setShowRecordForm] = useState(false);
    const recordColumns = useTableColumns(RECORD_COLUMNS, 'laborTrainingsRecordColumns');
    const courseColumns = useTableColumns(COURSE_COLUMNS, 'laborTrainingsCourseColumns');

    const coursesKey    = [...laborKeys.all, 'trainingCourses', orgId];
    const recordsKey    = [...laborKeys.all, 'employeeTrainings', orgId, filterEmployee, filterStatus];
    const alertsKey     = [...laborKeys.all, 'trainingAlerts', orgId];

    const { data: courses = [], isLoading: loadingCourses } = useQuery({
        queryKey: coursesKey,
        queryFn: () => laborService.listTrainingCourses(orgId),
        staleTime: STALE.normal,
        enabled: !!orgId,
    });

    const { data: records = [], isLoading: loadingRecords } = useQuery({
        queryKey: recordsKey,
        queryFn: () => laborService.listEmployeeTrainings({
            orgId,
            employeeId: filterEmployee || undefined,
            status: filterStatus || undefined,
        }),
        staleTime: STALE.fast,
        enabled: !!orgId,
    });

    const { data: alerts = [] } = useQuery({
        queryKey: alertsKey,
        queryFn: () => laborService.getTrainingAlerts(orgId),
        staleTime: STALE.normal,
        enabled: !!orgId,
    });

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: coursesKey });
        qc.invalidateQueries({ queryKey: recordsKey });
        qc.invalidateQueries({ queryKey: alertsKey });
    };

    const deleteCourse = useMutation({
        mutationFn: (id: string) => laborService.deleteTrainingCourse(id),
        onSuccess: () => { invalidate(); notify('Curso inativado.'); },
        onError: () => notify('Erro ao inativar curso.', 'error'),
    });
    const deleteRecord = useMutation({
        mutationFn: (id: string) => laborService.deleteEmployeeTraining(id),
        onSuccess: () => { invalidate(); notify('Registro excluído.'); },
        onError: () => notify('Erro ao excluir registro.', 'error'),
    });

    const handleDeleteRecord = async (id: string) => {
        const ok = await confirm({ title: 'Excluir registro?', message: 'Este registro de treinamento será removido permanentemente.', variant: 'danger', confirmLabel: 'Excluir' });
        if (ok) deleteRecord.mutate(id);
    };

    const handleDeactivateCourse = async (id: string) => {
        const ok = await confirm({ title: 'Inativar curso?', message: 'O curso deixará de aparecer como opção para novos registros.', variant: 'warning', confirmLabel: 'Inativar' });
        if (ok) deleteCourse.mutate(id);
    };

    // KPIs
    const activeRecords = records.filter(r => r.status === 'ATIVO').length;
    const expiredRecords = records.filter(r => r.status === 'VENCIDO').length;
    const activeCourses = courses.filter(c => c.status === 'ATIVO').length;

    const filteredRecordsBase = records.filter(r =>
        !search ||
        (r.employee_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.course_nome || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.nr_referencia || '').toLowerCase().includes(search.toLowerCase())
    );
    const filteredCoursesBase = courses.filter(c =>
        !search ||
        c.nome.toLowerCase().includes(search.toLowerCase()) ||
        (c.nr_referencia || '').toLowerCase().includes(search.toLowerCase())
    );

    const filteredRecords = useMemo(() => {
        if (!recordColumns.sortColumn) return filteredRecordsBase;
        const dir = recordColumns.sortDirection === 'asc' ? 1 : -1;
        return [...filteredRecordsBase].sort((a, b) => {
            switch (recordColumns.sortColumn) {
                case 'employee': return dir * (a.employee_name || '').localeCompare(b.employee_name || '');
                case 'course': return dir * (a.course_nome || '').localeCompare(b.course_nome || '');
                case 'realizado': return dir * a.data_realizacao.localeCompare(b.data_realizacao);
                case 'validade': return dir * (a.data_validade || '').localeCompare(b.data_validade || '');
                case 'nota': return dir * ((a.nota ?? -1) - (b.nota ?? -1));
                case 'status': return dir * a.status.localeCompare(b.status);
                default: return 0;
            }
        });
    }, [filteredRecordsBase, recordColumns.sortColumn, recordColumns.sortDirection]);

    const filteredCourses = useMemo(() => {
        if (!courseColumns.sortColumn) return filteredCoursesBase;
        const dir = courseColumns.sortDirection === 'asc' ? 1 : -1;
        return [...filteredCoursesBase].sort((a, b) => {
            switch (courseColumns.sortColumn) {
                case 'nome': return dir * a.nome.localeCompare(b.nome);
                case 'categoria': return dir * a.categoria.localeCompare(b.categoria);
                case 'nr': return dir * (a.nr_referencia || '').localeCompare(b.nr_referencia || '');
                case 'carga': return dir * (a.carga_horaria - b.carga_horaria);
                case 'validade': return dir * ((a.validade_meses ?? -1) - (b.validade_meses ?? -1));
                case 'obrigatorio': return dir * (Number(a.is_obrigatorio) - Number(b.is_obrigatorio));
                default: return 0;
            }
        });
    }, [filteredCoursesBase, courseColumns.sortColumn, courseColumns.sortDirection]);

    return (
        <div className="space-y-6">
            {/* Cabeçalho de tela (§20) */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Treinamentos</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">NRs, certificados e controle de vencimento por colaborador.</p>
            </div>

            {/* Alertas */}
            {alerts.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-[10px] flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-semibold text-amber-900">
                            {alerts.length} treinamento{alerts.length > 1 ? 's' : ''} vencendo em 30 dias
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                            {alerts.slice(0, 4).map(a => `${a.employee_name} — ${a.course_nome}`).join(' · ')}
                            {alerts.length > 4 && ` e mais ${alerts.length - 4}…`}
                        </p>
                    </div>
                </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard label="Cursos Ativos" value={`${activeCourses}`} icon={<BookOpen className="w-5 h-5" />} color="emerald" />
                <KpiCard label="Registros Ativos" value={`${activeRecords}`} icon={<CheckCircle2 className="w-5 h-5" />} color="indigo" />
                <KpiCard label="Treinamentos Vencidos" value={`${expiredRecords}`} icon={<XCircle className="w-5 h-5" />} color="rose" />
                <KpiCard label="Alertas 30 Dias" value={`${alerts.length}`} icon={<AlertTriangle className="w-5 h-5" />} color="amber" />
            </div>

            <LaborScopeBar
                organizations={organizations}
                selectedOrgId={selectedOrgId}
                onSelectedOrgIdChange={onSelectedOrgIdChange}
                onRefresh={onRefresh || (() => {})}
            />

            {/* Abas + Toolbar acoplada (§5.2) */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white space-y-3">
                    <div className="flex items-center gap-1 bg-slate-100 rounded-[10px] p-1 w-fit">
                        {([['records', 'Registros', Users], ['catalog', 'Catálogo de Cursos', BookOpen]] as const).map(([id, label, Icon]) => (
                            <button key={id} onClick={() => setView(id)}
                                className={`flex items-center gap-2 h-8 px-3.5 rounded-[6px] text-sm font-medium transition-all ${view === id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                                <Icon className="w-3.5 h-3.5" />{label}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder={view === 'records' ? 'Buscar colaborador, curso ou NR...' : 'Buscar curso ou NR...'}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                            />
                        </div>
                        {view === 'records' && (
                            <>
                                <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} className="h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium outline-none">
                                    <option value="">Todos</option>
                                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select>
                                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as EmployeeTraining['status'] | '')} className="h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium outline-none">
                                    <option value="">Todos status</option>
                                    <option value="ATIVO">Ativo</option>
                                    <option value="VENCIDO">Vencido</option>
                                    <option value="PENDENTE">Pendente</option>
                                </select>
                            </>
                        )}
                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={view === 'records' ? RECORD_COLUMNS.filter(c => c.key !== 'actions') : COURSE_COLUMNS.filter(c => c.key !== 'actions')}
                                visibleColumns={view === 'records' ? recordColumns.visibleColumns : courseColumns.visibleColumns}
                                showColumnConfig={view === 'records' ? recordColumns.showColumnConfig : courseColumns.showColumnConfig}
                                onToggleShow={() => view === 'records' ? recordColumns.setShowColumnConfig(!recordColumns.showColumnConfig) : courseColumns.setShowColumnConfig(!courseColumns.showColumnConfig)}
                                onToggleColumn={view === 'records' ? recordColumns.toggleColumn : courseColumns.toggleColumn}
                                onReset={view === 'records' ? recordColumns.resetColumns : courseColumns.resetColumns}
                            />
                        </div>
                        <button
                            onClick={() => view === 'records' ? setShowRecordForm(true) : (setEditingCourse(null), setShowCourseForm(true))}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-indigo-600 text-white rounded-[6px] hover:bg-indigo-700 transition-all font-medium text-[13px] active:scale-95 shrink-0">
                            <Plus className="w-[15px] h-[15px]" />
                            {view === 'records' ? 'Registrar treinamento' : 'Novo curso'}
                        </button>
                    </div>
                </div>

                {/* Registros */}
                {view === 'records' && (
                    loadingRecords ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500">Carregando...</p>
                        </div>
                    ) : filteredRecords.length === 0 ? (
                        <div className="text-center py-12">
                            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum treinamento registrado</h3>
                        </div>
                    ) : (
                        <div className="overflow-auto max-h-[70vh]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        {recordColumns.visibleColumns.includes('employee') && (
                                            <SortableHeader label="Colaborador" colKey="employee" uppercase={false} sortColumn={recordColumns.sortColumn} sortDirection={recordColumns.sortDirection} onSort={recordColumns.handleColumnSort} className="px-4 py-2 border-r border-gray-100" />
                                        )}
                                        {recordColumns.visibleColumns.includes('course') && (
                                            <SortableHeader label="Curso / NR" colKey="course" uppercase={false} sortColumn={recordColumns.sortColumn} sortDirection={recordColumns.sortDirection} onSort={recordColumns.handleColumnSort} className="px-4 py-2 border-r border-gray-100" />
                                        )}
                                        {recordColumns.visibleColumns.includes('realizado') && (
                                            <SortableHeader label="Realizado em" colKey="realizado" uppercase={false} sortColumn={recordColumns.sortColumn} sortDirection={recordColumns.sortDirection} onSort={recordColumns.handleColumnSort} className="px-4 py-2 border-r border-gray-100" />
                                        )}
                                        {recordColumns.visibleColumns.includes('validade') && (
                                            <SortableHeader label="Validade" colKey="validade" uppercase={false} sortColumn={recordColumns.sortColumn} sortDirection={recordColumns.sortDirection} onSort={recordColumns.handleColumnSort} className="px-4 py-2 border-r border-gray-100" />
                                        )}
                                        {recordColumns.visibleColumns.includes('nota') && (
                                            <SortableHeader label="Nota" colKey="nota" uppercase={false} sortColumn={recordColumns.sortColumn} sortDirection={recordColumns.sortDirection} onSort={recordColumns.handleColumnSort} className="px-4 py-2 border-r border-gray-100" />
                                        )}
                                        {recordColumns.visibleColumns.includes('status') && (
                                            <SortableHeader label="Status" colKey="status" uppercase={false} sortColumn={recordColumns.sortColumn} sortDirection={recordColumns.sortDirection} onSort={recordColumns.handleColumnSort} className="px-4 py-2 border-r border-gray-100" />
                                        )}
                                        {recordColumns.visibleColumns.includes('actions') && (
                                            <th className="px-4 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {filteredRecords.map(r => {
                                        const statusColor = STATUS_COLORS[r.status] ?? 'text-gray-600';
                                        const today = new Date().toISOString().split('T')[0];
                                        const expiring = r.data_validade && r.data_validade <= new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
                                        return (
                                            <tr key={r.id} className="hover:bg-blue-50/50 transition-colors">
                                                {recordColumns.visibleColumns.includes('employee') && (
                                                    <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-900">{r.employee_name || '—'}</td>
                                                )}
                                                {recordColumns.visibleColumns.includes('course') && (
                                                    <td className="px-4 py-2.5 border-r border-gray-100">
                                                        <p className="text-sm font-normal text-gray-800">{r.course_nome || '—'}</p>
                                                        {r.nr_referencia && <p className="text-xs font-medium text-rose-600">{r.nr_referencia}</p>}
                                                    </td>
                                                )}
                                                {recordColumns.visibleColumns.includes('realizado') && (
                                                    <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-500">{r.data_realizacao}</td>
                                                )}
                                                {recordColumns.visibleColumns.includes('validade') && (
                                                    <td className="px-4 py-2.5 border-r border-gray-100">
                                                        {r.data_validade ? (
                                                            <span className={`text-sm font-normal ${expiring ? 'text-amber-700' : r.data_validade < today ? 'text-rose-700' : 'text-gray-600'}`}>
                                                                {expiring ? '⏰ ' : r.data_validade < today ? '⚠ ' : ''}{r.data_validade}
                                                            </span>
                                                        ) : <span className="text-sm font-normal text-gray-400">Sem validade</span>}
                                                    </td>
                                                )}
                                                {recordColumns.visibleColumns.includes('nota') && (
                                                    <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal">
                                                        {r.nota != null ? (
                                                            <span className={r.aprovado ? 'text-emerald-700' : 'text-rose-700'}>{r.nota}</span>
                                                        ) : <span className="text-gray-400">—</span>}
                                                    </td>
                                                )}
                                                {recordColumns.visibleColumns.includes('status') && (
                                                    <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal">
                                                        <span className={statusColor}>{r.status}</span>
                                                    </td>
                                                )}
                                                {recordColumns.visibleColumns.includes('actions') && (
                                                    <td className="px-4 py-2.5 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            {r.certificado_url && (
                                                                <span className="p-1.5 text-indigo-400" title="Certificado anexado"><Award className="w-4 h-4" /></span>
                                                            )}
                                                            <ActionIconButton kind="delete" onClick={() => handleDeleteRecord(r.id)} />
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )
                )}

                {/* Catálogo */}
                {view === 'catalog' && (
                    loadingCourses ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500">Carregando...</p>
                        </div>
                    ) : filteredCourses.length === 0 ? (
                        <div className="text-center py-12">
                            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum curso cadastrado</h3>
                        </div>
                    ) : (
                        <div className="overflow-auto max-h-[70vh]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        {courseColumns.visibleColumns.includes('nome') && (
                                            <SortableHeader label="Curso" colKey="nome" uppercase={false} sortColumn={courseColumns.sortColumn} sortDirection={courseColumns.sortDirection} onSort={courseColumns.handleColumnSort} className="px-4 py-2 border-r border-gray-100" />
                                        )}
                                        {courseColumns.visibleColumns.includes('categoria') && (
                                            <SortableHeader label="Categoria" colKey="categoria" uppercase={false} sortColumn={courseColumns.sortColumn} sortDirection={courseColumns.sortDirection} onSort={courseColumns.handleColumnSort} className="px-4 py-2 border-r border-gray-100" />
                                        )}
                                        {courseColumns.visibleColumns.includes('nr') && (
                                            <SortableHeader label="NR" colKey="nr" uppercase={false} sortColumn={courseColumns.sortColumn} sortDirection={courseColumns.sortDirection} onSort={courseColumns.handleColumnSort} className="px-4 py-2 border-r border-gray-100" />
                                        )}
                                        {courseColumns.visibleColumns.includes('carga') && (
                                            <SortableHeader label="Carga" colKey="carga" uppercase={false} sortColumn={courseColumns.sortColumn} sortDirection={courseColumns.sortDirection} onSort={courseColumns.handleColumnSort} className="px-4 py-2 border-r border-gray-100" />
                                        )}
                                        {courseColumns.visibleColumns.includes('validade') && (
                                            <SortableHeader label="Validade" colKey="validade" uppercase={false} sortColumn={courseColumns.sortColumn} sortDirection={courseColumns.sortDirection} onSort={courseColumns.handleColumnSort} className="px-4 py-2 border-r border-gray-100" />
                                        )}
                                        {courseColumns.visibleColumns.includes('obrigatorio') && (
                                            <SortableHeader label="Obrigatório" colKey="obrigatorio" uppercase={false} sortColumn={courseColumns.sortColumn} sortDirection={courseColumns.sortDirection} onSort={courseColumns.handleColumnSort} className="px-4 py-2 border-r border-gray-100" />
                                        )}
                                        {courseColumns.visibleColumns.includes('actions') && (
                                            <th className="px-4 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {filteredCourses.map(c => {
                                        const cat = CAT_CONFIG[c.categoria];
                                        return (
                                            <tr key={c.id} className="hover:bg-blue-50/50 transition-colors">
                                                {courseColumns.visibleColumns.includes('nome') && (
                                                    <td className="px-4 py-2.5 border-r border-gray-100">
                                                        <p className="text-sm font-normal text-gray-900">{c.nome}</p>
                                                        {c.instrutor && <p className="text-xs text-gray-400">{c.instrutor}</p>}
                                                    </td>
                                                )}
                                                {courseColumns.visibleColumns.includes('categoria') && (
                                                    <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal">
                                                        <span className={cat.color}>{cat.label}</span>
                                                    </td>
                                                )}
                                                {courseColumns.visibleColumns.includes('nr') && (
                                                    <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal text-rose-600">{c.nr_referencia || '—'}</td>
                                                )}
                                                {courseColumns.visibleColumns.includes('carga') && (
                                                    <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{c.carga_horaria}h</td>
                                                )}
                                                {courseColumns.visibleColumns.includes('validade') && (
                                                    <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-500">
                                                        {c.validade_meses ? `${c.validade_meses} meses` : 'Sem validade'}
                                                    </td>
                                                )}
                                                {courseColumns.visibleColumns.includes('obrigatorio') && (
                                                    <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal">
                                                        {c.is_obrigatorio ? (
                                                            <span className="flex items-center gap-1 text-rose-700">
                                                                <Shield className="w-3.5 h-3.5" /> Sim
                                                            </span>
                                                        ) : <span className="text-gray-400">Não</span>}
                                                    </td>
                                                )}
                                                {courseColumns.visibleColumns.includes('actions') && (
                                                    <td className="px-4 py-2.5 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <ActionIconButton kind="edit" icon={<Eye className="w-4 h-4" />} onClick={() => { setEditingCourse(c); setShowCourseForm(true); }} />
                                                            <ActionIconButton kind="delete" title="Inativar" onClick={() => handleDeactivateCourse(c.id)} />
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )
                )}
            </div>

            {showCourseForm && (
                <CourseForm orgId={orgId} course={editingCourse} onClose={() => { setShowCourseForm(false); setEditingCourse(null); }} onSaved={() => { setShowCourseForm(false); setEditingCourse(null); invalidate(); notify(editingCourse ? 'Curso atualizado.' : 'Curso criado.'); }} notify={notify} />
            )}
            {showRecordForm && (
                <TrainingRecordForm orgId={orgId} employees={employees} courses={courses} onClose={() => setShowRecordForm(false)} onSaved={() => { setShowRecordForm(false); invalidate(); notify('Treinamento registrado.'); }} notify={notify} />
            )}
            <Toast />
        </div>
    );
};

export default LaborTrainings;
