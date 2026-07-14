import React, { useCallback, useEffect, useState } from 'react';
import {
    Workflow, ClipboardList, Layers, Plus, CheckCircle2, XCircle, FileText,
    Loader2, ChevronRight, MessageSquare, Send, Shield,
    Activity, LayoutGrid, List as ListIcon, AlertTriangle,
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { processService } from '../services/processService';
import { documentService } from '../services/documentService';
import { taskService } from '../services/taskService';
import type {
    ProcessTemplate, ProcessTemplateStep, ProcessInstance, ProcessInstanceWithSteps,
    ProcessInstanceStep, PendingStepItem, ProcessComment, ProcessStepType, ProcessStepBottleneck,
} from '../types/process';
import type { OpuraDocument } from '../types/documents';
import Button from './ui/Button';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/modal';
import { Sheet } from './ui/sheet';
import { useConfirm } from './ui/confirm';
import { formatDateBR as fmtDate } from './ui/Format';

// ─── rótulos ────────────────────────────────────────────────

const STEP_TYPE_LABEL: Record<ProcessStepType, string> = {
    approval: 'Aprovação', task: 'Tarefa', document: 'Documento', validation: 'Validação', manual: 'Manual',
};

const INSTANCE_STATUS_LABEL: Record<string, string> = {
    EM_ANDAMENTO: 'Em andamento', AGUARDANDO_RESPONSAVEL: 'Aguardando responsável',
    AGUARDANDO_APROVACAO: 'Aguardando aprovação', AGUARDANDO_DOCUMENTO: 'Aguardando documento',
    BLOQUEADO: 'Bloqueado', ATRASADO: 'Atrasado', DEVOLVIDO: 'Devolvido',
    CONCLUIDO: 'Concluído', CANCELADO: 'Cancelado',
};

const INSTANCE_STATUS_COLOR: Record<string, string> = {
    EM_ANDAMENTO: 'bg-blue-100 text-blue-700', AGUARDANDO_RESPONSAVEL: 'bg-amber-100 text-amber-700',
    AGUARDANDO_APROVACAO: 'bg-purple-100 text-purple-700', AGUARDANDO_DOCUMENTO: 'bg-amber-100 text-amber-700',
    BLOQUEADO: 'bg-red-100 text-red-700', ATRASADO: 'bg-red-100 text-red-700', DEVOLVIDO: 'bg-orange-100 text-orange-700',
    CONCLUIDO: 'bg-green-100 text-green-700', CANCELADO: 'bg-gray-100 text-gray-600',
};

function StatusBadge({ status }: { status: string }) {
    return (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${INSTANCE_STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-600'}`}>
            {INSTANCE_STATUS_LABEL[status] ?? status}
        </span>
    );
}

// ─── criar template ─────────────────────────────────────────

function NewTemplateModal({ open, onClose, organizationId, onCreated }: {
    open: boolean; onClose: () => void; organizationId: string; onCreated: () => void;
}) {
    const [name, setName] = useState('');
    const [category, setCategory] = useState('');
    const [steps, setSteps] = useState<Array<{ name: string; step_type: ProcessStepType; requires_document: boolean }>>([
        { name: '', step_type: 'manual', requires_document: false },
    ]);
    const [saving, setSaving] = useState(false);

    if (!open) return null;

    const addStep = () => setSteps(s => [...s, { name: '', step_type: 'manual', requires_document: false }]);
    const removeStep = (idx: number) => setSteps(s => s.filter((_, i) => i !== idx));

    const save = async () => {
        if (!name.trim() || steps.some(s => !s.name.trim())) return;
        setSaving(true);
        try {
            await processService.createTemplate(
                { organization_id: organizationId, name, category, criticality: 'MEDIA', default_sla_hours: null },
                steps.map(s => ({ name: s.name, step_type: s.step_type, is_required: true, requires_document: s.requires_document, can_skip: false })),
            );
            onCreated();
            onClose();
            setName(''); setCategory(''); setSteps([{ name: '', step_type: 'manual', requires_document: false }]);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} size="xl">
            <ModalHeader title="Novo template de processo" icon={<Layers className="w-5 h-5 text-blue-600" />} onClose={onClose} />
            <ModalBody className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">Nome</label>
                        <input value={name} onChange={e => setName(e.target.value)}
                            className="mt-1 w-full h-9 px-3 rounded-xl border border-gray-200 text-sm" placeholder="Ex.: Admissão de funcionário" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">Categoria</label>
                        <input value={category} onChange={e => setCategory(e.target.value)}
                            className="mt-1 w-full h-9 px-3 rounded-xl border border-gray-200 text-sm" placeholder="Ex.: RH" />
                    </div>
                </div>

                <div>
                    <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">Etapas (sequenciais)</label>
                    <div className="mt-2 space-y-2">
                        {steps.map((s, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                                <span className="w-5 text-xs font-black text-gray-400">{idx + 1}.</span>
                                <input value={s.name} onChange={e => setSteps(arr => arr.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                                    className="flex-1 h-9 px-3 rounded-xl border border-gray-200 text-sm" placeholder="Nome da etapa" />
                                <select value={s.step_type} onChange={e => setSteps(arr => arr.map((x, i) => i === idx ? { ...x, step_type: e.target.value as ProcessStepType } : x))}
                                    className="h-9 px-2 rounded-xl border border-gray-200 text-xs">
                                    {(Object.keys(STEP_TYPE_LABEL) as ProcessStepType[]).map(t => (
                                        <option key={t} value={t}>{STEP_TYPE_LABEL[t]}</option>
                                    ))}
                                </select>
                                {steps.length > 1 && (
                                    <ActionIconButton kind="delete" onClick={() => removeStep(idx)} />
                                )}
                            </div>
                        ))}
                    </div>
                    <Button variant="secondary" size="sm" className="mt-2" onClick={addStep}>
                        <Plus className="w-3.5 h-3.5" /> Adicionar etapa
                    </Button>
                </div>
            </ModalBody>
            <ModalFooter>
                <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar template'}</Button>
            </ModalFooter>
        </Modal>
    );
}

// ─── iniciar instância ──────────────────────────────────────

function StartInstanceModal({ open, onClose, organizationId, userId, templates, onStarted }: {
    open: boolean; onClose: () => void; organizationId: string; userId: string;
    templates: ProcessTemplate[]; onStarted: (id: string) => void;
}) {
    const [templateId, setTemplateId] = useState('');
    const [title, setTitle] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => { if (open && templates.length > 0 && !templateId) setTemplateId(templates[0].id); }, [open, templates, templateId]);

    if (!open) return null;

    const start = async () => {
        if (!templateId || !title.trim()) return;
        setSaving(true);
        try {
            const instance = await processService.startInstance({ organizationId, templateId, title, requesterUserId: userId });
            onStarted(instance.id);
            onClose();
            setTitle('');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} size="md">
            <ModalHeader title="Iniciar processo" icon={<Workflow className="w-5 h-5 text-blue-600" />} onClose={onClose} />
            <ModalBody className="space-y-3">
                <div>
                    <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">Template</label>
                    <select value={templateId} onChange={e => setTemplateId(e.target.value)}
                        className="mt-1 w-full h-9 px-3 rounded-xl border border-gray-200 text-sm">
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">Título da instância</label>
                    <input value={title} onChange={e => setTitle(e.target.value)}
                        className="mt-1 w-full h-9 px-3 rounded-xl border border-gray-200 text-sm" placeholder="Ex.: NF 1045 — Concreto Usinado" />
                </div>
            </ModalBody>
            <ModalFooter>
                <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                <Button onClick={start} disabled={saving || !templateId}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Iniciar'}</Button>
            </ModalFooter>
        </Modal>
    );
}

// ─── picker de documento (reusa documentService — não reimplementa DMS) ─

function DocumentPicker({ organizationId, onPick }: { organizationId: string; onPick: (doc: OpuraDocument) => void }) {
    const [search, setSearch] = useState('');
    const [docs, setDocs] = useState<OpuraDocument[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        documentService.listDocuments(organizationId, { search: search || undefined })
            .then(setDocs).catch(() => setDocs([])).finally(() => setLoading(false));
    }, [organizationId, search]);

    return (
        <div className="border border-gray-200 rounded-xl p-3">
            <input value={search} onChange={e => setSearch(e.target.value)}
                className="w-full h-8 px-2 rounded-lg border border-gray-200 text-xs mb-2" placeholder="Buscar documento no DMS..." />
            {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            ) : (
                <div className="max-h-40 overflow-y-auto space-y-1">
                    {docs.slice(0, 20).map(d => (
                        <button key={d.id} onClick={() => onPick(d)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-50 text-left text-xs">
                            <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="truncate">{d.nome}</span>
                        </button>
                    ))}
                    {docs.length === 0 && <p className="text-xs text-gray-400 px-2 py-1">Nenhum documento encontrado.</p>}
                </div>
            )}
        </div>
    );
}

// ─── detalhe da instância (execução) ────────────────────────

function InstanceDetail({ open, onClose, instanceId, organizationId, userId, userEmail, onChanged }: {
    open: boolean; onClose: () => void; instanceId: string | null; organizationId: string;
    userId: string; userEmail: string; onChanged: () => void;
}) {
    const confirm = useConfirm();
    const [instance, setInstance] = useState<ProcessInstanceWithSteps | null>(null);
    const [comments, setComments] = useState<ProcessComment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [busyStep, setBusyStep] = useState<string | null>(null);
    const [docPickerStep, setDocPickerStep] = useState<string | null>(null);
    const [rejectStep, setRejectStep] = useState<ProcessInstanceStep | null>(null);
    const [rejectReason, setRejectReason] = useState('');

    const reload = useCallback(() => {
        if (!instanceId) return;
        processService.getInstance(instanceId).then(setInstance).catch(() => setInstance(null));
        processService.listComments(instanceId).then(setComments).catch(() => setComments([]));
    }, [instanceId]);

    useEffect(() => { if (open) reload(); }, [open, reload]);

    if (!open || !instanceId) return null;

    const act = async (fn: () => Promise<void>, stepId: string) => {
        setBusyStep(stepId);
        try {
            await fn();
            reload();
            onChanged();
        } finally {
            setBusyStep(null);
        }
    };

    const currentStep = instance?.steps.find(s => s.id === instance.current_step_id);

    const handleAction = (step: ProcessInstanceStep) => {
        if (!instance) return;
        if (step.step_type === 'approval') {
            if (step.approval_status === 'RASCUNHO') {
                return act(() => processService.submitStepApproval(step.id, instance.id, organizationId, step.amount ?? 0), step.id);
            }
            if (step.approval_status === 'PENDENTE') {
                return act(() => processService.approveStep(step.id, instance.id, 1, userEmail, { level1_label: 'Gestor' }), step.id);
            }
            return;
        }
        if (step.step_type === 'document') {
            setDocPickerStep(step.id);
            return;
        }
        if (step.step_type === 'task') {
            return act(async () => {
                const task = await taskService.create({
                    org_id: organizationId, user_id: userId, title: `[Processo] ${step.name} — ${instance.title}`,
                    priority: 2, status: 'open', source_module: 'processos',
                    source_ref: { type: 'process_instance_step', id: step.id, route: 'opura-processos' },
                });
                await processService.linkTask(step.id, task.id);
            }, step.id);
        }
        // manual / validation
        return act(() => processService.completeStep(step.id, instance.id, userId), step.id);
    };

    const handleCompleteTask = (step: ProcessInstanceStep) => act(() => processService.completeTaskStep(step.id, instance!.id, userId), step.id);

    const handleReject = async () => {
        if (!rejectStep || !instance) return;
        await processService.rejectStep(rejectStep.id, instance.id, userEmail, rejectReason || 'Sem motivo informado');
        setRejectStep(null); setRejectReason('');
        reload(); onChanged();
    };

    const handleCancel = async () => {
        if (!instance) return;
        if (!await confirm({ title: 'Cancelar processo?', message: 'Esta ação encerra a instância. Não é possível desfazer.', variant: 'danger' })) return;
        await processService.cancelInstance(instance.id, userId);
        reload(); onChanged();
    };

    const handleComment = async () => {
        if (!instance || !newComment.trim()) return;
        await processService.addComment(instance.id, userId, newComment.trim(), currentStep?.id);
        setNewComment('');
        processService.listComments(instance.id).then(setComments);
    };

    return (
        <Sheet open={open} onClose={onClose} size="xl">
            {!instance ? (
                <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : (
                <div className="flex flex-col h-full">
                    <div className="px-6 py-5 border-b border-gray-100 shrink-0">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-black text-gray-900">{instance.title}</h3>
                                <p className="text-xs text-gray-500 mt-0.5">{instance.template_name}</p>
                            </div>
                            <StatusBadge status={instance.status} />
                        </div>
                        {!['CONCLUIDO', 'CANCELADO'].includes(instance.status) && (
                            <button onClick={handleCancel} className="text-xs text-red-500 hover:text-red-700 mt-2">Cancelar processo</button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-3">
                        {instance.steps.map((step, idx) => {
                            const isCurrent = step.id === instance.current_step_id;
                            const isDone = step.status === 'CONCLUIDO';
                            const isRejected = step.status === 'REPROVADO';
                            return (
                                <div key={step.id} className={`rounded-2xl border p-4 ${isCurrent ? 'border-blue-300 bg-blue-50/50' : isDone ? 'border-green-200 bg-green-50/30' : 'border-gray-200'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0
                                            ${isDone ? 'bg-green-600 text-white' : isRejected ? 'bg-red-600 text-white' : isCurrent ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                            {isDone ? <CheckCircle2 className="w-4 h-4" /> : isRejected ? <XCircle className="w-4 h-4" /> : idx + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-gray-900">{step.name}</p>
                                            <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                                                {STEP_TYPE_LABEL[step.step_type]}
                                                {step.step_type === 'approval' && ` · ${step.approval_status}`}
                                            </p>
                                        </div>
                                        {isCurrent && (
                                            <div className="flex items-center gap-2">
                                                {step.step_type === 'approval' && step.approval_status === 'PENDENTE' && (
                                                    <button onClick={() => setRejectStep(step)} className="text-xs text-red-600 hover:text-red-800 font-bold">Reprovar</button>
                                                )}
                                                {step.step_type === 'task' && step.task_id && (
                                                    <Button size="sm" onClick={() => handleCompleteTask(step)} disabled={busyStep === step.id}>
                                                        {busyStep === step.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Concluir tarefa'}
                                                    </Button>
                                                )}
                                                {!(step.step_type === 'task' && step.task_id) && (
                                                    <Button size="sm" onClick={() => handleAction(step)} disabled={busyStep === step.id}>
                                                        {busyStep === step.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (
                                                            step.step_type === 'approval' ? (step.approval_status === 'RASCUNHO' ? 'Enviar p/ aprovação' : 'Aprovar')
                                                            : step.step_type === 'document' ? 'Anexar documento'
                                                            : step.step_type === 'task' ? 'Criar tarefa'
                                                            : 'Concluir'
                                                        )}
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    {isCurrent && docPickerStep === step.id && (
                                        <div className="mt-3">
                                            <DocumentPicker organizationId={organizationId} onPick={doc => act(() => processService.attachDocument(step.id, instance.id, doc.id, userId), step.id).then(() => setDocPickerStep(null))} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="border-t border-gray-100 p-4 shrink-0 space-y-2">
                        <div className="max-h-24 overflow-y-auto space-y-1 text-xs">
                            {comments.map(c => (
                                <div key={c.id} className="flex gap-2 items-start text-gray-600">
                                    <MessageSquare className="w-3 h-3 mt-0.5 shrink-0 text-gray-400" />
                                    <span>{c.comment}</span>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input value={newComment} onChange={e => setNewComment(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleComment()}
                                className="flex-1 h-9 px-3 rounded-xl border border-gray-200 text-sm" placeholder="Adicionar comentário..." />
                            <Button size="icon" variant="secondary" onClick={handleComment}><Send className="w-4 h-4" /></Button>
                        </div>
                    </div>
                </div>
            )}

            <Modal open={!!rejectStep} onClose={() => setRejectStep(null)} size="sm">
                <ModalHeader title="Reprovar etapa" onClose={() => setRejectStep(null)} />
                <ModalBody>
                    <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                        className="w-full h-24 px-3 py-2 rounded-xl border border-gray-200 text-sm" placeholder="Motivo da reprovação..." />
                </ModalBody>
                <ModalFooter>
                    <Button variant="secondary" onClick={() => setRejectStep(null)}>Cancelar</Button>
                    <Button variant="danger" onClick={handleReject}>Reprovar</Button>
                </ModalFooter>
            </Modal>
        </Sheet>
    );
}

// ─── pendências ("pendente comigo") ─────────────────────────

function PendingList({ organizationId, userId, onOpen }: { organizationId: string | null; userId: string; onOpen: (instanceId: string) => void }) {
    const [items, setItems] = useState<PendingStepItem[]>([]);
    const [approvals, setApprovals] = useState<PendingStepItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userId) return;
        setLoading(true);
        Promise.all([
            processService.listMyPendingSteps(organizationId, userId),
            processService.listMyPendingApprovals(organizationId),
        ]).then(([steps, appr]) => { setItems(steps); setApprovals(appr); }).finally(() => setLoading(false));
    }, [organizationId, userId]);

    if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

    const all = [...items, ...approvals.filter(a => !items.some(i => i.id === a.id))];

    if (all.length === 0) return <p className="p-8 text-center text-sm text-gray-400">Nenhuma pendência no momento.</p>;

    return (
        <div className="p-4 space-y-2">
            {all.map(item => (
                <button key={item.id} onClick={() => onOpen(item.process_instance_id)}
                    className="w-full flex items-center gap-3 bg-white border border-gray-200 rounded-2xl p-4 text-left hover:border-blue-300 transition-colors">
                    <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                        {item.step_type === 'approval' ? <Shield className="w-4 h-4 text-blue-600" /> : <ClipboardList className="w-4 h-4 text-blue-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{item.instance_title}</p>
                        <p className="text-xs text-gray-500">{item.name} · {STEP_TYPE_LABEL[item.step_type]}</p>
                    </div>
                    <StatusBadge status={item.instance_status} />
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                </button>
            ))}
        </div>
    );
}

// ─── lista geral de processos ───────────────────────────────

const KANBAN_COLUMNS = [
    'EM_ANDAMENTO', 'AGUARDANDO_RESPONSAVEL', 'AGUARDANDO_APROVACAO', 'AGUARDANDO_DOCUMENTO',
    'DEVOLVIDO', 'BLOQUEADO', 'ATRASADO', 'CONCLUIDO', 'CANCELADO',
] as const;

function InstanceCard({ instance, onOpen }: { instance: ProcessInstance & { template_name?: string }; onOpen: (id: string) => void }) {
    return (
        <button onClick={() => onOpen(instance.id)}
            className="w-full flex items-center gap-3 bg-white border border-gray-200 rounded-2xl p-4 text-left hover:border-blue-300 transition-colors">
            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{instance.title}</p>
                <p className="text-xs text-gray-500">{instance.template_name} · iniciado em {fmtDate(instance.started_at)}</p>
            </div>
            <StatusBadge status={instance.status} />
            <ChevronRight className="w-4 h-4 text-gray-300" />
        </button>
    );
}

function InstanceList({ organizationId, onOpen }: { organizationId: string | null; onOpen: (id: string) => void }) {
    const [instances, setInstances] = useState<(ProcessInstance & { template_name?: string })[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'lista' | 'kanban'>('lista');

    useEffect(() => {
        setLoading(true);
        processService.listInstances(organizationId).then(setInstances).finally(() => setLoading(false));
    }, [organizationId]);

    if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

    return (
        <div className="p-4">
            <div className="flex justify-end gap-1 mb-3">
                <button onClick={() => setView('lista')}
                    className={`p-1.5 rounded-lg ${view === 'lista' ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-gray-600'}`} title="Lista">
                    <ListIcon className="w-4 h-4" />
                </button>
                <button onClick={() => setView('kanban')}
                    className={`p-1.5 rounded-lg ${view === 'kanban' ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-gray-600'}`} title="Kanban">
                    <LayoutGrid className="w-4 h-4" />
                </button>
            </div>

            {instances.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Nenhum processo iniciado ainda.</p>
            ) : view === 'lista' ? (
                <div className="space-y-2">
                    {instances.map(i => <InstanceCard key={i.id} instance={i} onOpen={onOpen} />)}
                </div>
            ) : (
                <div className="flex gap-3 overflow-x-auto pb-2">
                    {KANBAN_COLUMNS.map(status => {
                        const items = instances.filter(i => i.status === status);
                        if (items.length === 0) return null;
                        return (
                            <div key={status} className="w-72 shrink-0">
                                <div className="flex items-center gap-2 mb-2 px-1">
                                    <StatusBadge status={status} />
                                    <span className="text-xs text-gray-400">{items.length}</span>
                                </div>
                                <div className="space-y-2">
                                    {items.map(i => <InstanceCard key={i.id} instance={i} onOpen={onOpen} />)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── dashboard de gargalos ──────────────────────────────────

function ProcessDashboard({ organizationId }: { organizationId: string | null }) {
    const [bottlenecks, setBottlenecks] = useState<ProcessStepBottleneck[]>([]);
    const [instances, setInstances] = useState<ProcessInstance[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        Promise.all([
            processService.getBottlenecks(organizationId),
            processService.listInstances(organizationId),
        ]).then(([b, i]) => { setBottlenecks(b); setInstances(i); }).finally(() => setLoading(false));
    }, [organizationId]);

    if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

    const statusCounts = KANBAN_COLUMNS.map(s => ({ status: s, count: instances.filter(i => i.status === s).length })).filter(c => c.count > 0);

    return (
        <div className="p-4 space-y-6">
            <div>
                <h3 className="text-xs font-black uppercase tracking-wide text-gray-500 mb-2">Processos por status</h3>
                <div className="flex flex-wrap gap-2">
                    {statusCounts.length === 0 && <p className="text-sm text-gray-400">Nenhum processo iniciado ainda.</p>}
                    {statusCounts.map(c => (
                        <div key={c.status} className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center gap-2">
                            <StatusBadge status={c.status} />
                            <span className="text-lg font-black text-gray-900">{c.count}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <h3 className="text-xs font-black uppercase tracking-wide text-gray-500 mb-2">Gargalos por etapa</h3>
                {bottlenecks.length === 0 ? (
                    <p className="text-sm text-gray-400">Sem dados suficientes ainda.</p>
                ) : (
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                                <tr>
                                    <th className="text-left px-4 py-2 font-bold">Etapa</th>
                                    <th className="text-left px-4 py-2 font-bold">Tipo</th>
                                    <th className="text-right px-4 py-2 font-bold">Tempo médio</th>
                                    <th className="text-right px-4 py-2 font-bold">Ativos</th>
                                    <th className="text-right px-4 py-2 font-bold">Atrasados</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bottlenecks.map((b, idx) => (
                                    <tr key={`${b.step_name}-${idx}`} className="border-t border-gray-100">
                                        <td className="px-4 py-2 font-semibold text-gray-900">{b.step_name}</td>
                                        <td className="px-4 py-2 text-gray-500">{STEP_TYPE_LABEL[b.step_type]}</td>
                                        <td className="px-4 py-2 text-right text-gray-700">{b.avg_hours != null ? `${b.avg_hours}h` : '—'}</td>
                                        <td className="px-4 py-2 text-right text-gray-700">{b.active_count}</td>
                                        <td className="px-4 py-2 text-right">
                                            {b.overdue_count > 0 ? (
                                                <span className="inline-flex items-center gap-1 text-red-600 font-bold">
                                                    <AlertTriangle className="w-3.5 h-3.5" /> {b.overdue_count}
                                                </span>
                                            ) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── templates ──────────────────────────────────────────────

function TemplateList({ organizationId, onCreate }: { organizationId: string | null; onCreate: () => void }) {
    const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
    const [steps, setSteps] = useState<Record<string, ProcessTemplateStep[]>>({});
    const [expanded, setExpanded] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const reload = useCallback(() => {
        setLoading(true);
        processService.listTemplates(organizationId).then(setTemplates).finally(() => setLoading(false));
    }, [organizationId]);

    useEffect(reload, [reload]);

    const toggle = async (id: string) => {
        if (expanded === id) { setExpanded(null); return; }
        setExpanded(id);
        if (!steps[id]) {
            const s = await processService.getTemplateSteps(id);
            setSteps(prev => ({ ...prev, [id]: s }));
        }
    };

    if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

    return (
        <div className="p-4 space-y-2">
            <Button size="sm" onClick={onCreate}><Plus className="w-3.5 h-3.5" /> Novo template</Button>
            {templates.map(t => (
                <div key={t.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    <button onClick={() => toggle(t.id)} className="w-full flex items-center gap-3 p-4 text-left">
                        <Layers className="w-4 h-4 text-blue-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900">{t.name}</p>
                            <p className="text-xs text-gray-500">{t.category} · v{t.version}</p>
                        </div>
                        <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform ${expanded === t.id ? 'rotate-90' : ''}`} />
                    </button>
                    {expanded === t.id && (
                        <div className="border-t border-gray-100 p-4 space-y-1.5 bg-gray-50">
                            {(steps[t.id] ?? []).map((s, idx) => (
                                <div key={s.id} className="flex items-center gap-2 text-xs text-gray-600">
                                    <span className="w-4 font-black text-gray-400">{idx + 1}.</span>
                                    <span className="font-semibold">{s.name}</span>
                                    <span className="text-gray-400">— {STEP_TYPE_LABEL[s.step_type]}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

// ─── main ────────────────────────────────────────────────────

type Tab = 'pendente' | 'processos' | 'dashboard' | 'templates';

interface Props {
    organizationId?: string;
    userId?: string;
    userEmail?: string;
}

export default function ProcessosModule({ organizationId = '', userId = '', userEmail = '' }: Props) {
    const [tab, setTab] = useState<Tab>('pendente');
    const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
    const [showStart, setShowStart] = useState(false);
    const [showNewTemplate, setShowNewTemplate] = useState(false);
    const [openInstanceId, setOpenInstanceId] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        if (!organizationId) return;
        processService.listTemplates(organizationId).then(setTemplates).catch(() => {});
    }, [organizationId, refreshKey]);

    const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
        { id: 'pendente',  label: 'Pendente Comigo',    icon: ClipboardList },
        { id: 'processos', label: 'Todos os Processos', icon: Workflow },
        { id: 'dashboard', label: 'Dashboard',          icon: Activity },
        { id: 'templates', label: 'Templates',          icon: Layers },
    ];

    return (
        <div className="h-full flex flex-col bg-gray-50">
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
                            <Workflow className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">Processos</h1>
                            <p className="text-xs text-gray-500">Fluxos padronizados, auditáveis e executáveis</p>
                        </div>
                    </div>
                    <Button size="sm" onClick={() => {
                        if (!organizationId) { alert('Selecione uma organização específica para iniciar um processo.'); return; }
                        setShowStart(true);
                    }}><Plus className="w-3.5 h-3.5" /> Iniciar Processo</Button>
                </div>
                <div className="flex items-center gap-1 border-b border-gray-100 -mb-4 -mx-6 px-6">
                    {TABS.map(t => {
                        const Icon = t.icon;
                        return (
                            <button key={t.id} onClick={() => setTab(t.id)}
                                className={[
                                    'flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-widest whitespace-nowrap border-b-2 transition-all -mb-px',
                                    tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300',
                                ].join(' ')}
                            >
                                <Icon className="w-3.5 h-3.5" /> {t.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="flex-1 overflow-auto">
                {tab === 'pendente'  && <PendingList key={refreshKey} organizationId={organizationId} userId={userId} onOpen={setOpenInstanceId} />}
                {tab === 'processos' && <InstanceList key={refreshKey} organizationId={organizationId} onOpen={setOpenInstanceId} />}
                {tab === 'dashboard' && <ProcessDashboard key={refreshKey} organizationId={organizationId} />}
                {tab === 'templates' && <TemplateList organizationId={organizationId} onCreate={() => {
                    if (!organizationId) { alert('Selecione uma organização específica para criar um template.'); return; }
                    setShowNewTemplate(true);
                }} />}
            </div>

            <StartInstanceModal
                open={showStart} onClose={() => setShowStart(false)} organizationId={organizationId} userId={userId}
                templates={templates} onStarted={(id) => { setOpenInstanceId(id); setRefreshKey(k => k + 1); }}
            />
            <NewTemplateModal
                open={showNewTemplate} onClose={() => setShowNewTemplate(false)} organizationId={organizationId}
                onCreated={() => setRefreshKey(k => k + 1)}
            />
            <InstanceDetail
                open={!!openInstanceId} onClose={() => setOpenInstanceId(null)} instanceId={openInstanceId}
                organizationId={organizationId} userId={userId} userEmail={userEmail}
                onChanged={() => setRefreshKey(k => k + 1)}
            />
        </div>
    );
}
