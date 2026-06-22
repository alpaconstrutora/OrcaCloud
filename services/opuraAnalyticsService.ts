import { supabase } from '../lib/supabase';

/** Dimensões pelas quais um relatório ÒPURA pode ser pivotado (whitelist = fn_opura_pivot). */
export type OpuraDimension =
  | 'supplier'
  | 'project'
  | 'cost_center'
  | 'category'
  | 'category_parent'
  | 'client'
  | 'contract'
  | 'purchase_order'
  | 'account'
  | 'empresa'
  | 'user'
  | 'dre_group'
  | 'tx_month'
  | 'due_month'
  | 'pay_month'
  | 'comp_month';

/** Campo de data usado no recorte do período. */
export type OpuraDateField = 'transaction' | 'due' | 'payment' | 'competencia';

/** Filtros Universais do PRD ÒPURA. Todos opcionais. */
export interface OpuraFilters {
  projectId?: string;
  supplierId?: string;
  clientId?: string;
  contractId?: string;
  purchaseOrderId?: string;
  costCenterId?: string;
  categoryId?: string;
  accountId?: string;
  empresaId?: string;
  direction?: 'CREDIT' | 'DEBIT';
  status?: 'CONCILIATED' | 'PENDING';
  businessStatus?: string;
  dateField?: OpuraDateField;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;   // YYYY-MM-DD
}

/** Filtros do extrato: universais + extras p/ drill-down. */
export interface OpuraEntryFilters extends OpuraFilters {
  dreGroup?: string;
  categoryParentId?: string;
  createdBy?: string;
}

/** Um lançamento (linha de extrato / alvo de drill-down). */
export interface OpuraEntry {
  id: string;
  transaction_date: string;
  due_date: string | null;
  payment_date: string | null;
  direction: 'CREDIT' | 'DEBIT';
  status: string;
  amount: number;
  category_name: string | null;
  dre_group: string | null;
  supplier_name: string | null;
  client_name: string | null;
  project_name: string | null;
  account_name: string | null;
  description: string | null;
  total_count: number;
}

/** Uma linha agregada por dimensão. */
export interface OpuraPivotRow {
  dimension_key: string | null;
  dimension_label: string;
  qtd: number;
  credit_realizado: number;
  debit_realizado: number;
  credit_previsto: number;
  debit_previsto: number;
  net_realizado: number;
  vencido: number;
}

export const opuraAnalyticsService = {
  /**
   * Núcleo "qualquer métrica por qualquer dimensão". Troca de `dimension`
   * sem trocar de tela = trocar o group-by sem novo round-trip de schema.
   */
  async pivot(
    organizationId: string,
    dimension: OpuraDimension,
    filters: OpuraFilters = {},
  ): Promise<OpuraPivotRow[]> {
    const { data, error } = await supabase.rpc('fn_opura_pivot', {
      p_organization_id:   organizationId,
      p_dimension:         dimension,
      p_date_field:        filters.dateField ?? 'transaction',
      p_date_from:         filters.dateFrom ?? null,
      p_date_to:           filters.dateTo ?? null,
      p_project_id:        filters.projectId ?? null,
      p_supplier_id:       filters.supplierId ?? null,
      p_client_id:         filters.clientId ?? null,
      p_contract_id:       filters.contractId ?? null,
      p_purchase_order_id: filters.purchaseOrderId ?? null,
      p_cost_center_id:    filters.costCenterId ?? null,
      p_category_id:       filters.categoryId ?? null,
      p_account_id:        filters.accountId ?? null,
      p_empresa_id:        filters.empresaId ?? null,
      p_direction:         filters.direction ?? null,
      p_status:            filters.status ?? null,
      p_business_status:   filters.businessStatus ?? null,
    });
    if (error) throw error;
    return (data || []) as OpuraPivotRow[];
  },

  /**
   * Mapeia uma dimensão + chave clicada para o filtro correspondente.
   * Entidades → filtro por id; temporais → recorte do mês; dre_group/
   * subcategoria/usuário → filtros dedicados do fn_opura_entries.
   * Retorna o patch de filtros a mesclar (ou null se não é drilável).
   */
  drillFilter(dimension: OpuraDimension, key: string | null): Partial<OpuraEntryFilters> | null {
    if (dimension.endsWith('_month')) {
      if (!key) return null;
      const field: OpuraDateField =
        dimension === 'due_month' ? 'due'
        : dimension === 'pay_month' ? 'payment'
        : dimension === 'comp_month' ? 'competencia'
        : 'transaction';
      const [y, m] = key.split('-').map(Number);
      const from = `${key}-01`;
      const to = new Date(y, m, 0).toISOString().slice(0, 10); // último dia do mês
      return { dateField: field, dateFrom: from, dateTo: to };
    }
    const map: Record<string, keyof OpuraEntryFilters> = {
      supplier: 'supplierId',
      project: 'projectId',
      client: 'clientId',
      contract: 'contractId',
      purchase_order: 'purchaseOrderId',
      cost_center: 'costCenterId',
      category: 'categoryId',
      account: 'accountId',
      empresa: 'empresaId',
      category_parent: 'categoryParentId',
      user: 'createdBy',
      dre_group: 'dreGroup',
    };
    const f = map[dimension];
    if (!f) return null;
    // dre_group usa a própria chave (texto); demais usam o uuid (ou null → '— Sem')
    return { [f]: key ?? undefined } as Partial<OpuraEntryFilters>;
  },

  async entries(
    organizationId: string,
    filters: OpuraEntryFilters = {},
    limit = 100,
    offset = 0,
  ): Promise<OpuraEntry[]> {
    const { data, error } = await supabase.rpc('fn_opura_entries', {
      p_organization_id:    organizationId,
      p_date_field:         filters.dateField ?? 'transaction',
      p_date_from:          filters.dateFrom ?? null,
      p_date_to:            filters.dateTo ?? null,
      p_project_id:         filters.projectId ?? null,
      p_supplier_id:        filters.supplierId ?? null,
      p_client_id:          filters.clientId ?? null,
      p_contract_id:        filters.contractId ?? null,
      p_purchase_order_id:  filters.purchaseOrderId ?? null,
      p_cost_center_id:     filters.costCenterId ?? null,
      p_category_id:        filters.categoryId ?? null,
      p_account_id:         filters.accountId ?? null,
      p_empresa_id:         filters.empresaId ?? null,
      p_direction:          filters.direction ?? null,
      p_status:             filters.status ?? null,
      p_business_status:    filters.businessStatus ?? null,
      p_dre_group:          filters.dreGroup ?? null,
      p_category_parent_id: filters.categoryParentId ?? null,
      p_created_by:         filters.createdBy ?? null,
      p_limit:              limit,
      p_offset:             offset,
    });
    if (error) throw error;
    return (data || []) as OpuraEntry[];
  },
};
