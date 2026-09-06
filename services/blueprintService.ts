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
  POLITICA_PADRAO,
  type BlueprintModel,
  type QuantityPolicy,
  type Quantitativos,
  KERNEL_VERSION,
  computeQuantities,
  canonicalPayload,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  snapshotHash,
  stableStringify,
} from '../utils/blueprintKernel';
import {
  BlueprintRevisionConflict,
  type BlueprintAuditEvent,
  type BlueprintQuantitySnapshot,
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

/**
 * Lista os estudos.
 *
 * `organizationId === null` significa, e só significa, "Todas as organizações"
 * (ver hooks/useOrgContext.tsx). Nesse caso a consulta vai SEM filtro e deixa a
 * RLS recortar o que o usuário pode ver — nunca devolver vazio nem bloquear o
 * carregamento, que é o que deixaria a tela em branco.
 */
export async function listStudies(organizationId: string | null): Promise<BlueprintStudy[]> {
  let query = supabase
    .from('blueprint_studies')
    .select(STUDY_COLS)
    .neq('status', 'ARQUIVADO')
    .order('updated_at', { ascending: false });

  if (organizationId) query = query.eq('organization_id', organizationId);

  const { data, error } = await query;
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

/**
 * Duplica o estudo inteiro: novo estudo + ramo `principal` com o mesmo
 * conteúdo editável do ramo principal de origem (rascunho se houver, senão o
 * último snapshot publicado). A cópia nunca referencia o snapshot da origem
 * como pai — editar a cópia não pode alterar o histórico publicado do original.
 */
export async function duplicateStudy(studyId: string): Promise<BlueprintStudy> {
  const original = await getStudy(studyId);
  if (!original) throw new Error('blueprint/duplicateStudy: estudo não encontrado');

  const branches = await listBranches(studyId);
  const principal = branches.find((b) => b.name === 'principal') ?? branches[0];
  const model = principal ? await loadBranchModel(principal.id) : null;

  const { data: study, error } = await supabase
    .from('blueprint_studies')
    .insert({
      organization_id: original.organization_id,
      name: `${original.name} (cópia)`,
      project_id: original.project_id,
    })
    .select(STUDY_COLS)
    .single();
  if (error) fail('duplicateStudy', error);
  const newStudy = study as BlueprintStudy;

  const { error: branchError } = await supabase.from('blueprint_branches').insert({
    study_id: newStudy.id,
    organization_id: original.organization_id,
    name: 'principal',
    draft_payload: model ? JSON.parse(canonicalPayload(model)) : null,
    draft_kernel_version: model ? KERNEL_VERSION : null,
    draft_hash: model ? snapshotHash(model) : null,
    draft_saved_at: model ? new Date().toISOString() : null,
  });
  if (branchError) fail('duplicateStudy/branch', branchError);

  await recordAudit({
    organizationId: original.organization_id,
    studyId: newStudy.id,
    action: 'ESTUDO_DUPLICADO',
    targetType: 'STUDY',
    targetId: newStudy.id,
    metadata: { source_study_id: studyId },
  });

  return newStudy;
}

/**
 * "Excluir" é soft-delete: marca `status = 'ARQUIVADO'`, que `listStudies` já
 * filtra fora. Nada apaga a linha de verdade — um snapshot publicado do estudo
 * pode estar citado por orçamento/planejamento (RF-122) e não pode sumir por
 * baixo de quem referencia.
 */
export async function archiveStudy(studyId: string): Promise<void> {
  const study = await getStudy(studyId);
  if (!study) throw new Error('blueprint/archiveStudy: estudo não encontrado');

  const { error } = await supabase
    .from('blueprint_studies')
    .update({ status: 'ARQUIVADO' })
    .eq('id', studyId);
  if (error) fail('archiveStudy', error);

  await recordAudit({
    organizationId: study.organization_id,
    studyId,
    action: 'ESTUDO_ARQUIVADO',
    targetType: 'STUDY',
    targetId: studyId,
  });
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
 *
 * IDENTIDADE (04/09/2026): o payload traz `identity` com o `uid` de cada
 * elemento, e `modelFromCanonicalPayload` os PRESERVA. Payload gravado antes
 * disso não tem a chave; o kernel deriva uids determinísticos (hash geométrico +
 * família + índice) — reabrir duas vezes dá os mesmos — e o primeiro `saveDraft`
 * os grava para sempre. Nada aqui precisa saber a diferença.
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
    // 23001 = restrict_violation, levantado pela RPC quando o ramo andou.
    //
    // Não usar 40001 (serialization_failure) aqui, por mais tentador que o nome
    // seja: o PostgREST trata 40001 como retentável e reexecuta a transação em
    // laço. Como repetir nunca resolve — a revisão enviada segue velha — o
    // cliente ficava pendurado até o timeout de 20 s de lib/supabase.ts, e o
    // usuário via falha de rede em vez de "recarregue o desenho".
    if (error.code === '23001' || /revis[ãa]o desatualizada/i.test(error.message)) {
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

/**
 * Hash e versão de kernel de um snapshot, sem trazer o payload.
 *
 * Existe para o editor saber se o rascunho na tela JÁ FOI publicado. Usar o hash
 * do próprio rascunho para isso — que era o que acontecia — faz o editor
 * responder sempre "sem alterações": ele compara o desenho consigo mesmo.
 *
 * O payload fica de fora de propósito: é o campo grande da tabela, e aqui só se
 * precisa de dois textos.
 */
export async function getSnapshotIdentity(
  snapshotId: string,
): Promise<{ hash: string; kernel_version: string } | null> {
  const { data, error } = await supabase
    .from('blueprint_snapshots')
    .select('hash, kernel_version')
    .eq('id', snapshotId)
    .maybeSingle();

  if (error) fail('getSnapshotIdentity', error);
  return (data as { hash: string; kernel_version: string }) ?? null;
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

/**
 * Vincula (ou desvincula) o estudo a uma obra.
 *
 * Sem isto o `project_id` nascia nulo e NUNCA mudava: `createStudy` aceitava o
 * parâmetro e nenhuma tela o passava. O resultado era o pior tipo de defeito —
 * o botão "Aplicar no orçamento" existia, ficava permanentemente desabilitado, e
 * a explicação ("não está vinculado a uma obra") apontava para uma ação que não
 * havia onde executar.
 */
export async function setStudyProject(
  studyId: string,
  projectId: string | null,
): Promise<BlueprintStudy> {
  const { data, error } = await supabase
    .from('blueprint_studies')
    .update({ project_id: projectId })
    .eq('id', studyId)
    .select(STUDY_COLS)
    .single();

  // ATENÇÃO: UPDATE barrado por RLS devolve SUCESSO com zero linhas, e o
  // `.single()` é o que transforma isso em erro aqui. Sem ele, vincular a obra
  // de outra organização "funcionaria" em silêncio.
  if (error) fail('setStudyProject', error);

  await recordAudit({
    organizationId: (data as BlueprintStudy).organization_id,
    studyId,
    action: projectId ? 'ESTUDO_VINCULADO_A_OBRA' : 'ESTUDO_DESVINCULADO',
    targetType: 'PROJECT',
    targetId: projectId ?? undefined,
  });

  return data as BlueprintStudy;
}

/** Obras da organização, para o seletor de vínculo. Só id e nome. */
export async function listObrasDaOrganizacao(
  organizationId: string,
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true })
    .limit(500);

  if (error) fail('listObrasDaOrganizacao', error);
  return (data ?? []) as { id: string; name: string }[];
}

/**
 * As tarefas do cronograma da obra — o terceiro elo da ponte 4D.
 *
 * O cronograma mora em `projects.settings.schedule.itemSchedules`, e não em
 * tabela: é assim que o módulo de Planejamento o guarda. Lê-se só o que o 4D
 * precisa (id e datas), e não o cronograma inteiro — ele carrega baselines,
 * alocações e histórico, que aqui não têm uso e pesariam à toa.
 *
 * Lista vazia quando a obra não tem cronograma, o que é o caso comum: em
 * 06/09/2026, das obras do banco só quatro tinham.
 */
export async function tarefasDoCronograma(
  projectId: string,
): Promise<{ id: string; startDate?: string; endDate?: string; manualRealPct?: number }[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('settings')
    .eq('id', projectId)
    .single();

  if (error) fail('tarefasDoCronograma', error);

  const itens =
    ((data?.settings as { schedule?: { itemSchedules?: unknown[] } } | null)?.schedule
      ?.itemSchedules ?? []) as {
      id?: string;
      startDate?: string;
      endDate?: string;
      manualRealPct?: number;
    }[];

  return itens
    .filter((i): i is { id: string } & typeof i => typeof i.id === 'string')
    .map((i) => ({
      id: i.id,
      startDate: i.startDate,
      endDate: i.endDate,
      manualRealPct: i.manualRealPct,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Quantitativos
// ─────────────────────────────────────────────────────────────────────────────

const QTY_COLS =
  'id, snapshot_id, organization_id, policy_version, policy, kernel_version, payload, totais, computed_by, computed_at';

/**
 * Calcula e grava o quantitativo de uma versão PUBLICADA.
 *
 * Nunca de rascunho: número que o orçamento vai citar não pode vir de geometria
 * que ainda muda.
 *
 * Idempotente por (snapshot, versão da política), que é o que o CA-08 pede.
 * Recalcular com a mesma política devolve o registro existente em vez de criar
 * outro; trocar a política cria um NOVO, preservando o que o orçamento já citou.
 */
export async function computeAndStoreQuantities(
  snapshotId: string,
  policy: QuantityPolicy = POLITICA_PADRAO,
): Promise<BlueprintQuantitySnapshot> {
  const existente = await getQuantitySnapshot(snapshotId, policy.version);
  if (existente) return existente;

  const snapshot = await getSnapshot(snapshotId);
  if (!snapshot) throw new Error(`blueprint/quantities: snapshot ${snapshotId} não encontrado`);

  // Reconstrói o modelo a partir do payload canônico — o mesmo caminho que
  // `verifySnapshotIntegrity` usa. É o que torna o número reproduzível: ele não
  // depende do que estava na tela, e sim do que foi publicado.
  const model = modelFromCanonicalPayload(parseCanonicalPayload(JSON.stringify(snapshot.payload)));
  const quant = computeQuantities(model, policy, snapshot.kernel_version);

  const { data, error } = await supabase
    .from('blueprint_quantity_snapshots')
    .insert({
      snapshot_id: snapshotId,
      organization_id: snapshot.organization_id,
      policy_version: policy.version,
      policy,
      kernel_version: snapshot.kernel_version,
      payload: quant,
      totais: quant.totais,
    })
    .select(QTY_COLS)
    .single();

  // Corrida: outra aba pode ter gravado entre a consulta e o insert. A chave
  // única barra, e o certo é devolver o que existe — não falhar.
  if (error) {
    if (error.code === '23505') {
      const agora = await getQuantitySnapshot(snapshotId, policy.version);
      if (agora) return agora;
    }
    fail('computeAndStoreQuantities', error);
  }

  await recordAudit({
    organizationId: snapshot.organization_id,
    studyId: snapshot.study_id,
    action: 'QUANTITATIVO_GERADO',
    targetType: 'QUANTITY_SNAPSHOT',
    targetId: (data as BlueprintQuantitySnapshot).id,
    metadata: { snapshot_id: snapshotId, policy_version: policy.version },
  });

  return data as BlueprintQuantitySnapshot;
}

export async function getQuantitySnapshot(
  snapshotId: string,
  policyVersion: string,
): Promise<BlueprintQuantitySnapshot | null> {
  const { data, error } = await supabase
    .from('blueprint_quantity_snapshots')
    .select(QTY_COLS)
    .eq('snapshot_id', snapshotId)
    .eq('policy_version', policyVersion)
    .maybeSingle();

  if (error) fail('getQuantitySnapshot', error);
  return (data as BlueprintQuantitySnapshot) ?? null;
}

export async function listQuantitySnapshots(
  snapshotId: string,
): Promise<BlueprintQuantitySnapshot[]> {
  const { data, error } = await supabase
    .from('blueprint_quantity_snapshots')
    .select(QTY_COLS)
    .eq('snapshot_id', snapshotId)
    .order('computed_at', { ascending: false });

  if (error) fail('listQuantitySnapshots', error);
  return (data ?? []) as BlueprintQuantitySnapshot[];
}

/**
 * Recalcula e compara com o que está gravado (CA-08).
 *
 * É a prova de reprodutibilidade aplicada ao quantitativo, como
 * `verifySnapshotIntegrity` é para a geometria: se o kernel ou a política mudarem
 * de forma incompatível, o número diverge e isso aparece — em vez de virar
 * orçamento errado sem ninguém notar.
 */
export async function verifyQuantitySnapshot(
  snapshotId: string,
  policyVersion: string,
): Promise<{ ok: boolean; divergencias: string[] }> {
  const gravado = await getQuantitySnapshot(snapshotId, policyVersion);
  if (!gravado) throw new Error('blueprint/verifyQuantity: quantitativo não encontrado');

  const snapshot = await getSnapshot(snapshotId);
  if (!snapshot) throw new Error('blueprint/verifyQuantity: snapshot não encontrado');

  const model = modelFromCanonicalPayload(parseCanonicalPayload(JSON.stringify(snapshot.payload)));
  const recalculado = computeQuantities(
    model,
    gravado.policy as QuantityPolicy,
    snapshot.kernel_version,
  );

  // ⚠️ COMPARAÇÃO PROFUNDA, e não `!==`.
  //
  // `totais` não é só número: `porMaterial` e `porEsquadria` são ARRAYS. Com
  // `!==` a comparação cai em identidade de referência, dois arrays idênticos
  // saem "diferentes", e esta função passava a acusar divergência em TODO
  // snapshot — o oposto do que ela existe para fazer. O tipo mentia (`as
  // Record<string, number>`), então o compilador não tinha como avisar.
  //
  // Encontrado pelo E2E de integração em 06/09/2026, na primeira vez que ele
  // rodou. Nenhum teste de unidade o via: esta função só existe contra o banco.
  //
  // A serialização estável vem do kernel: `JSON.stringify` direto compararia
  // duas ordens de chave diferentes como conteúdo diferente.
  const antes = (gravado.totais ?? {}) as Record<string, unknown>;
  const depois = recalculado.totais as unknown as Record<string, unknown>;
  const divergencias: string[] = [];
  for (const chave of Object.keys(depois)) {
    const a = stableStringify(antes[chave] ?? null);
    const d = stableStringify(depois[chave] ?? null);
    if (a !== d) divergencias.push(`${chave}: gravado ${a}, recalculado ${d}`);
  }

  return { ok: divergencias.length === 0, divergencias };
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
