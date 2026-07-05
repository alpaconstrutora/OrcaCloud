// Módulo ÒPURA Processos — tipos do motor de orquestração template→instância→etapa.
// A etapa é polimórfica por step_type e DELEGA para approvalService/taskService/
// documentService (ver PLANO_MODULO_PROCESSOS.md). Nada aqui reimplementa aprovação,
// tarefa ou documento.

export type ProcessTemplateStatus = 'RASCUNHO' | 'ATIVO' | 'INATIVO' | 'ARQUIVADO';
export type ProcessCriticality = 'BAIXA' | 'MEDIA' | 'ALTA';
export type ProcessTriggerType = 'MANUAL' | 'EVENTO';
export type ProcessStepType = 'approval' | 'task' | 'document' | 'validation' | 'manual';
export type ProcessResponsibleType = 'USER' | 'DEPARTMENT' | 'ROLE';
export type ProcessPriority = 'BAIXA' | 'MEDIA' | 'ALTA';

export type ProcessInstanceStatus =
    | 'EM_ANDAMENTO' | 'AGUARDANDO_RESPONSAVEL' | 'AGUARDANDO_APROVACAO'
    | 'AGUARDANDO_DOCUMENTO' | 'BLOQUEADO' | 'ATRASADO' | 'DEVOLVIDO'
    | 'CONCLUIDO' | 'CANCELADO';

export type ProcessInstanceStepStatus = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'REPROVADO' | 'PULADO';

export interface ProcessTemplate {
    id: string;
    organization_id: string;
    name: string;
    description?: string | null;
    category?: string | null;
    department_id?: string | null;
    owner_user_id?: string | null;
    status: ProcessTemplateStatus;
    version: number;
    criticality: ProcessCriticality;
    default_sla_hours?: number | null;
    trigger_type: ProcessTriggerType;
    /** Chave do evento que dispara a instância (ex.: 'purchase_order.received'). Só usada quando trigger_type='EVENTO'. */
    trigger_event_key?: string | null;
    created_at: string;
    updated_at: string;
    archived_at?: string | null;
}

export interface ProcessTemplateStep {
    id: string;
    process_template_id: string;
    name: string;
    description?: string | null;
    step_type: ProcessStepType;
    order_index: number;
    is_required: boolean;
    default_responsible_type?: ProcessResponsibleType | null;
    default_responsible_id?: string | null;
    sla_hours?: number | null;
    requires_document: boolean;
    can_skip: boolean;
    created_at: string;
    updated_at: string;
}

export interface ProcessInstance {
    id: string;
    organization_id: string;
    process_template_id: string;
    template_version: number;
    title: string;
    description?: string | null;
    status: ProcessInstanceStatus;
    priority: ProcessPriority;
    criticality: ProcessCriticality;
    current_step_id?: string | null;
    requester_user_id?: string | null;
    owner_user_id?: string | null;
    department_id?: string | null;
    project_id?: string | null;
    supplier_id?: string | null;
    client_id?: string | null;
    contract_id?: string | null;
    purchase_order_id?: string | null;
    started_at: string;
    due_at?: string | null;
    completed_at?: string | null;
    cancelled_at?: string | null;
    created_at: string;
    updated_at: string;
}

export interface ProcessInstanceStep {
    id: string;
    process_instance_id: string;
    template_step_id: string;
    name: string;
    step_type: ProcessStepType;
    order_index: number;
    status: ProcessInstanceStepStatus;
    responsible_user_id?: string | null;
    task_id?: string | null;
    document_id?: string | null;
    approval_status: 'RASCUNHO' | 'PENDENTE' | 'APROVADO' | 'REJEITADO';
    approval_chain: unknown[];
    approval_required_levels: number;
    amount?: number | null;
    started_at?: string | null;
    due_at?: string | null;
    completed_at?: string | null;
    rejection_reason?: string | null;
    created_at: string;
    updated_at: string;
}

export interface ProcessComment {
    id: string;
    process_instance_id: string;
    step_id?: string | null;
    user_id?: string | null;
    comment: string;
    visibility: 'INTERNO' | 'PUBLICO';
    created_at: string;
}

export interface ProcessAuditLog {
    id: string;
    process_instance_id: string;
    user_id?: string | null;
    action: string;
    old_value?: unknown;
    new_value?: unknown;
    metadata: Record<string, unknown>;
    created_at: string;
}

/** Instância com suas etapas — usado nas telas de detalhe e execução. */
export interface ProcessInstanceWithSteps extends ProcessInstance {
    steps: ProcessInstanceStep[];
    template_name?: string;
}

/** Etapa pendente com o contexto da instância — usado em "Pendente comigo". */
export interface PendingStepItem extends ProcessInstanceStep {
    instance_title: string;
    instance_status: ProcessInstanceStatus;
    instance_priority: ProcessPriority;
}

/** Linha do dashboard de gargalos — agregado por nome de etapa (fn_process_bottlenecks). */
export interface ProcessStepBottleneck {
    step_name: string;
    step_type: ProcessStepType;
    avg_hours: number | null;
    completed_count: number;
    active_count: number;
    overdue_count: number;
}

/** Chaves de evento do P2P que o motor de Processos escuta (costura — ver PLANO_MODULO_PROCESSOS.md §6). */
export type ProcessEventKey = 'purchase_order.received' | 'purchase_order.divergence';
