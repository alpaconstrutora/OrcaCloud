import React, { useState } from 'react';
import {
    UserSearch, Plus, X, ChevronDown, Loader2, Search,
    Star, Phone, Mail, FileText, Check, ChevronRight,
    Trash2, Eye, Pencil, Users, Briefcase, Calendar, AlertTriangle,
    Building2, DollarSign, MessageSquare, Award, UserCheck
} from 'lucide-react';
import {
    DndContext, DragEndEvent, DragOverlay, DragStartEvent,
    PointerSensor, useSensor, useSensors, useDroppable, useDraggable,
    closestCenter,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    atsService,
    JobOpening, JobStatus, JobPrioridade,
    Candidate, CandidateStage, CandidateOrigem,
    InterviewRecord, InterviewTipo
} from '../services/atsService';
import { STALE } from '../lib/queryClient';

// ── Helpers ──────────────────────────────────────────────────────────────────

const STAGES: { id: CandidateStage; label: string; color: string; bg: string }[] = [
    { id: 'RECEBIDO',          label: 'Recebido',       color: 'text-slate-600',   bg: 'bg-slate-100' },
    { id: 'TRIAGEM',           label: 'Triagem',        color: 'text-blue-600',    bg: 'bg-blue-100' },
    { id: 'ENTREVISTA_RH',     label: 'Entrev. RH',     color: 'text-indigo-600',  bg: 'bg-indigo-100' },
    { id: 'ENTREVISTA_TECNICA',label: 'Entrev. Técnica',color: 'text-purple-600',  bg: 'bg-purple-100' },
    { id: 'TESTE',             label: 'Teste',          color: 'text-amber-600',   bg: 'bg-amber-100' },
    { id: 'PROPOSTA',          label: 'Proposta',       color: 'text-orange-600',  bg: 'bg-orange-100' },
    { id: 'APROVADO',          label: 'Aprovado',       color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { id: 'CONTRATADO',        label: 'Contratado',     color: 'text-green-700',   bg: 'bg-green-100' },
];

const DISCARD_STAGES: CandidateStage[] = ['REPROVADO', 'DESISTIU'];

const PRIORITY_CONFIG: Record<JobPrioridade, { label: string; color: string; dot: string }> = {
    URGENTE: { label: 'Urgente', color: 'text-red-700',    dot: 'bg-red-500' },
    ALTA:    { label: 'Alta',    color: 'text-orange-700', dot: 'bg-orange-500' },
    NORMAL:  { label: 'Normal',  color: 'text-slate-600',  dot: 'bg-slate-400' },
    BAIXA:   { label: 'Baixa',   color: 'text-slate-400',  dot: 'bg-slate-300' },
};

const ORIGEM_LABELS: Record<CandidateOrigem, string> = {
    INDICACAO: 'Indicação', SITE: 'Site', LINKEDIN: 'LinkedIn',
    WHATSAPP: 'WhatsApp', IFOOD_JOBS: 'iFood Jobs',
    CATHO: 'Catho', INFOJOBS: 'InfoJobs', OUTROS: 'Outros',
};

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all';
const InputGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
        {children}
    </div>
);

// ── Formulário de Vaga ───────────────────────────────────────────────────────

interface JobFormProps {
    orgId: string;
    job?: JobOpening | null;
    projects: { id: string; name: string }[];
    onClose: () => void;
    onSaved: () => void;
}

const JobForm: React.FC<JobFormProps> = ({ orgId, job, projects, onClose, onSaved }) => {
    const isEditing = !!job;
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<Partial<JobOpening>>({
        org_id: orgId,
        titulo: job?.titulo || '',
        descricao: job?.descricao || '',
        requisitos: job?.requisitos || '',
        cargo: job?.cargo || '',
        project_id: job?.project_id || '',
        tipo_contrato: job?.tipo_contrato || 'CLT',
        salario_min: job?.salario_min,
        salario_max: job?.salario_max,
        quantidade: job?.quantidade || 1,
        prioridade: job?.prioridade || 'NORMAL',
        data_abertura: job?.data_abertura || new Date().toISOString().split('T')[0],
        data_limite: job?.data_limite || '',
        status: job?.status || 'ABERTA',
        notas: job?.notas || '',
    });

    const set = <K extends keyof JobOpening>(k: K, v: JobOpening[K]) => setForm(p => ({ ...p, [k]: v }));

    const handleSave = async () => {
        if (!form.titulo?.trim() || !form.cargo?.trim()) { alert('Título e cargo são obrigatórios.'); return; }
        if (!orgId) { alert('Organização não identificada. Recarregue a página.'); return; }
        setSaving(true);
        try {
            const project = projects.find(p => p.id === form.project_id);
            const payload = {
                ...form,
                org_id: orgId,
                project_id: form.project_id || null,
                responsavel_id: (form as any).responsavel_id || null,
                data_limite: form.data_limite || null,
                project_name: project?.name || '',
            } as any;
            if (isEditing && job?.id) {
                await atsService.updateJob(job.id, payload);
            } else {
                await atsService.createJob(payload);
            }
            onSaved();
        } catch (err: any) { alert('Erro: ' + err.message); }
        finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="px-6 py-5 border-b flex items-center justify-between bg-gradient-to-r from-violet-600 to-violet-700">
                    <div>
                        <h2 className="text-lg font-black text-white">{isEditing ? 'Editar Vaga' : 'Nova Vaga'}</h2>
                        <p className="text-violet-200 text-xs mt-0.5">Recrutamento e Seleção</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <InputGroup label="Título da Vaga *">
                        <input value={form.titulo} onChange={e => set('titulo', e.target.value)} className={inputCls} placeholder="Ex: Pedreiro de Acabamento" />
                    </InputGroup>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputGroup label="Cargo *">
                            <input value={form.cargo} onChange={e => set('cargo', e.target.value)} className={inputCls} placeholder="Ex: Pedreiro" />
                        </InputGroup>
                        <InputGroup label="Tipo de Contrato">
                            <div className="relative">
                                <select value={form.tipo_contrato} onChange={e => set('tipo_contrato', e.target.value)} className={inputCls + ' appearance-none pr-8'}>
                                    {['CLT','PJ','DIARISTA','EMPREITEIRO','ESTAGIARIO','TEMPORARIO','APRENDIZ'].map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                        </InputGroup>
                        <InputGroup label="Obra / Projeto">
                            <div className="relative">
                                <select value={form.project_id || ''} onChange={e => set('project_id', e.target.value)} className={inputCls + ' appearance-none pr-8'}>
                                    <option value="">Sem obra específica</option>
                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                        </InputGroup>
                        <InputGroup label="Prioridade">
                            <div className="relative">
                                <select value={form.prioridade} onChange={e => set('prioridade', e.target.value as JobPrioridade)} className={inputCls + ' appearance-none pr-8'}>
                                    {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                        </InputGroup>
                        <InputGroup label="Nº de Vagas">
                            <input type="number" min="1" value={form.quantidade} onChange={e => set('quantidade', parseInt(e.target.value) || 1)} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Prazo Limite">
                            <input type="date" value={form.data_limite || ''} onChange={e => set('data_limite', e.target.value)} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Salário Mín. (R$)">
                            <input type="number" min="0" step="100" value={form.salario_min ?? ''} onChange={e => set('salario_min', parseFloat(e.target.value) || undefined)} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Salário Máx. (R$)">
                            <input type="number" min="0" step="100" value={form.salario_max ?? ''} onChange={e => set('salario_max', parseFloat(e.target.value) || undefined)} className={inputCls} />
                        </InputGroup>
                    </div>
                    <InputGroup label="Descrição">
                        <textarea value={form.descricao || ''} onChange={e => set('descricao', e.target.value)} className={inputCls + ' resize-none h-20'} />
                    </InputGroup>
                    <InputGroup label="Requisitos">
                        <textarea value={form.requisitos || ''} onChange={e => set('requisitos', e.target.value)} className={inputCls + ' resize-none h-20'} placeholder="Experiência mínima, habilidades, documentação..." />
                    </InputGroup>
                </div>
                <div className="px-6 py-4 border-t flex justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 text-white rounded-xl font-bold text-sm hover:bg-violet-700 shadow-lg disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {saving ? 'Salvando...' : (isEditing ? 'Salvar' : 'Criar Vaga')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Card de Candidato ────────────────────────────────────────────────────────

const CandidateCardInner: React.FC<{
    candidate: Candidate;
    onSelect: () => void;
    onStageChange: (stage: CandidateStage) => void;
    onDiscard: (stage: CandidateStage) => void;
    isDragging?: boolean;
}> = ({ candidate, onSelect, onStageChange, onDiscard, isDragging }) => {
    const stageIdx = STAGES.findIndex(s => s.id === candidate.stage);
    const nextStage = STAGES[stageIdx + 1];

    return (
        <div
            className={`bg-white rounded-2xl border shadow-sm p-4 hover:shadow-md transition-all cursor-grab active:cursor-grabbing group ${isDragging ? 'border-indigo-300 shadow-lg rotate-1 opacity-90' : 'border-slate-100'}`}
            onClick={onSelect}
        >
            <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-black text-indigo-600 shrink-0">
                        {candidate.nome.charAt(0)}
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-black text-slate-900 truncate">{candidate.nome}</p>
                        <p className="text-[11px] text-slate-400">{ORIGEM_LABELS[candidate.origem]}</p>
                    </div>
                </div>
                {candidate.nota_final != null && (
                    <div className="flex items-center gap-1 shrink-0">
                        <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                        <span className="text-xs font-black text-amber-700">{candidate.nota_final}</span>
                    </div>
                )}
            </div>
            <div className="space-y-1 mb-3">
                {candidate.telefone && (
                    <p className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Phone className="w-3 h-3 shrink-0" />{candidate.telefone}
                    </p>
                )}
                {candidate.pretensao_salarial && (
                    <p className="flex items-center gap-1.5 text-xs text-slate-500">
                        <DollarSign className="w-3 h-3 shrink-0" />R$ {candidate.pretensao_salarial.toLocaleString('pt-BR')}
                    </p>
                )}
                {candidate.experiencia_anos != null && candidate.experiencia_anos > 0 && (
                    <p className="text-xs text-slate-400">{candidate.experiencia_anos} ano{candidate.experiencia_anos > 1 ? 's' : ''} de experiência</p>
                )}
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-slate-50 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                {nextStage && (
                    <button onClick={() => onStageChange(nextStage.id)}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg text-[10px] font-black transition-all">
                        <ChevronRight className="w-3 h-3" /> {nextStage.label}
                    </button>
                )}
                <button onClick={() => onDiscard('REPROVADO')}
                    className="p-1.5 hover:bg-red-50 text-slate-300 hover:text-rose-500 rounded-lg transition-colors">
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
};

const CandidateCard: React.FC<{
    candidate: Candidate;
    onSelect: () => void;
    onStageChange: (stage: CandidateStage) => void;
    onDiscard: (stage: CandidateStage) => void;
}> = (props) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: props.candidate.id });
    const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
            <CandidateCardInner {...props} isDragging={isDragging} />
        </div>
    );
};

const KanbanColumn: React.FC<{
    stage: typeof STAGES[number];
    candidates: Candidate[];
    onSelect: (c: Candidate) => void;
    onStageChange: (id: string, stage: CandidateStage) => void;
    onDiscard: (id: string, stage: CandidateStage) => void;
    isOver: boolean;
}> = ({ stage, candidates, onSelect, onStageChange, onDiscard, isOver }) => {
    const { setNodeRef } = useDroppable({ id: stage.id });
    return (
        <div className="w-64 shrink-0">
            <div className={`flex items-center justify-between px-3 py-2 rounded-xl ${stage.bg} mb-3`}>
                <span className={`text-xs font-black uppercase tracking-widest ${stage.color}`}>{stage.label}</span>
                <span className={`text-xs font-black px-2 py-0.5 rounded-full bg-white/60 ${stage.color}`}>{candidates.length}</span>
            </div>
            <div
                ref={setNodeRef}
                className={`space-y-3 min-h-[80px] rounded-2xl transition-colors ${isOver ? 'bg-indigo-50/60 ring-2 ring-indigo-200 ring-dashed p-2' : ''}`}
            >
                {candidates.map(c => (
                    <CandidateCard
                        key={c.id}
                        candidate={c}
                        onSelect={() => onSelect(c)}
                        onStageChange={(s) => onStageChange(c.id, s)}
                        onDiscard={(s) => { if (confirm('Reprovar candidato?')) onDiscard(c.id, s); }}
                    />
                ))}
                {candidates.length === 0 && !isOver && (
                    <div className="h-20 rounded-2xl border-2 border-dashed border-slate-100 flex items-center justify-center">
                        <p className="text-[10px] text-slate-300 font-bold">Sem candidatos</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Painel do Candidato ──────────────────────────────────────────────────────

interface CandidatePanelProps {
    candidate: Candidate;
    orgId: string;
    onClose: () => void;
    onSaved: () => void;
}

const CandidatePanel: React.FC<CandidatePanelProps> = ({ candidate, orgId, onClose, onSaved }) => {
    const qc = useQueryClient();
    const [newNote, setNewNote] = useState('');
    const [newNota, setNewNota] = useState<number | undefined>(undefined);
    const [savingNote, setSavingNote] = useState(false);
    const [hireDate, setHireDate] = useState(new Date().toISOString().split('T')[0]);
    const [hiring, setHiring] = useState(false);

    const interviewsKey = ['interviews', candidate.id];
    const { data: interviews = [] } = useQuery({
        queryKey: interviewsKey,
        queryFn: () => atsService.listInterviews(candidate.id),
        staleTime: STALE.fast,
    });

    const stageConfig = STAGES.find(s => s.id === candidate.stage) || STAGES[0];

    const handleAddNote = async () => {
        if (!newNote.trim()) return;
        setSavingNote(true);
        try {
            await atsService.createInterview({
                org_id: orgId,
                candidate_id: candidate.id,
                tipo: 'CONTATO',
                data_hora: new Date().toISOString(),
                canal: 'WHATSAPP',
                notas: newNote,
                nota: newNota,
                created_by: 'gestor',
            });
            qc.invalidateQueries({ queryKey: interviewsKey });
            setNewNote('');
            setNewNota(undefined);
        } finally { setSavingNote(false); }
    };

    const handleHire = async () => {
        if (!confirm(`Contratar ${candidate.nome} em ${hireDate}? Isso criará um colaborador automaticamente.`)) return;
        setHiring(true);
        try {
            await atsService.hireCandidate(candidate.id, hireDate);
            onSaved();
        } catch (err: any) { alert('Erro: ' + err.message); }
        finally { setHiring(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
                <div className={`px-6 py-5 border-b flex items-center justify-between ${stageConfig.bg}`}>
                    <div>
                        <h2 className="text-lg font-black text-slate-900">{candidate.nome}</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${stageConfig.bg} ${stageConfig.color} border border-current/20`}>
                                {stageConfig.label}
                            </span>
                            {candidate.nota_final != null && (
                                <span className="flex items-center gap-1 text-xs font-black text-amber-700">
                                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {candidate.nota_final}
                                </span>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/60 hover:bg-white rounded-xl"><X className="w-5 h-5" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Dados */}
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { label: 'Telefone', value: candidate.telefone, icon: Phone },
                            { label: 'E-mail', value: candidate.email, icon: Mail },
                            { label: 'Origem', value: ORIGEM_LABELS[candidate.origem], icon: UserSearch },
                            { label: 'Pretensão', value: candidate.pretensao_salarial ? `R$ ${candidate.pretensao_salarial.toLocaleString('pt-BR')}` : '—', icon: DollarSign },
                            { label: 'Disponibilidade', value: candidate.disponibilidade || '—', icon: Calendar },
                            { label: 'Experiência', value: candidate.experiencia_anos ? `${candidate.experiencia_anos} anos` : '—', icon: Briefcase },
                        ].map(({ label, value, icon: Icon }) => (
                            <div key={label}>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Icon className="w-3 h-3" />{label}</p>
                                <p className="text-sm font-bold text-slate-800 mt-0.5">{value || '—'}</p>
                            </div>
                        ))}
                    </div>

                    {candidate.observacoes && (
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-xs font-bold text-slate-600">{candidate.observacoes}</p>
                        </div>
                    )}

                    {/* Botão de Contratar */}
                    {(candidate.stage === 'APROVADO' || candidate.stage === 'PROPOSTA') && !candidate.employee_id && (
                        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-3">
                            <p className="text-xs font-black text-emerald-800 uppercase tracking-tight">Contratar este candidato</p>
                            <div className="flex items-center gap-3">
                                <input type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} className="flex-1 px-3 py-2 bg-white border border-emerald-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-200" />
                                <button onClick={handleHire} disabled={hiring}
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-50">
                                    {hiring ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                                    Contratar
                                </button>
                            </div>
                        </div>
                    )}

                    {candidate.employee_id && (
                        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-2">
                            <Check className="w-4 h-4 text-emerald-600" />
                            <p className="text-xs font-black text-emerald-700">Contratado em {candidate.data_contratacao}</p>
                        </div>
                    )}

                    {/* Timeline */}
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Histórico de Interações</p>
                        {interviews.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-4">Nenhuma interação registrada</p>
                        ) : (
                            <div className="space-y-2">
                                {interviews.map(iv => (
                                    <div key={iv.id} className="flex gap-3 p-3 bg-slate-50 rounded-xl">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-black text-indigo-600">{iv.tipo.replace('_', ' ')}</span>
                                                <span className="text-[10px] text-slate-400">{new Date(iv.data_hora).toLocaleString('pt-BR')}</span>
                                                {iv.nota != null && (
                                                    <span className="flex items-center gap-0.5 text-[10px] font-black text-amber-700">
                                                        <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />{iv.nota}
                                                    </span>
                                                )}
                                            </div>
                                            {iv.notas && <p className="text-xs text-slate-600 mt-0.5">{iv.notas}</p>}
                                            {iv.proxima_etapa && <p className="text-[10px] font-bold text-indigo-500 mt-1">→ {iv.proxima_etapa}</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Nova nota */}
                    <div className="space-y-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nova Anotação</p>
                        <textarea value={newNote} onChange={e => setNewNote(e.target.value)} className={inputCls + ' resize-none h-20'} placeholder="Registre interação, feedback, observação..." />
                        <div className="flex items-center gap-2">
                            <input type="number" min="0" max="10" step="0.5" value={newNota ?? ''} onChange={e => setNewNota(parseFloat(e.target.value) || undefined)} className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-center outline-none" placeholder="Nota" />
                            <button onClick={handleAddNote} disabled={savingNote || !newNote.trim()}
                                className="flex items-center gap-2 flex-1 justify-center px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50">
                                {savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                                Registrar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── Componente principal ─────────────────────────────────────────────────────

interface LaborATSProps {
    orgId: string;
    projects?: { id: string; name: string }[];
}

type ATSView = 'kanban' | 'jobs' | 'talent_bank';

const LaborATS: React.FC<LaborATSProps> = ({ orgId, projects = [] }) => {
    const qc = useQueryClient();
    const [view, setView] = useState<ATSView>('kanban');
    const [selectedJobId, setSelectedJobId] = useState<string>('');
    const [search, setSearch] = useState('');
    const [showJobForm, setShowJobForm] = useState(false);
    const [editingJob, setEditingJob] = useState<JobOpening | null>(null);
    const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
    const [showAddCandidate, setShowAddCandidate] = useState(false);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [overStage, setOverStage] = useState<string | null>(null);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    const jobsKey      = ['ats', 'jobs', orgId];
    const candidatesKey = ['ats', 'candidates', orgId, selectedJobId];
    const talentKey    = ['ats', 'talent', orgId];

    const { data: jobs = [], isLoading: loadingJobs } = useQuery({
        queryKey: jobsKey,
        queryFn: () => atsService.listJobs(orgId),
        staleTime: STALE.normal, enabled: !!orgId,
    });

    const { data: candidates = [], isLoading: loadingCand } = useQuery({
        queryKey: candidatesKey,
        queryFn: () => atsService.listCandidates(orgId, { jobId: selectedJobId || undefined }),
        staleTime: STALE.fast, enabled: !!orgId,
    });

    const { data: talentBank = [] } = useQuery({
        queryKey: talentKey,
        queryFn: () => atsService.listCandidates(orgId, { bancTalentos: true }),
        staleTime: STALE.normal, enabled: !!orgId && view === 'talent_bank',
    });

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: jobsKey });
        qc.invalidateQueries({ queryKey: candidatesKey });
        qc.invalidateQueries({ queryKey: talentKey });
    };

    const stageMutation = useMutation({
        mutationFn: ({ id, stage }: { id: string; stage: CandidateStage }) => atsService.updateCandidateStage(id, stage),
        onMutate: async ({ id, stage }) => {
            await qc.cancelQueries({ queryKey: candidatesKey });
            const prev = qc.getQueryData<Candidate[]>(candidatesKey);
            qc.setQueryData<Candidate[]>(candidatesKey, old =>
                old ? old.map(c => c.id === id ? { ...c, stage } : c) : old
            );
            return { prev };
        },
        onError: (_err, _vars, ctx) => {
            if (ctx?.prev) qc.setQueryData(candidatesKey, ctx.prev);
        },
        onSettled: invalidate,
    });

    const handleDragStart = ({ active }: DragStartEvent) => setDraggingId(String(active.id));
    const handleDragOver = ({ over }: { over: { id: string | number } | null }) => setOverStage(over ? String(over.id) : null);
    const handleDragEnd = ({ active, over }: DragEndEvent) => {
        setDraggingId(null);
        setOverStage(null);
        if (!over) return;
        const newStage = String(over.id) as CandidateStage;
        const cand = candidates.find(c => c.id === String(active.id));
        if (cand && cand.stage !== newStage) {
            stageMutation.mutate({ id: String(active.id), stage: newStage });
        }
    };

    const deleteJobMutation  = useMutation({ mutationFn: (id: string) => atsService.deleteJob(id), onSuccess: invalidate });

    const activeJobs = jobs.filter(j => j.status === 'ABERTA');
    const selectedJob = jobs.find(j => j.id === selectedJobId);

    const draggingCandidate = draggingId ? candidates.find(c => c.id === draggingId) : null;

    const filteredCandidates = candidates.filter(c =>
        STAGES.some(s => s.id === c.stage) &&
        (!search || c.nome.toLowerCase().includes(search.toLowerCase()))
    );

    // ── Add Candidate Form (inline simples) ──
    const [newCand, setNewCand] = useState({ nome: '', telefone: '', email: '', origem: 'INDICACAO' as CandidateOrigem, experiencia_anos: 0, pretensao_salarial: undefined as number | undefined });
    const [savingCand, setSavingCand] = useState(false);

    const handleAddCandidate = async () => {
        if (!newCand.nome.trim() || !selectedJobId) return;
        setSavingCand(true);
        try {
            await atsService.createCandidate({
                org_id: orgId, job_id: selectedJobId,
                nome: newCand.nome, telefone: newCand.telefone, email: newCand.email,
                origem: newCand.origem, stage: 'RECEBIDO', banco_talentos: false,
                experiencia_anos: newCand.experiencia_anos,
                pretensao_salarial: newCand.pretensao_salarial,
            });
            setNewCand({ nome: '', telefone: '', email: '', origem: 'INDICACAO', experiencia_anos: 0, pretensao_salarial: undefined });
            setShowAddCandidate(false);
            invalidate();
        } finally { setSavingCand(false); }
    };

    return (
        <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Vagas Abertas',    value: activeJobs.length,                                      bg: 'bg-violet-50',  text: 'text-violet-700' },
                    { label: 'Candidatos Ativos', value: candidates.filter(c => !DISCARD_STAGES.includes(c.stage)).length, bg: 'bg-indigo-50',  text: 'text-indigo-700' },
                    { label: 'Para Contratar',   value: candidates.filter(c => c.stage === 'APROVADO').length,  bg: 'bg-emerald-50', text: 'text-emerald-700' },
                    { label: 'Banco de Talentos',value: talentBank.length,                                      bg: 'bg-amber-50',   text: 'text-amber-700' },
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
                    {([['kanban', 'Pipeline', UserSearch], ['jobs', 'Vagas', Briefcase], ['talent_bank', 'Banco de Talentos', Award]] as const).map(([id, label, Icon]) => (
                        <button key={id} onClick={() => setView(id)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${view === id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                            <Icon className="w-3.5 h-3.5" />{label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {view === 'kanban' && (
                        <div className="relative">
                            <select value={selectedJobId} onChange={e => setSelectedJobId(e.target.value)} className="pl-3 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none appearance-none min-w-[180px]">
                                <option value="">Todas as vagas</option>
                                {activeJobs.map(j => <option key={j.id} value={j.id}>{j.titulo}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                        </div>
                    )}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-100 w-36" />
                    </div>
                    <button onClick={() => view === 'jobs' ? (setEditingJob(null), setShowJobForm(true)) : setShowAddCandidate(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl hover:bg-violet-700 font-bold text-xs shadow-md">
                        <Plus className="w-3.5 h-3.5" />
                        {view === 'jobs' ? 'Nova Vaga' : 'Novo Candidato'}
                    </button>
                </div>
            </div>

            {/* Kanban Pipeline */}
            {view === 'kanban' && (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                >
                    <div className="overflow-x-auto">
                        <div className="flex gap-4 min-w-max pb-4">
                            {STAGES.map(stage => {
                                const stageCands = candidates.filter(c =>
                                    c.stage === stage.id &&
                                    (!search || c.nome.toLowerCase().includes(search.toLowerCase()))
                                );
                                return (
                                    <KanbanColumn
                                        key={stage.id}
                                        stage={stage}
                                        candidates={stageCands}
                                        onSelect={setSelectedCandidate}
                                        onStageChange={(id, s) => stageMutation.mutate({ id, stage: s })}
                                        onDiscard={(id, s) => stageMutation.mutate({ id, stage: s })}
                                        isOver={overStage === stage.id}
                                    />
                                );
                            })}
                        </div>
                    </div>
                    <DragOverlay>
                        {draggingCandidate && (
                            <CandidateCardInner
                                candidate={draggingCandidate}
                                onSelect={() => {}}
                                onStageChange={() => {}}
                                onDiscard={() => {}}
                                isDragging
                            />
                        )}
                    </DragOverlay>
                </DndContext>
            )}

            {/* Lista de Vagas */}
            {view === 'jobs' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    {loadingJobs ? <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-indigo-500 animate-spin" /></div>
                    : jobs.length === 0 ? (
                        <div className="text-center py-16">
                            <Briefcase className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-black text-slate-400">Nenhuma vaga cadastrada</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {jobs.map(j => {
                                const prio = PRIORITY_CONFIG[j.prioridade];
                                return (
                                    <div key={j.id} className="flex items-center gap-4 px-4 py-4 hover:bg-slate-50/50">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <span className="text-sm font-black text-slate-900">{j.titulo}</span>
                                                <span className={`flex items-center gap-1 text-[10px] font-black ${prio.color}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${prio.dot}`} />{prio.label}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${j.status === 'ABERTA' ? 'bg-emerald-100 text-emerald-700' : j.status === 'FECHADA' ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>
                                                    {j.status}
                                                </span>
                                                {j.project_name && <span className="text-xs text-indigo-600 font-bold">{j.project_name}</span>}
                                            </div>
                                            <div className="flex items-center gap-4 mt-1 flex-wrap">
                                                <span className="text-xs text-slate-400">{j.cargo} · {j.tipo_contrato} · {j.quantidade} vaga{j.quantidade > 1 ? 's' : ''}</span>
                                                {(j.salario_min || j.salario_max) && (
                                                    <span className="text-xs font-bold text-emerald-700">
                                                        R$ {j.salario_min?.toLocaleString('pt-BR')} {j.salario_max ? `→ ${j.salario_max.toLocaleString('pt-BR')}` : ''}
                                                    </span>
                                                )}
                                                <span className="flex items-center gap-1 text-xs text-slate-500">
                                                    <Users className="w-3 h-3" />{j.candidates_count} candidatos
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button onClick={() => { setSelectedJobId(j.id); setView('kanban'); }}
                                                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg text-[10px] font-black">
                                                Pipeline <ChevronRight className="w-3 h-3" />
                                            </button>
                                            <button onClick={() => { setEditingJob(j); setShowJobForm(true); }} className="p-1.5 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600" title="Editar vaga">
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button onClick={() => { if (confirm('Cancelar esta vaga?')) deleteJobMutation.mutate(j.id); }} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-rose-600">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Banco de Talentos */}
            {view === 'talent_bank' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    {talentBank.length === 0 ? (
                        <div className="text-center py-16">
                            <Award className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-black text-slate-400">Banco de talentos vazio</p>
                            <p className="text-xs text-slate-400 mt-1">Marque candidatos como "Banco de Talentos" para reutilizá-los em futuras vagas.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                            {talentBank.map(c => (
                                <div key={c.id} onClick={() => setSelectedCandidate(c)} className="p-4 rounded-2xl border border-slate-100 hover:shadow-md cursor-pointer transition-all">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center text-sm font-black text-amber-700">
                                            {c.nome.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-slate-900">{c.nome}</p>
                                            <p className="text-[11px] text-slate-400">{c.job_titulo}</p>
                                        </div>
                                    </div>
                                    {c.nota_final != null && (
                                        <div className="flex items-center gap-1">
                                            {[1,2,3,4,5].map(i => (
                                                <Star key={i} className={`w-3.5 h-3.5 ${i <= Math.round(c.nota_final! / 2) ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} />
                                            ))}
                                            <span className="text-xs font-bold text-slate-600 ml-1">{c.nota_final}</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Modal Novo Candidato */}
            {showAddCandidate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col overflow-hidden">
                        <div className="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-violet-600 to-violet-700">
                            <h2 className="text-base font-black text-white">Novo Candidato</h2>
                            <button onClick={() => setShowAddCandidate(false)} className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="p-5 space-y-3">
                            {!selectedJobId && (
                                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                    <p className="text-xs font-bold text-amber-700">Selecione uma vaga no filtro do Kanban antes de adicionar.</p>
                                </div>
                            )}
                            <InputGroup label="Nome *">
                                <input value={newCand.nome} onChange={e => setNewCand(p => ({ ...p, nome: e.target.value }))} className={inputCls} />
                            </InputGroup>
                            <div className="grid grid-cols-2 gap-3">
                                <InputGroup label="Telefone">
                                    <input value={newCand.telefone} onChange={e => setNewCand(p => ({ ...p, telefone: e.target.value }))} className={inputCls} />
                                </InputGroup>
                                <InputGroup label="E-mail">
                                    <input value={newCand.email} onChange={e => setNewCand(p => ({ ...p, email: e.target.value }))} className={inputCls} />
                                </InputGroup>
                            </div>
                            <InputGroup label="Origem">
                                <div className="relative">
                                    <select value={newCand.origem} onChange={e => setNewCand(p => ({ ...p, origem: e.target.value as CandidateOrigem }))} className={inputCls + ' appearance-none pr-8'}>
                                        {(Object.entries(ORIGEM_LABELS) as [CandidateOrigem, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                </div>
                            </InputGroup>
                        </div>
                        <div className="px-5 py-4 border-t flex justify-end gap-3 bg-slate-50/50">
                            <button onClick={() => setShowAddCandidate(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
                            <button onClick={handleAddCandidate} disabled={savingCand || !newCand.nome.trim() || !selectedJobId}
                                className="flex items-center gap-2 px-5 py-2 bg-violet-600 text-white rounded-xl font-bold text-sm hover:bg-violet-700 disabled:opacity-50">
                                {savingCand ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                Adicionar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showJobForm && <JobForm orgId={orgId} job={editingJob} projects={projects} onClose={() => { setShowJobForm(false); setEditingJob(null); }} onSaved={() => { setShowJobForm(false); setEditingJob(null); invalidate(); }} />}
            {selectedCandidate && (
                <CandidatePanel candidate={selectedCandidate} orgId={orgId}
                    onClose={() => setSelectedCandidate(null)}
                    onSaved={() => { setSelectedCandidate(null); invalidate(); }} />
            )}
        </div>
    );
};

export default LaborATS;
