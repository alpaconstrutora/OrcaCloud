-- scripts/teste-rh-rpcs-autorizacao.sql
-- Prova: as 8 funções SECURITY DEFINER do RH só agem na organização de quem chama, e
-- colaborador só é editado por membro da organização dona.
--   hire_candidate, create_vacation_period, close_labor_diary, consolidate_evaluation_cycle,
--   esocial_create_batch, esocial_generate_s2200 (gravam) e esocial_get_dashboard, sst_indicators
--   (leem): com usuário na requisição, a organização do registro (ou a passada) tem de estar em
--   minhas_orgs_membro() — a mesma regra da RLS das tabelas que elas tocam. Colaborador de
--   férias e presentes do diário: um que quem chama enxerga (da org dele ou disponibilizado para
--   uma delas). Leitura com org nula ("Todas") devolve zeros, como antes. Sem usuário
--   (service_role, postgres) passa como antes; anon não executa.
--   employees: ver = org do usuário ou disponibilizado (igual); criar/editar/apagar = só membro
--   da org dona, e a linha nova numa org do usuário.
-- Migration: supabase/migrations/aplicar_20271117910000_rh_rpcs_autorizacao.sql
-- Plano: docs/planos/2026-11-17-rh-rpcs-autorizacao.md
--
-- Personagem: a — membro comum (não superadmin) da org A (926cf626); fora das orgs B, C e D, e
-- não é corretor nelas; vira membro da org C nesta transação.
-- Revisão (17/11, migration …910100): o colaborador de férias e do diário tem de ser DA org do
-- registro ou disponibilizado PARA ela (não basta para "uma org sua"); resposta de avaliação e
-- candidato gravados por outra org no ciclo/vaga não entram na conta.
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …'; sucesso = a linha
-- final 'TUDO OK'. Sem a migration, falha em "a contrata candidato da org B" (é o RED).
--
-- Ensaio (migration ainda não aplicada):
--   bash scripts/montar-ensaio.sh -o /tmp/e.sql scripts/teste-rh-rpcs-autorizacao.sql \
--        supabase/migrations/aplicar_20271117910000_rh_rpcs_autorizacao.sql
--   npx supabase db query --linked -f /tmp/e.sql
-- Depois de aplicada:
--   npx supabase db query --linked -f scripts/teste-rh-rpcs-autorizacao.sql

BEGIN;
-- MIGRATION

CREATE FUNCTION pg_temp.confere(p_ok BOOLEAN, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
END $$;

-- Confere o resultado de pg_temp.como: igual ao esperado, ou começando por ele quando termina em '%'.
CREATE FUNCTION pg_temp.da(p_veio TEXT, p_esperado TEXT, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_esperado LIKE '%\%' THEN
        IF p_veio LIKE p_esperado THEN RETURN; END IF;
    ELSIF p_veio = p_esperado THEN
        RETURN;
    END IF;
    RAISE EXCEPTION 'FALHOU: % (veio %, esperava %)', p_msg, p_veio, p_esperado;
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

DO $$
DECLARE
    org_a CONSTANT UUID := '926cf626-ba49-4ee4-9f35-472822fb90e6';
    org_b UUID; org_c UUID; org_d UUID; a UUID; u UUID; v TEXT;
    emp_a UUID; emp_a2 UUID; emp_b UUID; emp_bs UUID; emp_bc UUID; emp_bd UUID;
    job_a UUID; job_a2 UUID; job_b UUID; cand_a UUID; cand_a2 UUID; cand_b UUID; cand_ab UUID;
    dia_a UUID; dia_b UUID; dia_ax UUID; dia_ac UUID; dia_as UUID; ciclo_a UUID; ciclo_b UUID;
    sem_org CONSTANT TEXT := '42501:sem acesso: você não é membro da organização ';
    sem_colab_ferias CONSTANT TEXT := '42501:sem acesso ao colaborador: não é da organização informada nem foi disponibilizado para ela';
    sem_colab_diario CONSTANT TEXT := '42501:sem acesso ao colaborador: não é da organização do diário de mão de obra nem foi disponibilizado para ela';
    upd CONSTANT TEXT := 'WITH u AS (UPDATE public.employees SET %s WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u';
    del CONSTANT TEXT := 'WITH u AS (DELETE FROM public.employees WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u';
    ver CONSTANT TEXT := 'SELECT count(*)::text FROM public.employees WHERE id = %L';
    fn TEXT;
BEGIN
    -- ── fixtures ─────────────────────────────────────────────────────────────
    SELECT au.id INTO a FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
     WHERE om.organization_id = org_a AND nullif(btrim(au.email), '') IS NOT NULL
       AND lower(om.email) = lower(au.email)
       AND NOT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.email = lower(au.email))
     ORDER BY (om.role = 'member') DESC, au.id LIMIT 1;
    PERFORM pg_temp.confere(a IS NOT NULL, 'fixture: membro comum da org A (a)');

    SELECT o.id INTO org_b FROM public.organizations o
     WHERE o.id <> org_a AND NOT EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = o.id AND m.user_id = a)
     ORDER BY o.id LIMIT 1;
    SELECT o.id INTO org_c FROM public.organizations o
     WHERE o.id NOT IN (org_a, org_b) AND NOT EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = o.id AND m.user_id = a)
     ORDER BY o.id LIMIT 1;
    SELECT o.id INTO org_d FROM public.organizations o
     WHERE o.id NOT IN (org_a, org_b, org_c) AND NOT EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = o.id AND m.user_id = a)
     ORDER BY o.id LIMIT 1;
    PERFORM pg_temp.confere(org_b IS NOT NULL AND org_c IS NOT NULL AND org_d IS NOT NULL, 'fixture: três orgs (B, C, D) fora das de a');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM public.broker_profiles bp
                                          WHERE bp.organization_id IN (org_b, org_c, org_d) AND bp.is_active
                                            AND lower(bp.email) = (SELECT lower(email) FROM auth.users WHERE id = a)),
        'fixture: a não é corretor das orgs B e C');
    INSERT INTO public.organization_members (organization_id, user_id, email, role)
    VALUES (org_c, a, (SELECT email FROM auth.users WHERE id = a), 'member');

    INSERT INTO public.employees (org_id, name, status) VALUES (org_a, 'TRH colaborador A', 'ATIVO') RETURNING id INTO emp_a;
    INSERT INTO public.employees (org_id, name, status) VALUES (org_a, 'TRH colaborador A2', 'ATIVO') RETURNING id INTO emp_a2;
    INSERT INTO public.employees (org_id, name, status) VALUES (org_b, 'TRH colaborador B', 'ATIVO') RETURNING id INTO emp_b;
    INSERT INTO public.employees (org_id, name, status) VALUES (org_b, 'TRH colaborador B disponibilizado', 'ATIVO') RETURNING id INTO emp_bs;
    INSERT INTO public.employee_org_shares (employee_id, target_org_id, granted_by) VALUES (emp_bs, org_a, 'teste-rh-rpcs-autorizacao');
    -- da org B, disponibilizado para C (org de a, mas não a A) e para D (que não é de a)
    INSERT INTO public.employees (org_id, name, status) VALUES (org_b, 'TRH colaborador B para C', 'ATIVO') RETURNING id INTO emp_bc;
    INSERT INTO public.employee_org_shares (employee_id, target_org_id, granted_by) VALUES (emp_bc, org_c, 'teste-rh-rpcs-autorizacao');
    INSERT INTO public.employees (org_id, name, status) VALUES (org_b, 'TRH colaborador B para D', 'ATIVO') RETURNING id INTO emp_bd;
    INSERT INTO public.employee_org_shares (employee_id, target_org_id, granted_by) VALUES (emp_bd, org_d, 'teste-rh-rpcs-autorizacao');

    INSERT INTO public.job_openings (org_id, titulo, cargo, quantidade) VALUES (org_a, 'TRH vaga A', 'Pedreiro', 5) RETURNING id INTO job_a;
    INSERT INTO public.job_openings (org_id, titulo, cargo, quantidade) VALUES (org_b, 'TRH vaga B', 'Pedreiro', 5) RETURNING id INTO job_b;
    INSERT INTO public.candidates (org_id, job_id, nome) VALUES (org_a, job_a, 'TRH candidato A') RETURNING id INTO cand_a;
    INSERT INTO public.candidates (org_id, job_id, nome) VALUES (org_b, job_b, 'TRH candidato B') RETURNING id INTO cand_b;
    INSERT INTO public.candidates (org_id, job_id, nome) VALUES (org_a, job_b, 'TRH candidato A com vaga B') RETURNING id INTO cand_ab;
    -- vaga de A para 2; um membro de B grava na vaga de A um candidato dele já CONTRATADO (a RLS de
    -- candidates só confere o org_id do candidato; job_id é só FK)
    INSERT INTO public.job_openings (org_id, titulo, cargo, quantidade) VALUES (org_a, 'TRH vaga A2', 'Servente', 2) RETURNING id INTO job_a2;
    INSERT INTO public.candidates (org_id, job_id, nome) VALUES (org_a, job_a2, 'TRH candidato A2') RETURNING id INTO cand_a2;
    INSERT INTO public.candidates (org_id, job_id, nome, stage) VALUES (org_b, job_a2, 'TRH injetado por B', 'CONTRATADO');

    INSERT INTO public.labor_diary_entries (org_id, data, status) VALUES (org_a, CURRENT_DATE, 'ABERTO') RETURNING id INTO dia_a;
    INSERT INTO public.labor_diary_entries (org_id, data, status) VALUES (org_b, CURRENT_DATE, 'ABERTO') RETURNING id INTO dia_b;
    INSERT INTO public.labor_diary_entries (org_id, data, status) VALUES (org_a, CURRENT_DATE - 1, 'ABERTO') RETURNING id INTO dia_ax;
    INSERT INTO public.labor_diary_entries (org_id, data, status) VALUES (org_a, CURRENT_DATE - 2, 'ABERTO') RETURNING id INTO dia_ac;
    INSERT INTO public.labor_diary_entries (org_id, data, status) VALUES (org_a, CURRENT_DATE - 3, 'ABERTO') RETURNING id INTO dia_as;
    INSERT INTO public.labor_diary_workers (diary_entry_id, employee_id, horas_trabalhadas, horas_extras, presente) VALUES
        (dia_a, emp_a, 8, 0, true), (dia_b, emp_b, 8, 0, true), (dia_ax, emp_a, 8, 0, true), (dia_ax, emp_b, 8, 0, true),
        (dia_ac, emp_bc, 8, 0, true), (dia_as, emp_bs, 8, 0, true);

    INSERT INTO public.evaluation_cycles (org_id, nome, periodo_inicio, periodo_fim) VALUES (org_a, 'TRH ciclo A', CURRENT_DATE - 30, CURRENT_DATE) RETURNING id INTO ciclo_a;
    INSERT INTO public.evaluation_cycles (org_id, nome, periodo_inicio, periodo_fim) VALUES (org_b, 'TRH ciclo B', CURRENT_DATE - 30, CURRENT_DATE) RETURNING id INTO ciclo_b;
    -- ciclo de A: a nota do gestor de A, mais duas respostas que um membro de B consegue gravar
    -- (a RLS de evaluation_responses só confere o org_id da resposta; cycle_id é só FK)
    INSERT INTO public.evaluation_responses (org_id, cycle_id, evaluatee_id, tipo, nota_media, status) VALUES
        (org_a, ciclo_a, emp_a, 'GESTOR', 5, 'CONCLUIDA'),
        (org_b, ciclo_a, emp_a, 'PAR', 1, 'CONCLUIDA'),
        (org_b, ciclo_a, emp_b, 'GESTOR', 2, 'CONCLUIDA');

    -- ── hire_candidate ───────────────────────────────────────────────────────
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.hire_candidate(%L)::text', cand_b)),
        sem_org || 'do candidato', 'a contrata candidato da org B');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.hire_candidate(%L)::text', cand_ab)),
        sem_org || 'da vaga', 'a contrata candidato da org A para vaga da org B');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.hire_candidate(%L)::text', cand_a)),
        'ok:%', 'a contrata candidato da org A');
    PERFORM pg_temp.confere((SELECT stage FROM public.candidates WHERE id = cand_a) = 'CONTRATADO',
        'candidato da org A ficou CONTRATADO');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.hire_candidate(%L)::text', cand_a2)),
        'ok:%', 'a contrata o 1º de 2 da vaga A2');
    PERFORM pg_temp.confere((SELECT status FROM public.job_openings WHERE id = job_a2) IS DISTINCT FROM 'FECHADA',
        'vaga A2 (2 vagas, 1 contratado de A) segue aberta: o candidato que B gravou nela não conta');

    -- ── create_vacation_period ───────────────────────────────────────────────
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.create_vacation_period(%L, %L, %L)::text', emp_b, org_b, '2026-01-01')),
        sem_org || 'informada', 'a cria período de férias na org B');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.create_vacation_period(%L, %L, %L)::text', emp_b, org_a, '2026-01-01')),
        sem_colab_ferias, 'a cria período na org A para colaborador da org B que ele não enxerga');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.create_vacation_period(%L, %L, %L)::text', emp_bd, org_a, '2026-01-01')),
        sem_colab_ferias, 'a cria período na org A para colaborador da org B disponibilizado para D (que não é de a)');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.create_vacation_period(%L, %L, %L)::text', emp_bc, org_a, '2026-01-01')),
        sem_colab_ferias, 'a cria período na org A para colaborador disponibilizado para C, não para A');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.create_vacation_period(%L, %L, %L)::text', emp_bc, org_c, '2026-01-01')),
        'ok:%', 'a cria período na org C para colaborador disponibilizado para C');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.create_vacation_period(%L, %L, %L)::text', emp_a, org_a, '2026-01-01')),
        'ok:%', 'a cria período na org A para colaborador da org A');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.create_vacation_period(%L, %L, %L)::text', emp_bs, org_a, '2026-01-01')),
        'ok:%', 'a cria período na org A para colaborador da org B disponibilizado para A');

    -- ── close_labor_diary ────────────────────────────────────────────────────
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.close_labor_diary(%L)::text', dia_b)),
        sem_org || 'do diário de mão de obra', 'a fecha diário da org B');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.close_labor_diary(%L)::text', dia_ax)),
        sem_colab_diario, 'a fecha diário da org A com presente da org B que ele não enxerga');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM public.time_entries WHERE employee_id = emp_b),
        'diário recusado não deixou apontamento');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.close_labor_diary(%L)::text', dia_ac)),
        sem_colab_diario, 'a fecha diário da org A com presente disponibilizado para C, não para A');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT (public.close_labor_diary(%L)->>''success'')', dia_as)),
        'ok:true', 'a fecha diário da org A com presente disponibilizado para A');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT (public.close_labor_diary(%L)->>''success'')', dia_a)),
        'ok:true', 'a fecha diário da org A');

    -- ── consolidate_evaluation_cycle ─────────────────────────────────────────
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.consolidate_evaluation_cycle(%L)::text', ciclo_b)),
        sem_org || 'do ciclo de avaliação', 'a consolida ciclo da org B');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT (public.consolidate_evaluation_cycle(%L)->>''consolidados'')', ciclo_a)),
        'ok:1', 'a consolida ciclo da org A (só o avaliado de A)');
    PERFORM pg_temp.confere((SELECT nota_final FROM public.evaluation_results WHERE cycle_id = ciclo_a AND employee_id = emp_a) = 5,
        'nota final do colaborador de A = 5 (a nota que B gravou no ciclo de A não entra)');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM public.evaluation_results WHERE cycle_id = ciclo_a AND employee_id = emp_b),
        'colaborador de B não ganha resultado no ciclo de A');

    -- ── esocial_create_batch ─────────────────────────────────────────────────
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.esocial_create_batch(%L, %L)::text', org_b, 'NAO_PERIODICOS')),
        sem_org || 'informada', 'a cria lote do eSocial na org B');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.esocial_create_batch(NULL, %L)::text', 'NAO_PERIODICOS')),
        '42501:sem acesso: informe uma organização de que você é membro', 'a cria lote do eSocial sem organização');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT (public.esocial_create_batch(%L, %L)->>''success'')', org_a, 'NAO_PERIODICOS')),
        'ok:true', 'a cria lote do eSocial na org A');

    -- ── esocial_generate_s2200 ───────────────────────────────────────────────
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.esocial_generate_s2200(%L)::text', emp_b)),
        sem_org || 'do colaborador', 'a gera S-2200 de colaborador da org B');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.esocial_generate_s2200(%L)::text', emp_bs)),
        sem_org || 'do colaborador', 'a gera S-2200 de colaborador da org B disponibilizado para A (admissão é da org dona)');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT (public.esocial_generate_s2200(%L)->>''success'')', emp_a)),
        'ok:true', 'a gera S-2200 de colaborador da org A');

    -- ── leituras ─────────────────────────────────────────────────────────────
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.esocial_get_dashboard(%L)::text', org_b)),
        sem_org || 'informada', 'a lê o painel do eSocial da org B');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT (public.esocial_get_dashboard(%L)->>''pendentes'')', org_a)),
        'ok:%', 'a lê o painel do eSocial da org A');
    PERFORM pg_temp.da(pg_temp.au(a, 'SELECT (public.esocial_get_dashboard(NULL)->>''pendentes'')'),
        'ok:0', 'a lê o painel do eSocial em "Todas" (zeros, como antes)');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.sst_indicators(%L, 2026)::text', org_b)),
        sem_org || 'informada', 'a lê indicadores de SST da org B');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT (public.sst_indicators(%L, 2026)->>''ano'')', org_a)),
        'ok:2026', 'a lê indicadores de SST da org A');
    PERFORM pg_temp.da(pg_temp.au(a, 'SELECT (public.sst_indicators(NULL, 2026)->>''total_acidentes'')'),
        'ok:0', 'a lê indicadores de SST em "Todas" (zeros, como antes)');

    -- ── sem usuário passa; anon não executa ──────────────────────────────────
    PERFORM pg_temp.da(pg_temp.como(NULL, 'service_role', format('SELECT (public.sst_indicators(%L, 2026)->>''ano'')', org_b)),
        'ok:2026', 'service_role lê indicadores de SST da org B');
    PERFORM pg_temp.da(pg_temp.como(NULL, 'service_role', format('SELECT (public.esocial_create_batch(%L, %L)->>''success'')', org_b, 'NAO_PERIODICOS')),
        'ok:true', 'service_role cria lote do eSocial na org B');
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM pg_temp.confere((public.esocial_get_dashboard(org_b)->>'pendentes') IS NOT NULL, 'postgres sem usuário lê o painel da org B');
    PERFORM pg_temp.da(pg_temp.como(NULL, 'anon', format('SELECT public.sst_indicators(%L, 2026)::text', org_a)),
        '42501:permission denied for function sst_indicators', 'anon lê indicadores de SST');

    -- ── privilégios ──────────────────────────────────────────────────────────
    FOREACH fn IN ARRAY ARRAY[
        'public.hire_candidate(uuid,date)', 'public.create_vacation_period(uuid,uuid,date)',
        'public.close_labor_diary(uuid)', 'public.consolidate_evaluation_cycle(uuid)',
        'public.esocial_create_batch(uuid,text,text)', 'public.esocial_generate_s2200(uuid)',
        'public.esocial_get_dashboard(uuid)', 'public.sst_indicators(uuid,integer)'] LOOP
        PERFORM pg_temp.confere(has_function_privilege('authenticated', fn, 'EXECUTE')
                                AND has_function_privilege('service_role', fn, 'EXECUTE')
                                AND NOT has_function_privilege('anon', fn, 'EXECUTE')
                                AND (SELECT prosecdef FROM pg_proc WHERE oid = fn::regprocedure),
            'privilégios de ' || fn || ': DEFINER, authenticated e service_role sim, anon não');
    END LOOP;
    PERFORM pg_temp.confere(to_regprocedure('public._rh_exige_colaborador(uuid)') IS NULL,
        'a versão de 1 argumento do helper de colaborador não existe mais');
    FOREACH fn IN ARRAY ARRAY['public._rh_exige_org(uuid,text)', 'public._rh_exige_colaborador(uuid,uuid,text)'] LOOP
        PERFORM pg_temp.confere(NOT has_function_privilege('authenticated', fn, 'EXECUTE')
                                AND NOT has_function_privilege('anon', fn, 'EXECUTE'),
            'helper ' || fn || ' não é chamável pela API');
    END LOOP;

    -- ── employees ────────────────────────────────────────────────────────────
    PERFORM pg_temp.da(pg_temp.au(a, format(ver, emp_bs)), 'ok:1', 'a vê colaborador da org B disponibilizado para A');
    PERFORM pg_temp.da(pg_temp.au(a, format(ver, emp_b)), 'ok:0', 'a não vê colaborador da org B não disponibilizado');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'name = ''TRH editado''', emp_bs)), 'ok:0',
        'a edita colaborador da org B só porque foi disponibilizado para A');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, format('org_id = %L', org_a), emp_bs)), 'ok:0',
        'a traz para a org A colaborador da org B disponibilizado');
    PERFORM pg_temp.da(pg_temp.au(a, format(del, emp_bs)), 'ok:0',
        'a apaga colaborador da org B disponibilizado para A');
    PERFORM pg_temp.confere((SELECT org_id FROM public.employees WHERE id = emp_bs) = org_b
                            AND (SELECT name FROM public.employees WHERE id = emp_bs) = 'TRH colaborador B disponibilizado',
        'colaborador disponibilizado segue intacto na org B');
    -- a disponibiliza o próprio colaborador para a org dele (a policy de compartilhamento deixa)…
    PERFORM pg_temp.da(pg_temp.au(a, format('INSERT INTO public.employee_org_shares (employee_id, target_org_id, granted_by) VALUES (%L, %L, %L) RETURNING 1::text', emp_a2, org_a, 'teste')),
        'ok:1', 'a disponibiliza colaborador da org A para a própria org A');
    -- …e não consegue mais, com isso, mandá-lo para uma org de que não é membro.
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, format('org_id = %L', org_b), emp_a2)), '42501:new row violates row-level security policy%',
        'a manda colaborador da org A para a org B, de que não é membro');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, format('org_id = %L', org_c), emp_a2)), 'ok:1',
        'a move colaborador da org A para a org C, sendo membro das duas');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'name = ''TRH A editado''', emp_a)), 'ok:1',
        'a edita colaborador da org A');
    PERFORM pg_temp.da(pg_temp.au(a, format('INSERT INTO public.employees (org_id, name, status) VALUES (%L, %L, %L) RETURNING 1::text', org_b, 'TRH novo B', 'ATIVO')),
        '42501:new row violates row-level security policy%', 'a cria colaborador na org B');
    PERFORM pg_temp.da(pg_temp.au(a, format('INSERT INTO public.employees (org_id, name, status) VALUES (%L, %L, %L) RETURNING 1::text', org_a, 'TRH novo A', 'ATIVO')),
        'ok:1', 'a cria colaborador na org A');
    PERFORM pg_temp.da(pg_temp.au(a, format(del, emp_a2)), 'ok:1', 'a apaga colaborador da org C (agora dele)');

    RAISE NOTICE 'TUDO OK';
END $$;

SELECT 'TUDO OK' AS resultado;
ROLLBACK;
