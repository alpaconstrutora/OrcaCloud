import { PurchaseOrder, ContractTemplate, QuotationRequest, QuotationResponse } from '../types';
import { supabase } from '../lib/supabase';

const MAKE_WEBHOOK_URL = import.meta.env.VITE_MAKE_WEBHOOK_URL || '';

interface WebhookPayload {
    event: string;
    timestamp: string;
    order: {
        id: string;
        number: string;
        status: string;
        total: number;
        items: any[];
        notes?: string;
    };
    supplier?: {
        name: string;
        email?: string;
        phone?: string;
    };
    project?: {
        id?: string;
        name: string;
        location?: string;
    };
}

export const webhookService = {
    async pingWebhook(url: string) {
        if (!url) throw new Error('URL invalid');
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event: 'ping', timestamp: new Date().toISOString(), message: 'Connection Test' })
            });
            if (!response.ok) throw new Error(`Status: ${response.status}`);
            return true;
        } catch (error: any) {
            console.error('[WEBHOOK] Ping failed:', error);
            throw error;
        }
    },

    async triggerOrderSentWebhook(order: PurchaseOrder, supplier?: any, project?: any, isRetry = false) {
        // ... (existing logic for targetUrl)
        const settings = project?.settings || project;
        const dynamicUrl = settings?.financialInfo?.webhookUrl || settings?.webhookUrl;
        const targetUrl = dynamicUrl || MAKE_WEBHOOK_URL;

        if (!targetUrl || targetUrl.includes('your-webhook-id')) {
            console.warn('[WEBHOOK] Webhook URL not configured. Skipping trigger.');
            return;
        }

        const payload: WebhookPayload = {
            event: 'order_sent',
            timestamp: new Date().toISOString(),
            order: {
                id: order.id || '',
                number: order.number || 'N/A',
                status: order.status,
                total: order.items.reduce((sum, item) => sum + (item.total || 0), 0),
                items: order.items,
                notes: order.notes
            },
            supplier: supplier ? {
                name: supplier.name,
                email: supplier.email,
                phone: supplier.phone
            } : undefined,
            project: project ? {
                id: project.id,
                name: project.name,
                location: project.settings?.location || project.location
            } : undefined
        };

        try {
            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            // Log history
            const historyData = {
                project_id: project?.id || project?.projectId || (order as any).project_id || (order as any).projectId,
                organization_id: (order as any).organization_id || (order as any).organizationId || project?.organizationId || project?.organization_id || project?.settings?.organizationId,
                event_type: 'order_sent' as const,
                reference_id: order.id,
                reference_name: order.number,
                status: 'success' as const,
                payload
            };
            const { error: logError } = await supabase.from('automation_history').insert(historyData);
            if (logError) console.error('[WEBHOOK] Failed to log order success history:', logError);
        } catch (error: any) {
            console.error('[WEBHOOK] Failed to send order to Make.com:', error);

            // Log error
            const historyData = {
                project_id: project?.id || project?.projectId || (order as any).project_id || (order as any).projectId,
                organization_id: (order as any).organization_id || (order as any).organizationId || project?.organizationId || project?.organization_id || project?.settings?.organization_id,
                event_type: 'order_sent' as const,
                reference_id: order.id,
                reference_name: order.number,
                status: 'error' as const,
                error_message: error.message,
                payload
            };
            const { error: logError } = await supabase.from('automation_history').insert(historyData);
            if (logError) console.error('[WEBHOOK] Failed to log order error history:', logError);

            throw error;
        }
    },

    async triggerQuotationSentWebhook(quotation: QuotationRequest, suppliers: any[], project?: any) {
        const settings = project?.settings || project;
        const dynamicUrl = settings?.financialInfo?.webhookUrl || settings?.webhookUrl;
        const targetUrl = dynamicUrl || MAKE_WEBHOOK_URL;

        if (!targetUrl || targetUrl.includes('your-webhook-id')) {
            console.warn('[WEBHOOK] Webhook URL not configured. Skipping trigger.');
            return;
        }

        const payload = {
            event: 'quotation_sent',
            timestamp: new Date().toISOString(),
            quotation: {
                id: quotation.id,
                number: quotation.number,
                title: quotation.title,
                status: quotation.status,
                deadline: quotation.deadline,
                items: quotation.items,
                deliveryDate: quotation.deliveryDate,
                deliveryMethod: quotation.deliveryMethod,
                deliveryLocation: quotation.deliveryLocation,
                paymentMethod: quotation.paymentMethod,
                paymentTermType: quotation.paymentTermType,
                paymentDays: quotation.paymentDays,
                paymentInstallments: quotation.paymentInstallments
            },
            suppliers: suppliers.map(s => ({
                id: s.supplierId || s.id,
                name: s.supplierName || s.name,
                email: s.supplierEmail || s.email,
                phone: s.supplierPhone || s.phone
            })),
            project: project ? {
                id: project.id,
                name: project.name,
                location: project.settings?.location || project.location
            } : undefined
        };

        try {
            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            // Log history
            const historyData = {
                project_id: project?.id || project?.projectId || quotation.projectId,
                organization_id: project?.organizationId || project?.organization_id || project?.settings?.organizationId,
                event_type: 'quotation_sent' as const,
                reference_id: quotation.id,
                reference_name: quotation.number,
                status: 'success' as const,
                payload
            };
            const { error: logError } = await supabase.from('automation_history').insert(historyData);
            if (logError) console.error('[WEBHOOK] Failed to log quotation success history:', logError);
        } catch (error: any) {
            console.error('[WEBHOOK] Failed to send quotation to Make.com:', error);

            // Log error
            const historyData = {
                project_id: project?.id || project?.projectId || quotation.projectId,
                organization_id: project?.organizationId || project?.organization_id || project?.settings?.organizationId,
                event_type: 'quotation_sent' as const,
                reference_id: quotation.id,
                reference_name: quotation.number,
                status: 'error' as const,
                error_message: error.message,
                payload
            };
            const { error: logError } = await supabase.from('automation_history').insert(historyData);
            if (logError) console.error('[WEBHOOK] Failed to log quotation error history:', logError);

            throw error;
        }
    },

    async triggerContractSentWebhook(contract: any, supplier?: any, project?: any, isRetry = false, template?: ContractTemplate) {
        // ... (existing logic for targetUrl fallback)
        let settings = project?.settings || project;
        // ... (organization fallback logic)

        // If no settings provided, or no URL in settings, try to get from central config
        if (!settings?.financialInfo?.contractWebhookUrl && contract.organization_id) {
            console.log(`[WEBHOOK] Getting URL via organization fallback for Contract: ${contract.number}`);
            try {
                const { data } = await supabase
                    .from('projects')
                    .select('settings')
                    .eq('name', 'Gestão Comercial')
                    .filter('settings->>organizationId', 'eq', contract.organization_id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (data?.settings) {
                    console.log('[WEBHOOK] Central configuration used.');
                    settings = data.settings;
                }
            } catch (err) {
                console.error('[WEBHOOK] Error fetching organizational settings:', err);
            }
        }

        const contractUrl = settings?.financialInfo?.contractWebhookUrl || settings?.contractWebhookUrl;
        const targetUrl = contractUrl;

        if (!targetUrl || targetUrl.includes('your-webhook-id')) {
            const errorMsg = 'Webhook URL not configured for contracts.';
            console.warn(`[WEBHOOK] ${errorMsg} Skipping.`);

            // Log failure to history before throwing
            const historyData = {
                project_id: project?.id || project?.projectId,
                organization_id: project?.organization_id || project?.organizationId || project?.settings?.organizationId,
                event_type: 'contract_sent' as const,
                reference_id: contract.id,
                reference_name: contract.number,
                status: 'error' as const,
                error_message: errorMsg,
                payload: { targetUrl }
            };
            await supabase.from('automation_history').insert(historyData);

            throw new Error(errorMsg);
        }

        const payload = {
            event: 'contract_sent',
            timestamp: new Date().toISOString(),
            template: template ? {
                id: template.id,
                name: template.name,
                externalId: template.externalId
            } : undefined,
            contract: {
                id: contract.id,
                number: contract.number,
                title: contract.title,
                type: contract.contract_type,
                nature: contract.nature,
                value: contract.original_value,
                startDate: contract.start_date,
                endDate: contract.end_date,
                status: contract.status,
                paymentMethod: contract.payment_method,
                installments: contract.payment_installments
            },
            supplier: supplier ? {
                id: supplier.id,
                name: supplier.name,
                email: supplier.email,
                phone: supplier.phone,
                document: supplier.document
            } : undefined,
            project: project ? {
                id: project.id,
                name: project.name,
                location: project.location || project.settings?.location,
                organizationId: project.organization_id || project.settings?.organizationId
            } : undefined
        };

        try {
            console.log(`[WEBHOOK] Sending Contract to URL: ${targetUrl}`);
            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            console.log('[WEBHOOK] Contract sent to Make.com successfully');

            // Log history
            const historyData = {
                project_id: project?.id || project?.projectId || contract?.project_id,
                organization_id: contract?.organization_id || project?.organizationId || project?.organization_id || project?.settings?.organizationId,
                event_type: 'contract_sent' as const,
                reference_id: contract.id,
                reference_name: contract.number,
                status: 'success' as const,
                payload
            };

            const { error: logError } = await supabase.from('automation_history').insert(historyData);
            if (logError) console.error('[WEBHOOK] Failed to log contract success history:', logError);
        } catch (error: any) {
            console.error('[WEBHOOK] Failed to send contract to Make.com:', error);

            // Log error
            const historyData = {
                project_id: project?.id || project?.projectId || contract?.project_id,
                organization_id: contract?.organization_id || project?.organizationId || project?.organization_id || project?.settings?.organizationId,
                event_type: 'contract_sent' as const,
                reference_id: contract.id,
                reference_name: contract.number,
                status: 'error' as const,
                error_message: error.message,
                payload
            };
            const { error: logError } = await supabase.from('automation_history').insert(historyData);
            if (logError) console.error('[WEBHOOK] Failed to log contract error history:', logError);

            throw error;
        }
    },

    renderTemplate(template: string, data: { cliente: string; valor: string; vencimento: string; descricao: string; projeto: string }) {
        if (!template) return '';
        return template
            .replace(/{{cliente}}/g, data.cliente)
            .replace(/{{valor}}/g, data.valor)
            .replace(/{{vencimento}}/g, data.vencimento)
            .replace(/{{descricao}}/g, data.descricao)
            .replace(/{{projeto}}/g, data.projeto);
    },

    async triggerBillingWebhook(item: { inst: any; rule: any }, project?: any) {
        const settings = project?.settings || project;
        const billingUrl = settings?.financialInfo?.billingWebhookUrl || settings?.billingWebhookUrl;

        if (!billingUrl || billingUrl.includes('your-webhook-id')) {
            console.warn('[WEBHOOK] Billing Webhook URL not configured. Skipping trigger.');
            return;
        }

        const dueDate = item.inst.dueDate || item.inst.due_date;
        const formattedDate = dueDate ? new Date(dueDate + 'T12:00:00').toLocaleDateString('pt-BR') : 'N/A';
        const formattedValue = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.inst.value);

        const renderedMessage = this.renderTemplate(item.rule.messageTemplate || '', {
            cliente: item.inst.clientName || 'Cliente',
            valor: formattedValue,
            vencimento: formattedDate,
            descricao: item.inst.description || 'Parcela',
            projeto: project?.name || 'Projeto'
        });

        const payload = {
            event: 'billing_triggered',
            timestamp: new Date().toISOString(),
            renderedMessage,
            installment: {
                id: item.inst.id,
                value: item.inst.value,
                dueDate: item.inst.dueDate || item.inst.due_date,
                description: item.inst.description,
                clientName: item.inst.clientName,
                propertyName: item.inst.propertyName,
                status: item.inst.status
            },
            rule: {
                id: item.rule.id,
                days: item.rule.days,
                triggerMode: item.rule.triggerMode
            },
            project: project ? {
                id: project.id,
                name: project.name,
                organizationId: project.organization_id || project.settings?.organizationId
            } : undefined
        };

        try {
            const response = await fetch(billingUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            // Log history
            const historyData = {
                project_id: project?.id || project?.projectId || item.inst.project_id,
                organization_id: item.inst.organization_id || project?.organizationId || project?.organization_id || project?.settings?.organizationId,
                event_type: 'billing_triggered' as const,
                reference_id: item.inst.id,
                reference_name: `${item.inst.clientName} - ${item.inst.description || 'Parcela'}`,
                status: 'success' as const,
                payload
            };

            const { error: logError } = await supabase.from('automation_history').insert(historyData);
            if (logError) console.error('[WEBHOOK] Failed to log billing success history:', logError);
        } catch (error: any) {
            console.error('[WEBHOOK] Failed to send billing to Make.com:', error);

            // Log error
            const historyData = {
                project_id: project?.id || project?.projectId || item.inst.project_id,
                organization_id: item.inst.organization_id || project?.organizationId || project?.organization_id || project?.settings?.organizationId,
                event_type: 'billing_triggered' as const,
                reference_id: item.inst.id,
                reference_name: `${item.inst.clientName} - ${item.inst.description || 'Parcela'}`,
                status: 'error' as const,
                error_message: error.message,
                payload
            };
            const { error: logError } = await supabase.from('automation_history').insert(historyData);
            if (logError) console.error('[WEBHOOK] Failed to log billing error history:', logError);

            throw error;
        }
    },

    async recordBillingConversion(installmentId: string, value: number) {
        try {
            // Find the most recent billing trigger for this installment that hasn't been converted yet
            const { data, error } = await supabase
                .from('automation_history')
                .select('id')
                .eq('reference_id', installmentId)
                .eq('event_type', 'billing_triggered')
                .eq('status', 'success')
                .is('converted_at', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error || !data) return; // No trigger found or already converted

            // Mark as converted
            const { error: updateError } = await supabase
                .from('automation_history')
                .update({
                    converted_at: new Date().toISOString(),
                    converted_value: value
                })
                .eq('id', data.id);

            if (updateError) console.error('[WEBHOOK] Failed to record billing conversion:', updateError);
        } catch (err) {
            console.error('[WEBHOOK] recordBillingConversion error:', err);
        }
    }
};
