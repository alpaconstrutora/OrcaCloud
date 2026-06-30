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

export const isRealEstateBrokerCategory = (category?: string | null) =>
    (category || '').trim().toLocaleLowerCase('pt-BR') === REAL_ESTATE_BROKER_CATEGORY.toLocaleLowerCase('pt-BR');