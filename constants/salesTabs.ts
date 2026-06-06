export type SalesTab = 'espelho' | 'alugueis' | 'corretores' | 'crm' | 'contratos' | 'viabilidade';

export const VIEW_TO_SALES_TAB: Record<string, SalesTab> = {
    'sales':               'espelho',
    'rentals':             'alugueis',
    'broker-area':         'corretores',
    'broker-proposals':    'corretores',
    'broker-leads':        'corretores',
    'broker-commissions':  'corretores',
    'broker-materials':    'corretores',
    'broker-ranking':      'corretores',
    'broker-training':     'corretores',
    'broker-events':       'corretores',
    'broker-chat':         'corretores',
    'broker-analytics':    'corretores',
    'broker-health':       'corretores',
    'broker-integrations': 'corretores',
    'services-commercial': 'crm',
    'service-contracts':   'contratos',
    'imovib':              'viabilidade',
    'gestao-vendas':       'espelho',
};
