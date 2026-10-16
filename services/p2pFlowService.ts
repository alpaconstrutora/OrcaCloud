import { supabase } from '../lib/supabase';
import { projectService } from './projectService';
import { purchaseRequestService } from './purchaseRequestService';
import { statusDaSolicitacao, STATUS_LABEL } from '../utils/solicitacaoCompra';
import type { PurchaseRequestDisplayStatus } from '../types/purchaseRequest';
import type { ProcessEventKey, ProcessInstanceStatus } from '../types/process';

/** SC que ainda pede ação de alguém (a etapa "Solicitação" do quadro). */
const SC_ABERTA: PurchaseRequestDisplayStatus[] = ['rascunho', 'em_aprovacao', 'aprovada', 'em_atendimento'];

/**
 * Costura de entrada de um nó. `orquestrada` não é rótulo fixo: é derivada do
 * motor de Processos — a organização tem template ATIVO com gatilho por evento
 * para o nó anterior, então a transição é conduzida por um processo, com
 * etapas, responsável e SLA. Os outros três continuam sendo o retrato estático
 * do código (ver `DEFINICAO_DOS_NOS`).
 */
export type SeamStatus = 'auto' | 'manual' | 'gap' | 'orquestrada';

/** Modelo ATIVO do motor que escuta um evento — o que a aresta precisa para abrir o editor. */
export interface P2PTemplateAtivo {
  id: string;
  name: string;
  organizationId: string;
  /** O evento que este modelo escuta — a aresta pode aceitar vários, a biblioteca conta por evento. */
  eventKey: ProcessEventKey;
}

/**
 * Uma transição do fluxo. A costura (`seam`) mora AQUI desde 16/10/2026 — o
 * nó só a herda da sua aresta de entrada (`inboundSeam`), para os KPIs e o
 * drawer continuarem contando por etapa. `eventKeys` é o evento do motor que
 * CONDUZ esta transição (`EDGE_EVENT_KEYS`); `templates` são os modelos ativos
 * que o escutam — vazio significa "ninguém orquestra".
 */
export interface P2PEdge {
  id: string;
  from: string;
  to: string;
  seam: SeamStatus;
  note?: string;
  eventKeys?: ProcessEventKey[];
  templates?: P2PTemplateAtivo[];
}

/** Área do fluxo que agrupa nós no desenho (as "lanes" do canvas). */
export interface P2PGroup {
  id: string;
  label: string;
  nodeIds: string[];
}

/** Resumo das instâncias de processo nascidas num nó. */
export interface P2PProcessSummary {
  ativos: number;
  atrasados: number;
  /** Nomes dos templates ATIVOS que escutam os eventos deste nó. */
  templates: string[];
}

/** Uma instância de processo, do jeito que o drawer do nó a mostra. */
export interface P2PProcessItem {
  id: string;
  title: string;
  status: ProcessInstanceStatus;
  templateName: string;
  stepName?: string;
  startedAt: string;
  dueAt?: string;
  overdue: boolean;
}

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

export const edgeId = (from: string, to: string) => `${from}->${to}`;

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
  /** Eventos do motor que nascem neste nó (ver `STAGE_EVENT_KEYS`). */
  eventKeys?: ProcessEventKey[];
  /** Instâncias ativas nascidas neste nó. Só existe quando há `eventKeys`. */
  processes?: P2PProcessSummary;
}

export interface P2PFlowSnapshot {
  stages: P2PStage[];
  edges: P2PEdge[];
  groups: P2PGroup[];
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

// ── Motor de Processos — o que a Torre lê dele ──────────────────────────────

interface InstanciaDoMotor {
  id: string;
  title: string;
  status: ProcessInstanceStatus;
  started_at: string;
  due_at: string | null;
  current_step_id: string | null;
  process_templates: { name: string; trigger_event_key: string | null } | null;
}

interface LeituraDoMotor {
  /** trigger_event_key → templates ATIVOS que o escutam. */
  templatesAtivos: Map<string, P2PTemplateAtivo[]>;
  /** Instâncias não terminais de templates com gatilho por evento. */
  instancias: InstanciaDoMotor[];
  /** id da etapa atual → { nome, due_at }. */
  etapaAtual: Map<string, { name: string; due_at: string | null }>;
}

const MOTOR_VAZIO: LeituraDoMotor = { templatesAtivos: new Map(), instancias: [], etapaAtual: new Map() };

/**
 * Duas consultas em paralelo (templates ATIVOS por evento; instâncias não
 * terminais com o template embutido) e uma terceira, só se houver instância,
 * para a etapa atual — `process_instances` ↔ `process_instance_steps` têm DUAS
 * FKs (a etapa aponta para a instância; a instância aponta para a etapa
 * atual), então o embed do PostgREST fica ambíguo e a consulta separada é o
 * caminho que não depende do nome da constraint.
 *
 * Erro em qualquer uma devolve o motor vazio: a Torre então mostra o retrato
 * estático, como antes — nunca esconde o quadro por causa do motor.
 */
async function lerMotor(organizationId: string | null, projectId?: string): Promise<LeituraDoMotor> {
  try {
    let tq = supabase
      .from('process_templates')
      .select('id, name, trigger_event_key, organization_id')
      .eq('trigger_type', 'EVENTO')
      .eq('status', 'ATIVO')
      .not('trigger_event_key', 'is', null);
    if (organizationId) tq = tq.eq('organization_id', organizationId);

    let iq = supabase
      .from('process_instances')
      .select('id, title, status, started_at, due_at, current_step_id, process_templates!inner(name, trigger_event_key)')
      .not('status', 'in', '(CONCLUIDO,CANCELADO)')
      .order('started_at', { ascending: false })
      .limit(200);
    if (organizationId) iq = iq.eq('organization_id', organizationId);
    if (projectId) iq = iq.eq('project_id', projectId);

    const [t, i] = await Promise.all([tq, iq]);
    if (t.error) { console.warn('[p2pFlow] templates do motor:', t.error.message); return MOTOR_VAZIO; }
    if (i.error) { console.warn('[p2pFlow] instâncias do motor:', i.error.message); return MOTOR_VAZIO; }

    const templatesAtivos = new Map<string, P2PTemplateAtivo[]>();
    for (const row of (t.data ?? []) as { id: string; name: string; trigger_event_key: string | null; organization_id: string }[]) {
      if (!row.trigger_event_key) continue;
      templatesAtivos.set(row.trigger_event_key, [
        ...(templatesAtivos.get(row.trigger_event_key) ?? []),
        { id: row.id, name: row.name, organizationId: row.organization_id, eventKey: row.trigger_event_key as ProcessEventKey },
      ]);
    }

    const instancias = ((i.data ?? []) as unknown as InstanciaDoMotor[])
      .filter(inst => inst.process_templates?.trigger_event_key);

    const etapaAtual = new Map<string, { name: string; due_at: string | null }>();
    const idsEtapa = instancias.map(inst => inst.current_step_id).filter((id): id is string => !!id);
    if (idsEtapa.length > 0) {
      const { data: etapas, error } = await supabase
        .from('process_instance_steps')
        .select('id, name, due_at')
        .in('id', idsEtapa);
      if (error) console.warn('[p2pFlow] etapa atual do motor:', error.message);
      for (const e of (etapas ?? []) as { id: string; name: string; due_at: string | null }[]) {
        etapaAtual.set(e.id, { name: e.name, due_at: e.due_at });
      }
    }

    return { templatesAtivos, instancias, etapaAtual };
  } catch (e) {
    console.warn('[p2pFlow] motor:', e);
    return MOTOR_VAZIO;
  }
}

/** Atrasada = status já diz, ou a etapa atual/instância passou do prazo. */
function instanciaAtrasada(inst: InstanciaDoMotor, motor: LeituraDoMotor, agora: number): boolean {
  if (inst.status === 'ATRASADO') return true;
  const etapa = inst.current_step_id ? motor.etapaAtual.get(inst.current_step_id) : undefined;
  const prazo = etapa?.due_at ?? inst.due_at;
  return !!prazo && new Date(prazo).getTime() < agora;
}

function instanciasDoNo(motor: LeituraDoMotor, eventKeys: ProcessEventKey[]): InstanciaDoMotor[] {
  const chaves = new Set<string>(eventKeys);
  return motor.instancias.filter(inst => chaves.has(inst.process_templates!.trigger_event_key!));
}

function resumirProcessos(motor: LeituraDoMotor, eventKeys: ProcessEventKey[], agora: number): P2PProcessSummary {
  const lista = instanciasDoNo(motor, eventKeys);
  return {
    ativos: lista.length,
    atrasados: lista.filter(inst => instanciaAtrasada(inst, motor, agora)).length,
    templates: eventKeys.flatMap(k => motor.templatesAtivos.get(k) ?? []).map(t => t.name),
  };
}

/** Arestas com a costura real: o retrato estático, sobreposto pelo motor onde há modelo ativo escutando. */
function montarArestas(motor: LeituraDoMotor): P2PEdge[] {
  return DEFINICAO_DAS_ARESTAS.map(def => {
    const id = edgeId(def.from, def.to);
    const eventKeys = EDGE_EVENT_KEYS[id];
    if (!eventKeys) return { id, ...def };
    const templates = eventKeys.flatMap(k => motor.templatesAtivos.get(k) ?? []);
    const orquestrada = templates.length > 0;
    return {
      id, ...def, eventKeys, templates,
      ...(orquestrada ? {
        seam: 'orquestrada' as SeamStatus,
        note: `Conduzida por Processos: ${[...new Set(templates.map(t => t.name))].join(', ')}`,
      } : {}),
    };
  });
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
    const edges = montarArestas(motor);
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
    const eventKeys = STAGE_EVENT_KEYS[stageId];
    if (!eventKeys) return [];
    const motor = await lerMotor(organizationId, projectId);
    const agora = Date.now();
    return instanciasDoNo(motor, eventKeys).map(inst => {
      const etapa = inst.current_step_id ? motor.etapaAtual.get(inst.current_step_id) : undefined;
      return {
        id: inst.id,
        title: inst.title,
        status: inst.status,
        templateName: inst.process_templates?.name ?? '',
        stepName: etapa?.name,
        startedAt: inst.started_at,
        dueAt: etapa?.due_at ?? inst.due_at ?? undefined,
        overdue: instanciaAtrasada(inst, motor, agora),
      };
    });
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
