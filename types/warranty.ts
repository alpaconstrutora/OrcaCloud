// ============================================================
// Módulo: Pós-Obra & Garantia
// Types — alinhados às migrations 20260708000000,
//         aplicar_20270914000007 e aplicar_20270914000008
//
// Desde 2026-08-26 este módulo absorveu "Qualidade & Entrega"
// (ver docs/planos/2026-08-26-consolidar-qualidade-em-garantia.md).
// Os value objects compartilhados continuam morando em ./quality —
// que virou o arquivo de vocabulário comum, não mais o de um módulo.
// ============================================================

import type {
  ActorReference, Severity, ProbableOrigin,
  TaxonomyReference, FloorPlanPoint,
  ResponsibleParty as SharedResponsibleParty,
} from './quality';

/**
 * Qualidade do REGISTRO do chamado, 0–100 — não do serviço prestado.
 *
 * Não reaproveita `DataQualityScore` de ./quality de propósito: aquele tem
 * `geoPresence` e `signaturePresent`, que dependem de `condition_evidence.geo_ref`.
 * `warranty_claim_evidence` não tem essa coluna, e os 15 pontos foram
 * redistribuídos em completude e taxonomia. Ver `fn_warranty_claim_quality_score`
 * em aplicar_20270914000007 — este shape é o retorno dela.
 */
export interface ClaimQualityScore {
  value: number;
  completeness: number;
  evidenceDensity: number;
  taxonomicConsistency: number;
  evidenceCount: number;
  minEvidence: number;
  calculatedAt: string;
}

// ────────────────────────────────────────────────────────────
// Lookups
// ────────────────────────────────────────────────────────────

export interface WarrantyTerm {
  code: string;
  descricao: string;
  prazo_meses: number;
  base_legal?: string;
  active: boolean;
}

// ────────────────────────────────────────────────────────────
// Estados do chamado
// ────────────────────────────────────────────────────────────

export type ClaimState =
  | 'ABERTO'
  | 'TRIAGEM'
  | 'EM_GARANTIA'
  | 'FORA_GARANTIA'
  | 'VISITA_AGENDADA'
  | 'EM_REPARO'
  | 'CONCLUIDO'
  | 'CONTESTADO'
  | 'REABERTO'
  | 'ENCERRADO';

// Reexportados de ./quality em vez de redeclarados: eram dois enums com os
// mesmos valores em arquivos diferentes — divergiriam na primeira mudança.
export type ClaimSeverity = Severity;
export type ResponsibleParty = SharedResponsibleParty;
export type ClaimOrigin = ProbableOrigin;

export type VisitStatus = 'AGENDADA' | 'REALIZADA' | 'CANCELADA' | 'REAGENDADA';

export type EvidenceAttachedTo = 'claim' | 'visit' | 'repair';

// ────────────────────────────────────────────────────────────
// Aggregate Root
// ────────────────────────────────────────────────────────────

export interface WarrantyClaim {
  id: string;
  organization_id: string;
  project_id?: string;
  client_id?: string;
  client_name?: string;
  unidade_ref?: string;
  warranty_term_code?: string;
  sistema_descricao: string;
  local_afetado?: string;
  descricao: string;
  severity: ClaimSeverity;
  state: ClaimState;
  in_warranty?: boolean;
  warranty_expires_at?: string;
  fora_garantia_motivo?: string;
  responsible_party?: ResponsibleParty;
  responsible_notes?: string;
  custo_estimado?: number;
  custo_real?: number;
  nps_nota?: number;
  nps_comentario?: string;
  opened_by: ActorReference;
  triaged_by?: ActorReference;
  closed_by?: ActorReference;
  sla_deadline?: string;
  version: number;
  created_at: string;
  updated_at: string;

  // ── Absorvidos de "Qualidade & Entrega" em 2026-08-26 ────────
  /** Taxonomia controlada (condition_taxonomy_*). Opcional: chamado por telefone entra sem. */
  taxonomy?: TaxonomyReference;
  /** Origem provável do defeito. */
  origin?: ClaimOrigin;
  /** Qualidade do REGISTRO, 0–100. Calculado por trigger — nunca escrever pelo app. */
  quality_score?: ClaimQualityScore;
  /** Ponto na planta. Sem interface hoje — ver o plano da consolidação. */
  asset_floor_plan_ref?: FloorPlanPoint;
  /** Preenchido quando o chamado nasceu da migração de uma condição de obra. */
  source_condition_id?: string;

  // joins opcionais
  warranty_term?: WarrantyTerm;
  visits?: WarrantyClaimVisit[];
  evidence?: WarrantyClaimEvidence[];
}

export interface WarrantyClaimInsert {
  organization_id: string;
  project_id?: string;
  client_id?: string;
  client_name?: string;
  unidade_ref?: string;
  warranty_term_code?: string;
  sistema_descricao: string;
  local_afetado?: string;
  descricao: string;
  severity: ClaimSeverity;
  opened_by: ActorReference;
  taxonomy?: TaxonomyReference;
  origin?: ClaimOrigin;
}

// ────────────────────────────────────────────────────────────
// Visita técnica
// ────────────────────────────────────────────────────────────

export interface WarrantyClaimVisit {
  id: string;
  organization_id: string;
  claim_id: string;
  scheduled_at: string;
  realized_at?: string;
  technician_name: string;
  technician_id?: string;
  status: VisitStatus;
  diagnostico?: string;
  parecer?: string;
  acao_definida?: string;
  created_at: string;
}

export interface WarrantyClaimVisitInsert {
  claim_id: string;
  organization_id: string;
  scheduled_at: string;
  technician_name: string;
  technician_id?: string;
}

// ────────────────────────────────────────────────────────────
// Evidência
// ────────────────────────────────────────────────────────────

export type EvidenceType = 'photo' | 'video' | 'audio' | 'document' | 'signature';

export interface WarrantyClaimEvidence {
  id: string;
  organization_id: string;
  claim_id: string;
  type: EvidenceType;
  url: string;
  mime_type: string;
  size_bytes: number;
  captured_at: string;
  captured_by: ActorReference;
  attached_to: EvidenceAttachedTo;
  attached_to_ref?: string;
  superseded: boolean;
  created_at: string;
}

// ────────────────────────────────────────────────────────────
// Audit log
// ────────────────────────────────────────────────────────────

export interface WarrantyClaimEvent {
  event_id: string;
  organization_id: string;
  claim_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  actor_id?: string;
  occurred_at: string;
  aggregate_version: number;
}

// ────────────────────────────────────────────────────────────
// Comandos (inputs dos RPCs)
// ────────────────────────────────────────────────────────────

export interface OpenWarrantyClaimCommand {
  organization_id: string;
  project_id?: string;
  client_id?: string;
  client_name?: string;
  unidade_ref?: string;
  sistema_descricao: string;
  local_afetado?: string;
  descricao: string;
  severity: ClaimSeverity;
  warranty_term_code?: string;
  opened_by: ActorReference;
  taxonomy?: TaxonomyReference;
  origin?: ClaimOrigin;
}

export interface ClassifyClaimCommand {
  claim_id: string;
  organization_id: string;
  expected_version: number;
  taxonomy: TaxonomyReference;
  origin?: ClaimOrigin;
  actor: ActorReference;
}

export interface TriageClaimCommand {
  claim_id: string;
  organization_id: string;
  expected_version: number;
  in_warranty: boolean;
  warranty_expires_at?: string;
  sla_deadline?: string;
  fora_garantia_motivo?: string;
  triaged_by: ActorReference;
}

export interface ScheduleVisitCommand {
  claim_id: string;
  organization_id: string;
  expected_version: number;
  scheduled_at: string;
  technician_name: string;
  technician_id?: string;
  actor: ActorReference;
}

export interface CloseClaimCommand {
  claim_id: string;
  organization_id: string;
  expected_version: number;
  custo_real?: number;
  nps_nota?: number;
  nps_comentario?: string;
  closed_by: ActorReference;
}

// ────────────────────────────────────────────────────────────
// Filtros
// ────────────────────────────────────────────────────────────

export interface ClaimFilters {
  organization_id: string | null;
  project_id?: string;
  client_id?: string;
  state?: ClaimState[];
  severity?: ClaimSeverity[];
  in_warranty?: boolean;
}

// ────────────────────────────────────────────────────────────
// KPIs de Garantia
// ────────────────────────────────────────────────────────────

export interface WarrantyKPIs {
  total_abertos: number;
  em_garantia: number;
  fora_garantia: number;
  encerrados_mes: number;
  nps_medio: number | null;
  custo_total_mes: number;
  sla_vencidos: number;
}
