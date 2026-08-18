const LS_KEY = 'opura_app_settings';

/**
 * Configurações locais do app (localStorage, por navegador).
 *
 * ⚠️ As 5 máscaras de numeração (pedido/cotação/contrato/locação/venda de
 * unidade) MORAVAM aqui e saíram em 2026-08-18. Elas agora vivem no banco, por
 * organização, em `document_numbering_settings` — configuradas em Configurações
 * do Sistema › Nomenclatura e aplicadas por `services/documentNumbering/`.
 * Não recriar campo de numeração aqui: config por navegador significa dois
 * usuários da mesma empresa gerando padrões diferentes, que foi exatamente o
 * problema que motivou a mudança.
 */
export interface AppSettings {
    /**
     * Sufixo colado no número ao DUPLICAR um pedido (`orderService.duplicateOrder`).
     * Não é máscara: o número novo sai do motor de Nomenclatura e este sufixo é
     * pós-fixado, para o duplicado não colidir com o original.
     */
    orderDuplicateSuffix: string;

    // Exibição de fornecedores: razão social ou apelido curto
    supplierNameDisplay: 'razao' | 'apelido';

    // WhatsApp templates
    whatsappOrderSentTemplate: string;
    whatsappStatusChangeTemplate: string;

    // Email templates
    emailStatusChangeSubject: string;
    emailStatusChangeBody: string;
}

export const APP_SETTINGS_DEFAULTS: AppSettings = {
    orderDuplicateSuffix: '-DUP',

    supplierNameDisplay: 'razao',

    whatsappOrderSentTemplate:
        `Olá, {fornecedor}!\n\nVocê recebeu um novo Pedido de Compra:\n\n📋 Pedido: #{pedido}\n🏢 Obra: {obra}\n📦 {itens} item(s) — Total: {total}\n📅 Entrega prevista: {entrega}\n\nAcesse o portal do fornecedor para confirmar ou negociar o pedido.`,

    whatsappStatusChangeTemplate:
        `Olá, {fornecedor}!\n\nO status do Pedido #{pedido} foi atualizado para: *{status}*.\n\nAcesse o portal para mais detalhes.`,

    emailStatusChangeSubject: `Status do Pedido {pedido}`,
    emailStatusChangeBody:    `O status do pedido foi alterado para "{status}".`,
};

// Variable reference for UI hints.
// As chaves de numeração saíram junto com as máscaras (ver comentário de
// AppSettings) — as variáveis da Nomenclatura agora são declaradas por tipo de
// documento em `services/documentNumbering/catalog.ts`.
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
