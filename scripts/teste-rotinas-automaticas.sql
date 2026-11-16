-- scripts/teste-rotinas-automaticas.sql
-- Prova: Configurações › Rotinas automáticas — só superadmin lista e liga/desliga os jobs do
-- pg_cron; cada mudança fica registrada; pedir o estado que já está não grava nada.
-- Migrations: supabase/migrations/aplicar_20271116907000_rotinas_automaticas_ligar_desligar.sql
--             supabase/migrations/aplicar_20271116913700_rotinas_automaticas_pendencias.sql
--             (último erro, janela de 40 dias, rotina sem nome por p_jobid)
-- Planos:    docs/planos/2026-11-16-rotinas-automaticas-ligar-desligar.md (Task 1)
--            docs/planos/2026-11-16-rotinas-automaticas-pendencias-menores.md (item 1)
--
-- Personagens (contas reais):
--   sa — um superadmin (e-mail em public.superadmins);
--   m  — membro de uma organização, fora de superadmins.
-- Rotina usada para ligar/desligar: `hourly-bi-report-check` (0 agendamentos de BI ativos
-- em 16/11/2026 — não faz nada de útil hoje). Vai para o estado OPOSTO ao atual.
--
-- BEGIN … ROLLBACK: não grava nada (cron.alter_job também volta). Falha = RAISE EXCEPTION
-- 'FALHOU: …'; sucesso = a linha final 'TUDO OK'. Sem a migration (linha MIGRATION vazia),
-- falha em "superadmin lista todas" (a função não existe) — é o RED.
--
-- Ensaio (migration ainda não aplicada):
--   bash scripts/montar-ensaio.sh -o /tmp/e.sql scripts/teste-rotinas-automaticas.sql \
--        supabase/migrations/aplicar_20271116913700_rotinas_automaticas_pendencias.sql
--   npx supabase db query --linked -f /tmp/e.sql
-- Depois de aplicada:
--   npx supabase db query --linked -f scripts/teste-rotinas-automaticas.sql

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

DO $$
DECLARE
    rotina CONSTANT TEXT := 'hourly-bi-report-check';
    sa UUID; sa_email TEXT; m UUID;
    total INT; antes BOOLEAN; registros INT; v TEXT; sem_nome BIGINT;
    recusa CONSTANT TEXT := '42501:apenas superadmin';
BEGIN
    -- ── fixtures (uid tirado de auth.users ANTES de qualquer SET ROLE) ──────
    SELECT au.id, lower(au.email) INTO sa, sa_email FROM auth.users au
     WHERE EXISTS (SELECT 1 FROM public.superadmins x WHERE x.email = lower(au.email))
     ORDER BY au.id LIMIT 1;
    PERFORM pg_temp.confere(sa IS NOT NULL, 'fixture: um superadmin com conta');
    SELECT au.id INTO m FROM auth.users au JOIN public.organization_members om ON om.user_id = au.id
     WHERE NOT EXISTS (SELECT 1 FROM public.superadmins x WHERE x.email = lower(au.email))
       AND nullif(btrim(au.email), '') IS NOT NULL
     ORDER BY au.id LIMIT 1;
    PERFORM pg_temp.confere(m IS NOT NULL, 'fixture: um membro fora de superadmins');
    SELECT count(*) INTO total FROM cron.job;
    SELECT j.active INTO antes FROM cron.job j WHERE j.jobname = rotina;
    PERFORM pg_temp.confere(antes IS NOT NULL, 'fixture: a rotina ' || rotina || ' existe');

    -- ── superadmin: lista todas ─────────────────────────────────────────────
    v := pg_temp.au(sa, 'SELECT count(*)::text FROM public.fn_rotinas_automaticas_listar()');
    PERFORM pg_temp.confere(v = 'ok:' || total, 'superadmin lista todas (' || total || ') — veio ' || v);

    -- rotina mensal: a janela do histórico alcança o dia 1
    v := pg_temp.au(sa, $q$SELECT (ultima_inicio IS NOT NULL)::text FROM public.fn_rotinas_automaticas_listar()
                           WHERE jobname = 'monthly-investor-report'$q$);
    PERFORM pg_temp.confere(v = 'ok:true', 'monthly-investor-report com última execução — veio ' || v);

    -- o estado listado é o do cron.job
    v := pg_temp.au(sa, format('SELECT active::text FROM public.fn_rotinas_automaticas_listar() WHERE jobname = %L', rotina));
    PERFORM pg_temp.confere(v = 'ok:' || antes, 'estado listado = cron.job.active — veio ' || v);

    -- ── superadmin: muda para o oposto ──────────────────────────────────────
    v := pg_temp.au(sa, format('SELECT active::text FROM public.fn_rotina_automatica_definir(%L, %L)', rotina, NOT antes));
    PERFORM pg_temp.confere(v = 'ok:' || (NOT antes), 'definir devolve a linha no novo estado — veio ' || v);
    PERFORM pg_temp.confere((SELECT j.active FROM cron.job j WHERE j.jobname = rotina) = NOT antes,
        'cron.job.active mudou de verdade');
    SELECT count(*) INTO registros FROM public.rotinas_automaticas_alteracoes r
     WHERE r.jobname = rotina AND r.ativo_antes = antes AND r.ativo_depois = NOT antes
       AND r.alterado_por = sa AND r.alterado_por_email = sa_email
       AND r.alterado_em >= now();   -- só as desta transação: o registro real já tem linhas
    PERFORM pg_temp.confere(registros = 1, 'uma linha no registro com quem mudou — achou ' || registros);
    v := pg_temp.au(sa, format($q$SELECT alterado_ativo_depois::text || '|' || alterado_por_email
                                  FROM public.fn_rotinas_automaticas_listar() WHERE jobname = %L$q$, rotina));
    PERFORM pg_temp.confere(v = 'ok:' || (NOT antes) || '|' || sa_email, 'listar mostra a última alteração — veio ' || v);

    -- ── mesmo estado de novo: nada grava ────────────────────────────────────
    v := pg_temp.au(sa, format('SELECT active::text FROM public.fn_rotina_automatica_definir(%L, %L)', rotina, NOT antes));
    PERFORM pg_temp.confere(v = 'ok:' || (NOT antes), 'definir repetido devolve a linha — veio ' || v);
    PERFORM pg_temp.confere((SELECT count(*) FROM public.rotinas_automaticas_alteracoes r WHERE r.jobname = rotina
                              AND r.alterado_por = sa AND r.alterado_em >= now()) = 1,
        'definir repetido não grava registro');

    -- ── rotina inexistente ──────────────────────────────────────────────────
    v := pg_temp.au(sa, 'SELECT active::text FROM public.fn_rotina_automatica_definir(''nao-existe'', true)');
    PERFORM pg_temp.confere(v = 'P0002:rotina não encontrada: nao-existe', 'rotina inexistente — veio ' || v);

    -- ── pedido sem "ligar" nem "desligar" / sem rotina ──────────────────────
    v := pg_temp.au(sa, format('SELECT active::text FROM public.fn_rotina_automatica_definir(%L, NULL)', rotina));
    PERFORM pg_temp.confere(v LIKE '22004:%', 'p_ativo NULL é recusado — veio ' || v);
    PERFORM pg_temp.confere((SELECT j.active FROM cron.job j WHERE j.jobname = rotina) = NOT antes,
        'p_ativo NULL não mexeu no job');

    -- ── pendências da revisão (plano 2026-11-16-rotinas-automaticas-pendencias-menores) ──
    -- rotina com falha na semana traz o ÚLTIMO ERRO, mesmo que a última execução tenha passado
    v := pg_temp.au(sa, $q$SELECT count(*)::text FROM public.fn_rotinas_automaticas_listar()
                           WHERE falhas_7d > 0 AND (ultimo_erro_em IS NULL OR ultimo_erro_mensagem IS NULL)$q$);
    PERFORM pg_temp.confere(v = 'ok:0', 'toda rotina com falha na semana traz o último erro — veio ' || v);
    -- "última execução" nunca é uma linha sem início (starting)
    v := pg_temp.au(sa, $q$SELECT count(*)::text FROM public.fn_rotinas_automaticas_listar()
                           WHERE ultima_status IS NOT NULL AND ultima_inicio IS NULL$q$);
    PERFORM pg_temp.confere(v = 'ok:0', 'nenhuma última execução sem início — veio ' || v);
    -- rotina SEM NOME: lista, desliga por p_jobid e registra como #jobid
    sem_nome := cron.schedule('0 0 1 1 *', 'SELECT 1');
    PERFORM pg_temp.confere((SELECT j.jobname FROM cron.job j WHERE j.jobid = sem_nome) IS NULL,
        'fixture: job sem nome criado na transação');
    v := pg_temp.au(sa, format('SELECT (jobname IS NULL)::text FROM public.fn_rotinas_automaticas_listar() WHERE jobid = %s', sem_nome));
    PERFORM pg_temp.confere(v = 'ok:true', 'listar mostra a rotina sem nome — veio ' || v);
    v := pg_temp.au(sa, format('SELECT active::text FROM public.fn_rotina_automatica_definir(NULL, false, %s)', sem_nome));
    PERFORM pg_temp.confere(v = 'ok:false', 'rotina sem nome desliga por p_jobid — veio ' || v);
    PERFORM pg_temp.confere((SELECT j.active FROM cron.job j WHERE j.jobid = sem_nome) = false,
        'cron.job.active da rotina sem nome mudou de verdade');
    PERFORM pg_temp.confere((SELECT count(*) FROM public.rotinas_automaticas_alteracoes r
                              WHERE r.jobname = '#' || sem_nome AND r.ativo_depois = false) = 1,
        'registro da rotina sem nome grava #jobid');
    v := pg_temp.au(sa, format('SELECT alterado_ativo_depois::text FROM public.fn_rotinas_automaticas_listar() WHERE jobid = %s', sem_nome));
    PERFORM pg_temp.confere(v = 'ok:false', 'listar mostra a alteração da rotina sem nome — veio ' || v);
    v := pg_temp.au(sa, 'SELECT active::text FROM public.fn_rotina_automatica_definir(NULL, true)');
    PERFORM pg_temp.confere(v LIKE '22004:%', 'sem nome e sem jobid é recusado — veio ' || v);

    -- ── membro comum: recusado nas duas ─────────────────────────────────────
    v := pg_temp.au(m, 'SELECT count(*)::text FROM public.fn_rotinas_automaticas_listar()');
    PERFORM pg_temp.confere(v = recusa, 'membro não lista — veio ' || v);
    v := pg_temp.au(m, format('SELECT active::text FROM public.fn_rotina_automatica_definir(%L, %L)', rotina, antes));
    PERFORM pg_temp.confere(v = recusa, 'membro não liga/desliga — veio ' || v);
    PERFORM pg_temp.confere((SELECT j.active FROM cron.job j WHERE j.jobname = rotina) = NOT antes,
        'a tentativa do membro não mexeu no job');

    -- ── tabela de registro: ninguém da API lê nem escreve direto ────────────
    v := pg_temp.au(sa, 'SELECT count(*)::text FROM public.rotinas_automaticas_alteracoes');
    PERFORM pg_temp.confere(v LIKE '42501:%', 'authenticated não lê o registro direto — veio ' || v);
    v := pg_temp.como(NULL, 'anon', 'SELECT count(*)::text FROM public.fn_rotinas_automaticas_listar()');
    PERFORM pg_temp.confere(v LIKE '42501:%', 'anon não executa listar — veio ' || v);

    -- ── forma (REGRA #7) ────────────────────────────────────────────────────
    PERFORM pg_temp.confere(
        to_regprocedure('public.fn_rotina_automatica_definir(text,boolean,bigint)') IS NOT NULL
        AND to_regprocedure('public.fn_rotina_automatica_definir(text,boolean)') IS NULL,
        'definir só existe na assinatura (text, boolean, bigint) — sem sobrecarga ambígua');
    PERFORM pg_temp.confere(
        NOT has_function_privilege('anon', 'public.fn_rotinas_automaticas_listar()', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.fn_rotina_automatica_definir(text,boolean,bigint)', 'EXECUTE')
        AND has_function_privilege('authenticated', 'public.fn_rotinas_automaticas_listar()', 'EXECUTE')
        AND has_function_privilege('authenticated', 'public.fn_rotina_automatica_definir(text,boolean,bigint)', 'EXECUTE')
        AND NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                         WHERE p.oid IN ('public.fn_rotinas_automaticas_listar()'::regprocedure,
                                         'public.fn_rotina_automatica_definir(text,boolean,bigint)'::regprocedure)
                           AND a.grantee = 0)
        AND (SELECT bool_and(p.prosecdef) FROM pg_proc p
              WHERE p.oid IN ('public.fn_rotinas_automaticas_listar()'::regprocedure,
                              'public.fn_rotina_automatica_definir(text,boolean,bigint)'::regprocedure)),
        'funções: SECURITY DEFINER, sem PUBLIC/anon, com authenticated');
    PERFORM pg_temp.confere(
        NOT has_table_privilege('authenticated', 'public.rotinas_automaticas_alteracoes', 'SELECT')
        AND NOT has_table_privilege('authenticated', 'public.rotinas_automaticas_alteracoes', 'INSERT')
        AND NOT has_table_privilege('authenticated', 'public.rotinas_automaticas_alteracoes', 'TRUNCATE')
        AND NOT has_table_privilege('anon', 'public.rotinas_automaticas_alteracoes', 'SELECT')
        AND (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.rotinas_automaticas_alteracoes'::regclass),
        'registro: RLS ligada e sem privilégio para anon/authenticated (nem TRUNCATE)');
END $$;

ROLLBACK;

SELECT 'TUDO OK' AS resultado;
