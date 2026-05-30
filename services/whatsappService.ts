/**
 * WhatsApp Cloud API — Meta Business Platform (oficial)
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages
 *
 * Credenciais necessárias no painel Meta for Developers:
 *  - Phone Number ID  (aba "API Setup" do app)
 *  - Access Token     (token permanente ou temporário do System User)
 */
import { notificationLogService } from './notificationLogService';
import { appSettingsService } from './appSettingsService';

const LS_KEY   = 'whatsapp_config';
const API_BASE = 'https://graph.facebook.com/v20.0';

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
        phoneNumberId: import.meta.env.VITE_WA_PHONE_NUMBER_ID  || '',
        accessToken:   import.meta.env.VITE_WA_ACCESS_TOKEN     || '',
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

    /** Envia mensagem de texto simples via WhatsApp Cloud API */
    async sendText(phone: string, message: string, orderId?: string): Promise<void> {
        if (!this.isConfigured()) {
            throw new Error('WhatsApp não configurado. Acesse Configurações → Integrações para configurar.');
        }

        const { phoneNumberId, accessToken } = getConfig();
        const to = this.normalizePhone(phone);
        const url = `${API_BASE}/${phoneNumberId}/messages`;

        const body = {
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { preview_url: false, body: message },
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
                orderId,
                channel: 'whatsapp',
                recipient: to,
                body: message,
                status: 'sent',
                metadata: { to, phoneNumberId },
            });
        } catch (error: any) {
            notificationLogService.log({
                orderId,
                channel: 'whatsapp',
                recipient: to,
                body: message,
                status: 'failed',
                error: error.message || String(error),
                metadata: { to },
            });
            throw error;
        }
    },

    buildOrderSentMessage(params: {
        supplierName: string;
        orderNumber:  string;
        projectName:  string;
        itemCount:    number;
        total:        number;
        deliveryDate?: string;
    }): string {
        const totalFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(params.total);
        const delivery = params.deliveryDate
            ? new Date(params.deliveryDate + 'T12:00:00').toLocaleDateString('pt-BR')
            : 'A definir';
        return appSettingsService.interpolateOrderSent({
            supplierName: params.supplierName,
            orderNumber:  params.orderNumber,
            projectName:  params.projectName,
            itemCount:    params.itemCount,
            total:        totalFmt,
            deliveryDate: delivery,
        });
    },

    buildStatusChangeMessage(params: {
        supplierName: string;
        orderNumber:  string;
        newStatus:    string;
    }): string {
        return appSettingsService.interpolateStatusChange(params);
    },
};
