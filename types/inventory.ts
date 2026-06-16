// Módulo Almoxarifado (ÒPURA Inventory) — Fase 1

export type WarehouseType = 'site' | 'central' | 'virtual';

export interface Warehouse {
    id: string;
    organizationId: string;
    projectId?: string | null;
    projectName?: string;  // join
    name: string;
    type: WarehouseType;
    isActive: boolean;
    notes?: string;
    created_at: string;
    updated_at: string;
}

export type StockMovementType = 'in' | 'out' | 'adjust' | 'transfer_in' | 'transfer_out';

export interface StockMovement {
    id: string;
    organizationId: string;
    warehouseId: string;
    warehouseName?: string;   // join
    inputCode?: string;
    inputDescription: string;
    inputUnit: string;
    type: StockMovementType;
    quantity: number;
    unitCost?: number;
    totalCost?: number;       // computed: quantity * unitCost
    receiptId?: string;
    workOrderId?: string;
    notes?: string;
    movedAt: string;          // date
    createdBy?: string;
    created_at: string;
}

export interface StockBalance {
    organizationId: string;
    warehouseId: string;
    warehouseName?: string;   // join
    inputCode: string;
    inputDescription: string;
    inputUnit: string;
    quantity: number;
    avgUnitCost: number;
    totalValue: number;       // computed: quantity * avgUnitCost
    updated_at: string;
}

export interface SupplierLeadTime {
    id: string;
    organizationId: string;
    supplierId: string;
    supplierName?: string;    // join
    inputCode?: string;       // null = vale para qualquer insumo do fornecedor
    categoryId?: string;
    leadTimeDays: number;
    notes?: string;
    created_at: string;
    updated_at: string;
}

// DTO para criação de movimento manual
export interface CreateStockMovementInput {
    warehouseId: string;
    inputCode?: string;
    inputDescription: string;
    inputUnit: string;
    type: 'in' | 'out' | 'adjust';
    quantity: number;
    unitCost?: number;
    notes?: string;
    movedAt?: string;
}

// DTO para criação de almoxarifado
export interface CreateWarehouseInput {
    projectId?: string | null;
    name: string;
    type: WarehouseType;
    notes?: string;
}

// DTO para lead time
export interface CreateSupplierLeadTimeInput {
    supplierId: string;
    inputCode?: string;
    categoryId?: string;
    leadTimeDays: number;
    notes?: string;
}

// Posição líquida (Fase 3 — exposta ao Plano de Aquisições)
export interface StockNetPosition {
    organizationId: string;
    warehouseId: string;
    inputCode: string;
    inputDescription: string;
    inputUnit: string;
    balanceQty: number;       // stock_balances
    inTransitQty: number;     // POs enviados não recebidos
    reservedQty: number;      // stock_reservations (Fase 2)
    netQty: number;           // balance + inTransit - reserved
}
