// ============================================================
// Módulo: Qualidade & Entrega — ConditionService
// Wrapper sobre os RPCs PostgreSQL — sem lógica de domínio aqui.
// Toda regra de negócio está nos RPCs (migration 20260514000001).
// ============================================================

import { supabase } from '../lib/supabase'
import type { PostgrestError } from '@supabase/supabase-js'
import type {
  ConstructionCondition,
  Evidence,
  ActionPlan,
  Contestation,
  TaxonomySystem,
  TaxonomyPathology,
  ConditionFilters,
  RpcResult,
  DetectConditionCommand,
  ClassifyConditionCommand,
  AssignResponsibilityCommand,
  RequestActionCommand,
  StartRepairCommand,
  CompleteRepairStepCommand,
  ValidateConditionCommand,
  ContestConditionCommand,
  RespondToContestationCommand,
  EscalateConditionCommand,
  ResolveEscalationCommand,
  CloseConditionCommand,
  ReopenConditionCommand,
  ReviseActionPlanCommand,
  SupersedeEvidenceCommand,
  LinkConditionsCommand,
  UpdateConditionDraftCommand,
} from '../types/quality'
import {
  ConcurrencyConflictError,
  InvalidTransitionError,
  InvariantViolationError,
  TenantError,
  WarrantyExpiredError,
  DomainError,
} from '../types/quality'

// ────────────────────────────────────────────────────────────
// Error mapping — transforma erros do Postgres em DomainErrors tipados
// ────────────────────────────────────────────────────────────

function mapError(error: PostgrestError): never {
  const msg = error.message ?? ''
  if (msg.includes('ConcurrencyConflict'))       throw new ConcurrencyConflictError(error)
  if (msg.includes('InvalidTransition'))          throw new InvalidTransitionError(error)
  if (msg.includes('InvariantViolation'))         throw new InvariantViolationError(msg, error)
  if (msg.includes('UnauthorizedTenantAccess'))   throw new TenantError()
  if (msg.includes('WarrantyExpired'))            throw new WarrantyExpiredError(error)
  if (msg.includes('MissingExternalDecision'))    throw new InvariantViolationError(msg, error)
  throw new DomainError('UNKNOWN', msg, error)
}

async function rpc<T = RpcResult>(fn: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, params)
  if (error) mapError(error)
  return data as T
}

// ────────────────────────────────────────────────────────────
// Comandos (escrita)
// ────────────────────────────────────────────────────────────

export const qualityConditionService = {

  detect: (cmd: DetectConditionCommand) =>
    rpc('detect_condition', {
      p_organization_id:       cmd.organizationId,
      p_asset_empreendimento:  cmd.assetEmpreendimentoId,
      p_asset_bloco:           cmd.assetBlocoId ?? null,
      p_asset_torre:           cmd.assetTorreId ?? null,
      p_asset_unidade:         cmd.assetUnidadeId ?? null,
      p_asset_ambiente:        cmd.assetAmbienteId ?? null,
      p_asset_componente:      cmd.assetComponenteId ?? null,
      p_asset_floor_plan_ref:  cmd.assetFloorPlanRef ?? null,
      p_provisional_taxonomy:  cmd.provisionalTaxonomy ?? null,
      p_severity:              cmd.severity,
      p_origin:                cmd.origin,
      p_detected_by:           cmd.detectedBy,
    }),

  classify: (cmd: ClassifyConditionCommand) =>
    rpc('classify_condition', {
      p_condition_id:     cmd.conditionId,
      p_organization_id:  cmd.organizationId,
      p_expected_version: cmd.expectedVersion,
      p_taxonomy:         cmd.taxonomy,
      p_severity:         cmd.severity,
      p_origin:           cmd.origin,
      p_classified_by:    cmd.classifiedBy,
    }),

  assignResponsibility: (cmd: AssignResponsibilityCommand) =>
    rpc('assign_responsibility', {
      p_condition_id:      cmd.conditionId,
      p_organization_id:   cmd.organizationId,
      p_expected_version:  cmd.expectedVersion,
      p_responsible_party: cmd.responsibleParty,
      p_justification:     cmd.justification,
      p_related_norm:      cmd.relatedNorm ?? null,
      p_assigned_by:       cmd.assignedBy,
    }),

  requestAction: (cmd: RequestActionCommand) =>
    rpc('request_action', {
      p_condition_id:    cmd.conditionId,
      p_organization_id: cmd.organizationId,
      p_expected_version: cmd.expectedVersion,
      p_description:     cmd.description,
      p_assigned_to:     cmd.assignedTo,
      p_sla_deadline:    cmd.slaDeadline,
      p_steps:           cmd.steps ?? [],
      p_estimated_cost:  cmd.estimatedCost ?? null,
      p_requested_by:    cmd.requestedBy,
    }),

  startRepair: (cmd: StartRepairCommand) =>
    rpc('start_repair', {
      p_condition_id:    cmd.conditionId,
      p_organization_id: cmd.organizationId,
      p_expected_version: cmd.expectedVersion,
      p_started_by:      cmd.startedBy,
    }),

  completeRepairStep: (cmd: CompleteRepairStepCommand) =>
    rpc('complete_repair_step', {
      p_condition_id:    cmd.conditionId,
      p_organization_id: cmd.organizationId,
      p_expected_version: cmd.expectedVersion,
      p_step_id:         cmd.stepId,
      p_evidence_ids:    cmd.evidenceIds,
      p_completed_by:    cmd.completedBy,
    }),

  validate: (cmd: ValidateConditionCommand) =>
    rpc('validate_condition', {
      p_condition_id:    cmd.conditionId,
      p_organization_id: cmd.organizationId,
      p_expected_version: cmd.expectedVersion,
      p_result:          cmd.result,
      p_notes:           cmd.notes ?? null,
      p_validated_by:    cmd.validatedBy,
    }),

  contest: (cmd: ContestConditionCommand) =>
    rpc('contest_condition', {
      p_condition_id:    cmd.conditionId,
      p_organization_id: cmd.organizationId,
      p_expected_version: cmd.expectedVersion,
      p_basis:           cmd.basis,
      p_sla_deadline:    cmd.slaDeadline,
      p_contested_by:    cmd.contestedBy,
    }),

  respondToContestation: (cmd: RespondToContestationCommand) =>
    rpc('respond_to_contestation', {
      p_condition_id:    cmd.conditionId,
      p_organization_id: cmd.organizationId,
      p_expected_version: cmd.expectedVersion,
      p_repair_accepted: cmd.repairAccepted,
      p_justification:   cmd.justification,
      p_responded_by:    cmd.respondedBy,
    }),

  escalate: (cmd: EscalateConditionCommand) =>
    rpc('escalate_condition', {
      p_condition_id:    cmd.conditionId,
      p_organization_id: cmd.organizationId,
      p_expected_version: cmd.expectedVersion,
      p_escalated_by:    cmd.escalatedBy,
    }),

  resolveEscalation: (cmd: ResolveEscalationCommand) =>
    rpc('resolve_escalation', {
      p_condition_id:       cmd.conditionId,
      p_organization_id:    cmd.organizationId,
      p_expected_version:   cmd.expectedVersion,
      p_external_decision:  cmd.externalDecision,
      p_resolution:         cmd.resolution,
      p_closed_by:          cmd.closedBy,
    }),

  close: (cmd: CloseConditionCommand) =>
    rpc('close_condition', {
      p_condition_id:    cmd.conditionId,
      p_organization_id: cmd.organizationId,
      p_expected_version: cmd.expectedVersion,
      p_warranty_expired: cmd.warrantyExpired ?? false,
      p_closed_by:       cmd.closedBy,
    }),

  reopen: (cmd: ReopenConditionCommand) =>
    rpc('reopen_condition', {
      p_condition_id:       cmd.conditionId,
      p_organization_id:    cmd.organizationId,
      p_expected_version:   cmd.expectedVersion,
      p_reason:             cmd.reason,
      p_warranty_expires_at: cmd.warrantyExpiresAt,
      p_reopened_by:        cmd.reopenedBy,
    }),

  updateDraft: (cmd: UpdateConditionDraftCommand) =>
    rpc('update_condition_draft', {
      p_condition_id:    cmd.conditionId,
      p_organization_id: cmd.organizationId,
      p_expected_version: cmd.expectedVersion,
      p_asset_unidade:   cmd.assetUnidadeId   ?? null,
      p_asset_ambiente:  cmd.assetAmbienteId  ?? null,
      p_severity:        cmd.severity         ?? null,
      p_origin:          cmd.origin           ?? null,
      p_description:     cmd.description      ?? null,
      p_updated_by:      cmd.updatedBy,
    }),

  reviseActionPlan: (cmd: ReviseActionPlanCommand) =>
    rpc('revise_action_plan', {
      p_condition_id:    cmd.conditionId,
      p_organization_id: cmd.organizationId,
      p_expected_version: cmd.expectedVersion,
      p_description:     cmd.description,
      p_assigned_to:     cmd.assignedTo,
      p_sla_deadline:    cmd.slaDeadline,
      p_steps:           cmd.steps ?? [],
      p_estimated_cost:  cmd.estimatedCost ?? null,
      p_revision_reason: cmd.revisionReason,
      p_revised_by:      cmd.revisedBy,
    }),

  supersedeEvidence: (cmd: SupersedeEvidenceCommand) =>
    rpc('supersede_evidence', {
      p_condition_id:         cmd.conditionId,
      p_organization_id:      cmd.organizationId,
      p_expected_version:     cmd.expectedVersion,
      p_evidence_id:          cmd.evidenceId,
      p_new_evidence_id:      cmd.newEvidenceId,
      p_reason:               cmd.reason,
      p_superseded_by_actor:  cmd.supersededByActor,
    }),

  linkConditions: (cmd: LinkConditionsCommand) =>
    rpc('link_conditions', {
      p_condition_id:          cmd.conditionId,
      p_organization_id:       cmd.organizationId,
      p_expected_version:      cmd.expectedVersion,
      p_related_condition_id:  cmd.relatedConditionId,
      p_link_type:             cmd.linkType,
      p_notes:                 cmd.notes ?? null,
      p_linked_by:             cmd.linkedBy,
    }),

  // ────────────────────────────────────────────────────────
  // Leitura
  // ────────────────────────────────────────────────────────

  list: async (filters: ConditionFilters): Promise<ConstructionCondition[]> => {
    let query = supabase
      .from('construction_conditions')
      .select(`
        *,
        condition_evidence(*),
        condition_action_plans(* , condition_action_plans!previous_plan_id(*)),
        condition_responsibilities(*),
        condition_validations(*),
        condition_contestations(*)
      `)
      .eq('organization_id', filters.organizationId)
      .order('created_at', { ascending: false })

    if (filters.empreendimentoId)
      query = query.eq('asset_empreendimento_id', filters.empreendimentoId)

    if (filters.state?.length)
      query = query.in('state', filters.state)

    if (filters.severity?.length)
      query = query.in('severity', filters.severity)

    if (filters.systemCode)
      query = query.contains('taxonomy', { systemCode: filters.systemCode })

    if (filters.detectedAfter)
      query = query.gte('detected_at', filters.detectedAfter)

    if (filters.detectedBefore)
      query = query.lte('detected_at', filters.detectedBefore)

    if (filters.minQualityScore !== undefined)
      query = query.gte('quality_score->>value', filters.minQualityScore)

    const { data, error } = await query
    if (error) mapError(error)
    return (data ?? []).map(mapRow)
  },

  getById: async (id: string, organizationId: string): Promise<ConstructionCondition | null> => {
    const { data, error } = await supabase
      .from('construction_conditions')
      .select(`
        *,
        condition_evidence(*),
        condition_action_plans(*),
        condition_responsibilities(*),
        condition_validations(*),
        condition_contestations(*)
      `)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null  // not found
      mapError(error)
    }
    return data ? mapRow(data) : null
  },

  getHistory: async (conditionId: string, organizationId: string) => {
    const { data, error } = await supabase
      .from('condition_events')
      .select('*')
      .eq('condition_id', conditionId)
      .eq('organization_id', organizationId)
      .order('occurred_at', { ascending: true })

    if (error) mapError(error)
    return data ?? []
  },

  // ────────────────────────────────────────────────────────
  // Upload de evidência para o storage
  // ────────────────────────────────────────────────────────

  uploadEvidence: async (
    organizationId: string,
    conditionId: string,
    evidenceId: string,
    file: File
  ): Promise<string> => {
    const ext  = file.name.split('.').pop()
    const path = `${organizationId}/evidence/${conditionId}/${evidenceId}/${evidenceId}.${ext}`

    const { error } = await supabase.storage
      .from('condition-evidence')
      .upload(path, file, { upsert: false })

    if (error) throw new DomainError('UPLOAD_FAILED', error.message, error)
    return path
  },

  getEvidenceUrl: async (path: string, expiresIn = 3600): Promise<string> => {
    const { data, error } = await supabase.storage
      .from('condition-evidence')
      .createSignedUrl(path, expiresIn)

    if (error) throw new DomainError('SIGNED_URL_FAILED', error.message, error)
    return data.signedUrl
  },

  // ────────────────────────────────────────────────────────
  // Taxonomia (lookup — cached no client)
  // ────────────────────────────────────────────────────────

  getTaxonomySystems: async (): Promise<TaxonomySystem[]> => {
    const { data, error } = await supabase
      .from('condition_taxonomy_systems')
      .select('*')
      .eq('active', true)
      .order('code')

    if (error) mapError(error)
    return data ?? []
  },

  getTaxonomyPathologies: async (systemCode?: string): Promise<TaxonomyPathology[]> => {
    let query = supabase
      .from('condition_taxonomy_pathologies')
      .select('*')
      .eq('active', true)
      .order('code')

    if (systemCode) query = query.eq('system_code', systemCode)

    const { data, error } = await query
    if (error) mapError(error)
    return data ?? []
  },
}

// ────────────────────────────────────────────────────────────
// Mapper: snake_case do banco → camelCase dos tipos
// ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): ConstructionCondition {
  return {
    organizationId:  row.organization_id,
    id:              row.id,
    assetRef: {
      empreendimentoId: row.asset_empreendimento_id,
      blocoId:          row.asset_bloco_id,
      torreId:          row.asset_torre_id,
      unidadeId:        row.asset_unidade_id,
      ambienteId:       row.asset_ambiente_id,
      componenteId:     row.asset_componente_id,
      floorPlanRef:     row.asset_floor_plan_ref,
    },
    provisionalTaxonomy: row.provisional_taxonomy,
    taxonomy:            row.taxonomy,
    state:               row.state,
    severity:            row.severity,
    origin:              row.origin,
    description:         row.description,
    qualityScore:        row.quality_score,
    detectedAt:          row.detected_at,
    detectedBy:          row.detected_by,
    version:             row.version,
    relatedConditions:   row.related_conditions ?? [],
    evidence:            (row.condition_evidence ?? []).map(mapEvidence),
    actionPlan:          (row.condition_action_plans ?? []).find((p: any) => p.is_current)
                           ? mapActionPlan((row.condition_action_plans ?? []).find((p: any) => p.is_current))
                           : undefined,
    responsibility:      row.condition_responsibilities?.[0]
                           ? mapResponsibility(row.condition_responsibilities[0])
                           : undefined,
    contestation:        row.condition_contestations?.[0]
                           ? mapContestation(row.condition_contestations[0])
                           : undefined,
    validations:         (row.condition_validations ?? []).map(mapValidation),
    createdAt:           row.created_at,
    updatedAt:           row.updated_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEvidence(r: any): Evidence {
  return {
    id:            r.id,
    conditionId:   r.condition_id,
    organizationId: r.organization_id,
    type:          r.type,
    url:           r.url,
    mimeType:      r.mime_type,
    sizeBytes:     r.size_bytes,
    geoRef:        r.geo_ref,
    capturedAt:    r.captured_at,
    capturedBy:    r.captured_by,
    checksum:      r.checksum,
    superseded:    r.superseded,
    supersededBy:  r.superseded_by,
    supersededAt:  r.superseded_at,
    attachedTo:    r.attached_to,
    attachedToRef: r.attached_to_ref,
    createdAt:     r.created_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapActionPlan(r: any): ActionPlan {
  return {
    id:              r.id,
    conditionId:     r.condition_id,
    organizationId:  r.organization_id,
    description:     r.description,
    assignedTo:      r.assigned_to,
    slaDeadline:     r.sla_deadline,
    estimatedCost:   r.estimated_cost,
    steps:           r.steps ?? [],
    previousPlanId:  r.previous_plan_id,
    revisionReason:  r.revision_reason,
    isCurrent:       r.is_current,
    createdAt:       r.created_at,
    createdBy:       r.created_by,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapResponsibility(r: any) {
  return {
    id:               r.id,
    conditionId:      r.condition_id,
    organizationId:   r.organization_id,
    responsibleParty: r.responsible_party,
    justification:    r.justification,
    relatedNorm:      r.related_norm,
    assignedBy:       r.assigned_by,
    assignedAt:       r.assigned_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapValidation(r: any) {
  return {
    id:            r.id,
    conditionId:   r.condition_id,
    organizationId: r.organization_id,
    result:        r.result,
    notes:         r.notes,
    validatedBy:   r.validated_by,
    validatedAt:   r.validated_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapContestation(r: any): Contestation {
  return {
    id:            r.id,
    conditionId:   r.condition_id,
    organizationId: r.organization_id,
    contestedBy:   r.contested_by,
    contestedAt:   r.contested_at,
    basis:         r.basis,
    slaDeadline:   r.sla_deadline,
    state:         r.state,
    response:      r.repair_accepted !== null ? {
      repairAccepted: r.repair_accepted,
      respondedBy:   r.responded_by,
      respondedAt:   r.responded_at,
      justification: r.justification,
    } : undefined,
    resolvedAt:    r.resolved_at,
  }
}
