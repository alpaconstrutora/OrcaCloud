/**
 * Ids das abas do Portal do Corretor — fonte única, fora do componente, para
 * que a ajuda (utils/portalHelpDefaults.ts › PORTAL_SECTIONS.corretor) e o
 * portal falem das mesmas seções (teste: __tests__/portalHelpSections.test.ts).
 * A ordem é a de ALL_TABS no BrokerPortal.
 */
export const BROKER_PORTAL_TAB_IDS = [
  'analytics', 'estoque', 'empreendimentos', 'propostas', 'leads', 'comissoes',
  'materiais', 'ranking', 'treinamento', 'agenda', 'chat', 'saude', 'integracoes',
] as const;
export type BrokerPortalTabId = typeof BROKER_PORTAL_TAB_IDS[number];
