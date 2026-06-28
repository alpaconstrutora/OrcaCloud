import { supabase } from '../lib/supabase';

/**
 * p2pFlowService — alimenta a Torre de Controle do fluxo Procure-to-Pay.
 *
 * Não cria nem move nada: apenas conta quantos registros vivos existem em cada
 * etapa do fluxo Suprimentos → Fiscal → Financeiro → Tesouraria, para a página
 * P2PFlowBoard renderizar o panorama. As contagens usam `head: true` (sem trazer
 * linhas) e são filtradas por organização (e opcionalmente por obra).
 */

export type SeamStatus = 'auto' | 'manual' | 'gap';

export interface P2PStage {
  /** id estável para ligação/navegação */
  id: string;
  /** rótulo curto exibido no nó */
  label: string;
  /** módulo/área responsável (spec, seção 2) */
  owner: string;
  /** view do app para onde o nó navega (ou undefined se sem tela dedicada) */
  view?: string;
  /** total de registros vivos nessa etapa */
  count: number;
  /** quantos estão parados/pendentes (subconjunto de count), quando aplicável */
  pending?: number;
  /** estado da COSTURA que ENTRA nesta etapa (vinda da anterior) */
  inboundSeam: SeamStatus;
  /** observação curta sobre a costura de entrada */
  inboundNote?: string;
}

export interface P2PFlowSnapshot {
  stages: P2PStage[];
  generatedAt: string;
}

// Conta linhas de uma tabela com filtros de igualdade. Retorna 0 em erro
// (a página é só leitura/diagnóstico — nunca deve quebrar por uma tabela ausente).
async function countRows(
  table: string,
  filters: Record<string, string | string[] | null | undefined>,
): Promise<number> {
  try {
    let q = supabase.from(table).select('id', { count: 'exact', head: true });
    for (const [col, val] of Object.entries(filters)) {
      if (val === null || val === undefined) continue;
      if (Array.isArray(val)) q = q.in(col, val);
      else q = q.eq(col, val);
    }
    const { count, error } = await q;
    if (error) {
      console.warn(`[p2pFlow] contagem de ${table} falhou:`, error.message);
      return 0;
    }
    return count ?? 0;
  } catch (e) {
    console.warn(`[p2pFlow] contagem de ${table} lançou:`, e);
    return 0;
  }
}

export const p2pFlowService = {
  /**
   * Monta o snapshot do fluxo para a organização (e obra, se informada).
   * Roda as contagens em paralelo.
   */
  async getSnapshot(organizationId: string, projectId?: string): Promise<P2PFlowSnapshot> {
    const org = { organization_id: organizationId };
    const proj = projectId ? { project_id: projectId } : {};

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
      // 1. Solicitação / Necessidade de compra
      countRows('procurement_plan_items', { ...org, ...proj }),
      // 2. Cotações em andamento
      countRows('quotation_requests', { ...org, ...proj }),
      // 3. Pedidos ainda não recebidos (Rascunho/Enviado)
      countRows('purchase_orders', { ...org, ...proj, status: ['Rascunho', 'Enviado'] }),
      // 3b. Pedidos recebidos/parciais (já entraram na esteira de recebimento)
      countRows('purchase_orders', { ...org, ...proj, status: ['Recebido', 'Parcial'] }),
      // 4. Recebimentos registrados
      countRows('purchase_receipts', { ...proj }),
      // 5. Movimentações de estoque (entradas geradas)
      countRows('stock_movements', { ...org }),
      // 6. Notas fiscais ingeridas
      countRows('nfe_invoices', { ...org }),
      // 7. Contas a pagar em aberto (financeiro controla)
      countRows('internal_transactions', { ...org, type: 'EXPENSE', status: 'PENDING' }),
      // 8. Títulos liquidados (pagos/conciliados — tesouraria movimentou)
      countRows('internal_transactions', { ...org, type: 'EXPENSE', status: 'CONCILIATED' }),
    ]);

    const stages: P2PStage[] = [
      {
        id: 'solicitacao',
        label: 'Solicitação',
        owner: 'Obras / Almoxarifado',
        view: 'plano-aquisicoes',
        count: necessidades,
        inboundSeam: 'auto',
        inboundNote: 'Origem da necessidade (orçamento + cronograma)',
      },
      {
        id: 'cotacao',
        label: 'Cotação',
        owner: 'Suprimentos',
        view: 'supplies-quotations',
        count: cotacoes,
        inboundSeam: 'auto',
        inboundNote: 'Plano gera quotation_request',
      },
      {
        id: 'pedido',
        label: 'Pedido de Compra',
        owner: 'Suprimentos',
        view: 'supplies-orders',
        count: pedidosAbertos + pedidosRecebidos,
        pending: pedidosAbertos,
        inboundSeam: 'auto',
        inboundNote: 'Cotação equalizada vira pedido',
      },
      {
        id: 'recebimento',
        label: 'Recebimento',
        owner: 'Estoque',
        view: 'supplies-receipts',
        count: recebimentos,
        inboundSeam: 'auto',
        inboundNote: 'Conferência física do pedido',
      },
      {
        id: 'estoque',
        label: 'Estoque',
        owner: 'Almoxarifado',
        view: 'almoxarifado',
        count: movEstoque,
        inboundSeam: 'auto',
        inboundNote: 'Recebimento gera entrada (custo médio) automaticamente',
      },
      {
        id: 'fiscal',
        label: 'Nota Fiscal',
        owner: 'Fiscal',
        view: 'fiscal-nfe',
        count: notas,
        inboundSeam: 'gap',
        inboundNote: 'SEM 3-way match (Pedido × Recebimento × Nota)',
      },
      {
        id: 'financeiro',
        label: 'Contas a Pagar',
        owner: 'Financeiro',
        view: 'project-financial',
        count: contasPagar,
        pending: contasPagar,
        inboundSeam: 'manual',
        inboundNote: 'Título nasce do recebimento+nota do pedido (parcial); NF-e isolada não gera título',
      },
      {
        id: 'pagamento',
        label: 'Pago / Baixado',
        owner: 'Tesouraria',
        view: 'project-financial',
        count: pagos,
        inboundSeam: 'manual',
        inboundNote: 'Baixa via conciliação bancária',
      },
    ];

    return { stages, generatedAt: new Date().toISOString() };
  },
};
