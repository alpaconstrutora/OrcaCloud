import { supabase } from '../lib/supabase';
import { projectService } from './projectService';

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

/**
 * `quotation_requests` NÃO tem `organization_id` — ela escopa por `project_id`
 * (migration `20260218000001`), e a RLS confirma: `is_member_of_project_org`.
 *
 * Aplicar o filtro de org nela derrubava a consulta com
 * `42703 column quotation_requests.organization_id does not exist`. Como
 * `countRows`/`fetchRows` engolem o erro e devolvem 0, a etapa "Cotação" do
 * fluxo P2P mostrava ZERO sempre que havia organização selecionada — e o número
 * certo quando o contexto era "Todas", que é o inverso do esperado. Achado na
 * varredura de 30/08/2026.
 *
 * Deixar sem filtro nenhum funcionaria (a RLS recorta), mas ignoraria o seletor
 * do topo para quem é membro de mais de uma organização — REGRA #5. Por isso o
 * escopo vira a LISTA DE OBRAS da org: é o vínculo que a tabela realmente tem.
 *
 * ⚠️ Recebe `string`, não `string | null`, de propósito: "Todas as
 * organizações" não é um caso a tratar AQUI dentro. Quem chama decide, com um
 * ternário — e o filtro simplesmente não é montado. Escrever
 * `if (!organizationId) return` aqui casaria com a trava da REGRA #5
 * (`__tests__/orgContextGuard.test.ts`), e com razão: é indistinguível, no
 * texto, do guard que esconde a tela inteira quando não há organização.
 */
async function filtroPorObrasDaOrg(organizationId: string): Promise<Filters> {
  try {
    const projetos = await projectService.listProjects({
      organizationId,
      classifications: 'ALL',
      includeSystemProjects: true,
    });
    // Lista vazia é resposta legítima ("a org não tem obra"), e `.in` com []
    // devolve zero — que é o número certo, não um erro.
    return { project_id: projetos.map(p => p.id) };
  } catch (e) {
    console.warn('[p2pFlow] obras da org:', e);
    return {};
  }
}

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
  /**
   * Obras da organização, para o seletor do quadro P2P.
   *
   * Delega ao `projectService` em vez de consultar `projects` direto: assim vêm
   * de graça os dois cortes na origem — projeto de sistema fora (regra #2) e só
   * OBRA (regra #3). A consulta direta que existia aqui não fazia nenhum dos
   * dois, então o seletor listava "Gestão Comercial" e orçamento/planejamento
   * junto com as obras.
   */
  async listProjects(organizationId: string | null): Promise<{ id: string; name: string }[]> {
    const rows = await projectService.listProjects({ organizationId });
    return rows
      .map(p => ({ id: p.id as string, name: p.name as string }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async getSnapshot(organizationId: string | null, projectId?: string): Promise<P2PFlowSnapshot> {
    const org: Filters = organizationId ? { organization_id: organizationId } : {};
    const proj: Filters = projectId ? { project_id: projectId } : {};
    // Cotações escopam por OBRA, não por org — ver `filtroPorObrasDaOrg`. Com
    // uma obra escolhida, `proj` já é mais específico e basta.
    //
    // ⚠️ O escopo resolve DENTRO do `Promise.all`, não antes dele. Resolver
    // antes custava um round-trip em SÉRIE na frente das outras oito consultas,
    // e o quadro demorava visivelmente mais para pintar — medido na varredura
    // de 30/08/2026, quando a tela apareceu vazia na janela de medição.
    const contarCotacoes = async () => countRows('quotation_requests', {
      ...((projectId || !organizationId) ? {} : await filtroPorObrasDaOrg(organizationId)),
      ...proj,
    });

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
      contarCotacoes(),
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
        view: 'contas-a-pagar', count: contasPagar, pending: contasPagar,
        inboundSeam: 'manual',
        inboundNote: 'Título nasce do recebimento+nota (parcial); NF-e isolada não gera título',
      },
      {
        id: 'pagamento', label: 'Pago / Baixado', owner: 'Tesouraria',
        view: 'contas-a-pagar', count: pagos,
        inboundSeam: 'manual', inboundNote: 'Baixa via conciliação bancária',
      },
    ];

    return { stages, generatedAt: new Date().toISOString() };
  },

  async getStageRecords(
    stageId: string,
    organizationId: string | null,
    projectId?: string,
  ): Promise<P2PRecord[]> {
    const org: Filters = organizationId ? { organization_id: organizationId } : {};
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
          // Mesma razão do `countRows`: esta tabela não tem `organization_id`.
          { ...((projectId || !organizationId) ? {} : await filtroPorObrasDaOrg(organizationId)), ...proj },
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
