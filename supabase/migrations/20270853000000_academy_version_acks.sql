-- ============================================================
-- Academia ÒPURA — relatório de ciência da mudança de versão.
--
-- O evento CIENCIA_VERSAO já era gravado (20270852000000), mas só dava para
-- consultá-lo registro a registro. Numa auditoria a pergunta é agregada:
-- "quantos dos alcançados deram ciência da v2, e quem ainda não deu?".
-- ============================================================

SET lock_timeout = '5s';

-- Acelera a contagem por matrícula: sem isto, cada versão listada varre o log
-- inteiro, que é a tabela de maior volume do módulo (heartbeat a cada 30s).
CREATE INDEX IF NOT EXISTS idx_academy_logs_ciencia
    ON public.academy_access_logs(enrollment_id)
    WHERE evento = 'CIENCIA_VERSAO';

-- ── 1. Histórico passa a trazer a contagem de ciência ───────────────────

DROP FUNCTION IF EXISTS public.fn_academy_version_history(UUID);

CREATE FUNCTION public.fn_academy_version_history(p_course_id UUID)
RETURNS TABLE (
    id UUID, versao INTEGER, status TEXT, titulo_versao TEXT, notas_versao TEXT,
    publicada_em TIMESTAMPTZ, publicada_por_nome TEXT, arquivada_em TIMESTAMPTZ,
    reciclagens_geradas INTEGER, migradas_geradas INTEGER,
    modulos BIGINT, aulas BIGINT, matriculas BIGINT, concluidas BIGINT,
    ciencias BIGINT, criada_em TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org UUID;
BEGIN
    SELECT c.org_id INTO v_org FROM public.training_courses c WHERE c.id = p_course_id;
    IF v_org IS NULL OR NOT public.is_org_member(v_org) THEN
        RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
        SELECT v.id, v.versao, v.status, v.titulo_versao, v.notas_versao,
               v.publicada_em,
               COALESCE(
                   (SELECT m.name FROM public.organization_members m
                     WHERE m.user_id = v.publicada_por AND m.organization_id = v.org_id
                     LIMIT 1),
                   (SELECT m.email FROM public.organization_members m
                     WHERE m.user_id = v.publicada_por LIMIT 1)
               ) AS publicada_por_nome,
               v.arquivada_em, v.reciclagens_geradas, v.migradas_geradas,
               (SELECT COUNT(*) FROM public.academy_modules mo WHERE mo.version_id = v.id),
               (SELECT COUNT(*) FROM public.academy_lessons le WHERE le.version_id = v.id),
               (SELECT COUNT(*) FROM public.academy_enrollments en
                 WHERE en.version_id = v.id AND en.status <> 'CANCELADO'),
               (SELECT COUNT(*) FROM public.academy_enrollments en
                 WHERE en.version_id = v.id AND en.status = 'CONCLUIDO'),
               (SELECT COUNT(DISTINCT en.id) FROM public.academy_enrollments en
                 WHERE en.version_id = v.id AND en.status <> 'CANCELADO'
                   AND EXISTS (SELECT 1 FROM public.academy_access_logs l
                                WHERE l.enrollment_id = en.id
                                  AND l.evento = 'CIENCIA_VERSAO')),
               v.created_at
          FROM public.academy_course_versions v
         WHERE v.course_id = p_course_id
         ORDER BY v.versao DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_academy_version_history(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_academy_version_history(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_academy_version_history(UUID) TO authenticated;

-- ── 2. Quem deu ciência, e quem não deu ─────────────────────────────────
-- Devolve TODOS os alcançados pela versão. Quem não deu ciência vem com
-- ciencia_em NULL — é essa linha que interessa numa auditoria.

CREATE OR REPLACE FUNCTION public.fn_academy_version_acks(p_version_id UUID)
RETURNS TABLE (
    enrollment_id UUID, employee_id UUID, employee_name TEXT, employee_role TEXT,
    status TEXT, ciencia_em TIMESTAMPTZ, canal TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org UUID;
BEGIN
    SELECT v.org_id INTO v_org FROM public.academy_course_versions v WHERE v.id = p_version_id;
    IF v_org IS NULL OR NOT public.is_org_member(v_org) THEN
        RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
        SELECT en.id, en.employee_id, emp.name, emp.role, en.status,
               ack.created_at, ack.canal
          FROM public.academy_enrollments en
          LEFT JOIN public.employees emp ON emp.id = en.employee_id
          LEFT JOIN LATERAL (
                SELECT l.created_at, l.canal
                  FROM public.academy_access_logs l
                 WHERE l.enrollment_id = en.id AND l.evento = 'CIENCIA_VERSAO'
                 ORDER BY l.created_at ASC
                 LIMIT 1
          ) ack ON TRUE
         WHERE en.version_id = p_version_id
           AND en.status <> 'CANCELADO'
         -- Pendentes primeiro: a tela existe para agir, não para admirar médias.
         ORDER BY (ack.created_at IS NOT NULL), emp.name;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_academy_version_acks(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_academy_version_acks(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_academy_version_acks(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_academy_version_acks(UUID) IS
    'Ciência da mudança por colaborador alcançado pela versão. ciencia_em NULL = ainda não deu ciência — é a linha que importa numa fiscalização.';
