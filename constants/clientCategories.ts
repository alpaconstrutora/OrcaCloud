// Tipo de cliente com que um cadastro novo nasce — o formulário manual e o
// "Adicionar aos clientes" da transcrição (25/11/2026) usam o mesmo. Está sempre
// no catálogo de toda organização (clientCategoryService completa com os padrões).
export const CATEGORIA_PADRAO_DO_CLIENTE = 'Vendas';

export const DEFAULT_CLIENT_CATEGORIES = [
    CATEGORIA_PADRAO_DO_CLIENTE,
    'Locação',
    'Serviços',
    'Condomínio',
];
