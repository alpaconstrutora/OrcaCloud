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
};
