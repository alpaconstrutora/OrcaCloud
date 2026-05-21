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

  status: WorkOrderStatus
  statusBeforeBlock: WorkOrderStatus | null
  priority: WorkOrderPriority

  teamId: string | null
  responsibleId: string | null

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
}

export interface WorkOrderValidation {
  id: string
  workOrderId: string
  type: ValidationType
  status: ValidationStatus
  approvedById: string | null
  notes: string | null
  createdAt: string
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
  plannedStartDate?: string
  plannedEndDate?: string
  measurementUnit?: string
  plannedQuantity?: number
  plannedCost?: number
  predecessorId?: string
  checklistTemplateId?: string
  budgetItemRef?: BudgetItemRef
}

export interface UpdateWorkOrderInput {
  title?: string
  description?: string
  phase?: string
  type?: WorkOrderType
  priority?: WorkOrderPriority
  teamId?: string
  responsibleId?: string
  plannedStartDate?: string
  plannedEndDate?: string
  measurementUnit?: string
  plannedQuantity?: number
  plannedCost?: number
  predecessorId?: string
  checklistTemplateId?: string
  budgetItemRef?: BudgetItemRef
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
