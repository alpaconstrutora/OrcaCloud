import { supabase } from '../lib/supabase';
import {
    Warehouse,
    StockMovement,
    StockBalance,
    SupplierLeadTime,
    CreateStockMovementInput,
    CreateWarehouseInput,
    CreateSupplierLeadTimeInput,
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
};
