/**
 * Série ÚNICA de parcelas do eixo comercial (tabela `deal_installments`).
 *
 * A MESMA linha atravessa proposta (proposalId) → negociação (dealId) →
 * contrato (contractId). Antes disso o mesmo dado vivia em três lugares
 * (custom_installments JSONB, broker_portal_proposals.payment_plan e linhas
 * soltas em internal_transactions) e o plano de pagamento da negociação era
 * publicado em Contas a Receber automaticamente ao salvar — origem da confusão
 * relatada em 2026-08-01. Publicar agora é ação explícita.
 *
 * Ver migration 20270849000000_deal_installments.sql.
 */
export interface DealInstallmentRow {
    id: string;
    organizationId: string;
    dealId: string | null;
    proposalId: string | null;
    contractId: string | null;
    source: 'DEAL' | 'PROPOSAL' | 'CONTRACT_RENEWAL';
    /** Ordem na série. 0 = Entrada (antes era o campo solto `down_payment`). */
    sequence: number;
    dueDate: string;
    /** Bruto, pré-desconto. `amount` é o líquido — o que será cobrado. */
    originalAmount: number | null;
    discountType: 'VALUE' | 'PERCENT' | null;
    discountAmount: number | null;
    amount: number;
    installmentType: string | null;
    paymentType: string | null;
    description: string | null;
    notes: string | null;
    costCenterId: string | null;
    planoDeContasId: string | null;
    /** Preenchido só pelo botão "Enviar ao Contas a Receber". */
    publishedAt: string | null;
    publishedBy: string | null;
    unpublishedAt: string | null;
    financialEntryId: string | null;
    referenceId: string;
    settlementStatus: SettlementStatus;
    paidAt: string | null;
    createdAt?: string;
    updatedAt?: string;
}

export type SettlementStatus = 'NAO_LANCADA' | 'LANCADA' | 'RECEBIDA' | 'CANCELADA';

/** Rótulos da coluna "Situação" da aba Parcelas. */
export const SETTLEMENT_LABEL: Record<SettlementStatus, string> = {
    NAO_LANCADA: 'Não lançada',
    LANCADA: 'Lançada',
    RECEBIDA: 'Recebida',
    CANCELADA: 'Cancelada',
};

/**
 * Resultado de publicar/despublicar. `blocked` NOMEIA as parcelas preservadas —
 * um toast dizendo "algumas parcelas foram preservadas" obriga o usuário a ir
 * conferir no financeiro qual foi.
 */
export interface PublishReport {
    published: number;
    alreadyPublished: number;
    removed: number;
    blocked: { id: string; description: string; reason: 'RECEBIDA' | 'CONCILIADA' }[];
}
