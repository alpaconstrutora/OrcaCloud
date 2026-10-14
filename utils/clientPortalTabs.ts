/**
 * Ids das abas do Portal do Cliente — fonte única, fora do componente, para que
 * a ajuda (utils/portalHelpDefaults.ts › PORTAL_SECTIONS.cliente) e o portal
 * (components/ClientArea.tsx › ALL_TABS) falem das mesmas seções (teste:
 * __tests__/portalHelpSections.test.ts). A ordem é a do menu do portal.
 */
export const CLIENT_PORTAL_TAB_IDS = [
  'dashboard', 'jornada', 'unidade', 'obra', 'cronograma-ff', 'visual', 'personalizacao',
  'diario', 'documentos', 'contratos', 'financeiro', 'suporte', 'manutencao', 'condominio',
] as const;
export type ClientPortalTabId = typeof CLIENT_PORTAL_TAB_IDS[number];
