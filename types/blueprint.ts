// types/blueprint.ts
//
// Domínio de persistência do módulo Planta Inteligente (épico E0).
//
// Separado de `utils/blueprintKernel` de propósito: o kernel é geometria pura, sem
// noção de organização, usuário ou banco. Estes tipos são a borda — o que atravessa
// a rede e o que a RLS protege.

export type BlueprintStudyStatus = 'RASCUNHO' | 'EM_EDICAO' | 'PUBLICADO' | 'ARQUIVADO';

export interface BlueprintStudy {
  id: string;
  organization_id: string;
  project_id: string | null;
  name: string;
  unit_system: 'METRIC';
  status: BlueprintStudyStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlueprintLevelRow {
  id: string;
  study_id: string;
  organization_id: string;
  name: string;
  elevation_mm: number;
  default_height_mm: number;
  ordinal: number;
  created_at: string;
  updated_at: string;
}

export interface BlueprintBranch {
  id: string;
  study_id: string;
  organization_id: string;
  name: string;
  parent_snapshot_id: string | null;
  /** Revisão publicada mais recente deste ramo. Token de concorrência otimista. */
  base_revision: number;
  draft_payload: unknown | null;
  draft_kernel_version: string | null;
  draft_hash: string | null;
  draft_saved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlueprintSnapshot {
  id: string;
  study_id: string;
  branch_id: string;
  organization_id: string;
  revision: number;
  hash: string;
  kernel_version: string;
  payload: unknown;
  notes: string | null;
  published_by: string | null;
  published_at: string;
}

/** Snapshot sem o payload — para listagens, que não devem trafegar o JSON inteiro. */
export type BlueprintSnapshotSummary = Omit<BlueprintSnapshot, 'payload'>;

export interface BlueprintAuditEvent {
  id: string;
  organization_id: string;
  study_id: string | null;
  actor: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BlueprintQuantitySnapshot {
  id: string;
  snapshot_id: string;
  organization_id: string;
  policy_version: string;
  policy: unknown;
  kernel_version: string;
  payload: unknown;
  totais: unknown;
  computed_by: string | null;
  computed_at: string;
}

/** Erro de concorrência: o ramo avançou desde a leitura do cliente (PRD CA-05). */
export class BlueprintRevisionConflict extends Error {
  constructor(
    readonly sentRevision: number,
    message: string,
  ) {
    super(message);
    this.name = 'BlueprintRevisionConflict';
  }
}
