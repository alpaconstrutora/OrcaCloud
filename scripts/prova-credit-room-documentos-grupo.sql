-- scripts/prova-credit-room-documentos-grupo.sql
-- Prova da migration aplicar_20271122300000_credit_room_documentos_grupo.sql
-- (Data Room com documentos das empresas do grupo + trava na gravação).
--
-- BEGIN … ROLLBACK: não grava nada. Roda como postgres; os passos do usuário
-- rodam como `authenticated` com as claims de um membro real (pg_temp.como).
-- Saída = UMA tabela (teste, ok, detalhe) + a linha 'TUDO' (`db query` só
-- devolve o último resultado). Nenhum RAISE aborta: falha = ok false.
--
--   npx supabase db query --linked -o table -f scripts/prova-credit-room-documentos-grupo.sql
--
-- Rodar DEPOIS de aplicar a migration. Para ensaiar ANTES, gere um arquivo com
-- o corpo da migration SEM as linhas `BEGIN;`/`COMMIT;` no lugar da linha
-- `-- MIGRATION` abaixo (o COMMIT da migration gravaria de verdade).
--
-- O que usa (tudo volta no ROLLBACK):
--   · o Credit Room mais antigo (R) e a org dona dele;
--   · um usuário membro (user_id e e-mail iguais ao do auth — a RLS de
--     opura_documents compara e-mail) da org dona e de mais 2 orgs (O2, O3);
--   · 3 documentos criados aqui: D2 em O2, D3 e D3b em O3;
--   · R vira GRUPO e volta a EMPRESA dentro da transação (trava a linha de R
--     por alguns segundos).

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- MIGRATION

CREATE TEMP TABLE _prova (ordem int, teste text, ok boolean, detalhe text) ON COMMIT DROP;

-- Roda p_sql como `authenticated` com sub/e-mail dados; devolve 'ok:<resultado>'
-- ou '<SQLSTATE>:<mensagem>' (molde de scripts/teste-assinatura-interna.sql).
CREATE FUNCTION pg_temp.como(p_user uuid, p_email text, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', p_user, 'email', p_email, 'role', 'authenticated')::text, true);
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

-- Mesma coisa como `anon` (sonda da REGRA #7).
CREATE FUNCTION pg_temp.como_anon(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    BEGIN
        SET LOCAL ROLE anon;
        EXECUTE p_sql INTO v;
        v := 'ok:' || coalesce(v, '<null>');
    EXCEPTION WHEN OTHERS THEN
        v := SQLSTATE || ':' || SQLERRM;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN v;
END $$;

CREATE FUNCTION pg_temp.reg(p_ordem int, p_teste text, p_ok boolean, p_detalhe text) RETURNS void LANGUAGE sql AS $$
    INSERT INTO _prova VALUES (p_ordem, p_teste, coalesce(p_ok, false), p_detalhe);
$$;

DO $$
DECLARE
    v_room   uuid;
    v_org    uuid;
    v_uid    uuid;
    v_email  text;
    v_o2     uuid;
    v_o3     uuid;
    v_d2     uuid := gen_random_uuid();
    v_d3     uuid := gen_random_uuid();
    v_d3b    uuid := gen_random_uuid();
    v_base   int;
    v_t      text;
    v_t8     text;
    v_t9     text;
    v_ins    text := $q$INSERT INTO public.opura_document_portal_shares (document_id, audience, credit_room_id, shared_by)
                         VALUES (%L, 'credor', %L, 'prova-f3') RETURNING id::text$q$;
    v_conta  text := $q$SELECT count(*)::text FROM public.fn_credit_room_documents(%L) WHERE %s$q$;
BEGIN
  BEGIN
    -- ── 0. Sujeitos ────────────────────────────────────────────────────────
    SELECT r.id, r.organization_id INTO v_room, v_org
      FROM public.credit_rooms r ORDER BY r.created_at LIMIT 1;

    SELECT au.id, au.email INTO v_uid, v_email
      FROM public.organization_members m
      JOIN auth.users au ON au.id = m.user_id
     WHERE m.organization_id = v_org AND m.email = au.email
       AND (SELECT count(DISTINCT m2.organization_id) FROM public.organization_members m2
             WHERE m2.user_id = au.id AND m2.email = au.email AND m2.organization_id <> v_org) >= 2
     ORDER BY au.id LIMIT 1;

    SELECT m2.organization_id INTO v_o2 FROM public.organization_members m2
     WHERE m2.user_id = v_uid AND m2.email = v_email AND m2.organization_id <> v_org
     ORDER BY m2.organization_id LIMIT 1;
    SELECT m2.organization_id INTO v_o3 FROM public.organization_members m2
     WHERE m2.user_id = v_uid AND m2.email = v_email AND m2.organization_id NOT IN (v_org, v_o2)
     ORDER BY m2.organization_id LIMIT 1;

    PERFORM pg_temp.reg(0, '0. sujeitos (room, usuário, 2 orgs do grupo)',
        v_room IS NOT NULL AND v_uid IS NOT NULL AND v_o2 IS NOT NULL AND v_o3 IS NOT NULL,
        format('room=%s org=%s user=%s o2=%s o3=%s', v_room, v_org, left(v_uid::text, 8), v_o2, v_o3));
    IF v_room IS NULL OR v_uid IS NULL OR v_o2 IS NULL OR v_o3 IS NULL THEN
        RETURN;
    END IF;

    -- Linha de base: o que o Data Room devolve hoje (só documentos da org dona).
    SELECT count(*) INTO v_base
      FROM public.opura_document_portal_shares sh
      JOIN public.opura_documents d ON d.id = sh.document_id
     WHERE sh.audience = 'credor' AND sh.credit_room_id = v_room AND d.organization_id = v_org;

    INSERT INTO public.opura_documents (id, organization_id, nome, categoria, criado_por) VALUES
        (v_d2,  v_o2, 'PROVA F3 · documento do grupo (O2)',   'financeiro', 'prova-f3'),
        (v_d3,  v_o3, 'PROVA F3 · documento de O3',            'financeiro', 'prova-f3'),
        (v_d3b, v_o3, 'PROVA F3 · documento de O3 (segundo)',  'financeiro', 'prova-f3');

    -- ── 1. Room vira GRUPO com O2 e O3 (pelo usuário, com RLS) ─────────────
    v_t := pg_temp.como(v_uid, v_email, format(
        $q$UPDATE public.credit_rooms SET escopo = 'GRUPO', grupo_organization_ids = ARRAY[%L, %L]::uuid[]
            WHERE id = %L RETURNING array_length(grupo_organization_ids, 1)::text$q$, v_o2, v_o3, v_room));
    PERFORM pg_temp.reg(1, '1. room vira GRUPO {dona, O2, O3}', v_t = 'ok:3', v_t);

    -- ── 2/3. Compartilhar documento de org do grupo: aceito ────────────────
    v_t := pg_temp.como(v_uid, v_email, format(v_ins, v_d2, v_room));
    PERFORM pg_temp.reg(2, '2. compartilha doc de O2 (no grupo): aceito', v_t LIKE 'ok:%' AND v_t <> 'ok:<null>', v_t);
    v_t := pg_temp.como(v_uid, v_email, format(v_ins, v_d3, v_room));
    PERFORM pg_temp.reg(3, '3. compartilha doc de O3 (no grupo): aceito', v_t LIKE 'ok:%' AND v_t <> 'ok:<null>', v_t);

    -- ── 4. O3 sai do grupo (o compartilhamento de D3 fica na tabela) ───────
    v_t := pg_temp.como(v_uid, v_email, format(
        $q$UPDATE public.credit_rooms SET grupo_organization_ids = ARRAY[%L]::uuid[]
            WHERE id = %L RETURNING array_length(grupo_organization_ids, 1)::text$q$, v_o2, v_room));
    PERFORM pg_temp.reg(4, '4. O3 sai do grupo {dona, O2}', v_t = 'ok:2', v_t);

    -- ── 5/6. Leitura: doc do grupo aparece (com a org nova na linha); doc de fora não
    v_t := pg_temp.como(v_uid, v_email, format(v_conta, v_room,
        format('document_id = %L AND organization_id = %L', v_d2, v_o2)));
    PERFORM pg_temp.reg(5, '5. GRUPO: doc de O2 aparece (organization_id = O2)', v_t = 'ok:1', v_t);
    v_t := pg_temp.como(v_uid, v_email, format(v_conta, v_room, format('document_id = %L', v_d3)));
    PERFORM pg_temp.reg(6, '6. GRUPO: doc de O3 (fora do grupo) NÃO aparece', v_t = 'ok:0', v_t);
    v_t := pg_temp.como(v_uid, v_email, format(v_conta, v_room, format('organization_id = %L', v_org)));
    PERFORM pg_temp.reg(7, '7. GRUPO: os da org dona continuam', v_t = 'ok:' || v_base, v_t || ' base=' || v_base);

    -- ── 8. Trava: compartilhar doc de org fora do escopo → check_violation ─
    v_t := pg_temp.como(v_uid, v_email, format(v_ins, v_d3b, v_room));
    PERFORM pg_temp.reg(8, '8. INSERT doc de O3 (fora): 23514 do gatilho', v_t LIKE '23514:Credit Room: documento fora do escopo%', v_t);
    -- UPDATE trocando o documento passa pela mesma trava
    v_t := pg_temp.como(v_uid, v_email, format(
        $q$UPDATE public.opura_document_portal_shares SET document_id = %L
            WHERE document_id = %L AND credit_room_id = %L AND audience = 'credor' RETURNING id::text$q$, v_d3b, v_d2, v_room));
    PERFORM pg_temp.reg(9, '9. UPDATE trocando p/ doc de O3: 23514 do gatilho', v_t LIKE '23514:Credit Room: documento fora do escopo%', v_t);

    -- ── 10/11. Quem não é interno não grava; room inexistente = MESMA recusa
    v_t8 := pg_temp.como(gen_random_uuid(), 'prova-f3-externo@example.invalid', format(v_ins, v_d3b, v_room));
    PERFORM pg_temp.reg(10, '10. usuário de fora do room: 42501 do gatilho', v_t8 LIKE '42501:Credit Room: sem permissão%', v_t8);
    v_t9 := pg_temp.como(v_uid, v_email, format(v_ins, v_d2, gen_random_uuid()));
    PERFORM pg_temp.reg(11, '11. room inexistente: mesma recusa (não revela existência)', v_t9 = v_t8, v_t9);

    -- ── 12/13. Room volta a EMPRESA: o doc do grupo some ───────────────────
    v_t := pg_temp.como(v_uid, v_email, format(
        $q$UPDATE public.credit_rooms SET escopo = 'EMPRESA' WHERE id = %L
            RETURNING coalesce(array_length(grupo_organization_ids, 1), 0)::text$q$, v_room));
    PERFORM pg_temp.reg(12, '12. room volta a EMPRESA', v_t = 'ok:0', v_t);
    v_t := pg_temp.como(v_uid, v_email, format(v_conta, v_room, format('organization_id <> %L', v_org)));
    PERFORM pg_temp.reg(13, '13. EMPRESA: nenhum doc de outra org (O2 sumiu)', v_t = 'ok:0', v_t);
    v_t := pg_temp.como(v_uid, v_email, format(v_conta, v_room, 'true'));
    PERFORM pg_temp.reg(14, '14. EMPRESA: só os da org dona (= base)', v_t = 'ok:' || v_base, v_t || ' base=' || v_base);
    -- EMPRESA: compartilhar doc de outra org agora é recusado
    v_t := pg_temp.como(v_uid, v_email, format(v_ins, v_d3b, v_room));
    PERFORM pg_temp.reg(15, '15. EMPRESA: INSERT doc de O3 recusado (23514)', v_t LIKE '23514:%', v_t);

    -- ── 16–21. REGRA #7: sonda anon e ACLs ─────────────────────────────────
    v_t := pg_temp.como_anon(format('SELECT count(*)::text FROM public.fn_credit_room_documents(%L)', v_room));
    PERFORM pg_temp.reg(16, '16. anon chama fn_credit_room_documents: 42501', v_t LIKE '42501:%', v_t);
    PERFORM pg_temp.reg(17, '17. anon sem EXECUTE nas 2 funções',
        NOT has_function_privilege('anon', 'public.fn_credit_room_documents(uuid)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.fn_portal_share_credor_escopo()', 'EXECUTE'),
        'anon');
    PERFORM pg_temp.reg(18, '18. PUBLIC sem EXECUTE nas 2 funções',
        NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                     WHERE p.oid IN ('public.fn_credit_room_documents(uuid)'::regprocedure,
                                     'public.fn_portal_share_credor_escopo()'::regprocedure)
                       AND a.grantee = 0),
        (SELECT string_agg(p.proname || '=' || coalesce(p.proacl::text, '<null>'), ' | ') FROM pg_proc p
          WHERE p.oid IN ('public.fn_credit_room_documents(uuid)'::regprocedure,
                          'public.fn_portal_share_credor_escopo()'::regprocedure)));
    PERFORM pg_temp.reg(19, '19. authenticated EXECUTE em fn_credit_room_documents',
        has_function_privilege('authenticated', 'public.fn_credit_room_documents(uuid)', 'EXECUTE'), 'authenticated');
    PERFORM pg_temp.reg(20, '20. assinatura: 3 colunas novas no fim; DEFINER; gatilho INVOKER',
        pg_get_function_result('public.fn_credit_room_documents(uuid)'::regprocedure)
            LIKE '%shared_at timestamp with time zone, organization_id uuid, contract_id uuid, empreendimento_id uuid)'
        AND (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_credit_room_documents(uuid)'::regprocedure)
        AND NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_portal_share_credor_escopo()'::regprocedure),
        pg_get_function_result('public.fn_credit_room_documents(uuid)'::regprocedure));
    PERFORM pg_temp.reg(21, '21. gatilho ligado em opura_document_portal_shares',
        EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_portal_share_credor_escopo'
                   AND tgrelid = 'public.opura_document_portal_shares'::regclass AND tgenabled = 'O'),
        'trg_portal_share_credor_escopo');
  EXCEPTION WHEN OTHERS THEN
    -- Erro inesperado: o subbloco desfaz os registros acima; fica só este.
    PERFORM pg_temp.reg(99, '99. ERRO INESPERADO', false, SQLSTATE || ':' || SQLERRM);
  END;
END $$;

SELECT ordem, teste, ok, detalhe FROM _prova
UNION ALL
SELECT 1000, 'TUDO', coalesce(bool_and(ok), false) AND count(*) >= 22, count(*) || ' testes' FROM _prova
ORDER BY 1;

ROLLBACK;
