// Módulo Plano de Aquisições (ÒPURA Procurement Planning) — Fase 1

export type ProcurementStatus = 'pending' | 'quoted' | 'ordered' | 'received' | 'cancelled';

export interface ProcurementPlanItem {
    id: string;
    organizationId: string;
    projectId: string;
    projectName?: string;       // join

    // Versionamento
    budgetVersionId?: string;
    isStale: boolean;

    // Insumo
    inputCode?: string;
    inputDescription: string;
    inputUnit: string;

    // Origem
    sourceBudgetItemId?: string;
    sourceBudgetItemDesc?: string;
    sourceBudgetItemUnit?: string;

    // Quantidades
    requiredQty: number;
    netRequiredQty: number;     // requiredQty − posição líquida
    lastNetSnapshotAt?: string;

    // Programação
    periodId?: string;
    periodDate?: string;        // ISO date
    needDate?: string;          // ISO date
    leadTimeDays: number;
    suggestedBuyDate?: string;  // ISO date

    // Fornecedor / custo
    suggestedSupplierId?: string;
    suggestedSupplierName?: string; // join
    estimatedUnitCost: number;
    estimatedTotal: number;     // computed: netRequiredQty × estimatedUnitCost

    // Consolidação
    consolidationGroupId?: string;

    // Workflow
    status: ProcurementStatus;
    generatedQuotationId?: string;
    generatedOrderId?: string;

    notes?: string;
    created_at: string;
    updated_at: string;
}

// Item de orçamento explodido pelo motor (uso interno do procurementService)
export interface ExplodedNeed {
    inputCode?: string;
    inputDescription: string;
    inputUnit: string;
    requiredQty: number;        // qty do componente × qty do item orçamento × pct período
    sourceBudgetItemId: string;
    sourceBudgetItemDesc: string;
    sourceBudgetItemUnit: string;
    periodId: string;
    periodDate: string;
    needDate: string;           // periodDate − leadTimeDays
    leadTimeDays: number;
    suggestedBuyDate: string;
    suggestedSupplierId?: string;
    estimatedUnitCost: number;
    consolidationGroupKey: string; // `${inputCode}|${periodDate}`
}

export interface ProcurementMonthlySpend {
    monthDate: string;
    monthLabel: string;
    estimatedSpend: number;
    pendingCount: number;
    quotedCount: number;
    orderedCount: number;
}

export interface ProcurementKPIs {
    totalItems: number;
    totalEstimated: number;
    next30dItems: number;
    next30dEstimated: number;
    staleItems: number;
    backlogItems: number;       // itens sem data de compra sugerida
}

export interface UpdateProcurementItemInput {
    suggestedSupplierId?: string;
    estimatedUnitCost?: number;
    leadTimeDays?: number;
    suggestedBuyDate?: string;
    status?: ProcurementStatus;
    notes?: string;
}

// ── Fase 3: Consolidação Multi-Obra ──────────────────────────────────────────

export type ConsolidationStatus = 'open' | 'quoted' | 'ordered' | 'cancelled';

export interface ConsolidationOpportunity {
    inputCode?: string;
    inputDescription: string;
    inputUnit: string;
    periodMonth: string;        // ISO date (1º do mês)
    projectCount: number;
    totalQty: number;
    totalEstimated: number;
    itemIds: string[];          // procurement_plan_items.id[]
}

export interface ConsolidationItem {
    id: string;
    consolidationId: string;
    planItemId: string;
    projectId: string;
    projectName: string;
    requiredQty: number;
    estimatedTotal: number;
    created_at: string;
}

export interface Consolidation {
    id: string;
    organizationId: string;
    inputCode?: string;
    inputDescription: string;
    inputUnit: string;
    periodMonth: string;
    totalRequiredQty: number;
    totalEstimated: number;
    status: ConsolidationStatus;
    generatedQuotationId?: string;
    generatedOrderId?: string;
    notes?: string;
    items?: ConsolidationItem[];
    created_at: string;
    updated_at: string;
}
