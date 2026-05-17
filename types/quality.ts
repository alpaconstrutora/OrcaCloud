// ============================================================
// Módulo: Qualidade & Entrega — ConstructionCondition Aggregate
// Types v0.2 — alinhados ao aggregate design
// ============================================================

// ────────────────────────────────────────────────────────────
// Value Objects
// ────────────────────────────────────────────────────────────

export type ActorType = 'user' | 'client' | 'external_inspector' | 'system'

export interface ActorReference {
  actorId: string
  actorType: ActorType
  name: string
  roleAtTime?: string
}

export type ConditionState =
  | 'DETECTED'
  | 'CLASSIFIED'
  | 'ACTION_REQUIRED'
  | 'IN_REPAIR'
  | 'REPAIRED'
  | 'VALIDATED'
  | 'CONTESTED'
  | 'ESCALATED'
  | 'REOPENED'
  | 'CLOSED'

export type Severity = 'baixa' | 'media' | 'alta' | 'critica'

export type ProbableOrigin =
  | 'execucao'
  | 'material'
  | 'projeto'
  | 'uso'
  | 'manutencao'
  | 'indeterminada'

export type EvidenceType = 'photo' | 'video' | 'audio' | 'document' | 'signature'

export type ValidationResult = 'approved' | 'rejected' | 'requires_correction'

export type ResponsibleParty =
  | 'construtora'
  | 'fornecedor'
  | 'proprietario'
  | 'uso_inadequado'
  | 'indeterminado'

export type LinkType = 'suspected_cause' | 'confirmed_cause' | 'related_symptom'

export interface GeoReference {
  latitude?: number
  longitude?: number
  accuracy?: number   // metros
  capturedAt: string  // ISO timestamp
}

export interface FloorPlanPoint {
  planVersionId: string
  xPct: number        // 0.0–1.0
  yPct: number        // 0.0–1.0
}

export interface TaxonomyReference {
  systemCode: string
  pathologyCode?: string   // opcional em provisionalTaxonomy
  normRef?: string
}

export interface Money {
  amount: number
  currency: string    // ISO 4217 — default 'BRL'
}

export interface DataQualityScore {
  value: number                 // 0–100
  completeness: number
  evidenceDensity: number
  taxonomicConsistency: number
  geoPresence: boolean
  signaturePresent: boolean
  calculatedAt: string
}

export interface AssetReference {
  empreendimentoId: string
  blocoId?: string
  torreId?: string
  unidadeId?: string
  ambienteId?: string
  componenteId?: string
  floorPlanRef?: FloorPlanPoint
}

export interface RelatedCondition {
  conditionId: string
  linkType: LinkType
  linkedAt: string
  linkedBy: ActorReference
  notes?: string
}

// ────────────────────────────────────────────────────────────
// Entidades dentro do Aggregate
// ────────────────────────────────────────────────────────────

export interface Evidence {
  id: string
  conditionId: string
  organizationId: string
  type: EvidenceType
  url: string
  mimeType: string
  sizeBytes: number
  geoRef?: GeoReference
  capturedAt: string          // imutável — timestamp do dispositivo
  capturedBy: ActorReference
  checksum: string            // SHA-256
  superseded: boolean
  supersededBy?: string
  supersededAt?: string
  attachedTo: string          // 'condition' | 'step' | 'validation' | 'contestation'
  attachedToRef?: string
  createdAt: string
}

export interface ActionStep {
  id: string
  description: string
  completedAt?: string
  completedBy?: ActorReference
  evidenceIds: string[]
}

export interface ActionPlan {
  id: string
  conditionId: string
  organizationId: string
  description: string
  assignedTo: ActorReference
  slaDeadline: string         // ISO date
  estimatedCost?: Money
  steps: ActionStep[]
  previousPlanId?: string
  revisionReason?: string
  isCurrent: boolean
  createdAt: string
  createdBy: ActorReference
}

export interface ResponsibilityAssignment {
  id: string
  conditionId: string
  organizationId: string
  responsibleParty: ResponsibleParty
  justification: string
  relatedNorm?: string
  assignedBy: ActorReference
  assignedAt: string
}

export interface Validation {
  id: string
  conditionId: string
  organizationId: string
  result: ValidationResult
  notes?: string
  validatedBy: ActorReference
  validatedAt: string
}

export interface ContestationResponse {
  repairAccepted: boolean     // true = reparo ok; false = reparo insuficiente
  respondedBy: ActorReference
  respondedAt: string
  justification: string
}

export interface Contestation {
  id: string
  conditionId: string
  organizationId: string
  contestedBy: ActorReference
  contestedAt: string
  basis: string
  slaDeadline: string
  state: 'open' | 'responded' | 'resolved' | 'escalated'
  response?: ContestationResponse
  resolvedAt?: string
}

// ────────────────────────────────────────────────────────────
// Aggregate Root
// ────────────────────────────────────────────────────────────

export interface ConstructionCondition {
  organizationId: string
  id: string
  assetRef: AssetReference
  provisionalTaxonomy?: TaxonomyReference
  taxonomy?: TaxonomyReference
  state: ConditionState
  severity: Severity
  origin: ProbableOrigin
  description?: string
  qualityScore?: DataQualityScore
  detectedAt: string
  detectedBy: ActorReference
  version: number
  relatedConditions: RelatedCondition[]
  evidence: Evidence[]
  actionPlan?: ActionPlan
  responsibility?: ResponsibilityAssignment
  contestation?: Contestation
  validations: Validation[]
  createdAt: string
  updatedAt: string
}

export interface UpdateConditionDraftCommand {
  conditionId: string
  organizationId: string
  expectedVersion: number
  assetUnidadeId?: string
  assetAmbienteId?: string
  severity?: Severity
  origin?: ProbableOrigin
  description?: string
  updatedBy: ActorReference
}

// ────────────────────────────────────────────────────────────
// Comandos (inputs dos RPCs)
// ────────────────────────────────────────────────────────────

export interface DetectConditionCommand {
  organizationId: string
  assetEmpreendimentoId: string
  assetBlocoId?: string
  assetTorreId?: string
  assetUnidadeId?: string
  assetAmbienteId?: string
  assetComponenteId?: string
  assetFloorPlanRef?: FloorPlanPoint
  provisionalTaxonomy?: TaxonomyReference
  severity: Severity
  origin: ProbableOrigin
  detectedBy: ActorReference
}

export interface ClassifyConditionCommand {
  conditionId: string
  organizationId: string
  expectedVersion: number
  taxonomy: TaxonomyReference
  severity: Severity
  origin: ProbableOrigin
  classifiedBy: ActorReference
}

export interface AssignResponsibilityCommand {
  conditionId: string
  organizationId: string
  expectedVersion: number
  responsibleParty: ResponsibleParty
  justification: string
  relatedNorm?: string
  assignedBy: ActorReference
}

export interface RequestActionCommand {
  conditionId: string
  organizationId: string
  expectedVersion: number
  description: string
  assignedTo: ActorReference
  slaDeadline: string
  steps?: Omit<ActionStep, 'completedAt' | 'completedBy' | 'evidenceIds'>[]
  estimatedCost?: Money
  requestedBy: ActorReference
}

export interface StartRepairCommand {
  conditionId: string
  organizationId: string
  expectedVersion: number
  startedBy: ActorReference
}

export interface CompleteRepairStepCommand {
  conditionId: string
  organizationId: string
  expectedVersion: number
  stepId: string
  evidenceIds: string[]
  completedBy: ActorReference
}

export interface ValidateConditionCommand {
  conditionId: string
  organizationId: string
  expectedVersion: number
  result: ValidationResult
  notes?: string
  validatedBy: ActorReference
}

export interface ContestConditionCommand {
  conditionId: string
  organizationId: string
  expectedVersion: number
  basis: string
  slaDeadline: string
  contestedBy: ActorReference
}

export interface RespondToContestationCommand {
  conditionId: string
  organizationId: string
  expectedVersion: number
  repairAccepted: boolean
  justification: string
  respondedBy: ActorReference
}

export interface EscalateConditionCommand {
  conditionId: string
  organizationId: string
  expectedVersion: number
  escalatedBy: ActorReference
}

export interface ResolveEscalationCommand {
  conditionId: string
  organizationId: string
  expectedVersion: number
  externalDecision: string
  resolution: string
  closedBy: ActorReference
}

export interface CloseConditionCommand {
  conditionId: string
  organizationId: string
  expectedVersion: number
  warrantyExpired?: boolean
  closedBy: ActorReference
}

export interface ReopenConditionCommand {
  conditionId: string
  organizationId: string
  expectedVersion: number
  reason: string
  warrantyExpiresAt: string   // validado pelo app service antes de chamar o RPC
  reopenedBy: ActorReference
}

export interface ReviseActionPlanCommand {
  conditionId: string
  organizationId: string
  expectedVersion: number
  description: string
  assignedTo: ActorReference
  slaDeadline: string
  steps?: ActionStep[]
  estimatedCost?: Money
  revisionReason: string
  revisedBy: ActorReference
}

export interface SupersedeEvidenceCommand {
  conditionId: string
  organizationId: string
  expectedVersion: number
  evidenceId: string
  newEvidenceId: string
  reason: string
  supersededByActor: ActorReference
}

export interface LinkConditionsCommand {
  conditionId: string
  organizationId: string
  expectedVersion: number
  relatedConditionId: string
  linkType: LinkType
  notes?: string
  linkedBy: ActorReference
}

// ────────────────────────────────────────────────────────────
// Erros de domínio
// ────────────────────────────────────────────────────────────

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'DomainError'
  }
}

export class ConcurrencyConflictError extends DomainError {
  constructor(details?: unknown) {
    super('CONCURRENCY_CONFLICT', 'Version conflict — reload and retry', details)
  }
}

export class InvalidTransitionError extends DomainError {
  constructor(details?: unknown) {
    super('INVALID_TRANSITION', 'State transition not allowed', details)
  }
}

export class InvariantViolationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super('INVARIANT_VIOLATION', message, details)
  }
}

export class TenantError extends DomainError {
  constructor() {
    super('UNAUTHORIZED_TENANT', 'Access denied')
  }
}

export class WarrantyExpiredError extends DomainError {
  constructor(details?: unknown) {
    super('WARRANTY_EXPIRED', 'Warranty period has expired', details)
  }
}

// ────────────────────────────────────────────────────────────
// Taxonomia (lookup)
// ────────────────────────────────────────────────────────────

export interface TaxonomySystem {
  code: string
  name: string
  normRef?: string
  active: boolean
}

export interface TaxonomyPathology {
  code: string
  name: string
  systemCode: string
  definition?: string
  normRef?: string
  active: boolean
}

// ────────────────────────────────────────────────────────────
// Filtros para listagem
// ────────────────────────────────────────────────────────────

export interface ConditionFilters {
  organizationId: string
  empreendimentoId?: string
  state?: ConditionState[]
  severity?: Severity[]
  origin?: ProbableOrigin[]
  systemCode?: string
  assignedToId?: string
  detectedAfter?: string
  detectedBefore?: string
  minQualityScore?: number
}

// ────────────────────────────────────────────────────────────
// Resultado de RPC
// ────────────────────────────────────────────────────────────

export interface RpcResult {
  version: number
  newState?: ConditionState
  [key: string]: unknown
}
