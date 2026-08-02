-- ============================================================
-- Academia ÒPURA — Etapa 1, passo 10
-- Alertas, reciclagem automática e materialização de atribuições.
--
-- Tudo idempotente: rodar a função duas vezes no mesmo dia não duplica
-- matrícula nem notificação.
--
-- ⚠️ public.notifications tem policy legada FOR ALL TO public USING (true)
--    e não tem organization_id — na prática qualquer autenticado lê tudo.
--    Por isso a mensagem NUNCA contém nota, percentual, CPF ou NR sensível.
-- ============================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.generate_academy_alerts(p_days_ahead INTEGER DEFAULT 7)
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
    -- ── 1. Expira o que passou do prazo. Só marca, nunca apaga. ─────────
    UPDATE public.academy_enrollments
       SET status = 'EXPIRADO'
     WHERE data_limite IS NOT NULL
       AND data_limite < CURRENT_DATE
       AND status IN ('NAO_INICIADO','EM_ANDAMENTO','AGUARDANDO_AVALIACAO');
    GET DIAGNOSTICS v_expiradas = ROW_COUNT;

    -- ── 2. Materializa atribuições: quem está no público-alvo e ainda não
    --       tem matrícula na versão vigente. É aqui que a atribuição por
    --       cargo/equipe/obra "pega" quem entrou na empresa depois. ──────
    FOR r IN
        SELECT a.id AS assignment_id, a.org_id, a.course_id, a.prazo_dias, a.data_limite,
               COALESCE(a.version_id, v.id) AS version_id
          FROM public.academy_assignments a
          JOIN public.academy_course_versions v
            ON v.course_id = a.course_id AND v.status = 'PUBLICADA'
         WHERE a.status = 'ATIVA'
    LOOP
        INSERT INTO public.academy_enrollments (
            org_id, course_id, version_id, employee_id, assignment_id,
            origem, status, data_limite)
        SELECT r.org_id, r.course_id, r.version_id, t.employee_id, r.assignment_id,
               'ATRIBUICAO', 'NAO_INICIADO',
               COALESCE(r.data_limite, CURRENT_DATE + COALESCE(r.prazo_dias, 30))
          FROM public.fn_academy_resolve_assignment(r.assignment_id) t
         WHERE NOT EXISTS (
                SELECT 1 FROM public.academy_enrollments en
                 WHERE en.employee_id = t.employee_id
                   AND en.version_id  = r.version_id
                   AND en.status <> 'CANCELADO');
        -- GET DIAGNOSTICS só aceita "var = ITEM"; acumula em duas etapas.
        GET DIAGNOSTICS v_lote = ROW_COUNT;
        v_novas := v_novas + v_lote;
    END LOOP;

    -- ── 3. Reciclagem por vencimento de NR: evidência vencendo em até 45
    --       dias, curso com conteúdo publicado e reciclagem automática. ──
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

    -- ── 4. Notifica pendências. Dedup por link + 7 dias, no molde do
    --       cron de renovação de locação (20270827000003). ──────────────
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
    LOOP
        -- Mensagem deliberadamente pobre em dado sensível (ver cabeçalho).
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

REVOKE ALL ON FUNCTION public.generate_academy_alerts(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_academy_alerts(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_academy_alerts(INTEGER) TO authenticated;

-- ── Agendamento ─────────────────────────────────────────────────────────
-- 08:15 UTC está livre. Ocupados: 0 7 (tarefas), 30 7 (renovação de
-- locação), 0 8 (alertas de vencimento E notificações do ÒPURA Docs).

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-academy-alerts') THEN
        PERFORM cron.unschedule('daily-academy-alerts');
    END IF;
END $$;

SELECT cron.schedule(
    'daily-academy-alerts',
    '15 8 * * *',
    $$ SELECT public.generate_academy_alerts(7); $$
);

COMMENT ON FUNCTION public.generate_academy_alerts(INTEGER) IS
    'Cron diário 08:15 UTC. Idempotente. Expira prazos, materializa atribuições, cria reciclagens por vencimento de NR e notifica pendências. Mensagens sem dado sensível — a policy de public.notifications é legada e aberta.';
