export type ControladoriaTab =
    | 'dre' | 'balancete' | 'fluxo' | 'boletos' | 'contas_pagar' | 'conciliacao' | 'categorias';

export const VIEW_TO_CONTROLADORIA_TAB: Record<string, ControladoriaTab> = {
    'financial-dre':        'dre',
    'financial-balancete':  'balancete',
    'financial-cashflow':   'fluxo',
    'financial-boletos':    'boletos',
    'contas-a-pagar':       'contas_pagar',
    'bank-reconciliation':  'conciliacao',
    'financial-categories': 'categorias',
    'controladoria':        'dre',
};
