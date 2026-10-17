-- ============================================================
-- Portal do Corretor — Treinamento pela Academia (Portal de Treinamentos)
-- Plano: docs/planos/2026-10-17-portal-corretor-pendencias.md (F6)
-- Decisão do usuário (17/10/2026, P1): reusar a Academia — o corretor vira
-- aluno externo (TERCEIRO, como o terceirizado: ficha EMPREITEIRO +
-- academy_externo, criada por academy_portal_users_create). A aba Treinamento
-- do portal mostra os cursos atribuídos a ele e leva à sala de aula no Portal de
-- Treinamentos. `broker_portal_trainings` (vazia) não é usada.
--
-- As leituras da Academia são "para mim" (JWT). Pelo link do corretor não há
-- sessão, então a leitura vai por token: acesso ATIVO da Academia com o e-mail
-- do corretor na organização do token → as fichas → as matrículas (mesma
-- consulta de academy_portal_user_list_enrollments).
--
-- REGRA #7: núcleo sem EXECUTE para ninguém; token só anon + authenticated;
-- gestor só authenticated com is_org_member DENTRO.
-- ============================================================

SET lock_timeout = '5s';

-- ── 0. Núcleo: matrículas de um e-mail numa organização ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_broker_treinamentos_calc(p_org UUID, p_email TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH acesso AS (
        SELECT id, employee_id, is_active, invited_at, last_access_at
          FROM public.academy_portal_users
         WHERE org_id = p_org AND lower(email) = lower(p_email)
         ORDER BY is_active DESC, created_at DESC
         LIMIT 1
    )
    SELECT jsonb_build_object(
        'acesso',          (SELECT COUNT(*) FROM acesso WHERE is_active) > 0,
        'acesso_id',       (SELECT id FROM acesso),
        'bloqueado',       (SELECT COUNT(*) FROM acesso WHERE NOT is_active) > 0,
        'convidado_em',    (SELECT invited_at FROM acesso),
        'ultimo_acesso',   (SELECT last_access_at FROM acesso),
        'matriculas', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'id', en.id, 'curso', c.nome, 'nr_referencia', c.nr_referencia,
                       'status', en.status, 'percentual', en.percentual_progresso,
                       'data_limite', en.data_limite, 'data_conclusao', en.data_conclusao,
                       'carga_horaria', COALESCE(NULLIF(v.carga_horaria_ead, 0), c.carga_horaria))
                   ORDER BY CASE en.status WHEN 'EM_ANDAMENTO' THEN 0 WHEN 'NAO_INICIADO' THEN 1
                                           WHEN 'REPROVADO' THEN 2 WHEN 'AGUARDANDO_AVALIACAO' THEN 3 ELSE 9 END,
                            en.data_limite NULLS LAST, c.nome)
              FROM public.academy_enrollments en
              JOIN public.training_courses c ON c.id = en.course_id
              JOIN public.academy_course_versions v ON v.id = en.version_id
             WHERE en.employee_id = (SELECT employee_id FROM acesso WHERE is_active)
               AND en.org_id = p_org
               AND en.status <> 'CANCELADO'), '[]'::jsonb)
    );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_broker_treinamentos_calc(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- ── 1. Corretor pelo link ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_broker_portal_treinamentos(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org UUID; v_email TEXT; v_r JSONB;
BEGIN
    SELECT c.org_id, c.email INTO v_org, v_email FROM public.fn_broker_portal_corretor_do_token(p_token) c;
    IF v_org IS NULL OR v_email IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    v_r := public.fn_broker_treinamentos_calc(v_org, v_email);
    -- o corretor não precisa do id interno do acesso
    RETURN jsonb_build_object('valid', TRUE, 'email', v_email) || (v_r - 'acesso_id');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_broker_portal_treinamentos(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_broker_portal_treinamentos(TEXT) TO anon, authenticated;

-- ── 2. Gestor: situação de um corretor na Academia ──────────────────────────
CREATE OR REPLACE FUNCTION public.fn_broker_treinamentos_do_corretor(p_org UUID, p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT (public.is_org_member(p_org) OR public.is_superadmin()) THEN
        RAISE EXCEPTION 'Sem acesso à organização' USING ERRCODE = '42501';
    END IF;
    RETURN public.fn_broker_treinamentos_calc(p_org, p_email);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_broker_treinamentos_do_corretor(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_broker_treinamentos_do_corretor(UUID, TEXT) TO authenticated;
