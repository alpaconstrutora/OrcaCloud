-- ============================================================
-- Academia ÒPURA — conserta a materialização de atribuições.
--
-- Dois defeitos que faziam "criei a atribuição e nada apareceu":
--
-- 1. fn_academy_resolve_assignment exige is_org_member(). Sob pg_cron não há
--    JWT, então auth.uid() é NULL, is_org_member() é falso e a função LANÇA
--    exceção — o cron diário nunca conseguiu materializar nada desde que foi
--    criado (20270850000009).
--
-- 2. generate_academy_alerts percorria as atribuições ATIVAS de TODAS as
--    organizações, sem filtro. Disparado da tela por um usuário que não é
--    membro de alguma outra org, a primeira atribuição dessa org derrubava a
--    execução inteira — inclusive a da própria organização dele.
--
-- Correção: a resolução do público-alvo passa a ter duas portas — uma interna
-- sem checagem (para o motor) e a pública com checagem (para a prévia na
-- tela) — e o processamento passa a aceitar recorte por organização.
-- ============================================================

SET lock_timeout = '5s';

-- ── 1. Resolução interna, sem checagem de permissão ─────────────────────
-- Sem GRANT nenhum: só chamável de dentro de outras SECURITY DEFINER.
-- Quem valida quem pode ver o quê é o chamador.

CREATE OR REPLACE FUNCTION public.fn_academy_resolve_assignment_internal(p_assignment_id UUID)
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

    IF v_alvo_tipo = 'COLABORADOR' THEN
        RETURN QUERY
            SELECT e.id FROM public.employees e
             WHERE e.id = v_alvo_id AND e.org_id = v_org AND e.status = 'ATIVO';

    ELSIF v_alvo_tipo = 'CARGO' THEN
        -- role_id OU o texto livre: a base real tem as duas coisas preenchidas
        -- de forma inconsistente, e sem o OR o colaborador antigo nunca é
        -- alcançado — ninguém percebe até a auditoria da NR.
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

REVOKE ALL ON FUNCTION public.fn_academy_resolve_assignment_internal(UUID)
    FROM PUBLIC, anon, authenticated;

-- A pública vira uma casca: valida o acesso e delega. A prévia na tela
-- continua se comportando igual.
CREATE OR REPLACE FUNCTION public.fn_academy_resolve_assignment(p_assignment_id UUID)
RETURNS TABLE (employee_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org UUID;
BEGIN
    SELECT a.org_id INTO v_org FROM public.academy_assignments a WHERE a.id = p_assignment_id;
    IF v_org IS NULL THEN
        RETURN;
    END IF;
    IF NOT public.is_org_member(v_org) THEN
        RAISE EXCEPTION 'Acesso negado à organização da atribuição'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY SELECT t.employee_id
                   FROM public.fn_academy_resolve_assignment_internal(p_assignment_id) t;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_academy_resolve_assignment(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_academy_resolve_assignment(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_academy_resolve_assignment(UUID) TO authenticated;

-- ── 2. Processamento com recorte por organização ────────────────────────
-- p_org_id NULL = todas (é assim que o cron roda). A tela passa a mandar a
-- org ativa, para que problema em outra organização não derrube o processo.

DROP FUNCTION IF EXISTS public.generate_academy_alerts(INTEGER);

CREATE FUNCTION public.generate_academy_alerts(
    p_days_ahead INTEGER DEFAULT 7,
    p_org_id     UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_expiradas   INTEGER := 0;
    v_notificadas INTEGER := 0;
    v_reciclagens INTEGER := 0;
    v_novas       INTEGER := 0;
    v_lote        INTEGER := 0;
    r             RECORD;
BEGIN
    -- Chamada da tela (org informada) exige ser membro. Chamada do cron
    -- (p_org_id NULL) roda sem sessão, como processo do sistema.
    IF p_org_id IS NOT NULL AND NOT public.is_org_member(p_org_id) THEN
        RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
    END IF;

    UPDATE public.academy_enrollments
       SET status = 'EXPIRADO'
     WHERE data_limite IS NOT NULL
       AND data_limite < CURRENT_DATE
       AND status IN ('NAO_INICIADO','EM_ANDAMENTO','AGUARDANDO_AVALIACAO')
       AND (p_org_id IS NULL OR org_id = p_org_id);
    GET DIAGNOSTICS v_expiradas = ROW_COUNT;

    FOR r IN
        SELECT a.id AS assignment_id, a.org_id, a.course_id, a.prazo_dias, a.data_limite,
               COALESCE(a.version_id, v.id) AS version_id
          FROM public.academy_assignments a
          JOIN public.academy_course_versions v
            ON v.course_id = a.course_id AND v.status = 'PUBLICADA'
         WHERE a.status = 'ATIVA'
           AND (p_org_id IS NULL OR a.org_id = p_org_id)
    LOOP
        INSERT INTO public.academy_enrollments (
            org_id, course_id, version_id, employee_id, assignment_id,
            origem, status, data_limite)
        SELECT r.org_id, r.course_id, r.version_id, t.employee_id, r.assignment_id,
               'ATRIBUICAO', 'NAO_INICIADO',
               COALESCE(r.data_limite, CURRENT_DATE + COALESCE(r.prazo_dias, 30))
          FROM public.fn_academy_resolve_assignment_internal(r.assignment_id) t
         WHERE NOT EXISTS (
                SELECT 1 FROM public.academy_enrollments en
                 WHERE en.employee_id = t.employee_id
                   AND en.version_id  = r.version_id
                   AND en.status <> 'CANCELADO');

        GET DIAGNOSTICS v_lote = ROW_COUNT;
        v_novas := v_novas + v_lote;
    END LOOP;

    INSERT INTO public.academy_enrollments (
        org_id, course_id, version_id, employee_id, origem, status, data_limite)
    SELECT DISTINCT ON (et.employee_id, v.id)
           et.org_id, et.course_id, v.id, et.employee_id,
           'RECICLAGEM', 'NAO_INICIADO', et.data_validade
      FROM public.employee_trainings et
      JOIN public.employees emp ON emp.id = et.employee_id AND emp.status = 'ATIVO'
      JOIN public.academy_course_versions v
        ON v.course_id = et.course_id AND v.status = 'PUBLICADA'
     WHERE et.data_validade IS NOT NULL
       AND et.data_validade BETWEEN CURRENT_DATE AND CURRENT_DATE + 45
       AND (p_org_id IS NULL OR et.org_id = p_org_id)
       AND EXISTS (
            SELECT 1 FROM public.academy_assignments a
             WHERE a.course_id = et.course_id AND a.status = 'ATIVA'
               AND a.reciclagem_automatica)
       AND NOT EXISTS (
            SELECT 1 FROM public.academy_enrollments en
             WHERE en.employee_id = et.employee_id
               AND en.version_id  = v.id
               AND en.status <> 'CANCELADO');
    GET DIAGNOSTICS v_reciclagens = ROW_COUNT;

    FOR r IN
        SELECT en.id, en.employee_id, en.data_limite, c.nome AS curso, emp.email
          FROM public.academy_enrollments en
          JOIN public.training_courses c  ON c.id  = en.course_id
          JOIN public.employees        emp ON emp.id = en.employee_id
         WHERE en.status IN ('NAO_INICIADO','EM_ANDAMENTO','AGUARDANDO_AVALIACAO','EXPIRADO')
           AND en.data_limite IS NOT NULL
           AND en.data_limite BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE + p_days_ahead
           AND emp.email IS NOT NULL
           AND emp.status = 'ATIVO'
           AND (p_org_id IS NULL OR en.org_id = p_org_id)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.notifications n
             WHERE n.recipient_email = r.email
               AND n.link = '/portal?treinamento=' || r.id::text
               AND n.created_at > NOW() - INTERVAL '7 days'
        ) THEN
            INSERT INTO public.notifications (recipient_email, title, message, link, type)
            VALUES (
                r.email,
                CASE WHEN r.data_limite < CURRENT_DATE
                     THEN 'Treinamento em atraso'
                     ELSE 'Treinamento pendente' END,
                format('%s — prazo %s.', r.curso, to_char(r.data_limite, 'DD/MM/YYYY')),
                '/portal?treinamento=' || r.id::text,
                CASE WHEN r.data_limite < CURRENT_DATE THEN 'error' ELSE 'warning' END);
            v_notificadas := v_notificadas + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'expiradas',   v_expiradas,
        'novas',       v_novas,
        'reciclagens', v_reciclagens,
        'notificadas', v_notificadas);
END;
$$;

REVOKE ALL ON FUNCTION public.generate_academy_alerts(INTEGER, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_academy_alerts(INTEGER, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_academy_alerts(INTEGER, UUID) TO authenticated;

-- Reagenda: a assinatura mudou, então o job antigo apontaria para função
-- inexistente.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-academy-alerts') THEN
        PERFORM cron.unschedule('daily-academy-alerts');
    END IF;
END $$;

SELECT cron.schedule(
    'daily-academy-alerts',
    '15 8 * * *',
    $$ SELECT public.generate_academy_alerts(7, NULL); $$
);

COMMENT ON FUNCTION public.generate_academy_alerts(INTEGER, UUID) IS
    'Cron diário 08:15 UTC (p_org_id NULL = todas as orgs, sem sessão). Chamado da tela com a org ativa, exige ser membro. Idempotente. Usa fn_academy_resolve_assignment_internal, que NÃO checa permissão — a checagem é do chamador; a versão pública checa e é só para a prévia na tela.';
