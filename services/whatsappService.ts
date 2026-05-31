/**
 * WhatsApp Cloud API — Meta Business Platform (oficial)
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages
 */
import { notificationLogService } from './notificationLogService';
import { appSettingsService } from './appSettingsService';
import { supabase } from '../lib/supabase';

const LS_KEY   = 'whatsapp_config';
const API_BASE = 'https://graph.facebook.com/v20.0';

// URL base do app em produção — usada no link público do pedido
const APP_BASE_URL = import.meta.env.VITE_APP_URL || 'https://orca-cloud.vercel.app';

// Nome do template aprovado na Meta para pedido enviado
export const WA_TEMPLATE_ORDER_SENT = import.meta.env.VITE_WA_TEMPLATE_ORDER_SENT || 'orcacloud_pedido_enviado';

export interface WhatsAppConfig {
    phoneNumberId: string;
    accessToken:   string;
}

function getConfig(): WhatsAppConfig {
    try {
        const stored = localStorage.getItem(LS_KEY);
        if (stored) {
            const parsed = JSON.parse(stored) as WhatsAppConfig;
            if (parsed.phoneNumberId && parsed.accessToken) return parsed;
        }
    } catch { /* ignore */ }
    return {
        phoneNumberId: import.meta.env.VITE_WA_PHONE_NUMBER_ID || '',
        accessToken:   import.meta.env.VITE_WA_ACCESS_TOKEN    || '',
    };
}

export const whatsappService = {
    getConfig,

    saveConfig(config: WhatsAppConfig): void {
        localStorage.setItem(LS_KEY, JSON.stringify(config));
    },

    clearConfig(): void {
        localStorage.removeItem(LS_KEY);
    },

    isConfigured(): boolean {
        const { phoneNumberId, accessToken } = getConfig();
        return !!(phoneNumberId && accessToken);
    },

    /** Normaliza para formato E.164 sem + (ex.: 5511999999999) */
    normalizePhone(phone: string): string {
        const digits = phone.replace(/\D/g, '');
        const withoutLeadingZero = digits.startsWith('0') ? digits.slice(1) : digits;
        if (withoutLeadingZero.length >= 12) return withoutLeadingZero;
        return `55${withoutLeadingZero}`;
    },

    /** Gera share_token para o pedido e salva no banco. Retorna o token. */
    async generateShareToken(orderId: string): Promise<string> {
        const token = crypto.randomUUID();
        const { error } = await supabase
            .from('purchase_orders')
            .update({ share_token: token })
            .eq('id', orderId);
        if (error) throw new Error(`Erro ao gerar link do pedido: ${error.message}`);
        return token;
    },

    /** Monta a URL pública do pedido */
    buildShareUrl(token: string): string {
        return `${APP_BASE_URL}/pedido/${token}`;
    },

    /** Envia template de pedido enviado via WhatsApp Cloud API */
    async sendOrderTemplate(params: {
        phone:        string;
        orderId:      string;
        supplierName: string;
        orderNumber:  string;
        projectName:  string;
        itemCount:    number;
        total:        number;
        deliveryDate?: string;
        shareToken:   string;
    }): Promise<void> {
        if (!this.isConfigured()) {
            throw new Error('WhatsApp não configurado. Acesse Configurações → Integrações.');
        }

        const { phoneNumberId, accessToken } = getConfig();
        const to  = this.normalizePhone(params.phone);
        const url = `${API_BASE}/${phoneNumberId}/messages`;

        const totalFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(params.total);
        const delivery = params.deliveryDate
            ? new Date(params.deliveryDate + 'T12:00:00').toLocaleDateString('pt-BR')
            : 'A definir';
        const shareUrl = this.buildShareUrl(params.shareToken);

        const body = {
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: {
                name: WA_TEMPLATE_ORDER_SENT,
                language: { code: 'pt_BR' },
                components: [
                    {
                        type: 'body',
                        parameters: [
                            { type: 'text', text: params.supplierName },
                            { type: 'text', text: params.orderNumber },
                            { type: 'text', text: params.projectName },
                            { type: 'text', text: String(params.itemCount) },
                            { type: 'text', text: totalFmt },
                            { type: 'text', text: delivery },
                        ],
                    },
                    {
                        type: 'button',
                        sub_type: 'url',
                        index: '0',
                        parameters: [{ type: 'text', text: params.shareToken }],
                    },
                ],
            },
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({ error: { message: `HTTP ${response.status}` } }));
                const msg = err?.error?.message || `HTTP ${response.status}`;
                throw new Error(msg);
            }

            notificationLogService.log({
                orderId:   params.orderId,
                channel:   'whatsapp',
                recipient: to,
                body:      `Template: ${WA_TEMPLATE_ORDER_SENT} | Link: ${shareUrl}`,
                status:    'sent',
                metadata:  { to, phoneNumberId, shareUrl },
            });
        } catch (error: any) {
            notificationLogService.log({
                orderId:   params.orderId,
                channel:   'whatsapp',
                recipient: to,
                status:    'failed',
                error:     error.message || String(error),
                metadata:  { to },
            });
            throw error;
        }
    },

    buildStatusChangeMessage(params: {
        supplierName: string;
        orderNumber:  string;
        newStatus:    string;
    }): string {
        return appSettingsService.interpolateStatusChange(params);
    },
};
