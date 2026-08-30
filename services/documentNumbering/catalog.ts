import { DocType, NumberingConfig } from './types';

export interface DocTypeCatalogEntry {
    label: string;
    /**
     * `true` para os 4 tipos que saíram da tabela principal e foram para a
     * seção "CRM & Negociações" da tela de Nomenclatura (pedido de 2026-08-30
     * — fundir os 7 tipos do print numa tabela só, mantendo os demais numa
     * seção separada). Não afeta o motor, só a UI.
     */
    advanced?: true;
    /** Preserva o comportamento atual até a organização reconfigurar. */
    default: NumberingConfig;
}

/**
 * Desde 2026-08-30 toda linha da tela de Nomenclatura oferece as mesmas 9
 * variáveis (`ALL_VARIABLE_TOKENS`, em types.ts) — não há mais filtro por
 * doc_type (`supportedVariables` foi removido). Token sem valor disponível no
 * fluxo simplesmente não aparece no número (nunca bloqueia — ver
 * feedback_nomenclatura_nunca_bloqueia). O antigo campo `group` também saiu:
 * não era lido em lugar nenhum (a UI antiga agrupava via comentário em
 * `Settings.tsx`, não via este campo).
 */
export const DOC_TYPE_CATALOG: Record<DocType, DocTypeCatalogEntry> = {
    // ═══ Tabela principal (print de 2026-08-30) — re-prefixados ═══
    PURCHASE_ORDER: {
        label: 'Pedidos de Compra',
        default: { slots: ['PREFIX', 'EMPREENDIMENTO', 'OBRA'], prefix: 'PCO', separator: '-', seqPadding: 4 },
    },
    QUOTATION: {
        label: 'Cotações de Suprimentos',
        default: { slots: ['PREFIX', 'EMPREENDIMENTO', 'OBRA'], prefix: 'COT', separator: '-', seqPadding: 4 },
    },
    SUPPLY_CONTRACT: {
        label: 'Contratos de Suprimentos',
        default: { slots: ['PREFIX', 'EMPREENDIMENTO', 'OBRA'], prefix: 'CSU', separator: '-', seqPadding: 4 },
    },
    UNIT_SALE_CONTRACT: {
        label: 'Venda de Ativos',
        // Unidade saiu do default (decisão de 2026-08-30 — "Unidade" não é
        // mais oferecida no seletor). CTV-RES01-0001 em vez de CV-RES01-101-0001.
        default: { slots: ['PREFIX', 'EMPREENDIMENTO'], prefix: 'CTV', separator: '-', seqPadding: 4 },
    },
    RENTAL_CONTRACT: {
        label: 'Locações',
        default: { slots: ['PREFIX', 'EMPREENDIMENTO'], prefix: 'CTL', separator: '-', seqPadding: 4 },
    },
    CONDO_RATEIO: {
        label: 'Condomínios',
        default: { slots: ['PREFIX', 'EMPREENDIMENTO'], prefix: 'CTC', separator: '-', seqPadding: 4 },
    },
    SERVICE_CONTRACT: {
        label: 'Contratos de Serviço',
        // Legado era 3 dígitos sem prefixo (MAX+1 no navegador); ganha prefixo
        // próprio pela primeira vez, conforme o print (CSE).
        default: { slots: ['PREFIX'], prefix: 'CSE', separator: '-', seqPadding: 3 },
    },

    // ═══ Seção "CRM & Negociações" — mantidos, prefixos inalterados ═══
    SERVICE_PROPOSAL: {
        label: 'Propostas (CRM de Serviços)',
        advanced: true,
        // services_opportunities guarda cliente como texto livre (contact_name,
        // sem client_id) e não tem centro de custo — ver
        // 20270912000004_services_numbering_triggers.sql. Só ORGANIZACAO
        // resolve de fato hoje, mas o seletor oferece as 9 (decisão 2026-08-30).
        default: { slots: ['PREFIX'], prefix: 'PROP', separator: '-', seqPadding: 5 },
    },
    SERVICE_CRM_CONTRACT: {
        label: 'Contratos (CRM de Serviços, ao ganhar)',
        advanced: true,
        default: { slots: ['PREFIX'], prefix: 'CTR', separator: '-', seqPadding: 5 },
    },
    SALE_DEAL: {
        label: 'Negociações de Venda de Unidades',
        advanced: true,
        // Legado era 3 dígitos sem máscara (MAX+1 no navegador, sem UNIQUE).
        default: { slots: ['PREFIX'], prefix: '', separator: '-', seqPadding: 3 },
    },
    RENTAL_DEAL: {
        label: 'Negociações de Locação',
        advanced: true,
        // Não existia código de negociação para locação — nasce com o mesmo
        // formato de Venda de Unidades por consistência.
        default: { slots: ['PREFIX'], prefix: '', separator: '-', seqPadding: 3 },
    },
};

/** Ordem de exibição das duas tabelas — DOC_TYPE_CATALOG é um Record, sem ordem própria garantida. */
export const MAIN_DOC_TYPES: DocType[] = [
    'PURCHASE_ORDER', 'QUOTATION', 'SUPPLY_CONTRACT',
    'UNIT_SALE_CONTRACT', 'RENTAL_CONTRACT', 'CONDO_RATEIO', 'SERVICE_CONTRACT',
];

export const ADVANCED_DOC_TYPES: DocType[] = [
    'SALE_DEAL', 'RENTAL_DEAL', 'SERVICE_PROPOSAL', 'SERVICE_CRM_CONTRACT',
];

export function getDocTypeDefault(docType: DocType): NumberingConfig {
    return DOC_TYPE_CATALOG[docType].default;
}
