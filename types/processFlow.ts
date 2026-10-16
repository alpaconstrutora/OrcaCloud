import type { ProcessEventKey, ProcessInstanceStatus } from './process';

/**
 * Tipos de um fluxo desenhado em canvas (§31 do guia de UI) — a Torre de
 * Controle P2P (Suprimentos) e a do Financeiro usam os mesmos. Nasceram em
 * `services/p2pFlowService.ts` (16/10/2026) e vieram para cá quando o segundo
 * fluxo apareceu; aquele arquivo continua re-exportando com os nomes `P2P*`.
 */

/**
 * Costura de entrada de um nó. `orquestrada` não é rótulo fixo: é derivada do
 * motor de Processos — a organização tem modelo ATIVO com gatilho por evento
 * para a transição, então ela é conduzida por um processo, com etapas,
 * responsável e SLA. Os outros três são o retrato estático do código.
 */
export type SeamStatus = 'auto' | 'manual' | 'gap' | 'orquestrada';

/** Modelo ATIVO do motor que escuta um evento — o que a aresta precisa para abrir o editor. */
export interface FlowTemplateAtivo {
  id: string;
  name: string;
  organizationId: string;
  /** O evento que este modelo escuta — a aresta pode aceitar vários, a biblioteca conta por evento. */
  eventKey: ProcessEventKey;
}

/**
 * Uma transição do fluxo. A costura (`seam`) mora AQUI — o nó só a herda da sua
 * aresta de entrada (`inboundSeam`). `eventKeys` é o evento do motor que CONDUZ
 * esta transição; `templates` são os modelos ativos que o escutam — vazio
 * significa "ninguém orquestra".
 */
export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  seam: SeamStatus;
  note?: string;
  eventKeys?: ProcessEventKey[];
  templates?: FlowTemplateAtivo[];
}

/** Área do fluxo que agrupa nós no desenho (as "lanes" do canvas). */
export interface FlowGroup {
  id: string;
  label: string;
  nodeIds: string[];
}

/** Resumo das instâncias de processo nascidas num nó. */
export interface FlowProcessSummary {
  ativos: number;
  atrasados: number;
  /** Nomes dos modelos ATIVOS que escutam os eventos deste nó. */
  templates: string[];
}

/** Uma instância de processo, do jeito que o drawer do nó a mostra. */
export interface FlowProcessItem {
  id: string;
  title: string;
  status: ProcessInstanceStatus;
  templateName: string;
  stepName?: string;
  startedAt: string;
  dueAt?: string;
  overdue: boolean;
}

export interface FlowRecord {
  id: string;
  label: string;
  sublabel?: string;
  value?: number;
  status?: string;
  date?: string;
}

export interface FlowStage {
  id: string;
  label: string;
  owner: string;
  view?: string;
  count: number;
  pending?: number;
  inboundSeam: SeamStatus;
  inboundNote?: string;
  records?: FlowRecord[];
  /** Eventos do motor que nascem neste nó. */
  eventKeys?: ProcessEventKey[];
  /** Instâncias ativas nascidas neste nó. Só existe quando há `eventKeys`. */
  processes?: FlowProcessSummary;
}

export interface FlowSnapshot {
  stages: FlowStage[];
  edges: FlowEdge[];
  groups: FlowGroup[];
  generatedAt: string;
}

/** O que a página de um fluxo precisa do serviço dele — o contrato que P2P e Financeiro cumprem. */
export interface FlowService {
  listProjects(organizationId: string | null): Promise<{ id: string; name: string }[]>;
  getSnapshot(organizationId: string | null, projectId?: string): Promise<FlowSnapshot>;
  getStageRecords(stageId: string, organizationId: string | null, projectId?: string): Promise<FlowRecord[]>;
  getStageProcesses(stageId: string, organizationId: string | null, projectId?: string): Promise<FlowProcessItem[]>;
}
