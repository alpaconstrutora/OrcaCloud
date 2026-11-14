-- scripts/teste-tarefas-superadmin.sql
-- Prova: superadmin (public.superadmins) vê e edita a tarefa que tem responsável ou está
-- num espaço — por ser owner/admin da organização (os gatilhos de membership o põem assim
-- em toda org) —, mexe nos envolvidos dela e não apaga; a agenda pessoal alheia (sem
-- responsável e fora de espaço) ele NÃO vê, nem quem não é superadmin.
-- Regra de 12/11/2026 (2ª): "Quem criou a tarefa, quem é o responsável, o proprietário, o
-- admin e os selecionados para visualizacao vê a tarefa" — substituiu o "ver e editar
-- todas" de aplicar_20271112997000.
-- Migration: supabase/migrations/aplicar_20271112998000_tarefas_visibilidade_por_responsavel.sql
-- Plano: docs/planos/2026-11-11-link-celular-tarefas-diario.md
--        (Ajustes — superadmin; Ajustes — visibilidade pelo responsável).
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …';
-- sucesso = a linha final 'TUDO OK'. Sem a migration (linha MIGRATION vazia), falha em
-- "superadmin NÃO vê a agenda pessoal de outra pessoa" (é o RED).
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
    sa UUID; m UUID; x UUID; e_outro UUID; e_m UUID; s_m UUID; t UUID; t_r UUID; t_s UUID; v TEXT;
    conta CONSTANT TEXT := 'SELECT count(*)::text FROM public.tasks WHERE id = %L';
    upd   CONSTANT TEXT := 'WITH u AS (UPDATE public.tasks SET %s WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u';
BEGIN
    -- sa: um superadmin com conta, owner/admin da org; m e x: membros comuns (não superadmins).
    SELECT u.id INTO sa FROM public.superadmins s JOIN auth.users u ON lower(u.email) = s.email
     WHERE EXISTS (SELECT 1 FROM public.organization_members om
                    WHERE om.organization_id = org AND om.user_id = u.id AND om.role IN ('owner', 'admin'))
     ORDER BY u.email LIMIT 1;
    PERFORM pg_temp.confere(sa IS NOT NULL, 'fixture: superadmin owner/admin da org');
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
    -- t: "agenda pessoal" de m (sem espaço, sem responsável); t_r: de m, com responsável,
    -- fora de espaço; t_s: de m, no espaço dele, sem responsável.
    INSERT INTO public.tasks (org_id, user_id, title, status, priority) VALUES (org, m, 'TS pessoal de m', 'open', 3) RETURNING id INTO t;
    INSERT INTO public.tasks (org_id, user_id, title, status, priority, assignee_employee_id) VALUES (org, m, 'TS com responsável', 'open', 3, e_outro) RETURNING id INTO t_r;
    INSERT INTO public.tasks (org_id, user_id, title, status, priority, space_id) VALUES (org, m, 'TS no espaço', 'open', 3, s_m) RETURNING id INTO t_s;

    -- ── agenda pessoal alheia: superadmin NÃO vê, não edita, não mexe nos envolvidos ──
    v := pg_temp.como(sa, format(conta, t));
    PERFORM pg_temp.confere(v = 'ok:0', 'superadmin NÃO vê a agenda pessoal de outra pessoa (veio ' || v || ')');
    v := pg_temp.como(sa, format(upd, 'title = ''TS x''', t));
    PERFORM pg_temp.confere(v = 'ok:0', 'superadmin não edita a agenda pessoal alheia (veio ' || v || ')');
    v := pg_temp.como(sa, format('INSERT INTO public.task_collaborators (task_id, employee_id) VALUES (%L, %L) RETURNING 1::text', t, e_m));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'superadmin não põe envolvido na agenda pessoal alheia (veio ' || v || ')');

    -- ── com responsável ou em espaço: vê e edita tudo ─────────────────────────
    v := pg_temp.como(sa, format('SELECT count(*)::text FROM public.tasks WHERE id IN (%L, %L)', t_r, t_s));
    PERFORM pg_temp.confere(v = 'ok:2', 'superadmin vê a tarefa com responsável e a de espaço (veio ' || v || ')');
    v := pg_temp.como(sa, format(upd, format('title = ''TS editada'', status = ''done'', assignee_employee_id = %L, space_id = %L', e_m, s_m), t_r));
    PERFORM pg_temp.confere(v = 'ok:1', 'superadmin edita título, status, responsável e espaço (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT title = 'TS editada' AND assignee_employee_id = e_m AND space_id = s_m AND completed_at IS NOT NULL
                               FROM public.tasks WHERE id = t_r), 'edição do superadmin gravada (completed_at pelo gatilho)');
    v := pg_temp.como(sa, format(upd, 'space_id = NULL, status = ''open''', t_r));
    PERFORM pg_temp.confere(v = 'ok:1', 'superadmin tira do espaço (continua com responsável) (veio ' || v || ')');
    v := pg_temp.como(sa, format(upd, 'assignee_employee_id = NULL', t_r));
    PERFORM pg_temp.confere(v LIKE '42501:só quem criou a tarefa pode deixá-la sem responsável e fora de espaço%',
        'superadmin não transforma a tarefa em agenda pessoal de m (veio ' || v || ')');
    v := pg_temp.como(sa, format(upd, 'title = ''TS espaço por sa''', t_s));
    PERFORM pg_temp.confere(v = 'ok:1', 'superadmin edita tarefa de espaço sem responsável (veio ' || v || ')');

    -- ── superadmin mexe nos envolvidos do que vê ──────────────────────────────
    v := pg_temp.como(sa, format('INSERT INTO public.task_collaborators (task_id, employee_id) VALUES (%L, %L) RETURNING 1::text', t_r, e_outro));
    PERFORM pg_temp.confere(v = 'ok:1', 'superadmin põe envolvido em tarefa que vê (veio ' || v || ')');
    v := pg_temp.como(sa, format('SELECT count(*)::text FROM public.task_collaborators WHERE task_id = %L', t_r));
    PERFORM pg_temp.confere(v = 'ok:1', 'superadmin lê os envolvidos (veio ' || v || ')');

    -- ── superadmin NÃO apaga o que não criou ──────────────────────────────────
    v := pg_temp.como(sa, format('WITH d AS (DELETE FROM public.tasks WHERE id IN (%L, %L, %L) RETURNING 1) SELECT count(*)::text FROM d', t, t_r, t_s));
    PERFORM pg_temp.confere(v = 'ok:0', 'superadmin não apaga tarefa alheia (veio ' || v || ')');

    -- ── quem não é superadmin nem owner/admin continua sem ver/editar ─────────
    v := pg_temp.como(x, format('SELECT count(*)::text FROM public.tasks WHERE id IN (%L, %L, %L)', t, t_r, t_s));
    PERFORM pg_temp.confere(v = 'ok:0', 'membro comum não vê tarefa alheia (veio ' || v || ')');
    v := pg_temp.como(x, format(upd, 'title = ''TS x''', t_r));
    PERFORM pg_temp.confere(v = 'ok:0', 'membro comum não edita tarefa alheia (veio ' || v || ')');
    v := pg_temp.como(x, format('INSERT INTO public.task_collaborators (task_id, employee_id) VALUES (%L, %L) RETURNING 1::text', t, e_outro));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'membro comum não põe envolvido na agenda pessoal alheia (veio ' || v || ')');

    -- ── o dono continua igual ─────────────────────────────────────────────────
    v := pg_temp.como(m, format('SELECT count(*)::text FROM public.tasks WHERE id IN (%L, %L, %L)', t, t_r, t_s));
    PERFORM pg_temp.confere(v = 'ok:3', 'dono continua vendo as três (veio ' || v || ')');

    -- ── forma ─────────────────────────────────────────────────────────────────
    PERFORM pg_temp.confere(
        NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks'
                     AND (policyname LIKE '%superadmin%' OR (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%is_superadmin%'))
        AND (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks'
              AND policyname IN ('tasks_select_gestor', 'tasks_update_gestor')) = 2,
        'tasks: superadmin coberto pela perna de owner/admin (tasks_*_gestor), sem policy própria');
END $$;

ROLLBACK;

SELECT 'TUDO OK' AS resultado;
