-- scripts/teste-compartilhamentos-e-auditoria-folha.sql
-- Prova das duas migrations de 18/11/2026 (frente seguranca-autorizacao-banco):
--   aplicar_20271118911000_compartilhamentos_so_pela_org_dona
--     · supplier_org_shares e client_org_shares: gravar exige ser membro da org DONA do registro
--       e da org destino (ou superadmin); quem é da org destino segue vendo e desfazendo o que
--       recebeu.
--     · rubric_org_shares e custom_database_org_shares: gestor do destino (como já era) E membro
--       da org dona.
--     · employee_org_shares: gravar exige ser membro da org dona do colaborador E da org destino.
--   aplicar_20271118911100_payroll_audit_logs_por_org
--     · lê: org minha; histórico de rubrica que enxergo ('SYSTEM' ou a org dona dela); superadmin.
--     · grava: com o meu e-mail; na org minha, ou na org dona de rubrica que enxergo; 'SYSTEM' só
--       superadmin. anon sem privilégio de tabela.
--
-- Personagem: a — membro comum (não superadmin) da org A (926cf626); fora da org B, e não é
-- corretor nela; vira ADMIN da org C nesta transação (gestor do destino em rubrica e base).
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …'; sucesso = a linha final
-- 'TUDO OK'. Sem as migrations, falha em "a lê o histórico 'SYSTEM' de rubrica da org B" (RED).
--
-- Ensaio (migrations ainda não aplicadas):
--   bash scripts/montar-ensaio.sh -o /tmp/e.sql scripts/teste-compartilhamentos-e-auditoria-folha.sql \
--        supabase/migrations/aplicar_20271118911000_compartilhamentos_so_pela_org_dona.sql \
--        supabase/migrations/aplicar_20271118911100_payroll_audit_logs_por_org.sql
--   npx supabase db query --linked -f /tmp/e.sql
-- Depois de aplicadas:
--   npx supabase db query --linked -f scripts/teste-compartilhamentos-e-auditoria-folha.sql

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
    org_b UUID; org_c UUID; a UUID; email_a TEXT;
    sup_a UUID; sup_b UUID; emp_a UUID; emp_b UUID; cli_a UUID; cli_b UUID; db_a UUID; db_b UUID;
    nome TEXT;
    rls CONSTANT TEXT := '42501:new row violates row-level security policy%';
    -- linhas de payroll_audit_logs que a enxerga com este entity_id e org_id
    ve_log CONSTANT TEXT := 'SELECT count(*)::text FROM public.payroll_audit_logs WHERE entity_id = %L AND org_id = %L';
    grava_log CONSTANT TEXT := 'INSERT INTO public.payroll_audit_logs (org_id, user_email, action, entity_type, entity_id, description) VALUES (%L, %L, %L, %L, %L, %L) RETURNING 1::text';
    grava_sos CONSTANT TEXT := 'INSERT INTO public.supplier_org_shares (supplier_id, target_org_id) VALUES (%L, %L) RETURNING 1::text';
    grava_eos CONSTANT TEXT := 'INSERT INTO public.employee_org_shares (employee_id, target_org_id) VALUES (%L, %L) RETURNING 1::text';
    grava_cos CONSTANT TEXT := 'INSERT INTO public.client_org_shares (client_id, target_org_id) VALUES (%L, %L) RETURNING 1::text';
    grava_ros CONSTANT TEXT := 'INSERT INTO public.rubric_org_shares (rubric_code, target_org_id) VALUES (%L, %L) RETURNING 1::text';
    grava_cdos CONSTANT TEXT := 'INSERT INTO public.custom_database_org_shares (database_id, target_org_id) VALUES (%L, %L) RETURNING 1::text';
BEGIN
    -- ── fixtures ─────────────────────────────────────────────────────────────
    SELECT au.id, au.email INTO a, email_a FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
     WHERE om.organization_id = org_a AND nullif(btrim(au.email), '') IS NOT NULL
       AND lower(om.email) = lower(au.email)
       AND NOT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.email = lower(au.email))
     ORDER BY (om.role = 'member') DESC, au.id LIMIT 1;
    PERFORM pg_temp.confere(a IS NOT NULL, 'fixture: membro comum da org A (a)');

    -- B e C: orgs de que a não é membro (nem por user_id, nem por e-mail)
    SELECT o.id INTO org_b FROM public.organizations o
     WHERE o.id <> org_a
       AND NOT EXISTS (SELECT 1 FROM public.organization_members m
                        WHERE m.organization_id = o.id AND (m.user_id = a OR lower(m.email) = lower(email_a)))
     ORDER BY o.id LIMIT 1;
    SELECT o.id INTO org_c FROM public.organizations o
     WHERE o.id NOT IN (org_a, org_b)
       AND NOT EXISTS (SELECT 1 FROM public.organization_members m
                        WHERE m.organization_id = o.id AND (m.user_id = a OR lower(m.email) = lower(email_a)))
     ORDER BY o.id LIMIT 1;
    PERFORM pg_temp.confere(org_b IS NOT NULL AND org_c IS NOT NULL, 'fixture: duas orgs (B, C) fora das de a');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM public.broker_profiles bp
                                         WHERE bp.organization_id IN (org_b, org_c) AND bp.is_active
                                           AND lower(bp.email) = lower(email_a)),
        'fixture: a não é corretor das orgs B e C');
    INSERT INTO public.organization_members (organization_id, user_id, email, role)
    VALUES (org_c, a, email_a, 'admin');

    INSERT INTO public.suppliers (organization_id, name) VALUES (org_a, 'TCOMP fornecedor A') RETURNING id INTO sup_a;
    INSERT INTO public.suppliers (organization_id, name) VALUES (org_b, 'TCOMP fornecedor B') RETURNING id INTO sup_b;
    INSERT INTO public.employees (org_id, name, status) VALUES (org_a, 'TCOMP colaborador A', 'ATIVO') RETURNING id INTO emp_a;
    INSERT INTO public.employees (org_id, name, status) VALUES (org_b, 'TCOMP colaborador B', 'ATIVO') RETURNING id INTO emp_b;
    INSERT INTO public.clients (organization_id, name) VALUES (org_a, 'TCOMP cliente A') RETURNING id INTO cli_a;
    INSERT INTO public.clients (organization_id, name) VALUES (org_b, 'TCOMP cliente B') RETURNING id INTO cli_b;
    INSERT INTO public.custom_databases (organization_id, name) VALUES (org_a, 'TCOMP base A') RETURNING id INTO db_a;
    INSERT INTO public.custom_databases (organization_id, name) VALUES (org_b, 'TCOMP base B') RETURNING id INTO db_b;

    -- rubricas: de A; de B; de B compartilhada com A (rubric_org_shares)
    INSERT INTO public.rubrics (code, name, type, organization_id) VALUES
        ('TCOMP_A', 'TCOMP rubrica A', 'provento', org_a),
        ('TCOMP_B', 'TCOMP rubrica B', 'provento', org_b),
        ('TCOMP_BS', 'TCOMP rubrica B compartilhada', 'provento', org_b);
    INSERT INTO public.rubric_org_shares (rubric_code, target_org_id) VALUES ('TCOMP_BS', org_a);

    INSERT INTO public.payroll_audit_logs (org_id, user_email, action, entity_type, entity_id, description) VALUES
        ('SYSTEM',     'b@exemplo.com', 'UPDATE', 'RUBRIC', 'TCOMP_B',  'TCOMP histórico antigo de rubrica de B'),
        ('SYSTEM',     'a@exemplo.com', 'UPDATE', 'RUBRIC', 'TCOMP_A',  'TCOMP histórico antigo de rubrica de A'),
        (org_b::text,  'b@exemplo.com', 'UPDATE', 'RUBRIC', 'TCOMP_B',  'TCOMP histórico novo de rubrica de B'),
        (org_b::text,  'b@exemplo.com', 'UPDATE', 'RUBRIC', 'TCOMP_BS', 'TCOMP histórico de rubrica de B compartilhada com A'),
        (org_b::text,  'b@exemplo.com', 'UPDATE', 'EVENT',  'TCOMP_EV', 'TCOMP evento de B'),
        (org_a::text,  'a@exemplo.com', 'UPDATE', 'EVENT',  'TCOMP_EV', 'TCOMP evento de A');

    -- ── payroll_audit_logs: leitura ──────────────────────────────────────────
    PERFORM pg_temp.da(pg_temp.au(a, format(ve_log, 'TCOMP_B', 'SYSTEM')), 'ok:0',
        'a lê o histórico ''SYSTEM'' de rubrica da org B');
    PERFORM pg_temp.da(pg_temp.au(a, format(ve_log, 'TCOMP_B', org_b)), 'ok:0',
        'a lê o histórico de rubrica da org B (na org B)');
    PERFORM pg_temp.da(pg_temp.au(a, format(ve_log, 'TCOMP_EV', org_b)), 'ok:0',
        'a lê evento de folha da org B');
    PERFORM pg_temp.da(pg_temp.au(a, format(ve_log, 'TCOMP_A', 'SYSTEM')), 'ok:1',
        'a lê o histórico ''SYSTEM'' antigo de rubrica da org A');
    PERFORM pg_temp.da(pg_temp.au(a, format(ve_log, 'TCOMP_EV', org_a)), 'ok:1',
        'a lê evento de folha da org A');
    PERFORM pg_temp.da(pg_temp.au(a, format(ve_log, 'TCOMP_BS', org_b)), 'ok:1',
        'a lê o histórico de rubrica da org B compartilhada com A');

    -- ── payroll_audit_logs: gravação ─────────────────────────────────────────
    PERFORM pg_temp.da(pg_temp.au(a, format(grava_log, 'SYSTEM', email_a, 'UPDATE', 'RUBRIC', 'TCOMP_A', 'TCOMP forjado')), rls,
        'a grava histórico ''SYSTEM''');
    PERFORM pg_temp.da(pg_temp.au(a, format(grava_log, org_b, email_a, 'UPDATE', 'EVENT', 'TCOMP_EV', 'TCOMP forjado')), rls,
        'a grava histórico na org B');
    PERFORM pg_temp.da(pg_temp.au(a, format(grava_log, org_b, email_a, 'UPDATE', 'RUBRIC', 'TCOMP_B', 'TCOMP forjado')), rls,
        'a grava histórico de rubrica da org B que não enxerga');
    PERFORM pg_temp.da(pg_temp.au(a, format(grava_log, org_a, 'outra.pessoa@exemplo.com', 'UPDATE', 'EVENT', 'TCOMP_EV', 'TCOMP forjado')), rls,
        'a grava histórico na org A em nome de outra pessoa');
    PERFORM pg_temp.da(pg_temp.au(a, format(grava_log, org_a, email_a, 'UPDATE', 'EVENT', 'TCOMP_EV', 'TCOMP legítimo')), 'ok:1',
        'a grava histórico de evento na org A com o próprio e-mail');
    PERFORM pg_temp.da(pg_temp.au(a, format(grava_log, org_a, upper(email_a), 'CREATE', 'RUBRIC', 'TCOMP_A', 'TCOMP legítimo')), 'ok:1',
        'a grava histórico de rubrica da org A (e-mail em outra caixa)');
    PERFORM pg_temp.da(pg_temp.au(a, format(grava_log, org_b, email_a, 'UPDATE', 'RUBRIC', 'TCOMP_BS', 'TCOMP legítimo')), 'ok:1',
        'a grava, na org dona, histórico da rubrica de B compartilhada com A');

    -- ── supplier_org_shares ──────────────────────────────────────────────────
    PERFORM pg_temp.da(pg_temp.au(a, format(grava_sos, sup_b, org_a)), rls,
        'a compartilha com a org A fornecedor da org B');
    PERFORM pg_temp.da(pg_temp.au(a, format(grava_sos, sup_a, org_b)), rls,
        'a compartilha fornecedor da org A com a org B, de que não é membro');
    PERFORM pg_temp.da(pg_temp.au(a, format(grava_sos, sup_a, org_c)), 'ok:1',
        'a compartilha fornecedor da org A com a org C, sendo membro das duas');
    PERFORM pg_temp.da(pg_temp.au(a, format(
            'WITH u AS (UPDATE public.supplier_org_shares SET supplier_id = %L WHERE supplier_id = %L AND target_org_id = %L RETURNING 1) SELECT count(*)::text FROM u',
            sup_b, sup_a, org_c)), rls,
        'a troca o fornecedor de um compartilhamento seu pelo fornecedor da org B');
    PERFORM pg_temp.confere(public.fn_fornecedor_da_minha_org(sup_a) IS FALSE,
        'postgres sem usuário: fn_fornecedor_da_minha_org não reconhece org nenhuma');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.fn_fornecedor_da_minha_org(%L)::text || public.fn_fornecedor_da_minha_org(%L)::text', sup_a, sup_b)),
        'ok:truefalse', 'fn_fornecedor_da_minha_org: o de A é de a, o de B não');
    -- quem é da org destino segue podendo desfazer o que recebeu (comportamento de antes)
    INSERT INTO public.supplier_org_shares (supplier_id, target_org_id) VALUES (sup_b, org_a);
    PERFORM pg_temp.da(pg_temp.au(a, format(
            'WITH d AS (DELETE FROM public.supplier_org_shares WHERE supplier_id = %L AND target_org_id = %L RETURNING 1) SELECT count(*)::text FROM d',
            sup_b, org_a)), 'ok:1',
        'a desfaz o compartilhamento que a org A recebeu da org B');

    -- ── client_org_shares ────────────────────────────────────────────────────
    PERFORM pg_temp.da(pg_temp.au(a, format(grava_cos, cli_b, org_a)), rls,
        'a compartilha com a org A cliente da org B');
    PERFORM pg_temp.da(pg_temp.au(a, format(grava_cos, cli_a, org_c)), 'ok:1',
        'a compartilha cliente da org A com a org C, sendo membro das duas');

    -- ── rubric_org_shares (a é admin da org C) ───────────────────────────────
    PERFORM pg_temp.da(pg_temp.au(a, format(grava_ros, 'TCOMP_B', org_c)), rls,
        'a (gestor da org C) compartilha com a C rubrica da org B');
    PERFORM pg_temp.da(pg_temp.au(a, format(grava_ros, 'TCOMP_A', org_c)), 'ok:1',
        'a (gestor da org C) compartilha com a C rubrica da org A');

    -- ── custom_database_org_shares (a é admin da org C) ──────────────────────
    PERFORM pg_temp.da(pg_temp.au(a, format(grava_cdos, db_b, org_c)), rls,
        'a (gestor da org C) compartilha com a C base personalizada da org B');
    PERFORM pg_temp.da(pg_temp.au(a, format(grava_cdos, db_a, org_c)), 'ok:1',
        'a (gestor da org C) compartilha com a C base personalizada da org A');

    -- ── privilégios das funções e das tabelas ────────────────────────────────
    FOREACH nome IN ARRAY ARRAY['public.fn_fornecedor_da_minha_org(uuid)', 'public.fn_cliente_da_minha_org(uuid)',
                                 'public.fn_rubrica_da_minha_org(text)', 'public.fn_base_personalizada_da_minha_org(uuid)'] LOOP
        PERFORM pg_temp.confere(has_function_privilege('authenticated', nome, 'EXECUTE')
                                AND NOT has_function_privilege('anon', nome, 'EXECUTE')
                                AND (SELECT prosecdef FROM pg_proc WHERE oid = nome::regprocedure),
            nome || ': DEFINER, authenticated sim, anon não');
    END LOOP;
    FOREACH nome IN ARRAY ARRAY['supplier_org_shares', 'client_org_shares', 'rubric_org_shares',
                                 'custom_database_org_shares', 'payroll_audit_logs'] LOOP
        PERFORM pg_temp.da(pg_temp.como(NULL, 'anon', format('SELECT count(*)::text FROM public.%I', nome)),
            '42501:permission denied for table ' || nome, 'anon lê ' || nome);
    END LOOP;

    -- ── employee_org_shares ──────────────────────────────────────────────────
    PERFORM pg_temp.da(pg_temp.au(a, format(grava_eos, emp_a, org_b)), rls,
        'a disponibiliza colaborador da org A para a org B, de que não é membro');
    PERFORM pg_temp.da(pg_temp.au(a, format(grava_eos, emp_b, org_a)), rls,
        'a disponibiliza para a org A colaborador da org B');
    PERFORM pg_temp.da(pg_temp.au(a, format(grava_eos, emp_a, org_c)), 'ok:1',
        'a disponibiliza colaborador da org A para a org C, sendo membro das duas');
    PERFORM pg_temp.da(pg_temp.au(a, format(
            'WITH u AS (UPDATE public.employee_org_shares SET target_org_id = %L WHERE employee_id = %L AND target_org_id = %L RETURNING 1) SELECT count(*)::text FROM u',
            org_b, emp_a, org_c)), rls,
        'a muda o destino de um compartilhamento seu para a org B');
    PERFORM pg_temp.da(pg_temp.au(a, format(
            'WITH d AS (DELETE FROM public.employee_org_shares WHERE employee_id = %L AND target_org_id = %L RETURNING 1) SELECT count(*)::text FROM d',
            emp_a, org_c)), 'ok:1',
        'a desfaz o compartilhamento do colaborador da org A');

    RAISE NOTICE 'TUDO OK';
END $$;

SELECT 'TUDO OK' AS resultado;
ROLLBACK;
