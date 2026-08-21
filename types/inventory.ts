// Módulo Almoxarifado (ÒPURA Inventory) — Fases 1 e 2

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

// ── Fase 2 ────────────────────────────────────────────────────────────────────

export type ReservationStatus = 'active' | 'consumed' | 'cancelled';

export interface StockReservation {
    id: string;
    organizationId: string;
    warehouseId: string;
    warehouseName?: string;
    inputCode: string;
    inputDescription: string;
    inputUnit: string;
    quantity: number;
    workOrderId?: string;
    status: ReservationStatus;
    notes?: string;
    created_at: string;
    updated_at: string;
}

export interface CreateReservationInput {
    warehouseId: string;
    inputCode: string;
    inputDescription: string;
    inputUnit: string;
    quantity: number;
    workOrderId?: string;
    notes?: string;
}

export type TransferStatus = 'in_transit' | 'received' | 'cancelled';

export interface StockTransferItem {
    id: string;
    transferId: string;
    inputCode?: string;
    inputDescription: string;
    inputUnit: string;
    quantity: number;
}

export interface StockTransfer {
    id: string;
    organizationId: string;
    fromWarehouseId: string;
    fromWarehouseName?: string;
    toWarehouseId: string;
    toWarehouseName?: string;
    status: TransferStatus;
    shippedAt?: string;
    receivedAt?: string;
    notes?: string;
    items: StockTransferItem[];
    created_at: string;
    updated_at: string;
}

export interface CreateTransferInput {
    fromWarehouseId: string;
    toWarehouseId: string;
    notes?: string;
    items: Array<{
        inputCode?: string;
        inputDescription: string;
        inputUnit: string;
        quantity: number;
    }>;
}

// Item de consumo da OE
export interface StockConsumptionItem {
    inputCode?: string;
    inputDescription: string;
    inputUnit: string;
    quantity: number;
}

// ── Fase 3 ────────────────────────────────────────────────────────────────────

// Posição líquida (retorno da fn_net_position — alimenta o Plano de Aquisições)
export interface StockNetPosition {
    organizationId: string;
    warehouseId: string;
    warehouseName?: string;
    inputCode: string;
    inputDescription: string;
    inputUnit: string;
    balanceQty: number;       // stock_balances.quantity
    inTransitQty: number;     // POs em status ativo (Enviado/Em Trânsito/…)
    reservedQty: number;      // stock_reservations ativas
    netQty: number;           // balance + inTransit − reserved
    avgUnitCost: number;
    totalValue: number;       // balanceQty × avgUnitCost
    minQuantity?: number;     // estoque mínimo cadastrado
    isBelowMin: boolean;
}

// Indicadores de giro, ruptura e excesso (fn_stock_summary)
export interface StockSummary {
    warehouseId: string;
    warehouseName?: string;
    inputCode: string;
    inputDescription: string;
    inputUnit: string;
    balanceQty: number;
    avgUnitCost: number;
    outflow30d: number;
    inflow30d: number;
    lastMovementDate?: string;
    turnoverRate: number;     // outflow30d / balance (0 se balance = 0)
    isRupture: boolean;       // saldo ≤ 0
    isExcess: boolean;        // sem saída em 60d e saldo > 0
    isBelowMin: boolean;
}

// Estoque mínimo
export interface StockMinLevel {
    id: string;
    organizationId: string;
    warehouseId: string;
    warehouseName?: string;
    inputCode: string;
    inputDescription: string;
    inputUnit: string;
    minQuantity: number;
    notes?: string;
    created_at: string;
    updated_at: string;
}

export interface CreateStockMinLevelInput {
    warehouseId: string;
    inputCode: string;
    inputDescription: string;
    inputUnit: string;
    minQuantity: number;
    notes?: string;
}

// ── Requisições de Materiais (Fase 4) ────────────────────────────────────────

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'separated' | 'delivered' | 'cancelled';

export interface MaterialRequestItem {
    id: string;
    requestId: string;
    inputCode?: string;
    inputDescription: string;
    inputUnit: string;
    quantityRequested: number;
    quantityApproved?: number;
    quantityDelivered?: number;
    notes?: string;
}

export interface MaterialRequest {
    id: string;
    organizationId: string;
    projectId?: string;
    projectName?: string;
    warehouseId?: string;
    warehouseName?: string;
    number: string;
    requestedBy: string;
    approvedBy?: string;
    status: RequestStatus;
    notes?: string;
    requestedAt: string;
    approvedAt?: string;
    deliveredAt?: string;
    items: MaterialRequestItem[];
    created_at: string;
}

export interface CreateMaterialRequestInput {
    warehouseId?: string;
    projectId?: string;
    requestedBy: string;
    notes?: string;
    items: Array<{
        inputCode?: string;
        inputDescription: string;
        inputUnit: string;
        quantityRequested: number;
        notes?: string;
    }>;
}

// ── Catálogo de Itens (Cadastro de Itens) ────────────────────────────────────

export type StockItemSource = 'avulso' | 'catalogo' | 'orcamento' | 'planilha' | 'recebimento';

export interface StockItem {
    id: string;
    organizationId: string;
    inputCode: string;
    inputDescription: string;
    inputUnit: string;
    category?: string;
    defaultSupplierId?: string;
    defaultSupplierName?: string; // join
    notes?: string;
    isActive: boolean;
    source?: StockItemSource;
    originProjectId?: string;
    unitCostHint?: number;
    created_at: string;
    updated_at: string;
}

// inputCode ausente/vazio = gerado automaticamente (AVU-000001) pelo banco
export interface CreateStockItemInput {
    id?: string; // presente = edição
    inputCode?: string;
    inputDescription: string;
    inputUnit: string;
    category?: string;
    defaultSupplierId?: string | null;
    notes?: string;
    isActive?: boolean;
    source?: StockItemSource;
    originProjectId?: string | null;
    unitCostHint?: number;
}

// Linha crua de uma das três origens de importação, antes da pré-visualização
export interface StockItemImportRow {
    inputCode?: string;
    inputDescription: string;
    inputUnit: string;
    category?: string;
    unitCostHint?: number;
    source: StockItemSource;
    originProjectId?: string;
    /** Preenchido só quando a planilha traz saldo inicial a lançar. */
    initialQuantity?: number;
}

export interface StockItemImportRowResult {
    row: StockItemImportRow;
    item?: StockItem;
    status: 'created' | 'updated' | 'error';
    message?: string;
}

export interface StockItemImportResult {
    created: number;
    updated: number;
    skipped: number;
    errors: Array<{ row: StockItemImportRow; message: string }>;
    /** Detalhe por linha, na mesma ordem da entrada — usado para saber o
     *  input_code resolvido de cada linha (necessário para lançar saldo
     *  inicial depois do import, quando a planilha trouxe quantidade). */
    results: StockItemImportRowResult[];
}
