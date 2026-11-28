-- scripts/teste-docgen-aprovacao-trava.sql
-- Prova: ofício (doc_gen_documentos) só fica APROVADO pela aprovação — nunca por gravação direta.
--   • Ataques de um membro comum pela API, todos recusados com 42501 ALCADA_NAO_PERMITE:
--     PATCH approval_status = 'APROVADO' no rascunho (e depois emitir), PENDENTE → APROVADO,
--     REJEITADO → APROVADO, cadeia forjada, INSERT de rascunho já aprovado ou com passo,
--     níveis rebaixados no meio da aprovação.
--   • Revisão r1: aprovação velha não vale para texto novo (o cliente não põe PENDENTE direto —
--     aprovado com/sem texto trocado, retirado e editado, INSERT PENDENTE); ofício não nasce emitido (INSERT com status/número/emitido_* recusado
--     para qualquer escritor sem a marca docgen.emitindo).
--   • Revisão r2: nem REJEITADO direto (abriria o reenvio, que mantém a cadeia) — pela API a
--     aprovação só volta a RASCUNHO; rejeição de verdade → reenvio recomeça no nível 1.
--   • Revisão r3: a exigência (aprovação/assinatura) é a do MODELO NA CRIAÇÃO, guardada no ofício
--     (doc_gen_documentos.exige_aprovacao/exige_assinatura): desligar no modelo depois não libera
--     a emissão nem a assinatura; o cliente não grava as colunas; o modelo do ofício só muda no
--     rascunho antes do envio, para modelo da mesma organização, e a exigência vem do novo.
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
-- Com a versão r0 da migration (só trg_alcada_guarda), falha em "r1: a troca o texto do aprovado
-- e põe PENDENTE no mesmo PATCH" (veio ok:1); sem a seção 6, em "r1: a insere ofício já EMITIDO
-- com número" (veio ok:1). Com a r1, falha em "r2: a passa o APROVADO para REJEITADO direto" (ok:1).
-- Com a r2, falha em "r3: o membro desliga a exigência no modelo e emite" (veio ok:OF-…).
--
-- Ensaio (migration ainda não aplicada; o montador tira o BEGIN;/COMMIT; dela):
--   bash scripts/montar-ensaio.sh -o /tmp/e.sql scripts/teste-docgen-aprovacao-trava.sql \
--        supabase/migrations/aplicar_20271128410000_docgen_aprovacao_trava.sql
--   npx supabase db query --linked -f /tmp/e.sql
-- Depois de aplicada (ou depois da aplicar_20271118915100_alcada_trava_servidor, que instala a
-- mesma trava nas 8 tabelas):
--   npx supabase db query --linked -f scripts/teste-docgen-aprovacao-trava.sql

BEGIN;
-- r3: ofícios que JÁ existem quando a migration roda (um rascunho e um emitido) — o backfill tem
-- de preencher a exigência dos dois a partir do modelo. Com a marca da emissão, para o INSERT do
-- emitido passar também depois de a migration estar aplicada.
SELECT set_config('docgen.emitindo', 'on', true);
WITH m AS (
    INSERT INTO public.doc_gen_modelos (organization_id, nome, exige_aprovacao, exige_assinatura)
    VALUES ('926cf626-ba49-4ee4-9f35-472822fb90e6', 'TESTE APROVACAO TRAVA backfill', true, true) RETURNING id)
INSERT INTO public.doc_gen_documentos (organization_id, modelo_id, modelo_versao, assunto, status, numero)
SELECT '926cf626-ba49-4ee4-9f35-472822fb90e6', m.id, 1, 'TESTE APROVACAO TRAVA backfill ' || s, s,
       CASE WHEN s = 'EMITIDO' THEN 'OF-995/2026' END
  FROM m, unnest(ARRAY['RASCUNHO', 'EMITIDO']) s;
SELECT set_config('docgen.emitindo', 'off', true);
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
    org_b UUID; m_outra UUID;
    a UUID; b UUID; email_a TEXT; email_b TEXT;
    m_exige UUID; m_livre UUID; d UUID; v TEXT;
    upd     CONSTANT TEXT := 'WITH u AS (UPDATE public.doc_gen_documentos SET %s WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u';
    ins     CONSTANT TEXT := 'WITH i AS (INSERT INTO public.doc_gen_documentos (organization_id, modelo_id, modelo_versao, assunto, destinatario_tipo, destinatario_snapshot%s) '
                             'VALUES (%L, %L, 1, ''TESTE APROVACAO TRAVA inserido'', ''MANUAL'', ''{"razao_social":"X"}''%s) RETURNING 1) SELECT count(*)::text FROM i';
    emitir  CONSTANT TEXT := 'SELECT public.doc_gen_emitir(%L)';
    enviar  CONSTANT TEXT := 'SELECT public.fn_alcada_enviar(''doc_gen_documento'', %L, ''exigir1'') ->> ''approval_status''';
    aprova  CONSTANT TEXT := 'SELECT public.fn_alcada_aprovar(''doc_gen_documento'', %L, %s, NULL, ''{"level1_label":"Gestor","level2_label":"Diretoria"}''::jsonb) ->> ''approval_status''';
    reenvia CONSTANT TEXT := 'SELECT public.fn_alcada_enviar(''doc_gen_documento'', %L, ''exigir1'', ''{}''::jsonb, true) ->> ''approval_status''';
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

    -- ── 6. aprovação velha não vale para texto novo (revisão r1, achado 1) ────
    -- A cadeia sobrevive ao "volta a RASCUNHO" (texto editado, retirar). Se o cliente pudesse
    -- pôr PENDENTE direto, fn_alcada_proximo_nivel veria o nível 1 já feito e pediria o 2 — que,
    -- sem aprovador cadastrado, qualquer membro aprova: texto novo emitido sem o aprovador ver.
    d := pg_temp.oficio(org_a, m_exige, 'aprovacao velha');
    PERFORM pg_temp.da(pg_temp.au(a, format(enviar, d)), 'ok:PENDENTE', 'r1: a envia');
    PERFORM pg_temp.da(pg_temp.au(b, format(aprova, d, 'NULL')), 'ok:APROVADO', 'r1: b aprova');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'assunto = ''TESTE APROVACAO TRAVA trocado'', versao = versao + 1, approval_status = ''PENDENTE''', d)), nega,
        'r1: a troca o texto do aprovado e põe PENDENTE no mesmo PATCH');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'approval_status = ''PENDENTE''', d)), nega,
        'r1: a põe o aprovado em PENDENTE direto (sem mudar o texto)');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'assunto = ''TESTE APROVACAO TRAVA trocado'', versao = versao + 1', d)), 'ok:1',
        'r1: a edita o aprovado (volta a RASCUNHO, cadeia fica como histórico)');
    PERFORM pg_temp.confere(pg_temp.st(d) = 'RASCUNHO/RASCUNHO/1/1', 'r1: RASCUNHO com o passo antigo na cadeia');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'approval_status = ''PENDENTE''', d)), nega,
        'r1: depois de editado, a põe PENDENTE direto (reaproveitaria o nível 1 antigo)');
    PERFORM pg_temp.da(pg_temp.au(a, format(aprova, d, '2')), 'P0001:Item não está pendente de aprovação.',
        'r1: sem PENDENTE, ninguém aprova o "nível 2" do texto novo');
    PERFORM pg_temp.da(pg_temp.au(a, format(emitir, d)), '22023:Este modelo exige aprovação antes da emissão.',
        'r1: texto novo não emite');
    PERFORM pg_temp.da(pg_temp.au(a, format(enviar, d)), 'ok:PENDENTE', 'r1: a envia pela RPC');
    PERFORM pg_temp.confere(pg_temp.st(d) = 'RASCUNHO/PENDENTE/1/0', 'r1: o envio pela RPC zera a cadeia');
    PERFORM pg_temp.da(pg_temp.au(a, format(aprova, d, 'NULL')), 'P0001:ALCADA_NAO_PERMITE: o nível 1 deste item é aprovado por %',
        'r1: o texto novo volta a pedir o nível 1 (só b)');
    PERFORM pg_temp.da(pg_temp.au(a, format('WITH u AS (UPDATE public.doc_gen_documentos SET approval_status = ''RASCUNHO'' '
                                             'WHERE id = %L AND approval_status = ''PENDENTE'' RETURNING 1) SELECT count(*)::text FROM u', d)), 'ok:1',
        'r1: a retira da aprovação');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'assunto = ''TESTE APROVACAO TRAVA retirado e editado'', versao = versao + 1', d)), 'ok:1',
        'r1: a edita o retirado');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'approval_status = ''PENDENTE''', d)), nega,
        'r1: retirado e editado, a põe PENDENTE direto');
    PERFORM pg_temp.da(pg_temp.au(a, format(ins, ', approval_status', org_a, m_exige, ', ''PENDENTE''')), nega,
        'r1: a insere rascunho já PENDENTE');
    PERFORM pg_temp.da(pg_temp.au(a, format(enviar, d)), 'ok:PENDENTE', 'r1: a envia pela RPC de novo');
    PERFORM pg_temp.da(pg_temp.au(b, format(aprova, d, 'NULL')), 'ok:APROVADO', 'r1: b aprova o texto novo');
    PERFORM pg_temp.da(pg_temp.au(a, format(emitir, d)), 'ok:%', 'r1: a emite o texto que b aprovou');

    -- ── 7. ofício não nasce emitido (revisão r1, achado 2) ───────────────────
    -- fn_doc_gen_congelar é só BEFORE UPDATE: o INSERT direto com status/número de emitido passava.
    PERFORM pg_temp.da(pg_temp.au(a, format(ins, ', status, numero, emitido_em, emitido_por', org_a, m_livre,
            format(', ''EMITIDO'', ''OF-999/2026'', now(), %L', email_a))), '42501:O documento nasce como rascunho%',
        'r1: a insere ofício já EMITIDO com número');
    PERFORM pg_temp.da(pg_temp.au(a, format(ins, ', numero', org_a, m_livre, ', ''OF-998/2026''')), '42501:O documento nasce como rascunho%',
        'r1: a insere rascunho com número');
    PERFORM pg_temp.da(pg_temp.au(a, format(ins, ', status', org_a, m_livre, ', ''ENVIADO''')), '42501:O documento nasce como rascunho%',
        'r1: a insere ofício ENVIADO sem número');
    PERFORM pg_temp.da(pg_temp.au(a, format(ins, ', emitido_por', org_a, m_livre, format(', %L', email_a))), '42501:O documento nasce como rascunho%',
        'r1: a insere rascunho com emitido_por');
    BEGIN
        INSERT INTO public.doc_gen_documentos (organization_id, modelo_id, modelo_versao, assunto, status, numero)
        VALUES (org_a, m_livre, 1, 'TESTE APROVACAO TRAVA servidor', 'EMITIDO', 'OF-997/2026');
        v := 'ok';
    EXCEPTION WHEN OTHERS THEN
        v := SQLSTATE || ':' || SQLERRM;
    END;
    PERFORM pg_temp.da(v, '42501:O documento nasce como rascunho%', 'r1: nem o servidor (postgres) insere emitido sem a marca da emissão');
    PERFORM set_config('docgen.emitindo', 'on', true);
    INSERT INTO public.doc_gen_documentos (organization_id, modelo_id, modelo_versao, assunto, status, numero)
    VALUES (org_a, m_livre, 1, 'TESTE APROVACAO TRAVA com marca', 'EMITIDO', 'OF-996/2026');
    PERFORM set_config('docgen.emitindo', 'off', true);
    PERFORM pg_temp.confere(EXISTS (SELECT 1 FROM public.doc_gen_documentos WHERE numero = 'OF-996/2026' AND organization_id = org_a),
        'r1: com docgen.emitindo (marca da emissão) o servidor insere');

    -- ── 8. rejeição forjada + reenvio (revisão r2) ──────────────────────────
    -- fn_alcada_enviar(p_reenvio => true) exige só REJEITADO e MANTÉM a cadeia. Se o cliente pudesse
    -- gravar REJEITADO direto, a aprovação do texto antigo voltaria a contar no texto novo.
    d := pg_temp.oficio(org_a, m_exige, 'rejeicao forjada');
    PERFORM pg_temp.da(pg_temp.au(a, format(enviar, d)), 'ok:PENDENTE', 'r2: a envia');
    PERFORM pg_temp.da(pg_temp.au(b, format(aprova, d, 'NULL')), 'ok:APROVADO', 'r2: b aprova o texto X');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'approval_status = ''REJEITADO''', d)), nega,
        'r2: a passa o APROVADO para REJEITADO direto');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'assunto = ''TESTE APROVACAO TRAVA texto Y'', versao = versao + 1', d)), 'ok:1',
        'r2: a troca o texto para Y (volta a RASCUNHO, cadeia [L1 b] fica)');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'approval_status = ''REJEITADO''', d)), nega,
        'r2: rascunho com a cadeia antiga: a grava REJEITADO direto');
    PERFORM pg_temp.da(pg_temp.au(a, format(reenvia, d)), 'P0001:Só item rejeitado é reenviado para aprovação.',
        'r2: sem a rejeição forjada, o reenvio (que mantém a cadeia) é recusado');
    PERFORM pg_temp.da(pg_temp.au(a, format(ins, ', approval_status', org_a, m_exige, ', ''REJEITADO''')), nega,
        'r2: a insere rascunho já REJEITADO');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'approval_status = ''RASCUNHO''', d)), 'ok:1',
        'r2: voltar a RASCUNHO segue livre (retirar)');

    -- em aprovação, nível 1 de 2 dado
    PERFORM pg_temp.da(pg_temp.au(a, format(enviar, d)), 'ok:PENDENTE', 'r2: a envia o texto Y pela RPC (cadeia zerada)');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'approval_required_levels = 2', d)), 'ok:1', 'r2: 2 níveis');
    PERFORM pg_temp.da(pg_temp.au(b, format(aprova, d, '1')), 'ok:PENDENTE', 'r2: b aprova o nível 1 de Y');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'approval_status = ''REJEITADO''', d)), nega,
        'r2: PENDENTE com nível 1 dado: a grava REJEITADO direto');

    -- rejeição de verdade: o reenvio pede o nível 1 de novo
    PERFORM pg_temp.da(pg_temp.au(b, format(rejeita, d)), 'ok:REJEITADO', 'r2: b rejeita pela RPC');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'assunto = ''TESTE APROVACAO TRAVA texto Z'', versao = versao + 1', d)), 'ok:1',
        'r2: a corrige o texto do rejeitado');
    PERFORM pg_temp.da(pg_temp.au(a, format(reenvia, d)), 'ok:PENDENTE', 'r2: a reenvia o rejeitado (p_reenvio, cadeia fica)');
    PERFORM pg_temp.confere(pg_temp.st(d) = 'RASCUNHO/PENDENTE/1/2', 'r2: reenviado com o histórico [L1 b, REJEITADO]');
    PERFORM pg_temp.da(pg_temp.au(a, format(aprova, d, 'NULL')), 'P0001:ALCADA_NAO_PERMITE: o nível 1 deste item é aprovado por %',
        'r2: depois da rejeição a rodada recomeça no nível 1 (só b)');
    PERFORM pg_temp.da(pg_temp.au(b, format(aprova, d, '1')), 'ok:APROVADO', 'r2: b aprova Z');
    PERFORM pg_temp.da(pg_temp.au(a, format(emitir, d)), 'ok:%', 'r2: a emite o texto que b aprovou');

    -- ── 9. a exigência é a do modelo na criação (revisão r3) ─────────────────
    -- doc_gen_emitir lia o modelo ATUAL: qualquer membro desligava exige_aprovacao no editor de
    -- modelos (ou trocava o modelo do rascunho), emitia e religava.
    d := pg_temp.oficio(org_a, m_exige, 'modelo desligado');
    PERFORM pg_temp.da(pg_temp.au(a, format('WITH u AS (UPDATE public.doc_gen_modelos SET exige_aprovacao = false, exige_assinatura = false '
                                             'WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', m_exige)), 'ok:1',
        'r3: o membro desliga a exigência no modelo (editar modelo segue livre)');
    PERFORM pg_temp.da(pg_temp.au(a, format(emitir, d)), '22023:Este modelo exige aprovação antes da emissão.',
        'r3: o membro desliga a exigência no modelo e emite');
    PERFORM pg_temp.da(pg_temp.au(a, format('SELECT public.doc_gen_assinar(%L)::text', d)), '22023:Este modelo exige aprovação antes da assinatura.',
        'r3: nem a assinatura segue o modelo desligado');
    PERFORM pg_temp.confere((SELECT exige_aprovacao AND NOT exige_assinatura FROM public.doc_gen_documentos WHERE id = d),
        'r3: o ofício guardou a exigência do modelo na criação');
    -- criado pelo front depois de desligar: nasce com a exigência de agora (sem as colunas no payload)
    PERFORM pg_temp.da(pg_temp.au(a, format('WITH i AS (INSERT INTO public.doc_gen_documentos (organization_id, modelo_id, modelo_versao, assunto, destinatario_tipo, destinatario_snapshot) '
                                             'VALUES (%L, %L, 1, ''TESTE APROVACAO TRAVA front'', ''MANUAL'', ''{"razao_social":"X"}'') RETURNING exige_aprovacao) '
                                             'SELECT exige_aprovacao::text FROM i', org_a, m_exige)), 'ok:false',
        'r3: Novo ofício (payload do front, sem as colunas) nasce com a exigência atual do modelo');
    UPDATE public.doc_gen_modelos SET exige_aprovacao = true WHERE id = m_exige;
    PERFORM pg_temp.da(pg_temp.au(a, format('WITH i AS (INSERT INTO public.doc_gen_documentos (organization_id, modelo_id, modelo_versao, assunto, destinatario_tipo, destinatario_snapshot) '
                                             'VALUES (%L, %L, 1, ''TESTE APROVACAO TRAVA front 2'', ''MANUAL'', ''{"razao_social":"X"}'') RETURNING exige_aprovacao) '
                                             'SELECT exige_aprovacao::text FROM i', org_a, m_exige)), 'ok:true',
        'r3: religado o modelo, o ofício novo nasce exigindo');

    -- o cliente não grava a exigência
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, 'exige_aprovacao = false', d)), nega,
        'r3: a desliga a exigência no próprio ofício');
    PERFORM pg_temp.da(pg_temp.au(a, format(ins, ', exige_aprovacao', org_a, m_exige, ', false')), nega,
        'r3: a insere ofício dizendo que não exige');

    -- troca de modelo
    SELECT o.id INTO org_b FROM public.organizations o WHERE o.id <> org_a ORDER BY o.id LIMIT 1;
    INSERT INTO public.doc_gen_modelos (organization_id, nome, exige_aprovacao)
    VALUES (org_b, 'TESTE APROVACAO TRAVA outra org', false) RETURNING id INTO m_outra;
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, format('modelo_id = %L', m_outra), d)), '42501:O modelo tem de ser da mesma organização do ofício.',
        'r3: a troca o modelo por um de OUTRA organização (a FK não olha a RLS)');
    PERFORM pg_temp.da(pg_temp.au(a, format(ins, '', org_a, m_outra, '')), '42501:O modelo tem de ser da mesma organização do ofício.',
        'r3: a cria ofício com modelo de outra organização');
    PERFORM pg_temp.da(pg_temp.au(a, format(enviar, d)), 'ok:PENDENTE', 'r3: a envia');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, format('modelo_id = %L', m_livre), d)), '42501:%',
        'r3: troca de modelo em aprovação recusada');
    PERFORM pg_temp.da(pg_temp.au(b, format(aprova, d, 'NULL')), 'ok:APROVADO', 'r3: b aprova');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, format('modelo_id = %L', m_livre), d)),
        '42501:O modelo do ofício só muda no rascunho, antes de enviar para aprovação.',
        'r3: troca de modelo do aprovado recusada (perderia a aprovação e cairia num modelo sem exigência)');
    PERFORM pg_temp.da(pg_temp.au(a, format(emitir, d)), 'ok:%', 'r3: a emite o aprovado (emissão legítima intacta)');

    d := pg_temp.oficio(org_a, m_exige, 'troca de modelo');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, format('modelo_id = %L', m_livre), d)), 'ok:1',
        'r3: no rascunho, a escolhe outro modelo da mesma organização');
    PERFORM pg_temp.confere((SELECT NOT exige_aprovacao FROM public.doc_gen_documentos WHERE id = d),
        'r3: a exigência passa a ser a do modelo novo');
    PERFORM pg_temp.da(pg_temp.au(a, format(upd, format('modelo_id = %L', m_exige), d)), 'ok:1', 'r3: a volta ao modelo que exige');
    PERFORM pg_temp.da(pg_temp.au(a, format(emitir, d)), '22023:Este modelo exige aprovação antes da emissão.',
        'r3: de volta ao modelo que exige, não emite sem aprovação');

    -- ── 10. as travas estão no lugar, e não ficam expostas ────────────────────
    PERFORM pg_temp.confere(EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.doc_gen_documentos'::regclass
                                       AND t.tgname = 'trg_alcada_guarda' AND NOT t.tgisinternal),
        'trg_alcada_guarda está em doc_gen_documentos');
    PERFORM pg_temp.confere(NOT has_function_privilege('anon', 'public.fn_alcada_guarda()', 'EXECUTE'),
        'anon não executa fn_alcada_guarda');
    PERFORM pg_temp.confere(EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.doc_gen_documentos'::regclass
                                       AND t.tgname = 'trg_doc_gen_trava_entrada' AND NOT t.tgisinternal),
        'trg_doc_gen_trava_entrada está em doc_gen_documentos');
    PERFORM pg_temp.confere(NOT has_function_privilege('anon', 'public.fn_doc_gen_trava_entrada()', 'EXECUTE'),
        'anon não executa fn_doc_gen_trava_entrada');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM public.doc_gen_documentos WHERE exige_aprovacao IS NULL OR exige_assinatura IS NULL),
        'r3: nenhum ofício sem a exigência guardada (backfill)');
    PERFORM pg_temp.confere((SELECT count(*) FROM public.doc_gen_documentos
                              WHERE assunto LIKE 'TESTE APROVACAO TRAVA backfill %' AND exige_aprovacao AND exige_assinatura) = 2,
        'r3: o rascunho e o emitido que já existiam receberam a exigência do modelo (backfill)');
    PERFORM pg_temp.confere(NOT has_function_privilege('anon', 'public.doc_gen_emitir(uuid, jsonb)', 'EXECUTE')
                            AND NOT has_function_privilege('anon', 'public.doc_gen_assinar(uuid)', 'EXECUTE'),
        'r3: emitir/assinar recriadas seguem sem EXECUTE para anon');

    RAISE NOTICE 'TUDO OK';
END $$;

SELECT 'TUDO OK' AS resultado;
ROLLBACK;
