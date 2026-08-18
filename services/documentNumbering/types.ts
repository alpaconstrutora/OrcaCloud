/**
 * Nomenclatura configurável por slots — Configurações do Sistema › Nomenclatura.
 *
 * Ver docs/planos/2026-08-17-nomenclatura-slots-configuravel.md. Pedido original:
 * o usuário monta o número escolhendo, para até 8 posições ordenadas, um dos 7
 * tokens de variável do sistema, "Prefixo" (texto livre) ou "vazio". O {seq}
 * é sempre o último token e não entra no array de slots.
 */

/** As 7 variáveis do pedido original + os dois pseudo-tokens de slot. */
export type SlotToken =
    | 'EMPTY'
    | 'PREFIX'
    | 'EMPREENDIMENTO'
    | 'OBRA'
    | 'UNIDADE'
    | 'CLIENTE'
    | 'FORNECEDOR'
    | 'ORGANIZACAO'
    | 'CENTRO_CUSTO';

/** As variáveis reais (exclui EMPTY/PREFIX) — o que cada doc_type pode oferecer. */
export type VariableToken = Exclude<SlotToken, 'EMPTY' | 'PREFIX'>;

export const ALL_VARIABLE_TOKENS: VariableToken[] = [
    'EMPREENDIMENTO', 'OBRA', 'UNIDADE', 'CLIENTE', 'FORNECEDOR', 'ORGANIZACAO', 'CENTRO_CUSTO',
];

export const MAX_SLOTS = 8;

/**
 * Os 11 documentos que a Nomenclatura passa a controlar (REGRA de produto —
 * "os números dos módulos abaixo devem ser vinculados a Configurações do
 * Sistema › Nomenclatura", pedido de 2026-08-17).
 */
export type DocType =
    | 'PURCHASE_ORDER'       // Suprimentos › Pedidos de Compra
    | 'QUOTATION'            // Suprimentos › Cotações
    | 'SUPPLY_CONTRACT'      // Suprimentos › Contratos
    | 'SERVICE_CONTRACT'     // Comercial › Contratos de Serviços (aba Contratos)
    | 'SERVICE_PROPOSAL'     // Comercial › Contratos de Serviços (CRM, proposta)
    | 'SERVICE_CRM_CONTRACT' // Comercial › Contratos de Serviços (CRM, contrato ao ganhar)
    | 'UNIT_SALE_CONTRACT'   // Comercial › Vendas de Unidades (contrato CV-)
    | 'RENTAL_CONTRACT'      // Comercial › Locações (contrato CL-)
    | 'SALE_DEAL'            // Comercial › Vendas de Unidades (código da negociação)
    | 'RENTAL_DEAL'          // Comercial › Locações (código da negociação)
    | 'CONDO_RATEIO';        // Comercial › Condomínios (rateio fechado)

export interface NumberingConfig {
    slots: SlotToken[];
    prefix: string;
    separator: '-' | '.';
    seqPadding: number;
}

/**
 * O que cada chamador consegue informar para resolver as variáveis. Nem todo
 * campo se aplica a todo doc_type — os resolvers só usam o que o catálogo
 * declara como suportado (ver catalog.ts).
 */
export interface NumberingContext {
    organizationId: string;
    /** Obra (`projects.id`) — resolve EMPREENDIMENTO + OBRA (Pedidos/Cotações/Contratos de Suprimentos e de Serviços). */
    projectId?: string | null;
    /** Empreendimento direto (`empreendimentos.id`) — quando não há obra no caminho (ex.: Condomínios). */
    empreendimentoId?: string | null;
    /**
     * Imóvel do Comercial (`commercial_properties.id`) — resolve UNIDADE +
     * EMPREENDIMENTO via `vw_unit_property_map` (Vendas/Locações, negociação e contrato).
     */
    propertyId?: string | null;
    /** `purpose` da view acima: qual lado do vínculo da unidade usar. */
    unitPurpose?: 'RENTAL' | 'SALE';
    clientId?: string | null;
    supplierId?: string | null;
    costCenterId?: string | null;
}

export class MissingCodeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MissingCodeError';
    }
}
