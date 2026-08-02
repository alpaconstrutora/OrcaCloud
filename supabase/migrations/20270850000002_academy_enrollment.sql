-- ============================================================
-- Academia ÒPURA — Etapa 1, passo 3
-- Atribuição, matrícula, progresso por aula e log de acesso.
--
-- employee_id NUNCA tem FK (tabela quente — deadlock 40P01, já mordeu 3×).
-- alvo_id é polimórfico e por isso também não tem FK.
-- ============================================================

SET lock_timeout = '3s';

-- ── 1. ATRIBUIÇÕES ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.academy_assignments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     UUID NOT NULL,
    course_id  UUID NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
    alvo_tipo  TEXT NOT NULL
                   CHECK (alvo_tipo IN ('COLABORADOR','CARGO','FUNCAO','EQUIPE','OBRA','TODOS')),
    alvo_id    UUID,   -- polimórfico: employees | org_roles | org_funcoes | labor_teams | projects
    -- NULL = sempre a versão PUBLICADA vigente (recomendado). Preencher
    -- congela a atribuição numa versão específica.
    version_id UUID REFERENCES public.academy_course_versions(id) ON DELETE SET NULL,
    obrigatorio BOOLEAN NOT NULL DEFAULT TRUE,
    prazo_dias  INTEGER,   -- prazo relativo à matrícula
    data_limite DATE,      -- ou prazo absoluto
    reciclagem_automatica BOOLEAN NOT NULL DEFAULT TRUE,
    status      TEXT NOT NULL DEFAULT 'ATIVA' CHECK (status IN ('ATIVA','INATIVA')),
    observacoes TEXT,
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT academy_assignment_alvo_chk
        CHECK (alvo_tipo = 'TODOS' OR alvo_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_academy_assignments_org    ON public.academy_assignments(org_id, status);
CREATE INDEX IF NOT EXISTS idx_academy_assignments_course ON public.academy_assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_academy_assignments_alvo   ON public.academy_assignments(alvo_tipo, alvo_id);

-- ── 2. MATRÍCULAS ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.academy_enrollments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL,
    course_id     UUID NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
    version_id    UUID NOT NULL REFERENCES public.academy_course_versions(id) ON DELETE CASCADE,
    employee_id   UUID NOT NULL,     -- sem FK: tabela quente
    assignment_id UUID REFERENCES public.academy_assignments(id) ON DELETE SET NULL,
    origem        TEXT NOT NULL DEFAULT 'ATRIBUICAO'
                      CHECK (origem IN ('ATRIBUICAO','MANUAL','AUTOMATICA','RECICLAGEM')),
    status        TEXT NOT NULL DEFAULT 'NAO_INICIADO'
                      CHECK (status IN ('NAO_INICIADO','EM_ANDAMENTO','AGUARDANDO_AVALIACAO',
                                        'REPROVADO','CONCLUIDO','EXPIRADO','CANCELADO')),
    data_atribuicao DATE NOT NULL DEFAULT CURRENT_DATE,
    data_limite     DATE,
    data_inicio     TIMESTAMPTZ,
    data_conclusao  TIMESTAMPTZ,

    percentual_progresso NUMERIC(5,2) NOT NULL DEFAULT 0,
    segundos_assistidos  BIGINT NOT NULL DEFAULT 0,
    nota_final           NUMERIC(5,2),
    tentativas_usadas    INTEGER NOT NULL DEFAULT 0,

    aceite_em         TIMESTAMPTZ,
    aceite_ip         TEXT,
    aceite_user_agent TEXT,

    employee_training_id UUID,   -- registro legal gerado na conclusão
    certificate_id       UUID,
    substituida_por_id   UUID,   -- matrícula de reciclagem que sucedeu esta
    cancelamento_motivo  TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Uma matrícula por pessoa POR VERSÃO. Deliberado: a mesma pessoa pode ter
-- CONCLUIDO na v1 (evidência preservada) e NAO_INICIADO na v2 (reciclagem).
CREATE UNIQUE INDEX IF NOT EXISTS uq_academy_enroll_ativa
    ON public.academy_enrollments(employee_id, version_id)
    WHERE status <> 'CANCELADO';

CREATE INDEX IF NOT EXISTS idx_academy_enroll_org      ON public.academy_enrollments(org_id, status);
CREATE INDEX IF NOT EXISTS idx_academy_enroll_employee ON public.academy_enrollments(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_academy_enroll_course   ON public.academy_enrollments(course_id);
-- Índice do cron de alertas.
CREATE INDEX IF NOT EXISTS idx_academy_enroll_prazo
    ON public.academy_enrollments(data_limite)
    WHERE status NOT IN ('CONCLUIDO','CANCELADO');

-- ── 3. PROGRESSO POR AULA ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.academy_lesson_progress (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL,
    enrollment_id UUID NOT NULL REFERENCES public.academy_enrollments(id) ON DELETE CASCADE,
    lesson_id     UUID NOT NULL REFERENCES public.academy_lessons(id) ON DELETE CASCADE,
    employee_id   UUID NOT NULL,

    -- Tempo CREDITADO pelo servidor, não wall-clock do cliente.
    segundos_assistidos    INTEGER NOT NULL DEFAULT 0,
    -- Ponto de RETOMADA.
    posicao_segundos       INTEGER NOT NULL DEFAULT 0,
    -- Antifraude de seek: bloqueia crédito de salto à frente.
    maior_posicao_segundos INTEGER NOT NULL DEFAULT 0,
    percentual  NUMERIC(5,2) NOT NULL DEFAULT 0,
    concluida   BOOLEAN NOT NULL DEFAULT FALSE,

    primeira_visualizacao_em TIMESTAMPTZ,
    ultima_visualizacao_em   TIMESTAMPTZ,
    concluida_em             TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (enrollment_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_academy_progress_employee
    ON public.academy_lesson_progress(employee_id);

-- ── 4. LOG DE ACESSO — evidência jurídica, append-only ──────────────────

CREATE TABLE IF NOT EXISTS public.academy_access_logs (
    id            BIGSERIAL PRIMARY KEY,
    org_id        UUID NOT NULL,
    enrollment_id UUID NOT NULL REFERENCES public.academy_enrollments(id) ON DELETE CASCADE,
    lesson_id     UUID,
    employee_id   UUID NOT NULL,
    evento        TEXT NOT NULL CHECK (evento IN (
                      'ABERTURA','HEARTBEAT','PAUSA','CONCLUSAO_AULA','DOWNLOAD_MATERIAL',
                      'INICIO_AVALIACAO','ENVIO_AVALIACAO','ACEITE','EMISSAO_CERTIFICADO')),
    canal         TEXT NOT NULL CHECK (canal IN ('PORTAL','APP')),
    posicao_segundos INTEGER,
    delta_segundos   INTEGER,
    ip            TEXT,
    user_agent    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academy_logs_enrollment
    ON public.academy_access_logs(enrollment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_academy_logs_org
    ON public.academy_access_logs(org_id, created_at DESC);

-- ── 5. TRIGGERS ─────────────────────────────────────────────────────────

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'academy_assignments','academy_enrollments','academy_lesson_progress'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at()', t, t);
    END LOOP;
END $$;

-- ── 6. RLS ──────────────────────────────────────────────────────────────

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'academy_assignments','academy_enrollments','academy_lesson_progress'
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

-- academy_access_logs é APPEND-ONLY: SELECT + INSERT e nada mais.
-- Ausência de policy de UPDATE/DELETE = operação negada. É de propósito:
-- é esta tabela que sustenta a conclusão numa fiscalização.
ALTER TABLE public.academy_access_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "academy_access_logs_select" ON public.academy_access_logs;
CREATE POLICY "academy_access_logs_select" ON public.academy_access_logs
    FOR SELECT TO authenticated USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "academy_access_logs_insert" ON public.academy_access_logs;
CREATE POLICY "academy_access_logs_insert" ON public.academy_access_logs
    FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));

REVOKE ALL ON TABLE public.academy_access_logs FROM PUBLIC;
REVOKE ALL ON TABLE public.academy_access_logs FROM anon;
GRANT SELECT, INSERT ON TABLE public.academy_access_logs TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.academy_access_logs_id_seq TO authenticated;

-- ── 7. RESOLUÇÃO DO PÚBLICO-ALVO ────────────────────────────────────────
-- Traduz uma atribuição polimórfica na lista de colaboradores alcançados.
--
-- ⚠️ org_roles / org_funcoes são escopadas por company_id (→ companies.org_id),
--    NÃO por org_id direto. Assumir org_roles.org_id dá erro de coluna.
-- ⚠️ CARGO resolve por role_id OR pelo texto livre employees.role. A base real
--    tem as duas coisas preenchidas de forma inconsistente; sem o OR, o
--    colaborador antigo simplesmente não recebe a atribuição — e ninguém
--    percebe até a auditoria da NR.

CREATE OR REPLACE FUNCTION public.fn_academy_resolve_assignment(p_assignment_id UUID)
RETURNS TABLE (employee_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org        UUID;
    v_alvo_tipo  TEXT;
    v_alvo_id    UUID;
BEGIN
    SELECT a.org_id, a.alvo_tipo, a.alvo_id
      INTO v_org, v_alvo_tipo, v_alvo_id
      FROM public.academy_assignments a
     WHERE a.id = p_assignment_id;

    IF v_org IS NULL THEN
        RETURN;
    END IF;

    IF NOT public.is_org_member(v_org) THEN
        RAISE EXCEPTION 'Acesso negado à organização da atribuição'
            USING ERRCODE = '42501';
    END IF;

    IF v_alvo_tipo = 'COLABORADOR' THEN
        RETURN QUERY
            SELECT e.id FROM public.employees e
             WHERE e.id = v_alvo_id AND e.org_id = v_org AND e.status = 'ATIVO';

    ELSIF v_alvo_tipo = 'CARGO' THEN
        RETURN QUERY
            SELECT e.id FROM public.employees e
             WHERE e.org_id = v_org AND e.status = 'ATIVO'
               AND (
                    e.role_id = v_alvo_id
                 OR e.role = (SELECT r.nome FROM public.org_roles r WHERE r.id = v_alvo_id)
               );

    ELSIF v_alvo_tipo = 'FUNCAO' THEN
        RETURN QUERY
            SELECT e.id FROM public.employees e
             WHERE e.org_id = v_org AND e.status = 'ATIVO'
               AND e.role_id IN (
                    SELECT r.id FROM public.org_roles r WHERE r.funcao_id = v_alvo_id
               );

    ELSIF v_alvo_tipo = 'EQUIPE' THEN
        RETURN QUERY
            SELECT e.id FROM public.employees e
             JOIN public.team_members tm ON tm.employee_id = e.id
             WHERE tm.team_id = v_alvo_id AND e.org_id = v_org AND e.status = 'ATIVO';

    ELSIF v_alvo_tipo = 'OBRA' THEN
        RETURN QUERY
            SELECT DISTINCT e.id FROM public.employees e
             JOIN public.employee_allocations al ON al.employee_id = e.id
             WHERE al.project_id = v_alvo_id
               AND COALESCE(al.is_active, TRUE)
               AND e.org_id = v_org AND e.status = 'ATIVO';

    ELSIF v_alvo_tipo = 'TODOS' THEN
        RETURN QUERY
            SELECT e.id FROM public.employees e
             WHERE e.org_id = v_org AND e.status = 'ATIVO';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_academy_resolve_assignment(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_academy_resolve_assignment(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_academy_resolve_assignment(UUID) TO authenticated;

COMMENT ON TABLE public.academy_access_logs IS
    'Append-only (sem policy de UPDATE/DELETE). Evidência de que a pessoa realmente assistiu. Retenção: 18 meses. NUNCA habilitar Realtime — é a tabela de maior volume do módulo.';
