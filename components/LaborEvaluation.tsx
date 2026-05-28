import React, { useState, useMemo } from 'react';
import {
    Star, Plus, X, ChevronRight, Loader2, Award, Target,
    Users, Calendar, Check, BarChart3, TrendingUp, Edit3,
    Trash2, AlertTriangle, BookOpen, ClipboardCheck, ChevronDown,
    Play, Lock, RotateCcw, FileText
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    evaluationService,
    EvaluationCycle, EvaluationResponse, EvaluationResult, PdiItem,
    Competencia, RespostaItem,
    CycleTipo, CycleStatus, ResponseTipo, PdiStatus, Classificacao
} from '../services/evaluationService';
import { STALE } from '../lib/queryClient';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<CycleTipo, string> = {
    '90': '90° (Auto + Gestor)', '180': '180° (Auto + Gestor + Par)',
    '360': '360° (Todas as direções)', 'SELF': 'Autoavaliação',
};

const STATUS_CONFIG: Record<CycleStatus, { label: string; color: string; bg: string; dot: string }> = {
    RASCUNHO: { label: 'Rascunho', color: 'text-slate-600', bg: 'bg-slate-100', dot: 'bg-slate-400' },
    ATIVO:    { label: 'Ativo',    color: 'text-emerald-700', bg: 'bg-emerald-100', dot: 'bg-emerald-500' },
    ENCERRADO:{ label: 'Encerrado',color: 'text-slate-500',  bg: 'bg-slate-100', dot: 'bg-slate-300' },
};

const CLASS_CONFIG: Record<Classificacao, { label: string; color: string; bg: string; stars: number }> = {
    DESTAQUE: { label: 'Destaque',  color: 'text-amber-700',   bg: 'bg-amber-50',   stars: 5 },
    ACIMA:    { label: 'Acima',     color: 'text-emerald-700', bg: 'bg-emerald-50', stars: 4 },
    ESPERADO: { label: 'Esperado',  color: 'text-blue-700',    bg: 'bg-blue-50',    stars: 3 },
    ABAIXO:   { label: 'Abaixo',    color: 'text-orange-700',  bg: 'bg-orange-50',  stars: 2 },
    CRITICO:  { label: 'Crítico',   color: 'text-red-700',     bg: 'bg-red-50',     stars: 1 },
};

const PDI_STATUS_CONFIG: Record<PdiStatus, { label: string; color: string; bg: string }> = {
    PENDENTE:     { label: 'Pendente',    color: 'text-slate-600',   bg: 'bg-slate-100' },
    EM_ANDAMENTO: { label: 'Em andamento',color: 'text-blue-700',    bg: 'bg-blue-100' },
    CONCLUIDO:    { label: 'Concluído',   color: 'text-emerald-700', bg: 'bg-emerald-100' },
    CANCELADO:    { label: 'Cancelado',   color: 'text-red-600',     bg: 'bg-red-100' },
};

const RESP_TIPO_LABELS: Record<ResponseTipo, string> = {
    SELF: 'Autoavaliação', GESTOR: 'Gestor', PAR: 'Par', SUBORDINADO: 'Subordinado',
};

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-300 transition-all';
const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{children}</label>
);
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="space-y-1.5"><FieldLabel>{label}</FieldLabel>{children}</div>
);

const StarRating: React.FC<{ value: number; onChange?: (v: number) => void; readonly?: boolean }> = ({ value, onChange, readonly }) => (
    <div className="flex gap-0.5">
        {[1,2,3,4,5].map(n => (
            <button key={n} type="button" disabled={readonly}
                onClick={() => onChange?.(n)}
                className={`transition-colors ${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}>
                <Star className={`w-5 h-5 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
            </button>
        ))}
    </div>
);

const uuid = () => crypto.randomUUID();

// ── Cycle Form ────────────────────────────────────────────────────────────────

interface CycleFormProps {
    orgId: string;
    cycle?: EvaluationCycle | null;
    onClose: () => void;
    onSaved: () => void;
}

const CycleForm: React.FC<CycleFormProps> = ({ orgId, cycle, onClose, onSaved }) => {
    const isEditing = !!cycle;
    const [saving, setSaving] = useState(false);
    const today = new Date().toISOString().split('T')[0];
    const [form, setForm] = useState({
        nome: cycle?.nome || '',
        descricao: cycle?.descricao || '',
        tipo: cycle?.tipo || '180' as CycleTipo,
        periodo_inicio: cycle?.periodo_inicio || today,
        periodo_fim: cycle?.periodo_fim || '',
        status: cycle?.status || 'RASCUNHO' as CycleStatus,
    });
    const [competencias, setCompetencias] = useState<Competencia[]>(
        cycle?.competencias || [
            { id: uuid(), nome: 'Qualidade do Trabalho', descricao: '', peso: 3, categoria: 'Técnica' },
            { id: uuid(), nome: 'Trabalho em Equipe',    descricao: '', peso: 3, categoria: 'Comportamental' },
            { id: uuid(), nome: 'Proatividade',          descricao: '', peso: 3, categoria: 'Comportamental' },
        ]
    );

    const addComp = () => setCompetencias(p => [...p, { id: uuid(), nome: '', descricao: '', peso: 3, categoria: '' }]);
    const removeComp = (id: string) => setCompetencias(p => p.filter(c => c.id !== id));
    const updateComp = (id: string, field: keyof Competencia, val: unknown) =>
        setCompetencias(p => p.map(c => c.id === id ? { ...c, [field]: val } : c));

    const handleSave = async () => {
        if (!form.nome || !form.periodo_inicio || !form.periodo_fim) {
            alert('Preencha nome e período.'); return;
        }
        if (competencias.some(c => !c.nome)) {
            alert('Todas as competências precisam de nome.'); return;
        }
        setSaving(true);
        try {
            const payload = { ...form, org_id: orgId, competencias };
            if (isEditing) {
                await evaluationService.updateCycle(cycle!.id, payload);
            } else {
                await evaluationService.createCycle(payload as any);
            }
            onSaved();
        } catch (e: any) {
            alert(e.message || 'Erro ao salvar.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <h2 className="text-lg font-black text-slate-900">{isEditing ? 'Editar Ciclo' : 'Novo Ciclo de Avaliação'}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Nome do ciclo">
                            <input className={inputCls} value={form.nome}
                                onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                                placeholder="Ex: Avaliação Semestral 2026.1" />
                        </Field>
                        <Field label="Tipo">
                            <select className={inputCls} value={form.tipo}
                                onChange={e => setForm(p => ({ ...p, tipo: e.target.value as CycleTipo }))}>
                                {(Object.entries(TIPO_LABELS) as [CycleTipo, string][]).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </Field>
                    </div>
                    <Field label="Descrição">
                        <textarea className={`${inputCls} resize-none`} rows={2} value={form.descricao}
                            onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                            placeholder="Objetivo do ciclo..." />
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Início">
                            <input type="date" className={inputCls} value={form.periodo_inicio}
                                onChange={e => setForm(p => ({ ...p, periodo_inicio: e.target.value }))} />
                        </Field>
                        <Field label="Fim">
                            <input type="date" className={inputCls} value={form.periodo_fim}
                                onChange={e => setForm(p => ({ ...p, periodo_fim: e.target.value }))} />
                        </Field>
                    </div>

                    {/* Competências */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <FieldLabel>Competências avaliadas</FieldLabel>
                            <button onClick={addComp}
                                className="flex items-center gap-1.5 text-xs font-bold text-violet-600 hover:text-violet-800 transition-colors">
                                <Plus className="w-3.5 h-3.5" /> Adicionar
                            </button>
                        </div>
                        <div className="space-y-2">
                            {competencias.map((c, i) => (
                                <div key={c.id} className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl">
                                    <span className="text-[10px] font-black text-slate-400 mt-2 w-4 shrink-0">{i + 1}</span>
                                    <div className="flex-1 grid grid-cols-3 gap-2">
                                        <input className={`${inputCls} col-span-2`} placeholder="Nome da competência"
                                            value={c.nome} onChange={e => updateComp(c.id, 'nome', e.target.value)} />
                                        <input className={inputCls} placeholder="Categoria"
                                            value={c.categoria || ''} onChange={e => updateComp(c.id, 'categoria', e.target.value)} />
                                    </div>
                                    <div className="flex items-center gap-1 mt-1.5 shrink-0">
                                        <span className="text-[10px] text-slate-400 font-bold">Peso</span>
                                        <select className="text-xs font-bold border border-slate-200 rounded-lg px-1.5 py-1 bg-white outline-none"
                                            value={c.peso} onChange={e => updateComp(c.id, 'peso', Number(e.target.value))}>
                                            {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                                        </select>
                                    </div>
                                    <button onClick={() => removeComp(c.id)} className="mt-1.5 p-1 hover:bg-red-100 rounded-lg transition-colors">
                                        <X className="w-3.5 h-3.5 text-red-400" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                        Cancelar
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        className="flex items-center gap-2 px-5 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-50 shadow-lg shadow-violet-900/20">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        {isEditing ? 'Salvar' : 'Criar Ciclo'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Formulário de Avaliação ───────────────────────────────────────────────────

interface EvalFormProps {
    response: EvaluationResponse;
    competencias: Competencia[];
    onClose: () => void;
    onSaved: () => void;
}

const EvalForm: React.FC<EvalFormProps> = ({ response, competencias, onClose, onSaved }) => {
    const [saving, setSaving] = useState(false);
    const [respostas, setRespostas] = useState<RespostaItem[]>(
        competencias.map(c => {
            const existing = response.respostas.find(r => r.competencia_id === c.id);
            return existing || { competencia_id: c.id, nota: 0, comentario: '' };
        })
    );
    const [pontosFortes, setPontosFortes] = useState(response.pontos_fortes || '');
    const [pontosMelhoria, setPontosMelhoria] = useState(response.pontos_melhoria || '');
    const [comentarioGeral, setComentarioGeral] = useState(response.comentario_geral || '');

    const notaMedia = useMemo(() => {
        const filled = respostas.filter(r => r.nota > 0);
        if (!filled.length) return 0;
        const totalPeso = competencias.reduce((s, c) => {
            const r = respostas.find(r => r.competencia_id === c.id);
            return r && r.nota > 0 ? s + c.peso : s;
        }, 0);
        const weighted = competencias.reduce((s, c) => {
            const r = respostas.find(r => r.competencia_id === c.id);
            return r && r.nota > 0 ? s + r.nota * c.peso : s;
        }, 0);
        return totalPeso > 0 ? Math.round((weighted / totalPeso) * 100) / 100 : 0;
    }, [respostas, competencias]);

    const handleSubmit = async () => {
        if (respostas.some(r => r.nota === 0)) {
            alert('Avalie todas as competências antes de enviar.'); return;
        }
        setSaving(true);
        try {
            await evaluationService.submitResponse(response.id, {
                respostas,
                nota_media: notaMedia,
                pontos_fortes: pontosFortes,
                pontos_melhoria: pontosMelhoria,
                comentario_geral: comentarioGeral,
            });
            onSaved();
        } catch (e: any) {
            alert(e.message || 'Erro ao enviar.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <div>
                        <h2 className="text-base font-black text-slate-900">
                            {RESP_TIPO_LABELS[response.tipo]} — {response.evaluatee_nome}
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">Nota prévia média: {notaMedia.toFixed(2)}/5.00</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {competencias.map(comp => {
                        const r = respostas.find(r => r.competencia_id === comp.id)!;
                        return (
                            <div key={comp.id} className="p-4 bg-slate-50 rounded-2xl space-y-2">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">{comp.nome}</p>
                                        {comp.categoria && (
                                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{comp.categoria}</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <StarRating value={r.nota}
                                            onChange={v => setRespostas(p => p.map(x => x.competencia_id === comp.id ? { ...x, nota: v } : x))} />
                                        <span className={`text-xs font-black w-6 text-center ${r.nota > 0 ? 'text-violet-600' : 'text-slate-300'}`}>
                                            {r.nota > 0 ? r.nota : '–'}
                                        </span>
                                    </div>
                                </div>
                                <input className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-1 focus:ring-violet-200 transition-all"
                                    placeholder="Comentário sobre esta competência (opcional)"
                                    value={r.comentario || ''}
                                    onChange={e => setRespostas(p => p.map(x => x.competencia_id === comp.id ? { ...x, comentario: e.target.value } : x))} />
                            </div>
                        );
                    })}

                    <div className="space-y-3 pt-2">
                        <Field label="Pontos fortes">
                            <textarea className={`${inputCls} resize-none text-xs`} rows={2}
                                value={pontosFortes} onChange={e => setPontosFortes(e.target.value)}
                                placeholder="Principais pontos fortes observados..." />
                        </Field>
                        <Field label="Pontos de melhoria">
                            <textarea className={`${inputCls} resize-none text-xs`} rows={2}
                                value={pontosMelhoria} onChange={e => setPontosMelhoria(e.target.value)}
                                placeholder="Principais oportunidades de desenvolvimento..." />
                        </Field>
                        <Field label="Comentário geral">
                            <textarea className={`${inputCls} resize-none text-xs`} rows={2}
                                value={comentarioGeral} onChange={e => setComentarioGeral(e.target.value)}
                                placeholder="Observações adicionais..." />
                        </Field>
                    </div>
                </div>
                <div className="flex items-center justify-between p-6 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-bold">Nota média:</span>
                        <span className="text-lg font-black text-violet-700">{notaMedia.toFixed(2)}</span>
                        <span className="text-xs text-slate-400">/5.00</span>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                            Cancelar
                        </button>
                        <button onClick={handleSubmit} disabled={saving}
                            className="flex items-center gap-2 px-5 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-50 shadow-lg shadow-violet-900/20">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Enviar Avaliação
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── PDI Form ──────────────────────────────────────────────────────────────────

interface PdiFormProps {
    orgId: string;
    item?: PdiItem | null;
    employees: { id: string; name: string }[];
    onClose: () => void;
    onSaved: () => void;
}

const PdiForm: React.FC<PdiFormProps> = ({ orgId, item, employees, onClose, onSaved }) => {
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<Partial<PdiItem>>({
        org_id: orgId,
        employee_id: item?.employee_id || '',
        competencia: item?.competencia || '',
        descricao: item?.descricao || '',
        acao: item?.acao || '',
        recursos: item?.recursos || '',
        prazo: item?.prazo || '',
        status: item?.status || 'PENDENTE',
        progresso_pct: item?.progresso_pct || 0,
    });

    const handleSave = async () => {
        if (!form.employee_id || !form.competencia || !form.acao) {
            alert('Colaborador, competência e ação são obrigatórios.'); return;
        }
        setSaving(true);
        try {
            if (item) {
                await evaluationService.updatePdiItem(item.id, form);
            } else {
                await evaluationService.createPdiItem(form as any);
            }
            onSaved();
        } catch (e: any) {
            alert(e.message || 'Erro ao salvar.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg">
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <h2 className="text-base font-black text-slate-900">{item ? 'Editar PDI' : 'Novo Item de PDI'}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Colaborador">
                            <select className={inputCls} value={form.employee_id}
                                onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))}>
                                <option value="">Selecionar...</option>
                                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                        </Field>
                        <Field label="Competência">
                            <input className={inputCls} placeholder="Ex: Comunicação"
                                value={form.competencia} onChange={e => setForm(p => ({ ...p, competencia: e.target.value }))} />
                        </Field>
                    </div>
                    <Field label="Ação de desenvolvimento">
                        <input className={inputCls} placeholder="O que o colaborador vai fazer?"
                            value={form.acao} onChange={e => setForm(p => ({ ...p, acao: e.target.value }))} />
                    </Field>
                    <Field label="Descrição">
                        <textarea className={`${inputCls} resize-none`} rows={2}
                            value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                            placeholder="Contexto e objetivo desta ação..." />
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Recursos necessários">
                            <input className={inputCls} placeholder="Curso, livro, mentor..."
                                value={form.recursos || ''} onChange={e => setForm(p => ({ ...p, recursos: e.target.value }))} />
                        </Field>
                        <Field label="Prazo">
                            <input type="date" className={inputCls} value={form.prazo || ''}
                                onChange={e => setForm(p => ({ ...p, prazo: e.target.value }))} />
                        </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Status">
                            <select className={inputCls} value={form.status}
                                onChange={e => setForm(p => ({ ...p, status: e.target.value as PdiStatus }))}>
                                {(Object.entries(PDI_STATUS_CONFIG) as [PdiStatus, { label: string }][]).map(([k, v]) => (
                                    <option key={k} value={k}>{v.label}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label={`Progresso: ${form.progresso_pct}%`}>
                            <input type="range" min={0} max={100} step={5}
                                className="w-full mt-1 accent-violet-600"
                                value={form.progresso_pct}
                                onChange={e => setForm(p => ({ ...p, progresso_pct: Number(e.target.value) }))} />
                        </Field>
                    </div>
                </div>
                <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                        Cancelar
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        className="flex items-center gap-2 px-5 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-50 shadow-lg shadow-violet-900/20">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Salvar
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Cycle Detail View ─────────────────────────────────────────────────────────

interface CycleDetailProps {
    cycle: EvaluationCycle;
    orgId: string;
    employees: { id: string; name: string }[];
    onBack: () => void;
    onRefresh: () => void;
}

const CycleDetail: React.FC<CycleDetailProps> = ({ cycle, orgId, employees, onBack, onRefresh }) => {
    const qc = useQueryClient();
    const [evalForm, setEvalForm] = useState<EvaluationResponse | null>(null);
    const [consolidating, setConsolidating] = useState(false);
    const [view, setView] = useState<'avaliacoes' | 'resultados'>('avaliacoes');

    const { data: responses = [], isLoading: loadingResp } = useQuery({
        queryKey: ['eval-responses', cycle.id],
        queryFn: () => evaluationService.getResponsesByCycle(cycle.id),
        staleTime: STALE.fast,
    });

    const { data: results = [], isLoading: loadingRes } = useQuery({
        queryKey: ['eval-results', cycle.id],
        queryFn: () => evaluationService.getResults(cycle.id),
        staleTime: STALE.fast,
        enabled: cycle.status === 'ENCERRADO',
    });

    const pendentes = responses.filter(r => r.status === 'PENDENTE').length;
    const concluidas = responses.filter(r => r.status === 'CONCLUIDA').length;
    const taxa = responses.length > 0 ? Math.round(concluidas / responses.length * 100) : 0;

    const handleActivate = async () => {
        try {
            await evaluationService.updateCycle(cycle.id, { status: 'ATIVO' });
            onRefresh();
        } catch (e: any) { alert(e.message); }
    };

    const handleConsolidate = async () => {
        if (!confirm('Isso encerrará o ciclo e calculará as notas finais. Confirmar?')) return;
        setConsolidating(true);
        try {
            const res = await evaluationService.consolidateCycle(cycle.id);
            alert(`Ciclo encerrado! ${res.consolidados} colaboradores avaliados.`);
            qc.invalidateQueries({ queryKey: ['eval-results', cycle.id] });
            onRefresh();
            setView('resultados');
        } catch (e: any) {
            alert(e.message || 'Erro ao consolidar.');
        } finally {
            setConsolidating(false);
        }
    };

    const STATUS = STATUS_CONFIG[cycle.status];

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start gap-4">
                <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors mt-1">
                    <ChevronDown className="w-5 h-5 text-slate-400 rotate-90" />
                </button>
                <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="text-xl font-black text-slate-900">{cycle.nome}</h2>
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black ${STATUS.color} ${STATUS.bg}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${STATUS.dot}`} />
                            {STATUS.label}
                        </span>
                        <span className="text-xs text-slate-400 font-bold">{TIPO_LABELS[cycle.tipo]}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                        {new Date(cycle.periodo_inicio).toLocaleDateString('pt-BR')} → {new Date(cycle.periodo_fim).toLocaleDateString('pt-BR')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {cycle.status === 'RASCUNHO' && (
                        <button onClick={handleActivate}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-900/20">
                            <Play className="w-4 h-4" /> Ativar Ciclo
                        </button>
                    )}
                    {cycle.status === 'ATIVO' && (
                        <button onClick={handleConsolidate} disabled={consolidating}
                            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-50 shadow-lg shadow-violet-900/20">
                            {consolidating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                            Encerrar e Consolidar
                        </button>
                    )}
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-4 gap-4">
                {[
                    { label: 'Avaliações', value: responses.length, color: 'violet', icon: ClipboardCheck },
                    { label: 'Pendentes', value: pendentes, color: 'amber', icon: AlertTriangle },
                    { label: 'Concluídas', value: concluidas, color: 'emerald', icon: Check },
                    { label: 'Taxa conclusão', value: `${taxa}%`, color: 'blue', icon: TrendingUp },
                ].map(({ label, value, color, icon: Icon }) => (
                    <div key={label} className={`bg-white p-4 rounded-2xl border border-slate-100 shadow-sm`}>
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

            {/* Sub-tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
                {(['avaliacoes', 'resultados'] as const).map(v => (
                    <button key={v} onClick={() => setView(v)}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${view === v ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                        {v === 'avaliacoes' ? 'Avaliações' : 'Resultados'}
                    </button>
                ))}
            </div>

            {/* Avaliações */}
            {view === 'avaliacoes' && (
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                    {loadingResp ? (
                        <div className="p-12 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
                        </div>
                    ) : responses.length === 0 ? (
                        <div className="p-12 text-center">
                            <ClipboardCheck className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-bold text-slate-400">Nenhuma avaliação gerada.</p>
                            <p className="text-xs text-slate-300 mt-1">Ative o ciclo para que as avaliações sejam criadas automaticamente.</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100">
                                    {['Avaliado', 'Avaliador', 'Tipo', 'Nota', 'Status', ''].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {responses.map(r => {
                                    const statusCfg = {
                                        PENDENTE: { label: 'Pendente', cls: 'bg-amber-100 text-amber-700' },
                                        EM_ANDAMENTO: { label: 'Em andamento', cls: 'bg-blue-100 text-blue-700' },
                                        CONCLUIDA: { label: 'Concluída', cls: 'bg-emerald-100 text-emerald-700' },
                                    }[r.status];
                                    return (
                                        <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                            <td className="px-4 py-3 font-bold text-slate-800">{r.evaluatee_nome || '–'}</td>
                                            <td className="px-4 py-3 text-slate-500">{r.evaluator_nome || 'Auto'}</td>
                                            <td className="px-4 py-3">
                                                <span className="text-xs font-bold text-slate-500">{RESP_TIPO_LABELS[r.tipo]}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {r.nota_media ? (
                                                    <span className="font-black text-violet-700">{r.nota_media.toFixed(2)}</span>
                                                ) : <span className="text-slate-300">–</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${statusCfg.cls}`}>{statusCfg.label}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {r.status !== 'CONCLUIDA' && cycle.status === 'ATIVO' && (
                                                    <button onClick={() => setEvalForm(r)}
                                                        className="px-3 py-1.5 text-[11px] font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition-colors">
                                                        Avaliar
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Resultados */}
            {view === 'resultados' && (
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                    {cycle.status !== 'ENCERRADO' ? (
                        <div className="p-12 text-center">
                            <Lock className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-bold text-slate-400">Ciclo ainda não encerrado.</p>
                            <p className="text-xs text-slate-300 mt-1">Os resultados ficam disponíveis após consolidação.</p>
                        </div>
                    ) : loadingRes ? (
                        <div className="p-12 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
                        </div>
                    ) : results.length === 0 ? (
                        <div className="p-12 text-center">
                            <BarChart3 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-bold text-slate-400">Nenhum resultado consolidado.</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100">
                                    {['#', 'Colaborador', 'Self', 'Gestor', 'Pares', 'Final', 'Classificação'].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((r, i) => {
                                    const cls = r.classificacao ? CLASS_CONFIG[r.classificacao] : null;
                                    return (
                                        <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                            <td className="px-4 py-3 text-slate-400 font-black text-xs">#{i + 1}</td>
                                            <td className="px-4 py-3">
                                                <p className="font-bold text-slate-800">{r.employee_nome || '–'}</p>
                                                {r.employee_cargo && <p className="text-[10px] text-slate-400">{r.employee_cargo}</p>}
                                            </td>
                                            <td className="px-4 py-3 font-bold text-slate-600">{r.nota_self?.toFixed(2) ?? '–'}</td>
                                            <td className="px-4 py-3 font-bold text-slate-600">{r.nota_gestor?.toFixed(2) ?? '–'}</td>
                                            <td className="px-4 py-3 font-bold text-slate-600">{r.nota_pares?.toFixed(2) ?? '–'}</td>
                                            <td className="px-4 py-3 text-xl font-black text-violet-700">{r.nota_final?.toFixed(2) ?? '–'}</td>
                                            <td className="px-4 py-3">
                                                {cls && (
                                                    <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${cls.color} ${cls.bg}`}>
                                                        {cls.label}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {evalForm && (
                <EvalForm
                    response={evalForm}
                    competencias={cycle.competencias}
                    onClose={() => setEvalForm(null)}
                    onSaved={() => {
                        setEvalForm(null);
                        qc.invalidateQueries({ queryKey: ['eval-responses', cycle.id] });
                    }}
                />
            )}
        </div>
    );
};

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

interface LaborEvaluationProps {
    orgId: string;
    employees: { id: string; name: string; status?: string }[];
}

type MainTab = 'ciclos' | 'pdi';

const LaborEvaluation: React.FC<LaborEvaluationProps> = ({ orgId, employees }) => {
    const qc = useQueryClient();
    const [mainTab, setMainTab] = useState<MainTab>('ciclos');
    const [selectedCycle, setSelectedCycle] = useState<EvaluationCycle | null>(null);
    const [showCycleForm, setShowCycleForm] = useState(false);
    const [editingCycle, setEditingCycle] = useState<EvaluationCycle | null>(null);
    const [showPdiForm, setShowPdiForm] = useState(false);
    const [editingPdi, setEditingPdi] = useState<PdiItem | null>(null);
    const [pdiFilter, setPdiFilter] = useState('');

    const activeEmployees = useMemo(() => employees.filter(e => (e.status || 'ATIVO') === 'ATIVO'), [employees]);

    const { data: cycles = [], isLoading: loadingCycles, refetch: refetchCycles } = useQuery({
        queryKey: ['eval-cycles', orgId],
        queryFn: () => evaluationService.getCycles(orgId),
        enabled: !!orgId,
        staleTime: STALE.fast,
    });

    const { data: pdiItems = [], isLoading: loadingPdi, refetch: refetchPdi } = useQuery({
        queryKey: ['pdi-items', orgId],
        queryFn: () => evaluationService.getPdiItems(orgId),
        enabled: !!orgId && mainTab === 'pdi',
        staleTime: STALE.fast,
    });

    const deleteCycleMut = useMutation({
        mutationFn: (id: string) => evaluationService.deleteCycle(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['eval-cycles', orgId] }),
        onError: (e: any) => alert(e.message || 'Erro ao excluir.'),
    });

    const deletePdiMut = useMutation({
        mutationFn: (id: string) => evaluationService.deletePdiItem(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['pdi-items', orgId] }),
        onError: (e: any) => alert(e.message || 'Erro ao excluir.'),
    });

    const filteredPdi = useMemo(() => {
        if (!pdiFilter) return pdiItems;
        const q = pdiFilter.toLowerCase();
        return pdiItems.filter(p =>
            p.employee_nome?.toLowerCase().includes(q) ||
            p.competencia.toLowerCase().includes(q) ||
            p.acao.toLowerCase().includes(q)
        );
    }, [pdiItems, pdiFilter]);

    const activeCycles = cycles.filter(c => c.status === 'ATIVO').length;
    const pdiPendentes = pdiItems.filter(p => p.status === 'PENDENTE' || p.status === 'EM_ANDAMENTO').length;
    const pdiConcluidos = pdiItems.filter(p => p.status === 'CONCLUIDO').length;

    if (selectedCycle) {
        return (
            <CycleDetail
                cycle={cycles.find(c => c.id === selectedCycle.id) || selectedCycle}
                orgId={orgId}
                employees={activeEmployees}
                onBack={() => setSelectedCycle(null)}
                onRefresh={() => { refetchCycles(); }}
            />
        );
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                        <Award className="w-5 h-5 text-violet-600" />
                        Avaliação de Desempenho 360°
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">Ciclos de avaliação, PDI e desenvolvimento de equipe</p>
                </div>
                <button
                    onClick={() => mainTab === 'ciclos' ? setShowCycleForm(true) : setShowPdiForm(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition-colors shadow-lg shadow-violet-900/20">
                    <Plus className="w-4 h-4" />
                    {mainTab === 'ciclos' ? 'Novo Ciclo' : 'Novo PDI'}
                </button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-4 gap-4">
                {[
                    { label: 'Ciclos ativos', value: activeCycles, icon: Play, color: 'emerald' },
                    { label: 'Total de ciclos', value: cycles.length, icon: RotateCcw, color: 'violet' },
                    { label: 'PDI em aberto', value: pdiPendentes, icon: Target, color: 'amber' },
                    { label: 'PDI concluídos', value: pdiConcluidos, icon: Check, color: 'blue' },
                ].map(({ label, value, icon: Icon, color }) => (
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

            {/* Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
                {([['ciclos', 'Ciclos de Avaliação'], ['pdi', 'PDI']] as [MainTab, string][]).map(([v, label]) => (
                    <button key={v} onClick={() => setMainTab(v)}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${mainTab === v ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {/* Ciclos List */}
            {mainTab === 'ciclos' && (
                <div className="space-y-3">
                    {loadingCycles ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
                        </div>
                    ) : cycles.length === 0 ? (
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-16 text-center">
                            <Award className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-bold text-slate-400">Nenhum ciclo criado.</p>
                            <p className="text-xs text-slate-300 mt-1">Crie o primeiro ciclo de avaliação de desempenho da sua equipe.</p>
                        </div>
                    ) : cycles.map(cycle => {
                        const STATUS = STATUS_CONFIG[cycle.status];
                        return (
                            <div key={cycle.id}
                                className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all p-5 flex items-center gap-4 cursor-pointer group"
                                onClick={() => setSelectedCycle(cycle)}>
                                <div className={`p-3 rounded-xl bg-violet-50 group-hover:scale-110 transition-transform`}>
                                    <Award className="w-5 h-5 text-violet-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="font-black text-slate-800">{cycle.nome}</p>
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black ${STATUS.color} ${STATUS.bg}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${STATUS.dot}`} />
                                            {STATUS.label}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-bold">{TIPO_LABELS[cycle.tipo]}</span>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                        {new Date(cycle.periodo_inicio).toLocaleDateString('pt-BR')} → {new Date(cycle.periodo_fim).toLocaleDateString('pt-BR')}
                                        {cycle.competencias.length > 0 && ` • ${cycle.competencias.length} competências`}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                    {cycle.status === 'RASCUNHO' && (
                                        <button onClick={() => { setEditingCycle(cycle); setShowCycleForm(true); }}
                                            className="p-2 hover:bg-slate-100 rounded-xl transition-colors" title="Editar">
                                            <Edit3 className="w-4 h-4 text-slate-400" />
                                        </button>
                                    )}
                                    {cycle.status === 'RASCUNHO' && (
                                        <button onClick={() => { if (confirm('Excluir este ciclo?')) deleteCycleMut.mutate(cycle.id); }}
                                            className="p-2 hover:bg-red-100 rounded-xl transition-colors" title="Excluir">
                                            <Trash2 className="w-4 h-4 text-red-400" />
                                        </button>
                                    )}
                                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* PDI List */}
            {mainTab === 'pdi' && (
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="relative flex-1 max-w-sm">
                            <input className={inputCls} placeholder="Filtrar por colaborador, competência ou ação..."
                                value={pdiFilter} onChange={e => setPdiFilter(e.target.value)} />
                        </div>
                    </div>

                    {loadingPdi ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
                        </div>
                    ) : filteredPdi.length === 0 ? (
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-16 text-center">
                            <BookOpen className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-bold text-slate-400">Nenhum item de PDI encontrado.</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100">
                                        {['Colaborador', 'Competência', 'Ação', 'Prazo', 'Progresso', 'Status', ''].map(h => (
                                            <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredPdi.map(p => {
                                        const sc = PDI_STATUS_CONFIG[p.status];
                                        return (
                                            <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                                <td className="px-4 py-3 font-bold text-slate-800">{p.employee_nome || '–'}</td>
                                                <td className="px-4 py-3 text-slate-600">{p.competencia}</td>
                                                <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate">{p.acao}</td>
                                                <td className="px-4 py-3 text-slate-400 text-xs">
                                                    {p.prazo ? new Date(p.prazo).toLocaleDateString('pt-BR') : '–'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                            <div className="h-full bg-violet-500 rounded-full transition-all"
                                                                style={{ width: `${p.progresso_pct}%` }} />
                                                        </div>
                                                        <span className="text-xs font-bold text-slate-500">{p.progresso_pct}%</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${sc.color} ${sc.bg}`}>{sc.label}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1">
                                                        <button onClick={() => { setEditingPdi(p); setShowPdiForm(true); }}
                                                            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                                                            <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                                                        </button>
                                                        <button onClick={() => { if (confirm('Excluir?')) deletePdiMut.mutate(p.id); }}
                                                            className="p-1.5 hover:bg-red-100 rounded-lg transition-colors">
                                                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                                        </button>
                                                    </div>
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
            {showCycleForm && (
                <CycleForm
                    orgId={orgId}
                    cycle={editingCycle}
                    onClose={() => { setShowCycleForm(false); setEditingCycle(null); }}
                    onSaved={() => { setShowCycleForm(false); setEditingCycle(null); refetchCycles(); }}
                />
            )}
            {showPdiForm && (
                <PdiForm
                    orgId={orgId}
                    item={editingPdi}
                    employees={activeEmployees}
                    onClose={() => { setShowPdiForm(false); setEditingPdi(null); }}
                    onSaved={() => { setShowPdiForm(false); setEditingPdi(null); refetchPdi(); }}
                />
            )}
        </div>
    );
};

export default LaborEvaluation;
