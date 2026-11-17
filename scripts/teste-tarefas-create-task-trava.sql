-- scripts/teste-tarefas-create-task-trava.sql
-- Prova: só cria tarefa numa organização quem é membro dela, e só para alguém dela.
--   create_task (SECURITY DEFINER) — com usuário na requisição:
--     · a organização tem de ser uma das do usuário (minhas_orgs_membro);
--     · a pessoa tem de ser ele mesmo, um membro da organização, ou o login de um colaborador
--       da organização (próprio ou disponibilizado para ela por employee_org_shares).
--   Sem usuário (pg_cron como postgres, service_role) passa como antes; anon não executa.
--   Tabela tasks: inserir direto exige organização do usuário (policy tasks_insert); trocar a
--   organização de uma tarefa exige o mesmo (gatilho trg_tasks_troca_de_org), mas editar a própria tarefa antiga de
--   uma organização da qual saiu continua possível.
-- Migration: supabase/migrations/aplicar_20271117900000_tarefas_create_task_trava.sql
-- Plano: docs/planos/2026-11-17-rotinas-itens-de-fora.md (Tarefa 1).
--
-- Personagens (contas reais de auth.users, nenhuma superadmin):
--   a — membro comum da org A (926cf626); fora das orgs B e C;
--   b — outro membro da org A;
--   x — fora da org A, sem colaborador;
--   e — fora da org A, login de um colaborador DA org A (criado nesta transação);
--   f — fora da org A, login de um colaborador da org B DISPONIBILIZADO para A;
--   g — fora da org A, login de um colaborador da org B NÃO disponibilizado (a não é de B);
--   h — fora da org A, login de um colaborador da org C (a é membro de C nesta transação), não
--       disponibilizado para A — o seletor da ordem de execução oferece, então passa;
-- Sem caso: membro só pelo e-mail (linha com user_id nulo). O gatilho trg_org_member_fill_user_id
-- preenche o user_id pelo e-mail em todo INSERT/UPDATE (0 de 28 linhas sem user_id em 17/11); a perna
-- só existe entre um convite e a conta ser criada, e não dá para montá-la aqui sem desligar o gatilho.
-- Revisão (17/11): ex-membro não abre a tarefa antiga para os outros (responsável, espaço, pasta,
-- obra, tarefa-mãe); Envolvidos só em tarefa de org do usuário e com colaborador que ele enxerga.
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …'; sucesso = a linha
-- final 'TUDO OK'. Sem a migration, falha em "a cria tarefa na org B" (é o RED).
--
-- Ensaio (migration ainda não aplicada):
--   bash scripts/montar-ensaio.sh -o /tmp/e.sql scripts/teste-tarefas-create-task-trava.sql \
--        supabase/migrations/aplicar_20271117900000_tarefas_create_task_trava.sql
--   npx supabase db query --linked -f /tmp/e.sql
-- Depois de aplicada:
--   npx supabase db query --linked -f scripts/teste-tarefas-create-task-trava.sql

BEGIN;
-- MIGRATION

CREATE FUNCTION pg_temp.confere(p_ok BOOLEAN, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
END $$;

-- Claims de um usuário real (sub + e-mail de auth.users), como o PostgREST monta.
CREATE FUNCTION pg_temp.claims(p_user UUID, p_papel TEXT) RETURNS TEXT LANGUAGE sql AS $$
    SELECT CASE WHEN p_user IS NULL THEN json_build_object('role', p_papel)::text
                ELSE json_build_object('sub', p_user,
                                       'email', (SELECT u.email FROM auth.users u WHERE u.id = p_user),
                                       'role', p_papel)::text END
$$;

-- Roda p_sql como p_papel com as claims de p_user; 'ok:<resultado>' ou '<SQLSTATE>:<mensagem>'.
CREATE FUNCTION pg_temp.como(p_user UUID, p_papel TEXT, p_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
    PERFORM set_config('request.jwt.claims', pg_temp.claims(p_user, p_papel), true);
    BEGIN
        EXECUTE format('SET LOCAL ROLE %I', p_papel);
        EXECUTE p_sql INTO v;
        v := 'ok:' || coalesce(v, '<null>');
    EXCEPTION WHEN OTHERS THEN
        v := SQLSTATE || ':' || SQLERRM;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN v;
END $$;

CREATE FUNCTION pg_temp.au(p_user UUID, p_sql TEXT) RETURNS TEXT LANGUAGE sql AS $$
    SELECT pg_temp.como(p_user, 'authenticated', p_sql)
$$;

-- create_task(pessoa, org, título) como SQL, para pg_temp.como.
CREATE FUNCTION pg_temp.ct(p_pessoa UUID, p_org UUID, p_titulo TEXT) RETURNS TEXT LANGUAGE sql AS $$
    SELECT format('SELECT public.create_task(%L::uuid, %L::uuid, %L)::text', p_pessoa, p_org, p_titulo)
$$;

DO $$
DECLARE
    org_a CONSTANT UUID := '926cf626-ba49-4ee4-9f35-472822fb90e6';
    org_b UUID; org_c UUID;
    a UUID; b UUID; x UUID; e UUID; f UUID; g UUID; h UUID; u UUID;
    emp_e UUID; emp_f UUID; emp_g UUID; t_a UUID; t_a2 UUID; t_b UUID; v TEXT;
    sig CONSTANT TEXT := 'public.create_task(uuid,uuid,text,timestamp with time zone,text,jsonb,smallint,text)';
    recusa_org    CONSTANT TEXT := '42501:sem acesso à organização da tarefa: só quem é membro dela cria tarefa nela';
    recusa_pessoa CONSTANT TEXT := '42501:a tarefa só vai para a agenda de um membro da organização dela ou de um colaborador que você enxerga (de uma organização sua, ou disponibilizado para uma delas)';
    recusa_exmembro CONSTANT TEXT := '42501:esta tarefa é de uma organização da qual você não é membro: responsável, espaço, pasta, obra e tarefa-mãe ficam como estão (o conteúdo e o andamento continuam editáveis)';
    colab CONSTANT TEXT := 'INSERT INTO public.task_collaborators (task_id, employee_id) VALUES (%L, %L) RETURNING 1::text';
    recusa_troca  CONSTANT TEXT := '42501:a organização da tarefa só muda para uma organização de que você é membro';
    upd CONSTANT TEXT := 'WITH u AS (UPDATE public.tasks SET %s WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u';
    ins CONSTANT TEXT := 'INSERT INTO public.tasks (org_id, user_id, title, status, priority) VALUES (%L, %L, %L, ''open'', 3) RETURNING id::text';
BEGIN
    -- ── fixtures ─────────────────────────────────────────────────────────────
    FOR u IN
        SELECT au.id FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
         WHERE om.organization_id = org_a AND nullif(btrim(au.email), '') IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.email = lower(au.email))
         ORDER BY (om.role = 'member') DESC, au.id
    LOOP
        IF a IS NULL THEN a := u; ELSIF b IS NULL THEN b := u; END IF;
    END LOOP;
    PERFORM pg_temp.confere(b IS NOT NULL, 'fixture: dois membros da org A (a, b)');

    SELECT o.id INTO org_b FROM public.organizations o
     WHERE o.id <> org_a AND NOT EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = o.id AND m.user_id = a)
     ORDER BY o.id LIMIT 1;
    SELECT o.id INTO org_c FROM public.organizations o
     WHERE o.id NOT IN (org_a, org_b) AND NOT EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = o.id AND m.user_id = a)
     ORDER BY o.id LIMIT 1;
    PERFORM pg_temp.confere(org_b IS NOT NULL AND org_c IS NOT NULL, 'fixture: duas orgs (B, C) fora das de a');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM public.broker_profiles bp
                                          WHERE bp.organization_id IN (org_b, org_c) AND bp.is_active
                                            AND lower(bp.email) = (SELECT lower(email) FROM auth.users WHERE id = a)),
        'fixture: a não é corretor das orgs B e C');

    FOR u IN
        SELECT au.id FROM auth.users au
         WHERE nullif(btrim(au.email), '') IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.email = lower(au.email))
           AND NOT EXISTS (SELECT 1 FROM public.organization_members m
                            WHERE m.organization_id = org_a AND (m.user_id = au.id OR lower(m.email) = lower(au.email)))
           AND NOT EXISTS (SELECT 1 FROM public.employees em WHERE em.user_id = au.id)
         ORDER BY au.id
    LOOP
        IF x IS NULL THEN x := u; ELSIF e IS NULL THEN e := u; ELSIF f IS NULL THEN f := u;
        ELSIF g IS NULL THEN g := u; ELSIF h IS NULL THEN h := u; END IF;
    END LOOP;
    PERFORM pg_temp.confere(h IS NOT NULL, 'fixture: cinco contas fora da org A e sem colaborador (x, e, f, g, h)');

    -- a passa a ser membro da org C (B continua fora)
    INSERT INTO public.organization_members (organization_id, user_id, email, role)
    VALUES (org_c, a, (SELECT email FROM auth.users WHERE id = a), 'member');
    INSERT INTO public.employees (org_id, name, user_id, status) VALUES (org_a, 'TCT colaborador e', e, 'ATIVO') RETURNING id INTO emp_e;
    INSERT INTO public.employees (org_id, name, user_id, status) VALUES (org_b, 'TCT colaborador f', f, 'ATIVO') RETURNING id INTO emp_f;
    INSERT INTO public.employee_org_shares (employee_id, target_org_id, granted_by) VALUES (emp_f, org_a, 'teste-tarefas-create-task-trava');
    INSERT INTO public.employees (org_id, name, user_id, status) VALUES (org_b, 'TCT colaborador g', g, 'ATIVO') RETURNING id INTO emp_g;
    INSERT INTO public.employees (org_id, name, user_id, status) VALUES (org_c, 'TCT colaborador h', h, 'ATIVO');
    PERFORM pg_temp.confere(
        NOT EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = org_a AND m.user_id IN (x, e, f, g, h)),
        'fixture: x, e, f, g, h seguem fora da org A depois de virar colaboradores');

    -- ── create_task com usuário ──────────────────────────────────────────────
    v := pg_temp.au(a, pg_temp.ct(a, org_a, 'TCT a para si'));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND v <> 'ok:<null>', 'a cria tarefa para si na org A (veio ' || v || ')');
    v := pg_temp.au(a, pg_temp.ct(b, org_a, 'TCT a para b'));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND v <> 'ok:<null>', 'a cria tarefa para b, membro da org A (veio ' || v || ')');
    v := pg_temp.au(a, pg_temp.ct(e, org_a, 'TCT a para e'));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND v <> 'ok:<null>', 'a cria tarefa para e, colaborador da org A (veio ' || v || ')');
    v := pg_temp.au(a, pg_temp.ct(f, org_a, 'TCT a para f'));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND v <> 'ok:<null>', 'a cria tarefa para f, colaborador disponibilizado para A (veio ' || v || ')');
    v := pg_temp.au(a, pg_temp.ct(h, org_a, 'TCT a para h'));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND v <> 'ok:<null>', 'a cria tarefa na org A para h, colaborador da org C dele (veio ' || v || ')');

    v := pg_temp.au(a, pg_temp.ct(a, org_b, 'TCT a na org B'));
    PERFORM pg_temp.confere(v = recusa_org, 'a cria tarefa na org B (veio ' || v || ')');
    v := pg_temp.au(a, pg_temp.ct(b, org_b, 'TCT a para b na org B'));
    PERFORM pg_temp.confere(v = recusa_org, 'a cria tarefa para b na org B (veio ' || v || ')');
    v := pg_temp.au(a, pg_temp.ct(x, org_a, 'TCT a para x'));
    PERFORM pg_temp.confere(v = recusa_pessoa, 'a cria tarefa para x, fora da org A (veio ' || v || ')');
    v := pg_temp.au(a, pg_temp.ct(g, org_a, 'TCT a para g'));
    PERFORM pg_temp.confere(v = recusa_pessoa, 'a cria tarefa para g, colaborador da org B não disponibilizado (veio ' || v || ')');
    v := pg_temp.au(a, format('SELECT public.create_task(NULL::uuid, %L::uuid, %L)::text', org_a, 'TCT pessoa nula'));
    PERFORM pg_temp.confere(v = recusa_pessoa, 'a cria tarefa sem pessoa (veio ' || v || ')');
    v := pg_temp.au(a, format('SELECT public.create_task(%L::uuid, NULL::uuid, %L)::text', a, 'TCT org nula'));
    PERFORM pg_temp.confere(v = recusa_org, 'a cria tarefa sem organização (veio ' || v || ')');

    -- ── sem usuário: rotinas seguem como antes; anon não executa ─────────────
    v := pg_temp.como(NULL, 'service_role', pg_temp.ct(x, org_a, 'TCT service_role para x'));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND v <> 'ok:<null>', 'service_role cria para qualquer pessoa (veio ' || v || ')');
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM pg_temp.confere(public.create_task(x, org_b, 'TCT postgres para x') IS NOT NULL,
        'postgres sem usuário (pg_cron) cria para qualquer pessoa');
    v := pg_temp.como(NULL, 'anon', pg_temp.ct(a, org_a, 'TCT anon'));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'anon não executa create_task (veio ' || v || ')');

    -- ── tabela tasks direto ──────────────────────────────────────────────────
    v := pg_temp.au(a, format(ins, org_a, a, 'TCT direto em A'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'a insere direto na org A (veio ' || v || ')');
    t_a := substr(v, 4)::uuid;
    v := pg_temp.au(a, format(ins, org_b, a, 'TCT direto em B'));
    PERFORM pg_temp.confere(v LIKE '42501:%row-level security%', 'a insere direto na org B (veio ' || v || ')');

    v := pg_temp.au(a, format(upd, format('org_id = %L', org_b), t_a));
    PERFORM pg_temp.confere(v = recusa_troca, 'a troca a própria tarefa da org A para a B (veio ' || v || ')');
    v := pg_temp.au(a, format(upd, format('org_id = %L', org_c), t_a));
    PERFORM pg_temp.confere(v = 'ok:1', 'a troca a própria tarefa para a org C, da qual é membro (veio ' || v || ')');
    v := pg_temp.au(a, format(upd, 'title = ''TCT direto em C, editada''', t_a));
    PERFORM pg_temp.confere(v = 'ok:1', 'a edita a própria tarefa sem trocar a org (veio ' || v || ')');

    -- ex-membro: tarefa antiga de a na org B (a não é membro de B) continua editável por ele
    INSERT INTO public.tasks (org_id, user_id, title, status, priority) VALUES (org_b, a, 'TCT antiga em B', 'open', 3) RETURNING id INTO t_b;
    v := pg_temp.au(a, format(upd, 'status = ''done'', completed_at = now()', t_b));
    PERFORM pg_temp.confere(v = 'ok:1', 'a conclui a própria tarefa antiga da org B (veio ' || v || ')');
    v := pg_temp.au(a, format(upd, 'title = ''TCT antiga em B, editada''', t_b));
    PERFORM pg_temp.confere(v = 'ok:1', 'a edita o título da própria tarefa antiga da org B (veio ' || v || ')');
    -- …mas não a abre para os outros de B
    v := pg_temp.au(a, format(upd, format('assignee_employee_id = %L', emp_g), t_b));
    PERFORM pg_temp.confere(v = recusa_exmembro, 'a põe colaborador de B como responsável da tarefa antiga (veio ' || v || ')');

    -- ── Envolvidos ───────────────────────────────────────────────────────────
    v := pg_temp.au(a, format(ins, org_a, a, 'TCT com envolvidos'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'a cria tarefa para os envolvidos (veio ' || v || ')');
    t_a2 := substr(v, 4)::uuid;
    v := pg_temp.au(a, format(colab, t_a2, emp_e));
    PERFORM pg_temp.confere(v = 'ok:1', 'a põe colaborador da org A como envolvido (veio ' || v || ')');
    v := pg_temp.au(a, format(colab, t_a2, emp_g));
    PERFORM pg_temp.confere(v LIKE '42501:%row-level security%', 'a põe colaborador da org B (que ele não enxerga) como envolvido (veio ' || v || ')');
    v := pg_temp.au(a, format('WITH u AS (UPDATE public.task_collaborators SET employee_id = %L WHERE task_id = %L AND employee_id = %L RETURNING 1) SELECT count(*)::text FROM u', emp_g, t_a2, emp_e));
    PERFORM pg_temp.confere(v LIKE '42501:%row-level security%', 'a troca o envolvido por colaborador da org B (veio ' || v || ')');
    v := pg_temp.au(a, format(colab, t_b, emp_e));
    PERFORM pg_temp.confere(v LIKE '42501:%row-level security%', 'a põe envolvido na tarefa antiga da org B (veio ' || v || ')');

    -- ── privilégios ──────────────────────────────────────────────────────────
    PERFORM pg_temp.confere(
        NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) ac WHERE p.oid = sig::regprocedure AND ac.grantee = 0)
        AND NOT has_function_privilege('anon', sig, 'EXECUTE')
        AND has_function_privilege('authenticated', sig, 'EXECUTE')
        AND has_function_privilege('service_role', sig, 'EXECUTE')
        AND (SELECT p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig) FROM pg_proc p WHERE p.oid = sig::regprocedure),
        'create_task: sem PUBLIC/anon; authenticated e service_role executam; SECURITY DEFINER com search_path fixo');
    PERFORM pg_temp.confere(
        to_regprocedure('public._tasks_org_so_das_minhas()') IS NOT NULL
        AND NOT has_function_privilege('anon', 'public._tasks_org_so_das_minhas()', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public._tasks_org_so_das_minhas()', 'EXECUTE')
        AND EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.tasks'::regclass
                     AND t.tgname = 'trg_tasks_troca_de_org' AND NOT t.tgisinternal)
        AND NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.tasks'::regclass
                         AND t.tgname = 'trg_tasks_org_so_das_minhas'),
        -- A ordem em relação ao gatilho do responsável (ele dispara antes e dá a mensagem mais útil)
        -- é provada por scripts/teste-tarefas-responsavel.sql ("Iago levando a tarefa para outra org").
        'gatilho trg_tasks_troca_de_org existe; a função dele não é chamável pela API');
END $$;

ROLLBACK;

SELECT 'TUDO OK' AS resultado;
