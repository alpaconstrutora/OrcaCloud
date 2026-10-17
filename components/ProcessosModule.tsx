import React, { useCallback, useEffect, useState } from 'react';
import {
    Workflow, ClipboardList, Layers, Plus, CheckCircle2, XCircle, FileText,
    Loader2, ChevronRight, MessageSquare, Send, Shield,
    Activity, LayoutGrid, List as ListIcon, AlertTriangle, SkipForward, Users,
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { processService } from '../services/processService';
import { taskService } from '../services/taskService';
import type {
    ProcessTemplate, ProcessTemplateStep, ProcessInstance, ProcessInstanceWithSteps,
    ProcessInstanceStep, PendingStepItem, ProcessComment, ProcessStepType, ProcessStepBottleneck,
} from '../types/process';
import { INSTANCE_STATUS_LABEL, PROCESS_EVENT_LABEL } from '../types/process';
import type { ProcessEventKey } from '../types/process';
import { proximoNivelDeAprovacao } from '../utils/processApproval';
import type { ApprovalStep } from '../types/financial';
import type { ProcessAssignableMember, ProcessGroup } from '../types/process';
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';
import { SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import { descreverCondicao } from '../utils/processCondition';
import { useStore } from '../store/useStore';
import type { OpuraDocument } from '../types/documents';
import Button from './ui/Button';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/modal';
import { Sheet } from './ui/sheet';
import { useConfirm } from './ui/confirm';
import { formatDateBR as fmtDate } from './ui/Format';
import { DocumentPicker } from './ui/DocumentPicker';
import { useOrgWriteTarget } from '../hooks/useOrgContext';

// ─── rótulos ────────────────────────────────────────────────

import TemplateEditorModal, { STEP_TYPE_LABEL, ListaDeMarcacao, type ModeloEmEdicao } from './processos/TemplateEditorModal';


// §8 do guia: status é texto colorido simples — sem pílula, fundo ou uppercase.
const INSTANCE_STATUS_COLOR: Record<string, string> = {
    EM_ANDAMENTO: 'text-blue-700', AGUARDANDO_RESPONSAVEL: 'text-amber-700',
    AGUARDANDO_APROVACAO: 'text-purple-700', AGUARDANDO_DOCUMENTO: 'text-amber-700',
    BLOQUEADO: 'text-red-700', ATRASADO: 'text-red-700', DEVOLVIDO: 'text-orange-700',
    CONCLUIDO: 'text-green-700', CANCELADO: 'text-gray-600',
};

function StatusBadge({ status }: { status: string }) {
    return (
        <span className={`text-sm font-normal ${INSTANCE_STATUS_COLOR[status] ?? 'text-gray-600'}`}>
            {(INSTANCE_STATUS_LABEL as Record<string, string>)[status] ?? status}
        </span>
    );
}

const GROUP_TYPE_LABEL: Record<ProcessGroup['type'], string> = { DEPARTMENT: 'Departamento', ROLE: 'Cargo' };


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
    // Origem financeira (17/10/2026, item H.3): título ou boleto que abriu o processo, com link.
    const [origem, setOrigem] = useState<Awaited<ReturnType<typeof processService.getOrigemFinanceira>>>(null);
    const navigateToFocus = useStore(s => s.navigateToFocus);
    useEffect(() => {
        if (!instance || (!instance.internal_transaction_id && !instance.boleto_id)) { setOrigem(null); return; }
        let vivo = true;
        processService.getOrigemFinanceira(instance)
            .then(o => { if (vivo) setOrigem(o); })
            .catch(() => { if (vivo) setOrigem(null); });
        return () => { vivo = false; };
    }, [instance?.id, instance?.internal_transaction_id, instance?.boleto_id]); // eslint-disable-line react-hooks/exhaustive-deps
    // F3 — bloqueio manual: campo de motivo aberto inline no cabeçalho.
    const [blockOpen, setBlockOpen] = useState(false);
    const [blockReason, setBlockReason] = useState('');
    const [blockErro, setBlockErro] = useState<string | null>(null);
    // F3.2 — para dizer QUEM é o responsável e se o usuário pode assumir.
    // Da org DA INSTÂNCIA: o topo pode estar em "Todas".
    const [membrosOrg, setMembrosOrg] = useState<ProcessAssignableMember[]>([]);
    const [gruposOrg, setGruposOrg] = useState<ProcessGroup[]>([]);
    const [claimErro, setClaimErro] = useState<string | null>(null);
    // Erro de ação de etapa (enviar, aprovar, concluir) — aparece no painel em vez de sumir no console.
    const [acaoErro, setAcaoErro] = useState<string | null>(null);

    const reload = useCallback(() => {
        if (!instanceId) return;
        processService.getInstance(instanceId).then(setInstance).catch(() => setInstance(null));
        processService.listComments(instanceId).then(setComments).catch(() => setComments([]));
    }, [instanceId]);

    useEffect(() => { if (open) reload(); }, [open, reload]);

    const orgDaInstancia = instance?.organization_id;
    useEffect(() => {
        if (!orgDaInstancia) return;
        processService.listAssignableMembers(orgDaInstancia).then(setMembrosOrg).catch(() => setMembrosOrg([]));
        processService.listGroups(orgDaInstancia).then(setGruposOrg).catch(() => setGruposOrg([]));
    }, [orgDaInstancia]);

    if (!open || !instanceId) return null;

    const act = async (fn: () => Promise<void>, stepId: string) => {
        setBusyStep(stepId);
        setAcaoErro(null);
        try {
            await fn();
            reload();
            onChanged();
        } catch (e) {
            setAcaoErro(e instanceof Error ? e.message : String(e));
        } finally {
            setBusyStep(null);
        }
    };

    const currentStep = instance?.steps.find(s => s.id === instance.current_step_id);

    const handleAction = (step: ProcessInstanceStep) => {
        if (!instance) return;
        if (step.step_type === 'approval') {
            // Org e valor vêm do PROCESSO (service), nunca do topo — em "Todas" o topo é vazio.
            if (step.approval_status === 'RASCUNHO') {
                return act(() => processService.submitStepApproval(step.id, instance.id), step.id);
            }
            // O nível (1 ou 2) quem decide é a etapa; o service recusa a mesma pessoa nos dois.
            if (step.approval_status === 'PENDENTE') {
                return act(() => processService.approveStep(step.id, instance.id, userEmail), step.id);
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

    /** Aprovação: qual nível está aberto, rótulo do botão e, quando este usuário não pode, o motivo. */
    const aprovacaoDa = (step: ProcessInstanceStep) => {
        const nivel = proximoNivelDeAprovacao({
            approval_status: step.approval_status,
            approval_required_levels: step.approval_required_levels,
            approval_chain: step.approval_chain as ApprovalStep[],
        }, userEmail);
        const rotulo = nivel.exigidos === 2 ? `Aprovar nível ${nivel.level} de 2` : 'Aprovar';
        return { ...nivel, rotulo, motivo: nivel.pode ? undefined : nivel.motivo };
    };

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

    const handleBlock = async () => {
        if (!instance) return;
        try {
            await processService.blockInstance(instance.id, userId, blockReason);
            setBlockOpen(false); setBlockReason(''); setBlockErro(null);
            reload(); onChanged();
        } catch (e) {
            setBlockErro(e instanceof Error ? e.message : String(e));
        }
    };

    const handleUnblock = async () => {
        if (!instance) return;
        if (!await confirm({ title: 'Desbloquear processo?', message: `Motivo do bloqueio: ${instance.blocked_reason ?? '—'}. O prazo da etapa volta a contar.`, variant: 'default', confirmLabel: 'Desbloquear' })) return;
        await processService.unblockInstance(instance.id, userId);
        reload(); onChanged();
    };

    const bloqueado = instance?.status === 'BLOQUEADO';
    const encerrado = !!instance && ['CONCLUIDO', 'CANCELADO'].includes(instance.status);
    const agora = Date.now();
    const horasDeAtraso = (dueAt?: string | null) => dueAt ? Math.max(0, Math.floor((agora - new Date(dueAt).getTime()) / 3_600_000)) : null;

    /** Quem responde pela etapa, em texto, e se ESTE usuário pode assumir (com o motivo quando não pode). */
    const responsavelDa = (step: ProcessInstanceStep): { texto: string; podeAssumir: boolean; motivo?: string } => {
        if (step.responsible_user_id) {
            const quem = step.responsible_user_id === userId ? 'você' : (membrosOrg.find(m => m.userId === step.responsible_user_id)?.name ?? 'outra pessoa');
            return { texto: `Responsável: ${quem}`, podeAssumir: false };
        }
        if (step.responsible_type === 'DEPARTMENT' || step.responsible_type === 'ROLE') {
            const g = gruposOrg.find(x => x.type === step.responsible_type && x.id === step.responsible_ref_id);
            const nome = g ? `${GROUP_TYPE_LABEL[g.type].toLowerCase()} ${g.name}` : 'grupo';
            const souDoGrupo = !!g?.memberUserIds.includes(userId);
            return {
                texto: `Com o ${nome} — ninguém assumiu`,
                podeAssumir: souDoGrupo,
                motivo: souDoGrupo ? undefined : `Só quem é do ${nome} pode assumir. Peça para marcarem você em Processos › Equipes.`,
            };
        }
        return { texto: 'Sem responsável — qualquer pessoa da organização pode assumir', podeAssumir: true };
    };

    const handleClaim = async (step: ProcessInstanceStep) => {
        if (!instance) return;
        setClaimErro(null);
        try {
            await act(() => processService.claimStep(step.id, instance.id, userId), step.id);
        } catch (e) {
            setClaimErro(e instanceof Error ? e.message : String(e));
        }
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
                                {origem && (
                                    <p className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-1.5">
                                        <span>Origem: <span className="font-medium text-gray-700">{origem.rotulo}</span>{origem.detalhe && ` · ${origem.detalhe}`}</span>
                                        <button
                                            type="button"
                                            onClick={() => { onClose(); navigateToFocus(origem.view, origem.ref, origem.source); }}
                                            className="inline-flex items-center gap-0.5 font-medium text-blue-600 hover:text-blue-800"
                                            title={`Abrir ${origem.rotulo.toLowerCase()} na tela de origem`}
                                        >
                                            Abrir <ChevronRight className="w-3.5 h-3.5" />
                                        </button>
                                    </p>
                                )}
                            </div>
                            <StatusBadge status={instance.status} />
                        </div>
                        {bloqueado && (
                            <p className="text-sm text-red-700 mt-2">
                                Bloqueado{instance.blocked_reason ? `: ${instance.blocked_reason}` : ''}. O prazo das etapas não conta enquanto bloqueado.
                            </p>
                        )}
                        {!encerrado && (
                            <div className="flex flex-wrap items-center gap-3 mt-2">
                                {bloqueado ? (
                                    <button onClick={handleUnblock} className="text-xs text-blue-600 hover:text-blue-800">Desbloquear</button>
                                ) : (
                                    <button onClick={() => { setBlockOpen(v => !v); setBlockErro(null); }} className="text-xs text-amber-700 hover:text-amber-900">
                                        {blockOpen ? 'Fechar bloqueio' : 'Bloquear'}
                                    </button>
                                )}
                                <button onClick={handleCancel} className="text-xs text-red-500 hover:text-red-700">Cancelar processo</button>
                            </div>
                        )}
                        {blockOpen && !bloqueado && (
                            <div className="mt-2 space-y-1.5">
                                <div className="flex gap-2">
                                    <input value={blockReason} onChange={e => setBlockReason(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleBlock()}
                                        className="flex-1 h-9 px-3 rounded-[6px] border border-gray-200 text-sm" placeholder="Motivo do bloqueio (obrigatório)" />
                                    <Button size="sm" onClick={handleBlock} disabled={!blockReason.trim()}
                                        title={!blockReason.trim() ? 'Informe o motivo para bloquear' : undefined}>Bloquear</Button>
                                </div>
                                {blockErro && <p className="text-sm text-red-600">{blockErro}</p>}
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-3">
                        {instance.steps.map((step, idx) => {
                            const isCurrent = step.id === instance.current_step_id;
                            const isDone = step.status === 'CONCLUIDO';
                            const isRejected = step.status === 'REPROVADO';
                            // Pulada pela condição (Passo 4): fica no caminho, apagada, com o motivo.
                            const isSkipped = step.status === 'PULADO';
                            const condicao = descreverCondicao(step.condition);
                            return (
                                <div key={step.id} className={`rounded-2xl border p-4 ${isCurrent ? 'border-blue-300 bg-blue-50/50' : isDone ? 'border-green-200 bg-green-50/30' : isSkipped ? 'border-dashed border-gray-200 opacity-70' : 'border-gray-200'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0
                                            ${isDone ? 'bg-green-600 text-white' : isRejected ? 'bg-red-600 text-white' : isCurrent ? 'bg-blue-600 text-white' : isSkipped ? 'bg-gray-100 text-gray-400' : 'bg-gray-200 text-gray-500'}`}>
                                            {isDone ? <CheckCircle2 className="w-4 h-4" /> : isRejected ? <XCircle className="w-4 h-4" /> : isSkipped ? <SkipForward className="w-4 h-4" /> : idx + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-bold ${isSkipped ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{step.name}</p>
                                            <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                                                {STEP_TYPE_LABEL[step.step_type]}
                                                {step.step_type === 'approval' && !isSkipped && ` · ${step.approval_status}`}
                                                {isSkipped && ' · pulada'}
                                            </p>
                                            {/* Alçada: valor que a decidiu e quantos níveis ela exige (04/10/2026). */}
                                            {step.step_type === 'approval' && !isSkipped && step.approval_status !== 'RASCUNHO' && (
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    {Number(step.amount ?? 0) > 0
                                                        ? `Valor ${Number(step.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
                                                        : 'Sem valor'}
                                                    {` · alçada de ${step.approval_required_levels === 2 ? '2 níveis' : '1 nível'}`}
                                                </p>
                                            )}
                                            {condicao && (
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    {isSkipped ? 'Não se aplicou: ' : 'Só executa quando '}{condicao}
                                                </p>
                                            )}
                                            {/* F3 — prazo, atraso e escalonamento da etapa atual (§8: texto colorido, sem pílula) */}
                                            {isCurrent && step.due_at && (
                                                <p className={`text-xs mt-0.5 ${(horasDeAtraso(step.due_at) ?? 0) > 0 && !bloqueado ? 'text-red-600' : 'text-gray-500'}`}>
                                                    {(horasDeAtraso(step.due_at) ?? 0) > 0 && !bloqueado
                                                        ? `Atrasada há ${horasDeAtraso(step.due_at)}h (prazo ${fmtDate(step.due_at)})`
                                                        : `Prazo ${fmtDate(step.due_at)}`}
                                                    {step.escalated_at && ` · escalonada em ${fmtDate(step.escalated_at)}`}
                                                </p>
                                            )}
                                            {/* F3.2 — quem responde pela etapa atual e "Assumir etapa" */}
                                            {isCurrent && !encerrado && (() => {
                                                const r = responsavelDa(step);
                                                return (
                                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                                        <span className={`text-xs ${step.responsible_user_id ? 'text-gray-600' : 'text-indigo-700'}`}>{r.texto}</span>
                                                        {!step.responsible_user_id && !bloqueado && (
                                                            <Button size="sm" variant="secondary" onClick={() => handleClaim(step)}
                                                                disabled={!r.podeAssumir || busyStep === step.id}
                                                                title={r.motivo}>
                                                                Assumir etapa
                                                            </Button>
                                                        )}
                                                        {!step.responsible_user_id && !bloqueado && !r.podeAssumir && r.motivo && (
                                                            <span className="text-xs text-gray-500 basis-full">{r.motivo}</span>
                                                        )}
                                                        {claimErro && <span className="text-xs text-red-600 basis-full">{claimErro}</span>}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        {isCurrent && bloqueado && (
                                            <span className="text-xs text-gray-500" title={instance.blocked_reason ?? undefined}>
                                                Ações suspensas: processo bloqueado
                                            </span>
                                        )}
                                        {isCurrent && !bloqueado && (
                                            <div className="flex items-center gap-2">
                                                {step.step_type === 'approval' && step.approval_status === 'PENDENTE' && (
                                                    <button onClick={() => setRejectStep(step)} className="text-xs text-red-600 hover:text-red-800 font-bold">Reprovar</button>
                                                )}
                                                {step.step_type === 'task' && step.task_id && (
                                                    <Button size="sm" onClick={() => handleCompleteTask(step)} disabled={busyStep === step.id}>
                                                        {busyStep === step.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Concluir tarefa'}
                                                    </Button>
                                                )}
                                                {!(step.step_type === 'task' && step.task_id) && (() => {
                                                    const aprov = step.step_type === 'approval' && step.approval_status === 'PENDENTE' ? aprovacaoDa(step) : null;
                                                    return (
                                                        <Button size="sm" onClick={() => handleAction(step)}
                                                            disabled={busyStep === step.id || (aprov ? !aprov.pode : false)}
                                                            title={aprov?.motivo}>
                                                            {busyStep === step.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (
                                                                step.step_type === 'approval' ? (step.approval_status === 'RASCUNHO' ? 'Enviar p/ aprovação' : (aprov?.rotulo ?? 'Aprovar'))
                                                                : step.step_type === 'document' ? 'Anexar documento'
                                                                : step.step_type === 'task' ? 'Criar tarefa'
                                                                : 'Concluir'
                                                            )}
                                                        </Button>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                    {/* Motivo do "Aprovar" desabilitado e erro da última ação — abaixo da linha, nunca mudo. */}
                                    {isCurrent && !bloqueado && step.step_type === 'approval' && step.approval_status === 'PENDENTE' && aprovacaoDa(step).motivo && (
                                        <p className="text-xs text-gray-500 mt-2 ml-10">{aprovacaoDa(step).motivo}</p>
                                    )}
                                    {isCurrent && acaoErro && <p className="text-xs text-red-600 mt-2 ml-10">{acaoErro}</p>}
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
                        <p className="text-xs text-gray-500">
                            {item.name} · {STEP_TYPE_LABEL[item.step_type]}
                            {item.via_group && <span className="text-indigo-600"> · via {item.via_group} — ninguém assumiu</span>}
                        </p>
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
                    // §6.2 sentence case · §6.6 px-6 + border-r · §7 tipografia · §7.2 py-2.5 · §16 radius
                    <div className="bg-white border border-gray-100 rounded-[10px] overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                    <th className="px-6 py-2 border-r border-gray-100">Etapa</th>
                                    <th className="px-6 py-2 border-r border-gray-100">Tipo</th>
                                    <th className="px-6 py-2 border-r border-gray-100 text-right">Tempo médio</th>
                                    <th className="px-6 py-2 border-r border-gray-100 text-right">Ativos</th>
                                    <th className="px-6 py-2 text-right">Atrasados</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {bottlenecks.map((b, idx) => (
                                    <tr key={`${b.step_name}-${idx}`} className="hover:bg-blue-50/50 transition-colors">
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">{b.step_name}</td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{STEP_TYPE_LABEL[b.step_type]}</td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600 text-right">{b.avg_hours != null ? `${b.avg_hours}h` : '—'}</td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600 text-right">{b.active_count}</td>
                                        <td className="px-6 py-2.5 text-sm font-normal text-right">
                                            {b.overdue_count > 0 ? (
                                                <span className="inline-flex items-center gap-1 text-red-600">
                                                    <AlertTriangle className="w-3.5 h-3.5" /> {b.overdue_count}
                                                </span>
                                            ) : <span className="text-gray-600">—</span>}
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

function TemplateList({ organizationId, onCreate, onEdit }: {
    organizationId: string | null; onCreate: () => void; onEdit: (m: ModeloEmEdicao) => void;
}) {
    const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
    const [steps, setSteps] = useState<Record<string, ProcessTemplateStep[]>>({});
    const [expanded, setExpanded] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    // Nome do dono: membros por organização (em "Todas" a lista mistura orgs).
    const [membrosPorOrg, setMembrosPorOrg] = useState<Record<string, ProcessAssignableMember[]>>({});
    const [abrindo, setAbrindo] = useState<string | null>(null);

    const reload = useCallback(() => {
        setLoading(true);
        processService.listTemplates(organizationId)
            .then(async ts => {
                setTemplates(ts);
                const orgs = [...new Set(ts.map(t => t.organization_id).filter(Boolean))];
                const pares = await Promise.all(orgs.map(async o => [o, await processService.listAssignableMembers(o).catch(() => [])] as const));
                setMembrosPorOrg(Object.fromEntries(pares));
            })
            .catch(() => setTemplates([]))
            .finally(() => setLoading(false));
    }, [organizationId]);

    useEffect(reload, [reload]);

    const editar = async (t: ProcessTemplate) => {
        setAbrindo(t.id);
        try {
            const s = steps[t.id] ?? await processService.getTemplateSteps(t.id);
            onEdit({ template: t, steps: s });
        } finally {
            setAbrindo(null);
        }
    };

    const donoDe = (t: ProcessTemplate) => t.owner_user_id
        ? (membrosPorOrg[t.organization_id]?.find(m => m.userId === t.owner_user_id)?.name ?? 'membro removido')
        : null;

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
                    <div className="flex items-center gap-2 pr-3">
                        <button onClick={() => toggle(t.id)} className="flex-1 min-w-0 flex items-center gap-3 p-4 text-left">
                            <Layers className="w-4 h-4 text-blue-600 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900">{t.name}</p>
                                <p className="text-xs text-gray-500">
                                    {[t.category, `v${t.version}`].filter(Boolean).join(' · ')}
                                    {' · '}
                                    {t.trigger_type === 'EVENTO'
                                        ? `Automático: ${PROCESS_EVENT_LABEL[t.trigger_event_key as ProcessEventKey] ?? t.trigger_event_key ?? 'evento não definido'}`
                                        : 'Manual'}
                                </p>
                                {/* Dono: modelo automático sem dono é o que deixou processo vencer sem aviso (04/10/2026). */}
                                <p className={`text-xs ${donoDe(t) ? 'text-gray-500' : t.trigger_type === 'EVENTO' ? 'text-amber-700' : 'text-gray-400'}`}>
                                    {donoDe(t)
                                        ? `Dono: ${donoDe(t)}`
                                        : t.trigger_type === 'EVENTO'
                                            ? 'Sem dono: atrasos vão para os administradores da organização. Edite e escolha um dono.'
                                            : 'Sem dono'}
                                </p>
                            </div>
                            <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform ${expanded === t.id ? 'rotate-90' : ''}`} />
                        </button>
                        <ActionIconButton kind="edit" title="Editar modelo" disabled={abrindo === t.id} onClick={() => editar(t)} />
                    </div>
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

type Tab = 'pendente' | 'processos' | 'dashboard' | 'templates' | 'equipes';

// ─── Equipes (F3.2) — quem é de cada departamento/cargo ─────

const EQUIPES_COLUMNS: StandardTableColumn[] = [
    { key: 'name',    label: 'Nome',    sortable: true, width: 260 },
    { key: 'type',    label: 'Tipo',    sortable: true, width: 140 },
    { key: 'company', label: 'Empresa', sortable: true, width: 220 },
    { key: 'members', label: 'Membros', sortable: true, width: 320 },
];

function EquipesTab({ organizationId, userId }: { organizationId: string | null; userId: string }) {
    const [grupos, setGrupos] = useState<ProcessGroup[]>([]);
    const [loading, setLoading] = useState(true);
    // Membros por organização — o grupo pertence à org da empresa dele; em "Todas" podem ser várias.
    const [membrosPorOrg, setMembrosPorOrg] = useState<Record<string, ProcessAssignableMember[]>>({});
    const [editando, setEditando] = useState<ProcessGroup | null>(null);
    const [marcados, setMarcados] = useState<string[]>([]);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    const carregar = useCallback(() => {
        setLoading(true);
        processService.listGroups(organizationId)
            .then(async gs => {
                setGrupos(gs);
                const orgs = [...new Set(gs.map(g => g.organizationId).filter(Boolean))];
                const pares = await Promise.all(orgs.map(async o => [o, await processService.listAssignableMembers(o).catch(() => [])] as const));
                setMembrosPorOrg(Object.fromEntries(pares));
            })
            .catch(() => setGrupos([]))
            .finally(() => setLoading(false));
    }, [organizationId]);

    useEffect(() => { carregar(); }, [carregar]);

    const nomeDe = (orgId: string, uid: string) => membrosPorOrg[orgId]?.find(m => m.userId === uid)?.name ?? 'membro removido';

    const abrir = (g: ProcessGroup) => { setEditando(g); setMarcados(g.memberUserIds); setErro(null); };

    const salvar = async () => {
        if (!editando) return;
        setSalvando(true);
        try {
            await processService.setGroupMembers(editando, marcados, userId);
            // §22: atualiza a linha local em vez de recarregar tudo.
            setGrupos(gs => gs.map(g => g.type === editando.type && g.id === editando.id ? { ...g, memberUserIds: marcados } : g));
            setEditando(null);
        } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
        } finally {
            setSalvando(false);
        }
    };

    const membrosDaOrg = editando ? (membrosPorOrg[editando.organizationId] ?? []) : [];

    return (
        <div className="p-4 space-y-3">
            <p className="text-sm text-gray-500">
                Marque quem é de cada departamento ou cargo. Etapas atribuídas a um deles aparecem em "Pendente comigo" para todos os marcados, e o primeiro que assumir fica com ela.
            </p>
            <StandardTable<ProcessGroup>
                storageKey="processos:equipes:tabela"
                columns={EQUIPES_COLUMNS}
                rows={grupos}
                rowKey={g => `${g.type}:${g.id}`}
                loading={loading}
                searchText={g => `${g.name} ${g.companyName} ${GROUP_TYPE_LABEL[g.type]} ${g.memberUserIds.map(u => nomeDe(g.organizationId, u)).join(' ')}`}
                searchPlaceholder="Buscar departamento, cargo ou pessoa..."
                sortValue={(key, g) => key === 'type' ? GROUP_TYPE_LABEL[g.type] : key === 'company' ? g.companyName : key === 'members' ? g.memberUserIds.length : g.name}
                onRowClick={abrir}
                renderCell={(key, g) => {
                    if (key === 'type') return <span className="text-sm font-normal text-gray-600">{GROUP_TYPE_LABEL[g.type]}</span>;
                    if (key === 'company') return <span className="block truncate text-sm font-normal text-gray-600" title={g.companyName}>{g.companyName || '—'}</span>;
                    if (key === 'members') {
                        if (g.memberUserIds.length === 0) return <span className="text-sm font-normal text-amber-700">Ninguém — etapas deste grupo ficam sem dono</span>;
                        const nomes = g.memberUserIds.map(u => nomeDe(g.organizationId, u)).join(', ');
                        return <span className="block truncate text-sm font-normal text-gray-700" title={nomes}>{nomes}</span>;
                    }
                    return <span className="block truncate text-sm font-normal text-gray-700" title={g.name}>{g.name}</span>;
                }}
                actions={{ width: 150, render: g => (
                    <button onClick={e => { e.stopPropagation(); abrir(g); }} className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all">
                        Editar membros
                    </button>
                ) }}
                empty={{ icon: <Layers className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum departamento ou cargo', subtitle: 'Cadastre departamentos e cargos da empresa em Minha Organização.' }}
            />

            <Sheet open={!!editando} onClose={() => setEditando(null)} size="md">
                {editando && (
                    <>
                        <SheetHeader onClose={() => setEditando(null)}>
                            <SheetTitle>{editando.name}</SheetTitle>
                            <SheetDescription>{GROUP_TYPE_LABEL[editando.type]} · {editando.companyName}</SheetDescription>
                        </SheetHeader>
                        <SheetPanel className="p-6 space-y-3">
                            <p className="text-sm text-gray-500">Só membros com login aparecem aqui — quem nunca entrou no app não pode assumir etapa.</p>
                            <ListaDeMarcacao
                                opcoes={membrosDaOrg.filter(m => m.userId).map(m => ({ id: m.userId!, name: m.name }))}
                                marcados={marcados}
                                onChange={setMarcados} />
                            {erro && <p className="text-sm text-red-600">{erro}</p>}
                        </SheetPanel>
                        <SheetFooter>
                            <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
                            <Button onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : `Salvar (${marcados.length})`}</Button>
                        </SheetFooter>
                    </>
                )}
            </Sheet>
        </div>
    );
}

interface Props {
    organizationId?: string;
    userId?: string;
    userEmail?: string;
}

export default function ProcessosModule({ organizationId = '', userId = '', userEmail = '' }: Props) {
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const [modalOrgId, setModalOrgId] = useState<string | undefined>(undefined);

    const [tab, setTab] = useState<Tab>('pendente');
    const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
    const [showStart, setShowStart] = useState(false);
    const [showNewTemplate, setShowNewTemplate] = useState(false);
    // Edição de modelo (04/10/2026). A org é a DO MODELO — não pergunta nada (REGRA #5).
    const [modeloEmEdicao, setModeloEmEdicao] = useState<ModeloEmEdicao | null>(null);
    const [openInstanceId, setOpenInstanceId] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    // Clique numa notificação de SLA (10/10/2026): `fn_process_sla_sweep` grava
    // `/opura-processos?instance=<id>`, `App.handleNavigate` vira `navigateToFocus` e o foco chega
    // aqui — abre o detalhe do processo. Consumido uma vez e limpo, para não reabrir ao voltar.
    const viewFocus = useStore(s => s.viewFocus);
    const setViewFocus = useStore(s => s.setViewFocus);
    useEffect(() => {
        if (viewFocus?.source !== 'PROCESSO_INSTANCIA') return;
        setOpenInstanceId(viewFocus.ref);
        setViewFocus(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewFocus]);

    const handleStartProcess = async () => {
        const target = await resolveWriteOrg('single');
        if (!target || target.kind !== 'org') return;
        const orgId = target.orgId;
        setModalOrgId(orgId);
        setShowStart(true);
    };

    const handleNewTemplate = async () => {
        const target = await resolveWriteOrg('single');
        if (!target || target.kind !== 'org') return;
        const orgId = target.orgId;
        setModalOrgId(orgId);
        setShowNewTemplate(true);
    };

    useEffect(() => {
        processService.listTemplates(organizationId || null).then(setTemplates).catch(() => {});
    }, [organizationId, refreshKey]);

    const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
        { id: 'pendente',  label: 'Pendente Comigo',    icon: ClipboardList },
        { id: 'processos', label: 'Todos os Processos', icon: Workflow },
        { id: 'dashboard', label: 'Dashboard',          icon: Activity },
        { id: 'templates', label: 'Templates',          icon: Layers },
        { id: 'equipes',   label: 'Equipes',            icon: Users },
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
                    <Button size="sm" onClick={handleStartProcess}><Plus className="w-3.5 h-3.5" /> Iniciar Processo</Button>
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
                {tab === 'templates' && <TemplateList key={refreshKey} organizationId={organizationId || null} onCreate={handleNewTemplate} onEdit={setModeloEmEdicao} />}
                {tab === 'equipes'   && <EquipesTab organizationId={organizationId || null} userId={userId} />}
            </div>

            {showStart && modalOrgId && (
                <StartInstanceModal
                    open={showStart} onClose={() => { setShowStart(false); setModalOrgId(undefined); }} organizationId={modalOrgId} userId={userId}
                    templates={templates} onStarted={(id) => { setOpenInstanceId(id); setRefreshKey(k => k + 1); }}
                />
            )}
            {showNewTemplate && modalOrgId && (
                <TemplateEditorModal
                    open={showNewTemplate} onClose={() => { setShowNewTemplate(false); setModalOrgId(undefined); }} organizationId={modalOrgId}
                    onSaved={() => setRefreshKey(k => k + 1)}
                />
            )}
            {modeloEmEdicao && (
                <TemplateEditorModal
                    open={!!modeloEmEdicao} onClose={() => setModeloEmEdicao(null)}
                    organizationId={modeloEmEdicao.template.organization_id} editando={modeloEmEdicao}
                    onSaved={() => setRefreshKey(k => k + 1)}
                />
            )}

            {orgTargetModal}
            <InstanceDetail
                open={!!openInstanceId} onClose={() => setOpenInstanceId(null)} instanceId={openInstanceId}
                organizationId={organizationId} userId={userId} userEmail={userEmail}
                onChanged={() => setRefreshKey(k => k + 1)}
            />
        </div>
    );
}
