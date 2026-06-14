export type ControladoriaTab =
    | 'dre' | 'balancete' | 'fluxo'
    | 'wip' | 'dre_spe';

export const VIEW_TO_CONTROLADORIA_TAB: Record<string, ControladoriaTab> = {
    'financial-dre':        'dre',
    'financial-balancete':  'balancete',
    'financial-cashflow':   'fluxo',
    'financial-wip':        'wip',
    'financial-dre-spe':    'dre_spe',
    'controladoria':        'dre',
};
