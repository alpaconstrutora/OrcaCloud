import type { ApprovalStatus, ApprovalStep } from './financial';

/**
 * Suprimentos › Solicitações de Compra (SC).
 * Plano: docs/planos/2026-09-26-suprimentos-solicitacoes-compra.md
 *
 * Não há campo `status`: o status exibido é DERIVADO por
 * `statusDaSolicitacao` (utils/solicitacaoCompra.ts) a partir de
 * `approvalStatus`, `cancelledAt` e do atendimento dos itens.
 */

/** De onde o item veio — decide qual rastro (`stockItemId`, `procurementPlanItemId`, `budgetRef`) vem preenchido. */
export type PurchaseRequestSource = 'orcamento' | 'avulso' | 'almoxarifado' | 'plano';

export type PurchaseRequestPriority = 'normal' | 'urgente';

export type PurchaseRequestDisplayStatus =
    | 'cancelada'
    | 'rascunho'
    | 'em_aprovacao'
    | 'reprovada'
    | 'aprovada'
    | 'em_atendimento'
    | 'atendida';

/** Referência ao item do orçamento, congelada no momento da escolha (snapshot, não FK). */
export interface PurchaseRequestBudgetRef {
    budgetItemId?: string;
    budgetItemCode?: string;
    budgetItemDescription?: string;
    /** Código da composição quando o insumo foi escolhido dentro dela. */
    compositionCode?: string;
}

export interface PurchaseRequestItem {
    id?: string;
    requestId?: string;
    position: number;
    source: PurchaseRequestSource;
    inputCode?: string | null;
    description: string;
    unit: string;
    quantity: number;
    estimatedUnitPrice: number;
    needDate?: string | null;
    notes?: string | null;
    stockItemId?: string | null;
    procurementPlanItemId?: string | null;
    budgetRef?: PurchaseRequestBudgetRef | null;
    quotationRequestId?: string | null;
    quotationNumber?: string | null;
    purchaseOrderId?: string | null;
    purchaseOrderNumber?: string | null;
    cancelledAt?: string | null;
}

export interface PurchaseRequest {
    id: string;
    organizationId: string;
    projectId: string;
    projectName?: string;
    number?: string | null;
    title: string;
    justification?: string | null;
    needDate?: string | null;
    priority: PurchaseRequestPriority;
    costCenterId?: string | null;
    planoDeContasId?: string | null;
    requestedBy?: string | null;
    requestedByName?: string | null;
    requestedByEmail?: string | null;
    estimatedTotal: number;
    approvalStatus: ApprovalStatus;
    approvalChain: ApprovalStep[];
    approvalRequiredLevels: 1 | 2;
    cancelledAt?: string | null;
    cancelReason?: string | null;
    createdAt?: string;
    updatedAt?: string;
    items: PurchaseRequestItem[];
}

/** O que a tela de edição grava — o resto (aprovação, número, atendimento) é do serviço. */
export interface PurchaseRequestDraft {
    projectId: string;
    title: string;
    justification?: string | null;
    needDate?: string | null;
    priority: PurchaseRequestPriority;
    costCenterId?: string | null;
    planoDeContasId?: string | null;
    items: PurchaseRequestItem[];
}
