/**
 * Abas visíveis do Portal do Parceiro — configuradas por workspace em
 * `partner_workspaces.settings.partnerPortalTabs`, pelo botão de engrenagem da
 * visão do app (Portais › Portal do Parceiro). Mesmo desenho do Portal do
 * Fornecedor (`suppliers.settings.supplierPortalTabs`, SupplierDashboard.tsx).
 *
 * ⚠️ Lista VAZIA é configuração ("nenhuma aba"), não ausência de configuração.
 * Só `undefined`/`null`/não-array significa "nunca configurado" → todas
 * visíveis. Tratar `[]` como "todas" fazia o gestor que desligava tudo ver o
 * portal voltar inteiro — o bug já corrigido no Fornecedor e no Investidor.
 *
 * É visibilidade de navegação, não autorização: as RPCs do link continuam
 * respondendo pelo token. Igual ao Fornecedor.
 */
export const PARTNER_PORTAL_TAB_IDS = [
  'dashboard',
  'conversas',
  'documentos',
  'contratos',
  'financeiro',
  'solicitacoes',
] as const;

export type PartnerPortalTabId = typeof PARTNER_PORTAL_TAB_IDS[number];

export const PARTNER_PORTAL_TAB_LABELS: Record<PartnerPortalTabId, string> = {
  dashboard: 'Dashboard',
  conversas: 'Conversas',
  documentos: 'Documentos',
  contratos: 'Contratos',
  financeiro: 'Financeiro',
  solicitacoes: 'Solicitações',
};

/** Abas habilitadas, sempre na ordem canônica e só com ids conhecidos. */
export function enabledPartnerPortalTabs(settings: Record<string, any> | null | undefined): PartnerPortalTabId[] {
  const saved = settings?.partnerPortalTabs;
  if (!Array.isArray(saved)) return [...PARTNER_PORTAL_TAB_IDS];
  return PARTNER_PORTAL_TAB_IDS.filter(id => saved.includes(id));
}

/** Liga/desliga uma aba, devolvendo a nova lista na ordem canônica. */
export function togglePartnerPortalTab(enabled: readonly PartnerPortalTabId[], id: PartnerPortalTabId): PartnerPortalTabId[] {
  const set = new Set(enabled);
  if (set.has(id)) set.delete(id); else set.add(id);
  return PARTNER_PORTAL_TAB_IDS.filter(t => set.has(t));
}
