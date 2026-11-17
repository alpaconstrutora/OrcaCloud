-- scripts/teste-diretoria-resumo.sql
-- Prova: resumo semanal da Diretoria (ÒPURA CEO, 1ª entrega, Parte 2).
--   • fn_diretoria_resumo_dados(p_user), fn_diretoria_registrar_semana() e
--     fn_diretoria_resumo_destinatarios() só para o servidor (service_role/postgres): authenticated e
--     anon não executam; com usuário na requisição recusam.
--   • O resumo de uma pessoa traz só as orgs em que ELA tem a permissão Diretoria, os tipos que ela
--     silenciou e o e-mail dela; destinatários = quem ligou diretoria.resumo_semanal.
--   • A foto da semana (diretoria_semana_numeros) grava uma linha por org com a permissão, com a
--     mesma contagem do painel; repetir sobrescreve; leitura pela RLS só com a permissão.
--   • O painel compara com a foto da semana anterior (semana_anterior), nula sem foto.
--   • Job do pg_cron "diretoria-resumo-semanal" às segundas 10:00 GMT (07:00 de Brasília).
-- Migration: supabase/migrations/aplicar_20271117980100_diretoria_resumo_semanal.sql
-- Plano: docs/planos/2026-11-17-opura-ceo.md (Tarefa 9)
--
-- BEGIN … ROLLBACK: não grava nada (o cron.schedule também volta). Sucesso = 'TUDO OK'.
-- Sem a migration, falha logo no 1º caso (função não existe) — é o RED.
--
-- Ensaio:
--   bash scripts/montar-ensaio.sh -o /tmp/e.sql scripts/teste-diretoria-resumo.sql \
--        supabase/migrations/aplicar_20271117980100_diretoria_resumo_semanal.sql
--   npx supabase db query --linked -f /tmp/e.sql

BEGIN;

CREATE FUNCTION pg_temp.confere(p_ok BOOLEAN, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
END $$;

CREATE FUNCTION pg_temp.da(p_veio TEXT, p_esperado TEXT, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_esperado LIKE '%\%' THEN
        IF p_veio LIKE p_esperado THEN RETURN; END IF;
    ELSIF p_veio = p_esperado THEN
        RETURN;
    END IF;
    RAISE EXCEPTION 'FALHOU: % (veio %, esperava %)', p_msg, left(p_veio, 300), p_esperado;
END $$;

CREATE FUNCTION pg_temp.claims(p_user UUID, p_papel TEXT) RETURNS TEXT LANGUAGE sql AS $$
    SELECT CASE WHEN p_user IS NULL THEN json_build_object('role', p_papel)::text
                ELSE json_build_object('sub', p_user,
                                       'email', (SELECT u.email FROM auth.users u WHERE u.id = p_user),
                                       'role', p_papel)::text END
$$;

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

CREATE FUNCTION pg_temp.painel(p_user UUID, p_org UUID) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
    v := pg_temp.au(p_user, format('SELECT public.fn_diretoria_painel(%L)::text', p_org));
    IF v NOT LIKE 'ok:%' THEN RAISE EXCEPTION 'FALHOU: painel como % na org %: %', p_user, p_org, left(v, 300); END IF;
    RETURN substr(v, 4)::jsonb;
END $$;

-- MIGRATION

DO $$
DECLARE
    org_a UUID; d UUID; m UUID; v TEXT; j JSONB; n BIGINT;
    v_semana CONSTANT DATE := date_trunc('week', (now() AT TIME ZONE 'America/Sao_Paulo')::date)::date;
BEGIN
    SELECT organization_id INTO org_a FROM public.vw_payables WHERE effective_status = 'VENCIDO'
     GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;
    SELECT id INTO d FROM auth.users au WHERE nullif(btrim(au.email), '') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.email = lower(au.email)) ORDER BY au.id LIMIT 1;
    SELECT id INTO m FROM auth.users au WHERE nullif(btrim(au.email), '') IS NOT NULL AND au.id <> d
       AND NOT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.email = lower(au.email)) ORDER BY au.id LIMIT 1;
    PERFORM pg_temp.confere(org_a IS NOT NULL AND m IS NOT NULL, 'fixture: org A e dois usuários');
    INSERT INTO public.organization_members (organization_id, user_id, email, role)
    SELECT org_a, p.u, (SELECT email FROM auth.users WHERE id = p.u), 'member' FROM (VALUES (d), (m)) p(u)
     WHERE NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = org_a AND om.user_id = p.u);
    UPDATE public.organization_members SET permissions = coalesce(permissions, '{}'::jsonb) - 'canViewDiretoria' - 'canEditDiretoria'
     WHERE user_id IN (d, m);
    UPDATE public.organization_members SET permissions = coalesce(permissions, '{}'::jsonb) || '{"canViewDiretoria": true}'::jsonb
     WHERE organization_id = org_a AND user_id = d;

    -- ── 1. só o servidor ────────────────────────────────────────────────────
    PERFORM pg_temp.confere(NOT has_function_privilege('authenticated', 'public.fn_diretoria_resumo_dados(uuid)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.fn_diretoria_resumo_dados(uuid)', 'EXECUTE'), 'resumo de outra pessoa: só o servidor');
    PERFORM pg_temp.confere(NOT has_function_privilege('authenticated', 'public.fn_diretoria_registrar_semana()', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.fn_diretoria_registrar_semana()', 'EXECUTE'), 'registrar a semana: só o servidor');
    PERFORM pg_temp.confere(NOT has_function_privilege('authenticated', 'public.fn_diretoria_resumo_destinatarios()', 'EXECUTE'),
        'lista de destinatários: só o servidor');
    PERFORM pg_temp.confere(has_function_privilege('service_role', 'public.fn_diretoria_resumo_dados(uuid)', 'EXECUTE'), 'service_role monta o resumo');
    PERFORM pg_temp.da(pg_temp.au(d, format('SELECT public.fn_diretoria_resumo_dados(%L)::text', d)), '42501:%', 'd chama o resumo pela API');

    -- ── 2. resumo da pessoa ─────────────────────────────────────────────────
    INSERT INTO public.preferencias (escopo, user_id, chave, valor) VALUES ('USUARIO', d, 'diretoria.silenciados', '"conta_vencida"');
    v := pg_temp.como(NULL, 'service_role', format('SELECT public.fn_diretoria_resumo_dados(%L)::text', d));
    PERFORM pg_temp.da(v, 'ok:%', 'service_role monta o resumo de d');
    j := substr(v, 4)::jsonb;
    PERFORM pg_temp.confere(jsonb_array_length(j->'orgs') = 1 AND (j->'orgs'->0->>'id')::uuid = org_a, 'o resumo de d traz só a org A');
    PERFORM pg_temp.confere(j->'silenciados' = '"conta_vencida"'::jsonb, 'o resumo traz o que d silenciou');
    PERFORM pg_temp.confere(j->'destinatario'->>'email' = (SELECT email FROM auth.users WHERE id = d), 'o resumo traz o e-mail de d');
    PERFORM pg_temp.confere(jsonb_array_length(j->'excecoes') > 0, 'o resumo traz as exceções da org A');
    v := pg_temp.como(NULL, 'service_role', format('SELECT public.fn_diretoria_resumo_dados(%L)::text', m));
    PERFORM pg_temp.confere(jsonb_array_length(substr(v, 4)::jsonb->'orgs') = 0, format('m (sem a permissão) não recebe organização: %s', left(v, 200)));

    INSERT INTO public.preferencias (escopo, user_id, chave, valor) VALUES ('USUARIO', d, 'diretoria.resumo_semanal', 'true');
    INSERT INTO public.preferencias (escopo, user_id, chave, valor) VALUES ('USUARIO', m, 'diretoria.resumo_semanal', 'false');
    v := pg_temp.como(NULL, 'service_role', 'SELECT string_agg(u::text, '','') FROM public.fn_diretoria_resumo_destinatarios() u');
    PERFORM pg_temp.confere(v LIKE '%' || d::text || '%' AND v NOT LIKE '%' || m::text || '%', format('destinatários = quem ligou: %s', v));

    -- ── 3. foto da semana ───────────────────────────────────────────────────
    PERFORM pg_temp.da(pg_temp.au(d, 'SELECT public.fn_diretoria_registrar_semana()::text'), '42501:%', 'd registra a semana pela API');
    v := pg_temp.como(NULL, 'service_role', 'SELECT public.fn_diretoria_registrar_semana()::text');
    PERFORM pg_temp.da(v, 'ok:%', 'service_role registra a semana');
    PERFORM pg_temp.confere((SELECT count(*) FROM public.diretoria_semana_numeros s WHERE s.organization_id = org_a AND s.semana = v_semana) = 1,
        'uma foto da org A nesta semana');
    SELECT count(*) INTO n FROM public.vw_payables WHERE organization_id = org_a AND effective_status = 'VENCIDO';
    PERFORM pg_temp.confere((SELECT (s.numeros->'por_tipo'->'conta_vencida'->>'quantidade')::bigint FROM public.diretoria_semana_numeros s
                              WHERE s.organization_id = org_a AND s.semana = v_semana) = n, 'a foto conta as contas vencidas como o painel');
    PERFORM pg_temp.da(pg_temp.como(NULL, 'service_role', 'SELECT public.fn_diretoria_registrar_semana()::text'), 'ok:%', 'registrar de novo');
    PERFORM pg_temp.confere((SELECT count(*) FROM public.diretoria_semana_numeros s WHERE s.organization_id = org_a AND s.semana = v_semana) = 1,
        'registrar de novo sobrescreve (continua uma)');
    PERFORM pg_temp.da(pg_temp.au(d, format('SELECT count(*)::text FROM public.diretoria_semana_numeros WHERE organization_id = %L', org_a)),
        'ok:1', 'd lê a foto da org A');
    PERFORM pg_temp.da(pg_temp.au(m, format('SELECT count(*)::text FROM public.diretoria_semana_numeros WHERE organization_id = %L', org_a)),
        'ok:0', 'm não lê a foto');
    PERFORM pg_temp.da(pg_temp.au(d, format('INSERT INTO public.diretoria_semana_numeros (organization_id, semana, numeros) VALUES (%L, %L, %L) RETURNING 1::text',
        org_a, v_semana - 14, '{}')), '42501:%', 'd grava foto direto na tabela');

    -- ── 4. semana anterior no painel ────────────────────────────────────────
    j := pg_temp.painel(d, org_a);
    PERFORM pg_temp.confere(j ? 'semana_anterior' AND j->'semana_anterior' = 'null'::jsonb, 'sem foto da semana anterior: semana_anterior nula');
    INSERT INTO public.diretoria_semana_numeros (organization_id, semana, numeros)
    VALUES (org_a, v_semana - 7, '{"por_tipo": {"conta_vencida": {"quantidade": 5, "valor": 100}}, "determinacoes_vencidas": 2}');
    j := pg_temp.painel(d, org_a);
    PERFORM pg_temp.confere((j->'semana_anterior'->'por_tipo'->'conta_vencida'->>'quantidade')::int = 5
        AND (j->'semana_anterior'->>'determinacoes_vencidas')::int = 2
        AND (j->'semana_anterior'->>'semana')::date = v_semana - 7, format('o painel traz a foto da semana anterior: %s', j->'semana_anterior'));

    -- ── 5. job do pg_cron ───────────────────────────────────────────────────
    PERFORM pg_temp.confere(EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'diretoria-resumo-semanal' AND schedule = '0 10 * * 1' AND active
        AND command LIKE '%fn_diretoria_registrar_semana()%' AND command LIKE '%functions/v1/diretoria-resumo-semanal%'
        AND command LIKE '%fn_cron_secret()%' AND command LIKE '%timeout_milliseconds%'), 'job semanal: segunda 10:00 GMT, registra a semana e chama a function com o CRON_SECRET e prazo longo');

    RAISE NOTICE 'TUDO OK';
END $$;

SELECT 'TUDO OK' AS resultado;
ROLLBACK;
