-- ============================================================================
-- O TÓPICO DE BCF IMPORTADO VIRA COMENTÁRIO DO ESTUDO
-- ============================================================================
--
-- Até aqui, importar um BCF era uma vista de uma vez só: quem abria via o que o
-- projetista respondeu e, ao fechar a tela, a resposta sumia. O ciclo de
-- coordenação não fechava na MEMÓRIA do projeto — só na cabeça de quem olhou.
--
-- ─── ⚠️ POR QUE UMA COLUNA, E NÃO SÓ INSERIR ─────────────────────────────────
--
-- Sem identidade do tópico, reimportar o mesmo arquivo criaria os comentários de
-- novo. E reimportar é o NORMAL numa coordenação: o projetista manda a rodada
-- 2 com os tópicos da rodada 1 dentro, respondidos. Sem esta coluna, cada
-- rodada duplicaria a discussão inteira, e em três rodadas ninguém mais
-- encontraria nada.
--
-- ─── ⚠️ O ÍNDICE NÃO É PARCIAL, E ISSO É DELIBERADO ──────────────────────────
--
-- A forma "natural" seria `... WHERE bcf_topic_guid IS NOT NULL`, para o índice
-- só cobrir o que veio de BCF. Ela quebra o upsert: o PostgREST emite
-- `ON CONFLICT (study_id, bcf_topic_guid)`, que NÃO casa com um índice PARCIAL,
-- e a escrita falha com **42P10 — "there is no unique or exclusion constraint
-- matching the ON CONFLICT specification"**. É um erro já pago neste sistema.
--
-- O índice cheio resolve sem custo: no PostgreSQL, NULL é DISTINTO de NULL num
-- índice único, então os milhares de comentários escritos à mão — todos com
-- `bcf_topic_guid` nulo — convivem sem restrição nenhuma. A unicidade só morde
-- onde o valor existe, que é exatamente onde ela é desejada.
-- ============================================================================

SET lock_timeout = '5s';

-- ── 1. A coluna ─────────────────────────────────────────────────────────────
ALTER TABLE public.blueprint_comments
  ADD COLUMN IF NOT EXISTS bcf_topic_guid TEXT;

COMMENT ON COLUMN public.blueprint_comments.bcf_topic_guid IS
  'GUID do tópico BCF que originou este comentário. NULL = escrito aqui dentro. '
  'É a identidade que torna a reimportação idempotente: a rodada seguinte de '
  'coordenação traz os tópicos antigos junto, e sem isto a discussão duplicaria.';

-- ── 2. A unicidade por estudo ───────────────────────────────────────────────
--
-- Por (study_id, guid) e não só pelo guid: o mesmo tópico pode chegar a dois
-- estudos diferentes — um projetista coordenando duas plantas do mesmo
-- empreendimento —, e ali são duas pendências, não uma.
CREATE UNIQUE INDEX IF NOT EXISTS blueprint_comments_bcf_topic_uk
  ON public.blueprint_comments (study_id, bcf_topic_guid);

-- ── 3. Busca pelo que veio de fora ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS blueprint_comments_bcf_origem_idx
  ON public.blueprint_comments (study_id)
  WHERE bcf_topic_guid IS NOT NULL;
