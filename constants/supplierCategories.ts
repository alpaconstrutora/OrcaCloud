export const REAL_ESTATE_BROKER_CATEGORY = 'Corretor Imobiliário';

export const DEFAULT_SUPPLIER_CATEGORIES = [
    'Materiais de Construção',
    'Mão de Obra / Serviços',
    'Equipamentos / Ferramentas',
    'Consultoria / Projetos',
    'Transporte / Logística',
    REAL_ESTATE_BROKER_CATEGORY,
    'Outros'
];

/**
 * Categoria do fornecedor que é banco/financeira (Minha Organização › Meus
 * Fornecedores). O Credit Room só oferece estes como "instituição financeira".
 */
export const FINANCIAL_INSTITUTION_CATEGORY = 'Instituição Financeira';

/** Sem acento e sem caixa: "instituicao financeira" e "Instituição Financeira" são a mesma categoria. */
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLocaleLowerCase('pt-BR');

export const isFinancialInstitutionCategory = (category?: string | null) =>
    semAcento(category || '') === semAcento(FINANCIAL_INSTITUTION_CATEGORY);

export const isRealEstateBrokerCategory = (category?: string | null) =>
    (category || '').trim().toLocaleLowerCase('pt-BR') === REAL_ESTATE_BROKER_CATEGORY.toLocaleLowerCase('pt-BR');