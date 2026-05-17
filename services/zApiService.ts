import { notificationLogService } from './notificationLogService';
import { appSettingsService } from './appSettingsService';

const LS_KEY = 'zapi_config';

export interface ZApiConfig {
    instanceId: string;
    token: string;
    baseUrl: string;
}

function getConfig(): ZApiConfig {
    try {
        const stored = localStorage.getItem(LS_KEY);
        if (stored) {
            const parsed = JSON.parse(stored) as ZApiConfig;
            if (parsed.instanceId && parsed.token) return parsed;
        }
    } catch { /* ignore */ }
    return {
        instanceId: import.meta.env.VITE_ZAPI_INSTANCE_ID || '',
        token:      import.meta.env.VITE_ZAPI_TOKEN       || '',
        baseUrl:    import.meta.env.VITE_ZAPI_BASE_URL    || 'https://api.z-api.io',
    };
}

export const zApiService = {
    getConfig,

    saveConfig(config: ZApiConfig): void {
        localStorage.setItem(LS_KEY, JSON.stringify({
            ...config,
            baseUrl: config.baseUrl || 'https://api.z-api.io',
        }));
    },

    clearConfig(): void {
        localStorage.removeItem(LS_KEY);
    },

    isConfigured(): boolean {
        const { instanceId, token } = getConfig();
        return !!(instanceId && token);
    },

    // Normaliza para formato internacional brasileiro: 5511999999999
    normalizePhone(phone: string): string {
        const digits = phone.replace(/\D/g, '');
        const withoutLeadingZero = digits.startsWith('0') ? digits.slice(1) : digits;
        // Já tem código de país (55 + 10 ou 11 dígitos = 12 ou 13 dígitos total)
        if (withoutLeadingZero.length >= 12) return withoutLeadingZero;
        return `55${withoutLeadingZero}`;
    },

    async sendText(phone: string, message: string, orderId?: string): Promise<void> {
        if (!this.isConfigured()) {
            throw new Error('Z-API não configurado. Acesse Configurações → Integrações para configurar.');
        }

        const { instanceId, token, baseUrl } = getConfig();
        const normalized = this.normalizePhone(phone);
        const url = `${baseUrl}/instances/${instanceId}/token/${token}/send-text`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: normalized, message }),
            });

            if (!response.ok) {
                const body = await response.text().catch(() => `HTTP ${response.status}`);
                throw new Error(body || `HTTP ${response.status}`);
            }

            notificationLogService.log({
                orderId,
                channel: 'whatsapp',
                recipient: normalized,
                body: message,
                status: 'sent',
                metadata: { phone: normalized, instance: instanceId },
            });
        } catch (error: any) {
            notificationLogService.log({
                orderId,
                channel: 'whatsapp',
                recipient: normalized,
                body: message,
                status: 'failed',
                error: error.message || String(error),
                metadata: { phone: normalized },
            });
            throw error;
        }
    },

    buildOrderSentMessage(params: {
        supplierName: string;
        orderNumber: string;
        projectName: string;
        itemCount: number;
        total: number;
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
        orderNumber: string;
        newStatus: string;
    }): string {
        return appSettingsService.interpolateStatusChange(params);
    },
};
