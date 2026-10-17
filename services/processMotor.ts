/**
 * Motor de Processos — a parte que ABRE processo a partir de um evento.
 *
 * Saiu de `processService.ts` em 16/10/2026 (plano
 * docs/planos/2026-10-16-torre-fluxo-financeiro.md, seção G) para rodar em DOIS
 * lugares com o MESMO código: no navegador (o `processService` delega para cá)
 * e nas Edge Functions que baixam título sem navegador — a conciliação por CRON
 * (`reconciliation-engine`) e o webhook do Asaas (`asaas-webhook`). Antes disso
 * essas baixas não abriam processo nenhum.
 *
 * Mesmo molde de `utils/reconciliationRules.ts`: nada aqui importa o cliente do
 * Supabase — quem chama passa o seu (`criarMotor(db)`): o do navegador, com a
 * sessão do usuário; o da Edge Function, com a service role. Os imports são só
 * módulos puros e tipos, que o Deno, o Vite e o Vitest carregam igual — e TODOS
 * com a extensão `.ts` explícita (aqui e na cadeia: `pedidoItemValor`,
 * `processCondition`, `types/supplyChain`): o Deno não resolve import sem
 * extensão, e o deploy da Edge Function cairia na hora.
 *
 * Os métodos se chamam por `this` de propósito: o `processService` espalha este
 * objeto dentro dele, então `this.triggerEvent` é o do `processService` — o que
 * os testes espionam — e `this.startInstance` é o invólucro que devolve a
 * instância inteira. Numa Edge Function, `this` é o próprio motor.
 *
 * Corpos MOVIDOS por script (scratchpad extrair_motor.py), não redigitados.
 */
import { avaliarCondicao } from '../utils/processCondition.ts';
import { valorEfetivoDoItem } from '../utils/pedidoItemValor.ts';
import type { PurchaseOrderItem } from '../types/supplyChain.ts';
import type {
    ProcessTemplate, ProcessTemplateStep, ProcessInstanceStep, ProcessInstanceStatus,
    ProcessPriority, ProcessEventKey, ProcessConditionContext,
} from '../types/process.ts';

/**
 * O mínimo do cliente do Supabase que o motor usa. Estrutural de propósito: o
 * Deno não resolve `@supabase/supabase-js` daqui, e o motor não precisa do tipo
 * inteiro — só de `from(...)` encadeável.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ClienteDoBanco = { from: (tabela: string) => any };

type EtapaParaAvancar = Pick<ProcessInstanceStep, 'id' | 'status' | 'step_type' | 'order_index' | 'template_step_id' | 'condition' | 'amount' | 'responsible_user_id' | 'sla_hours'>;

/** Opções para abrir uma instância (as mesmas de `processService.startInstance`). */
export interface OpcoesDeInicio {
    organizationId: string;
    templateId: string;
    title: string;
    description?: string;
    requesterUserId?: string;
    priority?: ProcessPriority;
    dueAt?: string;
    projectId?: string;
    supplierId?: string;
    clientId?: string;
    contractId?: string;
    purchaseOrderId?: string;
    internalTransactionId?: string;
    boletoId?: string;
}

/** Mapeia o tipo da próxima etapa para o status "aguardando X" da instância. */
export const WAITING_STATUS_BY_STEP_TYPE: Record<ProcessInstanceStep['step_type'], ProcessInstanceStatus> = {
    approval:   'AGUARDANDO_APROVACAO',
    document:   'AGUARDANDO_DOCUMENTO',
    task:       'AGUARDANDO_RESPONSAVEL',
    validation: 'EM_ANDAMENTO',
    manual:     'EM_ANDAMENTO',
};

export function criarMotor(db: ClienteDoBanco) {

    async function logAction(
        instanceId: string,
        userId: string | undefined,
        action: string,
        extra: { old_value?: unknown; new_value?: unknown; metadata?: Record<string, unknown> } = {},
    ): Promise<void> {
        const { error } = await db.from('process_audit_logs').insert({
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
        const { data: inst } = await db
            .from('process_instances')
            .select('project_id, supplier_id, purchase_order_id')
            .eq('id', instanceId)
            .maybeSingle();
        let amount: number | null = null;
        if (inst?.purchase_order_id) {
            const { data: po } = await db
                .from('purchase_orders')
                .select('items')
                .eq('id', inst.purchase_order_id)
                .maybeSingle();
            const items = (po?.items as PurchaseOrderItem[] | null) ?? null;
            if (items) amount = items.reduce((s, i) => s + valorEfetivoDoItem(i), 0);
        }
        return { project_id: inst?.project_id ?? null, supplier_id: inst?.supplier_id ?? null, amount };
    }

    /**
     * Avança a instância para a próxima etapa ELEGÍVEL (ou conclui se não houver
     * mais nenhuma). Etapa pendente cuja condição é falsa vira 'PULADO' com log
     * STEP_SKIPPED e o motor segue para a seguinte — é assim que "compra ≤ 5 mil
     * não passa pelo diretor" acontece sem gateway BPMN. O contexto é lido uma
     * vez por avanço, não por etapa.
     */
    async function advanceToNextStep(instanceId: string, userId?: string): Promise<void> {
        const { data: steps, error } = await db
            .from('process_instance_steps')
            .select('id, status, step_type, order_index, template_step_id, condition, amount, responsible_user_id, sla_hours')
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
                const { error: skipErr } = await db
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
            const { error: doneErr } = await db
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

        // Responsável e SLA vêm da PRÓPRIA etapa da instância (cópia feita em
        // `startInstance`), não do modelo: desde 04/10/2026 o modelo pode ser
        // editado, e editar não pode mudar processo em curso. Pessoa já vem em
        // `responsible_user_id`; grupo (DEPARTMENT/ROLE) fica sem — um membro assume.
        const responsibleUserId = next.responsible_user_id ?? null;

        // O prazo da etapa nasce AQUI, quando ela começa — não no início da
        // instância. Antes, `startInstance` calculava `due_at` de todas as etapas
        // de uma vez, e a etapa 1 (SLA 24h) vencia antes da etapa 0 (SLA 48h) que
        // a precedia (medido na instância do Passo 1.2, 28/09/2026).
        const agora = new Date();
        const dueAt = next.sla_hours
            ? new Date(agora.getTime() + Number(next.sla_hours) * 3_600_000).toISOString()
            : null;

        const { error: stepErr } = await db
            .from('process_instance_steps')
            .update({
                status: 'EM_ANDAMENTO',
                started_at: agora.toISOString(),
                due_at: dueAt,
            })
            .eq('id', next.id);
        if (stepErr) {
            console.error('[processService] advanceToNextStep (start next):', stepErr);
            throw new Error(`Erro ao iniciar próxima etapa: ${stepErr.message}`);
        }

        const { error: instErr } = await db
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

    async function etapasDoModelo(templateId: string): Promise<ProcessTemplateStep[]> {
        const { data, error } = await db
            .from('process_template_steps')
            .select('*')
            .eq('process_template_id', templateId)
            .order('order_index');
        if (error) {
            console.error('[processMotor] etapasDoModelo:', error);
            throw new Error(`Erro ao carregar etapas do template: ${error.message}`);
        }
        return (data ?? []) as ProcessTemplateStep[];
    }

    const metodos = {
        /** Cria a instância a partir do template (snapshot de versão + etapas) e inicia a 1ª etapa. */
        async startInstance(opts: OpcoesDeInicio): Promise<{ id: string }> {
            const { data: template, error: tplErr } = await db
                .from('process_templates')
                .select('*')
                .eq('id', opts.templateId)
                .single();
            if (tplErr) {
                console.error('[processService] startInstance (template):', tplErr);
                throw new Error(`Erro ao carregar template: ${tplErr.message}`);
            }
            const templateSteps = await etapasDoModelo(opts.templateId);
            if (templateSteps.length === 0) {
                throw new Error('Template sem etapas configuradas.');
            }

            const { data: instance, error } = await db
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
                    // Só vão no INSERT quando existem: as colunas nasceram em
                    // `aplicar_20271016400000_processos_vinculo_titulo.sql`, e mandar
                    // `null` numa coluna que o banco ainda não tem derruba TODO
                    // processo (inclusive os do P2P) com PGRST204.
                    ...(opts.internalTransactionId ? { internal_transaction_id: opts.internalTransactionId } : {}),
                    ...(opts.boletoId ? { boleto_id: opts.boletoId } : {}),
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
                // 04/10/2026: o SLA também é cópia — editar o modelo não muda o prazo de processo em curso.
                sla_hours: ts.sla_hours ?? null,
            }));
            const { error: stepsErr } = await db
                .from('process_instance_steps')
                .insert(stepRows);
            if (stepsErr) {
                console.error('[processService] startInstance (steps):', stepsErr);
                throw new Error(`Erro ao criar etapas do processo: ${stepsErr.message}`);
            }

            await logAction(instance.id, opts.requesterUserId, 'INSTANCE_STARTED', { metadata: { template_id: opts.templateId } });
            await advanceToNextStep(instance.id, opts.requesterUserId);

            return { id: instance.id as string };
        },
        /**
         * Dispara todos os templates ATIVOS com trigger_type='EVENTO' cuja
         * trigger_event_key bate com `eventKey`. Idempotente por (template, PO):
         * não inicia de novo se já existir instância não-terminal para o mesmo
         * pedido — evita duplicar processo quando o status é regravado.
         */
        async triggerEvent(
            organizationId: string,
            eventKey: ProcessEventKey,
            ctx: {
                title: string; purchaseOrderId?: string; supplierId?: string; projectId?: string; contractId?: string; clientId?: string;
                internalTransactionId?: string; boletoId?: string;
            },
        ): Promise<void> {
            const { data: templates, error } = await db
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
                        const { data: existing } = await db
                            .from('process_instances')
                            .select('id')
                            .eq('process_template_id', template.id)
                            .eq('purchase_order_id', ctx.purchaseOrderId)
                            .not('status', 'in', '(CONCLUIDO,CANCELADO)')
                            .maybeSingle();
                        if (existing) continue; // já existe instância ativa para este pedido
                    } else if (ctx.internalTransactionId || ctx.boletoId) {
                        // Mesma idempotência, pelo título (ou boleto) — o título é
                        // regravado PAGO por mais de um caminho (painel, conciliação).
                        const [coluna, valor] = ctx.internalTransactionId
                            ? ['internal_transaction_id', ctx.internalTransactionId]
                            : ['boleto_id', ctx.boletoId!];
                        const { data: existing } = await db
                            .from('process_instances')
                            .select('id')
                            .eq('process_template_id', template.id)
                            .eq(coluna, valor)
                            .not('status', 'in', '(CONCLUIDO,CANCELADO)')
                            .maybeSingle();
                        if (existing) continue;
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
                        internalTransactionId: ctx.internalTransactionId,
                        boletoId: ctx.boletoId,
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
                const { data: po, error } = await db
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
                        ? (await db.from('companies').select('org_id').eq('id', po.empresa_id).maybeSingle()).data?.org_id
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
                const { data: tx, error } = await db
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
        /**
         * Dispara um evento financeiro A PARTIR DO TÍTULO, de qualquer origem.
         * `payable.*` só segue para DEBIT, `receivable.*` só para CREDIT — direção
         * errada é chamada errada, não processo. A organização é a DO TÍTULO; o
         * título vira o vínculo e a chave de idempotência da instância. Best-effort:
         * nunca lança — quem chama acabou de gravar uma baixa ou uma aprovação.
         */
        async triggerForFinancialTitle(
            internalTransactionId: string,
            eventKey: Extract<ProcessEventKey, 'payable.approved' | 'payable.settled' | 'receivable.settled'>,
        ): Promise<void> {
            try {
                const { data: tx, error } = await db
                    .from('internal_transactions')
                    .select('id, direction, organization_id, project_id, supplier_id, description')
                    .eq('id', internalTransactionId)
                    .maybeSingle();
                if (error || !tx) {
                    if (error) console.error('[processService] triggerForFinancialTitle (título):', error);
                    return;
                }
                const direcaoEsperada = eventKey.startsWith('receivable.') ? 'CREDIT' : 'DEBIT';
                if (tx.direction !== direcaoEsperada || !tx.organization_id) return;
                await this.triggerEvent(tx.organization_id, eventKey, {
                    title: tx.description || `Título ${String(tx.id).slice(0, 8)}`,
                    internalTransactionId: tx.id,
                    projectId: tx.project_id ?? undefined,
                    supplierId: tx.supplier_id ?? undefined,
                });
            } catch (e) {
                console.error('[processService] triggerForFinancialTitle:', e);
            }
        },
        /**
         * O título acabou de ser baixado (painel, conciliação): `payable.settled`
         * para DEBIT, `receivable.settled` para CREDIT. Uma leitura só para saber a
         * direção — quem chama (a conciliação) não sabe de que lado está o título.
         */
        async triggerSettlement(internalTransactionId: string): Promise<void> {
            try {
                const { data: tx, error } = await db
                    .from('internal_transactions')
                    .select('direction')
                    .eq('id', internalTransactionId)
                    .maybeSingle();
                if (error || !tx) {
                    if (error) console.error('[processService] triggerSettlement (título):', error);
                    return;
                }
                if (tx.direction === 'DEBIT') await this.triggerForFinancialTitle(internalTransactionId, 'payable.settled');
                else if (tx.direction === 'CREDIT') await this.triggerForFinancialTitle(internalTransactionId, 'receivable.settled');
            } catch (e) {
                console.error('[processService] triggerSettlement:', e);
            }
        },
        /**
         * Boleto aprovado: o título acabou de nascer dele. Organização e
         * fornecedor vêm do título (a mesma linha que o boleto acabou de criar);
         * o vínculo guarda os dois — boleto e título. Best-effort.
         */
        async triggerBoletoApproved(boletoId: string, internalTransactionId: string): Promise<void> {
            try {
                const { data: tx, error } = await db
                    .from('internal_transactions')
                    .select('id, organization_id, project_id, supplier_id, description')
                    .eq('id', internalTransactionId)
                    .maybeSingle();
                if (error || !tx) {
                    if (error) console.error('[processService] triggerBoletoApproved (título):', error);
                    return;
                }
                if (!tx.organization_id) return;
                await this.triggerEvent(tx.organization_id, 'boleto.approved', {
                    title: tx.description ? `Boleto — ${tx.description}` : `Boleto ${boletoId.slice(0, 8)}`,
                    internalTransactionId: tx.id,
                    boletoId,
                    projectId: tx.project_id ?? undefined,
                    supplierId: tx.supplier_id ?? undefined,
                });
            } catch (e) {
                console.error('[processService] triggerBoletoApproved:', e);
            }
        },
        // (seção movida de processService) Costura P2P — gatilho de evento ─────────────────────────
        //
        // O motor não sabe nada sobre "pedido de compra" ou "recebimento"; ele só
        // reage a uma chave de evento. Quem sabe que "Recebido" vira
        // 'purchase_order.received' é o orderService, que chama isto como efeito
        // colateral (mesmo padrão de financialService.syncOrderToFinance — best
        // effort, não deve derrubar a atualização do pedido).

    };

    return { logAction, contextoDaInstancia, advanceToNextStep, ...metodos };
}
