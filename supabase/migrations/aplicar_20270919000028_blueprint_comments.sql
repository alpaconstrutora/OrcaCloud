-- ==========================================================================
-- Planta Inteligente: COMENTARIOS ANCORADOS EM ELEMENTO (Etapa 5 do roadmap
-- BIM, RF-143).
--
-- --- Por que isto so e possivel AGORA -------------------------------------
--
-- Ate a Etapa 1 o id de cada elemento era reatribuido POR POSICAO a cada
-- publicacao: `modelFromCanonicalPayload` renumerava tudo. Um comentario
-- ancorado num id teria mudado de parede sozinho na revisao seguinte -- e sem
-- aviso, porque a parede nova tambem existe. O `element_uid` estavel (que vive
-- FORA do hash, em `blueprint_objects.element_uid`) e o que torna a ancora
-- honesta.
--
-- --- Por que o comentario aponta tambem para o SNAPSHOT --------------------
--
-- O uid diz QUAL elemento; o snapshot diz EM QUE REVISAO a pessoa estava
-- olhando. Sem ele, um comentario sobre uma parede que depois foi apagada vira
-- orfao silencioso -- some da tela sem que ninguem sabia que existia. Com ele,
-- a tela consegue dizer "este comentario e da revisao 7, e o elemento nao
-- existe mais na 9", que e informacao em vez de ausencia.
--
-- --- Por que o PONTO tambem, e nao so o uid --------------------------------
--
-- Nem todo comentario e sobre uma peca. "Falta cota nesta area" e sobre um
-- lugar. `ponto_x_mm`/`ponto_y_mm` guardam esse lugar; `element_uid` fica NULL.
-- Os dois juntos tambem servem: o uid ancora, e o ponto diz onde desenhar o
-- marcador quando o elemento e grande.
--
-- --- O que NAO entra ------------------------------------------------------
--
-- Nao ha `parent_id`: uma resposta a um comentario e um comentario com o mesmo
-- alvo, e uma arvore exigiria decidir profundidade, ordenacao e o que acontece
-- ao resolver o pai. Quando alguem precisar de thread, entra com o pedido que
-- a exige.
-- ==========================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS blueprint_comments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  study_id         UUID NOT NULL REFERENCES blueprint_studies(id) ON DELETE CASCADE,
  -- A revisao em que o comentario foi feito. ON DELETE SET NULL: apagar um
  -- snapshot antigo nao pode apagar a pendencia que alguem abriu nele.
  snapshot_id      UUID REFERENCES blueprint_snapshots(id) ON DELETE SET NULL,
  -- O elemento comentado. NULL = comentario de LUGAR, nao de peca.
  element_uid      TEXT,
  -- Onde desenhar o marcador, no plano do kernel (milimetro inteiro).
  ponto_x_mm       INTEGER,
  ponto_y_mm       INTEGER,
  -- Em que pavimento a pessoa estava. Sem isto o marcador aparece em todos.
  level_uid        TEXT,
  texto            TEXT NOT NULL CHECK (length(btrim(texto)) > 0),
  autor_email      TEXT,
  resolvido_em     TIMESTAMPTZ,
  resolvido_por    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Um comentario tem de dizer SOBRE O QUE ele e. Sem elemento e sem ponto,
  -- ele nao ancora em lugar nenhum e viraria uma nota solta na revisao.
  CONSTRAINT blueprint_comments_tem_ancora
    CHECK (element_uid IS NOT NULL OR (ponto_x_mm IS NOT NULL AND ponto_y_mm IS NOT NULL))
);

COMMENT ON TABLE blueprint_comments IS
  'Comentarios ancorados em elemento (element_uid) ou em ponto do plano, por estudo de planta. O snapshot diz em que revisao o comentario foi feito.';
COMMENT ON COLUMN blueprint_comments.element_uid IS
  'Identidade estavel do elemento (blueprint_objects.element_uid). NULL = comentario de lugar.';
COMMENT ON COLUMN blueprint_comments.snapshot_id IS
  'A revisao em que o comentario foi feito. SET NULL ao apagar o snapshot: a pendencia sobrevive a revisao.';

-- A lista da tela: por estudo, os abertos primeiro, os recentes no topo.
CREATE INDEX IF NOT EXISTS idx_blueprint_comments_estudo
  ON blueprint_comments (study_id, resolvido_em, created_at DESC);

-- O historico de UM elemento entre revisoes -- e a consulta que a ancora por
-- uid existe para permitir.
CREATE INDEX IF NOT EXISTS idx_blueprint_comments_elemento
  ON blueprint_comments (organization_id, element_uid)
  WHERE element_uid IS NOT NULL;

ALTER TABLE blueprint_comments ENABLE ROW LEVEL SECURITY;

-- RLS por organizacao, pelo mesmo caminho das demais tabelas blueprint_*:
-- pertencer a organizacao do registro. Sem isto a tabela nasceria legivel por
-- qualquer sessao autenticada de qualquer empresa.
DROP POLICY IF EXISTS blueprint_comments_select ON blueprint_comments;
CREATE POLICY blueprint_comments_select ON blueprint_comments
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS blueprint_comments_insert ON blueprint_comments;
CREATE POLICY blueprint_comments_insert ON blueprint_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS blueprint_comments_update ON blueprint_comments;
CREATE POLICY blueprint_comments_update ON blueprint_comments
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS blueprint_comments_delete ON blueprint_comments;
CREATE POLICY blueprint_comments_delete ON blueprint_comments
  FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );
