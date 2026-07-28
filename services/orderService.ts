import { supabase } from '../lib/supabase';
import { PurchaseOrder, PurchaseOrderItem, FinancialTransaction } from '../types';
import { notificationService } from './notificationService';
import { supplierService, getSupplierDisplayName } from './supplierService';
import { financialService } from './financialService';
import { sanitizeFileName } from '../utils/storageUtils';
import { webhookService } from './webhookService';
import { projectService } from './projectService';
import { receiptService, CreateReceiptItemInput } from './receiptService';
import { discrepancyService } from './discrepancyService';
import { notificationLogService } from './notificationLogService';
import { whatsappService } from './whatsappService';
import { approvalService } from './approvalService';
import { appSettingsService } from './appSettingsService';
import { generateOrderNumber } from './orderNumberingService';
import { processService } from './processService';

type DbOrderRow = { id: string; number: string; project_id: string; supplier_id: string; delivery_date: string; separation_date?: string; shipped_date?: string; actual_delivery_date?: string; status: PurchaseOrder['status']; payment_method?: string; payment_term_type?: PurchaseOrder['paymentTermType']; payment_days?: number; payment_installments?: number; is_financial_approved?: boolean; delivery_method?: string; delivery_location?: string; received_at?: string; receipt_photo_path?: string; receipt_notes?: string; discrepancy_report?: PurchaseOrder['discrepancyReport']; bank_account?: string; cost_center?: string; cost_center_id?: string; chart_of_accounts?: string; notes?: string; items: PurchaseOrderItem[]; version?: number; created_at: string; status_updated_at?: string; };

/**
 * Traduz a violação do índice único de `purchase_orders.number` (23505) para uma
 * mensagem acionável. O sequencial é por obra, então o número só repete quando
 * duas obras compartilham o mesmo par (código do empreendimento, código da obra)
 * — que é exatamente o que o usuário precisa corrigir.
 */
function duplicateNumberError(error: { code?: string; message?: string }, number: string): Error {
    if (error?.code === '23505' && (error.message || '').includes('number')) {
        return new Error(
            `Já existe um pedido com o número ${number}. Isso acontece quando duas obras têm o ` +
            'mesmo código dentro do mesmo empreendimento — ajuste o código da obra em Obra › Editar.',
        );
    }
    return error instanceof Error ? error : new Error(error?.message || 'Erro ao salvar o pedido.');
}

export const orderService = {
    async createOrder(order: Omit<PurchaseOrder, 'id' | 'created_at' | 'updated_at'>) {
        // Nomenclatura PC-{empreendimento}-{obra}-{seq} (Configurações › Nomenclatura).
        // Lança MissingCodeError — com mensagem pronta para a tela — quando a obra
        // ou o empreendimento está sem código; o pedido NÃO é criado nesse caso.
        const number = await generateOrderNumber(order.projectId);

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
                cost_center_id: order.costCenterId,
                chart_of_accounts: order.chartOfAccounts,
                notes: order.notes,
                items: order.items
            })
            .select()
            .single();

        if (error) throw duplicateNumberError(error, number);

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
            .select('id, number, project_id, supplier_id, empresa_id, delivery_date, separation_date, shipped_date, actual_delivery_date, status, payment_method, payment_term_type, payment_days, payment_installments, is_financial_approved, delivery_method, delivery_location, received_at, receipt_photo_path, receipt_notes, discrepancy_report, bank_account, cost_center, cost_center_id, chart_of_accounts, notes, items, version, created_at, updated_at, status_updated_at')
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
        let supplierMap: Record<string, { name: string; nickname?: string | null }> = {};
        if (uniqueSupplierIds.length > 0) {
            const { data: sups } = await supabase
                .from('suppliers')
                .select('id, name, nickname')
                .in('id', uniqueSupplierIds);
            if (sups) sups.forEach(s => { supplierMap[s.id] = { name: s.name, nickname: s.nickname }; });
        }
        const nameMode = appSettingsService.get().supplierNameDisplay;

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

        type DbOrderRow = { id: string; number: string; project_id: string; supplier_id: string; delivery_date: string; separation_date?: string; shipped_date?: string; actual_delivery_date?: string; status: PurchaseOrder['status']; payment_method?: string; payment_term_type?: PurchaseOrder['paymentTermType']; payment_days?: number; payment_installments?: number; is_financial_approved?: boolean; delivery_method?: string; delivery_location?: string; received_at?: string; receipt_photo_path?: string; receipt_notes?: string; discrepancy_report?: PurchaseOrder['discrepancyReport']; bank_account?: string; cost_center?: string; cost_center_id?: string; chart_of_accounts?: string; notes?: string; items: PurchaseOrderItem[]; version?: number; created_at: string; status_updated_at?: string; };
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
                supplierName: supplierMap[item.supplier_id] ? getSupplierDisplayName(supplierMap[item.supplier_id], nameMode) : '-', // From manual map
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
                costCenterId: item.cost_center_id,
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
            .select('id, number, project_id, supplier_id, empresa_id, delivery_date, separation_date, shipped_date, actual_delivery_date, status, payment_method, payment_term_type, payment_days, payment_installments, is_financial_approved, delivery_method, delivery_location, received_at, receipt_photo_path, receipt_notes, discrepancy_report, bank_account, cost_center, cost_center_id, chart_of_accounts, notes, items, version, created_at, updated_at, status_updated_at')
            .eq('id', id)
            .single();
        if (error || !data) return null;
        return this.mapDbOrderToType(data, {});
    },

    async updateOrder(id: string, updates: Partial<PurchaseOrder>, expectedVersion?: number | null) {
        // Pre-flight checks (single SELECT before the update)
        const { data: currentRow, error: fetchError } = await supabase
            .from('purchase_orders')
            .select('id, number, project_id, supplier_id, empresa_id, delivery_date, separation_date, shipped_date, actual_delivery_date, status, payment_method, payment_term_type, payment_days, payment_installments, is_financial_approved, delivery_method, delivery_location, received_at, receipt_photo_path, receipt_notes, discrepancy_report, bank_account, cost_center, cost_center_id, chart_of_accounts, notes, items, version, created_at, updated_at, status_updated_at')
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
                ...(updates.costCenterId !== undefined && { cost_center_id: updates.costCenterId || null }),
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
            .select('id, number, project_id, supplier_id, empresa_id, delivery_date, separation_date, shipped_date, actual_delivery_date, status, payment_method, payment_term_type, payment_days, payment_installments, is_financial_approved, delivery_method, delivery_location, received_at, receipt_photo_path, receipt_notes, discrepancy_report, bank_account, cost_center, cost_center_id, chart_of_accounts, notes, items, version, created_at, updated_at, status_updated_at')
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

            // 2b. Costura P2P — dispara templates de Processos (EVENTO) para
            // Recebido/Divergência. Best-effort: nunca deve derrubar o pedido.
            if (['Recebido', 'Divergência'].includes(updates.status)) {
                try {
                    const eventKey = updates.status === 'Recebido' ? 'purchase_order.received' : 'purchase_order.divergence';
                    const orgId = data.empresa_id
                        ? (await supabase.from('companies').select('org_id').eq('id', data.empresa_id).maybeSingle()).data?.org_id
                        : null;
                    if (orgId) {
                        await processService.triggerEvent(orgId, eventKey, {
                            title: `Pedido ${data.number} — ${updates.status}`,
                            purchaseOrderId: data.id,
                            supplierId: data.supplier_id ?? undefined,
                            projectId: data.project_id ?? undefined,
                        });
                    }
                } catch (procError) {
                    console.error("[ORDER SERVICE] Process trigger failed:", procError);
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

            // 4. WhatsApp automático quando status muda para Enviado
            if (updates.status === 'Enviado' && whatsappService.isConfigured()) {
                try {
                    const supplierForWa = data.supplier_id
                        ? await supplierService.getById(data.supplier_id) : undefined;
                    if (supplierForWa?.phone) {
                        const projectForWa = data.project_id
                            ? await projectService.loadProject(data.project_id) : undefined;
                        const orderTotal = (data.items as PurchaseOrderItem[] || []).reduce(
                            (s: number, i: PurchaseOrderItem) => s + (i.total || 0), 0
                        );
                        const shareToken = await whatsappService.generateShareToken(data.id);
                        await whatsappService.sendOrderTemplate({
                            phone:        supplierForWa.phone,
                            orderId:      data.id,
                            supplierName: supplierForWa.name,
                            orderNumber:  data.number || id,
                            projectName:  projectForWa?.name || 'Obra',
                            itemCount:    (data.items || []).length,
                            total:        orderTotal,
                            deliveryDate: data.delivery_date,
                            shareToken,
                        });
                    }
                } catch (waError: unknown) {
                    console.error('[WhatsApp] Auto-send failed:', waError);
                }
            }
        }

        return data;
    },

    mapDbOrderToType(item: DbOrderRow, supplierMap: Record<string, { name: string; nickname?: string | null }>): PurchaseOrder {
        const nameMode = appSettingsService.get().supplierNameDisplay;
        return {
            id: item.id,
            number: item.number,
            projectId: item.project_id,
            supplierId: item.supplier_id,
            supplierName: supplierMap[item.supplier_id] ? getSupplierDisplayName(supplierMap[item.supplier_id], nameMode) : '-',
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
            .select('id, number, project_id, supplier_id, empresa_id, delivery_date, separation_date, shipped_date, actual_delivery_date, status, payment_method, payment_term_type, payment_days, payment_installments, is_financial_approved, delivery_method, delivery_location, received_at, receipt_photo_path, receipt_notes, discrepancy_report, bank_account, cost_center, cost_center_id, chart_of_accounts, notes, items, version, created_at, updated_at, status_updated_at')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        // 2. Prepare new order data
        const { id: _, created_at: __, updated_at: ___, number: ____, ...rest } = original;
        
        // Duplicata consome um sequencial novo da mesma obra e carrega o sufixo,
        // para não haver dois pedidos com o mesmo número.
        const { orderDuplicateSuffix } = appSettingsService.get();
        const newNumber = `${await generateOrderNumber(original.project_id)}${orderDuplicateSuffix}`;

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

        if (insertError) throw duplicateNumberError(insertError, newNumber);
        return NewOrder;
    },

    // ─── Aprovação multinível (modelo unificado — approvalService) ──────
    // purchase_orders é escopada por empresa_id e seu valor vem de items[].total;
    // por isso passamos organizationId e o total explicitamente ao submit.
    // is_financial_approved (pós-recebimento) permanece independente (Regra 12).

    async submitForApproval(orderId: string, organizationId: string): Promise<void> {
        const { data: po, error } = await supabase
            .from('purchase_orders')
            .select('items')
            .eq('id', orderId)
            .single();
        if (error) throw error;
        const total = ((po?.items as PurchaseOrderItem[]) || [])
            .reduce((s, i) => s + (i.total || 0), 0);
        await approvalService.submit('purchase_order', orderId, {}, { organizationId, amount: total });
    },

    async approveOrder(orderId: string, level: 1 | 2, approvedBy: string, notes?: string): Promise<void> {
        await approvalService.approve(
            'purchase_order', orderId, level, approvedBy,
            { level1_label: 'Gestor', level2_label: 'Financeiro/Diretoria' },
            notes,
        );
    },

    async rejectOrder(orderId: string, rejectedBy: string, reason: string): Promise<void> {
        await approvalService.reject('purchase_order', orderId, rejectedBy, reason);
    }
};
