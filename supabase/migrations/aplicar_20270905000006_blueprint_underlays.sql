-- ============================================================================
-- Planta Inteligente — planta de fundo com escala calibrada
-- Plano: docs/planos/2026-08-09-planta-de-fundo-calibrada.md
--
-- É o Digitalizador por AÇÃO HUMANA: a imagem entra como fundo, o usuário afere
-- a escala em duas cotas conhecidas e traça as paredes por cima. O Spike C
-- provou que a extração automática esbarra num problema semântico (fechar vão
-- de porta não se resolve por proximidade nem por colinearidade); a base que
-- NÃO depende disso é esta.
--
-- ⚠️ SEM FK PARA auth.users (ver aplicar_20270905000004).
-- ⚠️ APLICAR À MÃO pelo SQL Editor, UM BLOCO POR VEZ.
-- ============================================================================

-- ═══ BLOCO 1 — tabela ═══════════════════════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_underlays (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL,
    organization_id UUID NOT NULL,

    -- Um fundo POR NÍVEL: térreo e pavimento tipo têm plantas diferentes.
    -- NULL vale para todos os níveis do estudo.
    level_id        TEXT,

    -- Arquivo em bucket PRIVADO; a exibição usa URL assinada.
    storage_path    TEXT NOT NULL,
    nome_arquivo    TEXT NOT NULL DEFAULT '',
    -- Prova QUAL documento estava sob o traçado. É o que permite,
    -- daqui a um ano, saber se a planta de referência ainda é a mesma.
    file_sha256     TEXT,
    -- Página do PDF que foi rasterizada. NULL para imagem.
    pdf_pagina      INTEGER,

    -- ── Posicionamento ──────────────────────────────────────────────────────
    origem_x_mm     DOUBLE PRECISION NOT NULL DEFAULT 0,
    origem_y_mm     DOUBLE PRECISION NOT NULL DEFAULT 0,
    mm_por_pixel    DOUBLE PRECISION NOT NULL DEFAULT 1,
    -- Miliradianos COM DECIMAIS. Arredondar para inteiro deixaria 0,5 mrad de
    -- resíduo, que desalinha 10 mm numa planta de 20 m.
    rotacao_mrad    DOUBLE PRECISION NOT NULL DEFAULT 0,

    -- ── A AFERIÇÃO, e não só o resultado dela ───────────────────────────────
    --
    -- Guardar apenas `mm_por_pixel` torna impossível conferir se a pessoa
    -- clicou na cota certa ou numa linha qualquer. Com os dois pontos e a
    -- distância declarada, outra pessoa reproduz a medição — mesma disciplina
    -- da fórmula que acompanha cada quantitativo.
    calib_p1_px     DOUBLE PRECISION,
    calib_p1_py     DOUBLE PRECISION,
    calib_p2_px     DOUBLE PRECISION,
    calib_p2_py     DOUBLE PRECISION,
    calib_distancia_mm DOUBLE PRECISION,
    calib_alinhado  BOOLEAN NOT NULL DEFAULT FALSE,

    opacidade       DOUBLE PRECISION NOT NULL DEFAULT 0.55
                    CHECK (opacidade >= 0 AND opacidade <= 1),

    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT blueprint_underlay_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE,

    -- Um fundo por nível. Trocar a planta do térreo substitui, não acumula.
    CONSTRAINT blueprint_underlay_unico UNIQUE (study_id, level_id)
);

-- ═══ BLOCO 2 — índice e comentários ═════════════════════════════════════════
SET lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS idx_blueprint_underlay_study
    ON public.blueprint_underlays(study_id);

COMMENT ON TABLE public.blueprint_underlays IS
  'Planta de fundo para traçado manual. NÃO entra no hash da versão: a versão é '
  'sobre geometria, o fundo é documento de referência. A ligação com a versão '
  'publicada fica em blueprint_snapshots.underlay_sha256.';

COMMENT ON COLUMN public.blueprint_underlays.calib_distancia_mm IS
  'A aferição guarda a ENTRADA (dois pontos + distância declarada), não só o '
  'mm_por_pixel resultante — sem ela ninguém confere se a cota certa foi clicada.';

-- ═══ BLOCO 3 — a ligação com a versão publicada ═════════════════════════════
-- O fundo fica FORA do hash, mas o snapshot registra qual documento estava
-- embaixo quando foi publicado. Assim a versão continua sendo identificada só
-- pela geometria (republicar o mesmo desenho segue idempotente) e ainda assim
-- se sabe, para sempre, sobre o que ela foi traçada.
SET lock_timeout = '5s';

ALTER TABLE public.blueprint_snapshots
  ADD COLUMN IF NOT EXISTS underlay_sha256 TEXT;

COMMENT ON COLUMN public.blueprint_snapshots.underlay_sha256 IS
  'sha256 da planta de fundo vigente na publicação. Fora do hash de propósito: '
  'trocar a imagem não pode criar versão nova com geometria idêntica.';

-- ═══ BLOCO 4 — RLS ══════════════════════════════════════════════════════════
-- Configuração do estudo, e portanto editável — ao contrário dos snapshots.
SET lock_timeout = '5s';

ALTER TABLE public.blueprint_underlays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_underlay_org_read" ON public.blueprint_underlays;
CREATE POLICY "blueprint_underlay_org_read" ON public.blueprint_underlays
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_underlay_org_insert" ON public.blueprint_underlays;
CREATE POLICY "blueprint_underlay_org_insert" ON public.blueprint_underlays
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_underlay_org_update" ON public.blueprint_underlays;
CREATE POLICY "blueprint_underlay_org_update" ON public.blueprint_underlays
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_underlay_org_delete" ON public.blueprint_underlays;
CREATE POLICY "blueprint_underlay_org_delete" ON public.blueprint_underlays
    FOR DELETE TO authenticated
    USING (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_underlays FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_underlays TO authenticated;

-- ═══ BLOCO 5 — bucket privado ═══════════════════════════════════════════════
-- Bucket NOVO, não o do elétrico: compartilhar amarraria os dois ciclos de vida.
SET lock_timeout = '5s';

INSERT INTO storage.buckets (id, name, public)
VALUES ('blueprint_underlays', 'blueprint_underlays', FALSE)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

DROP POLICY IF EXISTS "blueprint_underlay_obj_read" ON storage.objects;
CREATE POLICY "blueprint_underlay_obj_read" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'blueprint_underlays');

DROP POLICY IF EXISTS "blueprint_underlay_obj_write" ON storage.objects;
CREATE POLICY "blueprint_underlay_obj_write" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'blueprint_underlays');

DROP POLICY IF EXISTS "blueprint_underlay_obj_delete" ON storage.objects;
CREATE POLICY "blueprint_underlay_obj_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'blueprint_underlays');

-- ═══ BLOCO 6 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: tabela=1, com_rls=1, policies=4, coluna_snapshot=1, bucket_privado=1,
--           fk_auth_users=0

SELECT
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='blueprint_underlays')               AS tabela,
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='blueprint_underlays'
      AND rowsecurity)                                                            AS com_rls,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='blueprint_underlays')                AS policies,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='blueprint_snapshots'
      AND column_name='underlay_sha256')                                          AS coluna_snapshot,
  (SELECT count(*) FROM storage.buckets
    WHERE id='blueprint_underlays' AND public = FALSE)                            AS bucket_privado,
  (SELECT count(*) FROM pg_constraint c
     JOIN pg_class t  ON t.oid = c.conrelid
     JOIN pg_class rt ON rt.oid = c.confrelid
     JOIN pg_namespace rn ON rn.oid = rt.relnamespace
    WHERE t.relname='blueprint_underlays'
      AND rt.relname='users' AND rn.nspname='auth')                               AS fk_auth_users;
