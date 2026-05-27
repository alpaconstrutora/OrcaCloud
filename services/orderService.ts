import { supabase } from '../lib/supabase';
import { PurchaseOrder, PurchaseOrderItem, FinancialTransaction } from '../types';
import { notificationService } from './notificationService';
import { supplierService } from './supplierService';
import { financialService } from './financialService';
import { sanitizeFileName } from '../utils/storageUtils';
import { webhookService } from './webhookService';
import { projectService } from './projectService';
import { receiptService, CreateReceiptItemInput } from './receiptService';
import { discrepancyService } from './discrepancyService';
import { notificationLogService } from './notificationLogService';
import { zApiService } from './zApiService';
import { appSettingsService } from './appSettingsService';

type DbOrderRow = { id: string; number: string; project_id: string; supplier_id: string; delivery_date: string; separation_date?: string; shipped_date?: string; actual_delivery_date?: string; status: PurchaseOrder['status']; payment_method?: string; payment_term_type?: PurchaseOrder['paymentTermType']; payment_days?: number; payment_installments?: number; is_financial_approved?: boolean; delivery_method?: string; delivery_location?: string; received_at?: string; receipt_photo_path?: string; receipt_notes?: string; discrepancy_report?: PurchaseOrder['discrepancyReport']; bank_account?: string; cost_center?: string; chart_of_accounts?: string; notes?: string; items: PurchaseOrderItem[]; version?: number; created_at: string; status_updated_at?: string; };

export const orderService = {
    async createOrder(order: Omit<PurchaseOrder, 'id' | 'created_at' | 'updated_at'>) {
        // Generate a simple number if not provided (e.g. PO-Timestamp) or let backend handle it
        // For now, we'll generate a simple one
        const { orderPrefix } = appSettingsService.get();
        const number = `${orderPrefix}${Date.now().toString().slice(-6)}`;

        const { data, error } = await supabase
            .from('purchase_orders')
            .insert({
                number,
                project_id: order.projectId,
                supplier_id: order.supplierId,
                ...(order.empresaId ? { empresa_id: order.empresaId } : {}),
                delivery_date: order.deliveryDate,
                status: order.status || 'Rascunho',
                status_updated_at: new Date().toISOString(),
                payment_method: order.paymentMethod,
                payment_term_type: order.paymentTermType,
                payment_days: order.paymentDays,
                payment_installments: order.paymentInstallments,
                is_financial_approved: order.isFinancialApproved || false,
                delivery_method: order.deliveryMethod,
                delivery_location: order.deliveryLocation,
                bank_account: order.bankAccount,
                cost_center: order.costCenter,
                chart_of_accounts: order.chartOfAccounts,
                notes: order.notes,
                items: order.items
            })
            .select()
            .single();

        if (error) throw error;

        // Trigger Make.com Webhook if Enviado at creation
        if (order.status === 'Enviado') {
            try {
                const supplierData = data.supplier_id ? await supplierService.getById(data.supplier_id) : undefined;
                const projectData = data.project_id ? await projectService.loadProject(data.project_id) : undefined;
                const fullOrder = this.mapDbOrderToType(data as DbOrderRow, {});
                await webhookService.triggerOrderSentWebhook(fullOrder, supplierData ?? undefined, projectData ?? undefined);
                notificationLogService.log({
                    orderId: data.id,
                    channel: 'webhook',
                    recipient: supplierData?.email,
                    subject: `Pedido ${data.number} enviado via automação`,
                    status: 'sent',
                    metadata: { event: 'order_sent', supplier: supplierData?.name },
                });
            } catch (webhookErr: unknown) {
                const webhookError = webhookErr instanceof Error ? webhookErr : new Error(String(webhookErr));
                console.error("[WEBHOOK] Failed to trigger on creation:", webhookError);
                notificationLogService.log({
                    orderId: data.id,
                    channel: 'webhook',
                    status: 'failed',
                    error: webhookError.message,
                    metadata: { event: 'order_sent' },
                });
            }
        }

        return data;
    },

    async listOrders(projectId?: string, supplierId?: string, supplierEmail?: string) {
        let supplierIds: string[] = [];

        if (supplierId) {
            supplierIds.push(supplierId);
        }

        // Robustness: If email is provided, find all associated IDs (past and present)
        // This handles cases where a supplier might have been re-registered
        if (supplierEmail) {
            const { data: sups } = await supabase
                .from('suppliers')
                .select('id')
                .eq('email', supplierEmail.toLowerCase());

            if (sups) {
                sups.forEach(s => {
                    if (!supplierIds.includes(s.id)) supplierIds.push(s.id);
                });
            }
        }

        let query = supabase
            .from('purchase_orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (projectId) {
            query = query.eq('project_id', projectId);
        }

        if (supplierIds.length > 0) {
            query = query.in('supplier_id', supplierIds);
            // Hide draft orders from suppliers
            query = query.neq('status', 'Rascunho');
        }

        const { data: orders, error } = await query;
        if (error) throw error;

        // Fetch suppliers separately — implicit FK join can return 404 when schema cache is stale
        const uniqueSupplierIds = Array.from(new Set((orders || []).map(o => o.supplier_id).filter(Boolean)));
        let supplierMap: Record<string, string> = {};
        if (uniqueSupplierIds.length > 0) {
            const { data: sups } = await supabase
                .from('suppliers')
                .select('id, name')
                .in('id', uniqueSupplierIds);
            if (sups) sups.forEach(s => { supplierMap[s.id] = s.name; });
        }

        // Fetch projects separately — same reason: avoid implicit FK join 404
        const uniqueProjectIds = Array.from(new Set((orders || []).map(o => o.project_id).filter(Boolean)));
        let projectMap: Record<string, { name: string; settings: { classification?: string; linkedProjectName?: string } }> = {};
        if (uniqueProjectIds.length > 0) {
            const { data: projs } = await supabase
                .from('projects')
                .select('id, name, settings')
                .in('id', uniqueProjectIds);
            if (projs) projs.forEach(p => { projectMap[p.id] = { name: p.name, settings: p.settings }; });
        }

        type DbOrderRow = { id: string; number: string; project_id: string; supplier_id: string; delivery_date: string; separation_date?: string; shipped_date?: string; actual_delivery_date?: string; status: PurchaseOrder['status']; payment_method?: string; payment_term_type?: PurchaseOrder['paymentTermType']; payment_days?: number; payment_installments?: number; is_financial_approved?: boolean; delivery_method?: string; delivery_location?: string; received_at?: string; receipt_photo_path?: string; receipt_notes?: string; discrepancy_report?: PurchaseOrder['discrepancyReport']; bank_account?: string; cost_center?: string; chart_of_accounts?: string; notes?: string; items: PurchaseOrderItem[]; version?: number; created_at: string; status_updated_at?: string; };
        // Map database columns to type
        return (orders || []).map((item: DbOrderRow) => {
            const project = projectMap[item.project_id];
            return {
                id: item.id,
                number: item.number,
                projectId: item.project_id,
                projectName: project?.name || '-',
                projectClassification: project?.settings?.classification,
                linkedProjectName: project?.settings?.linkedProjectName,
                supplierId: item.supplier_id,
                supplierName: supplierMap[item.supplier_id] || '-', // From manual map
                deliveryDate: item.delivery_date,
                separationDate: item.separation_date,
                shippedDate: item.shipped_date,
                actualDeliveryDate: item.actual_delivery_date,
                status: item.status,
                paymentMethod: item.payment_method,
                paymentTermType: item.payment_term_type,
                paymentDays: item.payment_days,
                paymentInstallments: item.payment_installments,
                isFinancialApproved: item.is_financial_approved,
                deliveryMethod: item.delivery_method,
                deliveryLocation: item.delivery_location,
                receivedAt: item.received_at,
                receiptPhotoPath: item.receipt_photo_path,
                receiptNotes: item.receipt_notes,
                discrepancyReport: item.discrepancy_report,
                bankAccount: item.bank_account,
                costCenter: item.cost_center,
                chartOfAccounts: item.chart_of_accounts,
                notes: item.notes,
                items: item.items,
                version: item.version,
                created_at: item.created_at,
                status_updated_at: item.status_updated_at
            };
        }) as PurchaseOrder[];
    },

    async getOrderById(id: string): Promise<PurchaseOrder | null> {
        const { data, error } = await supabase
            .from('purchase_orders')
            .select('*')
            .eq('id', id)
            .single();
        if (error || !data) return null;
        return this.mapDbOrderToType(data, {});
    },

    async updateOrder(id: string, updates: Partial<PurchaseOrder>, expectedVersion?: number | null) {
        // Pre-flight checks (single SELECT before the update)
        const { data: currentRow, error: fetchError } = await supabase
            .from('purchase_orders')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError?.code === 'PGRST116' || !currentRow) throw new Error('Pedido não encontrado.');
        if (fetchError) throw fetchError;

        // Optimistic concurrency check: pre-flight version comparison
        if (expectedVersion !== undefined) {
            const actualVersion = currentRow.version ?? null;
            const expected = expectedVersion ?? null;
            if (actualVersion !== expected) {
                throw new Error('CONFLICT: Pedido foi modificado por outro usuário. Recarregue e tente novamente.');
            }
        }

        if (updates.isFinancialApproved === true) {
            if (!['Recebido', 'Divergência'].includes(currentRow.status)) {
                throw new Error('Aprovação financeira só é permitida para pedidos com recebimento confirmado.');
            }
        }

        const { error: updateError } = await supabase
            .from('purchase_orders')
            .update({
                ...(updates.status && {
                    status: updates.status,
                    status_updated_at: new Date().toISOString()
                }),
                ...(updates.notes !== undefined && { notes: updates.notes }),
                ...(updates.paymentMethod !== undefined && { payment_method: updates.paymentMethod }),
                ...(updates.paymentTermType !== undefined && { payment_term_type: updates.paymentTermType }),
                ...(updates.paymentDays !== undefined && { payment_days: updates.paymentDays }),
                ...(updates.paymentInstallments !== undefined && { payment_installments: updates.paymentInstallments }),
                ...(updates.isFinancialApproved !== undefined && { is_financial_approved: updates.isFinancialApproved }),
                ...(updates.deliveryMethod !== undefined && { delivery_method: updates.deliveryMethod }),
                ...(updates.deliveryLocation !== undefined && { delivery_location: updates.deliveryLocation }),
                ...(updates.receivedAt !== undefined && { received_at: updates.receivedAt }),
                ...(updates.receiptPhotoPath !== undefined && { receipt_photo_path: updates.receiptPhotoPath }),
                ...(updates.receiptNotes !== undefined && { receipt_notes: updates.receiptNotes }),
                ...(updates.discrepancyReport !== undefined && { discrepancy_report: updates.discrepancyReport }),
                ...(updates.bankAccount !== undefined && { bank_account: updates.bankAccount }),
                ...(updates.costCenter !== undefined && { cost_center: updates.costCenter }),
                ...(updates.chartOfAccounts !== undefined && { chart_of_accounts: updates.chartOfAccounts }),
                ...(updates.items && { items: updates.items }),
                ...(updates.supplierId && { supplier_id: updates.supplierId }),
                ...(updates.deliveryDate !== undefined && { delivery_date: updates.deliveryDate || null }),
                ...(updates.separationDate !== undefined && { separation_date: updates.separationDate || null }),
                ...(updates.shippedDate !== undefined && { shipped_date: updates.shippedDate || null }),
                ...(updates.actualDeliveryDate !== undefined && { actual_delivery_date: updates.actualDeliveryDate || null }),
                ...(updates.projectId && { project_id: updates.projectId }),
                ...(expectedVersion !== undefined && { version: (expectedVersion ?? 0) + 1 }),
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (updateError) throw updateError;

        // Fetch the updated row separately — avoids PostgREST RETURNING quirks
        const { data, error: refetchError } = await supabase
            .from('purchase_orders')
            .select('*')
            .eq('id', id)
            .single();

        if (refetchError || !data) throw new Error('Pedido não encontrado após atualização.');

        if (updates.status) {
            // 1. Notify Supplier
            try {
                if (data.supplier_id) {
                    const supplierData = await supplierService.getById(data.supplier_id);
                    if (supplierData?.email) {
                        const subject = appSettingsService.interpolateEmailSubject({ orderNumber: data.number || '', newStatus: updates.status });
                        const body    = appSettingsService.interpolateEmailBody({ orderNumber: data.number || '', newStatus: updates.status });
                        await notificationService.sendNotification({
                            recipientEmail: supplierData.email,
                            title: subject,
                            message: body,
                            link: `/supplier-portal?tab=orders&order=${data.id}`,
                            type: 'status_change'
                        });
                        notificationLogService.log({
                            orderId: data.id,
                            channel: 'email',
                            recipient: supplierData.email,
                            subject,
                            body,
                            status: 'sent',
                            metadata: { status: updates.status },
                        });
                    }
                }
            } catch (notifyErr: unknown) {
                const notifyError = notifyErr instanceof Error ? notifyErr : new Error(String(notifyErr));
                console.error("[NOTIFICATION SYSTEM] Failed to trigger notification:", notifyError.message);
                notificationLogService.log({
                    orderId: data.id,
                    channel: 'email',
                    status: 'failed',
                    error: notifyError.message,
                    metadata: { status: updates.status },
                });
            }

            // 2. Trigger Financial Sync if Entregue, Recebido or Divergência
            if (['Entregue', 'Recebido', 'Divergência'].includes(updates.status)) {
                try {
                    await financialService.syncOrderToFinance(id);
                } catch (finError) {
                    console.error("[ORDER SERVICE] Financial sync failed:", finError);
                }
            }

            // 3. Trigger Make.com Webhook if Enviado
            if (updates.status === 'Enviado') {
                try {
                    const supplierData = data.supplier_id ? await supplierService.getById(data.supplier_id) : undefined;
                    const projectData = data.project_id ? await projectService.loadProject(data.project_id) : undefined;

                    const fullOrder = this.mapDbOrderToType(data as DbOrderRow, {});
                    await webhookService.triggerOrderSentWebhook(fullOrder, supplierData ?? undefined, projectData ?? undefined);
                    notificationLogService.log({
                        orderId: data.id,
                        channel: 'webhook',
                        recipient: supplierData?.email,
                        subject: `Pedido ${data.number} enviado via automação`,
                        status: 'sent',
                        metadata: { event: 'order_sent', supplier: supplierData?.name },
                    });
                } catch (webhookErr: unknown) {
                    const webhookError = webhookErr instanceof Error ? webhookErr : new Error(String(webhookErr));
                    console.error("[ORDER SERVICE] Make.com Webhook trigger failed:", webhookError);
                    notificationLogService.log({
                        orderId: data.id,
                        channel: 'webhook',
                        status: 'failed',
                        error: webhookError.message,
                        metadata: { event: 'order_sent' },
                    });
                }
            }

            // 4. WhatsApp via Z-API if status Enviado and supplier has phone
            if (updates.status === 'Enviado' && zApiService.isConfigured()) {
                try {
                    const supplierForWa = data.supplier_id
                        ? await supplierService.getById(data.supplier_id) : undefined;
                    if (supplierForWa?.phone) {
                        const projectForWa = data.project_id
                            ? await projectService.loadProject(data.project_id) : undefined;
                        const orderTotal = (data.items as PurchaseOrderItem[] || []).reduce(
                            (s: number, i: PurchaseOrderItem) => s + (i.total || 0), 0
                        );
                        const message = zApiService.buildOrderSentMessage({
                            supplierName: supplierForWa.name,
                            orderNumber:  data.number || id,
                            projectName:  projectForWa?.name || 'Obra',
                            itemCount:    (data.items || []).length,
                            total:        orderTotal,
                            deliveryDate: data.delivery_date,
                        });
                        await zApiService.sendText(supplierForWa.phone, message, data.id);
                    }
                } catch (waError: unknown) {
                    console.error('[ZAPI] Auto WhatsApp send failed:', waError);
                    // error already logged inside zApiService.sendText
                }
            }
        }

        return data;
    },

    mapDbOrderToType(item: DbOrderRow, supplierMap: Record<string, string>): PurchaseOrder {
        return {
            id: item.id,
            number: item.number,
            projectId: item.project_id,
            supplierId: item.supplier_id,
            supplierName: supplierMap[item.supplier_id] || '-',
            deliveryDate: item.delivery_date,
            separationDate: item.separation_date,
            shippedDate: item.shipped_date,
            actualDeliveryDate: item.actual_delivery_date,
            status: item.status,
            paymentMethod: item.payment_method,
            paymentTermType: item.payment_term_type,
            paymentDays: item.payment_days,
            paymentInstallments: item.payment_installments,
            isFinancialApproved: item.is_financial_approved,
            deliveryMethod: item.delivery_method,
            deliveryLocation: item.delivery_location,
            receivedAt: item.received_at,
            receiptPhotoPath: item.receipt_photo_path,
            receiptNotes: item.receipt_notes,
            discrepancyReport: item.discrepancy_report,
            bankAccount: item.bank_account,
            costCenter: item.cost_center,
            chartOfAccounts: item.chart_of_accounts,
            notes: item.notes,
            items: item.items,
            version: item.version,
            created_at: item.created_at,
            status_updated_at: item.status_updated_at
        };
    },

    async confirmOrderReceipt(orderId: string, updates: {
        status: 'Recebido' | 'Divergência' | 'Parcial',
        photo?: File,
        notes?: string,
        receiptItems?: CreateReceiptItemInput[],
        // legacy fields kept for backwards-compat (display fallback)
        discrepancies?: PurchaseOrder['discrepancyReport'],
        existingPhotoPath?: string,
        existingReceivedAt?: string,
        version?: number
    }) {
        // 1. Write to purchase_receipts + purchase_receipt_items
        const receipt = await receiptService.createReceipt(orderId, {
            status: updates.status,
            notes: updates.notes,
            photo: updates.photo,
            items: updates.receiptItems ?? [],
        });

        // 1b. Write discrepancies with workflow tracking
        const discrepantItems = (updates.receiptItems ?? []).filter(
            item => item.issue || item.quantityReceived < item.quantityOrdered
        );
        if (discrepantItems.length > 0) {
            await discrepancyService.createFromReceiptItems(
                orderId,
                receipt.id,
                discrepantItems.map(item => ({
                    orderItemCode: item.code,
                    description: item.description,
                    unit: item.unit,
                    issue: item.issue ?? 'faltando',
                    quantity: Math.max(0, item.quantityOrdered - item.quantityReceived),
                    notes: item.notes,
                }))
            );
        }

        // 2. Update order status (and legacy inline fields for display fallback)
        let photoPath = updates.existingPhotoPath;
        if (updates.photo) {
            // photo already uploaded by receiptService; re-upload skipped —
            // keep existing path or leave empty (legacy field only)
            photoPath = updates.existingPhotoPath;
        }

        return this.updateOrder(orderId, {
            status: updates.status === 'Parcial' ? 'Entregue' : updates.status,
            receivedAt: updates.existingReceivedAt || new Date().toISOString(),
            receiptNotes: updates.notes,
            receiptPhotoPath: photoPath,
            discrepancyReport: updates.discrepancies
        }, updates.version);
    },

    async deleteOrder(id: string) {
        const { data: order, error: fetchError } = await supabase
            .from('purchase_orders')
            .select('status, project_id')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        if (['Entregue', 'Recebido', 'Divergência'].includes(order.status)) {
            throw new Error(`Pedido com status "${order.status}" não pode ser excluído. Use "Cancelar" como alternativa.`);
        }

        // Check and clean up financial transactions linked to this order
        if (order.project_id) {
            const { data: project } = await supabase
                .from('projects')
                .select('settings')
                .eq('id', order.project_id)
                .single();

            if (project) {
                const transactions: FinancialTransaction[] = project.settings?.financialInfo?.transactions || [];
                const linked = transactions.filter(t => (t as FinancialTransaction & { orderId?: string }).orderId === id);

                if (linked.some(t => !['PENDING', 'CANCELLED'].includes(t.status))) {
                    throw new Error('Este pedido possui lançamentos financeiros já processados e não pode ser excluído.');
                }

                if (linked.length > 0) {
                    const cleaned = transactions.filter(t => (t as FinancialTransaction & { orderId?: string }).orderId !== id);
                    await supabase
                        .from('projects')
                        .update({
                            settings: {
                                ...project.settings,
                                financialInfo: {
                                    ...project.settings.financialInfo,
                                    transactions: cleaned
                                }
                            }
                        })
                        .eq('id', order.project_id);
                }
            }
        }

        const { error } = await supabase
            .from('purchase_orders')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return true;
    },

    async duplicateOrder(id: string) {
        // 1. Fetch current order
        const { data: original, error: fetchError } = await supabase
            .from('purchase_orders')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        // 2. Prepare new order data
        const { id: _, created_at: __, updated_at: ___, number: ____, ...rest } = original;
        
        // Generate new number
        const { orderPrefix, orderDuplicateSuffix } = appSettingsService.get();
        const newNumber = `${orderPrefix}${Date.now().toString().slice(-6)}${orderDuplicateSuffix}`;

        // 3. Insert as new order
        const { data: NewOrder, error: insertError } = await supabase
            .from('purchase_orders')
            .insert({
                ...rest,
                number: newNumber,
                status: 'Rascunho',
                status_updated_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                version: 1
            })
            .select()
            .single();

        if (insertError) throw insertError;
        return NewOrder;
    }
};
