import { supabase } from '../lib/supabase';
import { approvalService, type RoleLabels } from './approvalService';
import { avaliarCondicao } from '../utils/processCondition';
import { valorEfetivoDoItem } from '../utils/pedidoItemValor';
import type { PurchaseOrderItem } from '../types/supplyChain';
import type {
    ProcessTemplate, ProcessTemplateStep, ProcessInstance, ProcessInstanceStep,
    ProcessInstanceWithSteps, ProcessComment, ProcessInstanceStatus, PendingStepItem,
    ProcessPriority, ProcessCriticality, ProcessEventKey, ProcessStepBottleneck,
    ProcessConditionContext, ProcessAssignableMember, ProcessGroup,
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

/**
 * O que a instância sabe sobre si para avaliar condição de etapa (Passo 4 do
 * plano 2026-09-28): obra e fornecedor vêm da própria instância; o valor vem do
 * PEDIDO de origem, quando há (soma de `valorEfetivoDoItem`, a mesma régua da
 * alçada em `orderService.submitForApproval`). Sem pedido, `amount` fica null e
 * a etapa cai no `step.amount` (etapa monetária avulsa) — ou executa, se nem
 * isso houver: condição nunca pula por falta de dado.
 */
async function contextoDaInstancia(instanceId: string): Promise<ProcessConditionContext> {
    const { data: inst } = await supabase
        .from('process_instances')
        .select('project_id, supplier_id, purchase_order_id')
        .eq('id', instanceId)
        .maybeSingle();
    let amount: number | null = null;
    if (inst?.purchase_order_id) {
        const { data: po } = await supabase
            .from('purchase_orders')
            .select('items')
            .eq('id', inst.purchase_order_id)
            .maybeSingle();
        const items = (po?.items as PurchaseOrderItem[] | null) ?? null;
        if (items) amount = items.reduce((s, i) => s + valorEfetivoDoItem(i), 0);
    }
    return { project_id: inst?.project_id ?? null, supplier_id: inst?.supplier_id ?? null, amount };
}

type EtapaParaAvancar = Pick<ProcessInstanceStep, 'id' | 'status' | 'step_type' | 'order_index' | 'template_step_id' | 'condition' | 'amount'>;

/**
 * Avança a instância para a próxima etapa ELEGÍVEL (ou conclui se não houver
 * mais nenhuma). Etapa pendente cuja condição é falsa vira 'PULADO' com log
 * STEP_SKIPPED e o motor segue para a seguinte — é assim que "compra ≤ 5 mil
 * não passa pelo diretor" acontece sem gateway BPMN. O contexto é lido uma
 * vez por avanço, não por etapa.
 */
async function advanceToNextStep(instanceId: string, userId?: string): Promise<void> {
    const { data: steps, error } = await supabase
        .from('process_instance_steps')
        .select('id, status, step_type, order_index, template_step_id, condition, amount')
        .eq('process_instance_id', instanceId)
        .order('order_index', { ascending: true });
    if (error) {
        console.error('[processService] advanceToNextStep (fetch steps):', error);
        throw new Error(`Erro ao carregar etapas: ${error.message}`);
    }

    const pendentes = ((steps as EtapaParaAvancar[]) ?? []).filter(s => s.status === 'PENDENTE');
    let next: EtapaParaAvancar | undefined;
    if (pendentes.length > 0) {
        const ctx = pendentes.some(s => s.condition) ? await contextoDaInstancia(instanceId) : {};
        for (const s of pendentes) {
            if (avaliarCondicao(s.condition, { ...ctx, amount: ctx.amount ?? s.amount ?? null })) { next = s; break; }
            const { error: skipErr } = await supabase
                .from('process_instance_steps')
                .update({ status: 'PULADO', completed_at: new Date().toISOString() })
                .eq('id', s.id);
            if (skipErr) {
                console.error('[processService] advanceToNextStep (skip):', skipErr);
                throw new Error(`Erro ao pular etapa: ${skipErr.message}`);
            }
            await logAction(instanceId, userId, 'STEP_SKIPPED', { metadata: { step_id: s.id, condition: s.condition } });
        }
    }

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
        .select('default_responsible_type, default_responsible_id, sla_hours')
        .eq('id', next.template_step_id)
        .maybeSingle();
    const responsibleUserId = templateStep?.default_responsible_type === 'USER'
        ? templateStep.default_responsible_id
        : null;

    // O prazo da etapa nasce AQUI, quando ela começa — não no início da
    // instância. Antes, `startInstance` calculava `due_at` de todas as etapas
    // de uma vez, e a etapa 1 (SLA 24h) vencia antes da etapa 0 (SLA 48h) que
    // a precedia (medido na instância do Passo 1.2, 28/09/2026).
    const agora = new Date();
    const dueAt = templateStep?.sla_hours
        ? new Date(agora.getTime() + Number(templateStep.sla_hours) * 3_600_000).toISOString()
        : null;

    const { error: stepErr } = await supabase
        .from('process_instance_steps')
        .update({
            status: 'EM_ANDAMENTO',
            started_at: agora.toISOString(),
            due_at: dueAt,
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

    async listTemplates(organizationId: string | null): Promise<ProcessTemplate[]> {
        let q = supabase
            .from('process_templates')
            .select('*')
            .neq('status', 'ARQUIVADO')
            .order('name');
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q;
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

    async listInstances(organizationId: string | null, filters?: { status?: ProcessInstanceStatus }): Promise<(ProcessInstance & { template_name?: string })[]> {
        let q = supabase
            .from('process_instances')
            .select('*, process_templates(name)')
            .order('started_at', { ascending: false });
        if (organizationId) q = q.eq('organization_id', organizationId);
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

        // Todas nascem PENDENTE, com a condição copiada do template (snapshot —
        // mudar o template depois não muda esta instância). Quem escolhe a
        // primeira etapa a rodar é `advanceToNextStep`: assim a 1ª etapa também
        // respeita condição, e o prazo (`due_at`) nasce quando ela começa.
        const stepRows = templateSteps.map(ts => ({
            process_instance_id: instance.id,
            template_step_id: ts.id,
            name: ts.name,
            step_type: ts.step_type,
            order_index: ts.order_index,
            status: 'PENDENTE',
            responsible_user_id: ts.default_responsible_type === 'USER' ? ts.default_responsible_id : null,
            // F3.2: o responsável do template vai junto (pessoa OU grupo). Grupo não
            // preenche responsible_user_id — um membro assume depois (claimStep).
            responsible_type: ts.default_responsible_type ?? null,
            responsible_ref_id: ts.default_responsible_id ?? null,
            condition: ts.condition ?? null,
            // F3: escalonamento também é snapshot — mudar o template não muda a instância em curso.
            escalation_user_id: ts.escalation_user_id ?? null,
            escalation_after_hours: ts.escalation_after_hours ?? null,
        }));
        const { error: stepsErr } = await supabase
            .from('process_instance_steps')
            .insert(stepRows);
        if (stepsErr) {
            console.error('[processService] startInstance (steps):', stepsErr);
            throw new Error(`Erro ao criar etapas do processo: ${stepsErr.message}`);
        }

        await logAction(instance.id, opts.requesterUserId, 'INSTANCE_STARTED', { metadata: { template_id: opts.templateId } });
        await advanceToNextStep(instance.id, opts.requesterUserId);

        return this.getInstance(instance.id);
    },

    // ── F3 — bloqueio manual ─────────────────────────────────────
    // Parada declarada: o sweep de SLA (`fn_process_sla_sweep`) ignora instância
    // BLOQUEADO, e desbloquear devolve o status que ela tinha.

    async blockInstance(id: string, userId: string, reason: string): Promise<void> {
        const motivo = reason.trim();
        if (!motivo) throw new Error('Informe o motivo do bloqueio.');
        const { data: inst, error: fErr } = await supabase
            .from('process_instances')
            .select('status')
            .eq('id', id)
            .single();
        if (fErr) throw new Error(`Erro ao carregar processo: ${fErr.message}`);
        const anterior = (inst as { status: ProcessInstanceStatus }).status;
        if (['CONCLUIDO', 'CANCELADO', 'BLOQUEADO'].includes(anterior)) {
            throw new Error(`Processo em ${anterior} não pode ser bloqueado.`);
        }
        const { error } = await supabase
            .from('process_instances')
            .update({ status: 'BLOQUEADO' as ProcessInstanceStatus, status_before_block: anterior, blocked_reason: motivo })
            .eq('id', id);
        if (error) throw new Error(`Erro ao bloquear processo: ${error.message}`);
        await logAction(id, userId, 'INSTANCE_BLOCKED', { old_value: anterior, new_value: 'BLOQUEADO', metadata: { reason: motivo } });
    },

    async unblockInstance(id: string, userId: string): Promise<void> {
        const { data: inst, error: fErr } = await supabase
            .from('process_instances')
            .select('status, status_before_block, current_step_id')
            .eq('id', id)
            .single();
        if (fErr) throw new Error(`Erro ao carregar processo: ${fErr.message}`);
        const row = inst as { status: ProcessInstanceStatus; status_before_block: ProcessInstanceStatus | null; current_step_id: string | null };
        if (row.status !== 'BLOQUEADO') throw new Error('Processo não está bloqueado.');
        // Volta ao que era; se o anterior já era ATRASADO ou não foi guardado,
        // recalcula pela etapa atual (o sweep marca de novo se ainda estiver vencida).
        let volta: ProcessInstanceStatus = row.status_before_block && row.status_before_block !== 'ATRASADO'
            ? row.status_before_block
            : 'AGUARDANDO_RESPONSAVEL';
        if (!row.status_before_block || row.status_before_block === 'ATRASADO') {
            const { data: step } = await supabase
                .from('process_instance_steps')
                .select('step_type, responsible_user_id')
                .eq('id', row.current_step_id ?? '')
                .maybeSingle();
            if (step?.responsible_user_id) volta = WAITING_STATUS_BY_STEP_TYPE[(step as { step_type: ProcessInstanceStep['step_type'] }).step_type];
        }
        const { error } = await supabase
            .from('process_instances')
            .update({ status: volta, status_before_block: null, blocked_reason: null })
            .eq('id', id);
        if (error) throw new Error(`Erro ao desbloquear processo: ${error.message}`);
        await logAction(id, userId, 'INSTANCE_UNBLOCKED', { old_value: 'BLOQUEADO', new_value: volta });
    },

    /**
     * Membros da organização para o seletor de responsável/escalado. Quem não
     * tem `user_id` (convite por e-mail nunca vinculado) vem com `userId: null`
     * — a UI mostra desabilitado, com o motivo, em vez de esconder.
     */
    async listAssignableMembers(organizationId: string): Promise<ProcessAssignableMember[]> {
        const { data, error } = await supabase
            .from('organization_members')
            .select('user_id, name, email')
            .eq('organization_id', organizationId)
            .order('name');
        if (error) {
            console.error('[processService] listAssignableMembers:', error);
            throw new Error(`Erro ao carregar membros: ${error.message}`);
        }
        return ((data ?? []) as { user_id: string | null; name: string | null; email: string }[])
            .map(m => ({ userId: m.user_id, name: m.name || m.email, email: m.email }));
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

    /**
     * Dispara um evento A PARTIR DO PEDIDO: lê `purchase_orders`, resolve a
     * organização com a mesma regra do gancho de `orderService` (a coluna do
     * pedido primeiro; `companies.org_id` só para pedido antigo sem ela — ver
     * docs/planos/2026-09-28-torre-p2p-processos.md, Passo 1.1) e delega a
     * `triggerEvent`. É o resolvedor único do Passo 3: `approveOrder`,
     * `nfeService`, `receiptService`, `payableService` e a conciliação chamam
     * isto em vez de cada um repetir a leitura do pedido. Best-effort: nunca
     * lança — quem chama está no meio de uma gravação que não pode cair por
     * causa do motor.
     */
    async triggerPurchaseOrderEvent(
        purchaseOrderId: string,
        eventKey: ProcessEventKey,
        opts: { titleSuffix?: string } = {},
    ): Promise<void> {
        try {
            const { data: po, error } = await supabase
                .from('purchase_orders')
                .select('id, number, organization_id, empresa_id, project_id, supplier_id')
                .eq('id', purchaseOrderId)
                .maybeSingle();
            if (error || !po) {
                if (error) console.error('[processService] triggerPurchaseOrderEvent (pedido):', error);
                return;
            }
            const orgId = po.organization_id
                ?? (po.empresa_id
                    ? (await supabase.from('companies').select('org_id').eq('id', po.empresa_id).maybeSingle()).data?.org_id
                    : null);
            if (!orgId) return;
            await this.triggerEvent(orgId, eventKey, {
                title: `Pedido ${po.number}${opts.titleSuffix ? ` — ${opts.titleSuffix}` : ''}`,
                purchaseOrderId: po.id,
                supplierId: po.supplier_id ?? undefined,
                projectId: po.project_id ?? undefined,
            });
        } catch (e) {
            console.error('[processService] triggerPurchaseOrderEvent:', e);
        }
    },

    /**
     * Dispara um evento A PARTIR DO TÍTULO (`internal_transactions`): só quando
     * é DEBIT com `purchase_order_id` — título fora do P2P (folha, tributo,
     * receita) não tem pedido e não gera processo. Best-effort, como o de cima.
     */
    async triggerForTransaction(internalTransactionId: string, eventKey: ProcessEventKey): Promise<void> {
        try {
            const { data: tx, error } = await supabase
                .from('internal_transactions')
                .select('id, direction, purchase_order_id')
                .eq('id', internalTransactionId)
                .maybeSingle();
            if (error || !tx) {
                if (error) console.error('[processService] triggerForTransaction (título):', error);
                return;
            }
            if (tx.direction !== 'DEBIT' || !tx.purchase_order_id) return;
            await this.triggerPurchaseOrderEvent(tx.purchase_order_id, eventKey, { titleSuffix: 'Pago' });
        } catch (e) {
            console.error('[processService] triggerForTransaction:', e);
        }
    },

    // ── Dashboard de gargalos (Fase 2) ───────────────────────────

    async getBottlenecks(organizationId: string | null): Promise<ProcessStepBottleneck[]> {
        const { data, error } = await supabase.rpc('fn_process_bottlenecks', { p_organization_id: organizationId || null });
        if (error) {
            console.error('[processService] getBottlenecks:', error);
            throw new Error(`Erro ao carregar gargalos: ${error.message}`);
        }
        return (data ?? []) as ProcessStepBottleneck[];
    },

    // ── Etapas — "assumir" e conclusão manual/validação ────────

    /**
     * "Assumir etapa" (F3.2). Até aqui esta função filtrava `status = 'PENDENTE'`
     * — mas a etapa atual está sempre EM_ANDAMENTO, então ela nunca agia sobre a
     * etapa que importa, e nenhuma tela a chamava; mesmo assim a F1 e o aviso de
     * escalonamento da F3 mandavam o usuário "assumir".
     *
     * Regras: etapa com responsável que não é o próprio usuário → recusa; etapa
     * de grupo → só membro do grupo; etapa sem responsável nenhum → qualquer
     * membro da org (a RLS já garante a org). A instância sai de
     * AGUARDANDO_RESPONSAVEL para o "aguardando" do tipo da etapa; ATRASADO fica
     * ATRASADO (o prazo não mudou).
     */
    async claimStep(stepId: string, instanceId: string, userId: string): Promise<void> {
        const { data: step, error: sErr } = await supabase
            .from('process_instance_steps')
            .select('id, status, step_type, responsible_user_id, responsible_type, responsible_ref_id')
            .eq('id', stepId)
            .single();
        if (sErr || !step) throw new Error(`Erro ao carregar etapa: ${sErr?.message ?? 'não encontrada'}`);
        const s = step as Pick<ProcessInstanceStep, 'id' | 'status' | 'step_type' | 'responsible_user_id' | 'responsible_type' | 'responsible_ref_id'>;

        if (!['EM_ANDAMENTO', 'PENDENTE'].includes(s.status)) throw new Error('Esta etapa não está aberta.');
        if (s.responsible_user_id === userId) return;
        if (s.responsible_user_id) throw new Error('Esta etapa já foi assumida por outra pessoa.');
        if (s.responsible_type === 'DEPARTMENT' || s.responsible_type === 'ROLE') {
            const { data: membro } = await supabase
                .from('process_group_members')
                .select('id')
                .eq('group_type', s.responsible_type)
                .eq('group_id', s.responsible_ref_id ?? '')
                .eq('user_id', userId)
                .maybeSingle();
            if (!membro) throw new Error('Só quem é do departamento/cargo desta etapa pode assumi-la.');
        }

        const { error } = await supabase
            .from('process_instance_steps')
            .update({ responsible_user_id: userId })
            .eq('id', stepId);
        if (error) {
            console.error('[processService] claimStep:', error);
            throw new Error(`Erro ao assumir etapa: ${error.message}`);
        }
        const { data: inst } = await supabase.from('process_instances').select('status').eq('id', instanceId).maybeSingle();
        if (inst?.status === 'AGUARDANDO_RESPONSAVEL') {
            await supabase.from('process_instances')
                .update({ status: WAITING_STATUS_BY_STEP_TYPE[s.step_type] })
                .eq('id', instanceId);
        }
        await logAction(instanceId, userId, 'STEP_CLAIMED', { metadata: { step_id: stepId, via: s.responsible_type ?? null } });
    },

    // ── F3.2 — grupos (departamento/cargo) como responsável ─────

    /**
     * Departamentos e cargos das empresas da organização, com os membros
     * marcados. Org nula ("Todas") = das orgs do usuário (a RLS recorta).
     */
    async listGroups(organizationId: string | null): Promise<ProcessGroup[]> {
        let cq = supabase.from('companies').select('id, org_id, nome_fantasia, razao_social');
        if (organizationId) cq = cq.eq('org_id', organizationId);
        const { data: companies, error: cErr } = await cq;
        if (cErr) throw new Error(`Erro ao carregar empresas: ${cErr.message}`);
        const empresas = (companies ?? []) as { id: string; org_id: string; nome_fantasia: string | null; razao_social: string | null }[];
        if (empresas.length === 0) return [];
        const ids = empresas.map(c => c.id);
        const porEmpresa = new Map(empresas.map(c => [c.id, c]));

        let mq = supabase.from('process_group_members').select('group_type, group_id, user_id');
        if (organizationId) mq = mq.eq('organization_id', organizationId);
        const [deps, roles, membros] = await Promise.all([
            supabase.from('company_departments').select('id, company_id, nome').in('company_id', ids).eq('ativo', true),
            supabase.from('org_roles').select('id, company_id, nome').in('company_id', ids),
            mq,
        ]);
        if (deps.error) throw new Error(`Erro ao carregar departamentos: ${deps.error.message}`);
        if (roles.error) throw new Error(`Erro ao carregar cargos: ${roles.error.message}`);
        if (membros.error) throw new Error(`Erro ao carregar membros dos grupos: ${membros.error.message}`);

        const membrosDe = new Map<string, string[]>();
        for (const m of (membros.data ?? []) as { group_type: string; group_id: string; user_id: string }[]) {
            const k = `${m.group_type}:${m.group_id}`;
            membrosDe.set(k, [...(membrosDe.get(k) ?? []), m.user_id]);
        }
        const montar = (type: ProcessGroup['type']) => (r: { id: string; company_id: string; nome: string }): ProcessGroup => {
            const c = porEmpresa.get(r.company_id);
            return {
                type, id: r.id, name: r.nome,
                organizationId: c?.org_id ?? '',
                companyName: c?.nome_fantasia || c?.razao_social || '',
                memberUserIds: membrosDe.get(`${type}:${r.id}`) ?? [],
            };
        };
        return [
            ...((deps.data ?? []) as { id: string; company_id: string; nome: string }[]).map(montar('DEPARTMENT')),
            ...((roles.data ?? []) as { id: string; company_id: string; nome: string }[]).map(montar('ROLE')),
        ].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, 'pt-BR'));
    },

    /** Grava quem é do grupo: insere os novos, remove os que saíram (diff). */
    async setGroupMembers(
        group: Pick<ProcessGroup, 'type' | 'id' | 'organizationId'>,
        userIds: string[],
        createdBy: string,
    ): Promise<void> {
        const { data: atuais, error } = await supabase
            .from('process_group_members')
            .select('id, user_id')
            .eq('organization_id', group.organizationId)
            .eq('group_type', group.type)
            .eq('group_id', group.id);
        if (error) throw new Error(`Erro ao carregar membros do grupo: ${error.message}`);
        const existentes = (atuais ?? []) as { id: string; user_id: string }[];
        const novos = userIds.filter(u => !existentes.some(e => e.user_id === u));
        const sair = existentes.filter(e => !userIds.includes(e.user_id)).map(e => e.id);

        if (novos.length > 0) {
            const { error: iErr } = await supabase.from('process_group_members').insert(novos.map(user_id => ({
                organization_id: group.organizationId, group_type: group.type, group_id: group.id, user_id, created_by: createdBy,
            })));
            if (iErr) throw new Error(`Erro ao incluir membros: ${iErr.message}`);
        }
        if (sair.length > 0) {
            const { error: dErr } = await supabase.from('process_group_members').delete().in('id', sair);
            if (dErr) throw new Error(`Erro ao remover membros: ${dErr.message}`);
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
        /* `semFaixa` depende de a etapa TER valor, e por isso é decidido aqui e
           não no `approvalService` (ver a explicação longa lá).
           A etapa chega com `step.amount ?? 0` (ProcessosModule:228), e o zero
           tem dois significados diferentes:

             amount > 0  etapa monetária. "Fora de faixa" quer dizer ABAIXO DO
                         PISO da alçada — mesma leitura de título/contrato/
                         pedido, então dispensa aprovação.
             amount = 0  etapa NÃO monetária ("Aprovação do jurídico",
                         "Validação do RH"). "Fora de faixa" não quer dizer
                         barato: quer dizer que a pergunta sobre valor não se
                         aplica. E alguém modelou o processo dizendo que ali
                         PRECISA de aprovação — liberar sozinho faria o portão
                         se autoaprovar e a instância ficar AGUARDANDO_APROVACAO
                         sem nunca ter esperado ninguém. */
        await approvalService.submit('process_step', stepId, {}, {
            organizationId,
            amount,
            semFaixa: amount > 0 ? 'liberar' : 'exigir1',
        });
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

    /**
     * Etapas com o usuário: as dele (responsible_user_id) + as dos grupos dele
     * que ninguém assumiu ainda (F3.2) — só a etapa ATUAL do grupo
     * (EM_ANDAMENTO), porque a pendente futura ainda não é trabalho de ninguém.
     */
    async listMyPendingSteps(organizationId: string | null, userId: string): Promise<PendingStepItem[]> {
        let q = supabase
            .from('process_instance_steps')
            .select('*, process_instances!inner(title, status, priority, organization_id)')
            .eq('responsible_user_id', userId)
            .in('status', ['PENDENTE', 'EM_ANDAMENTO']);
        if (organizationId) q = q.eq('process_instances.organization_id', organizationId);
        const { data, error } = await q;
        if (error) {
            console.error('[processService] listMyPendingSteps:', error);
            throw new Error(`Erro ao carregar pendências: ${error.message}`);
        }
        const mapear = (r: any, via_group: string | null = null): PendingStepItem => ({
            ...r,
            instance_title: r.process_instances.title,
            instance_status: r.process_instances.status,
            instance_priority: r.process_instances.priority,
            via_group,
        });
        const minhas = (data ?? []).map((r: any) => mapear(r));

        // Grupos do usuário → etapas de grupo sem ninguém assumido.
        const { data: grupos } = await supabase
            .from('process_group_members')
            .select('group_type, group_id')
            .eq('user_id', userId);
        const refs = ((grupos ?? []) as { group_type: string; group_id: string }[]).map(g => g.group_id);
        if (refs.length === 0) return minhas;

        let gq = supabase
            .from('process_instance_steps')
            .select('*, process_instances!inner(title, status, priority, organization_id)')
            .is('responsible_user_id', null)
            .in('responsible_type', ['DEPARTMENT', 'ROLE'])
            .in('responsible_ref_id', refs)
            .eq('status', 'EM_ANDAMENTO');
        if (organizationId) gq = gq.eq('process_instances.organization_id', organizationId);
        const { data: doGrupo, error: gErr } = await gq;
        if (gErr) {
            console.error('[processService] listMyPendingSteps (grupos):', gErr);
            return minhas; // a fila pessoal não cai por causa da de grupo
        }
        const linhas = (doGrupo ?? []) as any[];
        if (linhas.length === 0) return minhas;

        // Nome do grupo para o "via …": uma consulta por tipo presente.
        const nomes = new Map<string, string>();
        const deps = linhas.filter(l => l.responsible_type === 'DEPARTMENT').map(l => l.responsible_ref_id);
        const roles = linhas.filter(l => l.responsible_type === 'ROLE').map(l => l.responsible_ref_id);
        const [d, r] = await Promise.all([
            deps.length ? supabase.from('company_departments').select('id, nome').in('id', deps) : Promise.resolve({ data: [] as any[] }),
            roles.length ? supabase.from('org_roles').select('id, nome').in('id', roles) : Promise.resolve({ data: [] as any[] }),
        ]);
        for (const x of [...((d.data ?? []) as any[]), ...((r.data ?? []) as any[])]) nomes.set(x.id, x.nome);

        return [...minhas, ...linhas.map(l => mapear(l, nomes.get(l.responsible_ref_id) ?? 'seu grupo'))];
    },

    /** Aprovações de etapa pendentes (fila própria — fn_approval_action_queue ainda não cobre 'process_step'). */
    async listMyPendingApprovals(organizationId: string | null): Promise<PendingStepItem[]> {
        let q = supabase
            .from('process_instance_steps')
            .select('*, process_instances!inner(title, status, priority, organization_id)')
            .eq('step_type', 'approval')
            .eq('approval_status', 'PENDENTE');
        if (organizationId) q = q.eq('process_instances.organization_id', organizationId);
        const { data, error } = await q;
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
