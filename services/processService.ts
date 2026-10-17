import { supabase } from '../lib/supabase';
import { approvalService, type RoleLabels } from './approvalService';
import { criarMotor, WAITING_STATUS_BY_STEP_TYPE, type OpcoesDeInicio } from './processMotor';
import { proximoNivelDeAprovacao } from '../utils/processApproval';
import type { ApprovalStep } from '../types/financial';
import type {
    ProcessTemplate, ProcessTemplateStep, ProcessInstance, ProcessInstanceStep,
    ProcessInstanceWithSteps, ProcessComment, ProcessInstanceStatus, PendingStepItem,
    ProcessPriority, ProcessCriticality, ProcessEventKey, ProcessStepBottleneck,
    ProcessConditionContext, ProcessAssignableMember, ProcessGroup,
    ProcessTemplateHeader, ProcessTemplateStepDraft,
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









/**
 * O que impede gravar um modelo. Modelo AUTOMÁTICO (EVENTO) precisa de evento e
 * de dono: é o dono que recebe o aviso quando uma etapa vence sem responsável
 * nem escalado. Medido em 04/10/2026: os 24 modelos automáticos não tinham dono,
 * e o primeiro processo real venceu sem ninguém saber.
 */
export function problemaDoModelo(h: ProcessTemplateHeader, etapas: ProcessTemplateStepDraft[]): string | null {
    if (!h.name.trim()) return 'Informe o nome do modelo.';
    if (etapas.length === 0) return 'O modelo precisa de pelo menos uma etapa.';
    const semNome = etapas.findIndex(e => !e.name.trim());
    if (semNome >= 0) return `Etapa ${semNome + 1}: informe o nome.`;
    if (h.trigger_type === 'EVENTO') {
        if (!h.trigger_event_key) return 'Modelo automático: escolha o evento que dispara o processo.';
        if (!h.owner_user_id) return 'Modelo automático: escolha o dono. Ele recebe o aviso quando uma etapa vence sem responsável.';
        if (h.trigger_min_amount != null && (!Number.isFinite(h.trigger_min_amount) || h.trigger_min_amount <= 0)) {
            return 'Valor mínimo: informe um valor maior que zero, ou deixe vazio para todo evento abrir processo.';
        }
    }
    return null;
}

/** Linha de `process_template_steps` a partir da etapa enviada pela tela. */
const linhaDaEtapa = (e: ProcessTemplateStepDraft, order_index: number) => ({
    name: e.name.trim(),
    step_type: e.step_type,
    order_index,
    is_required: true,
    requires_document: e.requires_document,
    can_skip: false,
    condition: e.condition ?? null,
    sla_hours: e.sla_hours ?? null,
    default_responsible_type: e.default_responsible_type ?? null,
    default_responsible_id: e.default_responsible_id ?? null,
    escalation_user_id: e.escalation_user_id ?? null,
    escalation_after_hours: e.escalation_user_id ? (e.escalation_after_hours ?? 0) : null,
});



/**
 * O motor de eventos mora em `processMotor.ts` (roda também nas Edge Functions);
 * aqui ele recebe o cliente do navegador. `logAction` e `advanceToNextStep`
 * continuam com os mesmos nomes para o resto deste arquivo.
 */
const motor = criarMotor(supabase);
const { logAction, advanceToNextStep, contextoDaInstancia } = motor;
// Só os métodos do objeto — as funções de apoio acima não entram no serviço público.
const { logAction: _l, contextoDaInstancia: _c, advanceToNextStep: _a, ...metodosDoMotor } = motor;

export const processService = {
    // Gatilhos por evento (triggerEvent, triggerPurchaseOrderEvent, triggerFor*, triggerSettlement,
    // triggerBoletoApproved) — ver processMotor.ts. Espalhados aqui: `this` neles é o processService.
    ...metodosDoMotor,

    /** Cria a instância a partir do template (snapshot de versão + etapas) e inicia a 1ª etapa. */
    async startInstance(opts: OpcoesDeInicio): Promise<ProcessInstanceWithSteps> {
        const { id } = await motor.startInstance(opts);
        return this.getInstance(id);
    },


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
        organizationId: string,
        header: ProcessTemplateHeader,
        steps: ProcessTemplateStepDraft[],
    ): Promise<ProcessTemplate> {
        const problema = problemaDoModelo(header, steps);
        if (problema) throw new Error(problema);
        const { data: created, error } = await supabase
            .from('process_templates')
            .insert({
                organization_id: organizationId,
                name: header.name.trim(),
                category: header.category?.trim() || null,
                owner_user_id: header.owner_user_id || null,
                trigger_type: header.trigger_type,
                trigger_event_key: header.trigger_type === 'EVENTO' ? header.trigger_event_key : null,
                // Valor mínimo só faz sentido em modelo automático; manual não tem evento com valor.
                trigger_min_amount: header.trigger_type === 'EVENTO' ? (header.trigger_min_amount ?? null) : null,
                criticality: 'MEDIA',
                status: 'ATIVO',
            })
            .select()
            .single();
        if (error) {
            console.error('[processService] createTemplate:', error);
            throw new Error(`Erro ao criar template: ${error.message}`);
        }

        const rows = steps.map((s, idx) => ({ ...linhaDaEtapa(s, idx), process_template_id: created.id }));
        const { error: stepsErr } = await supabase.from('process_template_steps').insert(rows);
        if (stepsErr) {
            console.error('[processService] createTemplate (steps):', stepsErr);
            throw new Error(`Erro ao criar etapas do template: ${stepsErr.message}`);
        }
        return created as ProcessTemplate;
    },

    /**
     * Edita o modelo: cabeçalho, etapas existentes (por `id`), etapas novas e
     * etapas removidas; sobe a versão. Processo em curso NÃO muda — a etapa da
     * instância é cópia (nome, tipo, condição, responsável, escalado e, desde
     * 04/10/2026, o SLA), e a FK para a etapa do modelo é ON DELETE SET NULL.
     * A versão sobe por último: ela só muda se as etapas gravaram.
     */
    async updateTemplate(
        templateId: string,
        header: ProcessTemplateHeader,
        steps: ProcessTemplateStepDraft[],
    ): Promise<void> {
        const problema = problemaDoModelo(header, steps);
        if (problema) throw new Error(problema);

        const { data: atual, error: fErr } = await supabase
            .from('process_templates')
            .select('version')
            .eq('id', templateId)
            .single();
        if (fErr) throw new Error(`Erro ao carregar modelo: ${fErr.message}`);
        const existentes = await this.getTemplateSteps(templateId);

        const mantidas = new Set(steps.map(s => s.id).filter((id): id is string => !!id));
        const removidas = existentes.filter(e => !mantidas.has(e.id)).map(e => e.id);
        if (removidas.length > 0) {
            const { error } = await supabase.from('process_template_steps').delete().in('id', removidas);
            if (error) throw new Error(`Erro ao remover etapas: ${error.message}`);
        }

        const conhecidas = new Set(existentes.map(e => e.id));
        const novas: ReturnType<typeof linhaDaEtapa>[] = [];
        for (const [idx, s] of steps.entries()) {
            const linha = linhaDaEtapa(s, idx);
            if (s.id && conhecidas.has(s.id)) {
                const { error } = await supabase.from('process_template_steps').update(linha).eq('id', s.id);
                if (error) throw new Error(`Erro ao atualizar a etapa ${idx + 1}: ${error.message}`);
            } else {
                novas.push(linha);
            }
        }
        if (novas.length > 0) {
            const { error } = await supabase.from('process_template_steps')
                .insert(novas.map(n => ({ ...n, process_template_id: templateId })));
            if (error) throw new Error(`Erro ao incluir etapas: ${error.message}`);
        }

        const { error: hErr } = await supabase
            .from('process_templates')
            .update({
                name: header.name.trim(),
                category: header.category?.trim() || null,
                owner_user_id: header.owner_user_id || null,
                trigger_type: header.trigger_type,
                trigger_event_key: header.trigger_type === 'EVENTO' ? header.trigger_event_key : null,
                // Valor mínimo só faz sentido em modelo automático; manual não tem evento com valor.
                trigger_min_amount: header.trigger_type === 'EVENTO' ? (header.trigger_min_amount ?? null) : null,
                version: Number((atual as { version: number }).version ?? 1) + 1,
                updated_at: new Date().toISOString(),
            })
            .eq('id', templateId);
        if (hErr) throw new Error(`Erro ao salvar modelo: ${hErr.message}`);
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

    /**
     * De onde a instância veio, para o detalhe mostrar "Origem" com link (17/10/2026,
     * item H.3 do plano 2026-10-16). Título → Contas a Pagar ou a Receber pela
     * DIREÇÃO (a mesma regra do motor); só boleto → Boletos a Pagar. Os destinos
     * já atendem `navigateToFocus` (CONTA_PAGAR / CONTA_RECEBER / BOLETO).
     * Nulo quando não há vínculo financeiro ou o registro não está visível (RLS).
     */
    async getOrigemFinanceira(inst: Pick<ProcessInstance, 'internal_transaction_id' | 'boleto_id'>): Promise<{
        rotulo: string; detalhe: string; view: string; ref: string; source: string;
    } | null> {
        const fmtValor = (v: unknown) => (v == null ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
        const fmtData = (d: unknown) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
        if (inst.internal_transaction_id) {
            const { data: tx } = await supabase
                .from('internal_transactions')
                .select('id, direction, description, amount, due_date')
                .eq('id', inst.internal_transaction_id)
                .maybeSingle();
            if (!tx) return null;
            const pagar = tx.direction === 'DEBIT';
            return {
                rotulo: pagar ? 'Título a pagar' : 'Título a receber',
                detalhe: [tx.description, fmtValor(tx.amount), tx.due_date ? `venc. ${fmtData(tx.due_date)}` : ''].filter(Boolean).join(' · '),
                view: pagar ? 'contas-a-pagar' : 'contas-a-receber',
                ref: tx.id,
                source: pagar ? 'CONTA_PAGAR' : 'CONTA_RECEBER',
            };
        }
        if (inst.boleto_id) {
            const { data: b } = await supabase
                .from('boletos')
                .select('id, beneficiario_nome, valor, vencimento')
                .eq('id', inst.boleto_id)
                .maybeSingle();
            if (!b) return null;
            return {
                rotulo: 'Boleto',
                detalhe: [b.beneficiario_nome, fmtValor(b.valor), b.vencimento ? `venc. ${fmtData(b.vencimento)}` : ''].filter(Boolean).join(' · '),
                view: 'boletos-pagar', ref: b.id, source: 'BOLETO',
            };
        }
        return null;
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




    // ── Costura Financeiro — gatilho de evento do título (16/10/2026) ───────
    //
    // Plano docs/planos/2026-10-16-torre-fluxo-financeiro.md, seção C. O
    // `internal_transaction.paid` acima continua SÓ de pedido: torná-lo
    // genérico faria os modelos já semeados em 3 organizações dispararem para
    // toda folha e tributo pago. O Financeiro tem chaves próprias.




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

    /**
     * Envia a etapa para a alçada. Organização e valor vêm DO PROCESSO, não da
     * tela (04/10/2026): a tela mandava a org do topo — vazia em "Todas" — e
     * `step.amount`, que nada preenchia (0 de 12 etapas). Resultado: a alçada
     * por valor nunca valia, e um pagamento de qualquer tamanho virava um clique.
     * O valor agora é o da etapa ou, se ela não tiver, o do pedido de origem
     * (`contextoDaInstancia`, mesma régua da alçada do pedido), e fica gravado
     * na etapa. Abaixo do piso da alçada a etapa é liberada: conclui e avança.
     */
    async submitStepApproval(stepId: string, instanceId: string): Promise<void> {
        const { data: inst, error: iErr } = await supabase
            .from('process_instances')
            .select('organization_id')
            .eq('id', instanceId)
            .single();
        if (iErr || !inst) throw new Error(`Erro ao carregar processo: ${iErr?.message ?? 'não encontrado'}`);
        const { data: etapa, error: sErr } = await supabase
            .from('process_instance_steps')
            .select('amount')
            .eq('id', stepId)
            .single();
        if (sErr) throw new Error(`Erro ao carregar etapa: ${sErr.message}`);

        let amount = Number((etapa as { amount: number | null } | null)?.amount ?? 0) || 0;
        if (amount <= 0) {
            const ctx = await contextoDaInstancia(instanceId);
            amount = Number(ctx.amount ?? 0) || 0;
            if (amount > 0) {
                const { error } = await supabase.from('process_instance_steps').update({ amount }).eq('id', stepId);
                if (error) throw new Error(`Erro ao gravar o valor da etapa: ${error.message}`);
            }
        }
        const organizationId = (inst as { organization_id: string }).organization_id;

        /* `semFaixa` depende de a etapa TER valor, e por isso é decidido aqui e
           não no `approvalService` (ver a explicação longa lá).
           O zero tem dois significados diferentes:

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
        const res = await approvalService.submit('process_step', stepId, {}, {
            organizationId,
            amount,
            semFaixa: amount > 0 ? 'liberar' : 'exigir1',
        });

        // Abaixo do piso: a alçada liberou sem fila. Antes este caminho deixava a
        // etapa APROVADO mas EM_ANDAMENTO, sem botão que a movesse.
        if ((res as { approval_status?: string } | null)?.approval_status === 'APROVADO') {
            const { error } = await supabase.from('process_instance_steps')
                .update({ status: 'CONCLUIDO', completed_at: new Date().toISOString() })
                .eq('id', stepId);
            if (error) throw new Error(`Erro ao concluir etapa liberada: ${error.message}`);
            await logAction(instanceId, undefined, 'APPROVAL_RELEASED', { metadata: { step_id: stepId, amount, motivo: 'abaixo do piso da alçada' } });
            await advanceToNextStep(instanceId);
            return;
        }

        await supabase.from('process_instances').update({ status: 'AGUARDANDO_APROVACAO' as ProcessInstanceStatus }).eq('id', instanceId);
        await logAction(instanceId, undefined, 'APPROVAL_SUBMITTED', { metadata: { step_id: stepId, amount } });
    },

    /**
     * Aprova o PRÓXIMO nível da etapa — quem decide o nível é a etapa, não a
     * tela (04/10/2026: a tela mandava sempre o nível 1, e numa alçada de 2
     * níveis a etapa nunca concluía). O nível 2 exige pessoa diferente da que
     * aprovou o nível 1. Os rótulos (Gestor/Diretoria) vêm da faixa da alçada.
     */
    async approveStep(stepId: string, instanceId: string, approvedBy: string, notes?: string): Promise<void> {
        const { data: etapa, error: sErr } = await supabase
            .from('process_instance_steps')
            .select('approval_status, approval_required_levels, approval_chain, amount')
            .eq('id', stepId)
            .single();
        if (sErr || !etapa) throw new Error(`Erro ao carregar etapa: ${sErr?.message ?? 'não encontrada'}`);
        const e = etapa as { approval_status: string; approval_required_levels: number | null; approval_chain: ApprovalStep[] | null; amount: number | null };
        const nivel = proximoNivelDeAprovacao(e, approvedBy);
        if (!nivel.pode) throw new Error(nivel.motivo);

        const { data: inst } = await supabase.from('process_instances').select('organization_id').eq('id', instanceId).maybeSingle();
        const faixa = inst?.organization_id
            ? await approvalService.resolveRequiredLevels(inst.organization_id, Number(e.amount ?? 0) || 0).catch(() => null)
            : null;
        const labels: RoleLabels = {
            level1_label: faixa?.level1_label || 'Gestor',
            level2_label: faixa?.level2_label || 'Diretoria',
        };

        const result = await approvalService.approve('process_step', stepId, nivel.level, approvedBy, labels, notes, {
            status: 'CONCLUIDO',
            completed_at: new Date().toISOString(),
        });
        await logAction(instanceId, approvedBy, 'STEP_APPROVED', { metadata: { step_id: stepId, level: nivel.level, exigidos: nivel.exigidos } });
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
     *
     * O embed nomeia a FK (`process_instance_steps_process_instance_id_fkey`): há duas relações
     * entre as tabelas (a etapa → seu processo; `process_instances.current_step_id` → a etapa atual)
     * e, sem o nome, o PostgREST recusa com PGRST201 — "Pendente Comigo" não carregava (10/10/2026).
     */
    async listMyPendingSteps(organizationId: string | null, userId: string): Promise<PendingStepItem[]> {
        let q = supabase
            .from('process_instance_steps')
            .select('*, process_instances!process_instance_steps_process_instance_id_fkey!inner(title, status, priority, organization_id)')
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
            .select('*, process_instances!process_instance_steps_process_instance_id_fkey!inner(title, status, priority, organization_id)')
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
            .select('*, process_instances!process_instance_steps_process_instance_id_fkey!inner(title, status, priority, organization_id)')
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
