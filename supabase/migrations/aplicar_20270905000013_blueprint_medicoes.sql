-- ============================================================================
-- Planta Inteligente — formas medidas sobre a planta de fundo
-- Plano: docs/planos/2026-08-09-planta-de-fundo-calibrada.md (o item que ficou
--        de fora daquele passo, agora implementado)
--
-- DUAS VERDADES, EMPILHADAS, NUNCA MISTURADAS. O kernel DERIVA ambiente do
-- arranjo planar, e o contorno nunca é declarado pelo usuário — é esse
-- invariante que sustenta o hash, o diff e a conferência do quantitativo. Uma
-- forma traçada à mão é o oposto: é uma afirmação.
--
-- Por isso ela NÃO entra em `blueprint_objects` nem no payload canônico. Tabela
-- própria, e o resultado sai marcado como MEDIDO — contra DERIVADO. Quem revisa
-- o orçamento passa a ver quais números pode recalcular e quais dependem da mão
-- de alguém.
--
-- ⚠️ SEM FK PARA auth.users (ver aplicar_20270905000004).
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ. O SQL Editor roda o script inteiro como
--    UMA transação: um erro no meio desfaz os blocos anteriores.
-- ============================================================================

-- ═══ BLOCO 1 — tabela ═══════════════════════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_measurements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL,
    organization_id UUID NOT NULL,
    level_id        TEXT,

    tipo            TEXT NOT NULL CHECK (tipo IN ('POLIGONO', 'LINHA', 'PONTO')),
    -- Em MILÍMETRO DO MODELO, como todo o resto. Recalibrar a planta de fundo
    -- transforma estes pontos junto — senão o contorno que seguia uma parede
    -- passa a flutuar no vazio e o número medido vira ficção.
    pontos          JSONB NOT NULL,

    nome            TEXT NOT NULL DEFAULT '',
    -- Código no catálogo. Nulo = a forma mede, mas não chega ao orçamento.
    item_code       TEXT,
    cor             TEXT NOT NULL DEFAULT '#2563eb',

    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A FK para `blueprint_studies` fica no bloco 1B, sozinha. Criá-la junto com a
-- tabela deu `40P01 deadlock detected`: FK exige ShareRowExclusiveLock na tabela
-- REFERENCIADA, e `blueprint_studies` está quente enquanto alguém tem o editor
-- de plantas aberto no navegador. É a mesma família do deadlock com `auth.users`
-- (ver aplicar_20270905000004), com outra tabela no papel de quente.

-- ═══ BLOCO 1B — a chave estrangeira, sozinha ════════════════════════════════
--
-- O FK COMPOSTO `(study_id, organization_id)` é o que torna impossível, no nível
-- do schema, uma medição de outra organização — melhor que confiar em trigger.
-- Vale a espera.
--
-- ⚠️ FECHE A ABA DO EDITOR DE PLANTAS ANTES. Este bloco precisa de lock em
--    `blueprint_studies`, e o editor aberto a mantém em uso. Se der 40P01, o
--    `lock_timeout` aborta sem estragar nada — é só repetir com o app fechado.
SET lock_timeout = '5s';

ALTER TABLE public.blueprint_measurements
  DROP CONSTRAINT IF EXISTS blueprint_medicao_study_fk;

ALTER TABLE public.blueprint_measurements
  ADD CONSTRAINT blueprint_medicao_study_fk
  FOREIGN KEY (study_id, organization_id)
  REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE;

-- ═══ BLOCO 2 — índice e comentários ═════════════════════════════════════════
SET lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS idx_blueprint_medicao_study
    ON public.blueprint_measurements(study_id, level_id);

COMMENT ON TABLE public.blueprint_measurements IS
  'Formas traçadas À MÃO sobre a planta de fundo. NÃO são ambiente derivado: o '
  'contorno é afirmado, não calculado. A linha de orçamento que sai daqui vai '
  'marcada como MEDIDO, contra DERIVADO.';

COMMENT ON COLUMN public.blueprint_measurements.tipo IS
  'A UNIDADE VEM DAQUI: POLIGONO=m², LINHA=m, PONTO=un. Não há mapeamento livre '
  'de medida para item, logo não há como errar a unidade — ao contrário do '
  'de-para do RF-122, onde a trava precisa existir.';

-- ═══ BLOCO 3 — RLS ══════════════════════════════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.blueprint_measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_medicao_org_read" ON public.blueprint_measurements;
CREATE POLICY "blueprint_medicao_org_read" ON public.blueprint_measurements
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_medicao_org_insert" ON public.blueprint_measurements;
CREATE POLICY "blueprint_medicao_org_insert" ON public.blueprint_measurements
    FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_medicao_org_update" ON public.blueprint_measurements;
CREATE POLICY "blueprint_medicao_org_update" ON public.blueprint_measurements
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_medicao_org_delete" ON public.blueprint_measurements;
CREATE POLICY "blueprint_medicao_org_delete" ON public.blueprint_measurements
    FOR DELETE TO authenticated USING (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_measurements FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_measurements TO authenticated;

-- ═══ BLOCO 4 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: tabela=1, com_rls=1, policies=4, fk_estudo=1, fk_auth_users=0

SELECT
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='blueprint_measurements')            AS tabela,
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='blueprint_measurements'
      AND rowsecurity)                                                            AS com_rls,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='blueprint_measurements')             AS policies,
  (SELECT count(*) FROM pg_constraint
    WHERE conname='blueprint_medicao_study_fk')                                   AS fk_estudo,
  (SELECT count(*) FROM pg_constraint c
     JOIN pg_class t  ON t.oid = c.conrelid
     JOIN pg_class rt ON rt.oid = c.confrelid
     JOIN pg_namespace rn ON rn.oid = rt.relnamespace
    WHERE t.relname='blueprint_measurements'
      AND rt.relname='users' AND rn.nspname='auth')                               AS fk_auth_users;
