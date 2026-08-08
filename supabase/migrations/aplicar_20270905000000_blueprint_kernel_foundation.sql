-- ============================================================================
-- Planta Inteligente — Épico E0: fundação de domínio
-- Plano: docs/planos/2026-08-08-e0-fundacao-blueprint.md
-- PRD:   docs/PRD_Tecnico_OPURA_Planta_Inteligente_v1.1.md (§15, §12.4, §9.1)
--
-- Persiste o kernel geométrico que os spikes A e B provaram: estudos, níveis,
-- ramos de trabalho, snapshots imutáveis e trilha de auditoria.
--
-- PREFIXO. `blueprint_*`, nunca `plan_*` — difere de `plant_*` (Planta AI v1, em
-- produção) por uma letra só, e isso é armadilha garantida em grep e em revisão.
-- Decisão DR-02 da reconciliação. Este módulo NÃO lê nem escreve em `plant_*`:
-- os dois modelos coexistem e nenhum dado é migrado (DR-01, PRD §24.5).
--
-- ⚠️ APLICAR À MÃO pelo SQL Editor. O histórico de schema_migrations está furado
--    desde 20270208* — NUNCA `supabase db push`.
-- ⚠️ Tabelas NOVAS, nenhuma quente: não pega lock em nada em uso.
-- ============================================================================

-- ─── 1. Estudo: a raiz de autorização ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.blueprint_studies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id      UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    name            TEXT NOT NULL CHECK (length(trim(name)) > 0),
    unit_system     TEXT NOT NULL DEFAULT 'METRIC' CHECK (unit_system IN ('METRIC')),
    status          TEXT NOT NULL DEFAULT 'RASCUNHO'
                      CHECK (status IN ('RASCUNHO','EM_EDICAO','PUBLICADO','ARQUIVADO')),
    created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Alvo do FK COMPOSTO dos filhos. É o que torna impossível, no nível do
    -- schema, um ramo de uma org pendurar num estudo de outra: não depende de
    -- trigger nem de disciplina da aplicação.
    CONSTRAINT blueprint_studies_id_org_key UNIQUE (id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_blueprint_studies_org
    ON public.blueprint_studies(organization_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_studies_project
    ON public.blueprint_studies(project_id) WHERE project_id IS NOT NULL;

COMMENT ON TABLE public.blueprint_studies IS
  'Raiz do módulo Planta Inteligente. Toda autorização desce daqui por FK composto '
  '(id, organization_id). Independente de plant_studies (Planta AI v1).';

-- ─── 2. Níveis ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.blueprint_levels (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id          UUID NOT NULL,
    organization_id   UUID NOT NULL,
    name              TEXT NOT NULL,
    -- Milímetros INTEIROS (PRD §9.2). Não é NUMERIC de propósito: o kernel só
    -- opera em inteiros, e aceitar decimal aqui abriria porta para um valor que
    -- ele não consegue representar de volta.
    elevation_mm      INTEGER NOT NULL,
    default_height_mm INTEGER NOT NULL CHECK (default_height_mm > 0),
    ordinal           INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT blueprint_levels_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE,
    CONSTRAINT blueprint_levels_study_ordinal_key UNIQUE (study_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_blueprint_levels_study ON public.blueprint_levels(study_id);

-- ─── 3. Ramo de trabalho: onde vive o rascunho ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.blueprint_branches (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id           UUID NOT NULL,
    organization_id    UUID NOT NULL,
    name               TEXT NOT NULL DEFAULT 'principal',
    parent_snapshot_id UUID,  -- FK adicionada depois de blueprint_snapshots existir
    -- Revisão da última publicação deste ramo. É o token de concorrência
    -- otimista do PRD §12.4: o cliente manda a revisão que leu e a publicação
    -- recusa se o ramo andou.
    base_revision      INTEGER NOT NULL DEFAULT 0,

    -- Rascunho: MUTÁVEL, e é o único ponto mutável do módulo. Não é fonte da
    -- verdade — é buffer de trabalho entre duas publicações. A verdade é o
    -- snapshot, imutável e com hash.
    draft_payload      JSONB,
    draft_kernel_version TEXT,
    draft_hash         TEXT,
    draft_saved_at     TIMESTAMPTZ,

    created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT blueprint_branches_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE,
    CONSTRAINT blueprint_branches_study_name_key UNIQUE (study_id, name),
    CONSTRAINT blueprint_branches_id_org_key UNIQUE (id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_blueprint_branches_study ON public.blueprint_branches(study_id);

COMMENT ON COLUMN public.blueprint_branches.draft_payload IS
  'Rascunho de autosave. Único JSONB mutável do módulo — buffer de trabalho, não '
  'fonte da verdade. Publicar congela o conteúdo num snapshot com hash.';

-- ─── 4. Snapshot: imutável, endereçável por hash ────────────────────────────

CREATE TABLE IF NOT EXISTS public.blueprint_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL,
    branch_id       UUID NOT NULL,
    organization_id UUID NOT NULL,
    revision        INTEGER NOT NULL,
    -- SHA-256 do payload canônico. Mesmo desenho + mesmo kernel = mesmo hash,
    -- em qualquer máquina (provado pelo Spike A).
    hash            TEXT NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
    kernel_version  TEXT NOT NULL,
    payload         JSONB NOT NULL,
    notes           TEXT,
    published_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    published_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT blueprint_snapshots_branch_fk
      FOREIGN KEY (branch_id, organization_id)
      REFERENCES public.blueprint_branches(id, organization_id) ON DELETE CASCADE,
    CONSTRAINT blueprint_snapshots_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE,
    CONSTRAINT blueprint_snapshots_branch_revision_key UNIQUE (branch_id, revision),
    CONSTRAINT blueprint_snapshots_id_org_key UNIQUE (id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_blueprint_snapshots_study
    ON public.blueprint_snapshots(study_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blueprint_snapshots_hash
    ON public.blueprint_snapshots(study_id, hash);

ALTER TABLE public.blueprint_branches
    DROP CONSTRAINT IF EXISTS blueprint_branches_parent_snapshot_fk;
ALTER TABLE public.blueprint_branches
    ADD CONSTRAINT blueprint_branches_parent_snapshot_fk
    FOREIGN KEY (parent_snapshot_id)
    REFERENCES public.blueprint_snapshots(id) ON DELETE SET NULL;

-- ─── 5. Objetos do snapshot: explodidos para consulta ───────────────────────
-- ADR-03 (persistência híbrida): o payload garante reconstituição determinística;
-- estas linhas existem para CONSULTAR sem desserializar o JSON inteiro (somar
-- área por nível, contar aberturas, achar ambiente por tamanho).
--
-- `object_index` é a posição na lista canônica, não um id: o payload não guarda
-- identificador nenhum, e a ordem canônica é função só da geometria — portanto
-- estável para o mesmo desenho.

CREATE TABLE IF NOT EXISTS public.blueprint_objects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id     UUID NOT NULL,
    organization_id UUID NOT NULL,
    object_type     TEXT NOT NULL CHECK (object_type IN ('WALL','OPENING','BOUNDARY','SPACE')),
    object_index    INTEGER NOT NULL,
    level_index     INTEGER,
    props           JSONB NOT NULL,
    area_mm2        BIGINT,       -- só SPACE
    length_mm       INTEGER,      -- só WALL

    CONSTRAINT blueprint_objects_snapshot_fk
      FOREIGN KEY (snapshot_id, organization_id)
      REFERENCES public.blueprint_snapshots(id, organization_id) ON DELETE CASCADE,
    CONSTRAINT blueprint_objects_unique UNIQUE (snapshot_id, object_type, object_index)
);

CREATE INDEX IF NOT EXISTS idx_blueprint_objects_snapshot
    ON public.blueprint_objects(snapshot_id, object_type);

-- ─── 6. Auditoria: append-only ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.blueprint_audit_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    study_id        UUID,
    actor           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,
    target_type     TEXT,
    target_id       UUID,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blueprint_audit_org_time
    ON public.blueprint_audit_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blueprint_audit_study
    ON public.blueprint_audit_events(study_id, created_at DESC) WHERE study_id IS NOT NULL;

-- ─── 7. Imutabilidade (PRD §9.1) ────────────────────────────────────────────
-- Uma versão publicada é imutável; correções geram nova versão. Sem isso a
-- promessa "mesmo hash = mesmo desenho" é só convenção, e um UPDATE distraído
-- transforma um snapshot já citado por orçamento noutro desenho.

CREATE OR REPLACE FUNCTION public.fn_blueprint_block_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
      'blueprint: % é imutável (tentativa de % em %). Publique uma nova versão.',
      TG_TABLE_NAME, TG_OP, COALESCE(OLD.id::text, '?')
      USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_blueprint_snapshots_immutable ON public.blueprint_snapshots;
CREATE TRIGGER trg_blueprint_snapshots_immutable
    BEFORE UPDATE OR DELETE ON public.blueprint_snapshots
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_block_mutation();

DROP TRIGGER IF EXISTS trg_blueprint_objects_immutable ON public.blueprint_objects;
CREATE TRIGGER trg_blueprint_objects_immutable
    BEFORE UPDATE ON public.blueprint_objects
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_block_mutation();

DROP TRIGGER IF EXISTS trg_blueprint_audit_immutable ON public.blueprint_audit_events;
CREATE TRIGGER trg_blueprint_audit_immutable
    BEFORE UPDATE OR DELETE ON public.blueprint_audit_events
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_block_mutation();

-- DELETE em blueprint_objects fica LIBERADO de propósito: o CASCADE do snapshot
-- precisa poder limpar. O snapshot em si é que não some.

-- ─── 8. updated_at ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_blueprint_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_blueprint_studies_updated ON public.blueprint_studies;
CREATE TRIGGER trg_blueprint_studies_updated BEFORE UPDATE ON public.blueprint_studies
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

DROP TRIGGER IF EXISTS trg_blueprint_levels_updated ON public.blueprint_levels;
CREATE TRIGGER trg_blueprint_levels_updated BEFORE UPDATE ON public.blueprint_levels
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

DROP TRIGGER IF EXISTS trg_blueprint_branches_updated ON public.blueprint_branches;
CREATE TRIGGER trg_blueprint_branches_updated BEFORE UPDATE ON public.blueprint_branches
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

-- ─── 9. RLS ─────────────────────────────────────────────────────────────────
-- Camada AUTHENTICATED explícita: `GRANT authenticated` sozinho não impede anon.
-- `is_org_member` já resolve user_id com fallback por e-mail para linhas legadas.

ALTER TABLE public.blueprint_studies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprint_levels       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprint_branches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprint_snapshots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprint_objects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprint_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_studies_org" ON public.blueprint_studies;
CREATE POLICY "blueprint_studies_org" ON public.blueprint_studies
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_levels_org" ON public.blueprint_levels;
CREATE POLICY "blueprint_levels_org" ON public.blueprint_levels
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_branches_org" ON public.blueprint_branches;
CREATE POLICY "blueprint_branches_org" ON public.blueprint_branches
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

-- Snapshot: leitura e criação pela org; UPDATE/DELETE já morrem no trigger, mas
-- a policy declara a intenção em vez de depender só dele.
DROP POLICY IF EXISTS "blueprint_snapshots_org_read" ON public.blueprint_snapshots;
CREATE POLICY "blueprint_snapshots_org_read" ON public.blueprint_snapshots
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_snapshots_org_insert" ON public.blueprint_snapshots;
CREATE POLICY "blueprint_snapshots_org_insert" ON public.blueprint_snapshots
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_objects_org_read" ON public.blueprint_objects;
CREATE POLICY "blueprint_objects_org_read" ON public.blueprint_objects
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_objects_org_insert" ON public.blueprint_objects;
CREATE POLICY "blueprint_objects_org_insert" ON public.blueprint_objects
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_audit_org_read" ON public.blueprint_audit_events;
CREATE POLICY "blueprint_audit_org_read" ON public.blueprint_audit_events
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_audit_org_insert" ON public.blueprint_audit_events;
CREATE POLICY "blueprint_audit_org_insert" ON public.blueprint_audit_events
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_studies      FROM anon;
REVOKE ALL ON public.blueprint_levels       FROM anon;
REVOKE ALL ON public.blueprint_branches     FROM anon;
REVOKE ALL ON public.blueprint_snapshots    FROM anon;
REVOKE ALL ON public.blueprint_objects      FROM anon;
REVOKE ALL ON public.blueprint_audit_events FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_studies  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_levels   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_branches TO authenticated;
GRANT SELECT, INSERT                 ON public.blueprint_snapshots    TO authenticated;
GRANT SELECT, INSERT                 ON public.blueprint_objects      TO authenticated;
GRANT SELECT, INSERT                 ON public.blueprint_audit_events TO authenticated;

-- ─── 10. Publicação atômica ─────────────────────────────────────────────────
-- Snapshot + objetos + auditoria + avanço do ramo numa transação só (PRD CA-07).
--
-- SECURITY INVOKER: a RLS das tabelas vale para o chamador — quem não é membro
-- da org não publica. Nomes com prefixo p_ para não colidir com coluna homônima
-- (plpgsql resolve identificador ambíguo como erro 42702).

CREATE OR REPLACE FUNCTION public.fn_blueprint_publish_snapshot(
    p_branch_id      UUID,
    p_base_revision  INTEGER,
    p_hash           TEXT,
    p_kernel_version TEXT,
    p_payload        JSONB,
    p_notes          TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_study_id     UUID;
    v_org_id       UUID;
    v_current_rev  INTEGER;
    v_next_rev     INTEGER;
    v_snapshot_id  UUID;
    v_existing     UUID;
    v_item         JSONB;
    v_idx          INTEGER;
BEGIN
    -- FOR UPDATE serializa publicações concorrentes no mesmo ramo.
    SELECT b.study_id, b.organization_id, b.base_revision
      INTO v_study_id, v_org_id, v_current_rev
      FROM public.blueprint_branches b
     WHERE b.id = p_branch_id
       FOR UPDATE;

    IF v_study_id IS NULL THEN
        RAISE EXCEPTION 'blueprint: ramo % não encontrado', p_branch_id
          USING ERRCODE = 'no_data_found';
    END IF;

    -- Idempotência (PRD CA-07): republicar o MESMO conteúdo sobre a MESMA
    -- revisão devolve o snapshot que já existe, sem criar duplicata. É o que
    -- deixa o cliente reenviar depois de queda de rede sem medo.
    SELECT s.id INTO v_existing
      FROM public.blueprint_snapshots s
     WHERE s.branch_id = p_branch_id
       AND s.revision  = v_current_rev
       AND s.hash      = p_hash;

    IF v_existing IS NOT NULL THEN
        RETURN v_existing;
    END IF;

    -- Concorrência otimista (PRD §12.4 / CA-05): recusa em vez de sobrescrever.
    IF p_base_revision IS DISTINCT FROM v_current_rev THEN
        RAISE EXCEPTION
          'blueprint: revisão desatualizada (enviou %, ramo está em %)',
          p_base_revision, v_current_rev
          USING ERRCODE = 'serialization_failure';
    END IF;

    v_next_rev := v_current_rev + 1;

    INSERT INTO public.blueprint_snapshots (
        study_id, branch_id, organization_id, revision,
        hash, kernel_version, payload, notes, published_by
    ) VALUES (
        v_study_id, p_branch_id, v_org_id, v_next_rev,
        p_hash, p_kernel_version, p_payload, p_notes, auth.uid()
    )
    RETURNING id INTO v_snapshot_id;

    -- Explodir o payload para consulta. `ordinality` dá o índice canônico
    -- (1-based no SQL, normalizado para 0-based).
    FOR v_item, v_idx IN
        SELECT value, ord - 1 FROM jsonb_array_elements(COALESCE(p_payload->'walls','[]'::jsonb))
          WITH ORDINALITY AS t(value, ord)
    LOOP
        INSERT INTO public.blueprint_objects
            (snapshot_id, organization_id, object_type, object_index, level_index, props, length_mm)
        VALUES (
            v_snapshot_id, v_org_id, 'WALL', v_idx, (v_item->>'level')::INTEGER, v_item,
            ROUND(sqrt(
                power((v_item->'b'->>'x')::NUMERIC - (v_item->'a'->>'x')::NUMERIC, 2) +
                power((v_item->'b'->>'y')::NUMERIC - (v_item->'a'->>'y')::NUMERIC, 2)
            ))::INTEGER
        );
    END LOOP;

    FOR v_item, v_idx IN
        SELECT value, ord - 1 FROM jsonb_array_elements(COALESCE(p_payload->'openings','[]'::jsonb))
          WITH ORDINALITY AS t(value, ord)
    LOOP
        INSERT INTO public.blueprint_objects
            (snapshot_id, organization_id, object_type, object_index, props)
        VALUES (v_snapshot_id, v_org_id, 'OPENING', v_idx, v_item);
    END LOOP;

    FOR v_item, v_idx IN
        SELECT value, ord - 1 FROM jsonb_array_elements(COALESCE(p_payload->'boundaries','[]'::jsonb))
          WITH ORDINALITY AS t(value, ord)
    LOOP
        INSERT INTO public.blueprint_objects
            (snapshot_id, organization_id, object_type, object_index, level_index, props)
        VALUES (v_snapshot_id, v_org_id, 'BOUNDARY', v_idx, (v_item->>'level')::INTEGER, v_item);
    END LOOP;

    FOR v_item, v_idx IN
        SELECT value, ord - 1 FROM jsonb_array_elements(COALESCE(p_payload->'spaces','[]'::jsonb))
          WITH ORDINALITY AS t(value, ord)
    LOOP
        INSERT INTO public.blueprint_objects
            (snapshot_id, organization_id, object_type, object_index, level_index, props, area_mm2)
        VALUES (
            v_snapshot_id, v_org_id, 'SPACE', v_idx, (v_item->>'level')::INTEGER, v_item,
            (v_item->>'areaMm2')::BIGINT
        );
    END LOOP;

    -- O ramo avança e o rascunho é descartado: ele já virou snapshot.
    UPDATE public.blueprint_branches
       SET base_revision        = v_next_rev,
           parent_snapshot_id   = v_snapshot_id,
           draft_payload        = NULL,
           draft_hash           = NULL,
           draft_kernel_version = NULL,
           draft_saved_at       = NULL
     WHERE id = p_branch_id;

    UPDATE public.blueprint_studies
       SET status = 'PUBLICADO'
     WHERE id = v_study_id AND status <> 'ARQUIVADO';

    INSERT INTO public.blueprint_audit_events
        (organization_id, study_id, actor, action, target_type, target_id, metadata)
    VALUES (
        v_org_id, v_study_id, auth.uid(), 'SNAPSHOT_PUBLICADO', 'SNAPSHOT', v_snapshot_id,
        jsonb_build_object(
            'revision', v_next_rev, 'hash', p_hash, 'kernel_version', p_kernel_version
        )
    );

    RETURN v_snapshot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_blueprint_publish_snapshot(UUID, INTEGER, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_blueprint_publish_snapshot(UUID, INTEGER, TEXT, TEXT, JSONB, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_blueprint_publish_snapshot(UUID, INTEGER, TEXT, TEXT, JSONB, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_blueprint_publish_snapshot IS
  'Publica um snapshot imutável: grava payload, explode objetos, avança o ramo, '
  'limpa o rascunho e registra auditoria — tudo numa transação. Idempotente por '
  '(ramo, revisão, hash); recusa revisão desatualizada com serialization_failure.';
