const LS_KEY = 'opura_app_settings';

export interface AppSettings {
    // Order numbering
    orderPrefix: string;
    orderDuplicateSuffix: string;
    /** Máscara do número do pedido. Tokens: {prefixo} {empreendimento} {obra} {seq}. */
    orderNumberPattern: string;
    /** Casas do sequencial por obra (zeros à esquerda). */
    orderSeqPadding: number;

    // Contract numbering (Suprimentos) — cópia do padrão de Numeração de Pedidos.
    contractPrefix: string;
    /** Máscara do número do contrato. Tokens: {prefixo} {empreendimento} {obra} {seq}. */
    contractNumberPattern: string;
    /** Casas do sequencial por obra (zeros à esquerda). */
    contractSeqPadding: number;

    // Quotation numbering (Suprimentos) — cópia do padrão de Numeração de Pedidos.
    quotationPrefix: string;
    /** Máscara do número da cotação. Tokens: {prefixo} {empreendimento} {obra} {seq}. */
    quotationNumberPattern: string;
    /** Casas do sequencial por obra (zeros à esquerda). */
    quotationSeqPadding: number;

    // Contratos de LOCAÇÃO — sequencial por UNIDADE (não por obra: contrato de
    // locação não tem obra, chega no empreendimento pela unidade via
    // vw_unit_property_map). Tokens: {prefixo} {empreendimento} {unidade} {seq}.
    rentalContractPrefix: string;
    rentalContractNumberPattern: string;
    /** Casas do sequencial por unidade (zeros à esquerda). */
    rentalContractSeqPadding: number;

    // Contratos de VENDA DE UNIDADES — idem locação, sequência independente.
    unitSaleContractPrefix: string;
    unitSaleContractNumberPattern: string;
    /** Casas do sequencial por unidade (zeros à esquerda). */
    unitSaleContractSeqPadding: number;

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
    orderPrefix: 'PC',
    orderDuplicateSuffix: '-DUP',
    orderNumberPattern: '{prefixo}-{empreendimento}-{obra}-{seq}',
    orderSeqPadding: 4,

    contractPrefix: 'CT',
    contractNumberPattern: '{prefixo}-{empreendimento}-{obra}-{seq}',
    contractSeqPadding: 4,

    quotationPrefix: 'QT',
    quotationNumberPattern: '{prefixo}-{empreendimento}-{obra}-{seq}',
    quotationSeqPadding: 4,

    rentalContractPrefix: 'CL',
    rentalContractNumberPattern: '{prefixo}-{empreendimento}-{unidade}-{seq}',
    rentalContractSeqPadding: 4,

    unitSaleContractPrefix: 'CV',
    unitSaleContractNumberPattern: '{prefixo}-{empreendimento}-{unidade}-{seq}',
    unitSaleContractSeqPadding: 4,

    supplierNameDisplay: 'razao',

    whatsappOrderSentTemplate:
        `Olá, {fornecedor}!\n\nVocê recebeu um novo Pedido de Compra:\n\n📋 Pedido: #{pedido}\n🏢 Obra: {obra}\n📦 {itens} item(s) — Total: {total}\n📅 Entrega prevista: {entrega}\n\nAcesse o portal do fornecedor para confirmar ou negociar o pedido.`,

    whatsappStatusChangeTemplate:
        `Olá, {fornecedor}!\n\nO status do Pedido #{pedido} foi atualizado para: *{status}*.\n\nAcesse o portal para mais detalhes.`,

    emailStatusChangeSubject: `Status do Pedido {pedido}`,
    emailStatusChangeBody:    `O status do pedido foi alterado para "{status}".`,
};

// Variable reference for UI hints
export const TEMPLATE_VARS = {
    orderNumber: ['{prefixo}', '{empreendimento}', '{obra}', '{seq}'],
    contractNumber: ['{prefixo}', '{empreendimento}', '{obra}', '{seq}'],
    quotationNumber: ['{prefixo}', '{empreendimento}', '{obra}', '{seq}'],
    // {unidade}, não {obra}: contrato de locação/venda não tem obra — chega no
    // empreendimento pela unidade (vw_unit_property_map).
    rentalContractNumber: ['{prefixo}', '{empreendimento}', '{unidade}', '{seq}'],
    unitSaleContractNumber: ['{prefixo}', '{empreendimento}', '{unidade}', '{seq}'],
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
