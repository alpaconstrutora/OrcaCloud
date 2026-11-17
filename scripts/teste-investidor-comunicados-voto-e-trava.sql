-- Prova da migration aplicar_20271117970000_investidor_comunicados_voto_e_trava.sql
--
--   npx supabase db query --linked -f scripts/teste-investidor-comunicados-voto-e-trava.sql
--
-- Tudo roda num DO que termina em RAISE: NADA fica gravado. O resultado sai na mensagem do erro,
-- uma linha por caso, "ok" ou "FALHOU". Usa o 1º link ativo do portal do investidor (lê o token
-- só aqui dentro, não imprime).
DO $prova$
DECLARE
    v_tok   public.investor_portal_tokens;
    v_uid   uuid;
    v_vot   uuid;
    v_avi   uuid;
    v_livre uuid;
    v_r     jsonb;
    v_n     integer;
    v_hint  text;
    v_det   text;
    v_out   text := '';
    v_depth text;
BEGIN
    -- 0. Mecânica da exceção da cascata: gatilho no filho, disparado pelo FK, roda com depth 2.
    CREATE TEMP TABLE _pai (id int PRIMARY KEY) ON COMMIT DROP;
    CREATE TEMP TABLE _filho (id int, pai int REFERENCES _pai(id) ON DELETE CASCADE) ON COMMIT DROP;
    CREATE TEMP TABLE _log (d int) ON COMMIT DROP;
    CREATE FUNCTION pg_temp._registra() RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN INSERT INTO _log VALUES (pg_trigger_depth()); RETURN OLD; END $f$;
    CREATE TRIGGER _t BEFORE DELETE ON _filho FOR EACH ROW EXECUTE FUNCTION pg_temp._registra();
    INSERT INTO _pai VALUES (1), (2);
    INSERT INTO _filho VALUES (1, 1), (2, 2);
    DELETE FROM _filho WHERE id = 1;     -- direto
    DELETE FROM _pai WHERE id = 2;       -- cascata
    SELECT string_agg(d::text, ',' ORDER BY d) INTO v_depth FROM _log;
    v_out := v_out || format(E'\n00 depth direto,cascata = %s → %s', v_depth,
        CASE WHEN v_depth = '1,2' THEN 'ok' ELSE 'FALHOU' END);

    SELECT * INTO v_tok FROM public.investor_portal_tokens
    WHERE is_active AND expires_at > now() ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'sem link ativo para a prova'; END IF;

    -- 1. Votação em RASCUNHO não recebe resposta.
    INSERT INTO public.investor_announcements (organization_id, title, body, type, requires_acknowledgment, published_at)
    VALUES (v_tok.org_id, 'PROVA votação', 'texto', 'votacao', TRUE, NULL) RETURNING id INTO v_vot;
    v_r := public.fn_investor_portal_acknowledge(v_tok.token, v_vot, 'sim');
    v_out := v_out || format(E'\n01 rascunho → %s → %s', v_r, CASE WHEN v_r->>'error' = 'not_found' THEN 'ok' ELSE 'FALHOU' END);

    -- 2. Publicar sem resposta: a trava deixa.
    UPDATE public.investor_announcements SET published_at = now() WHERE id = v_vot;
    v_out := v_out || E'\n02 publicar sem resposta → ok';

    -- 3. Votação sem voto / voto inválido.
    v_r := public.fn_investor_portal_acknowledge(v_tok.token, v_vot, NULL);
    v_out := v_out || format(E'\n03 votação sem voto → %s → %s', v_r, CASE WHEN v_r->>'error' = 'vote_required' THEN 'ok' ELSE 'FALHOU' END);
    v_r := public.fn_investor_portal_acknowledge(v_tok.token, v_vot, 'talvez');
    v_out := v_out || format(E'\n04 voto "talvez" → %s → %s', v_r, CASE WHEN v_r->>'error' = 'vote_required' THEN 'ok' ELSE 'FALHOU' END);

    -- 4. Voto válido (com espaço e maiúscula) grava; 2º voto não troca.
    v_r := public.fn_investor_portal_acknowledge(v_tok.token, v_vot, ' Sim ');
    v_out := v_out || format(E'\n05 voto " Sim " → %s → %s', v_r->>'vote_option',
        CASE WHEN (v_r->>'valid')::boolean AND v_r->>'vote_option' = 'sim' AND v_r ? 'acknowledged_at' THEN 'ok' ELSE 'FALHOU' END);
    v_r := public.fn_investor_portal_acknowledge(v_tok.token, v_vot, 'nao');
    SELECT count(*) INTO v_n FROM public.investor_acknowledgments WHERE announcement_id = v_vot;
    v_out := v_out || format(E'\n06 2º voto "nao" → devolve %s, linhas %s → %s', v_r->>'vote_option', v_n,
        CASE WHEN v_r->>'vote_option' = 'sim' AND v_n = 1 THEN 'ok' ELSE 'FALHOU' END);

    -- 5. Leitura pelo link traz o voto e a data.
    SELECT a INTO v_r FROM jsonb_array_elements(public.fn_investor_portal_get_announcements(v_tok.token)->'announcements') a
    WHERE a->>'id' = v_vot::text;
    v_out := v_out || format(E'\n07 leitura → acknowledged=%s voto=%s data=%s → %s', v_r->>'acknowledged', v_r->>'vote_option',
        (v_r->>'acknowledged_at') IS NOT NULL,
        CASE WHEN (v_r->>'acknowledged')::boolean AND v_r->>'vote_option' = 'sim' AND (v_r->>'acknowledged_at') IS NOT NULL THEN 'ok' ELSE 'FALHOU' END);

    -- 6. Com resposta: editar o texto, despublicar e excluir são recusados (como postgres).
    BEGIN
        UPDATE public.investor_announcements SET title = 'outro' WHERE id = v_vot;
        v_out := v_out || E'\n08 editar respondido → FALHOU (passou)';
    EXCEPTION WHEN check_violation THEN
        GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT, v_det = PG_EXCEPTION_DETAIL;
        v_out := v_out || format(E'\n08 editar respondido → recusado hint=%s detail=%s → %s', v_hint, v_det,
            CASE WHEN v_hint = 'comunicado_com_respostas' AND v_det = '1' THEN 'ok' ELSE 'FALHOU' END);
    END;
    BEGIN
        UPDATE public.investor_announcements SET published_at = NULL WHERE id = v_vot;
        v_out := v_out || E'\n09 despublicar respondido → FALHOU (passou)';
    EXCEPTION WHEN check_violation THEN
        v_out := v_out || E'\n09 despublicar respondido → recusado → ok';
    END;
    BEGIN
        DELETE FROM public.investor_announcements WHERE id = v_vot;
        v_out := v_out || E'\n10 excluir respondido → FALHOU (passou)';
    EXCEPTION WHEN check_violation THEN
        v_out := v_out || format(E'\n10 excluir respondido → recusado (%s) → ok', SQLERRM);
    END;
    UPDATE public.investor_announcements SET created_at = created_at WHERE id = v_vot;
    v_out := v_out || E'\n11 UPDATE sem mudar conteúdo, respondido → passou → ok';

    -- 7. Aviso: o voto é ignorado.
    INSERT INTO public.investor_announcements (organization_id, title, body, type, requires_acknowledgment, published_at)
    VALUES (v_tok.org_id, 'PROVA aviso', 'texto', 'aviso', TRUE, now()) RETURNING id INTO v_avi;
    v_r := public.fn_investor_portal_acknowledge(v_tok.token, v_avi, 'sim');
    v_out := v_out || format(E'\n12 aviso com voto → %s → %s', v_r,
        CASE WHEN (v_r->>'valid')::boolean AND v_r->'vote_option' = 'null'::jsonb THEN 'ok' ELSE 'FALHOU' END);

    -- 8. Como USUÁRIO da API (authenticated, dono da org): a trava dispara mesmo sem EXECUTE na
    --    função do gatilho, e o comunicado sem resposta continua editável.
    INSERT INTO public.investor_announcements (organization_id, title, body, type, requires_acknowledgment, published_at)
    VALUES (v_tok.org_id, 'PROVA livre', 'texto', 'aviso', FALSE, now()) RETURNING id INTO v_livre;
    -- A policy de escrita identifica pelo E-MAIL do JWT (não pelo sub) — os dois vão no claims.
    SELECT om.user_id, om.email INTO v_uid, v_det FROM public.organization_members om
    WHERE om.organization_id = v_tok.org_id AND om.role IN ('owner', 'admin') AND om.user_id IS NOT NULL LIMIT 1;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'email', v_det, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.investor_announcements SET title = 'PROVA livre 2' WHERE id = v_livre;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_out := v_out || format(E'\n13 authenticated edita sem resposta → %s linha → %s', v_n, CASE WHEN v_n = 1 THEN 'ok' ELSE 'FALHOU' END);
    BEGIN
        UPDATE public.investor_announcements SET body = 'mudou' WHERE id = v_avi;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_out := v_out || format(E'\n14 authenticated edita respondido → FALHOU (passou, %s linha)', v_n);
    EXCEPTION WHEN check_violation THEN
        v_out := v_out || E'\n14 authenticated edita respondido → recusado → ok';
    END;
    BEGIN
        DELETE FROM public.investor_announcements WHERE id = v_avi;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_out := v_out || format(E'\n15 authenticated exclui respondido → FALHOU (passou, %s linha)', v_n);
    EXCEPTION WHEN check_violation THEN
        v_out := v_out || E'\n15 authenticated exclui respondido → recusado → ok';
    END;
    DELETE FROM public.investor_announcements WHERE id = v_livre;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_out := v_out || format(E'\n16 authenticated exclui sem resposta → %s linha → %s', v_n, CASE WHEN v_n = 1 THEN 'ok' ELSE 'FALHOU' END);

    RAISE EXCEPTION 'RESULTADO (desfeito):%', v_out;
END
$prova$;
