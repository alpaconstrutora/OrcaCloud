import React, { useState } from 'react';
import {
    ShieldAlert, Plus, X, ChevronDown, Loader2, Search,
    AlertTriangle, CheckCircle2, FileText, Trash2, Eye,
    Activity, Users, Clock, Stethoscope, ClipboardList, BookOpen,
    Pencil, Calendar, Building2
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    laborService, Employee,
    Accident, AccidentTipo, AccidentGravidade,
    SstChecklist, SstIndicators,
    SSTRegulatoryDoc, SSTDocTipo, SSTDocStatus
} from '../services/laborService';
import { laborKeys } from '../lib/queryKeys';
import { STALE } from '../lib/queryClient';

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all';
const InputGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
        {children}
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Accidents
// ─────────────────────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<AccidentTipo, string> = {
    TIPICO: 'Típico', TRAJETO: 'Trajeto',
    DOENCA_OCUPACIONAL: 'Doença Ocupacional', QUASE_ACIDENTE: 'Quase Acidente',
};
const GRAV_CONFIG: Record<AccidentGravidade, { label: string; bg: string; text: string }> = {
    SEM_AFASTAMENTO:        { label: 'Sem Afastamento',    bg: 'bg-amber-100',  text: 'text-amber-700' },
    COM_AFASTAMENTO:        { label: 'Com Afastamento',    bg: 'bg-orange-100', text: 'text-orange-700' },
    INCAPACIDADE_PERMANENTE:{ label: 'Incap. Permanente',  bg: 'bg-red-100',    text: 'text-red-700' },
    OBITO:                  { label: 'Óbito',              bg: 'bg-slate-800',  text: 'text-white' },
};

interface AccidentFormProps {
    orgId: string;
    employees: Employee[];
    projects: { id: string; name: string }[];
    accident?: Accident | null;
    onClose: () => void;
    onSaved: () => void;
}

const AccidentForm: React.FC<AccidentFormProps> = ({ orgId, employees, projects, accident, onClose, onSaved }) => {
    const isEditing = !!accident;
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<Partial<Accident>>({
        org_id: orgId,
        employee_id: accident?.employee_id || '',
        project_id: accident?.project_id || '',
        project_name: accident?.project_name || '',
        data_acidente: accident?.data_acidente || new Date().toISOString().split('T')[0],
        hora_acidente: accident?.hora_acidente || '',
        tipo: accident?.tipo || 'TIPICO',
        gravidade: accident?.gravidade || 'SEM_AFASTAMENTO',
        local_acidente: accident?.local_acidente || '',
        descricao: accident?.descricao || '',
        causa_provavel: accident?.causa_provavel || '',
        parte_corpo: accident?.parte_corpo || '',
        agente_causador: accident?.agente_causador || '',
        cat_numero: accident?.cat_numero || '',
        cat_emitida: accident?.cat_emitida || false,
        cat_data_emissao: accident?.cat_data_emissao || '',
        dias_afastamento: accident?.dias_afastamento || 0,
        data_retorno: accident?.data_retorno || '',
        investigacao_realizada: accident?.investigacao_realizada || false,
        medidas_corretivas: accident?.medidas_corretivas || '',
        responsavel: accident?.responsavel || '',
        status: accident?.status || 'ABERTO',
    });

    const set = <K extends keyof Accident>(k: K, v: Accident[K]) => setForm(p => ({ ...p, [k]: v }));

    const handleSave = async () => {
        if (!form.employee_id || !form.descricao?.trim()) { alert('Colaborador e descrição são obrigatórios.'); return; }
        setSaving(true);
        try {
            const selectedProject = projects.find(p => p.id === form.project_id);
            const payload = { ...form, project_name: selectedProject?.name || form.project_name } as any;
            if (isEditing && accident?.id) {
                await laborService.updateAccident(accident.id, payload);
            } else {
                await laborService.createAccident(payload);
            }
            onSaved();
        } catch (err: any) {
            alert('Erro: ' + err.message);
        } finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="px-6 py-5 border-b flex items-center justify-between bg-gradient-to-r from-rose-700 to-rose-800">
                    <div>
                        <h2 className="text-lg font-black text-white">{isEditing ? 'Editar' : 'Registrar'} Acidente / CAT</h2>
                        <p className="text-rose-200 text-xs mt-0.5">Comunicação de Acidente de Trabalho</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputGroup label="Colaborador *">
                            <div className="relative">
                                <select value={form.employee_id} onChange={e => set('employee_id', e.target.value)} className={inputCls + ' appearance-none pr-8'}>
                                    <option value="">Selecione...</option>
                                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                        </InputGroup>
                        <InputGroup label="Obra">
                            <div className="relative">
                                <select value={form.project_id || ''} onChange={e => set('project_id', e.target.value)} className={inputCls + ' appearance-none pr-8'}>
                                    <option value="">Sem obra específica</option>
                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                        </InputGroup>
                        <InputGroup label="Data do Acidente *">
                            <input type="date" value={form.data_acidente} onChange={e => set('data_acidente', e.target.value)} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Hora">
                            <input type="time" value={form.hora_acidente || ''} onChange={e => set('hora_acidente', e.target.value)} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Tipo *">
                            <div className="relative">
                                <select value={form.tipo} onChange={e => set('tipo', e.target.value as AccidentTipo)} className={inputCls + ' appearance-none pr-8'}>
                                    {(Object.entries(TIPO_LABELS) as [AccidentTipo, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                        </InputGroup>
                        <InputGroup label="Gravidade *">
                            <div className="relative">
                                <select value={form.gravidade} onChange={e => set('gravidade', e.target.value as AccidentGravidade)} className={inputCls + ' appearance-none pr-8'}>
                                    {(Object.entries(GRAV_CONFIG) as [AccidentGravidade, typeof GRAV_CONFIG[AccidentGravidade]][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                        </InputGroup>
                    </div>
                    <InputGroup label="Descrição do Acidente *">
                        <textarea value={form.descricao || ''} onChange={e => set('descricao', e.target.value)} className={inputCls + ' resize-none h-20'} placeholder="Descreva o que ocorreu..." />
                    </InputGroup>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputGroup label="Local do Acidente">
                            <input value={form.local_acidente || ''} onChange={e => set('local_acidente', e.target.value)} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Parte do Corpo Atingida">
                            <input value={form.parte_corpo || ''} onChange={e => set('parte_corpo', e.target.value)} className={inputCls} placeholder="Ex: Mão direita, cabeça..." />
                        </InputGroup>
                        <InputGroup label="Agente Causador">
                            <input value={form.agente_causador || ''} onChange={e => set('agente_causador', e.target.value)} className={inputCls} placeholder="Ex: Queda, ferramenta, esforço..." />
                        </InputGroup>
                        <InputGroup label="Dias de Afastamento">
                            <input type="number" min="0" value={form.dias_afastamento} onChange={e => set('dias_afastamento', parseInt(e.target.value) || 0)} className={inputCls} />
                        </InputGroup>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <InputGroup label="Nº da CAT">
                            <input value={form.cat_numero || ''} onChange={e => set('cat_numero', e.target.value)} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Data Emissão CAT">
                            <input type="date" value={form.cat_data_emissao || ''} onChange={e => set('cat_data_emissao', e.target.value)} className={inputCls} />
                        </InputGroup>
                        <div className="flex items-end pb-1">
                            <button type="button" onClick={() => set('cat_emitida', !form.cat_emitida)}
                                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all w-full justify-center ${form.cat_emitida ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                {form.cat_emitida ? <CheckCircle2 className="w-4 h-4" /> : <X className="w-4 h-4" />}
                                CAT Emitida
                            </button>
                        </div>
                    </div>
                    <InputGroup label="Medidas Corretivas">
                        <textarea value={form.medidas_corretivas || ''} onChange={e => set('medidas_corretivas', e.target.value)} className={inputCls + ' resize-none h-16'} placeholder="Ações preventivas adotadas..." />
                    </InputGroup>
                </div>
                <div className="px-6 py-4 border-t flex justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-rose-700 text-white rounded-xl font-bold text-sm hover:bg-rose-800 shadow-lg disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {saving ? 'Salvando...' : (isEditing ? 'Salvar' : 'Registrar')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Docs Regulatórios — PCMSO / PGR / NR-18 PCMAT
// ─────────────────────────────────────────────────────────────────────────────

const DOC_TIPO_CONFIG: Record<SSTDocTipo, { label: string; desc: string; bg: string; text: string; responsavelLabel: string; docLabel: string }> = {
    PCMSO:     { label: 'PCMSO',       desc: 'Programa de Controle Médico de Saúde Ocupacional', bg: 'bg-teal-50',   text: 'text-teal-700',   responsavelLabel: 'Médico Coordenador', docLabel: 'CRM' },
    PGR:       { label: 'PGR',         desc: 'Programa de Gerenciamento de Riscos (NR-01)',       bg: 'bg-indigo-50', text: 'text-indigo-700', responsavelLabel: 'Responsável Técnico', docLabel: 'CREA/CRQ/CPF' },
    NR18_PCMAT:{ label: 'NR-18/PCMAT', desc: 'Programa de Condições e Meio Ambiente — Construção',bg: 'bg-orange-50', text: 'text-orange-700', responsavelLabel: 'Resp. Técnico',      docLabel: 'CREA' },
    PPRA:      { label: 'PPRA',        desc: 'Programa de Prevenção de Riscos Ambientais (legado)', bg: 'bg-slate-50', text: 'text-slate-600', responsavelLabel: 'Responsável',        docLabel: 'CREA/CRQ' },
};

const DOC_STATUS_CONFIG: Record<SSTDocStatus, { label: string; bg: string; text: string }> = {
    VIGENTE:   { label: 'Vigente',   bg: 'bg-emerald-100', text: 'text-emerald-700' },
    REVISAO:   { label: 'Em Revisão', bg: 'bg-amber-100',  text: 'text-amber-700' },
    VENCIDO:   { label: 'Vencido',   bg: 'bg-rose-100',    text: 'text-rose-700' },
    CANCELADO: { label: 'Cancelado', bg: 'bg-slate-100',   text: 'text-slate-500' },
};

interface RegDocFormProps {
    orgId: string;
    projects: { id: string; name: string }[];
    doc?: SSTRegulatoryDoc | null;
    onClose: () => void;
    onSaved: () => void;
}

const RegDocForm: React.FC<RegDocFormProps> = ({ orgId, projects, doc, onClose, onSaved }) => {
    const isEditing = !!doc;
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<Partial<SSTRegulatoryDoc>>({
        org_id: orgId,
        tipo: doc?.tipo || 'PCMSO',
        titulo: doc?.titulo || '',
        responsavel: doc?.responsavel || '',
        responsavel_doc: doc?.responsavel_doc || '',
        project_id: doc?.project_id || '',
        vigencia_inicio: doc?.vigencia_inicio || '',
        vigencia_fim: doc?.vigencia_fim || '',
        data_revisao: doc?.data_revisao || '',
        status: doc?.status || 'VIGENTE',
        observacoes: doc?.observacoes || '',
    });

    const set = <K extends keyof SSTRegulatoryDoc>(k: K, v: SSTRegulatoryDoc[K]) => setForm(p => ({ ...p, [k]: v }));
    const tipoConf = DOC_TIPO_CONFIG[form.tipo as SSTDocTipo] || DOC_TIPO_CONFIG.PCMSO;

    const handleSave = async () => {
        if (!form.titulo?.trim()) { alert('Título é obrigatório.'); return; }
        setSaving(true);
        try {
            const payload: any = {
                ...form,
                org_id: orgId,
                vigencia_inicio: form.vigencia_inicio || null,
                vigencia_fim: form.vigencia_fim || null,
                data_revisao: form.data_revisao || null,
                project_id: form.project_id || null,
            };
            if (isEditing && doc?.id) {
                await laborService.updateSSTRegulatoryDoc(doc.id, payload);
            } else {
                await laborService.createSSTRegulatoryDoc(payload);
            }
            onSaved();
        } catch (err: any) {
            alert('Erro: ' + (err.message || 'Tente novamente.'));
        } finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="px-6 py-5 border-b flex items-center justify-between bg-gradient-to-r from-teal-600 to-indigo-700">
                    <div>
                        <h2 className="text-lg font-black text-white">{isEditing ? 'Editar' : 'Cadastrar'} Documento Regulatório</h2>
                        <p className="text-indigo-200 text-xs mt-0.5">PCMSO · PGR · NR-18/PCMAT · PPRA</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputGroup label="Tipo *">
                            <div className="relative">
                                <select value={form.tipo} onChange={e => set('tipo', e.target.value as SSTDocTipo)} className={inputCls + ' appearance-none pr-8'}>
                                    {(Object.entries(DOC_TIPO_CONFIG) as [SSTDocTipo, typeof DOC_TIPO_CONFIG[SSTDocTipo]][]).map(([k, v]) => (
                                        <option key={k} value={k}>{v.label} — {v.desc}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                        </InputGroup>
                        <InputGroup label="Obra (opcional)">
                            <div className="relative">
                                <select value={form.project_id || ''} onChange={e => set('project_id', e.target.value)} className={inputCls + ' appearance-none pr-8'}>
                                    <option value="">Sem obra — nível empresa</option>
                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                        </InputGroup>
                    </div>
                    <InputGroup label="Título / Identificação *">
                        <input value={form.titulo || ''} onChange={e => set('titulo', e.target.value)} className={inputCls} placeholder={`Ex: ${tipoConf.label} 2025 — Empresa XPTO`} />
                    </InputGroup>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputGroup label={`${tipoConf.responsavelLabel}`}>
                            <input value={form.responsavel || ''} onChange={e => set('responsavel', e.target.value)} className={inputCls} placeholder="Nome completo" />
                        </InputGroup>
                        <InputGroup label={`${tipoConf.docLabel} do Responsável`}>
                            <input value={form.responsavel_doc || ''} onChange={e => set('responsavel_doc', e.target.value)} className={inputCls} placeholder={tipoConf.docLabel} />
                        </InputGroup>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <InputGroup label="Vigência Início">
                            <input type="date" value={form.vigencia_inicio || ''} onChange={e => set('vigencia_inicio', e.target.value)} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Vigência Fim">
                            <input type="date" value={form.vigencia_fim || ''} onChange={e => set('vigencia_fim', e.target.value)} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Próxima Revisão">
                            <input type="date" value={form.data_revisao || ''} onChange={e => set('data_revisao', e.target.value)} className={inputCls} />
                        </InputGroup>
                    </div>
                    <InputGroup label="Status">
                        <div className="flex gap-2 flex-wrap">
                            {(Object.entries(DOC_STATUS_CONFIG) as [SSTDocStatus, typeof DOC_STATUS_CONFIG[SSTDocStatus]][]).map(([k, v]) => (
                                <button key={k} type="button" onClick={() => set('status', k)}
                                    className={`px-3 py-1.5 rounded-xl border text-xs font-black transition-all ${form.status === k ? `${v.bg} ${v.text} border-transparent` : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                                    {v.label}
                                </button>
                            ))}
                        </div>
                    </InputGroup>
                    <InputGroup label="Observações">
                        <textarea value={form.observacoes || ''} onChange={e => set('observacoes', e.target.value)} className={inputCls + ' resize-none h-16'} placeholder="Notas adicionais, nº do documento, localização do arquivo..." />
                    </InputGroup>
                </div>
                <div className="px-6 py-4 border-t flex justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-sm hover:bg-teal-700 shadow-lg disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {saving ? 'Salvando...' : (isEditing ? 'Salvar' : 'Cadastrar')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// LaborSST — Componente principal
// ─────────────────────────────────────────────────────────────────────────────

interface LaborSSTProps {
    orgId: string;
    employees: Employee[];
    projects?: { id: string; name: string }[];
}

type SSTView = 'accidents' | 'checklists' | 'indicators' | 'regulatory';

const LaborSST: React.FC<LaborSSTProps> = ({ orgId, employees, projects = [] }) => {
    const qc = useQueryClient();
    const [view, setView] = useState<SSTView>('accidents');
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingAccident, setEditingAccident] = useState<Accident | null>(null);
    const [showRegForm, setShowRegForm] = useState(false);
    const [editingRegDoc, setEditingRegDoc] = useState<SSTRegulatoryDoc | null>(null);
    const [regFilter, setRegFilter] = useState<SSTDocTipo | ''>('');

    const accidentsKey   = [...laborKeys.all, 'accidents', orgId];
    const checklistsKey  = [...laborKeys.all, 'sstChecklists', orgId];
    const indicatorsKey  = [...laborKeys.all, 'sstIndicators', orgId];
    const regDocsKey     = [...laborKeys.all, 'sstRegDocs', orgId];

    const { data: accidents = [], isLoading: loadingAcc } = useQuery({
        queryKey: accidentsKey,
        queryFn: () => laborService.listAccidents(orgId),
        staleTime: STALE.normal, enabled: !!orgId,
    });

    const { data: checklists = [], isLoading: loadingCkl } = useQuery({
        queryKey: checklistsKey,
        queryFn: () => laborService.listSstChecklists(orgId),
        staleTime: STALE.normal, enabled: !!orgId && view === 'checklists',
    });

    const { data: indicators } = useQuery<SstIndicators>({
        queryKey: indicatorsKey,
        queryFn: () => laborService.getSstIndicators(orgId),
        staleTime: STALE.slow, enabled: !!orgId,
    });

    const { data: regDocs = [], isLoading: loadingReg } = useQuery({
        queryKey: regDocsKey,
        queryFn: () => laborService.listSSTRegulatoryDocs(orgId),
        staleTime: STALE.normal, enabled: !!orgId && view === 'regulatory',
    });

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: accidentsKey });
        qc.invalidateQueries({ queryKey: indicatorsKey });
    };

    const invalidateReg = () => qc.invalidateQueries({ queryKey: regDocsKey });

    const deleteAcc = useMutation({ mutationFn: (id: string) => laborService.deleteAccident(id), onSuccess: invalidate });
    const deleteReg = useMutation({ mutationFn: (id: string) => laborService.deleteSSTRegulatoryDoc(id), onSuccess: invalidateReg });

    const withLeave = accidents.filter(a => ['COM_AFASTAMENTO','INCAPACIDADE_PERMANENTE','OBITO'].includes(a.gravidade)).length;
    const open = accidents.filter(a => a.status === 'ABERTO').length;
    const catPending = accidents.filter(a => !a.cat_emitida && a.tipo !== 'QUASE_ACIDENTE').length;

    const filteredAcc = accidents.filter(a => !search ||
        (a.employee_name || '').toLowerCase().includes(search.toLowerCase()) ||
        a.descricao.toLowerCase().includes(search.toLowerCase()));

    const filteredReg = regDocs.filter(d => {
        if (regFilter && d.tipo !== regFilter) return false;
        if (search && !(d.titulo.toLowerCase().includes(search.toLowerCase()) || (d.responsavel || '').toLowerCase().includes(search.toLowerCase()))) return false;
        return true;
    });

    // Classifica docs vencendo em 60 dias
    const today = new Date().toISOString().split('T')[0];
    const in60 = new Date(); in60.setDate(in60.getDate() + 60);
    const in60Str = in60.toISOString().split('T')[0];
    const regAlerts = regDocs.filter(d => d.vigencia_fim && d.vigencia_fim <= in60Str && d.status !== 'CANCELADO');

    return (
        <div className="space-y-6">
            {/* Alerta docs regulatórios vencendo */}
            {regAlerts.length > 0 && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-2xl flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-black text-orange-900 uppercase tracking-tight">
                            {regAlerts.length} documento{regAlerts.length > 1 ? 's' : ''} regulatório{regAlerts.length > 1 ? 's' : ''} vencendo em 60 dias
                        </p>
                        <p className="text-[11px] text-orange-700 mt-1">
                            {regAlerts.slice(0, 3).map(d => `${DOC_TIPO_CONFIG[d.tipo]?.label} — vence ${d.vigencia_fim}`).join(' · ')}
                            {regAlerts.length > 3 && ` e mais ${regAlerts.length - 3}…`}
                        </p>
                    </div>
                    <button onClick={() => setView('regulatory')} className="ml-auto shrink-0 px-3 py-1 bg-orange-600 text-white text-[10px] font-black rounded-lg hover:bg-orange-700 transition-colors whitespace-nowrap">
                        Ver docs
                    </button>
                </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Acidentes',  value: accidents.length, bg: 'bg-slate-50',   text: 'text-slate-700' },
                    { label: 'Com Afastamento',  value: withLeave,        bg: 'bg-rose-50',    text: 'text-rose-700' },
                    { label: 'Em Aberto',        value: open,             bg: 'bg-amber-50',   text: 'text-amber-700' },
                    { label: 'CAT Pendente',     value: catPending,       bg: 'bg-orange-50',  text: 'text-orange-700' },
                ].map(({ label, value, bg, text }) => (
                    <div key={label} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                        <p className={`text-2xl font-black ${text} ${bg} px-2 py-0.5 rounded-lg inline-block`}>{value}</p>
                    </div>
                ))}
            </div>

            {/* Controls */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
                    {([
                        ['accidents',  'Acidentes/CAT',    ShieldAlert],
                        ['checklists', 'Checklists SST',   ClipboardList],
                        ['indicators', 'Indicadores',      Activity],
                        ['regulatory', 'Docs Regulatórios',FileText],
                    ] as const).map(([id, label, Icon]) => (
                        <button key={id} onClick={() => setView(id)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${view === id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                            <Icon className="w-3.5 h-3.5" />{label}
                            {id === 'regulatory' && regAlerts.length > 0 && (
                                <span className="px-1.5 py-0.5 bg-orange-500 text-white text-[9px] font-black rounded-full">{regAlerts.length}</span>
                            )}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-100 w-40" />
                    </div>
                    {view === 'accidents' && (
                        <button onClick={() => { setEditingAccident(null); setShowForm(true); }}
                            className="flex items-center gap-2 px-4 py-2 bg-rose-700 text-white rounded-xl hover:bg-rose-800 font-bold text-xs shadow-md">
                            <Plus className="w-3.5 h-3.5" /> Registrar Acidente
                        </button>
                    )}
                    {view === 'regulatory' && (
                        <>
                            <div className="relative">
                                <select value={regFilter} onChange={e => setRegFilter(e.target.value as SSTDocTipo | '')} className="pl-3 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none appearance-none">
                                    <option value="">Todos os tipos</option>
                                    {(Object.keys(DOC_TIPO_CONFIG) as SSTDocTipo[]).map(k => (
                                        <option key={k} value={k}>{DOC_TIPO_CONFIG[k].label}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                            </div>
                            <button onClick={() => { setEditingRegDoc(null); setShowRegForm(true); }}
                                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 font-bold text-xs shadow-md">
                                <Plus className="w-3.5 h-3.5" /> Cadastrar Documento
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* ── Acidentes ── */}
            {view === 'accidents' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    {loadingAcc ? <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-indigo-500 animate-spin" /></div>
                    : filteredAcc.length === 0 ? (
                        <div className="text-center py-16">
                            <ShieldAlert className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-black text-slate-400">Nenhum acidente registrado</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {filteredAcc.map(a => {
                                const grav = GRAV_CONFIG[a.gravidade];
                                return (
                                    <div key={a.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                                        <div className="flex items-start gap-4">
                                            <div className={`p-2.5 rounded-xl ${grav.bg} shrink-0`}>
                                                <ShieldAlert className={`w-4 h-4 ${grav.text}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3 flex-wrap">
                                                    <span className="text-sm font-black text-slate-900">{a.employee_name || '—'}</span>
                                                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${grav.bg} ${grav.text}`}>{grav.label}</span>
                                                    <span className="text-[10px] font-bold text-slate-500">{TIPO_LABELS[a.tipo]}</span>
                                                    {!a.cat_emitida && a.gravidade !== 'SEM_AFASTAMENTO' && (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-100 text-orange-700">CAT Pendente</span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-500 font-medium mt-1">{a.data_acidente}{a.local_acidente ? ` · ${a.local_acidente}` : ''}</p>
                                                <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[400px]">{a.descricao}</p>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <button onClick={() => { setEditingAccident(a); setShowForm(true); }} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors">
                                                    <Eye className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={() => { if (confirm('Excluir?')) deleteAcc.mutate(a.id); }} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ── Checklists ── */}
            {view === 'checklists' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    {loadingCkl ? <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-indigo-500 animate-spin" /></div>
                    : checklists.length === 0 ? (
                        <div className="text-center py-16">
                            <ClipboardList className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-black text-slate-400">Nenhum checklist SST cadastrado</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    {['Checklist', 'NR', 'Obra', 'Data', 'Conformidade', 'Status'].map(h => (
                                        <th key={h} className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {checklists.map(ck => (
                                    <tr key={ck.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                        <td className="px-4 py-3 text-sm font-bold text-slate-900">{ck.nome_checklist}</td>
                                        <td className="px-4 py-3 text-xs font-black text-rose-600">{ck.nr_referencia || '—'}</td>
                                        <td className="px-4 py-3 text-xs text-slate-500">{ck.project_name || '—'}</td>
                                        <td className="px-4 py-3 text-xs text-slate-500">{ck.data_aplicacao}</td>
                                        <td className="px-4 py-3">
                                            {ck.conformidade_pct != null ? (
                                                <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${ck.conformidade_pct >= 80 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                    {ck.conformidade_pct.toFixed(0)}%
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${ck.status === 'CONCLUIDO' ? 'bg-emerald-100 text-emerald-700' : ck.status === 'REPROVADO' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {ck.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* ── Indicadores ── */}
            {view === 'indicators' && indicators && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: 'Acidentes no Ano',  value: indicators.total_acidentes, bg: 'bg-slate-50',   text: 'text-slate-700' },
                            { label: 'Com Afastamento',   value: indicators.com_afastamento, bg: 'bg-rose-50',    text: 'text-rose-700' },
                            { label: 'Dias Perdidos',     value: indicators.dias_perdidos,   bg: 'bg-orange-50',  text: 'text-orange-700' },
                            { label: 'HH Trabalhadas',    value: `${(indicators.hh_trabalhadas / 1000).toFixed(1)}k`, bg: 'bg-indigo-50', text: 'text-indigo-700' },
                        ].map(({ label, value, bg, text }) => (
                            <div key={label} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                                <p className={`text-2xl font-black ${text} ${bg} px-2 py-0.5 rounded-lg inline-block`}>{value}</p>
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                            { label: 'TFCA (Taxa de Frequência com Afastamento)', value: indicators.tfca, desc: 'Acidentes com afastamento por milhão de HH', color: indicators.tfca > 10 ? 'text-rose-700' : 'text-emerald-700', bg: indicators.tfca > 10 ? 'bg-rose-50' : 'bg-emerald-50' },
                            { label: 'TGCA (Taxa de Gravidade)',                  value: indicators.tgca, desc: 'Dias perdidos por milhão de HH',           color: indicators.tgca > 500 ? 'text-rose-700' : 'text-emerald-700', bg: indicators.tgca > 500 ? 'bg-rose-50' : 'bg-emerald-50' },
                        ].map(({ label, value, desc, color, bg }) => (
                            <div key={label} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">{label}</p>
                                <p className={`text-4xl font-black mt-2 ${color} ${bg} px-3 py-1 rounded-xl inline-block`}>{value.toFixed(2)}</p>
                                <p className="text-[11px] text-slate-400 mt-2">{desc}</p>
                                <p className={`text-[11px] font-bold mt-1 ${color}`}>
                                    {value === 0 ? '✓ Zero acidentes no período' : value > (label.includes('TFCA') ? 10 : 500) ? '⚠ Acima da meta — revisar medidas preventivas' : '✓ Dentro do esperado'}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Docs Regulatórios ── */}
            {view === 'regulatory' && (
                <div className="space-y-4">
                    {/* Cards por tipo */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {(Object.entries(DOC_TIPO_CONFIG) as [SSTDocTipo, typeof DOC_TIPO_CONFIG[SSTDocTipo]][]).map(([tipo, conf]) => {
                            const count = regDocs.filter(d => d.tipo === tipo).length;
                            const vencidos = regDocs.filter(d => d.tipo === tipo && d.vigencia_fim && d.vigencia_fim < today).length;
                            return (
                                <button key={tipo} onClick={() => setRegFilter(regFilter === tipo ? '' : tipo)}
                                    className={`bg-white p-4 rounded-2xl border shadow-sm text-left hover:shadow-md transition-all ${regFilter === tipo ? `border-teal-300 ring-2 ring-teal-100` : 'border-slate-100'}`}>
                                    <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${conf.text}`}>{conf.label}</p>
                                    <p className="text-2xl font-black text-slate-900">{count}</p>
                                    {vencidos > 0 && <p className="text-[10px] font-black text-rose-600 mt-1">⚠ {vencidos} vencido{vencidos > 1 ? 's' : ''}</p>}
                                </button>
                            );
                        })}
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        {loadingReg ? (
                            <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-teal-500 animate-spin" /></div>
                        ) : filteredReg.length === 0 ? (
                            <div className="text-center py-16">
                                <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                                <p className="text-sm font-black text-slate-400">Nenhum documento regulatório cadastrado</p>
                                <p className="text-xs text-slate-400 mt-1">Cadastre PCMSO, PGR, NR-18/PCMAT para rastrear vigências e revisões.</p>
                                <button onClick={() => { setEditingRegDoc(null); setShowRegForm(true); }}
                                    className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-sm hover:bg-teal-700 shadow-md">
                                    <Plus className="w-4 h-4" /> Cadastrar Primeiro Documento
                                </button>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {filteredReg.map(doc => {
                                    const conf = DOC_TIPO_CONFIG[doc.tipo];
                                    const statusConf = DOC_STATUS_CONFIG[doc.status];
                                    const isExpiringSoon = doc.vigencia_fim && doc.vigencia_fim <= in60Str && doc.vigencia_fim >= today;
                                    const isExpired = doc.vigencia_fim && doc.vigencia_fim < today;
                                    const reviewSoon = doc.data_revisao && doc.data_revisao <= in60Str && doc.data_revisao >= today;
                                    return (
                                        <div key={doc.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                                            <div className="flex items-start gap-4">
                                                <div className={`p-2.5 rounded-xl ${conf.bg} shrink-0`}>
                                                    <FileText className={`w-4 h-4 ${conf.text}`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${conf.bg} ${conf.text}`}>{conf.label}</span>
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${statusConf.bg} ${statusConf.text}`}>{statusConf.label}</span>
                                                        {isExpired && <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700">⚠ VENCIDO</span>}
                                                        {isExpiringSoon && !isExpired && <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-100 text-orange-700">⏰ Vence em breve</span>}
                                                        {reviewSoon && <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-700">📋 Revisão em breve</span>}
                                                    </div>
                                                    <p className="text-sm font-black text-slate-900 mt-1">{doc.titulo}</p>
                                                    <div className="flex items-center gap-4 mt-1 flex-wrap">
                                                        {doc.responsavel && (
                                                            <span className="text-xs text-slate-500 flex items-center gap-1">
                                                                <Users className="w-3 h-3" /> {doc.responsavel}
                                                                {doc.responsavel_doc && ` (${doc.responsavel_doc})`}
                                                            </span>
                                                        )}
                                                        {doc.vigencia_inicio && doc.vigencia_fim && (
                                                            <span className="text-xs text-slate-500 flex items-center gap-1">
                                                                <Calendar className="w-3 h-3" /> {doc.vigencia_inicio} → {doc.vigencia_fim}
                                                            </span>
                                                        )}
                                                        {doc.project_name && (
                                                            <span className="text-xs text-slate-500 flex items-center gap-1">
                                                                <Building2 className="w-3 h-3" /> {doc.project_name}
                                                            </span>
                                                        )}
                                                        {doc.data_revisao && (
                                                            <span className="text-xs text-slate-400">Revisão: {doc.data_revisao}</span>
                                                        )}
                                                    </div>
                                                    {doc.observacoes && (
                                                        <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[400px]">{doc.observacoes}</p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button onClick={() => { setEditingRegDoc(doc); setShowRegForm(true); }} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors">
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => { if (confirm('Excluir documento regulatório?')) deleteReg.mutate(doc.id); }} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modais */}
            {showForm && (
                <AccidentForm orgId={orgId} employees={employees} projects={projects} accident={editingAccident}
                    onClose={() => { setShowForm(false); setEditingAccident(null); }}
                    onSaved={() => { setShowForm(false); setEditingAccident(null); invalidate(); }} />
            )}
            {showRegForm && (
                <RegDocForm orgId={orgId} projects={projects} doc={editingRegDoc}
                    onClose={() => { setShowRegForm(false); setEditingRegDoc(null); }}
                    onSaved={() => { setShowRegForm(false); setEditingRegDoc(null); invalidateReg(); }} />
            )}
        </div>
    );
};

export default LaborSST;
