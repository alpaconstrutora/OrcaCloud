/**
 * Nomenclatura configurável por slots — Configurações do Sistema › Nomenclatura.
 *
 * Ver docs/planos/2026-08-17-nomenclatura-slots-configuravel.md e
 * docs/planos/2026-08-30-nomenclatura-tabela-unica.md (fusão numa tabela só +
 * tokens novos, 2026-08-30). O usuário monta o número escolhendo, para até 8
 * posições ordenadas, um dos tokens de variável do sistema, "Prefixo" (texto
 * livre) ou "vazio". O {seq} é sempre o último token e não entra no array de
 * slots.
 *
 * Desde 2026-08-30 a UI trata o Prefixo como coluna fixa (sempre `slots[0]`,
 * nunca posicionável) e oferece 9 variáveis nas 7 posições livres restantes —
 * ver `ALL_VARIABLE_TOKENS`. `UNIDADE` continua um `SlotToken` válido (o motor
 * e o SQL seguem resolvendo/formatando normalmente) só para não quebrar
 * organizações que já tinham configurado uma máscara com Unidade antes dessa
 * mudança — a UI nova não oferece mais essa opção para configurar do zero.
 */

/** Os tokens de variável do sistema + os dois pseudo-tokens de slot. */
export type SlotToken =
    | 'EMPTY'
    | 'PREFIX'
    | 'EMPREENDIMENTO'
    | 'OBRA'
    | 'UNIDADE'
    | 'CLIENTE'
    | 'FORNECEDOR'
    | 'ORGANIZACAO'
    | 'CENTRO_CUSTO'
    | 'INVESTIDOR'
    | 'ORCAMENTO'
    | 'PLANEJAMENTO';

/** As variáveis reais (exclui EMPTY/PREFIX) — o que cada doc_type pode oferecer. */
export type VariableToken = Exclude<SlotToken, 'EMPTY' | 'PREFIX'>;

/**
 * As 9 variáveis oferecidas nas posições livres da tabela de Nomenclatura
 * (pedido de 2026-08-30), na ordem pedida. `UNIDADE` fica de fora de propósito
 * — ver comentário do topo do arquivo.
 */
export const ALL_VARIABLE_TOKENS: VariableToken[] = [
    'EMPREENDIMENTO', 'OBRA', 'CENTRO_CUSTO', 'ORGANIZACAO', 'FORNECEDOR', 'CLIENTE',
    'INVESTIDOR', 'ORCAMENTO', 'PLANEJAMENTO',
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
    /** Resolve INVESTIDOR (`investors.code`). Nenhum dos 11 fluxos atuais passa isto ainda — ver plano 2026-08-30. */
    investorId?: string | null;
    /** Resolve ORCAMENTO (`projects.code`/`settings.code` de um projeto classificação ORCAMENTO). */
    orcamentoProjectId?: string | null;
    /** Resolve PLANEJAMENTO (idem, classificação PLANEJAMENTO). */
    planejamentoProjectId?: string | null;
}

export class MissingCodeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MissingCodeError';
    }
}
