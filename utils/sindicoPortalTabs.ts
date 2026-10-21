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
    financeiro: 'Prestação de contas',
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
