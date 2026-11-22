-- scripts/teste-assinatura-interna.sql
-- Prova da F1 da assinatura interna (docs/planos/2026-11-21-assinatura-eletronica-interna.md).
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …';
-- sucesso = a linha final 'TUDO OK' (`db query` só devolve o último resultado).
--
--   npx supabase db query --linked -f scripts/teste-assinatura-interna.sql
--
-- Para ensaiar ANTES de aplicar: gere um arquivo com o conteúdo de
-- aplicar_20271122100000_assinatura_interna.sql no lugar da linha MIGRATION.

BEGIN;
-- MIGRATION

CREATE FUNCTION pg_temp.confere(p_ok BOOLEAN, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
END $$;

-- Roda p_sql e devolve 'ok:<resultado>' ou '<SQLSTATE>:<mensagem>'.
CREATE FUNCTION pg_temp.tenta(p_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
    BEGIN
        EXECUTE p_sql INTO v;
        v := 'ok:' || coalesce(v, '<null>');
    EXCEPTION WHEN OTHERS THEN
        v := SQLSTATE || ':' || SQLERRM;
    END;
    RETURN v;
END $$;

-- Como `authenticated` com as claims de p_user (molde de teste-link-celular-diario.sql).
CREATE FUNCTION pg_temp.como(p_user UUID, p_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', p_user, 'email', (SELECT u.email FROM auth.users u WHERE u.id = p_user),
                          'role', 'authenticated')::text, true);
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

CREATE FUNCTION pg_temp.h(p TEXT) RETURNS TEXT LANGUAGE sql AS $$
    SELECT encode(extensions.digest(p, 'sha256'), 'hex')
$$;

DO $$
DECLARE
    v_org     uuid;
    v_user    uuid;
    v_cli     uuid := gen_random_uuid();
    v_deal    uuid := gen_random_uuid();
    v_doc     uuid := gen_random_uuid();
    v_doc2    uuid := gen_random_uuid();
    v_doc3    uuid := gen_random_uuid();
    v_env     uuid := gen_random_uuid();
    v_env2    uuid := gen_random_uuid();
    v_r       jsonb;
    v_t       text;
    v_sig_cli uuid;
    v_sig_mem uuid;
    v_sig_tst uuid;
    v_link    text;
    v_ant     text;
    v_n       int;
BEGIN
    -- Uma org real com um membro real (tudo volta no ROLLBACK).
    SELECT m.organization_id, m.user_id INTO v_org, v_user
      FROM public.organization_members m JOIN auth.users u ON u.id = m.user_id
     WHERE NOT EXISTS (SELECT 1 FROM public.employees em WHERE em.user_id = m.user_id) AND m.email IS NOT NULL AND m.email LIKE '%@%.%'
     ORDER BY m.organization_id LIMIT 1;
    PERFORM pg_temp.confere(v_org IS NOT NULL, 'precisa de uma organização com membro');

    INSERT INTO public.clients (id, organization_id, name, email, document)
    VALUES (v_cli, v_org, 'Comprador Teste', 'comprador.teste@example.com', '111.444.777-35');
    INSERT INTO public.commercial_deals (id, organization_id, client_id, type, value)
    VALUES (v_deal, v_org, v_cli, 'SALE', 100000);
    INSERT INTO public.commercial_deal_documents (id, organization_id, deal_id, kind, nome, storage_path)
    VALUES (v_doc, v_org, v_deal, 'PROPOSTA', 'Proposta', v_org || '/negociacoes/' || v_deal || '/p.pdf');
    INSERT INTO public.client_portal_tokens (org_id, client_id, token) VALUES (v_org, v_cli, 'tok-teste-cliente');

    -- 1. Documento fora da pasta da negociação é recusado
    v_t := pg_temp.tenta(format($q$INSERT INTO public.commercial_deal_documents (organization_id, deal_id, kind, nome, storage_path)
                                VALUES (%L, %L, 'OUTRO', 'x', 'outra/pasta/x.pdf') RETURNING id::text$q$, v_org, v_deal));
    PERFORM pg_temp.confere(v_t LIKE '22023:%', '1. pasta errada deveria ser recusada: ' || v_t);

    -- 2. Criar envelope (cliente + representante + testemunha)
    v_r := public.assinatura_criar(v_env, 'DEAL_DOC', v_doc, 'Proposta de compra',
             v_org || '/' || v_env || '/original.pdf', repeat('a', 64), 2,
             jsonb_build_array(
                jsonb_build_object('canal', 'PORTAL_CLIENTE', 'client_id', v_cli),
                jsonb_build_object('canal', 'MEMBRO', 'user_id', v_user, 'cpf', '529.982.247-25'),
                jsonb_build_object('canal', 'LINK', 'nome', 'Testemunha Um', 'email', 'testemunha@example.com', 'cpf', '935.411.347-80')),
             v_user);
    PERFORM pg_temp.confere(jsonb_array_length(v_r->'signatarios') = 3, '2. três signatários');
    SELECT (x->>'id')::uuid INTO v_sig_cli FROM jsonb_array_elements(v_r->'signatarios') x WHERE x->>'canal' = 'PORTAL_CLIENTE';
    SELECT (x->>'id')::uuid INTO v_sig_mem FROM jsonb_array_elements(v_r->'signatarios') x WHERE x->>'canal' = 'MEMBRO';
    SELECT (x->>'id')::uuid, x->>'link_token' INTO v_sig_tst, v_link FROM jsonb_array_elements(v_r->'signatarios') x WHERE x->>'canal' = 'LINK';
    PERFORM pg_temp.confere(length(v_link) >= 40, '2. link da testemunha gerado');
    PERFORM pg_temp.confere((SELECT signature_status FROM public.commercial_deal_documents WHERE id = v_doc) = 'SENT', '2. projeção SENT');
    PERFORM pg_temp.confere((SELECT link_hash FROM public.assinatura_segredos WHERE signatario_id = v_sig_tst) = pg_temp.h(v_link),
                            '2. só o hash do link fica guardado');

    -- 3. Segundo envelope ativo para a mesma origem: recusado
    v_t := pg_temp.tenta(format($q$SELECT public.assinatura_criar(%L, 'DEAL_DOC', %L, 't', %L, %L, 1,
              '[{"canal":"PORTAL_CLIENTE","client_id":"%s"}]'::jsonb, %L)::text$q$,
              v_env2, v_doc, v_org || '/' || v_env2 || '/original.pdf', repeat('b', 64), v_cli, v_user));
    PERFORM pg_temp.confere(v_t LIKE '22023:%andamento%', '3. segundo envelope ativo: ' || v_t);

    -- 4. CPF inválido não entra; cliente de fora não entra; sem comprador não entra
    INSERT INTO public.commercial_deal_documents (id, organization_id, deal_id, kind, nome, storage_path)
    VALUES (v_doc3, v_org, v_deal, 'FICHA', 'Ficha', v_org || '/negociacoes/' || v_deal || '/f.pdf');
    v_t := pg_temp.tenta(format($q$SELECT public.assinatura_criar(%L, 'DEAL_DOC', %L, 't', %L, %L, 1,
              '[{"canal":"PORTAL_CLIENTE","client_id":"%s"},{"canal":"LINK","nome":"X","email":"x@example.com","cpf":"12345678900"}]'::jsonb, %L)::text$q$,
              v_env2, v_doc3, v_org || '/' || v_env2 || '/original.pdf', repeat('b', 64), v_cli, v_user));
    PERFORM pg_temp.confere(v_t LIKE '22023:%CPF%', '4. CPF inválido: ' || v_t);
    v_t := pg_temp.tenta(format($q$SELECT public.assinatura_criar(%L, 'DEAL_DOC', %L, 't', %L, %L, 1,
              '[{"canal":"PORTAL_CLIENTE","client_id":"%s"}]'::jsonb, %L)::text$q$,
              v_env2, v_doc3, v_org || '/' || v_env2 || '/original.pdf', repeat('b', 64), gen_random_uuid(), v_user));
    PERFORM pg_temp.confere(v_t LIKE '42501:%', '4. cliente de fora: ' || v_t);
    v_t := pg_temp.tenta(format($q$SELECT public.assinatura_criar(%L, 'DEAL_DOC', %L, 't', %L, %L, 1,
              '[{"canal":"LINK","nome":"X","email":"x@example.com","cpf":"93541134780"}]'::jsonb, %L)::text$q$,
              v_env2, v_doc3, v_org || '/' || v_env2 || '/original.pdf', repeat('b', 64), v_user));
    PERFORM pg_temp.confere(v_t LIKE '22023:%comprador%', '4. sem comprador: ' || v_t);
    v_t := pg_temp.tenta(format($q$SELECT public.assinatura_criar(%L, 'DEAL_DOC', %L, 't', %L, %L, 1,
              '[{"canal":"PORTAL_CLIENTE","client_id":"%s"}]'::jsonb, %L)::text$q$,
              v_env2, v_doc3, v_org || '/' || v_env2 || '/original.pdf', repeat('b', 64), v_cli, gen_random_uuid()));
    PERFORM pg_temp.confere(v_t LIKE '42501:%', '4. quem envia precisa ser membro: ' || v_t);
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM public.assinatura_envelopes WHERE id = v_env2), '4. recusa não deixa envelope');

    -- 5. Eventos: cadeia e imutabilidade
    SELECT hash INTO v_ant FROM public.assinatura_eventos WHERE envelope_id = v_env ORDER BY id LIMIT 1;
    PERFORM pg_temp.confere(v_ant ~ '^[0-9a-f]{64}$', '5. evento CRIADO com hash');
    v_t := pg_temp.tenta(format('UPDATE public.assinatura_eventos SET tipo = %L WHERE envelope_id = %L RETURNING 1', 'X', v_env));
    PERFORM pg_temp.confere(v_t LIKE '42501:%', '5. UPDATE em evento recusado: ' || v_t);
    v_t := pg_temp.tenta(format('DELETE FROM public.assinatura_eventos WHERE envelope_id = %L RETURNING 1', v_env));
    PERFORM pg_temp.confere(v_t LIKE '42501:%', '5. DELETE em evento recusado: ' || v_t);

    -- 6. Autorização por canal
    v_t := pg_temp.tenta(format($q$SELECT public.assinatura_ver(%L, 'PORTAL_CLIENTE', 'token-falso', NULL, NULL, NULL)::text$q$, v_sig_cli));
    PERFORM pg_temp.confere(v_t LIKE '42501:%', '6. token falso: ' || v_t);
    v_t := pg_temp.tenta(format($q$SELECT public.assinatura_ver(%L, 'LINK', 'tok-teste-cliente', NULL, NULL, NULL)::text$q$, v_sig_cli));
    PERFORM pg_temp.confere(v_t LIKE '42501:%', '6. canal trocado: ' || v_t);
    v_t := pg_temp.tenta(format($q$SELECT public.assinatura_ver(%L, 'MEMBRO', NULL, %L, NULL, NULL)::text$q$, v_sig_mem, gen_random_uuid()));
    PERFORM pg_temp.confere(v_t LIKE '42501:%', '6. outro usuário: ' || v_t);
    v_r := public.assinatura_ver(v_sig_cli, 'PORTAL_CLIENTE', 'tok-teste-cliente', NULL, '10.0.0.1', 'teste');
    PERFORM pg_temp.confere(v_r->>'status' = 'ENVIADO', '6. ver pelo portal');
    PERFORM pg_temp.confere((SELECT count(*) FROM public.assinatura_eventos WHERE signatario_id = v_sig_cli AND tipo = 'VISUALIZOU') = 1, '6. VISUALIZOU gravado');
    PERFORM public.assinatura_ver(v_sig_cli, 'PORTAL_CLIENTE', 'tok-teste-cliente', NULL, '10.0.0.1', 'teste');
    PERFORM pg_temp.confere((SELECT count(*) FROM public.assinatura_eventos WHERE signatario_id = v_sig_cli AND tipo = 'VISUALIZOU') = 1, '6. VISUALIZOU só uma vez');

    -- 7. Leitura do portal
    PERFORM pg_temp.confere((public.fn_portal_assinaturas('token-falso')->>'valid')::boolean = false, '7. portal token falso');
    v_r := public.fn_portal_assinaturas('tok-teste-cliente');
    PERFORM pg_temp.confere(jsonb_array_length(v_r->'itens') = 1 AND v_r->'itens'->0->>'minha_situacao' = 'PENDENTE', '7. portal lista a pendência');
    PERFORM pg_temp.confere(NOT (v_r::text LIKE '%original.pdf%'), '7. portal não vê caminho de arquivo');

    -- 8. Código: limite de 1 por minuto
    v_r := public.assinatura_registrar_codigo(v_sig_cli, 'PORTAL_CLIENTE', 'tok-teste-cliente', NULL, pg_temp.h(v_sig_cli || ':123456'), NULL, NULL);
    PERFORM pg_temp.confere((v_r->>'ok')::boolean AND v_r->>'email' = 'comprador.teste@example.com', '8. código registrado');
    v_t := pg_temp.tenta(format($q$SELECT public.assinatura_registrar_codigo(%L, 'PORTAL_CLIENTE', 'tok-teste-cliente', NULL, %L, NULL, NULL)::text$q$,
              v_sig_cli, pg_temp.h(v_sig_cli || ':654321')));
    PERFORM pg_temp.confere(v_t LIKE '54000:%', '8. segundo código no mesmo minuto: ' || v_t);

    -- 9. Confirmação errada: 5 tentativas invalidam o código; CPF errado conta
    FOR i IN 1..4 LOOP
        v_r := public.assinatura_confirmar(v_sig_cli, 'PORTAL_CLIENTE', 'tok-teste-cliente', NULL,
                 pg_temp.h(v_sig_cli || ':000000'), '111.444.777-35', true, 'v1', NULL, NULL);
        PERFORM pg_temp.confere((v_r->>'ok')::boolean = false AND v_r->>'erro' LIKE 'Código ou CPF%', '9. tentativa errada ' || i);
    END LOOP;
    v_r := public.assinatura_confirmar(v_sig_cli, 'PORTAL_CLIENTE', 'tok-teste-cliente', NULL,
             pg_temp.h(v_sig_cli || ':123456'), '000.000.000-00', true, 'v1', NULL, NULL);
    PERFORM pg_temp.confere((v_r->>'pedir_codigo')::boolean, '9. 5ª errada (CPF) invalida o código');
    PERFORM pg_temp.confere((SELECT otp_hash FROM public.assinatura_segredos WHERE signatario_id = v_sig_cli) IS NULL, '9. código apagado');
    v_r := public.assinatura_confirmar(v_sig_cli, 'PORTAL_CLIENTE', 'tok-teste-cliente', NULL,
             pg_temp.h(v_sig_cli || ':123456'), '111.444.777-35', true, 'v1', NULL, NULL);
    PERFORM pg_temp.confere((v_r->>'ok')::boolean = false, '9. código certo depois de invalidado não vale');

    -- 10. Aceite obrigatório; depois assina de verdade (código "novo" posto direto)
    UPDATE public.assinatura_segredos SET otp_hash = pg_temp.h(v_sig_cli || ':222222'), otp_expira_em = now() + interval '10 minutes', otp_tentativas = 0
     WHERE signatario_id = v_sig_cli;
    v_r := public.assinatura_confirmar(v_sig_cli, 'PORTAL_CLIENTE', 'tok-teste-cliente', NULL,
             pg_temp.h(v_sig_cli || ':222222'), '111.444.777-35', false, 'v1', NULL, NULL);
    PERFORM pg_temp.confere((v_r->>'ok')::boolean = false AND v_r->>'erro' LIKE '%aceite%', '10. sem aceite não assina');
    v_r := public.assinatura_confirmar(v_sig_cli, 'PORTAL_CLIENTE', 'tok-teste-cliente', NULL,
             pg_temp.h(v_sig_cli || ':222222'), '111.444.777-35', true, 'v1', '10.0.0.1', 'navegador');
    PERFORM pg_temp.confere((v_r->>'ok')::boolean AND (v_r->>'finalizar')::boolean = false AND (v_r->>'faltam')::int = 2, '10. cliente assinou: ' || v_r::text);
    v_t := pg_temp.tenta(format($q$UPDATE public.assinatura_signatarios SET ip = 'x' WHERE id = %L RETURNING 1$q$, v_sig_cli));
    PERFORM pg_temp.confere(v_t LIKE '42501:%', '10. assinatura registrada não se altera: ' || v_t);

    -- 11. Testemunha pelo link e representante pelo usuário; o último finaliza
    UPDATE public.assinatura_segredos SET otp_hash = pg_temp.h(v_sig_tst || ':333333'), otp_expira_em = now() + interval '10 minutes'
     WHERE signatario_id = v_sig_tst;
    v_r := public.assinatura_confirmar(v_sig_tst, 'LINK', v_link, NULL, pg_temp.h(v_sig_tst || ':333333'), '93541134780', true, 'v1', NULL, NULL);
    PERFORM pg_temp.confere((v_r->>'ok')::boolean AND (v_r->>'finalizar')::boolean = false, '11. testemunha assinou');
    UPDATE public.assinatura_segredos SET otp_hash = pg_temp.h(v_sig_mem || ':444444'), otp_expira_em = now() + interval '10 minutes'
     WHERE signatario_id = v_sig_mem;
    v_r := public.assinatura_confirmar(v_sig_mem, 'MEMBRO', NULL, v_user, pg_temp.h(v_sig_mem || ':444444'), '52998224725', true, 'v1', NULL, NULL);
    PERFORM pg_temp.confere((v_r->>'ok')::boolean AND (v_r->>'finalizar')::boolean, '11. último assinou e pede finalização');
    PERFORM pg_temp.confere((SELECT status FROM public.assinatura_envelopes WHERE id = v_env) = 'FINALIZANDO', '11. envelope FINALIZANDO');

    -- 12. Concluir (idempotente) e travar
    v_t := pg_temp.tenta(format($q$SELECT public.assinatura_concluir(%L, 'outro/final.pdf', %L)::text$q$, v_env, repeat('c', 64)));
    PERFORM pg_temp.confere(v_t LIKE '22023:%', '12. caminho final errado: ' || v_t);
    v_r := public.assinatura_concluir(v_env, v_org || '/' || v_env || '/final.pdf', repeat('c', 64));
    PERFORM pg_temp.confere((v_r->>'ja_concluido')::boolean = false, '12. concluído');
    v_r := public.assinatura_concluir(v_env, v_org || '/' || v_env || '/final.pdf', repeat('c', 64));
    PERFORM pg_temp.confere((v_r->>'ja_concluido')::boolean, '12. segunda conclusão é no-op');
    v_t := pg_temp.tenta(format($q$UPDATE public.assinatura_envelopes SET titulo = 'x' WHERE id = %L RETURNING 1$q$, v_env));
    PERFORM pg_temp.confere(v_t LIKE '42501:%', '12. envelope concluído não se altera: ' || v_t);

    -- 13. Cadeia íntegra do começo ao fim
    SELECT count(*) INTO v_n FROM (
        SELECT e.hash_anterior, lag(e.hash) OVER (ORDER BY e.id) AS anterior
          FROM public.assinatura_eventos e WHERE e.envelope_id = v_env) c
     WHERE c.hash_anterior IS DISTINCT FROM c.anterior;
    PERFORM pg_temp.confere(v_n = 0, '13. cada evento aponta o hash do anterior');

    -- 14. Validação pública: sem e-mail, sem IP, CPF mascarado
    v_r := public.assinatura_validar(v_env);
    PERFORM pg_temp.confere(v_r->>'situacao' = 'CONCLUIDO' AND jsonb_array_length(v_r->'signatarios') = 3, '14. validação');
    PERFORM pg_temp.confere(v_r::text NOT LIKE '%example.com%' AND v_r::text NOT LIKE '%10.0.0.1%'
                            AND v_r::text NOT LIKE '%11144477735%' AND v_r::text LIKE '%***.444.777-**%', '14. só o que autentica');
    PERFORM pg_temp.confere((public.assinatura_validar(gen_random_uuid())->>'encontrado')::boolean = false, '14. id inexistente');

    -- 15. Documento com envelope não se exclui
    v_t := pg_temp.tenta(format('DELETE FROM public.commercial_deal_documents WHERE id = %L RETURNING 1', v_doc));
    PERFORM pg_temp.confere(v_t LIKE '42501:%', '15. excluir documento assinado: ' || v_t);

    -- 16. Nova versão cancela o envelope ativo
    INSERT INTO public.commercial_deal_documents (id, organization_id, deal_id, kind, nome, storage_path)
    VALUES (v_doc2, v_org, v_deal, 'RESERVA', 'Reserva', v_org || '/negociacoes/' || v_deal || '/r.pdf');
    PERFORM public.assinatura_criar(v_env2, 'DEAL_DOC', v_doc2, 'Reserva', v_org || '/' || v_env2 || '/original.pdf',
             repeat('d', 64), 1, jsonb_build_array(jsonb_build_object('canal', 'PORTAL_CLIENTE', 'client_id', v_cli)), v_user);
    INSERT INTO public.commercial_deal_documents (organization_id, deal_id, kind, nome, storage_path)
    VALUES (v_org, v_deal, 'RESERVA', 'Reserva v2', v_org || '/negociacoes/' || v_deal || '/r2.pdf');
    PERFORM pg_temp.confere((SELECT status FROM public.assinatura_envelopes WHERE id = v_env2) = 'CANCELADO', '16. nova versão cancela');
    PERFORM pg_temp.confere((SELECT signature_status FROM public.commercial_deal_documents WHERE id = v_doc2) = 'CANCELLED', '16. projeção CANCELLED');
    PERFORM pg_temp.confere((SELECT v FROM public.commercial_deal_documents WHERE deal_id = v_deal AND kind = 'RESERVA' ORDER BY v DESC LIMIT 1) = 2, '16. versão 2');

    -- 17. Reenviar após cancelar: novo envelope assume a origem; vencido vira EXPIRADO
    v_env2 := gen_random_uuid();
    PERFORM public.assinatura_criar(v_env2, 'DEAL_DOC', v_doc2, 'Reserva', v_org || '/' || v_env2 || '/original.pdf',
             repeat('e', 64), 1, jsonb_build_array(jsonb_build_object('canal', 'PORTAL_CLIENTE', 'client_id', v_cli)), v_user);
    PERFORM pg_temp.confere((SELECT assinatura_envelope_id FROM public.commercial_deal_documents WHERE id = v_doc2) = v_env2
                            AND (SELECT signature_status FROM public.commercial_deal_documents WHERE id = v_doc2) = 'SENT', '17. reenvio assume a origem');
    UPDATE public.assinatura_envelopes SET expira_em = now() - interval '1 minute' WHERE id = v_env2;
    SELECT s.id INTO v_sig_cli FROM public.assinatura_signatarios s WHERE s.envelope_id = v_env2;
    v_r := public.assinatura_registrar_codigo(v_sig_cli, 'PORTAL_CLIENTE', 'tok-teste-cliente', NULL, pg_temp.h('z'), NULL, NULL);
    PERFORM pg_temp.confere((v_r->>'ok')::boolean = false AND v_r->>'erro' LIKE '%venceu%', '17. vencido não recebe código');
    PERFORM pg_temp.confere((SELECT status FROM public.assinatura_envelopes WHERE id = v_env2) = 'EXPIRADO', '17. EXPIRADO persistido');
    PERFORM pg_temp.confere((SELECT signature_status FROM public.commercial_deal_documents WHERE id = v_doc2) = 'EXPIRED', '17. projeção EXPIRED');

    -- 18. Membro pelo PostgREST: lê, mas não forja assinatura nem projeção
    v_t := pg_temp.como(v_user, format('SELECT count(*)::text FROM public.assinatura_envelopes WHERE deal_id = %L', v_deal));
    PERFORM pg_temp.confere(v_t = 'ok:3', '18. membro lê os envelopes da org: ' || v_t);
    v_t := pg_temp.como(v_user, 'SELECT count(*)::text FROM public.assinatura_segredos');
    PERFORM pg_temp.confere(v_t LIKE '42501:%', '18. segredos ilegíveis: ' || v_t);
    v_t := pg_temp.como(v_user, format($q$UPDATE public.assinatura_signatarios SET status = 'ASSINADO' WHERE envelope_id = %L RETURNING 1$q$, v_env2));
    PERFORM pg_temp.confere(v_t LIKE '42501:%', '18. membro não assina por fora: ' || v_t);
    v_t := pg_temp.como(v_user, format($q$UPDATE public.commercial_deal_documents SET signature_status = 'SIGNED' WHERE id = %L RETURNING 1$q$, v_doc2));
    PERFORM pg_temp.confere(v_t LIKE '42501:%', '18. membro não forja a projeção: ' || v_t);
    v_t := pg_temp.como(v_user, format($q$UPDATE public.commercial_deal_documents SET nome = 'Novo nome' WHERE id = %L RETURNING 1$q$, v_doc2));
    PERFORM pg_temp.confere(v_t = 'ok:1', '18. membro renomeia: ' || v_t);
    v_t := pg_temp.como(v_user, format($q$SELECT public.assinatura_ver(%L, 'MEMBRO', NULL, %L, NULL, NULL)::text$q$, v_sig_mem, v_user));
    PERFORM pg_temp.confere(v_t LIKE '42501:%', '18. RPC interna fechada para authenticated: ' || v_t);

    RAISE NOTICE 'ok';
END $$;

SELECT 'TUDO OK' AS resultado;
ROLLBACK;
