// services/blueprintCommentService.ts
//
// Comentários ancorados em elemento da Planta Inteligente (Etapa 5, RF-143).
//
// ─── A ÂNCORA É O `element_uid` ──────────────────────────────────────────────
//
// Até a Etapa 1 o id de cada elemento era reatribuído POR POSIÇÃO a cada
// publicação. Um comentário ancorado num id teria mudado de parede sozinho na
// revisão seguinte — e sem aviso, porque a parede nova também existe. O `uid`
// estável é o que torna a âncora honesta, e é por isso que esta feature só
// pôde nascer depois daquela.
//
// ─── E O SNAPSHOT DIZ EM QUE REVISÃO ────────────────────────────────────────
//
// O uid diz QUAL elemento; o snapshot, em que revisão a pessoa estava olhando.
// Sem ele, um comentário sobre uma parede que depois foi apagada some da tela
// sem que ninguém saiba que existiu. Com ele, dá para dizer "isto é da revisão
// 7, e o elemento não existe mais na 9" — que é informação, e não ausência.

import { supabase } from '../lib/supabase';

export interface BlueprintComment {
  id: string;
  organization_id: string;
  study_id: string;
  snapshot_id: string | null;
  /** Identidade estável do elemento. `null` = comentário de LUGAR. */
  element_uid: string | null;
  ponto_x_mm: number | null;
  ponto_y_mm: number | null;
  level_uid: string | null;
  texto: string;
  autor_email: string | null;
  resolvido_em: string | null;
  resolvido_por: string | null;
  created_at: string;
  /** GUID do tópico BCF de origem. `null` = escrito aqui dentro. */
  bcf_topic_guid: string | null;
}

export interface NovoComentario {
  organizationId: string;
  studyId: string;
  snapshotId?: string | null;
  elementUid?: string | null;
  pontoXMm?: number | null;
  pontoYMm?: number | null;
  levelUid?: string | null;
  texto: string;
}

/**
 * Um comentário tem de dizer SOBRE O QUE ele é.
 *
 * A mesma regra está no `CHECK` da tabela, e existe nos dois lugares de
 * propósito: aqui para a tela poder recusar antes de ir ao banco, e lá para o
 * banco não depender de nenhuma tela ter feito a conta.
 */
export function ancoraValida(c: NovoComentario): boolean {
  if (c.elementUid) return true;
  return Number.isFinite(c.pontoXMm ?? NaN) && Number.isFinite(c.pontoYMm ?? NaN);
}

const COLUNAS =
  'id, organization_id, study_id, snapshot_id, element_uid, ponto_x_mm, ponto_y_mm, level_uid, texto, autor_email, resolvido_em, resolvido_por, created_at, bcf_topic_guid';

/**
 * Os comentários de um estudo, abertos primeiro.
 *
 * ⚠️ Sem `select('*')`: a lista é lida a cada abertura do painel, e trazer
 * coluna que ninguém usa é tráfego que só cresce.
 */
export async function listarComentarios(studyId: string): Promise<BlueprintComment[]> {
  const { data, error } = await supabase
    .from('blueprint_comments')
    .select(COLUNAS)
    .eq('study_id', studyId)
    // Abertos no topo, e dentro de cada grupo o mais recente primeiro: quem
    // abre o painel quer ver o que falta resolver, não o histórico.
    .order('resolvido_em', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BlueprintComment[];
}

/** O histórico de UM elemento, atravessando revisões. */
export async function listarPorElemento(
  organizationId: string,
  elementUid: string,
): Promise<BlueprintComment[]> {
  const { data, error } = await supabase
    .from('blueprint_comments')
    .select(COLUNAS)
    .eq('organization_id', organizationId)
    .eq('element_uid', elementUid)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BlueprintComment[];
}

export async function criarComentario(c: NovoComentario): Promise<BlueprintComment> {
  if (!ancoraValida(c)) {
    throw new Error('O comentário precisa apontar para um elemento ou para um ponto do desenho.');
  }
  const texto = c.texto.trim();
  if (!texto) throw new Error('O comentário está vazio.');

  const { data: sessao } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('blueprint_comments')
    .insert({
      organization_id: c.organizationId,
      study_id: c.studyId,
      snapshot_id: c.snapshotId ?? null,
      element_uid: c.elementUid ?? null,
      ponto_x_mm: c.pontoXMm ?? null,
      ponto_y_mm: c.pontoYMm ?? null,
      level_uid: c.levelUid ?? null,
      texto,
      autor_email: sessao?.user?.email ?? null,
    })
    .select(COLUNAS)
    .single();
  if (error) throw error;
  return data as BlueprintComment;
}

/**
 * Marca como resolvido, ou desfaz.
 *
 * Resolver não APAGA: a pendência e a decisão de fechá-la são as duas metades
 * do registro, e um comentário apagado leva a discussão junto.
 */
export async function resolverComentario(
  id: string,
  resolvido: boolean,
): Promise<BlueprintComment> {
  const { data: sessao } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('blueprint_comments')
    .update({
      resolvido_em: resolvido ? new Date().toISOString() : null,
      resolvido_por: resolvido ? (sessao?.user?.email ?? null) : null,
    })
    .eq('id', id)
    .select(COLUNAS)
    .single();
  if (error) throw error;
  return data as BlueprintComment;
}

export async function apagarComentario(id: string): Promise<void> {
  const { error } = await supabase.from('blueprint_comments').delete().eq('id', id);
  if (error) throw error;
}

/** Um tópico de BCF pronto para virar comentário deste estudo. */
export interface TopicoParaGuardar {
  bcfTopicGuid: string;
  texto: string;
  autorEmail: string | null;
  elementUid: string | null;
  pontoXMm: number | null;
  pontoYMm: number | null;
  /** Fechado do outro lado vira comentário RESOLVIDO aqui. */
  resolvido: boolean;
}

/**
 * Guarda os tópicos importados de um BCF como comentários do estudo.
 *
 * ─── ⚠️ REIMPORTAR É O NORMAL, E É O QUE ESTA FUNÇÃO PROTEGE ────────────────
 *
 * A rodada 2 de uma coordenação traz os tópicos da rodada 1 dentro, agora
 * respondidos. Sem identidade, cada rodada duplicaria a discussão inteira — e
 * em três rodadas ninguém mais acharia nada. O `upsert` por
 * `(study_id, bcf_topic_guid)` faz o segundo envio ATUALIZAR em vez de somar.
 *
 * ⚠️ O índice é CHEIO, e não parcial: `ON CONFLICT` não casa com índice parcial
 * e falharia com 42P10. Ver a migration.
 *
 * ─── ⚠️ O QUE ELE NÃO SOBRESCREVE ───────────────────────────────────────────
 *
 * `resolvido_em` só é MARCADO, nunca apagado. Se o tópico voltou aberto e
 * alguém aqui já o resolveu, quem decidiu foi quem está mais perto do desenho —
 * e desfazer isso porque o arquivo do projetista está desatualizado apagaria uma
 * decisão nossa em silêncio.
 */
export async function guardarTopicosDoBcf(
  organizationId: string,
  studyId: string,
  topicos: TopicoParaGuardar[],
): Promise<number> {
  if (topicos.length === 0) return 0;
  const { data: sessao } = await supabase.auth.getUser();
  const agora = new Date().toISOString();

  const linhas = topicos.map((t) => ({
    organization_id: organizationId,
    study_id: studyId,
    bcf_topic_guid: t.bcfTopicGuid,
    element_uid: t.elementUid,
    // ⚠️ Ponto de RESERVA: o comentário exige âncora — elemento OU ponto. Um
    // tópico que não casou com peça nenhuma ainda precisa existir, senão a
    // pendência sobre a parede que sumiu seria a única que não se guarda.
    ponto_x_mm: t.elementUid ? null : (t.pontoXMm ?? 0),
    ponto_y_mm: t.elementUid ? null : (t.pontoYMm ?? 0),
    texto: t.texto,
    autor_email: t.autorEmail ?? sessao?.user?.email ?? null,
    ...(t.resolvido ? { resolvido_em: agora, resolvido_por: 'BCF' } : {}),
  }));

  const { error } = await supabase
    .from('blueprint_comments')
    .upsert(linhas, { onConflict: 'study_id,bcf_topic_guid' });
  if (error) throw error;
  return linhas.length;
}
