// Módulo Almoxarifado (ÒPURA Inventory) — service layer

import { supabase } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export type MovementType = 'in' | 'out' | 'adjust_in' | 'adjust_out' | 'transfer_in' | 'transfer_out';
export type TransferStatus = 'in_transit' | 'received' | 'cancelled';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'separated' | 'delivered' | 'cancelled';

export interface Warehouse {
    id: string;
    organizationId: string;
    projectId?: string;
    projectName?: string;
    name: string;
    type: 'site' | 'central' | 'virtual';
    isActive: boolean;
    notes?: string;
    created_at: string;
}

export interface StockItem {
    id: string;
    organizationId: string;
    inputCode: string;
    inputDescription: string;
    inputUnit: string;
    category?: string;
    defaultSupplierId?: string;
    defaultSupplierName?: string;
    notes?: string;
    isActive: boolean;
    created_at: string;
    updated_at: string;
}

export interface StockMovement {
    id: string;
    organizationId: string;
    warehouseId: string;
    warehouseName?: string;
    inputCode?: string;
    inputDescription: string;
    inputUnit: string;
    type: MovementType;
    quantity: number;
    unitCost?: number;
    receiptId?: string;
    workOrderId?: string;
    transferId?: string;
    notes?: string;
    movedAt: string;
    created_at: string;
}

export interface NetPosition {
    organizationId: string;
    warehouseId: string;
    warehouseName: string;
    inputCode?: string;
    inputDescription: string;
    inputUnit: string;
    balanceQty: number;
    inTransitQty: number;
    reservedQty: number;
    netQty: number;
    avgUnitCost: number;
    totalValue: number;
    minQuantity?: number;
    isBelowMin: boolean;
}

export interface StockSummary {
    warehouseId: string;
    warehouseName: string;
    inputCode?: string;
    inputDescription: string;
    inputUnit: string;
    balanceQty: number;
    avgUnitCost: number;
    outflow30d: number;
    inflow30d: number;
    lastMovementDate?: string;
    turnoverRate: number;
    isRupture: boolean;
    isExcess: boolean;
    isBelowMin: boolean;
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
    items?: StockTransferItem[];
    created_at: string;
}

export interface StockTransferItem {
    id: string;
    transferId: string;
    inputCode?: string;
    inputDescription: string;
    inputUnit: string;
    quantity: number;
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
    items?: MaterialRequestItem[];
    created_at: string;
}

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

export interface InventoryKPIs {
    totalWarehouses: number;
    totalValue: number;
    belowMinCount: number;
    ruptureCount: number;
    excessCount: number;
    pendingRequestsCount: number;
    inTransitTransfers: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowToWarehouse(r: Record<string, unknown>): Warehouse {
    return {
        id: r.id as string,
        organizationId: r.organization_id as string,
        projectId: r.project_id as string | undefined,
        projectName: (r.projects as Record<string, unknown> | null)?.name as string | undefined,
        name: r.name as string,
        type: r.type as Warehouse['type'],
        isActive: r.is_active as boolean,
        notes: r.notes as string | undefined,
        created_at: r.created_at as string,
    };
}

function rowToItem(r: Record<string, unknown>): StockItem {
    return {
        id: r.id as string,
        organizationId: r.organization_id as string,
        inputCode: r.input_code as string,
        inputDescription: r.input_description as string,
        inputUnit: r.input_unit as string,
        category: r.category as string | undefined,
        defaultSupplierId: r.default_supplier_id as string | undefined,
        defaultSupplierName: (r.suppliers as Record<string, unknown> | null)?.name as string | undefined,
        notes: r.notes as string | undefined,
        isActive: r.is_active as boolean,
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
    };
}

function rowToMovement(r: Record<string, unknown>): StockMovement {
    return {
        id: r.id as string,
        organizationId: r.organization_id as string,
        warehouseId: r.warehouse_id as string,
        warehouseName: (r.warehouses as Record<string, unknown> | null)?.name as string | undefined,
        inputCode: r.input_code as string | undefined,
        inputDescription: r.input_description as string,
        inputUnit: r.input_unit as string,
        type: r.type as MovementType,
        quantity: Number(r.quantity),
        unitCost: r.unit_cost != null ? Number(r.unit_cost) : undefined,
        receiptId: r.receipt_id as string | undefined,
        workOrderId: r.work_order_id as string | undefined,
        transferId: r.transfer_id as string | undefined,
        notes: r.notes as string | undefined,
        movedAt: r.moved_at as string,
        created_at: r.created_at as string,
    };
}

function rowToTransfer(r: Record<string, unknown>, items?: StockTransferItem[]): StockTransfer {
    return {
        id: r.id as string,
        organizationId: r.organization_id as string,
        fromWarehouseId: r.from_warehouse_id as string,
        fromWarehouseName: (r as Record<string, unknown> & { from_warehouse?: Record<string, unknown> }).from_warehouse?.name as string | undefined,
        toWarehouseId: r.to_warehouse_id as string,
        toWarehouseName: (r as Record<string, unknown> & { to_warehouse?: Record<string, unknown> }).to_warehouse?.name as string | undefined,
        status: r.status as TransferStatus,
        shippedAt: r.shipped_at as string | undefined,
        receivedAt: r.received_at as string | undefined,
        notes: r.notes as string | undefined,
        items,
        created_at: r.created_at as string,
    };
}

function rowToRequest(r: Record<string, unknown>, items?: MaterialRequestItem[]): MaterialRequest {
    return {
        id: r.id as string,
        organizationId: r.organization_id as string,
        projectId: r.project_id as string | undefined,
        projectName: (r.projects as Record<string, unknown> | null)?.name as string | undefined,
        warehouseId: r.warehouse_id as string | undefined,
        warehouseName: (r.warehouses as Record<string, unknown> | null)?.name as string | undefined,
        number: r.number as string,
        requestedBy: r.requested_by as string,
        approvedBy: r.approved_by as string | undefined,
        status: r.status as RequestStatus,
        notes: r.notes as string | undefined,
        requestedAt: r.requested_at as string,
        approvedAt: r.approved_at as string | undefined,
        deliveredAt: r.delivered_at as string | undefined,
        items,
        created_at: r.created_at as string,
    };
}

// ── Service ───────────────────────────────────────────────────────────────────

export const almoxarifadoService = {

    // ── Warehouses ────────────────────────────────────────────────────────────

    async listWarehouses(organizationId: string, onlyActive = true): Promise<Warehouse[]> {
        let q = supabase
            .from('warehouses')
            .select('id, organization_id, project_id, name, type, is_active, notes, created_at, projects(name)')
            .eq('organization_id', organizationId)
            .order('name');
        if (onlyActive) q = q.eq('is_active', true);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []).map(r => rowToWarehouse(r as unknown as Record<string, unknown>));
    },

    async createWarehouse(input: {
        organizationId: string; projectId?: string; name: string;
        type?: string; notes?: string;
    }): Promise<Warehouse> {
        const { data, error } = await supabase
            .from('warehouses')
            .insert({
                organization_id: input.organizationId,
                project_id: input.projectId ?? null,
                name: input.name,
                type: input.type ?? 'site',
                notes: input.notes ?? null,
            })
            .select('id, organization_id, project_id, name, type, is_active, notes, created_at')
            .single();
        if (error) throw error;
        return rowToWarehouse(data as unknown as Record<string, unknown>);
    },

    // ── Stock items (catálogo) ─────────────────────────────────────────────────

    async listStockItems(organizationId: string): Promise<StockItem[]> {
        const { data, error } = await supabase
            .from('stock_items')
            .select('id, organization_id, input_code, input_description, input_unit, category, default_supplier_id, notes, is_active, created_at, updated_at, suppliers(name)')
            .eq('organization_id', organizationId)
            .eq('is_active', true)
            .order('input_description');
        if (error) throw error;
        return (data || []).map(r => rowToItem(r as unknown as Record<string, unknown>));
    },

    async upsertStockItem(input: {
        id?: string; organizationId: string; inputCode: string; inputDescription: string;
        inputUnit: string; category?: string; defaultSupplierId?: string; notes?: string;
    }): Promise<StockItem> {
        const payload = {
            organization_id: input.organizationId,
            input_code: input.inputCode,
            input_description: input.inputDescription,
            input_unit: input.inputUnit,
            category: input.category ?? null,
            default_supplier_id: input.defaultSupplierId ?? null,
            notes: input.notes ?? null,
        };
        let q;
        if (input.id) {
            q = supabase.from('stock_items').update(payload).eq('id', input.id).select('id, organization_id, input_code, input_description, input_unit, category, default_supplier_id, notes, is_active, created_at, updated_at').single();
        } else {
            q = supabase.from('stock_items').insert(payload).select('id, organization_id, input_code, input_description, input_unit, category, default_supplier_id, notes, is_active, created_at, updated_at').single();
        }
        const { data, error } = await q;
        if (error) throw error;
        return rowToItem(data as unknown as Record<string, unknown>);
    },

    // ── Net position & summary ─────────────────────────────────────────────────

    async getNetPosition(organizationId: string, warehouseId?: string): Promise<NetPosition[]> {
        const { data, error } = await supabase.rpc('fn_net_position', {
            p_organization_id: organizationId,
            p_warehouse_id: warehouseId ?? null,
            p_input_code: null,
        });
        if (error) throw error;
        return (data || []).map((r: Record<string, unknown>) => ({
            organizationId: r.organization_id as string,
            warehouseId: r.warehouse_id as string,
            warehouseName: r.warehouse_name as string,
            inputCode: r.input_code as string | undefined,
            inputDescription: r.input_description as string,
            inputUnit: r.input_unit as string,
            balanceQty: Number(r.balance_qty),
            inTransitQty: Number(r.in_transit_qty),
            reservedQty: Number(r.reserved_qty),
            netQty: Number(r.net_qty),
            avgUnitCost: Number(r.avg_unit_cost),
            totalValue: Number(r.total_value),
            minQuantity: r.min_quantity != null ? Number(r.min_quantity) : undefined,
            isBelowMin: r.is_below_min as boolean,
        }));
    },

    async getStockSummary(organizationId: string, warehouseId?: string): Promise<StockSummary[]> {
        const { data, error } = await supabase.rpc('fn_stock_summary', {
            p_organization_id: organizationId,
            p_warehouse_id: warehouseId ?? null,
        });
        if (error) throw error;
        return (data || []).map((r: Record<string, unknown>) => ({
            warehouseId: r.warehouse_id as string,
            warehouseName: r.warehouse_name as string,
            inputCode: r.input_code as string | undefined,
            inputDescription: r.input_description as string,
            inputUnit: r.input_unit as string,
            balanceQty: Number(r.balance_qty),
            avgUnitCost: Number(r.avg_unit_cost),
            outflow30d: Number(r.outflow_30d),
            inflow30d: Number(r.inflow_30d),
            lastMovementDate: r.last_movement_date as string | undefined,
            turnoverRate: Number(r.turnover_rate),
            isRupture: r.is_rupture as boolean,
            isExcess: r.is_excess as boolean,
            isBelowMin: r.is_below_min as boolean,
        }));
    },

    async getKPIs(organizationId: string): Promise<InventoryKPIs> {
        const [summary, requests, transfers] = await Promise.all([
            almoxarifadoService.getStockSummary(organizationId),
            supabase.from('material_requests').select('status').eq('organization_id', organizationId).eq('status', 'pending'),
            supabase.from('stock_transfers').select('status').eq('organization_id', organizationId).eq('status', 'in_transit'),
        ]);
        const totalValue = summary.reduce((acc, s) => acc + s.balanceQty * s.avgUnitCost, 0);
        return {
            totalWarehouses: 0,
            totalValue,
            belowMinCount: summary.filter(s => s.isBelowMin).length,
            ruptureCount: summary.filter(s => s.isRupture).length,
            excessCount: summary.filter(s => s.isExcess).length,
            pendingRequestsCount: requests.data?.length ?? 0,
            inTransitTransfers: transfers.data?.length ?? 0,
        };
    },

    // ── Movements ─────────────────────────────────────────────────────────────

    async listMovements(organizationId: string, opts?: {
        warehouseId?: string; inputCode?: string; limit?: number;
    }): Promise<StockMovement[]> {
        let q = supabase
            .from('stock_movements')
            .select('id, organization_id, warehouse_id, input_code, input_description, input_unit, type, quantity, unit_cost, receipt_id, work_order_id, transfer_id, notes, moved_at, created_at, warehouses(name)')
            .eq('organization_id', organizationId)
            .order('moved_at', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(opts?.limit ?? 200);
        if (opts?.warehouseId) q = q.eq('warehouse_id', opts.warehouseId);
        if (opts?.inputCode) q = q.eq('input_code', opts.inputCode);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []).map(r => rowToMovement(r as unknown as Record<string, unknown>));
    },

    async createMovement(input: {
        organizationId: string; warehouseId: string; inputCode?: string;
        inputDescription: string; inputUnit: string; type: MovementType;
        quantity: number; unitCost?: number; notes?: string; movedAt?: string;
    }): Promise<void> {
        const { error } = await supabase.from('stock_movements').insert({
            organization_id: input.organizationId,
            warehouse_id: input.warehouseId,
            input_code: input.inputCode ?? null,
            input_description: input.inputDescription,
            input_unit: input.inputUnit,
            type: input.type,
            quantity: input.quantity,
            unit_cost: input.unitCost ?? null,
            notes: input.notes ?? null,
            moved_at: input.movedAt ?? new Date().toISOString().slice(0, 10),
        });
        if (error) throw error;
    },

    // ── Transfers ─────────────────────────────────────────────────────────────

    async listTransfers(organizationId: string): Promise<StockTransfer[]> {
        const { data, error } = await supabase
            .from('stock_transfers')
            .select(`
                id, organization_id, from_warehouse_id, to_warehouse_id, status,
                shipped_at, received_at, notes, created_at,
                from_warehouse:warehouses!stock_transfers_from_warehouse_id_fkey(name),
                to_warehouse:warehouses!stock_transfers_to_warehouse_id_fkey(name)
            `)
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });
        if (error) throw error;

        const transferIds = (data || []).map(t => t.id);
        let itemsMap: Record<string, StockTransferItem[]> = {};
        if (transferIds.length > 0) {
            const { data: itemRows } = await supabase
                .from('stock_transfer_items')
                .select('id, transfer_id, input_code, input_description, input_unit, quantity')
                .in('transfer_id', transferIds);
            (itemRows || []).forEach(r => {
                const item: StockTransferItem = {
                    id: r.id, transferId: r.transfer_id, inputCode: r.input_code ?? undefined,
                    inputDescription: r.input_description, inputUnit: r.input_unit, quantity: Number(r.quantity),
                };
                if (!itemsMap[r.transfer_id]) itemsMap[r.transfer_id] = [];
                itemsMap[r.transfer_id].push(item);
            });
        }

        return (data || []).map(r => rowToTransfer(r as unknown as Record<string, unknown>, itemsMap[r.id] ?? []));
    },

    async createTransfer(input: {
        organizationId: string; fromWarehouseId: string; toWarehouseId: string;
        notes?: string; items: Array<{ inputCode?: string; inputDescription: string; inputUnit: string; quantity: number }>;
    }): Promise<string> {
        const { data: transfer, error } = await supabase
            .from('stock_transfers')
            .insert({
                organization_id: input.organizationId,
                from_warehouse_id: input.fromWarehouseId,
                to_warehouse_id: input.toWarehouseId,
                notes: input.notes ?? null,
                shipped_at: new Date().toISOString().slice(0, 10),
            })
            .select('id')
            .single();
        if (error) throw error;
        const transferId = transfer.id;

        const { error: itemsError } = await supabase.from('stock_transfer_items').insert(
            input.items.map(it => ({
                transfer_id: transferId,
                input_code: it.inputCode ?? null,
                input_description: it.inputDescription,
                input_unit: it.inputUnit,
                quantity: it.quantity,
            }))
        );
        if (itemsError) throw itemsError;
        return transferId;
    },

    async receiveTransfer(transferId: string): Promise<void> {
        const { error } = await supabase.rpc('fn_receive_stock_transfer', { p_transfer_id: transferId });
        if (error) throw error;
    },

    async cancelTransfer(transferId: string): Promise<void> {
        const { error } = await supabase
            .from('stock_transfers')
            .update({ status: 'cancelled' })
            .eq('id', transferId)
            .eq('status', 'in_transit');
        if (error) throw error;
    },

    // ── Material requests ─────────────────────────────────────────────────────

    async listMaterialRequests(organizationId: string, projectId?: string): Promise<MaterialRequest[]> {
        let q = supabase
            .from('material_requests')
            .select(`
                id, organization_id, project_id, warehouse_id, number, requested_by, approved_by,
                status, notes, requested_at, approved_at, delivered_at, created_at,
                projects(name), warehouses(name)
            `)
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });
        if (projectId) q = q.eq('project_id', projectId);
        const { data, error } = await q;
        if (error) throw error;

        const ids = (data || []).map(r => r.id);
        let itemsMap: Record<string, MaterialRequestItem[]> = {};
        if (ids.length > 0) {
            const { data: itemRows } = await supabase
                .from('material_request_items')
                .select('id, request_id, input_code, input_description, input_unit, quantity_requested, quantity_approved, quantity_delivered, notes')
                .in('request_id', ids);
            (itemRows || []).forEach(r => {
                const item: MaterialRequestItem = {
                    id: r.id, requestId: r.request_id, inputCode: r.input_code ?? undefined,
                    inputDescription: r.input_description, inputUnit: r.input_unit,
                    quantityRequested: Number(r.quantity_requested),
                    quantityApproved: r.quantity_approved != null ? Number(r.quantity_approved) : undefined,
                    quantityDelivered: r.quantity_delivered != null ? Number(r.quantity_delivered) : undefined,
                    notes: r.notes ?? undefined,
                };
                if (!itemsMap[r.request_id]) itemsMap[r.request_id] = [];
                itemsMap[r.request_id].push(item);
            });
        }

        return (data || []).map(r => rowToRequest(r as unknown as Record<string, unknown>, itemsMap[r.id] ?? []));
    },

    async createMaterialRequest(input: {
        organizationId: string; projectId?: string; warehouseId?: string;
        requestedBy: string; notes?: string;
        items: Array<{ inputCode?: string; inputDescription: string; inputUnit: string; quantityRequested: number; notes?: string }>;
    }): Promise<string> {
        const { data: numData, error: numError } = await supabase.rpc('fn_next_material_request_number', {
            p_organization_id: input.organizationId,
        });
        if (numError) throw numError;

        const { data: req, error } = await supabase
            .from('material_requests')
            .insert({
                organization_id: input.organizationId,
                project_id: input.projectId ?? null,
                warehouse_id: input.warehouseId ?? null,
                number: numData,
                requested_by: input.requestedBy,
                notes: input.notes ?? null,
            })
            .select('id')
            .single();
        if (error) throw error;

        const { error: itemsError } = await supabase.from('material_request_items').insert(
            input.items.map(it => ({
                request_id: req.id,
                input_code: it.inputCode ?? null,
                input_description: it.inputDescription,
                input_unit: it.inputUnit,
                quantity_requested: it.quantityRequested,
                notes: it.notes ?? null,
            }))
        );
        if (itemsError) throw itemsError;
        return req.id;
    },

    async approveMaterialRequest(id: string, approvedBy: string, itemApprovals?: Record<string, number>): Promise<void> {
        if (itemApprovals) {
            for (const [itemId, qty] of Object.entries(itemApprovals)) {
                await supabase.from('material_request_items').update({ quantity_approved: qty }).eq('id', itemId);
            }
        }
        const { error } = await supabase
            .from('material_requests')
            .update({ status: 'approved', approved_by: approvedBy, approved_at: new Date().toISOString().slice(0, 10) })
            .eq('id', id);
        if (error) throw error;
    },

    async rejectMaterialRequest(id: string, approvedBy: string): Promise<void> {
        const { error } = await supabase
            .from('material_requests')
            .update({ status: 'rejected', approved_by: approvedBy, approved_at: new Date().toISOString().slice(0, 10) })
            .eq('id', id);
        if (error) throw error;
    },

    async deliverMaterialRequest(id: string, deliveredBy?: string): Promise<void> {
        const { error } = await supabase.rpc('fn_deliver_material_request', {
            p_request_id: id,
            p_delivered_by: deliveredBy ?? null,
        });
        if (error) throw error;
    },

    async cancelMaterialRequest(id: string): Promise<void> {
        const { error } = await supabase
            .from('material_requests')
            .update({ status: 'cancelled' })
            .eq('id', id);
        if (error) throw error;
    },
};
