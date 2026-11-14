-- scripts/teste-tarefas-superadmin.sql
-- Prova: superadmin (public.superadmins) vê e edita QUALQUER tarefa — inclusive as
-- de fora de espaço ("agenda pessoal") de outra pessoa —, mexe nos envolvidos dela e
-- não apaga; quem não é superadmin continua sem ver a agenda pessoal alheia.
-- Migration: supabase/migrations/aplicar_20271112997000_tarefas_superadmin_ve_e_edita.sql
-- Plano: docs/planos/2026-11-11-link-celular-tarefas-diario.md (Ajustes — superadmin).
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …';
-- sucesso = a linha final 'TUDO OK'. Sem a migration (linha MIGRATION vazia), falha em
-- "superadmin vê a tarefa sem espaço de outra pessoa" (é o RED).
--
--   npx supabase db query --linked -f scripts/teste-tarefas-superadmin.sql

BEGIN;
-- MIGRATION

CREATE FUNCTION pg_temp.confere(p_ok BOOLEAN, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
END $$;

-- Roda p_sql como authenticated com as claims de p_user (sub + e-mail + role).
CREATE FUNCTION pg_temp.como(p_user UUID, p_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object(
        'sub', p_user, 'role', 'authenticated',
        'email', (SELECT u.email FROM auth.users u WHERE u.id = p_user))::text, true);
    BEGIN
        SET LOCAL ROLE authenticated;
        EXECUTE p_sql INTO v;
        v := 'ok:' || coalesce(v, '<null>');
    EXCEPTION WHEN OTHERS THEN
        v := SQLSTATE || ':' || SQLERRM;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN v;
END $$;

DO $$
DECLARE
    org CONSTANT UUID := '926cf626-ba49-4ee4-9f35-472822fb90e6';
    sa UUID; m UUID; x UUID; e_outro UUID; e_m UUID; s_m UUID; t UUID; v TEXT;
    conta CONSTANT TEXT := 'SELECT count(*)::text FROM public.tasks WHERE id = %L';
BEGIN
    -- sa: um superadmin com conta; m e x: membros comuns da org (não superadmins).
    SELECT u.id INTO sa FROM public.superadmins s JOIN auth.users u ON lower(u.email) = s.email ORDER BY u.email LIMIT 1;
    PERFORM pg_temp.confere(sa IS NOT NULL, 'fixture: superadmin');
    SELECT om.user_id INTO m FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
     WHERE om.organization_id = org AND om.role = 'member'
       AND NOT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.email = lower(au.email))
     ORDER BY om.user_id LIMIT 1;
    SELECT om.user_id INTO x FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
     WHERE om.organization_id = org AND om.role = 'member' AND om.user_id <> m
       AND NOT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.email = lower(au.email))
     ORDER BY om.user_id LIMIT 1;
    PERFORM pg_temp.confere(m IS NOT NULL AND x IS NOT NULL, 'fixture: dois membros comuns');

    INSERT INTO public.employees (org_id, name, status) VALUES (org, 'TS outro', 'ATIVO') RETURNING id INTO e_outro;
    INSERT INTO public.employees (org_id, name, status) VALUES (org, 'TS envolvido', 'ATIVO') RETURNING id INTO e_m;
    INSERT INTO public.task_spaces (org_id, owner_user_id, name) VALUES (org, m, 'TS espaço de m') RETURNING id INTO s_m;
    -- Tarefa da "agenda pessoal" de m: sem espaço, sem responsável.
    INSERT INTO public.tasks (org_id, user_id, title, status, priority) VALUES (org, m, 'TS pessoal de m', 'open', 3) RETURNING id INTO t;

    -- ── superadmin vê ─────────────────────────────────────────────────────────
    v := pg_temp.como(sa, format(conta, t));
    PERFORM pg_temp.confere(v = 'ok:1', 'superadmin vê a tarefa sem espaço de outra pessoa (veio ' || v || ')');

    -- ── superadmin edita tudo, inclusive o que o gatilho do responsável trava ──
    v := pg_temp.como(sa, format(
        'WITH u AS (UPDATE public.tasks SET title = ''TS editada'', status = ''done'', assignee_employee_id = %L, space_id = %L '
        || 'WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', e_outro, s_m, t));
    PERFORM pg_temp.confere(v = 'ok:1', 'superadmin edita título, status, responsável e espaço (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT title = 'TS editada' AND assignee_employee_id = e_outro AND space_id = s_m AND completed_at IS NOT NULL
                               FROM public.tasks WHERE id = t), 'edição do superadmin gravada (completed_at pelo gatilho)');
    UPDATE public.tasks SET space_id = NULL, status = 'open' WHERE id = t;   -- volta para fora de espaço

    -- ── superadmin mexe nos envolvidos ────────────────────────────────────────
    v := pg_temp.como(sa, format('INSERT INTO public.task_collaborators (task_id, employee_id) VALUES (%L, %L) RETURNING 1::text', t, e_m));
    PERFORM pg_temp.confere(v = 'ok:1', 'superadmin põe envolvido em tarefa sem espaço de outra pessoa (veio ' || v || ')');
    v := pg_temp.como(sa, format('SELECT count(*)::text FROM public.task_collaborators WHERE task_id = %L', t));
    PERFORM pg_temp.confere(v = 'ok:1', 'superadmin lê os envolvidos (veio ' || v || ')');

    -- ── superadmin NÃO apaga (apagar não mudou) ───────────────────────────────
    v := pg_temp.como(sa, format('WITH d AS (DELETE FROM public.tasks WHERE id = %L RETURNING 1) SELECT count(*)::text FROM d', t));
    PERFORM pg_temp.confere(v = 'ok:0', 'superadmin não apaga a tarefa pessoal alheia (veio ' || v || ')');

    -- ── quem não é superadmin continua sem ver/editar ─────────────────────────
    v := pg_temp.como(x, format(conta, t));
    PERFORM pg_temp.confere(v = 'ok:0', 'membro comum não vê a agenda pessoal alheia (veio ' || v || ')');
    v := pg_temp.como(x, format('WITH u AS (UPDATE public.tasks SET title = ''TS x'' WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', t));
    PERFORM pg_temp.confere(v = 'ok:0', 'membro comum não edita a agenda pessoal alheia (veio ' || v || ')');
    v := pg_temp.como(x, format('INSERT INTO public.task_collaborators (task_id, employee_id) VALUES (%L, %L) RETURNING 1::text', t, e_outro));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'membro comum não põe envolvido na agenda pessoal alheia (veio ' || v || ')');

    -- ── o dono continua igual ─────────────────────────────────────────────────
    v := pg_temp.como(m, format(conta, t));
    PERFORM pg_temp.confere(v = 'ok:1', 'dono continua vendo (veio ' || v || ')');

    -- ── forma ─────────────────────────────────────────────────────────────────
    PERFORM pg_temp.confere(
        (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks'
            AND policyname IN ('tasks_select_superadmin', 'tasks_update_superadmin')) = 2
        AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks'
                         AND cmd = 'DELETE' AND qual LIKE '%is_superadmin%'),
        'tasks: + leitura e edição de superadmin; apagar sem mudança');
END $$;

ROLLBACK;

SELECT 'TUDO OK' AS resultado;
