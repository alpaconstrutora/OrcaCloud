/**
 * Ids das abas do Portal de Treinamentos — fonte única, fora do componente,
 * para que a ajuda (utils/portalHelpDefaults.ts › PORTAL_SECTIONS.treinamentos)
 * e o portal (components/training/TrainingPortal.tsx) falem das mesmas seções
 * (teste: __tests__/portalHelpSections.test.ts). A ordem é a do menu.
 *
 * Plano: docs/planos/2026-10-15-portal-de-treinamentos.md
 */
export const TRAINING_PORTAL_TAB_IDS = ['treinamentos', 'catalogo', 'certificados', 'historico'] as const;
export type TrainingPortalTabId = typeof TRAINING_PORTAL_TAB_IDS[number];

export const TRAINING_PORTAL_TAB_LABELS: Record<TrainingPortalTabId, string> = {
  treinamentos: 'Meus treinamentos',
  catalogo: 'Catálogo',
  certificados: 'Certificados',
  historico: 'Histórico',
};

/** Aba salva que não existe mais cai na primeira — a ajuda e a tela falam da mesma seção. */
export function resolverAbaDoPortalDeTreinamentos(valor: string | null | undefined): TrainingPortalTabId {
  return (TRAINING_PORTAL_TAB_IDS as readonly string[]).includes(valor ?? '')
    ? (valor as TrainingPortalTabId)
    : 'treinamentos';
}
