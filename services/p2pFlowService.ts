import { projectService } from './projectService';
import { purchaseRequestService } from './purchaseRequestService';
import { statusDaSolicitacao, STATUS_LABEL } from '../utils/solicitacaoCompra';
import type { PurchaseRequestDisplayStatus } from '../types/purchaseRequest';
import type { ProcessEventKey } from '../types/process';
import type {
  SeamStatus, FlowTemplateAtivo, FlowEdge, FlowGroup, FlowProcessSummary, FlowProcessItem,
  FlowRecord, FlowStage, FlowSnapshot,
} from '../types/processFlow';
import {
  countRows, fetchRows, lerMotor, resumirProcessos, montarArestas, processosDoNo,
  edgeId, fmtBrl, fmtDate, type Filters,
} from './processFlowShared';

/**
 * Os tipos do fluxo moram em `types/processFlow.ts` desde que a Torre do
 * Financeiro nasceu (16/10/2026); os nomes `P2P*` continuam valendo para quem
 * já importava daqui.
 */
export type { SeamStatus };
export type P2PTemplateAtivo = FlowTemplateAtivo;
export type P2PEdge = FlowEdge;
export type P2PGroup = FlowGroup;
export type P2PProcessSummary = FlowProcessSummary;
export type P2PProcessItem = FlowProcessItem;
export type P2PRecord = FlowRecord;
export type P2PStage = FlowStage;
export type P2PFlowSnapshot = FlowSnapshot;
export { edgeId };

/** SC que ainda pede ação de alguém (a etapa "Solicitação" do quadro). */
const SC_ABERTA: PurchaseRequestDisplayStatus[] = ['rascunho', 'em_aprovacao', 'aprovada', 'em_atendimento'];

/**
 * Eventos do motor de Processos que NASCEM em cada nó. O processo que nasce no
 * nó N conduz a transição N → N+1; por isso a costura de ENTRADA de N+1 é a
 * que vira `orquestrada`. Quem emite cada chave está documentado em
 * `ProcessEventKey` (types/process.ts) — Passo 3 de
 * docs/planos/2026-09-28-torre-p2p-processos.md.
 */
export const STAGE_EVENT_KEYS: Record<string, ProcessEventKey[]> = {
  pedido:      ['purchase_order.approved'],
  recebimento: ['purchase_order.received', 'purchase_order.divergence', 'purchase_receipt.divergence'],
  fiscal:      ['nfe.linked'],
  financeiro:  ['internal_transaction.paid'],
};

/**
 * Qual evento CONDUZ qual transição. Até 16/10/2026 a regra era "o nó seguinte
 * ao emissor fica orquestrado" — servia no fluxo linear. Com a ramificação
 * Recebimento → {Estoque, Nota Fiscal} ela pintaria a entrada de estoque
 * (automática, custo médio) como conduzida pelo processo de aprovação de
 * pagamento, o que é falso. Aqui cada evento aponta a transição que de fato
 * acompanha: o pedido aprovado conduz ao recebimento; o recebimento (ou a
 * divergência) conduz à conferência da nota; a nota vinculada conduz ao título;
 * o título pago conduz à baixa.
 */
export const EDGE_EVENT_KEYS: Record<string, ProcessEventKey[]> = {
  'pedido->recebimento':   STAGE_EVENT_KEYS.pedido,
  'recebimento->fiscal':   STAGE_EVENT_KEYS.recebimento,
  'fiscal->financeiro':    STAGE_EVENT_KEYS.fiscal,
  'financeiro->pagamento': STAGE_EVENT_KEYS.financeiro,
};

/**
 * Retrato ESTÁTICO das transições — o que o código faz sozinho, sem o motor.
 * Conferido contra o código em 28/09/2026 (ver histórico em `DEFINICAO_DOS_NOS`
 * abaixo). Se uma costura mudar no código, mude AQUI. Estoque é fim de linha:
 * o consumo na obra não alimenta Contas a Pagar — o título nasce do pedido
 * recebido ou da NF-e vinculada, que é a aresta `fiscal->financeiro`.
 */
export const DEFINICAO_DAS_ARESTAS: ReadonlyArray<Pick<P2PEdge, 'from' | 'to' | 'seam' | 'note'>> = [
  { from: 'solicitacao', to: 'cotacao',     seam: 'auto',   note: 'Solicitação aprovada (ou o Plano) gera quotation_request' },
  { from: 'cotacao',     to: 'pedido',      seam: 'auto',   note: 'Cotação equalizada vira pedido' },
  { from: 'pedido',      to: 'recebimento', seam: 'auto',   note: 'Conferência física do pedido' },
  { from: 'recebimento', to: 'estoque',     seam: 'auto',   note: 'Recebimento gera entrada (custo médio) automaticamente' },
  { from: 'recebimento', to: 'fiscal',      seam: 'manual', note: '3-way match (Pedido × Recebimento × Nota) na aba Recebimento do pedido; sem bloqueio automático' },
  { from: 'fiscal',      to: 'financeiro',  seam: 'auto',   note: 'Título nasce do pedido recebido ou da NF-e vinculada, com o pedido de origem (purchase_order_id)' },
  { from: 'financeiro',  to: 'pagamento',   seam: 'manual', note: 'Baixa via conciliação bancária' },
];

/** Áreas do fluxo, na ordem em que aparecem no desenho. */
export const P2P_GROUPS: ReadonlyArray<P2PGroup> = [
  { id: 'suprimentos', label: 'Suprimentos',      nodeIds: ['solicitacao', 'cotacao', 'pedido'] },
  { id: 'estoque',     label: 'Estoque & Fiscal', nodeIds: ['recebimento', 'estoque', 'fiscal'] },
  { id: 'financeiro',  label: 'Financeiro',       nodeIds: ['financeiro', 'pagamento'] },
];

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

    // Etapa "Solicitação" = Solicitações de Compra ABERTAS (rascunho, em
    // aprovação, aprovada, em atendimento — as quatro abas somadas da lista).
    // Status é derivado dos itens (utils/solicitacaoCompra.ts), não há coluna
    // para contar no banco: por isso lê pela mesma função da tela. Até
    // 26/09/2026 esta etapa contava `procurement_plan_items`, porque a SC não existia.
    const contarSolicitacoes = async () => {
      try {
        const lista = (await purchaseRequestService.list(organizationId))
          .filter(sc => !projectId || sc.projectId === projectId)
          .map(sc => statusDaSolicitacao(sc));
        return {
          abertas: lista.filter(st => SC_ABERTA.includes(st)).length,
          emAprovacao: lista.filter(st => st === 'em_aprovacao').length,
        };
      } catch (e) {
        console.warn('[p2pFlow] solicitações:', e);
        return { abertas: 0, emAprovacao: 0 };
      }
    };

    const [
      solicitacoes,
      cotacoes,
      pedidosAbertos,
      pedidosRecebidos,
      recebimentos,
      movEstoque,
      notas,
      contasPagar,
      pagos,
      motor,
    ] = await Promise.all([
      contarSolicitacoes(),
      contarCotacoes(),
      countRows('purchase_orders', { ...org, ...proj, status: ['Rascunho', 'Enviado'] }),
      countRows('purchase_orders', { ...org, ...proj, status: ['Recebido', 'Parcial'] }),
      countRows('purchase_receipts', { ...proj }),
      countRows('stock_movements', { ...org }),
      countRows('nfe_invoices', { ...org }),
      countRows('internal_transactions', { ...org, ...proj, direction: 'DEBIT', status: 'PENDING' }),
      countRows('internal_transactions', { ...org, ...proj, direction: 'DEBIT', status: 'CONCILIATED' }),
      lerMotor(organizationId, projectId),
    ]);

    // DEFINICAO_DOS_NOS — rótulo, dono, tela e contagem de cada etapa. A
    // costura de entrada escrita aqui é só o valor de partida: desde 16/10/2026
    // ela é sobreposta pela aresta (`DEFINICAO_DAS_ARESTAS`), e só
    // `solicitacao`, sem aresta de entrada, fica com a sua. Histórico: em
    // 28/09/2026 os três últimos nós estavam com o rótulo de junho ("SEM 3-way
    // match" quando o `matchService` + `ThreeWayMatchPanel` já existiam na aba
    // Recebimento do pedido; "NF-e isolada não gera título" quando `nfeService`
    // já criava o título com `purchase_order_id`).
    const definicoes: P2PStage[] = [
      {
        id: 'solicitacao', label: 'Solicitação', owner: 'Obras / Almoxarifado',
        view: 'supplies-solicitacoes', count: solicitacoes.abertas, pending: solicitacoes.emAprovacao,
        inboundSeam: 'auto', inboundNote: 'Obra pede (orçamento, almoxarifado ou Plano de Aquisições); alçada aprova',
      },
      {
        id: 'cotacao', label: 'Cotação', owner: 'Suprimentos',
        view: 'supplies-quotations', count: cotacoes,
        inboundSeam: 'auto', inboundNote: 'Solicitação aprovada (ou o Plano) gera quotation_request',
      },
      {
        id: 'pedido', label: 'Pedido de Compra', owner: 'Suprimentos',
        view: 'supplies-orders', count: pedidosAbertos + pedidosRecebidos, pending: pedidosAbertos,
        inboundSeam: 'auto', inboundNote: 'Cotação equalizada vira pedido',
        eventKeys: STAGE_EVENT_KEYS.pedido,
      },
      {
        id: 'recebimento', label: 'Recebimento', owner: 'Estoque',
        view: 'supplies-receipts', count: recebimentos,
        inboundSeam: 'auto', inboundNote: 'Conferência física do pedido',
        eventKeys: STAGE_EVENT_KEYS.recebimento,
      },
      {
        id: 'estoque', label: 'Estoque', owner: 'Almoxarifado',
        view: 'almoxarifado', count: movEstoque,
        inboundSeam: 'auto', inboundNote: 'Recebimento gera entrada (custo médio) automaticamente',
      },
      {
        id: 'fiscal', label: 'Nota Fiscal', owner: 'Fiscal',
        view: 'fiscal-nfe', count: notas,
        inboundSeam: 'manual',
        inboundNote: '3-way match (Pedido × Recebimento × Nota) na aba Recebimento do pedido; sem bloqueio automático',
        eventKeys: STAGE_EVENT_KEYS.fiscal,
      },
      {
        id: 'financeiro', label: 'Contas a Pagar', owner: 'Financeiro',
        view: 'contas-a-pagar', count: contasPagar, pending: contasPagar,
        inboundSeam: 'auto',
        inboundNote: 'Título nasce do pedido recebido ou da NF-e vinculada, com o pedido de origem (purchase_order_id)',
        eventKeys: STAGE_EVENT_KEYS.financeiro,
      },
      {
        id: 'pagamento', label: 'Pago / Baixado', owner: 'Tesouraria',
        view: 'contas-a-pagar', count: pagos,
        inboundSeam: 'manual', inboundNote: 'Baixa via conciliação bancária',
      },
    ];

    // A costura mora na ARESTA (`montarArestas`): o nó herda a da sua única
    // aresta de entrada — `solicitacao` não tem entrada e fica com o retrato
    // estático. O nó que EMITE evento ganha o resumo das instâncias nascidas
    // nele. "Todas as organizações" (org null) conta template de qualquer org
    // do usuário — a RLS já recortou.
    const edges = montarArestas(DEFINICAO_DAS_ARESTAS, EDGE_EVENT_KEYS, motor);
    const agora = Date.now();
    const stages: P2PStage[] = definicoes.map(no => {
      const entrada = edges.find(e => e.to === no.id);
      return {
        ...no,
        ...(entrada ? { inboundSeam: entrada.seam, inboundNote: entrada.note } : {}),
        ...(no.eventKeys ? { processes: resumirProcessos(motor, no.eventKeys, agora) } : {}),
      };
    });

    return { stages, edges, groups: [...P2P_GROUPS], generatedAt: new Date().toISOString() };
  },

  /** Instâncias ativas nascidas num nó (drawer do nó). Vazio para nó sem evento. */
  async getStageProcesses(
    stageId: string,
    organizationId: string | null,
    projectId?: string,
  ): Promise<P2PProcessItem[]> {
    return processosDoNo(STAGE_EVENT_KEYS[stageId], organizationId, projectId);
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
        const lista = (await purchaseRequestService.list(organizationId).catch(() => []))
          .filter(sc => (!projectId || sc.projectId === projectId) && SC_ABERTA.includes(statusDaSolicitacao(sc)))
          .slice(0, 50);
        return lista.map(sc => ({
          id: sc.id,
          label: `${sc.number ?? ''} ${sc.title}`.trim(),
          sublabel: sc.projectName ?? '',
          status: STATUS_LABEL[statusDaSolicitacao(sc)],
          date: fmtDate(sc.needDate ?? undefined),
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
