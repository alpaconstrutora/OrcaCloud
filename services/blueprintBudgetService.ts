// services/blueprintBudgetService.ts
//
// RF-122 — leva o quantitativo da planta para o orçamento da obra.
//
// A regra de ouro deste arquivo: ele NÃO decide número nenhum. O cálculo vive em
// `utils/blueprintBudget.ts`, que é puro e testável; aqui só há ida e volta ao
// banco. Foi assim que o erro que interessa (unidade incompatível) ficou coberto
// por teste sem precisar de rede.

import { supabase } from '../lib/supabase';
import { sinapiService } from './sinapiService';
import { getSnapshot, getStudy, recordAudit } from './blueprintService';
import {
  gerarLancamentos,
  prefixoDoEstudo,
  aplicarNoOrcamento,
  type ContextoGeracao,
  type MapeamentoOrcamento,
  type MapeamentoResolvido,
  type ResultadoGeracao,
} from '../utils/blueprintBudget';
import {
  POLITICA_PADRAO,
  computeQuantities,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  type QuantityPolicy,
} from '../utils/blueprintKernel';
import { garantirCaminhosNaWbs } from '../utils/wbsFromBudget';
import type { BudgetEntry, SinapiItem } from '../types/budget';
import type { ProjectSettings } from '../types';

const MAP_COLS =
  'id, organization_id, medida, item_code, phase, budget_group, agrupamento, filtro_ambiente, active, created_at, updated_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintBudget/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// De-para (configuração da organização)
// ─────────────────────────────────────────────────────────────────────────────

export async function listMappings(organizationId: string): Promise<MapeamentoOrcamento[]> {
  const { data, error } = await supabase
    .from('blueprint_budget_mappings')
    .select(MAP_COLS)
    .eq('organization_id', organizationId)
    .order('medida', { ascending: true });

  if (error) fail('listMappings', error);
  return (data ?? []) as MapeamentoOrcamento[];
}

export async function saveMapping(
  m: Omit<MapeamentoOrcamento, 'id'> & { id?: string },
): Promise<MapeamentoOrcamento> {
  const linha = {
    organization_id: m.organization_id,
    medida: m.medida,
    item_code: m.item_code.trim(),
    phase: m.phase ?? '',
    budget_group: m.budget_group ?? '',
    agrupamento: m.agrupamento,
    filtro_ambiente: m.filtro_ambiente ?? [],
    active: m.active,
    updated_at: new Date().toISOString(),
  };

  const query = m.id
    ? supabase.from('blueprint_budget_mappings').update(linha).eq('id', m.id)
    : supabase.from('blueprint_budget_mappings').insert(linha);

  const { data, error } = await query.select(MAP_COLS).single();
  if (error) fail('saveMapping', error);
  return data as MapeamentoOrcamento;
}

export async function deleteMapping(id: string): Promise<void> {
  const { error } = await supabase.from('blueprint_budget_mappings').delete().eq('id', id);
  if (error) fail('deleteMapping', error);
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolução dos itens no catálogo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve os códigos no catálogo — SINAPI e base própria, nessa ordem de busca
 * mas com a base própria VENCENDO.
 *
 * Não há decisão de "qual catálogo usar": é um espaço de códigos só, e
 * `custom_items` sobrepõe `sinapi_items` pelo mesmo código. É a mesma precedência
 * que a busca do orçamento já aplica; divergir dela faria o de-para orçar com um
 * preço que a tela do orçamento não mostra.
 *
 * Código que não existe em lugar nenhum volta ausente do mapa — e vira
 * divergência explícita na geração, nunca linha silenciosa.
 */
export async function resolverItens(codes: string[]): Promise<Map<string, SinapiItem>> {
  const unicos = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
  if (unicos.length === 0) return new Map();

  const mapa = new Map<string, SinapiItem>();

  const oficiais = await sinapiService.getItemsByCodes(unicos);
  for (const it of oficiais) mapa.set(it.code, it);

  // Base própria por último: sobrepõe o oficial, e cobre o código que só existe
  // nela (composição da casa, que o SINAPI não tem).
  const { data: proprios, error } = await supabase
    .from('custom_items')
    .select('code, description, unit, price, type, category, composition, database_id')
    .in('code', unicos);

  if (error) {
    // Falhar aqui não pode derrubar a geração: o resultado fica com o item
    // oficial, que é pior mas não é errado. Silêncio é que não serve.
    console.error('blueprintBudget/resolverItens: base própria indisponível', error.message);
  }

  for (const it of proprios ?? []) {
    mapa.set(it.code, {
      ...(it as unknown as SinapiItem),
      composition:
        typeof it.composition === 'string' ? JSON.parse(it.composition) : it.composition,
      source: 'Própria',
      isOverride: true,
    });
  }

  return mapa;
}

// ─────────────────────────────────────────────────────────────────────────────
// Geração
// ─────────────────────────────────────────────────────────────────────────────

export interface PreviaOrcamento extends ResultadoGeracao {
  contexto: ContextoGeracao;
  /** Quanto o conjunto gerado soma, com o preço vigente do catálogo. */
  totalEstimado: number;
}

/**
 * Calcula a prévia SEM gravar nada.
 *
 * Existe separada de propósito: mandar linha para o orçamento de uma obra é o
 * tipo de ação que não se desfaz com um clique, e ninguém deveria descobrir uma
 * divergência de unidade depois que ela já entrou.
 */
export async function preverLancamentos(
  snapshotId: string,
  policy: QuantityPolicy = POLITICA_PADRAO,
): Promise<PreviaOrcamento> {
  const snapshot = await getSnapshot(snapshotId);
  if (!snapshot) throw new Error(`blueprintBudget: snapshot ${snapshotId} não encontrado`);

  const study = await getStudy(snapshot.study_id);
  if (!study) throw new Error(`blueprintBudget: estudo ${snapshot.study_id} não encontrado`);

  // Mesmo caminho de `computeAndStoreQuantities`: o número vem do payload
  // publicado, não do que está na tela. Se viesse da tela, a linha de orçamento
  // não seria conferível contra a versão que ela cita.
  const model = modelFromCanonicalPayload(parseCanonicalPayload(JSON.stringify(snapshot.payload)));
  const quant = computeQuantities(model, policy, snapshot.kernel_version);

  const mapeamentos = await listMappings(snapshot.organization_id);
  const itens = await resolverItens(mapeamentos.map((m) => m.item_code));

  const resolvidos: MapeamentoResolvido[] = mapeamentos.map((m) => ({
    mapeamento: m,
    item: itens.get(m.item_code.trim()) ?? null,
  }));

  const contexto: ContextoGeracao = {
    studyId: study.id,
    studyName: study.name,
    snapshotId: snapshot.id,
    snapshotHash: snapshot.hash,
    revision: snapshot.revision,
  };

  const resultado = gerarLancamentos(quant, resolvidos, contexto);
  const totalEstimado = resultado.entries.reduce(
    (s, e) => s + e.quantity * (e.sinapiItem?.price ?? 0),
    0,
  );

  return { ...resultado, contexto, totalEstimado };
}

/**
 * Aplica as linhas no orçamento da obra.
 *
 * SUBSTITUI o que a mesma planta já tinha gerado, em vez de empilhar. Regerar
 * depois de publicar uma versão nova é a operação normal — se duplicasse, o
 * orçamento dobraria em silêncio a cada revisão.
 *
 * Lê e regrava `projects.budget` inteiro, que é como o resto do sistema trata
 * esse campo (ele é JSONB, não tabela). O risco de sobrescrever edição
 * concorrente existe e é o mesmo de qualquer tela de orçamento aberta em duas
 * abas; por isso a leitura acontece aqui dentro, o mais perto possível da
 * escrita, e não na montagem da prévia.
 */
export async function aplicarNoProjeto(
  projectId: string,
  novas: BudgetEntry[],
  ctx: ContextoGeracao,
): Promise<{ removidas: number; adicionadas: number; total: number }> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, organization_id, budget, settings')
    .eq('id', projectId)
    .single();

  if (error) fail('aplicarNoProjeto/leitura', error);

  const atual = (data?.budget ?? []) as BudgetEntry[];
  const { budget: aplicado, removidas, adicionadas } = aplicarNoOrcamento(atual, novas, ctx.studyId);

  // As linhas geradas aqui trazem `group`/`phase` do mapeamento e nenhuma subetapa —
  // caminhos que não existem na EAP do projeto. Sem registrá-los, o Orçamento Analítico
  // (que só renderiza o que está em `settings.wbs`) não mostra nenhuma delas e ainda as
  // denuncia como "itens fantasmas". Ver utils/wbsFromBudget.ts.
  const settingsAtuais = (data?.settings ?? {}) as ProjectSettings;
  const { wbs, budget } = garantirCaminhosNaWbs(settingsAtuais.wbs, aplicado);

  const { error: erroGravar } = await supabase
    .from('projects')
    .update({ budget, settings: { ...settingsAtuais, wbs } })
    .eq('id', projectId);

  if (erroGravar) fail('aplicarNoProjeto/gravacao', erroGravar);

  await recordAudit({
    organizationId: data!.organization_id,
    studyId: ctx.studyId,
    action: 'ORCAMENTO_ATUALIZADO',
    targetType: 'PROJECT',
    targetId: projectId,
    metadata: {
      snapshot_id: ctx.snapshotId,
      revision: ctx.revision,
      removidas,
      adicionadas,
    },
  });

  return { removidas, adicionadas, total: budget.length };
}

/** Quantas linhas do orçamento vieram desta planta. Para a UI avisar antes. */
export async function contarLinhasDaPlanta(
  projectId: string,
  studyId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('projects')
    .select('budget')
    .eq('id', projectId)
    .single();

  if (error) fail('contarLinhasDaPlanta', error);

  const prefixo = prefixoDoEstudo(studyId);
  return ((data?.budget ?? []) as BudgetEntry[]).filter((e) =>
    String(e.id).startsWith(prefixo),
  ).length;
}
