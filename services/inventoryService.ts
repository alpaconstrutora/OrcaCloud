import { supabase } from '../lib/supabase';
import {
    Warehouse,
    StockMovement,
    StockBalance,
    SupplierLeadTime,
    StockReservation,
    StockTransfer,
    StockTransferItem,
    StockNetPosition,
    StockSummary,
    StockMinLevel,
    CreateStockMovementInput,
    CreateWarehouseInput,
    CreateSupplierLeadTimeInput,
    CreateReservationInput,
    CreateTransferInput,
    CreateStockMinLevelInput,
    StockConsumptionItem,
} from '../types/inventory';

const WAREHOUSE_COLS =
    'id, organization_id, project_id, name, type, is_active, notes, created_at, updated_at, project:projects(name)';

const MOVEMENT_COLS =
    'id, organization_id, warehouse_id, input_code, input_description, input_unit, type, quantity, unit_cost, receipt_id, work_order_id, notes, moved_at, created_by, created_at, warehouse:warehouses(name)';

const BALANCE_COLS =
    'organization_id, warehouse_id, input_code, input_description, input_unit, quantity, avg_unit_cost, updated_at, warehouse:warehouses(name)';

const LEAD_TIME_COLS =
    'id, organization_id, supplier_id, input_code, category_id, lead_time_days, notes, created_at, updated_at, supplier:suppliers(name)';

function mapWarehouse(row: Record<string, unknown>): Warehouse {
    return {
        id: row.id as string,
        organizationId: row.organization_id as string,
        projectId: row.project_id as string | null,
        projectName: (row.project as Record<string, unknown> | null)?.name as string | undefined,
        name: row.name as string,
        type: row.type as Warehouse['type'],
        isActive: row.is_active as boolean,
        notes: row.notes as string | undefined,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
    };
}

function mapMovement(row: Record<string, unknown>): StockMovement {
    const qty = row.quantity as number;
    const cost = row.unit_cost as number | null;
    return {
        id: row.id as string,
        organizationId: row.organization_id as string,
        warehouseId: row.warehouse_id as string,
        warehouseName: (row.warehouse as Record<string, unknown> | null)?.name as string | undefined,
        inputCode: row.input_code as string | undefined,
        inputDescription: row.input_description as string,
        inputUnit: row.input_unit as string,
        type: row.type as StockMovement['type'],
        quantity: qty,
        unitCost: cost ?? undefined,
        totalCost: cost != null ? qty * cost : undefined,
        receiptId: row.receipt_id as string | undefined,
        workOrderId: row.work_order_id as string | undefined,
        notes: row.notes as string | undefined,
        movedAt: row.moved_at as string,
        createdBy: row.created_by as string | undefined,
        created_at: row.created_at as string,
    };
}

function mapBalance(row: Record<string, unknown>): StockBalance {
    const qty = row.quantity as number;
    const avg = row.avg_unit_cost as number;
    return {
        organizationId: row.organization_id as string,
        warehouseId: row.warehouse_id as string,
        warehouseName: (row.warehouse as Record<string, unknown> | null)?.name as string | undefined,
        inputCode: row.input_code as string,
        inputDescription: row.input_description as string,
        inputUnit: row.input_unit as string,
        quantity: qty,
        avgUnitCost: avg,
        totalValue: qty * avg,
        updated_at: row.updated_at as string,
    };
}

function mapLeadTime(row: Record<string, unknown>): SupplierLeadTime {
    return {
        id: row.id as string,
        organizationId: row.organization_id as string,
        supplierId: row.supplier_id as string,
        supplierName: (row.supplier as Record<string, unknown> | null)?.name as string | undefined,
        inputCode: row.input_code as string | undefined,
        categoryId: row.category_id as string | undefined,
        leadTimeDays: row.lead_time_days as number,
        notes: row.notes as string | undefined,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
    };
}

export const inventoryService = {

    // ─── ALMOXARIFADOS ─────────────────────────────────────────────────────────

    async listWarehouses(organizationId: string, activeOnly = true): Promise<Warehouse[]> {
        let query = supabase
            .from('warehouses')
            .select(WAREHOUSE_COLS)
            .eq('organization_id', organizationId)
            .order('name');
        if (activeOnly) query = query.eq('is_active', true);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []).map(r => mapWarehouse(r as Record<string, unknown>));
    },

    async getWarehouse(id: string): Promise<Warehouse> {
        const { data, error } = await supabase
            .from('warehouses')
            .select(WAREHOUSE_COLS)
            .eq('id', id)
            .single();
        if (error) throw error;
        return mapWarehouse(data as Record<string, unknown>);
    },

    async createWarehouse(organizationId: string, input: CreateWarehouseInput): Promise<Warehouse> {
        const { data, error } = await supabase
            .from('warehouses')
            .insert({
                organization_id: organizationId,
                project_id: input.projectId ?? null,
                name: input.name,
                type: input.type,
                notes: input.notes ?? null,
            })
            .select(WAREHOUSE_COLS)
            .single();
        if (error) throw error;
        return mapWarehouse(data as Record<string, unknown>);
    },

    async updateWarehouse(id: string, patch: Partial<CreateWarehouseInput> & { isActive?: boolean }): Promise<Warehouse> {
        const { data, error } = await supabase
            .from('warehouses')
            .update({
                ...(patch.name != null && { name: patch.name }),
                ...(patch.type != null && { type: patch.type }),
                ...(patch.notes != null && { notes: patch.notes }),
                ...(patch.isActive != null && { is_active: patch.isActive }),
            })
            .eq('id', id)
            .select(WAREHOUSE_COLS)
            .single();
        if (error) throw error;
        return mapWarehouse(data as Record<string, unknown>);
    },

    // ─── MOVIMENTOS ────────────────────────────────────────────────────────────

    async listMovements(
        organizationId: string,
        opts?: { warehouseId?: string; inputCode?: string; limit?: number }
    ): Promise<StockMovement[]> {
        let query = supabase
            .from('stock_movements')
            .select(MOVEMENT_COLS)
            .eq('organization_id', organizationId)
            .order('moved_at', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(opts?.limit ?? 200);
        if (opts?.warehouseId) query = query.eq('warehouse_id', opts.warehouseId);
        if (opts?.inputCode) query = query.eq('input_code', opts.inputCode);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []).map(r => mapMovement(r as Record<string, unknown>));
    },

    async createMovement(organizationId: string, input: CreateStockMovementInput): Promise<StockMovement> {
        const warehouse = await this.getWarehouse(input.warehouseId);
        if (warehouse.organizationId !== organizationId) throw new Error('Almoxarifado não pertence à organização.');

        const { data, error } = await supabase
            .from('stock_movements')
            .insert({
                organization_id: organizationId,
                warehouse_id: input.warehouseId,
                input_code: input.inputCode ?? null,
                input_description: input.inputDescription,
                input_unit: input.inputUnit,
                type: input.type,
                quantity: input.quantity,
                unit_cost: input.unitCost ?? null,
                notes: input.notes ?? null,
                moved_at: input.movedAt ?? new Date().toISOString().slice(0, 10),
            })
            .select(MOVEMENT_COLS)
            .single();
        if (error) throw error;
        return mapMovement(data as Record<string, unknown>);
    },

    // Entrada automática a partir de um recibo (delega para a RPC SQL)
    async createEntriesFromReceipt(receiptId: string, warehouseId: string): Promise<void> {
        const { error } = await supabase.rpc('fn_create_stock_entry_from_receipt', {
            p_receipt_id: receiptId,
            p_warehouse_id: warehouseId,
        });
        if (error) throw error;
    },

    // ─── SALDOS ────────────────────────────────────────────────────────────────

    async listBalances(
        organizationId: string,
        opts?: { warehouseId?: string; positiveOnly?: boolean }
    ): Promise<StockBalance[]> {
        let query = supabase
            .from('stock_balances')
            .select(BALANCE_COLS)
            .eq('organization_id', organizationId)
            .order('input_description');
        if (opts?.warehouseId) query = query.eq('warehouse_id', opts.warehouseId);
        if (opts?.positiveOnly) query = query.gt('quantity', 0);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []).map(r => mapBalance(r as Record<string, unknown>));
    },

    async getBalance(warehouseId: string, inputCode: string): Promise<StockBalance | null> {
        const { data, error } = await supabase
            .from('stock_balances')
            .select(BALANCE_COLS)
            .eq('warehouse_id', warehouseId)
            .eq('input_code', inputCode)
            .maybeSingle();
        if (error) throw error;
        return data ? mapBalance(data as Record<string, unknown>) : null;
    },

    // ─── LEAD TIME ─────────────────────────────────────────────────────────────

    async listLeadTimes(organizationId: string, supplierId?: string): Promise<SupplierLeadTime[]> {
        let query = supabase
            .from('supplier_lead_times')
            .select(LEAD_TIME_COLS)
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });
        if (supplierId) query = query.eq('supplier_id', supplierId);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []).map(r => mapLeadTime(r as Record<string, unknown>));
    },

    async upsertLeadTime(organizationId: string, input: CreateSupplierLeadTimeInput): Promise<SupplierLeadTime> {
        const { data, error } = await supabase
            .from('supplier_lead_times')
            .upsert(
                {
                    organization_id: organizationId,
                    supplier_id: input.supplierId,
                    input_code: input.inputCode ?? null,
                    category_id: input.categoryId ?? null,
                    lead_time_days: input.leadTimeDays,
                    notes: input.notes ?? null,
                },
                { onConflict: 'organization_id,supplier_id,input_code' }
            )
            .select(LEAD_TIME_COLS)
            .single();
        if (error) throw error;
        return mapLeadTime(data as Record<string, unknown>);
    },

    async deleteLeadTime(id: string): Promise<void> {
        const { error } = await supabase.from('supplier_lead_times').delete().eq('id', id);
        if (error) throw error;
    },

    // Resolve lead time para um fornecedor+insumo: input_code específico > genérico do fornecedor
    async resolveLeadTime(organizationId: string, supplierId: string, inputCode?: string): Promise<number | null> {
        const items = await this.listLeadTimes(organizationId, supplierId);
        if (inputCode) {
            const specific = items.find(lt => lt.inputCode === inputCode);
            if (specific) return specific.leadTimeDays;
        }
        const generic = items.find(lt => !lt.inputCode);
        return generic?.leadTimeDays ?? null;
    },

    // ─── RESERVAS (Fase 2) ─────────────────────────────────────────────────────

    async listReservations(
        organizationId: string,
        opts?: { warehouseId?: string; workOrderId?: string; activeOnly?: boolean }
    ): Promise<StockReservation[]> {
        let query = supabase
            .from('stock_reservations')
            .select('id, organization_id, warehouse_id, input_code, input_description, input_unit, quantity, work_order_id, status, notes, created_at, updated_at, warehouse:warehouses(name)')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });
        if (opts?.warehouseId) query = query.eq('warehouse_id', opts.warehouseId);
        if (opts?.workOrderId) query = query.eq('work_order_id', opts.workOrderId);
        if (opts?.activeOnly) query = query.eq('status', 'active');
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []).map(r => {
            const row = r as Record<string, unknown>;
            return {
                id: row.id as string,
                organizationId: row.organization_id as string,
                warehouseId: row.warehouse_id as string,
                warehouseName: (row.warehouse as Record<string, unknown> | null)?.name as string | undefined,
                inputCode: row.input_code as string,
                inputDescription: row.input_description as string,
                inputUnit: row.input_unit as string,
                quantity: row.quantity as number,
                workOrderId: row.work_order_id as string | undefined,
                status: row.status as StockReservation['status'],
                notes: row.notes as string | undefined,
                created_at: row.created_at as string,
                updated_at: row.updated_at as string,
            };
        });
    },

    async createReservation(organizationId: string, input: CreateReservationInput): Promise<StockReservation> {
        const { data, error } = await supabase
            .from('stock_reservations')
            .insert({
                organization_id: organizationId,
                warehouse_id: input.warehouseId,
                input_code: input.inputCode,
                input_description: input.inputDescription,
                input_unit: input.inputUnit,
                quantity: input.quantity,
                work_order_id: input.workOrderId ?? null,
                notes: input.notes ?? null,
            })
            .select('id, organization_id, warehouse_id, input_code, input_description, input_unit, quantity, work_order_id, status, notes, created_at, updated_at')
            .single();
        if (error) throw error;
        const row = data as Record<string, unknown>;
        return {
            id: row.id as string,
            organizationId: row.organization_id as string,
            warehouseId: row.warehouse_id as string,
            inputCode: row.input_code as string,
            inputDescription: row.input_description as string,
            inputUnit: row.input_unit as string,
            quantity: row.quantity as number,
            workOrderId: row.work_order_id as string | undefined,
            status: row.status as StockReservation['status'],
            notes: row.notes as string | undefined,
            created_at: row.created_at as string,
            updated_at: row.updated_at as string,
        };
    },

    async cancelReservation(id: string): Promise<void> {
        const { error } = await supabase
            .from('stock_reservations')
            .update({ status: 'cancelled' })
            .eq('id', id);
        if (error) throw error;
    },

    // ─── CONSUMO DE ESTOQUE PELA OE (Fase 2) ───────────────────────────────────

    async consumeStockForWorkOrder(
        workOrderId: string,
        warehouseId: string,
        items: StockConsumptionItem[]
    ): Promise<number> {
        const { data, error } = await supabase.rpc('fn_consume_stock_for_work_order', {
            p_work_order_id: workOrderId,
            p_warehouse_id: warehouseId,
            p_items: items,
        });
        if (error) throw error;
        return (data as number) ?? 0;
    },

    // ─── TRANSFERÊNCIAS (Fase 2) ───────────────────────────────────────────────

    async listTransfers(
        organizationId: string,
        opts?: { status?: StockTransfer['status'] }
    ): Promise<StockTransfer[]> {
        let query = supabase
            .from('stock_transfers')
            .select(`
                id, organization_id, from_warehouse_id, to_warehouse_id,
                status, shipped_at, received_at, notes, created_at, updated_at,
                from_warehouse:warehouses!from_warehouse_id(name),
                to_warehouse:warehouses!to_warehouse_id(name),
                stock_transfer_items(id, transfer_id, input_code, input_description, input_unit, quantity)
            `)
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });
        if (opts?.status) query = query.eq('status', opts.status);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []).map(r => {
            const row = r as Record<string, unknown>;
            const items = (row.stock_transfer_items as Record<string, unknown>[] ?? []).map(i => ({
                id: i.id as string,
                transferId: i.transfer_id as string,
                inputCode: i.input_code as string | undefined,
                inputDescription: i.input_description as string,
                inputUnit: i.input_unit as string,
                quantity: i.quantity as number,
            } as StockTransferItem));
            return {
                id: row.id as string,
                organizationId: row.organization_id as string,
                fromWarehouseId: row.from_warehouse_id as string,
                fromWarehouseName: (row.from_warehouse as Record<string, unknown> | null)?.name as string | undefined,
                toWarehouseId: row.to_warehouse_id as string,
                toWarehouseName: (row.to_warehouse as Record<string, unknown> | null)?.name as string | undefined,
                status: row.status as StockTransfer['status'],
                shippedAt: row.shipped_at as string | undefined,
                receivedAt: row.received_at as string | undefined,
                notes: row.notes as string | undefined,
                items,
                created_at: row.created_at as string,
                updated_at: row.updated_at as string,
            };
        });
    },

    async createTransfer(organizationId: string, input: CreateTransferInput): Promise<StockTransfer> {
        if (input.fromWarehouseId === input.toWarehouseId) throw new Error('Origem e destino não podem ser o mesmo almoxarifado.');
        if (input.items.length === 0) throw new Error('Informe ao menos um item.');

        const { data: transfer, error } = await supabase
            .from('stock_transfers')
            .insert({
                organization_id: organizationId,
                from_warehouse_id: input.fromWarehouseId,
                to_warehouse_id: input.toWarehouseId,
                notes: input.notes ?? null,
                shipped_at: new Date().toISOString().slice(0, 10),
            })
            .select('id')
            .single();
        if (error) throw error;

        const { error: itemsError } = await supabase
            .from('stock_transfer_items')
            .insert(input.items.map(i => ({
                transfer_id: transfer.id,
                input_code: i.inputCode ?? null,
                input_description: i.inputDescription,
                input_unit: i.inputUnit,
                quantity: i.quantity,
            })));
        if (itemsError) throw itemsError;

        const transfers = await this.listTransfers(organizationId);
        return transfers.find(t => t.id === transfer.id)!;
    },

    async receiveTransfer(transferId: string): Promise<void> {
        const { error } = await supabase.rpc('fn_receive_stock_transfer', {
            p_transfer_id: transferId,
        });
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

    // ─── POSIÇÃO LÍQUIDA / fn_net_position (Fase 3) ────────────────────────────

    async getNetPositions(
        organizationId: string,
        opts?: { warehouseId?: string; inputCode?: string }
    ): Promise<StockNetPosition[]> {
        const { data, error } = await supabase.rpc('fn_net_position', {
            p_organization_id: organizationId,
            p_warehouse_id: opts?.warehouseId ?? null,
            p_input_code: opts?.inputCode ?? null,
        });
        if (error) throw error;
        return ((data as Record<string, unknown>[]) ?? []).map(r => ({
            organizationId: r.organization_id as string,
            warehouseId: r.warehouse_id as string,
            warehouseName: r.warehouse_name as string | undefined,
            inputCode: r.input_code as string,
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

    // Versão simplificada para o Plano de Aquisições: net_qty de um insumo específico
    async getNetQty(
        organizationId: string,
        inputCode: string,
        warehouseId?: string
    ): Promise<number> {
        const positions = await this.getNetPositions(organizationId, { inputCode, warehouseId });
        return positions.reduce((sum, p) => sum + p.netQty, 0);
    },

    // ─── INDICADORES DE GIRO (Fase 3) ──────────────────────────────────────────

    async getStockSummary(
        organizationId: string,
        warehouseId?: string
    ): Promise<StockSummary[]> {
        const { data, error } = await supabase.rpc('fn_stock_summary', {
            p_organization_id: organizationId,
            p_warehouse_id: warehouseId ?? null,
        });
        if (error) throw error;
        return ((data as Record<string, unknown>[]) ?? []).map(r => ({
            warehouseId: r.warehouse_id as string,
            warehouseName: r.warehouse_name as string | undefined,
            inputCode: r.input_code as string,
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

    // ─── ESTOQUE MÍNIMO (Fase 3) ────────────────────────────────────────────────

    async listMinLevels(organizationId: string, warehouseId?: string): Promise<StockMinLevel[]> {
        let query = supabase
            .from('stock_min_levels')
            .select('id, organization_id, warehouse_id, input_code, input_description, input_unit, min_quantity, notes, created_at, updated_at, warehouse:warehouses(name)')
            .eq('organization_id', organizationId)
            .order('input_description');
        if (warehouseId) query = query.eq('warehouse_id', warehouseId);
        const { data, error } = await query;
        if (error) throw error;
        return ((data ?? []) as Record<string, unknown>[]).map(r => ({
            id: r.id as string,
            organizationId: r.organization_id as string,
            warehouseId: r.warehouse_id as string,
            warehouseName: (r.warehouse as Record<string, unknown> | null)?.name as string | undefined,
            inputCode: r.input_code as string,
            inputDescription: r.input_description as string,
            inputUnit: r.input_unit as string,
            minQuantity: Number(r.min_quantity),
            notes: r.notes as string | undefined,
            created_at: r.created_at as string,
            updated_at: r.updated_at as string,
        }));
    },

    async upsertMinLevel(organizationId: string, input: CreateStockMinLevelInput): Promise<StockMinLevel> {
        const { data, error } = await supabase
            .from('stock_min_levels')
            .upsert(
                {
                    organization_id: organizationId,
                    warehouse_id: input.warehouseId,
                    input_code: input.inputCode,
                    input_description: input.inputDescription,
                    input_unit: input.inputUnit,
                    min_quantity: input.minQuantity,
                    notes: input.notes ?? null,
                },
                { onConflict: 'warehouse_id,input_code' }
            )
            .select('id, organization_id, warehouse_id, input_code, input_description, input_unit, min_quantity, notes, created_at, updated_at')
            .single();
        if (error) throw error;
        const r = data as Record<string, unknown>;
        return {
            id: r.id as string,
            organizationId: r.organization_id as string,
            warehouseId: r.warehouse_id as string,
            inputCode: r.input_code as string,
            inputDescription: r.input_description as string,
            inputUnit: r.input_unit as string,
            minQuantity: Number(r.min_quantity),
            notes: r.notes as string | undefined,
            created_at: r.created_at as string,
            updated_at: r.updated_at as string,
        };
    },

    async deleteMinLevel(id: string): Promise<void> {
        const { error } = await supabase.from('stock_min_levels').delete().eq('id', id);
        if (error) throw error;
    },
};
