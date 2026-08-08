// services/blueprintService.ts
//
// Persistência do módulo Planta Inteligente (épico E0).
//
// Desenho central: o SNAPSHOT é a verdade, o RASCUNHO é buffer.
//
// O rascunho (`blueprint_branches.draft_payload`) é o único ponto mutável do
// módulo — ele existe para o autosave não publicar uma versão a cada gesto
// (PRD RF-048). Publicar congela o conteúdo num snapshot imutável com hash, e é o
// snapshot que orçamento, planejamento e documentos podem citar.
//
// Nada aqui toca `plant_*` (Planta AI v1). Os dois modelos coexistem por decisão
// DR-01 e nenhum dado é migrado — ver PRD §24.5.

import { supabase } from '../lib/supabase';
import {
  type BlueprintModel,
  KERNEL_VERSION,
  canonicalPayload,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  snapshotHash,
} from '../utils/blueprintKernel';
import {
  BlueprintRevisionConflict,
  type BlueprintAuditEvent,
  type BlueprintBranch,
  type BlueprintSnapshot,
  type BlueprintSnapshotSummary,
  type BlueprintStudy,
} from '../types/blueprint';

// Colunas explícitas, nunca `select('*')`: o payload é grande e não deve vir por
// engano numa listagem.
const STUDY_COLS =
  'id, organization_id, project_id, name, unit_system, status, created_by, created_at, updated_at';
const BRANCH_COLS =
  'id, study_id, organization_id, name, parent_snapshot_id, base_revision, draft_payload, draft_kernel_version, draft_hash, draft_saved_at, created_by, created_at, updated_at';
const SNAPSHOT_SUMMARY_COLS =
  'id, study_id, branch_id, organization_id, revision, hash, kernel_version, notes, published_by, published_at';
const SNAPSHOT_FULL_COLS = `${SNAPSHOT_SUMMARY_COLS}, payload`;
const AUDIT_COLS =
  'id, organization_id, study_id, actor, action, target_type, target_id, metadata, created_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprint/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Estudos
// ─────────────────────────────────────────────────────────────────────────────

export async function listStudies(organizationId: string): Promise<BlueprintStudy[]> {
  const { data, error } = await supabase
    .from('blueprint_studies')
    .select(STUDY_COLS)
    .eq('organization_id', organizationId)
    .neq('status', 'ARQUIVADO')
    .order('updated_at', { ascending: false });

  if (error) fail('listStudies', error);
  return (data ?? []) as BlueprintStudy[];
}

export async function getStudy(studyId: string): Promise<BlueprintStudy | null> {
  const { data, error } = await supabase
    .from('blueprint_studies')
    .select(STUDY_COLS)
    .eq('id', studyId)
    .maybeSingle();

  if (error) fail('getStudy', error);
  return (data as BlueprintStudy) ?? null;
}

/**
 * Cria o estudo já com o ramo `principal`. Estudo sem ramo não é editável, então
 * criar os dois juntos evita um estado intermediário que a UI teria que tratar.
 */
export async function createStudy(input: {
  organizationId: string;
  name: string;
  projectId?: string | null;
}): Promise<{ study: BlueprintStudy; branch: BlueprintBranch }> {
  const { data: study, error } = await supabase
    .from('blueprint_studies')
    .insert({
      organization_id: input.organizationId,
      name: input.name,
      project_id: input.projectId ?? null,
    })
    .select(STUDY_COLS)
    .single();

  if (error) fail('createStudy', error);

  const { data: branch, error: branchError } = await supabase
    .from('blueprint_branches')
    .insert({
      study_id: (study as BlueprintStudy).id,
      organization_id: input.organizationId,
      name: 'principal',
    })
    .select(BRANCH_COLS)
    .single();

  if (branchError) fail('createStudy/branch', branchError);

  await recordAudit({
    organizationId: input.organizationId,
    studyId: (study as BlueprintStudy).id,
    action: 'ESTUDO_CRIADO',
    targetType: 'STUDY',
    targetId: (study as BlueprintStudy).id,
  });

  return { study: study as BlueprintStudy, branch: branch as BlueprintBranch };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ramos e rascunho
// ─────────────────────────────────────────────────────────────────────────────

export async function listBranches(studyId: string): Promise<BlueprintBranch[]> {
  const { data, error } = await supabase
    .from('blueprint_branches')
    .select(BRANCH_COLS)
    .eq('study_id', studyId)
    .order('created_at', { ascending: true });

  if (error) fail('listBranches', error);
  return (data ?? []) as BlueprintBranch[];
}

export async function getBranch(branchId: string): Promise<BlueprintBranch | null> {
  const { data, error } = await supabase
    .from('blueprint_branches')
    .select(BRANCH_COLS)
    .eq('id', branchId)
    .maybeSingle();

  if (error) fail('getBranch', error);
  return (data as BlueprintBranch) ?? null;
}

/**
 * Autosave. Grava o rascunho SEM publicar versão (PRD RF-048).
 *
 * O hash é gravado junto para o cliente conseguir perguntar "mudou desde o último
 * save?" sem trafegar o payload inteiro de volta.
 */
export async function saveDraft(branchId: string, model: BlueprintModel): Promise<string> {
  const payload = canonicalPayload(model);
  const hash = snapshotHash(model);

  const { error } = await supabase
    .from('blueprint_branches')
    .update({
      draft_payload: JSON.parse(payload),
      draft_hash: hash,
      draft_kernel_version: KERNEL_VERSION,
      draft_saved_at: new Date().toISOString(),
    })
    .eq('id', branchId);

  if (error) fail('saveDraft', error);
  return hash;
}

/**
 * Carrega o modelo editável de um ramo: rascunho se houver, senão o último
 * snapshot publicado, senão um modelo vazio.
 */
export async function loadBranchModel(branchId: string): Promise<BlueprintModel | null> {
  const branch = await getBranch(branchId);
  if (!branch) return null;

  if (branch.draft_payload) {
    return modelFromCanonicalPayload(
      parseCanonicalPayload(JSON.stringify(branch.draft_payload)),
    );
  }

  if (branch.parent_snapshot_id) {
    const snapshot = await getSnapshot(branch.parent_snapshot_id);
    if (snapshot) {
      return modelFromCanonicalPayload(parseCanonicalPayload(JSON.stringify(snapshot.payload)));
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Publicação
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Publica um snapshot imutável.
 *
 * Toda a atomicidade vive na RPC: snapshot + objetos + auditoria + avanço do ramo
 * numa transação só. Fazer isso em chamadas separadas daqui deixaria janela para
 * um snapshot existir sem os objetos, ou para o ramo avançar sem o snapshot.
 *
 * Idempotente: republicar o mesmo conteúdo sobre a mesma revisão devolve o
 * snapshot que já existe. Recusar revisão desatualizada vira
 * `BlueprintRevisionConflict` em vez de sobrescrever silenciosamente (PRD CA-05).
 */
export async function publishSnapshot(input: {
  branchId: string;
  baseRevision: number;
  model: BlueprintModel;
  notes?: string;
}): Promise<string> {
  const payload = canonicalPayload(input.model);

  const { data, error } = await supabase.rpc('fn_blueprint_publish_snapshot', {
    p_branch_id: input.branchId,
    p_base_revision: input.baseRevision,
    p_hash: snapshotHash(input.model),
    p_kernel_version: KERNEL_VERSION,
    p_payload: JSON.parse(payload),
    p_notes: input.notes ?? null,
  });

  if (error) {
    // 40001 = serialization_failure, levantado pela RPC quando o ramo andou.
    if (error.code === '40001' || /revis[ãa]o desatualizada/i.test(error.message)) {
      throw new BlueprintRevisionConflict(
        input.baseRevision,
        `O ramo avançou desde a sua leitura (revisão ${input.baseRevision}). ` +
          'Recarregue o desenho antes de publicar.',
      );
    }
    fail('publishSnapshot', error);
  }

  return data as string;
}

export async function listSnapshots(studyId: string): Promise<BlueprintSnapshotSummary[]> {
  const { data, error } = await supabase
    .from('blueprint_snapshots')
    .select(SNAPSHOT_SUMMARY_COLS)
    .eq('study_id', studyId)
    .order('published_at', { ascending: false });

  if (error) fail('listSnapshots', error);
  return (data ?? []) as BlueprintSnapshotSummary[];
}

export async function getSnapshot(snapshotId: string): Promise<BlueprintSnapshot | null> {
  const { data, error } = await supabase
    .from('blueprint_snapshots')
    .select(SNAPSHOT_FULL_COLS)
    .eq('id', snapshotId)
    .maybeSingle();

  if (error) fail('getSnapshot', error);
  return (data as BlueprintSnapshot) ?? null;
}

/**
 * Verifica que o snapshot gravado ainda produz o hash que ele declara.
 *
 * É a prova de reprodutibilidade do PRD RNF-011 aplicada a um registro real:
 * relê o payload, reconstrói o modelo, recalcula o arranjo e re-serializa. Se o
 * kernel mudou de forma incompatível, ou se alguém alterou o JSON por fora, o
 * hash não bate e isso aparece — em vez de virar quantitativo errado depois.
 */
export async function verifySnapshotIntegrity(snapshotId: string): Promise<{
  ok: boolean;
  storedHash: string;
  recomputedHash: string;
  kernelVersion: string;
  kernelMatches: boolean;
}> {
  const snapshot = await getSnapshot(snapshotId);
  if (!snapshot) throw new Error(`blueprint/verify: snapshot ${snapshotId} não encontrado`);

  const model = modelFromCanonicalPayload(parseCanonicalPayload(JSON.stringify(snapshot.payload)));
  const recomputedHash = snapshotHash(model);

  return {
    ok: recomputedHash === snapshot.hash,
    storedHash: snapshot.hash,
    recomputedHash,
    kernelVersion: snapshot.kernel_version,
    kernelMatches: snapshot.kernel_version === KERNEL_VERSION,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Auditoria
// ─────────────────────────────────────────────────────────────────────────────

export async function recordAudit(input: {
  organizationId: string;
  studyId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.from('blueprint_audit_events').insert({
    organization_id: input.organizationId,
    study_id: input.studyId ?? null,
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    metadata: input.metadata ?? {},
  });

  // Auditoria não pode derrubar a operação que ela observa. Falhar aqui vira log,
  // não exceção — mas nunca silêncio.
  if (error) console.error('blueprint/recordAudit falhou:', error.message);
}

export async function listAudit(studyId: string, limit = 100): Promise<BlueprintAuditEvent[]> {
  const { data, error } = await supabase
    .from('blueprint_audit_events')
    .select(AUDIT_COLS)
    .eq('study_id', studyId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) fail('listAudit', error);
  return (data ?? []) as BlueprintAuditEvent[];
}
