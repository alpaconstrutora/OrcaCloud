-- ============================================================
-- Academia ÒPURA — Etapa 1, passo 2
-- Núcleo de conteúdo versionado: versões, módulos, aulas, materiais.
--
-- FK apenas contra tabelas FRIAS (training_courses e as academy_* entre si).
-- NUNCA contra employees/projects/organizations: REFERENCES nessas pega
-- ShareRowExclusiveLock e deadlocka (40P01) contra o app em produção.
-- ============================================================

SET lock_timeout = '3s';

-- ── 1. VERSÕES — a espinha do versionamento ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.academy_course_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL,
    course_id       UUID NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
    versao          INTEGER NOT NULL DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'RASCUNHO'
                        CHECK (status IN ('RASCUNHO','PUBLICADA','ARQUIVADA')),
    titulo_versao   TEXT,                 -- "Revisão NR-35 2026"
    notas_versao    TEXT,                 -- o que mudou; aparece na reciclagem
    carga_horaria_ead       NUMERIC(6,1) NOT NULL DEFAULT 0,
    validade_meses_override INTEGER,      -- NULL = herda de training_courses

    -- ── Critérios de conclusão, CONGELADOS na versão ──────────────────
    -- Mudar "nota mínima 7 → 8" não pode invalidar retroativamente quem já
    -- passou sob a regra antiga. Por isso a regra mora na versão, não no curso.
    regra_percentual_minimo INTEGER NOT NULL DEFAULT 90
                                CHECK (regra_percentual_minimo BETWEEN 0 AND 100),
    regra_nota_minima       NUMERIC(5,2),          -- NULL = sem avaliação obrigatória
    regra_exige_aceite      BOOLEAN NOT NULL DEFAULT FALSE,
    regra_texto_aceite      TEXT,
    regra_ordem_obrigatoria BOOLEAN NOT NULL DEFAULT TRUE,  -- aula N só abre com N-1 concluída
    regra_tentativas_max    INTEGER NOT NULL DEFAULT 3 CHECK (regra_tentativas_max > 0),

    -- Publicar esta versão obriga quem concluiu a anterior a reciclar.
    exige_reciclagem     BOOLEAN NOT NULL DEFAULT TRUE,
    -- TRUE = matrícula em andamento na versão antiga é cancelada e recriada
    -- na nova. É o certo para NR: não faz sentido concluir conteúdo revogado.
    migrar_em_andamento  BOOLEAN NOT NULL DEFAULT TRUE,

    publicada_em    TIMESTAMPTZ,
    publicada_por   UUID,
    arquivada_em    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (course_id, versao)
);

-- Garante UMA e SÓ UMA versão vigente por treinamento.
CREATE UNIQUE INDEX IF NOT EXISTS uq_academy_version_publicada
    ON public.academy_course_versions(course_id)
    WHERE status = 'PUBLICADA';

-- Idem para o rascunho: no máximo um em aberto por curso.
CREATE UNIQUE INDEX IF NOT EXISTS uq_academy_version_rascunho
    ON public.academy_course_versions(course_id)
    WHERE status = 'RASCUNHO';

CREATE INDEX IF NOT EXISTS idx_academy_versions_org
    ON public.academy_course_versions(org_id, status);

-- ── 2. MÓDULOS ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.academy_modules (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL,
    version_id  UUID NOT NULL REFERENCES public.academy_course_versions(id) ON DELETE CASCADE,
    titulo      TEXT NOT NULL,
    descricao   TEXT,
    ordem       INTEGER NOT NULL DEFAULT 0,
    obrigatorio BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academy_modules_version
    ON public.academy_modules(version_id, ordem);

-- ── 3. AULAS ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.academy_lessons (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL,
    module_id   UUID NOT NULL REFERENCES public.academy_modules(id) ON DELETE CASCADE,
    -- Denormalizado de propósito: o RPC do portal monta a árvore inteira
    -- sem precisar de dois joins por aula.
    version_id  UUID NOT NULL REFERENCES public.academy_course_versions(id) ON DELETE CASCADE,
    titulo      TEXT NOT NULL,
    descricao   TEXT,
    ordem       INTEGER NOT NULL DEFAULT 0,
    tipo        TEXT NOT NULL
                    CHECK (tipo IN ('VIDEO_UPLOAD','VIDEO_LINK','PDF','AUDIO','IMAGEM','TEXTO')),

    storage_path  TEXT,   -- VIDEO_UPLOAD/PDF/AUDIO/IMAGEM — PATH, NUNCA URL
    video_url     TEXT,   -- VIDEO_LINK (YouTube/Vimeo embed)
    conteudo_html TEXT,   -- TEXTO

    duracao_segundos      INTEGER,  -- vídeo/áudio: base do % assistido
    tempo_minimo_segundos INTEGER,  -- piso para PDF/TEXTO/IMAGEM (sem duração intrínseca)
    percentual_minimo_override INTEGER
                    CHECK (percentual_minimo_override BETWEEN 0 AND 100),
    obrigatoria           BOOLEAN NOT NULL DEFAULT TRUE,
    -- FALSE = seek para frente NÃO credita progresso. É o que operacionaliza
    -- "vídeo aberto ≠ treinamento realizado" no nível da aula.
    permite_avanco_rapido BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT academy_lesson_fonte_chk CHECK (
           (tipo = 'VIDEO_UPLOAD' AND storage_path  IS NOT NULL)
        OR (tipo = 'VIDEO_LINK'   AND video_url     IS NOT NULL)
        OR (tipo = 'TEXTO'        AND conteudo_html IS NOT NULL)
        OR (tipo IN ('PDF','AUDIO','IMAGEM') AND storage_path IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_academy_lessons_module
    ON public.academy_lessons(module_id, ordem);
CREATE INDEX IF NOT EXISTS idx_academy_lessons_version
    ON public.academy_lessons(version_id, ordem);

-- ── 4. MATERIAIS COMPLEMENTARES ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.academy_materials (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL,
    version_id  UUID NOT NULL REFERENCES public.academy_course_versions(id) ON DELETE CASCADE,
    -- Escopo variável: material do curso (ambos NULL), do módulo, ou da aula.
    module_id   UUID REFERENCES public.academy_modules(id) ON DELETE CASCADE,
    lesson_id   UUID REFERENCES public.academy_lessons(id) ON DELETE CASCADE,
    titulo      TEXT NOT NULL,
    tipo        TEXT NOT NULL DEFAULT 'ARQUIVO' CHECK (tipo IN ('ARQUIVO','LINK')),
    storage_path TEXT,
    url          TEXT,
    mime_type    TEXT,
    tamanho_bytes BIGINT,
    ordem        INTEGER NOT NULL DEFAULT 0,
    -- Entra no cálculo de conclusão; gera evento DOWNLOAD_MATERIAL no log.
    exige_download BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT academy_material_fonte_chk CHECK (
           (tipo = 'ARQUIVO' AND storage_path IS NOT NULL)
        OR (tipo = 'LINK'    AND url          IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_academy_materials_version ON public.academy_materials(version_id);
CREATE INDEX IF NOT EXISTS idx_academy_materials_lesson  ON public.academy_materials(lesson_id) WHERE lesson_id IS NOT NULL;

-- ── 5. TRIGGERS de updated_at ───────────────────────────────────────────
-- update_labor_updated_at() já existe (20260324200000_create_labor_module.sql).

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'academy_course_versions','academy_modules','academy_lessons','academy_materials'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at()', t, t);
    END LOOP;
END $$;

-- ── 6. RLS ──────────────────────────────────────────────────────────────
-- is_org_member(org_id) é o dual-check canônico do projeto: prefere
-- auth.uid() e cai para o e-mail do JWT em linhas legadas com user_id NULL
-- (20260706000002_fix_is_org_member_remove_backdoor.sql). É SECURITY DEFINER
-- com search_path fixo.
--
-- Uma policy POR OPERAÇÃO, nunca FOR ALL, sempre TO authenticated.

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'academy_course_versions','academy_modules','academy_lessons','academy_materials'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

        EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "%s_select" ON public.%I FOR SELECT TO authenticated
                        USING (public.is_org_member(org_id))', t, t);

        EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "%s_insert" ON public.%I FOR INSERT TO authenticated
                        WITH CHECK (public.is_org_member(org_id))', t, t);

        EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "%s_update" ON public.%I FOR UPDATE TO authenticated
                        USING (public.is_org_member(org_id))
                        WITH CHECK (public.is_org_member(org_id))', t, t);

        EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "%s_delete" ON public.%I FOR DELETE TO authenticated
                        USING (public.is_org_member(org_id))', t, t);

        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
    END LOOP;
END $$;

COMMENT ON TABLE public.academy_course_versions IS
    'Versão de conteúdo de um treinamento. Publicar uma nova versão arquiva a anterior e cria futuro — NUNCA altera matrículas, progresso ou certificados já existentes.';
COMMENT ON COLUMN public.academy_lessons.permite_avanco_rapido IS
    'FALSE (default) = arrastar a barra para frente não credita progresso. Base do princípio "vídeo aberto ≠ treinamento realizado".';
