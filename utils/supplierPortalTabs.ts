/**
 * Ids das abas do Portal do Fornecedor — fonte única, fora do componente, para
 * que a ajuda (utils/portalHelpDefaults.ts › PORTAL_SECTIONS.fornecedor) e o
 * portal falem das mesmas seções (teste: __tests__/portalHelpSections.test.ts).
 * A ordem é a da barra do portal.
 */
export const SUPPLIER_PORTAL_TAB_IDS = ['overview', 'negotiations', 'quotations', 'orders', 'documents', 'financeiro'] as const;
export type SupplierPortalTabId = typeof SUPPLIER_PORTAL_TAB_IDS[number];
