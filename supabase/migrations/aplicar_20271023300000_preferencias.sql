-- ============================================================================
-- Preferências da planta elétrica — tabela `public.preferencias` + RLS por escopo
-- (plano docs/planos/2026-10-22-preferencias-planta-eletrica.md, seção 1).
-- Aplicar à mão (`npx supabase db query --linked -f <este arquivo>`), nunca `supabase db push`.
-- Idempotente: pode rodar de novo sem efeito (IF NOT EXISTS / DROP POLICY IF EXISTS).
--
-- Uma linha = uma preferência (`chave` → `valor` jsonb) de um DONO, em um de três escopos:
--   USUARIO      como a pessoa vê a planta NA TELA (só dela);
--   ORGANIZACAO  padrão da prancha/PDF da empresa (a organização, não o grupo);
--   ESTUDO       ajuste da prancha de UMA planta (vale mais que o da empresa).
-- A escolha NÃO vai em `organizations.settings`: gravação na organização já foi desfeita
-- em silêncio por gatilho. Tabela própria, com RLS própria.
--
-- REGRA #7 — as duas perguntas, respondidas por escrito:
--
-- Pergunta 1 — "esta perna do OR sozinha basta para liberar a linha?"
--   Cada perna de cada policy é autossuficiente E amarrada ao próprio escopo: leva
--   `escopo = '<X>'` e a checagem do dono daquele escopo. Nenhuma perna depende de outra,
--   nenhuma é `true`, e nenhuma coluna de dono de OUTRO escopo conta (o CHECK obriga os
--   outros dois donos a serem NULL, e a perna ainda exige o escopo). Assim:
--     USUARIO      leitura e escrita:  user_id = auth.uid()
--     ORGANIZACAO  leitura:            is_org_member(organization_id)
--                  escrita:            is_org_manager(organization_id)  (owner/admin)
--     ESTUDO       leitura e escrita:  é membro da org DONA DO ESTUDO — a mesma regra de
--                  quem edita a planta (`blueprint_studies_org` = is_org_member). A org
--                  é lida em blueprint_studies; a linha de preferência não carrega org.
--   Linha ORGANIZACAO com `user_id` de outra pessoa não existe (CHECK), e uma perna
--   USUARIO nunca libera linha de escopo ORGANIZACAO/ESTUDO.
--
-- Pergunta 2 — "quem mais pode executar esta função?"
--   Esta migration NÃO cria função (nem SECURITY DEFINER, nem RPC): só tabela, índices e
--   policies, usando as funções que já existem (is_org_member, is_org_manager). Nada a
--   revogar de função. O GRANT da TABELA é só a `authenticated`; `anon` e PUBLIC não
--   recebem nada (REVOKE explícito abaixo), e a RLS vale por cima. `authenticated` fica só com
--   SELECT/INSERT/UPDATE/DELETE: TRUNCATE (ignora RLS), REFERENCES e TRIGGER são revogados
--   (tabela nova herda GRANT ALL por default privileges no Supabase).
-- ============================================================================

-- ── 1. Tabela ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.preferencias (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo          text        NOT NULL,
  user_id         uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid        REFERENCES public.organizations(id) ON DELETE CASCADE,
  study_id        uuid        REFERENCES public.blueprint_studies(id) ON DELETE CASCADE,
  chave           text        NOT NULL,
  valor           jsonb       NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid        DEFAULT auth.uid(),
  CONSTRAINT preferencias_escopo_valido
    CHECK (escopo IN ('USUARIO', 'ORGANIZACAO', 'ESTUDO')),
  -- Sanidade: a chave é do catálogo (prefixo `planta.`, curta) e o valor é um sim/não pequeno. Barra lixo
  -- (ou abuso) gravado por quem tem permissão de escrita, sem depender do cliente.
  CONSTRAINT preferencias_chave_sanidade
    CHECK (chave LIKE 'planta.%' AND length(chave) <= 100),
  CONSTRAINT preferencias_valor_sanidade
    CHECK (pg_column_size(valor) <= 1024),
  -- Exatamente o dono do escopo preenchido; os outros dois, nulos.
  CONSTRAINT preferencias_dono_do_escopo CHECK (
    (escopo = 'USUARIO'     AND user_id IS NOT NULL AND organization_id IS NULL     AND study_id IS NULL) OR
    (escopo = 'ORGANIZACAO' AND user_id IS NULL     AND organization_id IS NOT NULL AND study_id IS NULL) OR
    (escopo = 'ESTUDO'      AND user_id IS NULL     AND organization_id IS NULL     AND study_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.preferencias IS
  'Preferências por escopo: USUARIO (tela), ORGANIZACAO (padrão da prancha), ESTUDO (prancha de uma planta). Uma linha por (dono, chave).';
COMMENT ON COLUMN public.preferencias.user_id IS
  'Dono do escopo USUARIO (nulo nos demais). SEM default: o serviço envia o id (um default quebraria o CHECK nas linhas ORGANIZACAO/ESTUDO).';
COMMENT ON COLUMN public.preferencias.organization_id IS
  'Dono do escopo ORGANIZACAO (nulo nos demais).';
COMMENT ON COLUMN public.preferencias.study_id IS
  'Dono do escopo ESTUDO (nulo nos demais). Apagar o estudo apaga as linhas (ON DELETE CASCADE).';
COMMENT ON COLUMN public.preferencias.updated_by IS
  'Preenchida pelo CLIENTE (default auth.uid(), mas o upsert pode mandar outro valor). Informativa: NÃO serve de auditoria.';
COMMENT ON COLUMN public.preferencias.chave IS
  'Chave do catálogo (utils/preferencias/catalogo.ts). Chave desconhecida é ignorada na leitura.';

-- Banco de teste que já tenha criado a tabela com `DEFAULT auth.uid()` em user_id: o default
-- preencheria user_id nas linhas ORGANIZACAO/ESTUDO e quebraria o CHECK do dono. Inofensivo sem default.
ALTER TABLE public.preferencias ALTER COLUMN user_id DROP DEFAULT;

-- ── 2. Um valor por dono e chave ────────────────────────────────────────────
-- Índices únicos NÃO parciais, de propósito: o `onConflict` do supabase-js/PostgREST não usa
-- índice parcial. Como o CHECK deixa NULL as colunas dos outros escopos, e NULL nunca colide
-- em índice único, cada índice só vale de fato no escopo do seu dono. O DONO vem na frente da chave:
-- é por ele que a leitura filtra (`user_id = ...`, `organization_id = ...`, `study_id = ...`), então
-- o mesmo índice serve de busca. A ordem não importa ao `onConflict` do PostgREST.
CREATE UNIQUE INDEX IF NOT EXISTS preferencias_unica_usuario
  ON public.preferencias (user_id, escopo, chave);
CREATE UNIQUE INDEX IF NOT EXISTS preferencias_unica_organizacao
  ON public.preferencias (organization_id, escopo, chave);
CREATE UNIQUE INDEX IF NOT EXISTS preferencias_unica_estudo
  ON public.preferencias (study_id, escopo, chave);

-- ── 3. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.preferencias ENABLE ROW LEVEL SECURITY;

-- Leitura.
DROP POLICY IF EXISTS "preferencias_select" ON public.preferencias;
CREATE POLICY "preferencias_select" ON public.preferencias
  FOR SELECT TO authenticated
  USING (
    (escopo = 'USUARIO'     AND user_id = auth.uid())
    OR (escopo = 'ORGANIZACAO' AND public.is_org_member(organization_id))
    OR (escopo = 'ESTUDO'      AND EXISTS (
          SELECT 1 FROM public.blueprint_studies s
           WHERE s.id = preferencias.study_id
             AND public.is_org_member(s.organization_id)))
  );

-- Criação.
DROP POLICY IF EXISTS "preferencias_insert" ON public.preferencias;
CREATE POLICY "preferencias_insert" ON public.preferencias
  FOR INSERT TO authenticated
  WITH CHECK (
    (escopo = 'USUARIO'     AND user_id = auth.uid())
    OR (escopo = 'ORGANIZACAO' AND public.is_org_manager(organization_id))
    OR (escopo = 'ESTUDO'      AND EXISTS (
          SELECT 1 FROM public.blueprint_studies s
           WHERE s.id = preferencias.study_id
             AND public.is_org_member(s.organization_id)))
  );

-- Alteração: USING barra mexer em linha alheia; WITH CHECK barra "passar" a linha para outro dono/escopo.
DROP POLICY IF EXISTS "preferencias_update" ON public.preferencias;
CREATE POLICY "preferencias_update" ON public.preferencias
  FOR UPDATE TO authenticated
  USING (
    (escopo = 'USUARIO'     AND user_id = auth.uid())
    OR (escopo = 'ORGANIZACAO' AND public.is_org_manager(organization_id))
    OR (escopo = 'ESTUDO'      AND EXISTS (
          SELECT 1 FROM public.blueprint_studies s
           WHERE s.id = preferencias.study_id
             AND public.is_org_member(s.organization_id)))
  )
  WITH CHECK (
    (escopo = 'USUARIO'     AND user_id = auth.uid())
    OR (escopo = 'ORGANIZACAO' AND public.is_org_manager(organization_id))
    OR (escopo = 'ESTUDO'      AND EXISTS (
          SELECT 1 FROM public.blueprint_studies s
           WHERE s.id = preferencias.study_id
             AND public.is_org_member(s.organization_id)))
  );

-- Exclusão ("voltar ao padrão").
DROP POLICY IF EXISTS "preferencias_delete" ON public.preferencias;
CREATE POLICY "preferencias_delete" ON public.preferencias
  FOR DELETE TO authenticated
  USING (
    (escopo = 'USUARIO'     AND user_id = auth.uid())
    OR (escopo = 'ORGANIZACAO' AND public.is_org_manager(organization_id))
    OR (escopo = 'ESTUDO'      AND EXISTS (
          SELECT 1 FROM public.blueprint_studies s
           WHERE s.id = preferencias.study_id
             AND public.is_org_member(s.organization_id)))
  );

-- ── 4. Privilégios da tabela: só authenticated ──────────────────────────────
REVOKE ALL ON public.preferencias FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preferencias TO authenticated;
-- Tabela nova herda GRANT ALL no Supabase (default privileges): sem isto, authenticated ficaria com
-- TRUNCATE (que ignora RLS), REFERENCES e TRIGGER. Só os quatro privilégios de linha ficam.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.preferencias FROM authenticated;
