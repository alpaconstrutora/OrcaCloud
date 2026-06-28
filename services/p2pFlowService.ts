import { supabase } from '../lib/supabase';

export type SeamStatus = 'auto' | 'manual' | 'gap';

export interface P2PRecord {
  id: string;
  label: string;
  sublabel?: string;
  value?: number;
  status?: string;
  date?: string;
}

export interface P2PStage {
  id: string;
  label: string;
  owner: string;
  view?: string;
  count: number;
  pending?: number;
  inboundSeam: SeamStatus;
  inboundNote?: string;
  records?: P2PRecord[];
}

export interface P2PFlowSnapshot {
  stages: P2PStage[];
  generatedAt: string;
}

type Filters = Record<string, string | string[] | null | undefined>;

async function countRows(table: string, filters: Filters): Promise<number> {
  try {
    let q = supabase.from(table).select('id', { count: 'exact', head: true });
    for (const [col, val] of Object.entries(filters)) {
      if (val === null || val === undefined) continue;
      if (Array.isArray(val)) q = q.in(col, val);
      else q = q.eq(col, val);
    }
    const { count, error } = await q;
    if (error) { console.warn(`[p2pFlow] count ${table}:`, error.message); return 0; }
    return count ?? 0;
  } catch (e) {
    console.warn(`[p2pFlow] count ${table}:`, e); return 0;
  }
}

async function fetchRows<T extends Record<string, unknown>>(
  table: string,
  columns: string,
  filters: Filters,
  limit = 50,
): Promise<T[]> {
  try {
    let q = supabase.from(table).select(columns).limit(limit).order('created_at', { ascending: false });
    for (const [col, val] of Object.entries(filters)) {
      if (val === null || val === undefined) continue;
      if (Array.isArray(val)) q = q.in(col, val);
      else q = q.eq(col, val);
    }
    const { data, error } = await q;
    if (error) { console.warn(`[p2pFlow] fetch ${table}:`, error.message); return []; }
    return (data ?? []) as unknown as T[];
  } catch (e) {
    console.warn(`[p2pFlow] fetch ${table}:`, e); return [];
  }
}

const fmtBrl = (n?: number) =>
  n != null ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : undefined;

const fmtDate = (iso?: string) => {
  if (!iso) return undefined;
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export const p2pFlowService = {
  async listProjects(organizationId: string): Promise<{ id: string; name: string }[]> {
    const { data } = await supabase
      .from('projects')
      .select('id, name')
      .eq('organization_id', organizationId)
      .order('name');
    return (data ?? []) as { id: string; name: string }[];
  },

  async getSnapshot(organizationId: string, projectId?: string): Promise<P2PFlowSnapshot> {
    const org: Filters = { organization_id: organizationId };
    const proj: Filters = projectId ? { project_id: projectId } : {};

    const [
      necessidades,
      cotacoes,
      pedidosAbertos,
      pedidosRecebidos,
      recebimentos,
      movEstoque,
      notas,
      contasPagar,
      pagos,
    ] = await Promise.all([
      countRows('procurement_plan_items', { ...org, ...proj }),
      countRows('quotation_requests', { ...org, ...proj }),
      countRows('purchase_orders', { ...org, ...proj, status: ['Rascunho', 'Enviado'] }),
      countRows('purchase_orders', { ...org, ...proj, status: ['Recebido', 'Parcial'] }),
      countRows('purchase_receipts', { ...proj }),
      countRows('stock_movements', { ...org }),
      countRows('nfe_invoices', { ...org }),
      countRows('internal_transactions', { ...org, ...proj, direction: 'DEBIT', status: 'PENDING' }),
      countRows('internal_transactions', { ...org, ...proj, direction: 'DEBIT', status: 'CONCILIATED' }),
    ]);

    const stages: P2PStage[] = [
      {
        id: 'solicitacao', label: 'Solicitação', owner: 'Obras / Almoxarifado',
        view: 'plano-aquisicoes', count: necessidades,
        inboundSeam: 'auto', inboundNote: 'Origem da necessidade (orçamento + cronograma)',
      },
      {
        id: 'cotacao', label: 'Cotação', owner: 'Suprimentos',
        view: 'supplies-quotations', count: cotacoes,
        inboundSeam: 'auto', inboundNote: 'Plano gera quotation_request',
      },
      {
        id: 'pedido', label: 'Pedido de Compra', owner: 'Suprimentos',
        view: 'supplies-orders', count: pedidosAbertos + pedidosRecebidos, pending: pedidosAbertos,
        inboundSeam: 'auto', inboundNote: 'Cotação equalizada vira pedido',
      },
      {
        id: 'recebimento', label: 'Recebimento', owner: 'Estoque',
        view: 'supplies-receipts', count: recebimentos,
        inboundSeam: 'auto', inboundNote: 'Conferência física do pedido',
      },
      {
        id: 'estoque', label: 'Estoque', owner: 'Almoxarifado',
        view: 'almoxarifado', count: movEstoque,
        inboundSeam: 'auto', inboundNote: 'Recebimento gera entrada (custo médio) automaticamente',
      },
      {
        id: 'fiscal', label: 'Nota Fiscal', owner: 'Fiscal',
        view: 'fiscal-nfe', count: notas,
        inboundSeam: 'gap', inboundNote: 'SEM 3-way match (Pedido × Recebimento × Nota)',
      },
      {
        id: 'financeiro', label: 'Contas a Pagar', owner: 'Financeiro',
        view: 'project-financial', count: contasPagar, pending: contasPagar,
        inboundSeam: 'manual',
        inboundNote: 'Título nasce do recebimento+nota (parcial); NF-e isolada não gera título',
      },
      {
        id: 'pagamento', label: 'Pago / Baixado', owner: 'Tesouraria',
        view: 'project-financial', count: pagos,
        inboundSeam: 'manual', inboundNote: 'Baixa via conciliação bancária',
      },
    ];

    return { stages, generatedAt: new Date().toISOString() };
  },

  async getStageRecords(
    stageId: string,
    organizationId: string,
    projectId?: string,
  ): Promise<P2PRecord[]> {
    const org: Filters = { organization_id: organizationId };
    const proj: Filters = projectId ? { project_id: projectId } : {};

    switch (stageId) {
      case 'solicitacao': {
        const rows = await fetchRows<{
          id: string; input_description: string; input_unit: string;
          required_qty: number; status: string; need_date: string;
        }>(
          'procurement_plan_items',
          'id, input_description, input_unit, required_qty, status, need_date',
          { ...org, ...proj },
        );
        return rows.map(r => ({
          id: r.id,
          label: r.input_description,
          sublabel: `${r.required_qty} ${r.input_unit}`,
          status: r.status,
          date: fmtDate(r.need_date),
        }));
      }

      case 'cotacao': {
        const rows = await fetchRows<{
          id: string; title: string; status: string; created_at: string;
        }>(
          'quotation_requests',
          'id, title, status, created_at',
          { ...org, ...proj },
        );
        return rows.map(r => ({
          id: r.id,
          label: r.title ?? r.id.slice(0, 8),
          status: r.status,
          date: fmtDate(r.created_at),
        }));
      }

      case 'pedido': {
        const rows = await fetchRows<{
          id: string; number: string; status: string;
          delivery_date: string; created_at: string;
        }>(
          'purchase_orders',
          'id, number, status, delivery_date, created_at',
          { ...org, ...proj, status: ['Rascunho', 'Enviado'] },
        );
        return rows.map(r => ({
          id: r.id,
          label: `Pedido #${r.number}`,
          status: r.status,
          date: fmtDate(r.delivery_date ?? r.created_at),
        }));
      }

      case 'recebimento': {
        const rows = await fetchRows<{
          id: string; order_id: string; status: string; created_at: string; notes: string;
        }>(
          'purchase_receipts',
          'id, order_id, status, created_at, notes',
          { ...proj },
        );
        return rows.map(r => ({
          id: r.id,
          label: `Recebimento — Pedido ${r.order_id.slice(0, 8)}`,
          sublabel: r.notes ?? undefined,
          status: r.status,
          date: fmtDate(r.created_at),
        }));
      }

      case 'estoque': {
        const rows = await fetchRows<{
          id: string; input_description: string; type: string;
          quantity: number; input_unit: string; moved_at: string;
        }>(
          'stock_movements',
          'id, input_description, type, quantity, input_unit, moved_at',
          { ...org },
        );
        return rows.map(r => ({
          id: r.id,
          label: r.input_description,
          sublabel: `${r.quantity} ${r.input_unit}`,
          status: r.type,
          date: fmtDate(r.moved_at),
        }));
      }

      case 'fiscal': {
        const rows = await fetchRows<{
          id: string; issuer_name: string; total_value: number;
          document_status: string; issue_date: string;
        }>(
          'nfe_invoices',
          'id, issuer_name, total_value, document_status, issue_date',
          { ...org },
        );
        return rows.map(r => ({
          id: r.id,
          label: r.issuer_name ?? 'Emitente desconhecido',
          value: r.total_value,
          sublabel: fmtBrl(r.total_value),
          status: r.document_status,
          date: fmtDate(r.issue_date),
        }));
      }

      case 'financeiro': {
        const rows = await fetchRows<{
          id: string; description: string; amount: number;
          status: string; transaction_date: string;
        }>(
          'internal_transactions',
          'id, description, amount, status, transaction_date',
          { ...org, ...proj, direction: 'DEBIT', status: 'PENDING' },
        );
        return rows.map(r => ({
          id: r.id,
          label: r.description ?? 'Sem descrição',
          sublabel: fmtBrl(r.amount),
          value: r.amount,
          status: r.status,
          date: fmtDate(r.transaction_date),
        }));
      }

      case 'pagamento': {
        const rows = await fetchRows<{
          id: string; description: string; amount: number;
          status: string; transaction_date: string;
        }>(
          'internal_transactions',
          'id, description, amount, status, transaction_date',
          { ...org, ...proj, direction: 'DEBIT', status: 'CONCILIATED' },
        );
        return rows.map(r => ({
          id: r.id,
          label: r.description ?? 'Sem descrição',
          sublabel: fmtBrl(r.amount),
          value: r.amount,
          status: r.status,
          date: fmtDate(r.transaction_date),
        }));
      }

      default:
        return [];
    }
  },
};
