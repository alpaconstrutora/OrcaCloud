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

/**
 * Zona do Mapa Regulatório aplicada a um estudo, com os números em vigor.
 *
 * Vive FORA do payload canônico de propósito: parâmetro urbanístico do município
 * não é geometria do desenho, e gravá-lo no snapshot faria o hash da planta
 * mudar porque alguém digitou um recuo. Tabela
 * `blueprint_study_urban_context` (migration `aplicar_20270914000000`).
 */
export interface BlueprintUrbanContext {
  id: string;
  study_id: string;
  organization_id: string;
  /** De onde os números vieram. `null` = zona de origem apagada ou nunca houve. */
  empreendimento_id: string | null;
  regulatory_zone_id: string | null;
  /** Cópia do rótulo, para a tela continuar legível se a zona sumir. */
  zona_rotulo: string | null;
  lei_referencia: string | null;
  /** Recuos em MILÍMETRO inteiro — a unidade do kernel. */
  recuo_frente_mm: number | null;
  recuo_fundos_mm: number | null;
  recuo_lateral_direita_mm: number | null;
  recuo_lateral_esquerda_mm: number | null;
  /** Taxas em PORCENTAGEM (80 = 80%), já resolvidas na leitura. */
  taxa_ocupacao_max: number | null;
  taxa_permeabilidade_min: number | null;
  coeficiente_max: number | null;
  /** Em METRO. */
  gabarito_altura_max_m: number | null;
  gabarito_pavimentos: number | null;
  /** Por campo: veio da lei ou foi digitado por cima. */
  origem_valores: Record<string, 'ZONA' | 'MANUAL'>;
  aplicado_em: string | null;
  created_at: string;
  updated_at: string;
}
