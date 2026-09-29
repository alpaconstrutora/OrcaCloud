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
 * que vira `orquestrada`. Hoje só o Recebimento emite (`orderService`, bloco
 * 2b); os demais nós entram no Passo 3 do plano
 * (docs/planos/2026-09-28-torre-p2p-processos.md).
 */
export const STAGE_EVENT_KEYS: Record<string, ProcessEventKey[]> = {
  recebimento: ['purchase_order.received', 'purchase_order.divergence'],
};

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
  /** trigger_event_key → nomes dos templates ATIVOS que o escutam. */
  templatesAtivos: Map<string, string[]>;
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
      .select('name, trigger_event_key')
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

    const templatesAtivos = new Map<string, string[]>();
    for (const row of (t.data ?? []) as { name: string; trigger_event_key: string | null }[]) {
      if (!row.trigger_event_key) continue;
      templatesAtivos.set(row.trigger_event_key, [...(templatesAtivos.get(row.trigger_event_key) ?? []), row.name]);
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
    templates: eventKeys.flatMap(k => motor.templatesAtivos.get(k) ?? []),
  };
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

    // Retrato ESTÁTICO das costuras — o que o código faz sozinho, sem o motor.
    // Conferido contra o código em 28/09/2026 (os três últimos nós estavam
    // com o rótulo de junho: "SEM 3-way match" quando o `matchService` +
    // `ThreeWayMatchPanel` já existiam na aba Recebimento do pedido, e "NF-e
    // isolada não gera título" quando `nfeService` já criava o título com
    // `purchase_order_id`). Se uma costura mudar no código, mude AQUI.
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
      },
      {
        id: 'financeiro', label: 'Contas a Pagar', owner: 'Financeiro',
        view: 'contas-a-pagar', count: contasPagar, pending: contasPagar,
        inboundSeam: 'auto',
        inboundNote: 'Título nasce do pedido recebido ou da NF-e vinculada, com o pedido de origem (purchase_order_id)',
      },
      {
        id: 'pagamento', label: 'Pago / Baixado', owner: 'Tesouraria',
        view: 'contas-a-pagar', count: pagos,
        inboundSeam: 'manual', inboundNote: 'Baixa via conciliação bancária',
      },
    ];

    // Sobrepõe o motor ao retrato: o nó que EMITE evento ganha o resumo das
    // instâncias nascidas nele; o nó SEGUINTE tem a entrada `orquestrada`
    // quando há template ativo escutando. "Todas as organizações" (org null)
    // conta template de qualquer org do usuário — a RLS já recortou.
    const agora = Date.now();
    const stages: P2PStage[] = definicoes.map((no, i) => {
      const emissor = definicoes[i - 1];
      const templatesDoAnterior = emissor?.eventKeys?.flatMap(k => motor.templatesAtivos.get(k) ?? []) ?? [];
      const orquestrada = templatesDoAnterior.length > 0;
      return {
        ...no,
        ...(no.eventKeys ? { processes: resumirProcessos(motor, no.eventKeys, agora) } : {}),
        ...(orquestrada ? {
          inboundSeam: 'orquestrada' as SeamStatus,
          inboundNote: `Conduzida por Processos: ${[...new Set(templatesDoAnterior)].join(', ')}`,
        } : {}),
      };
    });

    return { stages, generatedAt: new Date().toISOString() };
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
