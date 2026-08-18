import { DocType, NumberingConfig, VariableToken } from './types';

export interface DocTypeCatalogEntry {
    label: string;
    /** Agrupamento usado no menu de Configurações › Nomenclatura. */
    group: 'Suprimentos' | 'Comercial' | 'Condomínios';
    /**
     * Variáveis que este documento consegue resolver. A UI só oferece estas
     * nos seletores de slot — oferecer uma variável não resolvível seria a
     * armadilha que a decisão de bloqueio (2026-08-17) quis evitar: o
     * usuário configuraria e travaria a criação do documento inteiro.
     */
    supportedVariables: VariableToken[];
    /** Preserva o comportamento atual até a organização reconfigurar. */
    default: NumberingConfig;
}

export const DOC_TYPE_CATALOG: Record<DocType, DocTypeCatalogEntry> = {
    PURCHASE_ORDER: {
        label: 'Pedidos de Compra',
        group: 'Suprimentos',
        supportedVariables: ['EMPREENDIMENTO', 'OBRA', 'FORNECEDOR', 'CENTRO_CUSTO', 'ORGANIZACAO'],
        default: { slots: ['PREFIX', 'EMPREENDIMENTO', 'OBRA'], prefix: 'PC', separator: '-', seqPadding: 4 },
    },
    QUOTATION: {
        label: 'Cotações',
        group: 'Suprimentos',
        // Sem FORNECEDOR/CENTRO_CUSTO: uma cotação vai para VÁRIOS fornecedores
        // (quotation_requests.invited_supplier_ids é array) e não tem coluna de
        // centro de custo — não há um único valor para resolver essas variáveis.
        supportedVariables: ['EMPREENDIMENTO', 'OBRA', 'ORGANIZACAO'],
        default: { slots: ['PREFIX', 'EMPREENDIMENTO', 'OBRA'], prefix: 'QT', separator: '-', seqPadding: 4 },
    },
    SUPPLY_CONTRACT: {
        label: 'Contratos de Suprimentos',
        group: 'Suprimentos',
        supportedVariables: ['EMPREENDIMENTO', 'OBRA', 'FORNECEDOR', 'CENTRO_CUSTO', 'ORGANIZACAO'],
        default: { slots: ['PREFIX', 'EMPREENDIMENTO', 'OBRA'], prefix: 'CT', separator: '-', seqPadding: 4 },
    },
    SERVICE_CONTRACT: {
        label: 'Contratos de Serviços',
        group: 'Comercial',
        supportedVariables: ['EMPREENDIMENTO', 'OBRA', 'CLIENTE', 'CENTRO_CUSTO', 'ORGANIZACAO'],
        // Legado era 3 dígitos sem máscara (MAX+1 no navegador) — o default
        // reproduz o mesmo formato até a organização reconfigurar.
        default: { slots: [], prefix: '', separator: '-', seqPadding: 3 },
    },
    SERVICE_PROPOSAL: {
        label: 'Propostas (CRM de Serviços)',
        group: 'Comercial',
        // services_opportunities guarda cliente como texto livre (contact_name,
        // sem client_id) e não tem centro de custo — ver
        // 20270912000004_services_numbering_triggers.sql.
        supportedVariables: ['ORGANIZACAO'],
        default: { slots: ['PREFIX'], prefix: 'PROP', separator: '-', seqPadding: 5 },
    },
    SERVICE_CRM_CONTRACT: {
        label: 'Contratos (CRM de Serviços, ao ganhar)',
        group: 'Comercial',
        supportedVariables: ['ORGANIZACAO'],
        default: { slots: ['PREFIX'], prefix: 'CTR', separator: '-', seqPadding: 5 },
    },
    UNIT_SALE_CONTRACT: {
        label: 'Contratos de Venda de Unidades',
        group: 'Comercial',
        supportedVariables: ['EMPREENDIMENTO', 'UNIDADE', 'CLIENTE', 'CENTRO_CUSTO', 'ORGANIZACAO'],
        default: { slots: ['PREFIX', 'EMPREENDIMENTO', 'UNIDADE'], prefix: 'CV', separator: '-', seqPadding: 4 },
    },
    RENTAL_CONTRACT: {
        label: 'Contratos de Locação',
        group: 'Comercial',
        supportedVariables: ['EMPREENDIMENTO', 'UNIDADE', 'CLIENTE', 'CENTRO_CUSTO', 'ORGANIZACAO'],
        default: { slots: ['PREFIX', 'EMPREENDIMENTO', 'UNIDADE'], prefix: 'CL', separator: '-', seqPadding: 4 },
    },
    SALE_DEAL: {
        label: 'Negociações de Venda de Unidades',
        group: 'Comercial',
        supportedVariables: ['EMPREENDIMENTO', 'UNIDADE', 'CLIENTE', 'CENTRO_CUSTO', 'ORGANIZACAO'],
        // Legado era 3 dígitos sem máscara (MAX+1 no navegador, sem UNIQUE).
        default: { slots: [], prefix: '', separator: '-', seqPadding: 3 },
    },
    RENTAL_DEAL: {
        label: 'Negociações de Locação',
        group: 'Comercial',
        supportedVariables: ['EMPREENDIMENTO', 'UNIDADE', 'CLIENTE', 'CENTRO_CUSTO', 'ORGANIZACAO'],
        // Não existia código de negociação para locação — nasce com o mesmo
        // formato de Venda de Unidades por consistência.
        default: { slots: [], prefix: '', separator: '-', seqPadding: 3 },
    },
    CONDO_RATEIO: {
        label: 'Rateios de Condomínio',
        group: 'Condomínios',
        supportedVariables: ['EMPREENDIMENTO', 'CENTRO_CUSTO', 'ORGANIZACAO'],
        default: { slots: ['PREFIX', 'EMPREENDIMENTO'], prefix: 'RAT', separator: '-', seqPadding: 4 },
    },
};

export function getDocTypeDefault(docType: DocType): NumberingConfig {
    return DOC_TYPE_CATALOG[docType].default;
}
