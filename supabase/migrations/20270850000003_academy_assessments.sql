-- ============================================================
-- Academia ÒPURA — Etapa 1, passo 4
-- Banco de questões, provas, tentativas e respostas.
--
-- O GABARITO (academy_question_options.correta) NUNCA sai do banco para o
-- aluno: os RPCs devolvem apenas (id, texto) e a correção é 100% server-side.
-- ============================================================

SET lock_timeout = '3s';

-- ── 1. BANCO DE QUESTÕES ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.academy_questions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     UUID NOT NULL,
    version_id UUID NOT NULL REFERENCES public.academy_course_versions(id) ON DELETE CASCADE,
    module_id  UUID REFERENCES public.academy_modules(id) ON DELETE SET NULL,
    enunciado  TEXT NOT NULL,
    tipo       TEXT NOT NULL
                   CHECK (tipo IN ('MULTIPLA_ESCOLHA','MULTIPLA_RESPOSTA','VERDADEIRO_FALSO')),
    explicacao TEXT,     -- mostrada no feedback quando mostrar_gabarito = TRUE
    peso       NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (peso > 0),
    ordem      INTEGER NOT NULL DEFAULT 0,
    ativa      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academy_questions_version
    ON public.academy_questions(version_id, ordem);

CREATE TABLE IF NOT EXISTS public.academy_question_options (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL,
    question_id UUID NOT NULL REFERENCES public.academy_questions(id) ON DELETE CASCADE,
    texto       TEXT NOT NULL,
    correta     BOOLEAN NOT NULL DEFAULT FALSE,   -- nunca trafega para o aluno
    ordem       INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academy_options_question
    ON public.academy_question_options(question_id, ordem);

-- ── 2. PROVAS ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.academy_assessments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     UUID NOT NULL,
    version_id UUID NOT NULL REFERENCES public.academy_course_versions(id) ON DELETE CASCADE,
    module_id  UUID REFERENCES public.academy_modules(id) ON DELETE CASCADE,  -- NULL = avaliação final
    titulo     TEXT NOT NULL,
    tipo       TEXT NOT NULL DEFAULT 'FINAL' CHECK (tipo IN ('FINAL','MODULO')),
    nota_minima          NUMERIC(5,2) NOT NULL DEFAULT 7,
    qtd_questoes         INTEGER,   -- NULL = todas; N = sorteia N do banco vinculado
    embaralhar_questoes  BOOLEAN NOT NULL DEFAULT TRUE,
    embaralhar_opcoes    BOOLEAN NOT NULL DEFAULT TRUE,
    tentativas_max       INTEGER NOT NULL DEFAULT 3 CHECK (tentativas_max > 0),
    tempo_limite_minutos INTEGER,
    mostrar_gabarito     BOOLEAN NOT NULL DEFAULT FALSE,
    ativa      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academy_assessments_version
    ON public.academy_assessments(version_id);

-- Ponte banco-de-questões ↔ prova (a mesma questão serve várias provas).
CREATE TABLE IF NOT EXISTS public.academy_assessment_questions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL,
    assessment_id UUID NOT NULL REFERENCES public.academy_assessments(id) ON DELETE CASCADE,
    question_id   UUID NOT NULL REFERENCES public.academy_questions(id) ON DELETE CASCADE,
    ordem         INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (assessment_id, question_id)
);

-- ── 3. TENTATIVAS ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.academy_attempts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL,
    assessment_id UUID NOT NULL REFERENCES public.academy_assessments(id) ON DELETE CASCADE,
    enrollment_id UUID NOT NULL REFERENCES public.academy_enrollments(id) ON DELETE CASCADE,
    employee_id   UUID NOT NULL,
    numero_tentativa INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'EM_ANDAMENTO'
                    CHECK (status IN ('EM_ANDAMENTO','ENVIADA','EXPIRADA')),
    iniciada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    enviada_em  TIMESTAMPTZ,
    expira_em   TIMESTAMPTZ,
    nota     NUMERIC(5,2),
    acertos  INTEGER,
    total    INTEGER,
    aprovado BOOLEAN,
    -- Congela o sorteio: retomar a tentativa não re-sorteia as questões.
    questoes_sorteadas UUID[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (enrollment_id, assessment_id, numero_tentativa)
);

CREATE INDEX IF NOT EXISTS idx_academy_attempts_enrollment
    ON public.academy_attempts(enrollment_id, assessment_id);

CREATE TABLE IF NOT EXISTS public.academy_attempt_answers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL,
    attempt_id  UUID NOT NULL REFERENCES public.academy_attempts(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.academy_questions(id) ON DELETE CASCADE,
    option_ids  UUID[] NOT NULL DEFAULT '{}',
    correta     BOOLEAN,
    pontos      NUMERIC(5,2),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (attempt_id, question_id)
);

-- ── 4. TRIGGERS ─────────────────────────────────────────────────────────

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'academy_questions','academy_question_options','academy_assessments','academy_attempts'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at()', t, t);
    END LOOP;
END $$;

-- ── 5. RLS ──────────────────────────────────────────────────────────────
-- Todas org-scoped para membros. O aluno nunca lê academy_question_options
-- pela tabela — só pelos RPCs, que projetam (id, texto) sem "correta".

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'academy_questions','academy_question_options','academy_assessments',
        'academy_assessment_questions','academy_attempts','academy_attempt_answers'
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

COMMENT ON COLUMN public.academy_question_options.correta IS
    'Gabarito. NUNCA projetado para o aluno — os RPCs devolvem só (id, texto). Correção é sempre server-side.';
COMMENT ON COLUMN public.academy_attempts.questoes_sorteadas IS
    'Congela o sorteio no início da tentativa: fechar e reabrir não re-sorteia (senão o aluno "gira" até cair uma prova fácil).';
