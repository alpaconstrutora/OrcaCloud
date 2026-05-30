// ============================================================
// Módulo: Pós-Obra & Garantia
// Types — alinhados à migration 20260708000000
// ============================================================

import type { ActorReference } from './quality';

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

export type ClaimSeverity = 'baixa' | 'media' | 'alta' | 'critica';

export type ResponsibleParty =
  | 'construtora'
  | 'fornecedor'
  | 'proprietario'
  | 'uso_inadequado'
  | 'indeterminado';

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
  organization_id: string;
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
