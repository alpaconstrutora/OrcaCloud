export type ControladoriaTab =
    | 'dre' | 'balancete' | 'fluxo' | 'boletos' | 'contas_pagar' | 'conciliacao' | 'categorias'
    | 'wip' | 'dre_spe';

export const VIEW_TO_CONTROLADORIA_TAB: Record<string, ControladoriaTab> = {
    'financial-dre':        'dre',
    'financial-balancete':  'balancete',
    'financial-cashflow':   'fluxo',
    'financial-boletos':    'boletos',
    'contas-a-pagar':       'contas_pagar',
    'bank-reconciliation':  'conciliacao',
    'financial-categories': 'categorias',
    'financial-wip':        'wip',
    'financial-dre-spe':    'dre_spe',
    'controladoria':        'dre',
};
