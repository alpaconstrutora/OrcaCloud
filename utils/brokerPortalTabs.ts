/**
 * Ids das abas do Portal do Corretor — fonte única, fora do componente, para
 * que a ajuda (utils/portalHelpDefaults.ts › PORTAL_SECTIONS.corretor) e o
 * portal falem das mesmas seções (teste: __tests__/portalHelpSections.test.ts).
 * A ordem é a de ALL_TABS no BrokerPortal.
 */
export const BROKER_PORTAL_TAB_IDS = [
  'analytics', 'estoque', 'empreendimentos', 'propostas', 'leads', 'comissoes',
  'materiais', 'ranking', 'treinamento', 'agenda', 'chat', 'saude',
] as const;
export type BrokerPortalTabId = typeof BROKER_PORTAL_TAB_IDS[number];

/**
 * Abas habilitadas para o corretor — `broker_profiles.settings.brokerPortalTabs`,
 * gravado pelo botão "Configurar abas visíveis do corretor". Lista vazia ou
 * ausente = todas (regra de sempre do desktop). Id desconhecido é descartado.
 */
export const abasHabilitadas = (
  settings?: { brokerPortalTabs?: readonly string[] | null } | null,
): BrokerPortalTabId[] => {
  const salvas = settings?.brokerPortalTabs ?? [];
  if (salvas.length === 0) return [...BROKER_PORTAL_TAB_IDS];
  return BROKER_PORTAL_TAB_IDS.filter(id => salvas.includes(id));
};

/**
 * Ordem das abas no CELULAR (plano 2026-10-16-portal-corretor-mobile, D2): o
 * trabalho de rua primeiro. Saúde fica de fora (D6) — é painel de gestão.
 */
export const ORDEM_DO_CELULAR: readonly BrokerPortalTabId[] = [
  'empreendimentos', 'estoque', 'propostas', 'comissoes',
  'leads', 'materiais', 'chat', 'agenda', 'ranking', 'treinamento', 'analytics',
];

/** Quantas abas a barra inferior comporta (4 + "Mais", ou 5 sem "Mais"). */
export const LUGARES_NA_BARRA = 5;

/**
 * Barra inferior × folha "Mais" do celular (D2 + D6 + D8). Só entra o que está
 * habilitado para o corretor; até 5 abas cabem todas na barra, acima disso a
 * barra fica com as 4 primeiras e o resto vai para "Mais".
 */
export const abasDoCelular = (
  habilitadas: readonly string[],
): { barra: BrokerPortalTabId[]; mais: BrokerPortalTabId[] } => {
  const todas = ORDEM_DO_CELULAR.filter(id => habilitadas.includes(id));
  if (todas.length <= LUGARES_NA_BARRA) return { barra: todas, mais: [] };
  return { barra: todas.slice(0, LUGARES_NA_BARRA - 1), mais: todas.slice(LUGARES_NA_BARRA - 1) };
};
