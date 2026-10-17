import { supabase } from '../lib/supabase';
import type { ProcessEventKey, ProcessInstanceStatus } from '../types/process';
import type {
  FlowEdge, FlowProcessItem, FlowProcessSummary, FlowTemplateAtivo, SeamStatus,
} from '../types/processFlow';

/**
 * O que as Torres de Controle (P2P, Financeiro) têm em comum: contar/listar
 * linhas sem derrubar o quadro, ler o motor de Processos e sobrepor o motor ao
 * retrato estático das arestas. Saiu de `p2pFlowService.ts` em 16/10/2026,
 * quando o segundo fluxo apareceu — o comportamento é o mesmo de lá.
 */

/** `{ notIn }` exclui valores (ex.: origem do título ≠ MANUAL); `{ notNull: true }` exige a coluna preenchida. */
export type FilterValue = string | string[] | { notIn: string[] } | { notNull: true } | null | undefined;
export type Filters = Record<string, FilterValue>;

type Consulta = {
  eq: (col: string, val: string) => Consulta;
  in: (col: string, val: string[]) => Consulta;
  not: (col: string, op: string, val: string) => Consulta;
};

function aplicarFiltros<Q>(q: Q, filters: Filters): Q {
  let out = q as unknown as Consulta;
  for (const [col, val] of Object.entries(filters)) {
    if (val === null || val === undefined) continue;
    if (Array.isArray(val)) out = out.in(col, val);
    else if (typeof val === 'object') {
      out = 'notNull' in val ? out.not(col, 'is', 'null') : out.not(col, 'in', `(${val.notIn.join(',')})`);
    }
    else out = out.eq(col, val);
  }
  return out as unknown as Q;
}

/** Conta linhas; erro vira 0 com aviso no console — o quadro nunca cai por uma etapa. */
export async function countRows(table: string, filters: Filters): Promise<number> {
  try {
    const q = aplicarFiltros(supabase.from(table).select('id', { count: 'exact', head: true }), filters);
    const { count, error } = await q;
    if (error) { console.warn(`[fluxo] count ${table}:`, error.message); return 0; }
    return count ?? 0;
  } catch (e) {
    console.warn(`[fluxo] count ${table}:`, e); return 0;
  }
}

/** Lista as últimas linhas (por `orderBy`, padrão `created_at`); erro vira []. */
export async function fetchRows<T extends Record<string, unknown>>(
  table: string,
  columns: string,
  filters: Filters,
  limit = 50,
  orderBy = 'created_at',
): Promise<T[]> {
  try {
    const q = aplicarFiltros(supabase.from(table).select(columns).limit(limit).order(orderBy, { ascending: false }), filters);
    const { data, error } = await q;
    if (error) { console.warn(`[fluxo] fetch ${table}:`, error.message); return []; }
    return (data ?? []) as unknown as T[];
  } catch (e) {
    console.warn(`[fluxo] fetch ${table}:`, e); return [];
  }
}

// ── Motor de Processos — o que as Torres leem dele ──────────────────────────

export interface InstanciaDoMotor {
  id: string;
  title: string;
  status: ProcessInstanceStatus;
  started_at: string;
  due_at: string | null;
  current_step_id: string | null;
  process_templates: { name: string; trigger_event_key: string | null } | null;
}

export interface LeituraDoMotor {
  /** trigger_event_key → modelos ATIVOS que o escutam. */
  templatesAtivos: Map<string, FlowTemplateAtivo[]>;
  /** Instâncias não terminais de modelos com gatilho por evento. */
  instancias: InstanciaDoMotor[];
  /** id da etapa atual → { nome, due_at }. */
  etapaAtual: Map<string, { name: string; due_at: string | null }>;
}

export const MOTOR_VAZIO: LeituraDoMotor = { templatesAtivos: new Map(), instancias: [], etapaAtual: new Map() };

/**
 * Duas consultas em paralelo (modelos ATIVOS por evento; instâncias não
 * terminais com o modelo embutido) e uma terceira, só se houver instância,
 * para a etapa atual — `process_instances` ↔ `process_instance_steps` têm DUAS
 * FKs (a etapa aponta para a instância; a instância aponta para a etapa
 * atual), então o embed do PostgREST fica ambíguo e a consulta separada é o
 * caminho que não depende do nome da constraint.
 *
 * Erro em qualquer uma devolve o motor vazio: a Torre então mostra o retrato
 * estático — nunca esconde o quadro por causa do motor.
 */
export async function lerMotor(organizationId: string | null, projectId?: string): Promise<LeituraDoMotor> {
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
    if (t.error) { console.warn('[fluxo] modelos do motor:', t.error.message); return MOTOR_VAZIO; }
    if (i.error) { console.warn('[fluxo] instâncias do motor:', i.error.message); return MOTOR_VAZIO; }

    const templatesAtivos = new Map<string, FlowTemplateAtivo[]>();
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
      if (error) console.warn('[fluxo] etapa atual do motor:', error.message);
      for (const e of (etapas ?? []) as { id: string; name: string; due_at: string | null }[]) {
        etapaAtual.set(e.id, { name: e.name, due_at: e.due_at });
      }
    }

    return { templatesAtivos, instancias, etapaAtual };
  } catch (e) {
    console.warn('[fluxo] motor:', e);
    return MOTOR_VAZIO;
  }
}

/** Atrasada = status já diz, ou a etapa atual/instância passou do prazo. */
export function instanciaAtrasada(inst: InstanciaDoMotor, motor: LeituraDoMotor, agora: number): boolean {
  if (inst.status === 'ATRASADO') return true;
  const etapa = inst.current_step_id ? motor.etapaAtual.get(inst.current_step_id) : undefined;
  const prazo = etapa?.due_at ?? inst.due_at;
  return !!prazo && new Date(prazo).getTime() < agora;
}

export function instanciasDoNo(motor: LeituraDoMotor, eventKeys: ProcessEventKey[]): InstanciaDoMotor[] {
  const chaves = new Set<string>(eventKeys);
  return motor.instancias.filter(inst => chaves.has(inst.process_templates!.trigger_event_key!));
}

export function resumirProcessos(motor: LeituraDoMotor, eventKeys: ProcessEventKey[], agora: number): FlowProcessSummary {
  const lista = instanciasDoNo(motor, eventKeys);
  return {
    ativos: lista.length,
    atrasados: lista.filter(inst => instanciaAtrasada(inst, motor, agora)).length,
    templates: eventKeys.flatMap(k => motor.templatesAtivos.get(k) ?? []).map(t => t.name),
  };
}

export const edgeId = (from: string, to: string) => `${from}->${to}`;

/** Arestas com a costura real: o retrato estático, sobreposto pelo motor onde há modelo ativo escutando. */
export function montarArestas(
  definicoes: ReadonlyArray<Pick<FlowEdge, 'from' | 'to' | 'seam' | 'note'>>,
  edgeEventKeys: Record<string, ProcessEventKey[]>,
  motor: LeituraDoMotor,
): FlowEdge[] {
  return definicoes.map(def => {
    const id = edgeId(def.from, def.to);
    const eventKeys = edgeEventKeys[id];
    if (!eventKeys) return { id, ...def };
    const templates = eventKeys.flatMap(k => motor.templatesAtivos.get(k) ?? []);
    const orquestrada = templates.length > 0;
    return {
      id, ...def, eventKeys, templates,
      ...(orquestrada ? {
        seam: 'orquestrada' as SeamStatus,
        // A nota do retrato estático FICA, depois de quem conduz: ela descreve o
        // que o código faz (ex.: a regra da alçada na baixa), e isso não
        // deixa de ser verdade porque um processo passou a acompanhar a
        // transição. Até 16/10/2026 a nota era substituída e a lacuna sumia do
        // painel assim que o modelo do Financeiro foi criado.
        note: [`Conduzida por Processos: ${[...new Set(templates.map(t => t.name))].join(', ')}`, def.note].filter(Boolean).join(' — '),
      } : {}),
    };
  });
}

/** Instâncias ativas nascidas num nó (drawer do nó e painel da aresta). Vazio para nó sem evento. */
export async function processosDoNo(
  eventKeys: ProcessEventKey[] | undefined,
  organizationId: string | null,
  projectId?: string,
): Promise<FlowProcessItem[]> {
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
}

export const fmtBrl = (n?: number) =>
  n != null ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : undefined;

export const fmtDate = (iso?: string) => {
  if (!iso) return undefined;
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
