import React, { useState, useRef } from 'react';
import {
    BookOpen, Plus, X, ChevronDown, Loader2, Search,
    AlertTriangle, CheckCircle2, FileText, Trash2, Eye,
    Upload, Award, Clock, Users, Shield
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    laborService, Employee,
    TrainingCourse, TrainingCategoria, EmployeeTraining
} from '../services/laborService';
import { laborKeys } from '../lib/queryKeys';
import { STALE } from '../lib/queryClient';

// ── Helpers ──────────────────────────────────────────────────────────────────

const CAT_CONFIG: Record<TrainingCategoria, { label: string; color: string; bg: string }> = {
    NR_OBRIGATORIA: { label: 'NR Obrigatória', color: 'text-rose-700',    bg: 'bg-rose-100' },
    INTEGRACAO:     { label: 'Integração',      color: 'text-indigo-700',  bg: 'bg-indigo-100' },
    DDS:            { label: 'DDS',             color: 'text-amber-700',   bg: 'bg-amber-100' },
    QUALIDADE:      { label: 'Qualidade',       color: 'text-emerald-700', bg: 'bg-emerald-100' },
    LIDERANCA:      { label: 'Liderança',       color: 'text-purple-700',  bg: 'bg-purple-100' },
    TECNICO:        { label: 'Técnico',         color: 'text-blue-700',    bg: 'bg-blue-100' },
    OUTROS:         { label: 'Outros',          color: 'text-slate-700',   bg: 'bg-slate-100' },
};

const STATUS_COLORS = {
    ATIVO:    { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    VENCIDO:  { bg: 'bg-rose-100',    text: 'text-rose-700' },
    PENDENTE: { bg: 'bg-amber-100',   text: 'text-amber-700' },
};

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all';
const InputGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
        {children}
    </div>
);

const ROLES = [
    'Mestre de Obras','Pedreiro','Servente','Carpinteiro','Encanador',
    'Eletricista','Pintor','Armador','Topógrafo','Soldador',
    'Operador de Máquina','Técnico em Edificações','Engenheiro','Arquiteto','Outros'
];

// ── Formulário de Curso ──────────────────────────────────────────────────────

interface CourseFormProps {
    orgId: string;
    course?: TrainingCourse | null;
    onClose: () => void;
    onSaved: () => void;
}

const CourseForm: React.FC<CourseFormProps> = ({ orgId, course, onClose, onSaved }) => {
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
        if (!form.nome?.trim()) { alert('Nome é obrigatório.'); return; }
        setSaving(true);
        try {
            if (isEditing && course?.id) {
                await laborService.updateTrainingCourse(course.id, form);
            } else {
                await laborService.createTrainingCourse(form as Omit<TrainingCourse, 'id' | 'created_at' | 'updated_at'>);
            }
            onSaved();
        } catch (err: any) {
            alert('Erro: ' + (err.message || 'Tente novamente.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
                <div className="px-6 py-5 border-b flex items-center justify-between bg-gradient-to-r from-emerald-600 to-emerald-700">
                    <div>
                        <h2 className="text-lg font-black text-white">{isEditing ? 'Editar Curso' : 'Novo Curso / Treinamento'}</h2>
                        <p className="text-emerald-100 text-xs mt-0.5">Catálogo de treinamentos da organização</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white"><X className="w-5 h-5" /></button>
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
                        <InputGroup label="NR de Referência">
                            <input value={form.nr_referencia || ''} onChange={e => set('nr_referencia', e.target.value)} className={inputCls} placeholder="Ex: NR-35" />
                        </InputGroup>
                        <InputGroup label="Carga Horária (h)">
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
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${form.is_obrigatorio ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                        >
                            <Shield className="w-3.5 h-3.5" />
                            {form.is_obrigatorio ? 'Obrigatório' : 'Não obrigatório'}
                        </button>
                    </div>

                    {form.is_obrigatorio && (
                        <div className="space-y-2">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Funções que exigem este treinamento</p>
                            <div className="grid grid-cols-2 gap-1.5">
                                {ROLES.map(role => {
                                    const sel = (form.roles_obrigatorios || []).includes(role);
                                    return (
                                        <button key={role} type="button" onClick={() => toggleRole(role)}
                                            className={`text-left px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${sel ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                                            {role}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
                <div className="px-6 py-4 border-t flex items-center justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-bold text-sm shadow-lg disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {saving ? 'Salvando...' : (isEditing ? 'Salvar' : 'Criar Curso')}
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
}

const TrainingRecordForm: React.FC<TrainingRecordFormProps> = ({ orgId, employees, courses, onClose, onSaved }) => {
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
            alert('Colaborador, curso e data são obrigatórios.');
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
            alert('Erro: ' + (err.message || 'Tente novamente.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
                <div className="px-6 py-5 border-b flex items-center justify-between bg-gradient-to-r from-indigo-600 to-indigo-700">
                    <div>
                        <h2 className="text-lg font-black text-white">Registrar Treinamento</h2>
                        <p className="text-indigo-200 text-xs mt-0.5">Vincula treinamento realizado ao colaborador</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white"><X className="w-5 h-5" /></button>
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
                    <InputGroup label="Curso / Treinamento *">
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
                        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 text-xs font-bold text-emerald-800 flex items-center gap-2">
                            <Award className="w-4 h-4 text-emerald-600 shrink-0" />
                            {selectedCourse.carga_horaria}h
                            {selectedCourse.validade_meses ? ` · Validade: ${selectedCourse.validade_meses} meses` : ' · Sem validade'}
                            {selectedCourse.nr_referencia && ` · ${selectedCourse.nr_referencia}`}
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <InputGroup label="Data de Realização *">
                            <input type="date" value={form.data_realizacao} onChange={e => setForm(p => ({ ...p, data_realizacao: e.target.value }))} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Data de Validade (deixe em branco para calcular automaticamente)">
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
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Certificado (opcional)</label>
                        <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-slate-200 rounded-xl p-3 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-all">
                            {certFile ? (
                                <div className="flex items-center justify-center gap-2 text-indigo-700">
                                    <FileText className="w-4 h-4" />
                                    <span className="text-xs font-bold">{certFile.name}</span>
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
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold text-sm shadow-lg disabled:opacity-50">
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
}

type TView = 'records' | 'catalog';

const LaborTrainings: React.FC<LaborTrainingsProps> = ({ orgId, employees }) => {
    const qc = useQueryClient();
    const [view, setView] = useState<TView>('records');
    const [search, setSearch] = useState('');
    const [filterEmployee, setFilterEmployee] = useState('');
    const [filterStatus, setFilterStatus] = useState<EmployeeTraining['status'] | ''>('');
    const [showCourseForm, setShowCourseForm] = useState(false);
    const [editingCourse, setEditingCourse] = useState<TrainingCourse | null>(null);
    const [showRecordForm, setShowRecordForm] = useState(false);

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

    const deleteCourse   = useMutation({ mutationFn: (id: string) => laborService.deleteTrainingCourse(id),   onSuccess: invalidate });
    const deleteRecord   = useMutation({ mutationFn: (id: string) => laborService.deleteEmployeeTraining(id), onSuccess: invalidate });

    // KPIs
    const activeRecords = records.filter(r => r.status === 'ATIVO').length;
    const expiredRecords = records.filter(r => r.status === 'VENCIDO').length;
    const activeCourses = courses.filter(c => c.status === 'ATIVO').length;

    const filteredRecords = records.filter(r =>
        !search ||
        (r.employee_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.course_nome || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.nr_referencia || '').toLowerCase().includes(search.toLowerCase())
    );
    const filteredCourses = courses.filter(c =>
        !search ||
        c.nome.toLowerCase().includes(search.toLowerCase()) ||
        (c.nr_referencia || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* Alertas */}
            {alerts.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-black text-amber-900 uppercase tracking-tight">
                            {alerts.length} treinamento{alerts.length > 1 ? 's' : ''} vencendo em 30 dias
                        </p>
                        <p className="text-[11px] text-amber-700 mt-1">
                            {alerts.slice(0, 4).map(a => `${a.employee_name} — ${a.course_nome}`).join(' · ')}
                            {alerts.length > 4 && ` e mais ${alerts.length - 4}…`}
                        </p>
                    </div>
                </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Cursos Ativos',       value: activeCourses,  bg: 'bg-emerald-50', text: 'text-emerald-700' },
                    { label: 'Registros Ativos',    value: activeRecords,  bg: 'bg-indigo-50',  text: 'text-indigo-700' },
                    { label: 'Treinamentos Vencidos', value: expiredRecords, bg: 'bg-rose-50',   text: 'text-rose-700' },
                    { label: 'Alertas 30 dias',     value: alerts.length,  bg: 'bg-amber-50',   text: 'text-amber-700' },
                ].map(({ label, value, bg, text }) => (
                    <div key={label} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                        <p className={`text-2xl font-black ${text} ${bg} px-2 py-0.5 rounded-lg inline-block`}>{value}</p>
                    </div>
                ))}
            </div>

            {/* Controls */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
                <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1">
                    {([['records', 'Registros', Users], ['catalog', 'Catálogo de Cursos', BookOpen]] as const).map(([id, label, Icon]) => (
                        <button key={id} onClick={() => setView(id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${view === id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                            <Icon className="w-3.5 h-3.5" />{label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-100 w-40" />
                    </div>
                    {view === 'records' && (
                        <>
                            <div className="relative">
                                <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} className="pl-3 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none appearance-none">
                                    <option value="">Todos</option>
                                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                            </div>
                            <div className="relative">
                                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as EmployeeTraining['status'] | '')} className="pl-3 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none appearance-none">
                                    <option value="">Todos status</option>
                                    <option value="ATIVO">Ativo</option>
                                    <option value="VENCIDO">Vencido</option>
                                    <option value="PENDENTE">Pendente</option>
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                            </div>
                        </>
                    )}
                    <button
                        onClick={() => view === 'records' ? setShowRecordForm(true) : (setEditingCourse(null), setShowCourseForm(true))}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-bold text-xs shadow-md">
                        <Plus className="w-3.5 h-3.5" />
                        {view === 'records' ? 'Registrar Treinamento' : 'Novo Curso'}
                    </button>
                </div>
            </div>

            {/* Registros */}
            {view === 'records' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    {loadingRecords ? (
                        <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-indigo-500 animate-spin" /></div>
                    ) : filteredRecords.length === 0 ? (
                        <div className="text-center py-16">
                            <BookOpen className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-black text-slate-400">Nenhum treinamento registrado</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    {['Colaborador', 'Curso / NR', 'Realizado em', 'Validade', 'Nota', 'Status', ''].map(h => (
                                        <th key={h} className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRecords.map(r => {
                                    const sc = STATUS_COLORS[r.status];
                                    const today = new Date().toISOString().split('T')[0];
                                    const expiring = r.data_validade && r.data_validade <= new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
                                    return (
                                        <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                            <td className="px-4 py-3 text-sm font-bold text-slate-900">{r.employee_name || '—'}</td>
                                            <td className="px-4 py-3">
                                                <p className="text-sm font-bold text-slate-800">{r.course_nome || '—'}</p>
                                                {r.nr_referencia && <p className="text-[10px] font-black text-rose-600">{r.nr_referencia}</p>}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-slate-500 font-medium">{r.data_realizacao}</td>
                                            <td className="px-4 py-3">
                                                {r.data_validade ? (
                                                    <span className={`text-xs font-black ${expiring ? 'text-amber-700' : r.data_validade < today ? 'text-rose-700' : 'text-slate-600'}`}>
                                                        {expiring ? '⏰ ' : r.data_validade < today ? '⚠ ' : ''}{r.data_validade}
                                                    </span>
                                                ) : <span className="text-xs text-slate-400">Sem validade</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                {r.nota != null ? (
                                                    <span className={`text-sm font-black px-2 py-0.5 rounded-lg ${r.aprovado ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{r.nota}</span>
                                                ) : '—'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${sc.bg} ${sc.text}`}>{r.status}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1">
                                                    {r.certificado_url && (
                                                        <span className="p-1.5 text-indigo-400" title="Certificado anexado"><Award className="w-3.5 h-3.5" /></span>
                                                    )}
                                                    <button onClick={() => { if (confirm('Excluir este registro?')) deleteRecord.mutate(r.id); }} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Catálogo */}
            {view === 'catalog' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    {loadingCourses ? (
                        <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-indigo-500 animate-spin" /></div>
                    ) : filteredCourses.length === 0 ? (
                        <div className="text-center py-16">
                            <BookOpen className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-black text-slate-400">Nenhum curso cadastrado</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    {['Curso', 'Categoria', 'NR', 'Carga', 'Validade', 'Obrigatório', ''].map(h => (
                                        <th key={h} className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCourses.map(c => {
                                    const cat = CAT_CONFIG[c.categoria];
                                    return (
                                        <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                            <td className="px-4 py-3">
                                                <p className="text-sm font-bold text-slate-900">{c.nome}</p>
                                                {c.instrutor && <p className="text-[11px] text-slate-400">{c.instrutor}</p>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${cat.bg} ${cat.color}`}>{cat.label}</span>
                                            </td>
                                            <td className="px-4 py-3 text-xs font-black text-rose-600">{c.nr_referencia || '—'}</td>
                                            <td className="px-4 py-3 text-xs font-bold text-slate-600">{c.carga_horaria}h</td>
                                            <td className="px-4 py-3 text-xs text-slate-500">
                                                {c.validade_meses ? `${c.validade_meses} meses` : 'Sem validade'}
                                            </td>
                                            <td className="px-4 py-3">
                                                {c.is_obrigatorio ? (
                                                    <span className="flex items-center gap-1 text-[10px] font-black text-rose-700">
                                                        <Shield className="w-3 h-3" /> Sim
                                                    </span>
                                                ) : <span className="text-[10px] text-slate-400">Não</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => { setEditingCourse(c); setShowCourseForm(true); }} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors">
                                                        <Eye className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => { if (confirm('Inativar este curso?')) deleteCourse.mutate(c.id); }} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {showCourseForm && (
                <CourseForm orgId={orgId} course={editingCourse} onClose={() => { setShowCourseForm(false); setEditingCourse(null); }} onSaved={() => { setShowCourseForm(false); setEditingCourse(null); invalidate(); }} />
            )}
            {showRecordForm && (
                <TrainingRecordForm orgId={orgId} employees={employees} courses={courses} onClose={() => setShowRecordForm(false)} onSaved={() => { setShowRecordForm(false); invalidate(); }} />
            )}
        </div>
    );
};

export default LaborTrainings;
