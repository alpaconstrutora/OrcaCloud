/**
 * Ids das abas do Portal do Síndico — fonte única, fora do componente (molde:
 * utils/trainingPortalTabs.ts). A ordem é a do menu.
 * Plano: docs/planos/2026-10-20-portal-do-sindico.md
 */
export const SINDICO_PORTAL_TAB_IDS = [
    'visao', 'unidades', 'chamados', 'financeiro', 'avisos', 'documentos', 'manutencao', 'equipamentos',
] as const;
export type SindicoPortalTabId = typeof SINDICO_PORTAL_TAB_IDS[number];

export const SINDICO_PORTAL_TAB_LABELS: Record<SindicoPortalTabId, string> = {
    visao: 'Visão geral',
    unidades: 'Unidades',
    chamados: 'Chamados',
    // Era "Prestação de contas" (só os rateios); virou o Financeiro do
    // condomínio em 24/10/2026, e a prestação de contas é uma sub-aba dele.
    financeiro: 'Financeiro',
    avisos: 'Avisos',
    documentos: 'Documentos',
    manutencao: 'Manutenção',
    equipamentos: 'Equipamentos',
};

/** Aba salva que não existe mais cai na primeira. */
export function resolverAbaDoSindico(valor: string | null | undefined): SindicoPortalTabId {
    return (SINDICO_PORTAL_TAB_IDS as readonly string[]).includes(valor ?? '')
        ? (valor as SindicoPortalTabId)
        : 'visao';
}

/**
 * Sub-abas do Financeiro (plano docs/planos/2026-10-24-portal-sindico-financeiro.md).
 * "Prestação de contas" é a antiga aba inteira: os rateios, com aprovar/devolver.
 */
export const SINDICO_FINANCEIRO_SUBABA_IDS = ['resumo', 'pagar', 'receber', 'prestacao', 'contas'] as const;
export type SindicoFinanceiroSubAbaId = typeof SINDICO_FINANCEIRO_SUBABA_IDS[number];

export const SINDICO_FINANCEIRO_SUBABA_LABELS: Record<SindicoFinanceiroSubAbaId, string> = {
    resumo: 'Resumo do mês',
    pagar: 'Contas a pagar',
    receber: 'Contas a receber',
    prestacao: 'Prestação de contas',
    contas: 'Contas bancárias',
};

export function resolverSubAbaDoFinanceiro(valor: string | null | undefined): SindicoFinanceiroSubAbaId {
    return (SINDICO_FINANCEIRO_SUBABA_IDS as readonly string[]).includes(valor ?? '')
        ? (valor as SindicoFinanceiroSubAbaId)
        : 'resumo';
}
