const LS_KEY = 'orçacloud_app_settings';

export interface AppSettings {
    // Order numbering
    orderPrefix: string;
    orderDuplicateSuffix: string;

    // WhatsApp templates
    whatsappOrderSentTemplate: string;
    whatsappStatusChangeTemplate: string;

    // Email templates
    emailStatusChangeSubject: string;
    emailStatusChangeBody: string;
}

export const APP_SETTINGS_DEFAULTS: AppSettings = {
    orderPrefix: 'PO-',
    orderDuplicateSuffix: '-DUP',

    whatsappOrderSentTemplate:
        `Olá, {fornecedor}!\n\nVocê recebeu um novo Pedido de Compra:\n\n📋 Pedido: #{pedido}\n🏢 Obra: {obra}\n📦 {itens} item(s) — Total: {total}\n📅 Entrega prevista: {entrega}\n\nAcesse o portal do fornecedor para confirmar ou negociar o pedido.`,

    whatsappStatusChangeTemplate:
        `Olá, {fornecedor}!\n\nO status do Pedido #{pedido} foi atualizado para: *{status}*.\n\nAcesse o portal para mais detalhes.`,

    emailStatusChangeSubject: `Status do Pedido {pedido}`,
    emailStatusChangeBody:    `O status do pedido foi alterado para "{status}".`,
};

// Variable reference for UI hints
export const TEMPLATE_VARS = {
    whatsappOrderSent: ['{fornecedor}', '{pedido}', '{obra}', '{itens}', '{total}', '{entrega}'],
    whatsappStatusChange: ['{fornecedor}', '{pedido}', '{status}'],
    email: ['{pedido}', '{status}'],
};

export const appSettingsService = {
    get(): AppSettings {
        try {
            const stored = localStorage.getItem(LS_KEY);
            if (stored) {
                return { ...APP_SETTINGS_DEFAULTS, ...JSON.parse(stored) };
            }
        } catch { /* ignore */ }
        return { ...APP_SETTINGS_DEFAULTS };
    },

    save(settings: Partial<AppSettings>): void {
        const current = this.get();
        localStorage.setItem(LS_KEY, JSON.stringify({ ...current, ...settings }));
    },

    reset(): void {
        localStorage.removeItem(LS_KEY);
    },

    // Template interpolation helpers
    interpolateOrderSent(params: {
        supplierName: string;
        orderNumber: string;
        projectName: string;
        itemCount: number;
        total: string;
        deliveryDate: string;
    }): string {
        return this.get().whatsappOrderSentTemplate
            .replace(/{fornecedor}/g, params.supplierName)
            .replace(/{pedido}/g,    params.orderNumber)
            .replace(/{obra}/g,      params.projectName)
            .replace(/{itens}/g,     String(params.itemCount))
            .replace(/{total}/g,     params.total)
            .replace(/{entrega}/g,   params.deliveryDate);
    },

    interpolateStatusChange(params: {
        supplierName: string;
        orderNumber: string;
        newStatus: string;
    }): string {
        return this.get().whatsappStatusChangeTemplate
            .replace(/{fornecedor}/g, params.supplierName)
            .replace(/{pedido}/g,     params.orderNumber)
            .replace(/{status}/g,     params.newStatus);
    },

    interpolateEmailSubject(params: { orderNumber: string; newStatus: string }): string {
        return this.get().emailStatusChangeSubject
            .replace(/{pedido}/g,  params.orderNumber)
            .replace(/{status}/g,  params.newStatus);
    },

    interpolateEmailBody(params: { orderNumber: string; newStatus: string }): string {
        return this.get().emailStatusChangeBody
            .replace(/{pedido}/g,  params.orderNumber)
            .replace(/{status}/g,  params.newStatus);
    },
};
