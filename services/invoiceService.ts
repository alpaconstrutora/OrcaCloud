import { supabase } from '../lib/supabase';
import { Invoice } from '../types';
import { financialService } from './financialService';
import { sanitizeFileName } from '../utils/storageUtils';

export const invoiceService = {
    /**
     * Upload an invoice file and create a record in the database.
     */
    async uploadInvoice(supplierId: string, file: File, notes?: string, orderId?: string): Promise<Invoice> {
        const fileName = `${supplierId}/${Date.now()}_${sanitizeFileName(file.name)}`;

        // 1. Upload file to Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('invoices')
            .upload(fileName, file);

        if (uploadError) throw uploadError;

        // 2. Create record in DB
        const { data: invoice, error: dbError } = await supabase
            .from('invoices')
            .insert({
                supplier_id: supplierId,
                order_id: orderId,
                file_path: uploadData.path,
                file_name: file.name,
                notes: notes,
                status: 'pending' // Default status
            })
            .select()
            .single();

        if (dbError) {
            // Cleanup file if DB insert fails
            await supabase.storage.from('invoices').remove([uploadData.path]);
            throw dbError;
        }

        const result: Invoice = {
            id: invoice.id,
            supplierId: invoice.supplier_id,
            orderId: invoice.order_id,
            filePath: invoice.file_path,
            fileName: invoice.file_name,
            amount: invoice.amount,
            status: invoice.status,
            notes: invoice.notes,
            createdAt: invoice.created_at
        };

        // 3. Trigger Financial Sync if linked to order
        if (orderId) {
            try {
                await financialService.syncOrderToFinance(orderId);
            } catch (err) {
                console.error("[FINANCIAL] Error syncing on invoice upload:", err);
            }
        }

        return result;
    },

    /**
     * List invoices for a specific supplier.
     */
    async listInvoices(supplierId: string): Promise<Invoice[]> {
        const { data, error } = await supabase
            .from('invoices')
            .select('*')
            .eq('supplier_id', supplierId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return data.map((invoice: any) => ({
            id: invoice.id,
            supplierId: invoice.supplier_id,
            orderId: invoice.order_id,
            filePath: invoice.file_path,
            fileName: invoice.file_name,
            amount: invoice.amount,
            status: invoice.status,
            notes: invoice.notes,
            createdAt: invoice.created_at
        }));
    },

    /**
     * List invoices linked to a specific purchase order.
     */
    async listInvoicesByOrder(orderId: string): Promise<Invoice[]> {
        const { data, error } = await supabase
            .from('invoices')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return data.map((invoice: any) => ({
            id: invoice.id,
            supplierId: invoice.supplier_id,
            orderId: invoice.order_id,
            filePath: invoice.file_path,
            fileName: invoice.file_name,
            amount: invoice.amount,
            status: invoice.status,
            notes: invoice.notes,
            createdAt: invoice.created_at
        }));
    },

    /**
     * Get a public URL for viewing the invoice.
     */
    getInvoiceUrl(filePath: string) {
        const { data } = supabase.storage
            .from('invoices')
            .getPublicUrl(filePath);

        return data.publicUrl;
    },

    /**
     * Link an existing invoice to a purchase order.
     */
    async updateInvoiceOrder(invoiceId: string, orderId: string | null) {
        const { error } = await supabase
            .from('invoices')
            .update({ order_id: orderId })
            .eq('id', invoiceId);

        if (error) throw error;

        // Trigger sync if order set
        if (orderId) {
            try {
                await financialService.syncOrderToFinance(orderId);
            } catch (err) {
                console.error("[FINANCIAL] Error syncing on invoice link:", err);
            }
        }
    },

    /**
     * Lista todos os invoices acessíveis ao usuário, com nome do fornecedor.
     * Faz duas queries separadas para evitar problemas de RLS no join.
     */
    async listAll(organizationId?: string): Promise<(Invoice & { supplierName?: string })[]> {
        const { data: invoicesData, error: invErr } = await supabase
            .from('invoices')
            .select('*')
            .order('created_at', { ascending: false });
        if (invErr) throw invErr;

        const rows = invoicesData || [];
        if (rows.length === 0) return [];

        // Busca fornecedores únicos referenciados
        const supplierIds = [...new Set(rows.map((r: any) => r.supplier_id).filter(Boolean))];
        let supplierMap: Record<string, { name: string; organization_id: string }> = {};

        if (supplierIds.length > 0) {
            const { data: suppData } = await supabase
                .from('suppliers')
                .select('id, name, organization_id')
                .in('id', supplierIds);
            (suppData || []).forEach((s: any) => { supplierMap[s.id] = s; });
        }

        return rows
            .filter((row: any) => {
                if (!organizationId) return true;
                return supplierMap[row.supplier_id]?.organization_id === organizationId;
            })
            .map((row: any) => ({
                id: row.id,
                supplierId: row.supplier_id,
                orderId: row.order_id,
                filePath: row.file_path,
                fileName: row.file_name,
                amount: row.amount,
                dueDate: row.due_date,
                costCenterId: row.cost_center_id,
                chartOfAccountsId: row.chart_of_accounts_id,
                status: row.status,
                notes: row.notes,
                createdAt: row.created_at,
                supplierName: supplierMap[row.supplier_id]?.name,
            }));
    },

    /**
     * Marca invoice como pago.
     */
    async marcarPago(id: string): Promise<void> {
        const { error } = await supabase
            .from('invoices')
            .update({ status: 'paid' })
            .eq('id', id);
        if (error) throw error;
    },

    /**
     * Delete an invoice.
     */
    async deleteInvoice(id: string, filePath: string) {
        // 1. Delete from DB
        const { error: dbError } = await supabase
            .from('invoices')
            .delete()
            .eq('id', id);

        if (dbError) throw dbError;

        // 2. Delete from Storage
        const { error: storageError } = await supabase.storage
            .from('invoices')
            .remove([filePath]);

        if (storageError) console.error("Error removing file from storage:", storageError);
    }
};
