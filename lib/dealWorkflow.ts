import { PropertyDeal } from '../types';

export type DealWorkflowStatus =
    | 'IN_NEGOTIATION'  // Proposta
    | 'PENDING'         // Aprovação
    | 'WAITING_PAYMENT' // Legacy — mapeado para RESERVA na UI
    | 'RESERVA'         // Reserva formal (trava unidade)
    | 'CONTRATO'        // Contrato gerado
    | 'ASSINATURA'      // Aguardando assinatura
    | 'COMPLETED'       // Concluído
    | 'CANCELLED';      // Cancelado / Distrato

export interface WorkflowStep {
    status: DealWorkflowStatus;
    label: string;
    description: string;
    color: string;
    bgColor: string;
    borderColor: string;
}

// Etapas lineares — WAITING_PAYMENT não aparece (é legacy, normalizado para RESERVA)
export const WORKFLOW_STEPS: WorkflowStep[] = [
    {
        status: 'IN_NEGOTIATION',
        label: 'Proposta',
        description: 'Negociação em andamento com o cliente.',
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
    },
    {
        status: 'PENDING',
        label: 'Aprovação',
        description: 'Proposta aprovada internamente. Aguardando reserva formal.',
        color: 'text-amber-600',
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-200',
    },
    {
        status: 'RESERVA',
        label: 'Reserva',
        description: 'Unidade reservada. Contrato em elaboração.',
        color: 'text-purple-600',
        bgColor: 'bg-purple-50',
        borderColor: 'border-purple-200',
    },
    {
        status: 'CONTRATO',
        label: 'Contrato',
        description: 'Contrato gerado e em revisão pelo cliente.',
        color: 'text-indigo-600',
        bgColor: 'bg-indigo-50',
        borderColor: 'border-indigo-200',
    },
    {
        status: 'ASSINATURA',
        label: 'Assinatura',
        description: 'Contrato enviado para assinatura eletrônica.',
        color: 'text-pink-600',
        bgColor: 'bg-pink-50',
        borderColor: 'border-pink-200',
    },
    {
        status: 'COMPLETED',
        label: 'Concluído',
        description: 'Venda concluída e registrada no financeiro.',
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-50',
        borderColor: 'border-emerald-200',
    },
];

// Transições permitidas: de → [para]
const ALLOWED_TRANSITIONS: Record<DealWorkflowStatus, DealWorkflowStatus[]> = {
    IN_NEGOTIATION:  ['PENDING', 'CANCELLED'],
    PENDING:         ['RESERVA', 'IN_NEGOTIATION', 'CANCELLED'],
    WAITING_PAYMENT: ['RESERVA', 'CONTRATO', 'ASSINATURA', 'COMPLETED', 'CANCELLED'], // compat: deals legados equivalem a RESERVA
    RESERVA:         ['CONTRATO', 'PENDING', 'CANCELLED'],
    CONTRATO:        ['ASSINATURA', 'RESERVA', 'CANCELLED'],
    ASSINATURA:      ['COMPLETED', 'CONTRATO', 'CANCELLED'],
    COMPLETED:       ['CANCELLED'],
    CANCELLED:       ['IN_NEGOTIATION'],
};

// Deals legados em WAITING_PAYMENT são tratados como RESERVA para fins de posição visual
export function normalizeStatus(status: DealWorkflowStatus): DealWorkflowStatus {
    return status === 'WAITING_PAYMENT' ? 'RESERVA' : status;
}

export function canTransition(from: DealWorkflowStatus, to: DealWorkflowStatus): boolean {
    return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

export function getAvailableTransitions(current: DealWorkflowStatus): DealWorkflowStatus[] {
    return ALLOWED_TRANSITIONS[current] || [];
}

export function getStepIndex(status: DealWorkflowStatus): number {
    const normalized = normalizeStatus(status);
    return WORKFLOW_STEPS.findIndex(s => s.status === normalized);
}

export function getStepByStatus(status: DealWorkflowStatus): WorkflowStep | undefined {
    const normalized = normalizeStatus(status);
    return WORKFLOW_STEPS.find(s => s.status === normalized);
}

// A etapa final (COMPLETED) é redigida como "Venda" por padrão, mas Locação
// não vende — a unidade fica ALUGADA. SALE/SERVICE mantêm o texto genérico.
const COMPLETED_STEP_OVERRIDE: Partial<Record<NonNullable<PropertyDeal['type']>, { label: string; description: string }>> = {
    RENTAL: { label: 'Alugado', description: 'Contrato de locação assinado. Unidade alugada.' },
};

// Aplica o texto por tipo de negociação a uma etapa (usado por
// DealWorkflowBar e pelo vocabulário compartilhado de status em
// RentalsModule — ver getDealStatusDisplay/getUnitStatusDisplay).
export function getWorkflowStep(step: WorkflowStep, dealType?: PropertyDeal['type']): WorkflowStep {
    if (step.status !== 'COMPLETED' || !dealType) return step;
    const override = COMPLETED_STEP_OVERRIDE[dealType];
    return override ? { ...step, ...override } : step;
}

// Pré-requisitos de negócio antes de avançar
export function validateTransition(
    from: DealWorkflowStatus,
    to: DealWorkflowStatus,
    deal: Partial<PropertyDeal>
): string | null {
    if (!canTransition(from, to)) {
        return `Transição de "${from}" para "${to}" não é permitida.`;
    }
    if (to === 'PENDING' && !deal.client_id) {
        return 'Selecione um cliente antes de aprovar a proposta.';
    }
    if ((to === 'RESERVA' || to === 'WAITING_PAYMENT') && !deal.property_id) {
        return 'Selecione uma unidade antes de reservar.';
    }
    if ((to === 'RESERVA' || to === 'WAITING_PAYMENT') && (!deal.value || deal.value <= 0)) {
        return 'Informe o valor da negociação antes de reservar.';
    }
    if (to === 'CONTRATO' && (!deal.value || deal.value <= 0)) {
        return 'O deal precisa ter um valor definido para gerar o contrato.';
    }
    if (to === 'COMPLETED' && (!deal.installments || deal.installments <= 0) && (!deal.custom_installments || deal.custom_installments.length === 0)) {
        return 'Defina o plano de pagamento antes de concluir a venda.';
    }
    return null;
}

// Label amigável para status (usado em badges, histórico etc.)
export const STATUS_LABELS: Record<DealWorkflowStatus, string> = {
    IN_NEGOTIATION:  'Proposta',
    PENDING:         'Aprovação',
    WAITING_PAYMENT: 'Reserva',   // legacy label
    RESERVA:         'Reserva',
    CONTRATO:        'Contrato',
    ASSINATURA:      'Assinatura',
    COMPLETED:       'Concluído',
    CANCELLED:       'Cancelado',
};
