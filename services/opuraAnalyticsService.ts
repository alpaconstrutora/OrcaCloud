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
  | 'contraparte'
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

/** KPIs financeiros de uma obra (Central de Obras — Categoria 6). */
export interface OpuraObraKpis {
  contratado_receita: number;
  contratado_custo: number;
  recebido: number;
  pago: number;
  a_receber: number;
  a_pagar: number;
  vencido_receber: number;
  vencido_pagar: number;
  qtd_contratos: number;
  qtd_lancamentos: number;
}

/** KPIs financeiros de um cliente (Central de Clientes — Categoria 8). */
export interface OpuraClienteKpis {
  contratado: number;
  recebido: number;
  a_receber: number;
  vencido: number;
  devolvido: number;
  qtd_contratos: number;
  qtd_lancamentos: number;
}

/** KPIs financeiros de um fornecedor (Central de Fornecedores — Categoria 7). */
export interface OpuraFornecedorKpis {
  contratado: number;
  pago: number;
  a_pagar: number;
  vencido: number;
  estornado: number;
  qtd_contratos: number;
  qtd_lancamentos: number;
}

/** Ponto da série mensal de uma obra (Resultado Mensal / Fluxo de Caixa). */
export interface OpuraObraMes {
  mes: string;
  entradas: number;
  saidas: number;
  entradas_prev: number;
  saidas_prev: number;
  resultado: number;
}

/** Filtros do extrato: universais + extras p/ drill-down. */
export interface OpuraEntryFilters extends OpuraFilters {
  dreGroup?: string;
  categoryParentId?: string;
  createdBy?: string;
  partyLabel?: string;
}

/** Linha de comparação entre dois períodos (A = atual, B = base/anterior). */
export interface OpuraCompareRow {
  dimension_key: string | null;
  dimension_label: string;
  valorA: number;
  valorB: number;
  delta: number;            // valorA − valorB
  variacao: number | null;  // % sobre |valorB| (null se B = 0)
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
    organizationId: string | null,
    dimension: OpuraDimension,
    filters: OpuraFilters = {},
  ): Promise<OpuraPivotRow[]> {
    const { data, error } = await supabase.rpc('fn_opura_pivot', {
      p_organization_id:   organizationId || null,
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
   * Comparativo temporal: agrega a mesma dimensão em dois períodos
   * (A = atual, B = base/anterior) e mescla por chave. Métrica = net_realizado.
   * Reusa fn_opura_pivot (sem RPC nova).
   */
  async compare(
    organizationId: string | null,
    dimension: OpuraDimension,
    filtersA: OpuraFilters,
    filtersB: OpuraFilters,
  ): Promise<OpuraCompareRow[]> {
    const [rowsA, rowsB] = await Promise.all([
      opuraAnalyticsService.pivot(organizationId, dimension, filtersA),
      opuraAnalyticsService.pivot(organizationId, dimension, filtersB),
    ]);
    const merged = new Map<string, OpuraCompareRow>();
    const keyOf = (r: OpuraPivotRow) => r.dimension_key ?? `__${r.dimension_label}`;
    for (const r of rowsA) {
      merged.set(keyOf(r), {
        dimension_key: r.dimension_key,
        dimension_label: r.dimension_label,
        valorA: r.net_realizado,
        valorB: 0,
        delta: 0,
        variacao: null,
      });
    }
    for (const r of rowsB) {
      const k = keyOf(r);
      const ex = merged.get(k);
      if (ex) ex.valorB = r.net_realizado;
      else merged.set(k, {
        dimension_key: r.dimension_key,
        dimension_label: r.dimension_label,
        valorA: 0,
        valorB: r.net_realizado,
        delta: 0,
        variacao: null,
      });
    }
    const out = [...merged.values()].map(r => ({
      ...r,
      delta: r.valorA - r.valorB,
      variacao: r.valorB === 0 ? null : ((r.valorA - r.valorB) / Math.abs(r.valorB)) * 100,
    }));
    out.sort((a, b) => Math.abs(b.valorA) - Math.abs(a.valorA));
    return out;
  },

  /**
   * Mapeia uma dimensão + chave clicada para o filtro correspondente.
   * Entidades → filtro por id; temporais → recorte do mês; dre_group/
   * subcategoria/usuário → filtros dedicados do fn_opura_entries.
   * Retorna o patch de filtros a mesclar (ou null se não é drilável).
   */
  drillFilter(dimension: OpuraDimension, key: string | null): Partial<OpuraEntryFilters> | null {
    // Fornecedor: a chave pode ser o FK (uuid) ou o nome-texto (party_label, nas saídas)
    if (dimension === 'supplier') {
      if (!key) return { supplierId: undefined };
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
      return isUuid ? { supplierId: key } : { partyLabel: key, direction: 'DEBIT' };
    }
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
      contraparte: 'partyLabel',
      dre_group: 'dreGroup',
    };
    const f = map[dimension];
    if (!f) return null;
    // dre_group/contraparte usam a própria chave (texto); demais usam o uuid (ou null → '— Sem')
    return { [f]: key ?? undefined } as Partial<OpuraEntryFilters>;
  },

  async entries(
    organizationId: string | null,
    filters: OpuraEntryFilters = {},
    limit = 100,
    offset = 0,
  ): Promise<OpuraEntry[]> {
    const { data, error } = await supabase.rpc('fn_opura_entries', {
      p_organization_id:    organizationId || null,
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
      p_party_label:        filters.partyLabel ?? null,
      p_limit:              limit,
      p_offset:             offset,
    });
    if (error) throw error;
    return (data || []) as OpuraEntry[];
  },

  async obraKpis(
    organizationId: string | null,
    projectId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<OpuraObraKpis | null> {
    const { data, error } = await supabase.rpc('fn_opura_obra_kpis', {
      p_organization_id: organizationId || null,
      p_project_id:      projectId,
      p_date_from:       dateFrom ?? null,
      p_date_to:         dateTo ?? null,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return (row ?? null) as OpuraObraKpis | null;
  },

  async obraMensal(
    organizationId: string | null,
    projectId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<OpuraObraMes[]> {
    const { data, error } = await supabase.rpc('fn_opura_obra_mensal', {
      p_organization_id: organizationId || null,
      p_project_id:      projectId,
      p_date_from:       dateFrom ?? null,
      p_date_to:         dateTo ?? null,
    });
    if (error) throw error;
    return (data || []) as OpuraObraMes[];
  },

  async clienteKpis(
    organizationId: string | null,
    clientId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<OpuraClienteKpis | null> {
    const { data, error } = await supabase.rpc('fn_opura_cliente_kpis', {
      p_organization_id: organizationId || null,
      p_client_id:       clientId,
      p_date_from:       dateFrom ?? null,
      p_date_to:         dateTo ?? null,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return (row ?? null) as OpuraClienteKpis | null;
  },

  async fornecedorKpis(
    organizationId: string | null,
    supplierId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<OpuraFornecedorKpis | null> {
    const { data, error } = await supabase.rpc('fn_opura_fornecedor_kpis', {
      p_organization_id: organizationId || null,
      p_supplier_id:     supplierId,
      p_date_from:       dateFrom ?? null,
      p_date_to:         dateTo ?? null,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return (row ?? null) as OpuraFornecedorKpis | null;
  },
};
