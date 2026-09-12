import React, { useState, useMemo } from 'react';
import {
    Star, Plus, X, ChevronRight, Loader2, Award, Target,
    Users, Calendar, Check, BarChart3, TrendingUp,
    AlertTriangle, BookOpen, ClipboardCheck, ChevronDown,
    Play, Lock, RotateCcw, FileText
} from 'lucide-react';
import { KpiCard, type KpiColor } from './ui/KpiCard';
import ActionIconButton from './ui/ActionIconButton';
import TabsBar from './ui/TabsBar';
import StandardTable, { StandardTableColumn } from './ui/StandardTable';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    evaluationService,
    EvaluationCycle, EvaluationResponse, EvaluationResult, PdiItem,
    Competencia, RespostaItem,
    CycleTipo, CycleStatus, ResponseTipo, PdiStatus, Classificacao
} from '../services/evaluationService';
import { STALE } from '../lib/queryClient';
import { useConfirm } from './ui/confirm';
import { useOrgWriteTarget } from '../hooks/useOrgContext';

// ── Colunas das tabelas padrão (§6.10) ────────────────────────────────────────

const RESP_STATUS_CONFIG: Record<EvaluationResponse['status'], { label: string; cls: string }> = {
    PENDENTE: { label: 'Pendente', cls: 'text-amber-700' },
    EM_ANDAMENTO: { label: 'Em andamento', cls: 'text-blue-700' },
    CONCLUIDA: { label: 'Concluída', cls: 'text-emerald-700' },
};

const RESPONSE_COLUMNS: StandardTableColumn[] = [
    { key: 'evaluatee', label: 'Avaliado', sortable: true, width: 220 },
    { key: 'evaluator', label: 'Avaliador', sortable: true, width: 200 },
    { key: 'tipo', label: 'Tipo', sortable: true, width: 150 },
    { key: 'nota', label: 'Nota', sortable: true, width: 100, align: 'right' },
    { key: 'status', label: 'Status', sortable: true, width: 140 },
];

const RESULT_COLUMNS: StandardTableColumn[] = [
    { key: 'pos', label: '#', sortable: true, width: 70 },
    { key: 'employee', label: 'Colaborador', sortable: true, width: 240 },
    { key: 'self', label: 'Self', sortable: true, width: 100, align: 'right' },
    { key: 'gestor', label: 'Gestor', sortable: true, width: 100, align: 'right' },
    { key: 'pares', label: 'Pares', sortable: true, width: 100, align: 'right' },
    { key: 'final', label: 'Final', sortable: true, width: 100, align: 'right' },
    { key: 'classificacao', label: 'Classificação', sortable: true, width: 170 },
];

const PDI_COLUMNS: StandardTableColumn[] = [
    { key: 'employee', label: 'Colaborador', sortable: true, width: 200 },
    { key: 'competencia', label: 'Competência', sortable: true, width: 170 },
    { key: 'acao', label: 'Ação', sortable: true, width: 260 },
    { key: 'prazo', label: 'Prazo', sortable: true, width: 110 },
    { key: 'progresso', label: 'Progresso', sortable: true, width: 150 },
    { key: 'status', label: 'Status', sortable: true, width: 130 },
];

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
    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">{children}</label>
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
    orgId: string | null;
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

    // Ao editar, recarrega o ciclo COMPLETO. handleSave reenvia `{ ...form, competencias }`,
    // então montar o form sobre o objeto da listagem o acopla ao select de getCycles: se
    // aquele select for estreitado, o Salvar grava default por cima do dado real — e
    // `competencias` voltaria a ser o array de exemplo, apagando as competências do ciclo.
    // Carregar por id remove a dependência. Mesmo motivo do CompanyDetailPage.
    const [loadingFull, setLoadingFull] = useState(isEditing);
    React.useEffect(() => {
        if (!cycle?.id) return;
        let alive = true;
        setLoadingFull(true);
        evaluationService.getCycle(cycle.id)
            .then(full => {
                if (!alive) return;
                setForm({
                    nome: full.nome || '',
                    descricao: full.descricao || '',
                    tipo: full.tipo || ('180' as CycleTipo),
                    periodo_inicio: full.periodo_inicio || today,
                    periodo_fim: full.periodo_fim || '',
                    status: full.status || ('RASCUNHO' as CycleStatus),
                });
                if (full.competencias) setCompetencias(full.competencias);
            })
            .catch((e: any) => alert(e.message || 'Erro ao carregar o ciclo.'))
            .finally(() => { if (alive) setLoadingFull(false); });
        return () => { alive = false; };
    }, [cycle?.id]);

    const addComp = () => setCompetencias(p => [...p, { id: uuid(), nome: '', descricao: '', peso: 3, categoria: '' }]);
    const removeComp = (id: string) => setCompetencias(p => p.filter(c => c.id !== id));
    const updateComp = (id: string, field: keyof Competencia, val: unknown) =>
        setCompetencias(p => p.map(c => c.id === id ? { ...c, [field]: val } : c));

    const handleSave = async () => {
        // Salvar antes do carregamento gravaria o form montado sobre o objeto da lista.
        if (loadingFull) return;
        if (!form.nome || !form.periodo_inicio || !form.periodo_fim) {
            alert('Preencha nome e período.'); return;
        }
        if (competencias.some(c => !c.nome)) {
            alert('Todas as competências precisam de nome.'); return;
        }
        if (!orgId) { alert('Selecione uma organização específica no seletor do topo para gravar.'); return; }
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
                                className="flex items-center gap-1.5 text-button font-bold text-violet-600 hover:text-violet-800 transition-colors">
                                <Plus className="w-3.5 h-3.5" /> Adicionar
                            </button>
                        </div>
                        <div className="space-y-2">
                            {competencias.map((c, i) => (
                                <div key={c.id} className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl">
                                    <span className="text-xs font-black text-slate-400 mt-2 w-4 shrink-0">{i + 1}</span>
                                    <div className="flex-1 grid grid-cols-3 gap-2">
                                        <input className={`${inputCls} col-span-2`} placeholder="Nome da competência"
                                            value={c.nome} onChange={e => updateComp(c.id, 'nome', e.target.value)} />
                                        <input className={inputCls} placeholder="Categoria"
                                            value={c.categoria || ''} onChange={e => updateComp(c.id, 'categoria', e.target.value)} />
                                    </div>
                                    <div className="flex items-center gap-1 mt-1.5 shrink-0">
                                        <span className="text-xs text-slate-400 font-bold">Peso</span>
                                        <select className="text-form-input font-bold border border-slate-200 rounded-lg px-1.5 py-1 bg-white outline-none"
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
                    <button onClick={handleSave} disabled={saving || loadingFull}
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
                                            <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">{comp.categoria}</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <StarRating value={r.nota}
                                            onChange={v => setRespostas(p => p.map(x => x.competencia_id === comp.id ? { ...x, nota: v } : x))} />
                                        <span className={`text-form-input font-black w-6 text-center ${r.nota > 0 ? 'text-violet-600' : 'text-slate-300'}`}>
                                            {r.nota > 0 ? r.nota : '–'}
                                        </span>
                                    </div>
                                </div>
                                <input className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-form-input font-medium outline-none focus:ring-1 focus:ring-violet-200 transition-all"
                                    placeholder="Comentário sobre esta competência (opcional)"
                                    value={r.comentario || ''}
                                    onChange={e => setRespostas(p => p.map(x => x.competencia_id === comp.id ? { ...x, comentario: e.target.value } : x))} />
                            </div>
                        );
                    })}

                    <div className="space-y-3 pt-2">
                        <Field label="Pontos fortes">
                            <textarea className={`${inputCls} resize-none text-form-input`} rows={2}
                                value={pontosFortes} onChange={e => setPontosFortes(e.target.value)}
                                placeholder="Principais pontos fortes observados..." />
                        </Field>
                        <Field label="Pontos de melhoria">
                            <textarea className={`${inputCls} resize-none text-form-input`} rows={2}
                                value={pontosMelhoria} onChange={e => setPontosMelhoria(e.target.value)}
                                placeholder="Principais oportunidades de desenvolvimento..." />
                        </Field>
                        <Field label="Comentário geral">
                            <textarea className={`${inputCls} resize-none text-form-input`} rows={2}
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
    orgId: string | null;
    item?: PdiItem | null;
    employees: { id: string; name: string }[];
    onClose: () => void;
    onSaved: () => void;
}

const PdiForm: React.FC<PdiFormProps> = ({ orgId, item, employees, onClose, onSaved }) => {
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<Partial<PdiItem>>({
        org_id: orgId ?? undefined,
        employee_id: item?.employee_id || '',
        competencia: item?.competencia || '',
        descricao: item?.descricao || '',
        acao: item?.acao || '',
        recursos: item?.recursos || '',
        prazo: item?.prazo || '',
        status: item?.status || 'PENDENTE',
        progresso_pct: item?.progresso_pct || 0,
    });

    // Ao editar, recarrega o item COMPLETO — handleSave reenvia o form inteiro. Ver
    // comentário no CycleForm; getPdiItems hoje usa select('*'), mas o form não pode
    // depender disso.
    const [loadingFull, setLoadingFull] = useState(!!item);
    React.useEffect(() => {
        if (!item?.id) return;
        let alive = true;
        setLoadingFull(true);
        evaluationService.getPdiItem(item.id)
            .then(full => {
                if (!alive) return;
                setForm(f => ({
                    ...f,
                    employee_id: full.employee_id || '',
                    competencia: full.competencia || '',
                    descricao: full.descricao || '',
                    acao: full.acao || '',
                    recursos: full.recursos || '',
                    prazo: full.prazo || '',
                    status: full.status || 'PENDENTE',
                    progresso_pct: full.progresso_pct || 0,
                }));
            })
            .catch((e: any) => alert(e.message || 'Erro ao carregar o item de PDI.'))
            .finally(() => { if (alive) setLoadingFull(false); });
        return () => { alive = false; };
    }, [item?.id]);

    const handleSave = async () => {
        // Salvar antes do carregamento gravaria o form montado sobre o objeto da lista.
        if (loadingFull) return;
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
                    <button onClick={handleSave} disabled={saving || loadingFull}
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
    orgId: string | null;
    employees: { id: string; name: string }[];
    onBack: () => void;
    onRefresh: () => void;
}

const CycleDetail: React.FC<CycleDetailProps> = ({ cycle, orgId, employees, onBack, onRefresh }) => {
    const qc = useQueryClient();
    const confirm = useConfirm();
    const [evalForm, setEvalForm] = useState<EvaluationResponse | null>(null);
    const [consolidating, setConsolidating] = useState(false);
    const [view, setView] = useState<'avaliacoes' | 'resultados'>('avaliacoes');

    // Sem `enabled: !!orgId` nas queries desta tela — com "Todas as organizações"
    // a RLS recorta sozinha e a tela não pode ficar vazia (REGRA #5).
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
        const ok = await confirm({ title: 'Encerrar ciclo?', message: 'Isso calculará as notas finais e não pode ser desfeito.', variant: 'warning', confirmLabel: 'Encerrar' });
        if (!ok) return;
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
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-form-input font-black ${STATUS.color} ${STATUS.bg}`}>
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
                    <KpiCard key={label} label={label} value={value} icon={<Icon />} color={color as KpiColor} />
                ))}
            </div>

            {/* Sub-abas (§19.1) */}
            <TabsBar
                tabs={[{ id: 'avaliacoes', label: 'Avaliações', badge: responses.length }, { id: 'resultados', label: 'Resultados' }]}
                value={view}
                onChange={setView}
            />

            {/* Avaliações — tabela padrão (§6.10) */}
            {view === 'avaliacoes' && (
                <StandardTable<EvaluationResponse>
                    storageKey="labor:evaluation:responses"
                    columns={RESPONSE_COLUMNS}
                    rows={responses}
                    rowKey={r => r.id}
                    loading={loadingResp}
                    searchText={r => `${r.evaluatee_nome ?? ''} ${r.evaluator_nome ?? ''} ${RESP_TIPO_LABELS[r.tipo]}`}
                    searchPlaceholder="Buscar avaliado ou avaliador..."
                    sortValue={(key, r) => {
                        switch (key) {
                            case 'evaluatee': return r.evaluatee_nome ?? '';
                            case 'evaluator': return r.evaluator_nome ?? 'Auto';
                            case 'tipo': return RESP_TIPO_LABELS[r.tipo];
                            case 'nota': return r.nota_media ?? null;
                            case 'status': return RESP_STATUS_CONFIG[r.status].label;
                            default: return null;
                        }
                    }}
                    renderCell={(key, r) => {
                        switch (key) {
                            case 'evaluatee': return <span className="text-sm font-normal text-gray-700">{r.evaluatee_nome || '–'}</span>;
                            case 'evaluator': return <span className="text-sm font-normal text-gray-600">{r.evaluator_nome || 'Auto'}</span>;
                            case 'tipo': return <span className="text-sm font-normal text-gray-600">{RESP_TIPO_LABELS[r.tipo]}</span>;
                            case 'nota': return r.nota_media
                                ? <span className="text-sm font-normal text-violet-700">{r.nota_media.toFixed(2)}</span>
                                : <span className="text-sm font-normal text-gray-300">–</span>;
                            case 'status': return <span className={`text-sm font-normal ${RESP_STATUS_CONFIG[r.status].cls}`}>{RESP_STATUS_CONFIG[r.status].label}</span>;
                            default: return null;
                        }
                    }}
                    actions={{
                        width: 110,
                        render: r => r.status !== 'CONCLUIDA' && cycle.status === 'ATIVO' ? (
                            <button onClick={() => setEvalForm(r)} className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all">
                                Avaliar
                            </button>
                        ) : null,
                    }}
                    empty={{
                        icon: <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                        title: 'Nenhuma avaliação gerada',
                        subtitle: 'Ative o ciclo para que as avaliações sejam criadas automaticamente.',
                    }}
                />
            )}

            {/* Resultados — tabela padrão (§6.10) */}
            {view === 'resultados' && (
                cycle.status !== 'ENCERRADO' ? (
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-12 text-center">
                        <Lock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Ciclo ainda não encerrado</h3>
                        <p className="text-sm text-gray-500">Os resultados ficam disponíveis após consolidação.</p>
                    </div>
                ) : (
                    <StandardTable<EvaluationResult & { pos: number }>
                        storageKey="labor:evaluation:results"
                        columns={RESULT_COLUMNS}
                        rows={results.map((r, i) => ({ ...r, pos: i + 1 }))}
                        rowKey={r => r.id}
                        loading={loadingRes}
                        searchText={r => `${r.employee_nome ?? ''} ${r.employee_cargo ?? ''}`}
                        searchPlaceholder="Buscar colaborador..."
                        sortValue={(key, r) => {
                            switch (key) {
                                case 'pos': return r.pos;
                                case 'employee': return r.employee_nome ?? '';
                                case 'self': return r.nota_self ?? null;
                                case 'gestor': return r.nota_gestor ?? null;
                                case 'pares': return r.nota_pares ?? null;
                                case 'final': return r.nota_final ?? null;
                                case 'classificacao': return r.classificacao ? CLASS_CONFIG[r.classificacao].label : null;
                                default: return null;
                            }
                        }}
                        renderCell={(key, r) => {
                            const cls = r.classificacao ? CLASS_CONFIG[r.classificacao] : null;
                            switch (key) {
                                case 'pos': return <span className="text-sm font-normal text-gray-600">#{r.pos}</span>;
                                case 'employee': return (
                                    <div>
                                        <p className="text-sm font-normal text-gray-700">{r.employee_nome || '–'}</p>
                                        {r.employee_cargo && <p className="text-xs text-gray-400">{r.employee_cargo}</p>}
                                    </div>
                                );
                                case 'self': return <span className="text-sm font-normal text-gray-600">{r.nota_self?.toFixed(2) ?? '–'}</span>;
                                case 'gestor': return <span className="text-sm font-normal text-gray-600">{r.nota_gestor?.toFixed(2) ?? '–'}</span>;
                                case 'pares': return <span className="text-sm font-normal text-gray-600">{r.nota_pares?.toFixed(2) ?? '–'}</span>;
                                case 'final': return <span className="text-sm font-normal text-violet-700">{r.nota_final?.toFixed(2) ?? '–'}</span>;
                                case 'classificacao': return cls ? <span className={`text-sm font-normal ${cls.color}`}>{cls.label}</span> : null;
                                default: return null;
                            }
                        }}
                        empty={{ icon: <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum resultado consolidado' }}
                    />
                )
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
    orgId: string | null;
    employees: { id: string; name: string; status?: string }[];
    organizations: Array<{ id: string; name: string }>;
    onRefresh: () => void;
}

type MainTab = 'ciclos' | 'pdi';

const LaborEvaluation: React.FC<LaborEvaluationProps> = ({ orgId, employees, organizations, onRefresh }) => {
    const qc = useQueryClient();
    const confirm = useConfirm();
    const [mainTab, setMainTab] = useState<MainTab>('ciclos');
    const [selectedCycle, setSelectedCycle] = useState<EvaluationCycle | null>(null);
    const [showCycleForm, setShowCycleForm] = useState(false);
    const [editingCycle, setEditingCycle] = useState<EvaluationCycle | null>(null);
    const [showPdiForm, setShowPdiForm] = useState(false);
    const [editingPdi, setEditingPdi] = useState<PdiItem | null>(null);

    const activeEmployees = useMemo(() => employees.filter(e => (e.status || 'ATIVO') === 'ATIVO'), [employees]);

    const { data: cycles = [], isLoading: loadingCycles, refetch: refetchCycles } = useQuery({
        queryKey: ['eval-cycles', orgId],
        queryFn: () => evaluationService.getCycles(orgId),
        staleTime: STALE.fast,
    });

    const { data: pdiItems = [], isLoading: loadingPdi, refetch: refetchPdi } = useQuery({
        queryKey: ['pdi-items', orgId],
        queryFn: () => evaluationService.getPdiItems(orgId),
        enabled: mainTab === 'pdi',
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


    // REGRA #5: leitura nunca bloqueia em "Todas as organizações" (os serviços só
    // aplicam .eq('org_id') quando há org). Escrita é de UMA organização (ciclo,
    // PDI) — em "Todas" o sistema pergunta uma vez, modo 'single'.
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const [writeOrgId, setWriteOrgId] = useState<string | null>(null);
    const resolveOrg = async (): Promise<string | null> => {
        if (orgId) return orgId;
        const target = await resolveWriteOrg('single');
        if (!target) return null;
        return target.kind === 'org' ? target.orgId : target.orgIds[0] ?? null;
    };
    const abrirNovo = async () => {
        const org = await resolveOrg();
        if (!org) return;
        setWriteOrgId(org);
        if (mainTab === 'ciclos') { setEditingCycle(null); setShowCycleForm(true); }
        else { setEditingPdi(null); setShowPdiForm(true); }
    };

    const activeCycles = cycles.filter(c => c.status === 'ATIVO').length;
    const pdiPendentes = pdiItems.filter(p => p.status === 'PENDENTE' || p.status === 'EM_ANDAMENTO').length;
    const pdiConcluidos = pdiItems.filter(p => p.status === 'CONCLUIDO').length;

    if (selectedCycle) {
        return (
            <CycleDetail
                cycle={cycles.find(c => c.id === selectedCycle.id) || selectedCycle}
                orgId={selectedCycle.org_id ?? orgId}
                employees={activeEmployees}
                onBack={() => setSelectedCycle(null)}
                onRefresh={() => { refetchCycles(); }}
            />
        );
    }

    return (
        <div className="space-y-6">
            {/* 1. Título */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Avaliação 360°</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Ciclos de avaliação, PDI e desenvolvimento de equipe.</p>
                </div>
                <button
                    onClick={abrirNovo}
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
                    <KpiCard key={label} label={label} value={value} icon={<Icon />} color={color as KpiColor} />
                ))}
            </div>

            {/* Toolbar de abas (§19.1) */}
            <TabsBar
                tabs={[{ id: 'ciclos', label: 'Ciclos de Avaliação', badge: cycles.length }, { id: 'pdi', label: 'PDI', badge: pdiItems.length }]}
                value={mainTab}
                onChange={setMainTab}
            />

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
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black ${STATUS.color} ${STATUS.bg}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${STATUS.dot}`} />
                                            {STATUS.label}
                                        </span>
                                        <span className="text-xs text-slate-400 font-bold">{TIPO_LABELS[cycle.tipo]}</span>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                        {new Date(cycle.periodo_inicio).toLocaleDateString('pt-BR')} → {new Date(cycle.periodo_fim).toLocaleDateString('pt-BR')}
                                        {cycle.competencias.length > 0 && ` • ${cycle.competencias.length} competências`}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                    {cycle.status === 'RASCUNHO' && (
                                        <ActionIconButton kind="edit" onClick={() => { setEditingCycle(cycle); setShowCycleForm(true); }} />
                                    )}
                                    {cycle.status === 'RASCUNHO' && (
                                        <ActionIconButton kind="delete" onClick={async () => { const ok = await confirm({ title: 'Excluir ciclo?', message: 'Esta ação não pode ser desfeita.', variant: 'danger', confirmLabel: 'Excluir' }); if (ok) deleteCycleMut.mutate(cycle.id); }} />
                                    )}
                                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* PDI — tabela padrão (§6.10); a busca é a da toolbar acoplada */}
            {mainTab === 'pdi' && (
                <StandardTable<PdiItem>
                    storageKey="labor:evaluation:pdi"
                    columns={PDI_COLUMNS}
                    rows={pdiItems}
                    rowKey={p => p.id}
                    loading={loadingPdi}
                    searchText={p => `${p.employee_nome ?? ''} ${p.competencia} ${p.acao}`}
                    searchPlaceholder="Filtrar por colaborador, competência ou ação..."
                    sortValue={(key, p) => {
                        switch (key) {
                            case 'employee': return p.employee_nome ?? '';
                            case 'competencia': return p.competencia;
                            case 'acao': return p.acao;
                            case 'prazo': return p.prazo ?? null;
                            case 'progresso': return p.progresso_pct;
                            case 'status': return PDI_STATUS_CONFIG[p.status].label;
                            default: return null;
                        }
                    }}
                    renderCell={(key, p) => {
                        const sc = PDI_STATUS_CONFIG[p.status];
                        switch (key) {
                            case 'employee': return <span className="text-sm font-normal text-gray-700">{p.employee_nome || '–'}</span>;
                            case 'competencia': return <span className="text-sm font-normal text-gray-600">{p.competencia}</span>;
                            case 'acao': return <span className="block truncate text-sm font-normal text-gray-600" title={p.acao}>{p.acao}</span>;
                            case 'prazo': return <span className="text-sm font-normal text-gray-600">{p.prazo ? new Date(p.prazo).toLocaleDateString('pt-BR') : '–'}</span>;
                            case 'progresso': return (
                                <div className="flex items-center gap-2">
                                    <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${p.progresso_pct}%` }} />
                                    </div>
                                    <span className="text-sm font-normal text-gray-600">{p.progresso_pct}%</span>
                                </div>
                            );
                            case 'status': return <span className={`text-sm font-normal ${sc.color}`}>{sc.label}</span>;
                            default: return null;
                        }
                    }}
                    actions={{
                        width: 110,
                        render: p => (
                            <>
                                <ActionIconButton kind="edit" size="sm" onClick={() => { setEditingPdi(p); setShowPdiForm(true); }} />
                                <ActionIconButton kind="delete" size="sm" onClick={async () => { const ok = await confirm({ title: 'Excluir PDI?', message: 'Esta ação não pode ser desfeita.', variant: 'danger', confirmLabel: 'Excluir' }); if (ok) deletePdiMut.mutate(p.id); }} />
                            </>
                        ),
                    }}
                    empty={{ icon: <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum item de PDI encontrado' }}
                />
            )}

            {orgTargetModal}

            {/* Modals */}
            {showCycleForm && (
                <CycleForm
                    orgId={editingCycle?.org_id ?? writeOrgId ?? orgId}
                    cycle={editingCycle}
                    onClose={() => { setShowCycleForm(false); setEditingCycle(null); }}
                    onSaved={() => { setShowCycleForm(false); setEditingCycle(null); refetchCycles(); }}
                />
            )}
            {showPdiForm && (
                <PdiForm
                    orgId={editingPdi?.org_id ?? writeOrgId ?? orgId}
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
