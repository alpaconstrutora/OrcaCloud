/**
 * Abas visíveis do Portal do Parceiro — configuradas por workspace em
 * `partner_workspaces.settings`, pelas engrenagens da visão do app
 * (Portais › Portal do Parceiro). Mesmo desenho do Portal do Fornecedor
 * (`suppliers.settings.supplierPortalTabs`, SupplierDashboard.tsx).
 *
 * Duas listas independentes, mesma regra:
 *  - `partnerPortalTabs`   — as 6 abas do portal (engrenagem do cabeçalho do
 *                            workspace), desde 29/09/2026;
 *  - `partnerContractTabs` — as 7 sub-abas do detalhe do contrato, valendo para
 *                            TODOS os contratos do parceiro (engrenagem da aba
 *                            Contratos), desde 03/10/2026.
 *
 * ⚠️ Lista VAZIA é configuração ("nenhuma aba"), não ausência de configuração.
 * Só `undefined`/`null`/não-array significa "nunca configurado" → todas
 * visíveis. Tratar `[]` como "todas" fazia o gestor que desligava tudo ver o
 * portal voltar inteiro — o bug já corrigido no Fornecedor e no Investidor.
 *
 * É visibilidade de navegação, não autorização: as RPCs do link continuam
 * respondendo pelo token. Igual ao Fornecedor.
 */

type Settings = Record<string, any> | null | undefined;

/**
 * Gera as duas operações de uma lista de abas guardada em `settings[chave]`.
 * Resultado sempre na ordem canônica de `ids` e só com ids conhecidos.
 */
function configDeAbas<Id extends string>(ids: readonly Id[], chave: string) {
  return {
    habilitadas(settings: Settings): Id[] {
      const saved = settings?.[chave];
      if (!Array.isArray(saved)) return [...ids];
      return ids.filter(id => saved.includes(id));
    },
    alternar(enabled: readonly Id[], id: Id): Id[] {
      const set = new Set(enabled);
      if (set.has(id)) set.delete(id); else set.add(id);
      return ids.filter(t => set.has(t));
    },
  };
}

// ── Abas do portal ───────────────────────────────────────────────────────────

export const PARTNER_PORTAL_TABS_KEY = 'partnerPortalTabs';

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

const abasDoPortal = configDeAbas(PARTNER_PORTAL_TAB_IDS, PARTNER_PORTAL_TABS_KEY);

/** Abas do portal habilitadas, sempre na ordem canônica e só com ids conhecidos. */
export function enabledPartnerPortalTabs(settings: Settings): PartnerPortalTabId[] {
  return abasDoPortal.habilitadas(settings);
}

/** Liga/desliga uma aba do portal, devolvendo a nova lista na ordem canônica. */
export function togglePartnerPortalTab(enabled: readonly PartnerPortalTabId[], id: PartnerPortalTabId): PartnerPortalTabId[] {
  return abasDoPortal.alternar(enabled, id);
}

// ── Sub-abas do detalhe do contrato ─────────────────────────────────────────

export const PARTNER_CONTRACT_TABS_KEY = 'partnerContractTabs';

export const PARTNER_CONTRACT_TAB_IDS = [
  'overview',
  'items',
  'execucao',
  'addendums',
  'measurements',
  'retention',
  'penalties',
] as const;

export type PartnerContractTabId = typeof PARTNER_CONTRACT_TAB_IDS[number];

export const PARTNER_CONTRACT_TAB_LABELS: Record<PartnerContractTabId, string> = {
  overview: 'Visão Geral',
  items: 'Itens',
  execucao: 'Execução & Entrega',
  addendums: 'Aditivos',
  measurements: 'Medições',
  retention: 'Retenção de Garantia',
  penalties: 'Penalidades',
};

const abasDoContrato = configDeAbas(PARTNER_CONTRACT_TAB_IDS, PARTNER_CONTRACT_TABS_KEY);

/** Sub-abas do contrato habilitadas, sempre na ordem canônica e só com ids conhecidos. */
export function enabledPartnerContractTabs(settings: Settings): PartnerContractTabId[] {
  return abasDoContrato.habilitadas(settings);
}

/** Liga/desliga uma sub-aba do contrato, devolvendo a nova lista na ordem canônica. */
export function togglePartnerContractTab(enabled: readonly PartnerContractTabId[], id: PartnerContractTabId): PartnerContractTabId[] {
  return abasDoContrato.alternar(enabled, id);
}
