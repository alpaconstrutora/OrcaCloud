-- scripts/teste-alcada-no-servidor.sql
-- Prova: a alçada de aprovação vale no SERVIDOR (F14, F59).
--   • Gravação direta pela API não aprova: PATCH para APROVADO, INSERT já aprovado, passo forjado,
--     nível rebaixado — recusados com 42501 ALCADA_NAO_PERMITE.
--   • Aprovar/rejeitar/enviar é pelas RPCs fn_alcada_aprovar/rejeitar/enviar: alçada da pessoa,
--     nível da vez e passo em nome do e-mail do JWT, tudo calculado no servidor.
--   • Título aprovado cujo valor sobe de faixa volta para aprovação — também quando quem muda é o
--     servidor (sincronização, conciliação); pago fica "pago sem alçada". Na mesma faixa, mantém.
--   • Ida e volta de organização: título volta para aprovação; processo e contrato aprovados não
--     mudam de organização; etapa aprovada não troca de processo.
--   • Memória de aprovação não devolve APROVADO a título recriado com outro favorecido.
--   • Caminhos legítimos seguem: aprovar dois níveis, rejeitar e reenviar, liberar abaixo do piso,
--     voltar a rascunho, cancelar (PENDENTE→REJEITADO), DARF inteiro pelas RPCs dele, clone do
--     desmembramento (fn_reconcile_group) com a aprovação.
-- Migrations: supabase/migrations/aplicar_20271118915000_alcada_rpcs.sql
--             supabase/migrations/aplicar_20271118915100_alcada_trava_servidor.sql
-- Plano: docs/planos/2026-11-18-seguranca-alcada-no-servidor.md
--
-- Personagens: a e b — membros comuns (não superadmin) da org A (926cf626); a vira membro da
-- org B nesta transação. Faixas da org A trocadas NESTA transação por: 500–5000 = 1 nível
-- (ninguém cadastrado = qualquer um aprova) e 5000+ = 2 níveis, só b aprova os dois. Org B sem
-- faixa. Títulos, DARF, processo e contrato de teste criados aqui.
--
-- BEGIN … ROLLBACK: não grava nada (sequências avançam, como em todo INSERT desfeito). Falha =
-- RAISE EXCEPTION 'FALHOU: …'; sucesso = a linha final 'TUDO OK'. Sem as migrations, falha no
-- primeiro caso ("a grava APROVADO direto") — é o RED.
--
-- Ensaio (migrations ainda não aplicadas):
--   bash scripts/montar-ensaio.sh -o /tmp/e.sql scripts/teste-alcada-no-servidor.sql \
--        supabase/migrations/aplicar_20271118915000_alcada_rpcs.sql \
--        supabase/migrations/aplicar_20271118915100_alcada_trava_servidor.sql
--   npx supabase db query --linked -f /tmp/e.sql
-- Depois de aplicadas:
--   npx supabase db query --linked -f scripts/teste-alcada-no-servidor.sql

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

-- Título a pagar de teste, criado como o servidor (postgres): nasce pela regra do banco.
CREATE FUNCTION pg_temp.titulo(p_org UUID, p_valor NUMERIC, p_desc TEXT, p_dir TEXT DEFAULT 'DEBIT') RETURNS UUID LANGUAGE sql AS $$
    INSERT INTO public.internal_transactions (organization_id, source_system, transaction_date, due_date, amount, direction, description, status)
    VALUES (p_org, 'MANUAL', current_date, current_date + 30, p_valor, p_dir, 'TESTE ALCADA ' || p_desc, 'PENDING')
    RETURNING id
$$;

CREATE FUNCTION pg_temp.st(p_id UUID) RETURNS TEXT LANGUAGE sql AS $$
    SELECT approval_status || '/' || approval_required_levels || '/' || jsonb_array_length(COALESCE(approval_chain, '[]'::jsonb))
      FROM public.internal_transactions WHERE id = p_id
$$;

DO $$
DECLARE
    org_a CONSTANT UUID := '926cf626-ba49-4ee4-9f35-472822fb90e6';
    org_b UUID; a UUID; b UUID; email_a TEXT; email_b TEXT;
    f_baixa UUID; f_alta UUID; tpl UUID; inst UUID; inst2 UUID; etapa UUID; etapa2 UUID; contrato UUID;
    t_alto UUID; t UUID; t2 UUID; darf UUID; m1 UUID; m2 UUID; v TEXT;
    upd CONSTANT TEXT := 'WITH u AS (UPDATE public.internal_transactions SET %s WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u';
    aprova CONSTANT TEXT := 'SELECT public.fn_alcada_aprovar(''transaction'', %L, %s, NULL, ''{"level1_label":"Gestor","level2_label":"Diretoria"}''::jsonb, ''{"business_status":"APROVADO"}''::jsonb) ->> ''approval_status''';
    rejeita CONSTANT TEXT := 'SELECT public.fn_alcada_rejeitar(''transaction'', %L, ''teste'', ''{"business_status":"BLOQUEADO"}''::jsonb) ->> ''approval_status''';
    nega CONSTANT TEXT := '42501:ALCADA_NAO_PERMITE:%';
BEGIN
    -- ── fixtures ─────────────────────────────────────────────────────────────
    SELECT au.id, au.email INTO a, email_a FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
     WHERE om.organization_id = org_a AND nullif(btrim(au.email), '') IS NOT NULL
       AND lower(om.email) = lower(au.email)
       AND NOT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.email = lower(au.email))
     ORDER BY (om.role = 'member') DESC, au.id LIMIT 1;
    SELECT au.id, au.email INTO b, email_b FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
     WHERE om.organization_id = org_a AND nullif(btrim(au.email), '') IS NOT NULL
       AND lower(om.email) = lower(au.email) AND au.id <> a
       AND NOT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.email = lower(au.email))
     ORDER BY (om.role = 'member') DESC, au.id LIMIT 1;
    PERFORM pg_temp.confere(a IS NOT NULL AND b IS NOT NULL, 'fixture: dois membros comuns da org A (a, b)');

    SELECT o.id INTO org_b FROM public.organizations o
     WHERE o.id <> org_a AND NOT public.fn_org_e_condominio(o.id)
     ORDER BY o.id LIMIT 1;
    PERFORM pg_temp.confere(org_b IS NOT NULL, 'fixture: segunda organização (B)');
    INSERT INTO public.organization_members (organization_id, user_id, email, role)
    VALUES (org_b, a, email_a, 'member') ON CONFLICT DO NOTHING;
    UPDATE public.organization_members SET user_id = a WHERE organization_id = org_b AND lower(email) = lower(email_a);

    DELETE FROM public.financial_approval_config WHERE organization_id IN (org_a, org_b);
    INSERT INTO public.financial_approval_config (organization_id, faixa_min, faixa_max, required_levels, level1_label, is_active)
    VALUES (org_a, 500, 5000, 1, 'Gestor', true) RETURNING id INTO f_baixa;
    INSERT INTO public.financial_approval_config (organization_id, faixa_min, faixa_max, required_levels, level1_label, level2_label, is_active)
    VALUES (org_a, 5000, NULL, 2, 'Gestor', 'Diretoria', true) RETURNING id INTO f_alta;
    INSERT INTO public.approval_approvers (organization_id, faixa_id, level, user_id) VALUES (org_a, f_alta, 1, b), (org_a, f_alta, 2, b);

    t_alto := pg_temp.titulo(org_a, 10000, 'alto');
    PERFORM pg_temp.confere(pg_temp.st(t_alto) = 'PENDENTE/2/0', 'fixture: título de 10 mil nasce PENDENTE com 2 níveis');

    -- ── 1. gravação direta pela API não aprova ──────────────────────────────
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'approval_status = ''APROVADO''', t_alto)), nega,
        'a grava APROVADO direto (PATCH)');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'approval_status = ''APROVADO'', business_status = ''APROVADO''', t_alto)), nega,
        'a grava APROVADO + business_status direto');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, format('approval_status = ''APROVADO'', approval_chain = %L::jsonb',
            jsonb_build_array(jsonb_build_object('level', 1, 'action', 'APROVADO', 'approved_by', email_b),
                              jsonb_build_object('level', 2, 'action', 'APROVADO', 'approved_by', email_a))), t_alto)), nega,
        'a forja dois passos (um em nome de b) e APROVADO');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, format('approval_chain = %L::jsonb',
            jsonb_build_array(jsonb_build_object('level', 1, 'action', 'APROVADO', 'approved_by', email_a))), t_alto)), nega,
        'a acrescenta passo na cadeia sem a RPC');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'approval_required_levels = 1', t_alto)), nega,
        'a rebaixa os níveis exigidos no meio da aprovação');
    PERFORM pg_temp.da(pg_temp.au(a, format('INSERT INTO public.internal_transactions (organization_id, source_system, transaction_date, amount, direction, status, approval_status) VALUES (%L, ''MANUAL'', current_date, 9000, ''DEBIT'', ''PENDING'', ''APROVADO'') RETURNING 1::text', org_a)),
        nega, 'a insere título já APROVADO');
    PERFORM pg_temp.da(pg_temp.au(a, format('INSERT INTO public.internal_transactions (organization_id, source_system, transaction_date, amount, direction, status, approval_chain) VALUES (%L, ''MANUAL'', current_date, 9000, ''DEBIT'', ''PENDING'', %L::jsonb) RETURNING 1::text', org_a,
            jsonb_build_array(jsonb_build_object('level', 1, 'action', 'APROVADO', 'approved_by', email_a)))),
        nega, 'a insere título com passo de aprovação');
    v := pg_temp.au(a, format('INSERT INTO public.internal_transactions (organization_id, source_system, transaction_date, amount, direction, status, approval_status, approval_required_levels) VALUES (%L, ''MANUAL'', current_date, 9000, ''DEBIT'', ''PENDING'', ''PENDENTE'', 1) RETURNING approval_required_levels::text', org_a));
    PERFORM pg_temp.da(v, 'ok:2', 'título inserido PENDENTE com 1 nível acima de 5 mil fica com os 2 da faixa');
    PERFORM pg_temp.confere(pg_temp.st(t_alto) = 'PENDENTE/2/0', 'título de 10 mil segue PENDENTE, 2 níveis, sem passo');

    -- ── 2. a RPC confere a alçada no servidor ───────────────────────────────
    PERFORM pg_temp.da(pg_temp.au(a, format(aprova, t_alto, 'NULL')), 'P0001:ALCADA_NAO_PERMITE: o nível 1 deste item é aprovado por %',
        'a (fora da alçada da faixa alta) aprova pela RPC');
    PERFORM pg_temp.da(pg_temp.au(b, format(aprova, t_alto, '2')), 'P0001:O nível da vez deste item é o 1%',
        'b tenta aprovar o nível 2 antes do 1');
    PERFORM pg_temp.da(pg_temp.au(b, format('SELECT public.fn_alcada_aprovar(''transaction'', %L, NULL, NULL, ''{}''::jsonb, ''{"approval_status":"APROVADO"}''::jsonb) ->> ''approval_status''', t_alto)),
        '22023:%', 'extra com campo de aprovação é recusado');
    PERFORM pg_temp.da(pg_temp.au(b, format(aprova, t_alto, '1')), 'ok:PENDENTE', 'b aprova o nível 1');
    PERFORM pg_temp.da(pg_temp.au(b, format(aprova, t_alto, '2')), 'ok:APROVADO', 'b aprova o nível 2');
    PERFORM pg_temp.confere((SELECT approval_status = 'APROVADO' AND business_status = 'APROVADO'
                                    AND approval_chain -> 0 ->> 'approved_by' = email_b
                                    AND approval_chain -> 1 ->> 'level' = '2'
                               FROM public.internal_transactions WHERE id = t_alto),
        'aprovado com os 2 passos em nome de b e o extra (business_status) aplicado');

    -- ── 3. ida e volta do valor ─────────────────────────────────────────────
    t := pg_temp.titulo(org_a, 10000, 'ida e volta');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'amount = 1000', t)), 'ok:1', 'a baixa o valor (PENDENTE, sem passo)');
    PERFORM pg_temp.da(pg_temp.au(a, format(aprova, t, 'NULL')), 'ok:PENDENTE', 'a aprova o nível 1 na faixa baixa (os 2 níveis exigidos ficam)');
    PERFORM pg_temp.da(pg_temp.au(a, format(aprova, t, 'NULL')), 'ok:APROVADO', 'a aprova o nível 2 na faixa baixa');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'amount = 10000', t)), 'ok:1', 'a devolve o valor');
    PERFORM pg_temp.confere(pg_temp.st(t) = 'PENDENTE/2/0', 'valor devolvido à faixa alta: volta para aprovação (PENDENTE, 2 níveis, cadeia zerada)');

    -- ── 4. valor subindo pelo SERVIDOR (sincronização / conciliação) ────────
    t := pg_temp.titulo(org_a, 1000, 'sync');
    PERFORM pg_temp.da(pg_temp.au(a, format(aprova, t, 'NULL')), 'ok:APROVADO', 'a aprova título de 1 mil (faixa baixa)');
    UPDATE public.internal_transactions SET amount = 4500 WHERE id = t;
    PERFORM pg_temp.confere(pg_temp.st(t) = 'APROVADO/1/1', 'sobe dentro da mesma faixa: mantém APROVADO');
    UPDATE public.internal_transactions SET amount = 6000 WHERE id = t;
    PERFORM pg_temp.confere(pg_temp.st(t) = 'PENDENTE/2/0'
                            AND (SELECT business_status FROM public.internal_transactions WHERE id = t) = 'PREVISTO',
        'sync sobe para a faixa alta: volta para aprovação, business_status PREVISTO');
    t := pg_temp.titulo(org_a, 6000, 'desce');
    PERFORM pg_temp.da(pg_temp.au(b, format(aprova, t, 'NULL')), 'ok:PENDENTE', 'b aprova nível 1 do de 6 mil');
    PERFORM pg_temp.da(pg_temp.au(b, format(aprova, t, 'NULL')), 'ok:APROVADO', 'b aprova nível 2 do de 6 mil');
    UPDATE public.internal_transactions SET amount = 1200 WHERE id = t;
    PERFORM pg_temp.confere(pg_temp.st(t) = 'APROVADO/2/2', 'valor que desce mantém APROVADO');
    t := pg_temp.titulo(org_a, 1000, 'pago');
    PERFORM pg_temp.da(pg_temp.au(a, format(aprova, t, 'NULL')), 'ok:APROVADO', 'a aprova título de 1 mil que será pago');
    UPDATE public.internal_transactions SET status = 'CONCILIATED', payment_date = current_date WHERE id = t;
    UPDATE public.internal_transactions SET amount = 7000 WHERE id = t;
    PERFORM pg_temp.confere(pg_temp.st(t) = 'PENDENTE/2/0'
                            AND (SELECT pago_sem_alcada_em IS NOT NULL FROM public.internal_transactions WHERE id = t),
        'pago com ajuste para a faixa alta: volta para aprovação e fica "pago sem alçada"');

    -- ── 5. ida e volta de organização ───────────────────────────────────────
    t := pg_temp.titulo(org_a, 6000, 'organização');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, format('organization_id = %L', org_b), t)), 'ok:1', 'a leva o título PENDENTE para a org B');
    PERFORM pg_temp.da(pg_temp.au(a, format(aprova, t, 'NULL')), 'ok:PENDENTE', 'a aprova o nível 1 na org B (sem faixa: qualquer um)');
    PERFORM pg_temp.da(pg_temp.au(a, format(aprova, t, 'NULL')), 'ok:APROVADO', 'a aprova o nível 2 na org B');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, format('organization_id = %L', org_a), t)), 'ok:1', 'a traz o título aprovado de volta à org A');
    PERFORM pg_temp.confere(pg_temp.st(t) = 'PENDENTE/2/0', 'de volta à org A: volta para aprovação, com os níveis da org A');

    -- ── 6. caminhos legítimos ───────────────────────────────────────────────
    t := pg_temp.titulo(org_a, 8000, 'rejeita fora da alçada');
    PERFORM pg_temp.da(pg_temp.au(a, format(rejeita, t)), 'P0001:ALCADA_NAO_PERMITE: o nível 1 deste item é aprovado por %',
        'a (fora da alçada da faixa alta) rejeita pela RPC');
    PERFORM pg_temp.da(pg_temp.como(NULL, 'service_role', format(upd, 'approval_status = ''APROVADO''', t)), 'ok:1',
        'service_role (Edge Function / rotina) grava a aprovação direto: caminho do servidor');
    t := pg_temp.titulo(org_a, 1000, 'rejeita');
    PERFORM pg_temp.da(pg_temp.au(a, format(rejeita, t)), 'ok:REJEITADO', 'a rejeita pela RPC');
    PERFORM pg_temp.confere((SELECT business_status FROM public.internal_transactions WHERE id = t) = 'BLOQUEADO', 'rejeição aplica o extra');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.fn_alcada_enviar(''transaction'', %L, ''liberar'', ''{"business_status":null}''::jsonb, true) ->> ''approval_status''', t)),
        'ok:PENDENTE', 'a reenvia o rejeitado');
    PERFORM pg_temp.confere(pg_temp.st(t) = 'PENDENTE/1/1', 'reenvio mantém o histórico (1 passo: a rejeição)');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.fn_alcada_enviar(''transaction'', %L, ''exigir1'', ''{}''::jsonb, true) ->> ''approval_status''', t)),
        'P0001:Só item rejeitado%', 'reenviar o que não está rejeitado');
    PERFORM pg_temp.da(pg_temp.au(a, format(aprova, t, 'NULL')), 'ok:APROVADO', 'depois do reenvio, aprova (a rodada começa depois da rejeição)');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'approval_status = ''RASCUNHO'', approval_chain = ''[]''::jsonb', t)), 'ok:1',
        'a volta o aprovado a rascunho (edição de título)');
    PERFORM pg_temp.confere(pg_temp.st(t) = 'PENDENTE/1/0', 'rascunho de título a pagar volta a PENDENTE pelo gatilho de sempre');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'approval_status = ''REJEITADO''', t)), 'ok:1', 'a cancela (PENDENTE → REJEITADO sem passo)');

    t := pg_temp.titulo(org_a, 100, 'libera', 'CREDIT');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.fn_alcada_enviar(''transaction'', %L, ''liberar'') ->> ''approval_status''', t)),
        'ok:APROVADO', 'abaixo do piso + liberar: aprovado sem fila');
    t := pg_temp.titulo(org_a, 100, 'libera rejeitado', 'CREDIT');
    UPDATE public.internal_transactions SET approval_status = 'REJEITADO' WHERE id = t;
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.fn_alcada_enviar(''transaction'', %L, ''liberar'') ->> ''approval_status''', t)),
        'ok:PENDENTE', 'rejeitado não se libera sozinho: vai para a fila');

    -- clone do desmembramento (fn_reconcile_group roda com orcacloud.alcada_servidor = on)
    PERFORM pg_temp.confere((SELECT 'orcacloud.alcada_servidor=on' = ANY(proconfig) FROM pg_proc
                              WHERE oid = 'public.fn_reconcile_group(uuid[], uuid[], text, jsonb)'::regprocedure),
        'fn_reconcile_group liga orcacloud.alcada_servidor');
    PERFORM pg_temp.da(pg_temp.au(a, format('INSERT INTO public.internal_transactions (organization_id, source_system, transaction_date, amount, direction, status, approval_status, approval_chain, approval_required_levels) '
                                            'SELECT organization_id, ''MANUAL'', current_date, 10, direction, ''PENDING'', approval_status, approval_chain, approval_required_levels '
                                            'FROM public.internal_transactions WHERE id = %L RETURNING approval_status', t_alto)),
        nega, 'sem a função do servidor, o clone aprovado é recusado');
    PERFORM set_config('orcacloud.alcada_servidor', 'on', true);   -- o que o SET de fn_reconcile_group faz
    PERFORM pg_temp.da(pg_temp.au(a, format('INSERT INTO public.internal_transactions (organization_id, source_system, transaction_date, amount, direction, status, approval_status, approval_chain, approval_required_levels) '
                                            'SELECT organization_id, ''MANUAL'', current_date, 10, direction, ''PENDING'', approval_status, approval_chain, approval_required_levels '
                                            'FROM public.internal_transactions WHERE id = %L RETURNING approval_status', t_alto)),
        'ok:APROVADO', 'com orcacloud.alcada_servidor (função do servidor), o clone leva a aprovação');
    PERFORM set_config('orcacloud.alcada_servidor', 'off', true);

    -- ── 7. DARF: o membro não se aprova direto; o DARF inteiro aprova pelas RPCs dele ──
    darf := gen_random_uuid();
    PERFORM set_config('darf.rpc', 'on', true);   -- darfs e membros só se gravam pelas RPCs do DARF
    INSERT INTO public.darfs (id, organization_id, competencia, due_date) VALUES (darf, org_a, date_trunc('month', current_date)::date, current_date + 20);
    INSERT INTO public.internal_transactions (organization_id, source_system, transaction_date, due_date, amount, direction, description, status, business_status, party_type, party_name, darf_id)
    VALUES (org_a, 'MANUAL', current_date, current_date + 20, 400, 'DEBIT', 'TESTE ALCADA darf irpj', 'PENDING', 'PREVISTO', 'TAX', 'IRPJ', darf) RETURNING id INTO m1;
    INSERT INTO public.internal_transactions (organization_id, source_system, transaction_date, due_date, amount, direction, description, status, business_status, party_type, party_name, darf_id)
    VALUES (org_a, 'MANUAL', current_date, current_date + 20, 300, 'DEBIT', 'TESTE ALCADA darf csll', 'PENDING', 'PREVISTO', 'TAX', 'CSLL', darf) RETURNING id INTO m2;
    PERFORM set_config('darf.rpc', 'off', true);
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'approval_status = ''APROVADO''', m1)), nega, 'a aprova direto um membro do DARF');
    PERFORM pg_temp.da(pg_temp.au(a, format(aprova, m1, 'NULL')), 'P0001:Título agrupado em DARF%', 'a aprova membro do DARF pela RPC genérica');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.fn_darf_enviar_aprovacao(%L)::text', darf)), 'ok:', 'a envia o DARF para aprovação');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.fn_darf_aprovar(%L, 1, %L, NULL)', darf, email_a)), 'ok:APROVADO',
        'a aprova o DARF de 700 (faixa baixa) pela RPC do DARF');
    PERFORM pg_temp.confere(pg_temp.st(m1) = 'APROVADO/1/1' AND pg_temp.st(m2) = 'APROVADO/1/1', 'os dois membros aprovados juntos');

    -- ── 8. memória de aprovação: só o mesmo favorecido ──────────────────────
    t := pg_temp.titulo(org_a, 1000, 'memória');
    UPDATE public.internal_transactions SET source_system = 'PROJECT', reference_id = 'teste-alcada-memoria', party_name = 'Fornecedor A' WHERE id = t;
    PERFORM pg_temp.da(pg_temp.au(a, format(aprova, t, 'NULL')), 'ok:APROVADO', 'a aprova o título sincronizado');
    PERFORM pg_temp.da(pg_temp.au(a, format('WITH d AS (DELETE FROM public.internal_transactions WHERE id = %L RETURNING 1) SELECT count(*)::text FROM d', t)),
        'ok:1', 'a apaga o título aprovado (sync apaga e recria)');
    v := pg_temp.au(a, format('INSERT INTO public.internal_transactions (organization_id, source_system, reference_id, transaction_date, amount, direction, status, party_name) VALUES (%L, ''PROJECT'', ''teste-alcada-memoria'', current_date, 1000, ''DEBIT'', ''PENDING'', ''Fornecedor B'') RETURNING approval_status', org_a));
    PERFORM pg_temp.da(v, 'ok:PENDENTE', 'recriado com OUTRO favorecido: não herda a aprovação');
    DELETE FROM public.internal_transactions WHERE organization_id = org_a AND reference_id = 'teste-alcada-memoria';
    v := pg_temp.au(a, format('INSERT INTO public.internal_transactions (organization_id, source_system, reference_id, transaction_date, amount, direction, status, party_name) VALUES (%L, ''PROJECT'', ''teste-alcada-memoria'', current_date, 1000, ''DEBIT'', ''PENDING'', ''Fornecedor A'') RETURNING approval_status', org_a));
    PERFORM pg_temp.da(v, 'ok:APROVADO', 'recriado com o MESMO favorecido e valor: continua aprovado (sync)');

    -- ── 9. processo e contrato não levam aprovação para outra organização ───
    SELECT pt.id INTO tpl FROM public.process_templates pt WHERE pt.organization_id = org_a ORDER BY pt.id LIMIT 1;
    IF tpl IS NULL THEN
        INSERT INTO public.process_templates (organization_id, name) VALUES (org_a, 'TESTE ALCADA modelo') RETURNING id INTO tpl;
    END IF;
    INSERT INTO public.process_instances (organization_id, process_template_id, template_version, title)
    VALUES (org_a, tpl, 1, 'TESTE ALCADA processo') RETURNING id INTO inst;
    INSERT INTO public.process_instances (organization_id, process_template_id, template_version, title)
    VALUES (org_a, tpl, 1, 'TESTE ALCADA processo 2') RETURNING id INTO inst2;
    INSERT INTO public.process_instance_steps (process_instance_id, name, step_type, approval_status, approval_required_levels, amount)
    VALUES (inst, 'TESTE ALCADA etapa', 'approval', 'PENDENTE', 2, 0) RETURNING id INTO etapa;
    PERFORM pg_temp.da(pg_temp.au(b, format('SELECT public.fn_alcada_aprovar(''process_step'', %L) ->> ''approval_status''', etapa)),
        'ok:PENDENTE', 'b aprova o nível 1 da etapa');
    PERFORM pg_temp.da(pg_temp.au(b, format('SELECT public.fn_alcada_aprovar(''process_step'', %L) ->> ''approval_status''', etapa)),
        'P0001:Você aprovou o nível 1%', 'b aprova também o nível 2 da etapa');
    PERFORM pg_temp.da(pg_temp.au(a, format('WITH u AS (UPDATE public.process_instances SET organization_id = %L WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', org_b, inst)),
        nega, 'a leva para a org B processo com etapa em aprovação');
    PERFORM pg_temp.da(pg_temp.au(a, format('WITH u AS (UPDATE public.process_instance_steps SET process_instance_id = %L WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', inst2, etapa)),
        nega, 'a move a etapa em aprovação para outro processo');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.fn_alcada_aprovar(''process_step'', %L) ->> ''approval_status''', etapa)),
        'ok:APROVADO', 'a (outra pessoa) aprova o nível 2 da etapa');
    PERFORM pg_temp.da(pg_temp.au(a, format('WITH u AS (UPDATE public.process_instances SET organization_id = %L WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', org_b, inst2)),
        'ok:1', 'processo sem aprovação muda de organização');

    INSERT INTO public.contracts (organization_id, number, title, start_date, approval_status)
    VALUES (org_a, 'TESTE-ALCADA-' || left(gen_random_uuid()::text, 8), 'TESTE ALCADA contrato', current_date, 'APROVADO') RETURNING id INTO contrato;
    PERFORM pg_temp.da(pg_temp.au(a, format('WITH u AS (UPDATE public.contracts SET organization_id = %L WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', org_b, contrato)),
        nega, 'a leva contrato aprovado para a org B');
    PERFORM pg_temp.da(pg_temp.au(a, format('INSERT INTO public.contracts (organization_id, number, title, start_date, approval_status) VALUES (%L, %L, ''x'', current_date, ''APROVADO'') RETURNING 1::text', org_a, 'TESTE-ALCADA-' || left(gen_random_uuid()::text, 8))),
        nega, 'a insere contrato já aprovado (duplicar sem limpar a aprovação)');

    -- ── 10. ninguém de fora executa ─────────────────────────────────────────
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                                        WHERE n.nspname = 'public' AND p.proname LIKE 'fn_alcada%'
                                          AND has_function_privilege('anon', p.oid, 'EXECUTE')),
        'anon não executa nenhuma fn_alcada_*');

    RAISE NOTICE 'TUDO OK';
END $$;

SELECT 'TUDO OK' AS resultado;
ROLLBACK;
