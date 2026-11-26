// ============================================================
// Módulo: Controle Operacional — Work Orders (Ordens de Execução)
// Types — alinhados ao schema supabase/migrations/20260630000001
// ============================================================

// ────────────────────────────────────────────────────────────
// Enums / Value Types
// ────────────────────────────────────────────────────────────

export type WorkOrderStatus =
  | 'planned'
  | 'released'
  | 'in_progress'
  | 'pending_inspection'
  | 'approved'
  | 'rejected'
  | 'measured'
  | 'closed'
  | 'blocked'

export type WorkOrderType = 'own' | 'subcontracted'

export type WorkOrderPriority = 'normal' | 'high' | 'critical'

export type ChecklistGate = 'pre_start' | 'pre_completion' | 'free'

export type EvidenceGate = 'pre_start' | 'execution' | 'pre_completion' | 'free'

export type EvidenceFileType = 'photo' | 'document'

export type NCSeverity = 'minor' | 'moderate' | 'major'

export type NCStatus = 'open' | 'in_treatment' | 'closed'

export type ValidationType = 'start_release' | 'inspection' | 'completion_approval'

export type ValidationStatus = 'pending' | 'approved' | 'rejected'

/** `oe_checklist_responses.response_status` — "cumprido" = conforme, ou não aplicável com observação. */
export type ChecklistResponseStatus = 'conforme' | 'nao_conforme' | 'parcial' | 'nao_aplicavel'

/** `non_conformances.eficacia` (Qualidade SiAC, fase 2). */
export type NCEficacia = 'pendente' | 'eficaz' | 'nao_eficaz'

export type WeatherCondition = 'sunny' | 'cloudy' | 'rain' | 'heavy_rain'

export type FieldCondition = 'normal' | 'compromised' | 'halted'

// Transições de status permitidas — espelho do service de workflow
export const ALLOWED_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  planned:            ['released', 'blocked'],
  released:           ['in_progress', 'planned', 'blocked'],
  in_progress:        ['pending_inspection', 'blocked'],
  pending_inspection: ['approved', 'rejected'],
  approved:           ['measured'],
  rejected:           ['in_progress'],
  measured:           ['closed'],
  blocked:            [],  // retorna ao status_before_block via unblock()
  closed:             [],
}

// ────────────────────────────────────────────────────────────
// Referência de item de orçamento (snapshot — não FK)
// ────────────────────────────────────────────────────────────

export interface BudgetItemRef {
  id: string
  description: string
  unit: string
  unitCost: number
  phase?: string
  subPhase?: string
  sinapiCode?: string
}

// ────────────────────────────────────────────────────────────
// Referência de atividade de planejamento (snapshot — não FK)
// ────────────────────────────────────────────────────────────

export interface PlanningItemRef {
  planningProjectId: string
  planningProjectName: string
  itemScheduleId: string      // = BudgetEntry.id no projeto de planejamento
  itemDescription: string     // nome da atividade (BudgetEntry.sinapiItem.description)
  phase?: string
  plannedStart?: string
  plannedEnd?: string
  budgetedValue?: number
}

// ────────────────────────────────────────────────────────────
// Entidades DB (espelho das tabelas)
// ────────────────────────────────────────────────────────────

export interface OeChecklistTemplate {
  id: string
  orgId: string
  name: string
  serviceType: string | null
  active: boolean
  createdAt: string
}

export interface OeChecklistItem {
  id: string
  templateId: string
  description: string
  required: boolean
  requiresPhoto: boolean
  gate: ChecklistGate
  sortOrder: number
  /** Severidade da NC gerada pela resposta não conforme. */
  severity: NCSeverity | null
  category: string | null
  /** Critério de aceitação (tolerância) — fase 2. */
  criterio: string | null
  /** Método de verificação — fase 2. */
  metodo: string | null
  /** Item desativado não entra em OE nova; item com resposta não se apaga, só se desativa. */
  ativo: boolean
}

export interface ProjectOpsConfig {
  projectId: string
  gateConfig: {
    requirePhotoPreStart?: boolean
    requirePhotoPreCompletion?: boolean
    minPctForInspection?: number      // default 95
    requirePredecessorClosed?: boolean
  }
  updatedAt: string
}

export interface WorkOrder {
  id: string
  orgId: string
  projectId: string

  code: string | null
  title: string
  description: string | null
  phase: string | null
  type: WorkOrderType

  budgetItemRef: BudgetItemRef | null
  planningItemRef: PlanningItemRef | null

  status: WorkOrderStatus
  statusBeforeBlock: WorkOrderStatus | null
  priority: WorkOrderPriority

  teamId: string | null
  responsibleId: string | null
  collaboratorIds: string[]

  plannedStartDate: string | null
  plannedEndDate: string | null
  actualStartDate: string | null
  actualEndDate: string | null
  baselineStart: string | null
  baselineEnd: string | null

  measurementUnit: string | null
  plannedQuantity: number | null
  executedQuantity: number
  completionPct: number

  plannedProductivity: number | null
  actualProductivity: number | null

  plannedCost: number | null
  actualLaborCost: number
  actualMaterialCost: number
  actualTotalCost: number

  predecessorId: string | null
  checklistTemplateId: string | null
  /** Serviço controlado (Qualidade SiAC) — da organização dona do SGQ da organização da OE. */
  controlledItemId: string | null
  replanningCount: number

  createdAt: string
  updatedAt: string
}

export interface WorkOrderStatusLog {
  id: string
  workOrderId: string
  previousStatus: WorkOrderStatus | null
  newStatus: WorkOrderStatus
  changedById: string | null
  reason: string | null
  createdAt: string
}

export interface WorkLog {
  id: string
  workOrderId: string
  logDate: string
  teamId: string | null
  hoursWorked: number | null
  quantityExecuted: number | null
  calculatedCost: number | null
  notes: string | null
  loggedById: string | null
  syncedAt: string | null
  createdAt: string
}

export interface EvidenceFile {
  id: string
  workOrderId: string
  fileType: EvidenceFileType
  fileUrl: string
  thumbnailUrl: string | null
  gate: EvidenceGate
  latitude: number | null
  longitude: number | null
  capturedAt: string | null
  description: string | null
  uploadedById: string | null
  createdAt: string
}

export interface OeChecklistResponse {
  id: string
  workOrderId: string
  itemId: string
  completed: boolean
  evidenceId: string | null
  notes: string | null
  completedById: string | null
  completedAt: string | null
  responseStatus: ChecklistResponseStatus | null
  ncId: string | null
  /** Gravados pelo banco quando `response_status` muda (auth.uid / now). */
  respondidoPor: string | null
  respondidoEm: string | null
  /** Cópia congelada do critério e do método do item no momento da resposta. */
  itemCriterio: string | null
  itemMetodo: string | null
}

export interface NonConformance {
  id: string
  workOrderId: string
  description: string
  severity: NCSeverity
  status: NCStatus
  responsibleId: string | null
  dueDate: string | null
  correctiveAction: string | null
  resolutionEvidenceId: string | null
  createdAt: string
  closedAt: string | null
  /** Encerrar exige causa e ação corretiva (CHECK no banco). */
  causa: string | null
  eficacia: NCEficacia | null
  eficaciaEm: string | null
  /** Motivo da última verificação de eficácia (gravado no "não eficaz"). */
  eficaciaMotivo: string | null
  /** Serviço controlado da OE — preenchido pelo banco. */
  controlledItemId: string | null
}

export interface WorkOrderValidation {
  id: string
  workOrderId: string
  type: ValidationType
  status: ValidationStatus
  approvedById: string | null
  notes: string | null
  createdAt: string
  /** Quem aprovou/reprovou a inspeção (auth.uid) e quando — gravados pela RPC. */
  liberadoPor: string | null
  liberadoEm: string | null
  /** Congelado na aprovação: cada executor e se estava treinado na revisão vigente. */
  executores: Array<{ employee_id: string; nome: string; treinado: boolean }>
  procedimentoRevisao: string | null
}

/** Linha de `non_conformance_history` (só leitura) — o estado NOVO a cada mudança da NC. */
export interface NonConformanceHistoryRow {
  id: string
  nc_id: string | null
  work_order_id: string
  status: string | null
  causa: string | null
  corrective_action: string | null
  eficacia: NCEficacia | null
  /** Motivo da verificação de eficácia naquele estado (ex.: por que não foi eficaz). */
  eficacia_motivo: string | null
  /** Descrição da NC naquele estado (mudar a descrição também gera linha). */
  description: string | null
  evento: 'alteracao' | 'exclusao'
  alterado_por: string | null
  created_at: string
}

/** Linha de `oe_checklist_response_history` (só leitura) — a resposta ANTERIOR a cada reinspeção. */
export interface OeChecklistResponseHistoryRow {
  id: string
  response_id: string | null
  work_order_id: string
  item_id: string
  response_status: ChecklistResponseStatus | null
  notes: string | null
  nc_id: string | null
  evidence_id: string | null
  respondido_por: string | null
  respondido_em: string | null
  /** item_descricao, item_criterio, item_metodo, procedimento_revisao, procedimento_versao_id, completed… */
  copia: Record<string, unknown> | null
  evento: 'alteracao' | 'exclusao'
  alterado_por: string | null
  created_at: string
}

export interface SiteDiary {
  id: string
  projectId: string
  diaryDate: string
  weather: WeatherCondition | null
  fieldCondition: FieldCondition
  workersPresent: number
  generalNotes: string | null
  autoGenerated: boolean
  reviewedById: string | null
  reviewedAt: string | null
  snapshot: SiteDiarySnapshot | null
  createdAt: string
}

export interface SiteDiarySnapshot {
  workOrders: Array<{
    id: string
    code: string | null
    title: string
    status: WorkOrderStatus
    completionPct: number
  }>
  workLogs: Array<{
    teamId: string | null
    teamName: string | null
    hoursWorked: number | null
    quantityExecuted: number | null
  }>
  nonConformances: Array<{
    id: string
    description: string
    severity: NCSeverity
    status: NCStatus
  }>
  snapshotAt: string
}

// ────────────────────────────────────────────────────────────
// Views (resultado das views SQL)
// ────────────────────────────────────────────────────────────

export interface TeamHourlyCost {
  teamId: string
  orgId: string
  teamName: string
  memberCount: number
  avgHourlyCost: number
  totalHourlyCost: number
}

export interface ProjectCostComparison {
  projectId: string
  phase: string | null
  workOrderCount: number
  totalPlannedCost: number
  totalActualCost: number
  costDeviation: number
  weightedCompletionPct: number
  blockedCount: number
  overdueCount: number
}

// ────────────────────────────────────────────────────────────
// Agregados para UI (WorkOrder com relações carregadas)
// ────────────────────────────────────────────────────────────

export interface WorkOrderDetail extends WorkOrder {
  team?: { id: string; name: string; avgHourlyCost: number }
  responsible?: { id: string; name: string; role: string }
  predecessor?: { id: string; code: string | null; title: string; status: WorkOrderStatus }
  checklistTemplate?: OeChecklistTemplate & { items: OeChecklistItem[] }
  workLogs: WorkLog[]
  evidenceFiles: EvidenceFile[]
  checklistResponses: OeChecklistResponse[]
  nonConformances: NonConformance[]
  validations: WorkOrderValidation[]
  statusHistory: WorkOrderStatusLog[]
}

export interface WorkOrderListItem extends Pick<WorkOrder,
  'id' | 'code' | 'title' | 'phase' | 'type' | 'status' | 'priority'
  | 'plannedStartDate' | 'plannedEndDate' | 'completionPct'
  | 'plannedCost' | 'actualTotalCost' | 'teamId' | 'responsibleId'
> {
  teamName?: string
  responsibleName?: string
  isOverdue: boolean
  openNcCount: number
}

// ────────────────────────────────────────────────────────────
// Inputs de criação / atualização
// ────────────────────────────────────────────────────────────

export interface CreateWorkOrderInput {
  orgId: string
  projectId: string
  title: string
  description?: string
  phase?: string
  type?: WorkOrderType
  priority?: WorkOrderPriority
  teamId?: string
  responsibleId?: string
  collaboratorIds?: string[]
  plannedStartDate?: string
  plannedEndDate?: string
  measurementUnit?: string
  plannedQuantity?: number
  plannedCost?: number
  predecessorId?: string
  checklistTemplateId?: string | null
  /** Serviço controlado (Qualidade SiAC); `null` = sem serviço. Ausente no update = não mexe. */
  controlledItemId?: string | null
  budgetItemRef?: BudgetItemRef
  planningItemRef?: PlanningItemRef
}

export interface UpdateWorkOrderInput {
  title?: string
  description?: string
  phase?: string
  type?: WorkOrderType
  priority?: WorkOrderPriority
  teamId?: string
  responsibleId?: string
  collaboratorIds?: string[]
  plannedStartDate?: string
  plannedEndDate?: string
  measurementUnit?: string
  plannedQuantity?: number
  plannedCost?: number
  predecessorId?: string
  checklistTemplateId?: string | null
  /** Serviço controlado (Qualidade SiAC); `null` = sem serviço. Ausente no update = não mexe. */
  controlledItemId?: string | null
  budgetItemRef?: BudgetItemRef
  planningItemRef?: PlanningItemRef
}

export interface TransitionStatusInput {
  workOrderId: string
  newStatus: WorkOrderStatus
  changedById?: string
  reason?: string
}

export interface CreateWorkLogInput {
  workOrderId: string
  logDate: string
  teamId?: string
  hoursWorked?: number
  quantityExecuted?: number
  notes?: string
  loggedById?: string
}

export interface CreateEvidenceInput {
  workOrderId: string
  fileType?: EvidenceFileType
  fileUrl: string
  thumbnailUrl?: string
  gate?: EvidenceGate
  latitude?: number
  longitude?: number
  capturedAt?: string
  description?: string
  uploadedById?: string
}

export interface CreateNonConformanceInput {
  workOrderId: string
  description: string
  severity?: NCSeverity
  responsibleId?: string
  dueDate?: string
  /** Causa já conhecida na abertura (opcional) — encerrar exige causa (CHECK no banco). */
  causa?: string
  /** Ação corretiva planejada na abertura (opcional). */
  correctiveAction?: string
}

// ────────────────────────────────────────────────────────────
// Resultado da validação de transição de status
// ────────────────────────────────────────────────────────────

export interface TransitionValidationResult {
  valid: boolean
  errors: string[]
}

// ────────────────────────────────────────────────────────────
// Filtros para listagem
// ────────────────────────────────────────────────────────────

export interface WorkOrderFilters {
  projectId: string
  status?: WorkOrderStatus[]
  teamId?: string
  priority?: WorkOrderPriority
  phase?: string
  overdueOnly?: boolean
  search?: string
}

// ────────────────────────────────────────────────────────────
// Erros de domínio do módulo
// ────────────────────────────────────────────────────────────

export class WorkOrderDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'WorkOrderDomainError'
  }
}

export class InvalidTransitionError extends WorkOrderDomainError {
  constructor(from: WorkOrderStatus, to: WorkOrderStatus) {
    super('INVALID_TRANSITION', `Transição de '${from}' para '${to}' não permitida`)
  }
}

export class TransitionGateError extends WorkOrderDomainError {
  constructor(errors: string[]) {
    super('GATE_VIOLATION', 'Requisitos de gate não atendidos', { errors })
  }
}

export class BaselineLockedError extends WorkOrderDomainError {
  constructor() {
    super('BASELINE_LOCKED', 'Baseline não pode ser alterado após liberação da OE')
  }
}
