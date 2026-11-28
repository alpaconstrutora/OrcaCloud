-- scripts/teste-docgen-aprovacao-trava.sql
-- Prova: ofício (doc_gen_documentos) só fica APROVADO pela aprovação — nunca por gravação direta.
--   • Ataques de um membro comum pela API, todos recusados com 42501 ALCADA_NAO_PERMITE:
--     PATCH approval_status = 'APROVADO' no rascunho (e depois emitir), PENDENTE → APROVADO,
--     REJEITADO → APROVADO, cadeia forjada, INSERT de rascunho já aprovado ou com passo,
--     níveis rebaixados no meio da aprovação.
--   • Caminhos legítimos seguem: enviar (fn_alcada_enviar), quem não é aprovador não aprova,
--     emitir em aprovação é recusado, o aprovador aprova (fn_alcada_aprovar) e o ofício é
--     emitido; texto alterado depois da aprovação volta a RASCUNHO; retirar da aprovação
--     (UPDATE → RASCUNHO, como docGenDocumentoService.retirarDaAprovacao); rejeitar e reenviar;
--     modelo que não exige aprovação emite direto; prazo de resposta do emitido muda.
-- Migration: supabase/migrations/aplicar_20271128410000_docgen_aprovacao_trava.sql
-- Plano: docs/planos/2026-11-27-docgen-aprovacao-trava.md
--
-- Personagens: a e b — membros comuns (não superadmin) da org A (926cf626). NESTA transação: a
-- org A fica sem faixa de alçada (ofício tem valor 0; sem faixa = 1 nível) e b é o único
-- aprovador de ofício no nível 1 (approval_approvers, entity_type doc_gen_documento). Modelos e
-- ofícios de teste criados aqui, como o servidor (postgres).
--
-- BEGIN … ROLLBACK: não grava nada (sequências avançam, como em todo INSERT desfeito). Falha =
-- RAISE EXCEPTION 'FALHOU: …'; sucesso = a linha final 'TUDO OK'. Sem a migration, falha no
-- primeiro caso ("a marca o rascunho APROVADO direto (PATCH)", veio ok:1) — é o RED.
--
-- Ensaio (migration ainda não aplicada; o montador tira o BEGIN;/COMMIT; dela):
--   bash scripts/montar-ensaio.sh -o /tmp/e.sql scripts/teste-docgen-aprovacao-trava.sql \
--        supabase/migrations/aplicar_20271128410000_docgen_aprovacao_trava.sql
--   npx supabase db query --linked -f /tmp/e.sql
-- Depois de aplicada (ou depois da aplicar_20271118915100_alcada_trava_servidor, que instala a
-- mesma trava nas 8 tabelas):
--   npx supabase db query --linked -f scripts/teste-docgen-aprovacao-trava.sql

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

-- Ofício de teste em RASCUNHO, criado como o servidor (postgres), com assunto e destinatário
-- (o mínimo que doc_gen_emitir pede).
CREATE FUNCTION pg_temp.oficio(p_org UUID, p_modelo UUID, p_assunto TEXT) RETURNS UUID LANGUAGE sql AS $$
    INSERT INTO public.doc_gen_documentos (organization_id, modelo_id, modelo_versao, assunto, destinatario_tipo, destinatario_snapshot)
    VALUES (p_org, p_modelo, 1, 'TESTE APROVACAO TRAVA ' || p_assunto, 'MANUAL', '{"razao_social":"Destinatário de teste"}'::jsonb)
    RETURNING id
$$;

-- situação / aprovação / níveis / passos
CREATE FUNCTION pg_temp.st(p_id UUID) RETURNS TEXT LANGUAGE sql AS $$
    SELECT status || '/' || approval_status || '/' || approval_required_levels || '/' || jsonb_array_length(approval_chain)
      FROM public.doc_gen_documentos WHERE id = p_id
$$;

DO $$
DECLARE
    org_a CONSTANT UUID := '926cf626-ba49-4ee4-9f35-472822fb90e6';
    a UUID; b UUID; email_a TEXT; email_b TEXT;
    m_exige UUID; m_livre UUID; d UUID; v TEXT;
    upd     CONSTANT TEXT := 'WITH u AS (UPDATE public.doc_gen_documentos SET %s WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u';
    ins     CONSTANT TEXT := 'WITH i AS (INSERT INTO public.doc_gen_documentos (organization_id, modelo_id, modelo_versao, assunto, destinatario_tipo, destinatario_snapshot%s) '
                             'VALUES (%L, %L, 1, ''TESTE APROVACAO TRAVA inserido'', ''MANUAL'', ''{"razao_social":"X"}''%s) RETURNING 1) SELECT count(*)::text FROM i';
    emitir  CONSTANT TEXT := 'SELECT public.doc_gen_emitir(%L)';
    enviar  CONSTANT TEXT := 'SELECT public.fn_alcada_enviar(''doc_gen_documento'', %L, ''exigir1'') ->> ''approval_status''';
    aprova  CONSTANT TEXT := 'SELECT public.fn_alcada_aprovar(''doc_gen_documento'', %L, %s, NULL, ''{"level1_label":"Gestor","level2_label":"Diretoria"}''::jsonb) ->> ''approval_status''';
    rejeita CONSTANT TEXT := 'SELECT public.fn_alcada_rejeitar(''doc_gen_documento'', %L, ''teste'') ->> ''approval_status''';
    nega    CONSTANT TEXT := '42501:ALCADA_NAO_PERMITE:%';
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

    DELETE FROM public.financial_approval_config WHERE organization_id = org_a;
    DELETE FROM public.approval_approvers WHERE organization_id = org_a AND entity_type = 'doc_gen_documento';
    INSERT INTO public.approval_approvers (organization_id, entity_type, level, user_id) VALUES (org_a, 'doc_gen_documento', 1, b);

    INSERT INTO public.doc_gen_modelos (organization_id, nome, exige_aprovacao)
    VALUES (org_a, 'TESTE APROVACAO TRAVA exige', true) RETURNING id INTO m_exige;
    INSERT INTO public.doc_gen_modelos (organization_id, nome, exige_aprovacao)
    VALUES (org_a, 'TESTE APROVACAO TRAVA livre', false) RETURNING id INTO m_livre;

    -- ── 1. o buraco: marcar APROVADO direto e emitir ─────────────────────────
    d := pg_temp.oficio(org_a, m_exige, 'patch');
    PERFORM pg_temp.da(pg_temp.au(a, format(emitir, d)), '22023:Este modelo exige aprovação antes da emissão.',
        'a emite rascunho de modelo que exige aprovação, sem aprovação');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'approval_status = ''APROVADO''', d)), nega,
        'a marca o rascunho APROVADO direto (PATCH)');
    PERFORM pg_temp.da(pg_temp.au(a, format(emitir, d)), '22023:Este modelo exige aprovação antes da emissão.',
        'depois do PATCH recusado, a emissão continua recusada');
    PERFORM pg_temp.confere(pg_temp.st(d) = 'RASCUNHO/RASCUNHO/1/0', 'o rascunho segue RASCUNHO, sem número');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM public.doc_gen_eventos WHERE documento_id = d AND tipo = 'APROVADO'),
        'nenhum evento APROVADO no histórico');

    -- ── 2. as outras portas da mesma gravação ────────────────────────────────
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, format('approval_status = ''APROVADO'', approval_chain = %L::jsonb',
            jsonb_build_array(jsonb_build_object('level', 1, 'action', 'APROVADO', 'approved_by', email_b))), d)), nega,
        'a forja um passo em nome de b e APROVADO');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, format('approval_status = ''APROVADO'', approval_chain = %L::jsonb',
            jsonb_build_array(jsonb_build_object('level', 1, 'action', 'APROVADO', 'approved_by', email_a))), d)), nega,
        'a forja um passo em nome próprio e APROVADO');
    PERFORM pg_temp.da(pg_temp.au(a, format(ins, ', approval_status', org_a, m_exige, ', ''APROVADO''')), nega,
        'a insere rascunho já APROVADO');
    PERFORM pg_temp.da(pg_temp.au(a, format(ins, ', approval_chain', org_a, m_exige,
            format(', %L::jsonb', jsonb_build_array(jsonb_build_object('level', 1, 'action', 'APROVADO', 'approved_by', email_a))))), nega,
        'a insere rascunho com passo de aprovação');
    PERFORM pg_temp.da(pg_temp.au(a, format(ins, '', org_a, m_exige, '')), 'ok:1',
        'a insere rascunho comum (Novo ofício)');

    PERFORM pg_temp.da(pg_temp.au(a, format(enviar, d)), 'ok:PENDENTE', 'a envia para aprovação (fn_alcada_enviar)');
    PERFORM pg_temp.confere(pg_temp.st(d) = 'RASCUNHO/PENDENTE/1/0', 'em aprovação: PENDENTE, 1 nível, sem passo');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'approval_status = ''APROVADO''', d)), nega,
        'a passa de PENDENTE para APROVADO direto');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'approval_required_levels = 2', d)), 'ok:1',
        'subir os níveis no meio da aprovação é livre (só aperta)');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'approval_required_levels = 1', d)), nega,
        'a rebaixa os níveis no meio da aprovação');

    -- ── 3. caminho legítimo: aprovador aprova, ofício é emitido ──────────────
    PERFORM pg_temp.da(pg_temp.au(a, format(emitir, d)), '22023:O ofício está em aprovação — aguarde a decisão para emitir.',
        'a emite ofício em aprovação');
    PERFORM pg_temp.da(pg_temp.au(a, format(aprova, d, 'NULL')), 'P0001:ALCADA_NAO_PERMITE: o nível 1 deste item é aprovado por %',
        'a (não é aprovador de ofício) aprova pela RPC');
    PERFORM pg_temp.da(pg_temp.au(b, format(aprova, d, '1')), 'ok:PENDENTE', 'b aprova o nível 1 de 2');
    -- O nível 2 não tem aprovador cadastrado: qualquer membro aprova (regra de fn_alcada_pode_aprovar).
    PERFORM pg_temp.da(pg_temp.au(b, format(aprova, d, '2')), 'ok:APROVADO', 'b aprova o nível 2');
    PERFORM pg_temp.confere((SELECT approval_chain -> 0 ->> 'approved_by' = email_b FROM public.doc_gen_documentos WHERE id = d),
        'o passo fica em nome de b (e-mail do JWT)');

    -- texto alterado depois da aprovação: a aprovação era do texto anterior
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'assunto = ''TESTE APROVACAO TRAVA patch (editado)'', versao = versao + 1', d)), 'ok:1',
        'a salva o rascunho aprovado com texto novo');
    PERFORM pg_temp.confere(pg_temp.st(d) = 'RASCUNHO/RASCUNHO/2/2', 'texto alterado depois da aprovação: volta a RASCUNHO');
    PERFORM pg_temp.da(pg_temp.au(a, format(emitir, d)), '22023:Este modelo exige aprovação antes da emissão.',
        'depois de editado, não emite sem nova aprovação');
    PERFORM pg_temp.da(pg_temp.au(a, format(enviar, d)), 'ok:PENDENTE', 'a reenvia o texto novo');
    PERFORM pg_temp.da(pg_temp.au(b, format(aprova, d, 'NULL')), 'ok:APROVADO', 'b aprova de novo (1 nível: a cadeia foi zerada no envio)');
    v := pg_temp.au(a, format(emitir, d));
    PERFORM pg_temp.da(v, 'ok:%', 'a emite o ofício aprovado');
    PERFORM pg_temp.confere((SELECT status = 'EMITIDO' AND numero = substr(v, 4) FROM public.doc_gen_documentos WHERE id = d),
        'emitido com o número devolvido');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'resposta_esperada_ate = current_date + 15', d)), 'ok:1',
        'prazo de resposta do emitido continua editável');

    -- ── 4. retirar da aprovação, rejeitar e reenviar ─────────────────────────
    d := pg_temp.oficio(org_a, m_exige, 'retirar');
    PERFORM pg_temp.da(pg_temp.au(a, format(enviar, d)), 'ok:PENDENTE', 'a envia o segundo ofício');
    PERFORM pg_temp.da(pg_temp.au(a, format('WITH u AS (UPDATE public.doc_gen_documentos SET approval_status = ''RASCUNHO'' '
                                             'WHERE id = %L AND approval_status = ''PENDENTE'' RETURNING 1) SELECT count(*)::text FROM u', d)), 'ok:1',
        'a retira da aprovação (retirarDaAprovacao)');
    PERFORM pg_temp.confere(pg_temp.st(d) = 'RASCUNHO/RASCUNHO/1/0', 'retirado: RASCUNHO');
    PERFORM pg_temp.da(pg_temp.au(a, format(enviar, d)), 'ok:PENDENTE', 'a envia de novo');
    PERFORM pg_temp.da(pg_temp.au(a, format(rejeita, d)), 'P0001:ALCADA_NAO_PERMITE:%', 'a (não é aprovador) rejeita pela RPC');
    PERFORM pg_temp.da(pg_temp.au(b, format(rejeita, d)), 'ok:REJEITADO', 'b rejeita');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'approval_status = ''APROVADO''', d)), nega,
        'a passa de REJEITADO para APROVADO direto');
    PERFORM pg_temp.da(pg_temp.au(a, format(emitir, d)), '22023:Este modelo exige aprovação antes da emissão.',
        'rejeitado não emite');
    PERFORM pg_temp.da(pg_temp.au(a, format(enviar, d)), 'ok:PENDENTE', 'a reenvia o rejeitado');
    PERFORM pg_temp.da(pg_temp.au(b, format(aprova, d, 'NULL')), 'ok:APROVADO', 'b aprova o reenviado');
    PERFORM pg_temp.da(pg_temp.au(a, format(emitir, d)), 'ok:%', 'a emite o reenviado e aprovado');

    -- ── 5. modelo que não exige aprovação: nada muda ─────────────────────────
    d := pg_temp.oficio(org_a, m_livre, 'livre');
    PERFORM pg_temp.da(pg_temp.au(a, format(emitir, d)), 'ok:%', 'modelo sem exigência: a emite direto');
    d := pg_temp.oficio(org_a, m_livre, 'livre patch');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'approval_status = ''APROVADO''', d)), nega,
        'nem no modelo sem exigência o membro forja APROVADO (o histórico mentiria)');

    -- ── 6. a trava é a mesma da alçada, e não fica exposta ───────────────────
    PERFORM pg_temp.confere(EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.doc_gen_documentos'::regclass
                                       AND t.tgname = 'trg_alcada_guarda' AND NOT t.tgisinternal),
        'trg_alcada_guarda está em doc_gen_documentos');
    PERFORM pg_temp.confere(NOT has_function_privilege('anon', 'public.fn_alcada_guarda()', 'EXECUTE'),
        'anon não executa fn_alcada_guarda');

    RAISE NOTICE 'TUDO OK';
END $$;

SELECT 'TUDO OK' AS resultado;
ROLLBACK;
