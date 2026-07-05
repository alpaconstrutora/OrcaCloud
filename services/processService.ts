import { supabase } from '../lib/supabase';
import { approvalService, type RoleLabels } from './approvalService';
import type {
    ProcessTemplate, ProcessTemplateStep, ProcessInstance, ProcessInstanceStep,
    ProcessInstanceWithSteps, ProcessComment, ProcessInstanceStatus, PendingStepItem,
    ProcessPriority, ProcessCriticality, ProcessEventKey, ProcessStepBottleneck,
} from '../types/process';

// ============================================================
// processService — motor de orquestração template→instância→etapa.
//
// A etapa é polimórfica por step_type e DELEGA para as primitivas que já
// existem (Regra de Ouro 12): 'approval' → approvalService (entidade
// 'process_step'); 'task' → taskService (ponte via step.task_id);
// 'document' → documentService (ponte via step.document_id). Este serviço
// não reimplementa nenhuma delas — só orquestra a transição de etapas.
//
// Ver PLANO_MODULO_PROCESSOS.md — Fase 1 (MVP + piloto).
// ============================================================

/** Mapeia o tipo da próxima etapa para o status "aguardando X" da instância. */
const WAITING_STATUS_BY_STEP_TYPE: Record<ProcessInstanceStep['step_type'], ProcessInstanceStatus> = {
    approval:   'AGUARDANDO_APROVACAO',
    document:   'AGUARDANDO_DOCUMENTO',
    task:       'AGUARDANDO_RESPONSAVEL',
    validation: 'EM_ANDAMENTO',
    manual:     'EM_ANDAMENTO',
};

async function logAction(
    instanceId: string,
    userId: string | undefined,
    action: string,
    extra: { old_value?: unknown; new_value?: unknown; metadata?: Record<string, unknown> } = {},
): Promise<void> {
    const { error } = await supabase.from('process_audit_logs').insert({
        process_instance_id: instanceId,
        user_id: userId ?? null,
        action,
        old_value: extra.old_value ?? null,
        new_value: extra.new_value ?? null,
        metadata: extra.metadata ?? {},
    });
    if (error) console.warn('[processService] logAction:', error.message);
}

/** Avança a instância para a próxima etapa (ou conclui se não houver mais nenhuma). */
async function advanceToNextStep(instanceId: string, userId?: string): Promise<void> {
    const { data: steps, error } = await supabase
        .from('process_instance_steps')
        .select('id, status, step_type, order_index, template_step_id')
        .eq('process_instance_id', instanceId)
        .order('order_index', { ascending: true });
    if (error) {
        console.error('[processService] advanceToNextStep (fetch steps):', error);
        throw new Error(`Erro ao carregar etapas: ${error.message}`);
    }

    const next = (steps as Pick<ProcessInstanceStep, 'id' | 'status' | 'step_type' | 'order_index' | 'template_step_id'>[] ?? [])
        .find(s => s.status === 'PENDENTE');

    if (!next) {
        const { error: doneErr } = await supabase
            .from('process_instances')
            .update({ status: 'CONCLUIDO' as ProcessInstanceStatus, completed_at: new Date().toISOString(), current_step_id: null })
            .eq('id', instanceId);
        if (doneErr) {
            console.error('[processService] advanceToNextStep (conclude):', doneErr);
            throw new Error(`Erro ao concluir processo: ${doneErr.message}`);
        }
        await logAction(instanceId, userId, 'INSTANCE_COMPLETED');
        return;
    }

    // Resolve responsável default (só USER é resolvido automaticamente no MVP;
    // DEPARTMENT/ROLE ficam sem responsável — usuário assume via "Assumir etapa").
    const { data: templateStep } = await supabase
        .from('process_template_steps')
        .select('default_responsible_type, default_responsible_id')
        .eq('id', next.template_step_id)
        .maybeSingle();
    const responsibleUserId = templateStep?.default_responsible_type === 'USER'
        ? templateStep.default_responsible_id
        : null;

    const { error: stepErr } = await supabase
        .from('process_instance_steps')
        .update({
            status: 'EM_ANDAMENTO',
            started_at: new Date().toISOString(),
            ...(responsibleUserId ? { responsible_user_id: responsibleUserId } : {}),
        })
        .eq('id', next.id);
    if (stepErr) {
        console.error('[processService] advanceToNextStep (start next):', stepErr);
        throw new Error(`Erro ao iniciar próxima etapa: ${stepErr.message}`);
    }

    const { error: instErr } = await supabase
        .from('process_instances')
        .update({
            current_step_id: next.id,
            status: responsibleUserId
                ? WAITING_STATUS_BY_STEP_TYPE[next.step_type]
                : 'AGUARDANDO_RESPONSAVEL',
        })
        .eq('id', instanceId);
    if (instErr) {
        console.error('[processService] advanceToNextStep (update instance):', instErr);
        throw new Error(`Erro ao avançar processo: ${instErr.message}`);
    }

    await logAction(instanceId, userId, 'STEP_ADVANCED', { new_value: { step_id: next.id } });
}

export const processService = {

    // ── Templates ────────────────────────────────────────────

    async listTemplates(organizationId: string): Promise<ProcessTemplate[]> {
        const { data, error } = await supabase
            .from('process_templates')
            .select('*')
            .eq('organization_id', organizationId)
            .neq('status', 'ARQUIVADO')
            .order('name');
        if (error) {
            console.error('[processService] listTemplates:', error);
            throw new Error(`Erro ao carregar templates: ${error.message}`);
        }
        return (data ?? []) as ProcessTemplate[];
    },

    async getTemplateSteps(templateId: string): Promise<ProcessTemplateStep[]> {
        const { data, error } = await supabase
            .from('process_template_steps')
            .select('*')
            .eq('process_template_id', templateId)
            .order('order_index');
        if (error) {
            console.error('[processService] getTemplateSteps:', error);
            throw new Error(`Erro ao carregar etapas do template: ${error.message}`);
        }
        return (data ?? []) as ProcessTemplateStep[];
    },

    async createTemplate(
        template: Pick<ProcessTemplate, 'organization_id' | 'name' | 'category' | 'criticality' | 'default_sla_hours'> & Partial<ProcessTemplate>,
        steps: Array<Pick<ProcessTemplateStep, 'name' | 'step_type' | 'is_required' | 'requires_document' | 'can_skip'> & Partial<ProcessTemplateStep>>,
    ): Promise<ProcessTemplate> {
        const { data: created, error } = await supabase
            .from('process_templates')
            .insert({ ...template, status: template.status ?? 'ATIVO' })
            .select()
            .single();
        if (error) {
            console.error('[processService] createTemplate:', error);
            throw new Error(`Erro ao criar template: ${error.message}`);
        }

        if (steps.length > 0) {
            const rows = steps.map((s, idx) => ({ ...s, process_template_id: created.id, order_index: s.order_index ?? idx }));
            const { error: stepsErr } = await supabase.from('process_template_steps').insert(rows);
            if (stepsErr) {
                console.error('[processService] createTemplate (steps):', stepsErr);
                throw new Error(`Erro ao criar etapas do template: ${stepsErr.message}`);
            }
        }
        return created as ProcessTemplate;
    },

    async archiveTemplate(id: string): Promise<void> {
        const { error } = await supabase
            .from('process_templates')
            .update({ status: 'ARQUIVADO', archived_at: new Date().toISOString() })
            .eq('id', id);
        if (error) {
            console.error('[processService] archiveTemplate:', error);
            throw new Error(`Erro ao arquivar template: ${error.message}`);
        }
    },

    // ── Instâncias ───────────────────────────────────────────

    async listInstances(organizationId: string, filters?: { status?: ProcessInstanceStatus }): Promise<(ProcessInstance & { template_name?: string })[]> {
        let q = supabase
            .from('process_instances')
            .select('*, process_templates(name)')
            .eq('organization_id', organizationId)
            .order('started_at', { ascending: false });
        if (filters?.status) q = q.eq('status', filters.status);

        const { data, error } = await q;
        if (error) {
            console.error('[processService] listInstances:', error);
            throw new Error(`Erro ao carregar processos: ${error.message}`);
        }
        return (data ?? []).map((r: any) => ({ ...r, template_name: r.process_templates?.name }));
    },

    async getInstance(id: string): Promise<ProcessInstanceWithSteps> {
        const { data: instance, error } = await supabase
            .from('process_instances')
            .select('*, process_templates(name)')
            .eq('id', id)
            .single();
        if (error) {
            console.error('[processService] getInstance:', error);
            throw new Error(`Erro ao carregar processo: ${error.message}`);
        }
        const { data: steps, error: stepsErr } = await supabase
            .from('process_instance_steps')
            .select('*')
            .eq('process_instance_id', id)
            .order('order_index');
        if (stepsErr) {
            console.error('[processService] getInstance (steps):', stepsErr);
            throw new Error(`Erro ao carregar etapas: ${stepsErr.message}`);
        }
        const { process_templates, ...instanceRow } = instance as any;
        return { ...instanceRow, steps: (steps ?? []) as ProcessInstanceStep[], template_name: process_templates?.name };
    },

    /** Cria a instância a partir do template (snapshot de versão + etapas) e inicia a 1ª etapa. */
    async startInstance(opts: {
        organizationId: string;
        templateId: string;
        title: string;
        description?: string;
        /** Ausente quando a instância nasce de um gatilho automático (sem usuário no contexto). */
        requesterUserId?: string;
        priority?: ProcessPriority;
        dueAt?: string;
        projectId?: string;
        supplierId?: string;
        clientId?: string;
        contractId?: string;
        purchaseOrderId?: string;
    }): Promise<ProcessInstanceWithSteps> {
        const { data: template, error: tplErr } = await supabase
            .from('process_templates')
            .select('*')
            .eq('id', opts.templateId)
            .single();
        if (tplErr) {
            console.error('[processService] startInstance (template):', tplErr);
            throw new Error(`Erro ao carregar template: ${tplErr.message}`);
        }
        const templateSteps = await this.getTemplateSteps(opts.templateId);
        if (templateSteps.length === 0) {
            throw new Error('Template sem etapas configuradas.');
        }

        const { data: instance, error } = await supabase
            .from('process_instances')
            .insert({
                organization_id: opts.organizationId,
                process_template_id: opts.templateId,
                template_version: (template as ProcessTemplate).version,
                title: opts.title,
                description: opts.description ?? null,
                priority: opts.priority ?? 'MEDIA',
                criticality: (template as ProcessTemplate).criticality,
                requester_user_id: opts.requesterUserId ?? null,
                department_id: (template as ProcessTemplate).department_id ?? null,
                project_id: opts.projectId ?? null,
                supplier_id: opts.supplierId ?? null,
                client_id: opts.clientId ?? null,
                contract_id: opts.contractId ?? null,
                purchase_order_id: opts.purchaseOrderId ?? null,
                due_at: opts.dueAt ?? null,
            })
            .select()
            .single();
        if (error) {
            console.error('[processService] startInstance:', error);
            throw new Error(`Erro ao iniciar processo: ${error.message}`);
        }

        const firstStep = templateSteps[0];
        const stepRows = templateSteps.map(ts => ({
            process_instance_id: instance.id,
            template_step_id: ts.id,
            name: ts.name,
            step_type: ts.step_type,
            order_index: ts.order_index,
            status: ts.id === firstStep.id ? 'EM_ANDAMENTO' : 'PENDENTE',
            responsible_user_id: ts.default_responsible_type === 'USER' ? ts.default_responsible_id : null,
            started_at: ts.id === firstStep.id ? new Date().toISOString() : null,
            due_at: ts.sla_hours ? new Date(Date.now() + ts.sla_hours * 3_600_000).toISOString() : null,
        }));
        const { data: insertedSteps, error: stepsErr } = await supabase
            .from('process_instance_steps')
            .insert(stepRows)
            .select();
        if (stepsErr) {
            console.error('[processService] startInstance (steps):', stepsErr);
            throw new Error(`Erro ao criar etapas do processo: ${stepsErr.message}`);
        }

        const firstInserted = (insertedSteps as ProcessInstanceStep[]).find(s => s.template_step_id === firstStep.id)!;
        const firstResponsible = firstStep.default_responsible_type === 'USER' ? firstStep.default_responsible_id : null;

        await supabase
            .from('process_instances')
            .update({
                current_step_id: firstInserted.id,
                status: firstResponsible ? WAITING_STATUS_BY_STEP_TYPE[firstStep.step_type] : 'AGUARDANDO_RESPONSAVEL',
            })
            .eq('id', instance.id);

        await logAction(instance.id, opts.requesterUserId, 'INSTANCE_STARTED', { metadata: { template_id: opts.templateId } });

        return this.getInstance(instance.id);
    },

    async cancelInstance(id: string, userId: string, reason?: string): Promise<void> {
        const { error } = await supabase
            .from('process_instances')
            .update({ status: 'CANCELADO' as ProcessInstanceStatus, cancelled_at: new Date().toISOString() })
            .eq('id', id);
        if (error) {
            console.error('[processService] cancelInstance:', error);
            throw new Error(`Erro ao cancelar processo: ${error.message}`);
        }
        await logAction(id, userId, 'INSTANCE_CANCELLED', { metadata: { reason } });
    },

    // ── Costura P2P — gatilho de evento ─────────────────────────
    //
    // O motor não sabe nada sobre "pedido de compra" ou "recebimento"; ele só
    // reage a uma chave de evento. Quem sabe que "Recebido" vira
    // 'purchase_order.received' é o orderService, que chama isto como efeito
    // colateral (mesmo padrão de financialService.syncOrderToFinance — best
    // effort, não deve derrubar a atualização do pedido).

    /**
     * Dispara todos os templates ATIVOS com trigger_type='EVENTO' cuja
     * trigger_event_key bate com `eventKey`. Idempotente por (template, PO):
     * não inicia de novo se já existir instância não-terminal para o mesmo
     * pedido — evita duplicar processo quando o status é regravado.
     */
    async triggerEvent(
        organizationId: string,
        eventKey: ProcessEventKey,
        ctx: { title: string; purchaseOrderId?: string; supplierId?: string; projectId?: string; contractId?: string; clientId?: string },
    ): Promise<void> {
        const { data: templates, error } = await supabase
            .from('process_templates')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('trigger_type', 'EVENTO')
            .eq('trigger_event_key', eventKey)
            .eq('status', 'ATIVO');
        if (error) {
            console.error('[processService] triggerEvent (templates):', error);
            return; // best-effort — não derruba o fluxo que disparou o evento
        }

        for (const template of (templates ?? []) as { id: string }[]) {
            try {
                if (ctx.purchaseOrderId) {
                    const { data: existing } = await supabase
                        .from('process_instances')
                        .select('id')
                        .eq('process_template_id', template.id)
                        .eq('purchase_order_id', ctx.purchaseOrderId)
                        .not('status', 'in', '(CONCLUIDO,CANCELADO)')
                        .maybeSingle();
                    if (existing) continue; // já existe instância ativa para este pedido
                }
                await this.startInstance({
                    organizationId,
                    templateId: template.id,
                    title: ctx.title,
                    purchaseOrderId: ctx.purchaseOrderId,
                    supplierId: ctx.supplierId,
                    projectId: ctx.projectId,
                    contractId: ctx.contractId,
                    clientId: ctx.clientId,
                });
            } catch (startErr) {
                console.error('[processService] triggerEvent (startInstance):', startErr);
            }
        }
    },

    // ── Dashboard de gargalos (Fase 2) ───────────────────────────

    async getBottlenecks(organizationId: string): Promise<ProcessStepBottleneck[]> {
        const { data, error } = await supabase.rpc('fn_process_bottlenecks', { p_organization_id: organizationId });
        if (error) {
            console.error('[processService] getBottlenecks:', error);
            throw new Error(`Erro ao carregar gargalos: ${error.message}`);
        }
        return (data ?? []) as ProcessStepBottleneck[];
    },

    // ── Etapas — "assumir" e conclusão manual/validação ────────

    async claimStep(stepId: string, userId: string): Promise<void> {
        const { error } = await supabase
            .from('process_instance_steps')
            .update({ responsible_user_id: userId, status: 'EM_ANDAMENTO' })
            .eq('id', stepId)
            .eq('status', 'PENDENTE');
        if (error) {
            console.error('[processService] claimStep:', error);
            throw new Error(`Erro ao assumir etapa: ${error.message}`);
        }
    },

    /** Conclui etapa 'manual' ou 'validation' e avança o processo. */
    async completeStep(stepId: string, instanceId: string, userId: string): Promise<void> {
        const { error } = await supabase
            .from('process_instance_steps')
            .update({ status: 'CONCLUIDO', completed_at: new Date().toISOString() })
            .eq('id', stepId);
        if (error) {
            console.error('[processService] completeStep:', error);
            throw new Error(`Erro ao concluir etapa: ${error.message}`);
        }
        await advanceToNextStep(instanceId, userId);
    },

    /** Vincula um documento já existente do DMS (ponte — não reimplementa upload). */
    async attachDocument(stepId: string, instanceId: string, documentId: string, userId: string): Promise<void> {
        const { error } = await supabase
            .from('process_instance_steps')
            .update({ document_id: documentId, status: 'CONCLUIDO', completed_at: new Date().toISOString() })
            .eq('id', stepId);
        if (error) {
            console.error('[processService] attachDocument:', error);
            throw new Error(`Erro ao anexar documento: ${error.message}`);
        }
        await logAction(instanceId, userId, 'DOCUMENT_ATTACHED', { metadata: { step_id: stepId, document_id: documentId } });
        await advanceToNextStep(instanceId, userId);
    },

    /** Vincula a Task já criada pelo taskService (a etapa não cria/edita a tarefa). */
    async linkTask(stepId: string, taskId: string): Promise<void> {
        const { error } = await supabase
            .from('process_instance_steps')
            .update({ task_id: taskId, status: 'EM_ANDAMENTO' })
            .eq('id', stepId);
        if (error) {
            console.error('[processService] linkTask:', error);
            throw new Error(`Erro ao vincular tarefa: ${error.message}`);
        }
    },

    /** Marca a etapa 'task' como concluída (a Task em si é gerenciada pelo taskService). */
    async completeTaskStep(stepId: string, instanceId: string, userId: string): Promise<void> {
        return this.completeStep(stepId, instanceId, userId);
    },

    // ── Etapas de aprovação — delega 100% para approvalService ─

    async submitStepApproval(stepId: string, instanceId: string, organizationId: string, amount: number): Promise<void> {
        await approvalService.submit('process_step', stepId, {}, { organizationId, amount });
        await supabase.from('process_instances').update({ status: 'AGUARDANDO_APROVACAO' as ProcessInstanceStatus }).eq('id', instanceId);
        await logAction(instanceId, undefined, 'APPROVAL_SUBMITTED', { metadata: { step_id: stepId, amount } });
    },

    async approveStep(
        stepId: string, instanceId: string, level: 1 | 2, approvedBy: string, labels: RoleLabels, notes?: string,
    ): Promise<void> {
        const result = await approvalService.approve('process_step', stepId, level, approvedBy, labels, notes, {
            status: 'CONCLUIDO',
            completed_at: new Date().toISOString(),
        });
        await logAction(instanceId, approvedBy, 'STEP_APPROVED', { metadata: { step_id: stepId, level } });
        if (result.approval_status === 'APROVADO') {
            await advanceToNextStep(instanceId, approvedBy);
        }
    },

    async rejectStep(stepId: string, instanceId: string, rejectedBy: string, reason: string): Promise<void> {
        await approvalService.reject('process_step', stepId, rejectedBy, reason, { status: 'REPROVADO' });
        await supabase.from('process_instances').update({ status: 'DEVOLVIDO' as ProcessInstanceStatus }).eq('id', instanceId);
        await logAction(instanceId, rejectedBy, 'STEP_REJECTED', { metadata: { step_id: stepId, reason } });
    },

    // ── Pendências ("pendente comigo") ──────────────────────────

    async listMyPendingSteps(organizationId: string, userId: string): Promise<PendingStepItem[]> {
        const { data, error } = await supabase
            .from('process_instance_steps')
            .select('*, process_instances!inner(title, status, priority, organization_id)')
            .eq('responsible_user_id', userId)
            .eq('process_instances.organization_id', organizationId)
            .in('status', ['PENDENTE', 'EM_ANDAMENTO']);
        if (error) {
            console.error('[processService] listMyPendingSteps:', error);
            throw new Error(`Erro ao carregar pendências: ${error.message}`);
        }
        return (data ?? []).map((r: any) => ({
            ...r,
            instance_title: r.process_instances.title,
            instance_status: r.process_instances.status,
            instance_priority: r.process_instances.priority,
        }));
    },

    /** Aprovações de etapa pendentes (fila própria — fn_approval_action_queue ainda não cobre 'process_step'). */
    async listMyPendingApprovals(organizationId: string): Promise<PendingStepItem[]> {
        const { data, error } = await supabase
            .from('process_instance_steps')
            .select('*, process_instances!inner(title, status, priority, organization_id)')
            .eq('step_type', 'approval')
            .eq('approval_status', 'PENDENTE')
            .eq('process_instances.organization_id', organizationId);
        if (error) {
            console.error('[processService] listMyPendingApprovals:', error);
            throw new Error(`Erro ao carregar aprovações pendentes: ${error.message}`);
        }
        return (data ?? []).map((r: any) => ({
            ...r,
            instance_title: r.process_instances.title,
            instance_status: r.process_instances.status,
            instance_priority: r.process_instances.priority,
        }));
    },

    // ── Comentários ──────────────────────────────────────────

    async addComment(instanceId: string, userId: string, comment: string, stepId?: string): Promise<ProcessComment> {
        const { data, error } = await supabase
            .from('process_comments')
            .insert({ process_instance_id: instanceId, step_id: stepId ?? null, user_id: userId, comment })
            .select()
            .single();
        if (error) {
            console.error('[processService] addComment:', error);
            throw new Error(`Erro ao adicionar comentário: ${error.message}`);
        }
        return data as ProcessComment;
    },

    async listComments(instanceId: string): Promise<ProcessComment[]> {
        const { data, error } = await supabase
            .from('process_comments')
            .select('*')
            .eq('process_instance_id', instanceId)
            .order('created_at');
        if (error) {
            console.error('[processService] listComments:', error);
            throw new Error(`Erro ao carregar comentários: ${error.message}`);
        }
        return (data ?? []) as ProcessComment[];
    },
};
