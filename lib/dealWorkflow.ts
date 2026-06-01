import { PropertyDeal } from '../types';

export type DealWorkflowStatus =
    | 'IN_NEGOTIATION'
    | 'PENDING'
    | 'WAITING_PAYMENT'
    | 'COMPLETED'
    | 'CANCELLED';

export interface WorkflowStep {
    status: DealWorkflowStatus;
    label: string;
    description: string;
    color: string;
    bgColor: string;
    borderColor: string;
}

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
        description: 'Proposta aprovada, aguardando reserva formal.',
        color: 'text-amber-600',
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-200',
    },
    {
        status: 'WAITING_PAYMENT',
        label: 'Reserva / Contrato',
        description: 'Unidade reservada. Contrato em assinatura.',
        color: 'text-purple-600',
        bgColor: 'bg-purple-50',
        borderColor: 'border-purple-200',
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

// Transições permitidas: de → [lista de para]
const ALLOWED_TRANSITIONS: Record<DealWorkflowStatus, DealWorkflowStatus[]> = {
    IN_NEGOTIATION: ['PENDING', 'CANCELLED'],
    PENDING:        ['WAITING_PAYMENT', 'IN_NEGOTIATION', 'CANCELLED'],
    WAITING_PAYMENT:['COMPLETED', 'PENDING', 'CANCELLED'],
    COMPLETED:      ['CANCELLED'],
    CANCELLED:      ['IN_NEGOTIATION'],
};

export function canTransition(from: DealWorkflowStatus, to: DealWorkflowStatus): boolean {
    return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

export function getAvailableTransitions(current: DealWorkflowStatus): DealWorkflowStatus[] {
    return ALLOWED_TRANSITIONS[current] || [];
}

export function getStepIndex(status: DealWorkflowStatus): number {
    return WORKFLOW_STEPS.findIndex(s => s.status === status);
}

export function getStepByStatus(status: DealWorkflowStatus): WorkflowStep | undefined {
    return WORKFLOW_STEPS.find(s => s.status === status);
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
    if (to === 'WAITING_PAYMENT' && !deal.property_id) {
        return 'Selecione uma unidade antes de reservar.';
    }
    if (to === 'WAITING_PAYMENT' && (!deal.value || deal.value <= 0)) {
        return 'Informe o valor da negociação antes de reservar.';
    }
    if (to === 'COMPLETED' && (!deal.installments || deal.installments <= 0) && (!deal.custom_installments || deal.custom_installments.length === 0)) {
        return 'Defina o plano de pagamento antes de concluir a venda.';
    }
    return null;
}
