-- scripts/teste-obra-parcelas-atomico.sql
-- Prova de fn_obra_trocar_parcelas_do_pedido
-- (supabase/migrations/aplicar_20271127300000_obra_parcelas_do_pedido_atomico.sql;
--  docs/planos/2026-11-27-recebimento-mobile.md, Fase 1).
--
--   1. troca SÓ as parcelas do pedido: as novas no começo, as de outros pedidos e
--      os lançamentos sem pedido ficam, na ordem; nenhuma outra chave de settings muda;
--   2. obra sem financialInfo nasce com o mesmo padrão do addTransaction;
--   3. membro da org da obra troca (authenticated, sob RLS); quem não é membro → 42501;
--   4. entrada inválida → 22023 (não-lista; parcela de outro pedido);
--   5. ACL: anon não executa; PUBLIC sem EXECUTE.
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …';
-- sucesso = a linha final 'TUDO OK'.
--
--   npx supabase db query --linked -f scripts/teste-obra-parcelas-atomico.sql
--
-- Para ensaiar a migration ANTES de aplicá-la, ponha o conteúdo dela no lugar
-- da linha MIGRATION abaixo.

BEGIN;
-- MIGRATION

CREATE FUNCTION pg_temp.confere(p_ok BOOLEAN, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
END $$;

CREATE FUNCTION pg_temp.como(p_user UUID, p_papel TEXT, p_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
    PERFORM set_config('request.jwt.claims',
        CASE WHEN p_user IS NULL THEN json_build_object('role', p_papel)::text
             ELSE json_build_object('sub', p_user, 'email', (SELECT u.email FROM auth.users u WHERE u.id = p_user), 'role', p_papel)::text END,
        true);
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

DO $$
DECLARE
    org UUID; m UUID; x UUID; obra UUID; obra2 UUID;
    pedido CONSTANT UUID := gen_random_uuid();
    outro  CONSTANT UUID := gen_random_uuid();
    antes JSONB; depois JSONB; v TEXT;
    trocar CONSTANT TEXT := 'SELECT public.fn_obra_trocar_parcelas_do_pedido(%L::uuid, %L::uuid, %L::jsonb)::text';
    novas JSONB;
BEGIN
    -- Membro (com login) de uma org; uma conta que NÃO é membro dela.
    SELECT om.organization_id, om.user_id INTO org, m
      FROM public.organization_members om
     WHERE om.user_id IS NOT NULL AND om.organization_id IS NOT NULL
     ORDER BY om.organization_id, om.user_id LIMIT 1;
    PERFORM pg_temp.confere(m IS NOT NULL, 'massa: membro com login');
    SELECT au.id INTO x FROM auth.users au
     WHERE NOT public.is_org_member_de(au.id, org)
       AND NOT EXISTS (SELECT 1 FROM public.superadmins sa WHERE sa.email = lower(au.email))
     ORDER BY au.id LIMIT 1;
    PERFORM pg_temp.confere(x IS NOT NULL, 'massa: conta fora da org');

    novas := jsonb_build_array(
        jsonb_build_object('id', 'n2', 'orderId', pedido, 'value', 50, 'status', 'PENDING'),
        jsonb_build_object('id', 'n1', 'orderId', pedido, 'value', 50, 'status', 'PENDING'));

    -- Obra com cronograma, diário e financeiro (parcelas do pedido, de outro pedido e avulsas).
    INSERT INTO public.projects (name, user_id, organization_id, settings)
    VALUES ('TOP obra', m, org, jsonb_build_object(
        'classification', 'OBRA', 'organizationId', org,
        'schedule', jsonb_build_object('startDate', '2026-11-01', 'itemSchedules', '[{"id": "i1", "duration": 5}]'::jsonb),
        'diaryEntries', '[{"id": "d1", "date": "2026-11-02"}]'::jsonb,
        'financialInfo', jsonb_build_object(
            'totalValue', 1000, 'paymentMethod', 'Boleto', 'installments', '[{"n": 1}]'::jsonb,
            'transactions', jsonb_build_array(
                jsonb_build_object('id', 'a', 'value', 1),
                jsonb_build_object('id', 'velha1', 'orderId', pedido, 'value', 9, 'status', 'PENDING'),
                jsonb_build_object('id', 'b', 'orderId', outro, 'value', 2),
                jsonb_build_object('id', 'velha2', 'orderId', pedido, 'value', 9, 'status', 'PENDING'),
                jsonb_build_object('id', 'c', 'value', 3)))))
    RETURNING id INTO obra;
    antes := (SELECT settings FROM public.projects WHERE id = obra);

    -- 3. Membro troca, sob RLS.
    v := pg_temp.como(m, 'authenticated', format(trocar, obra, pedido, novas));
    PERFORM pg_temp.confere(v = 'ok:2', 'membro troca as parcelas (veio ' || v || ')');
    depois := (SELECT settings FROM public.projects WHERE id = obra);

    -- 1. Só as parcelas do pedido mudaram.
    PERFORM pg_temp.confere(
        (SELECT jsonb_agg(e ->> 'id' ORDER BY o) FROM jsonb_array_elements(depois -> 'financialInfo' -> 'transactions') WITH ORDINALITY t(e, o))
          = '["n2", "n1", "a", "b", "c"]'::jsonb,
        'novas no começo; outros pedidos e avulsos ficam, na ordem (veio '
        || (SELECT jsonb_agg(e ->> 'id' ORDER BY o) FROM jsonb_array_elements(depois -> 'financialInfo' -> 'transactions') WITH ORDINALITY t(e, o))::text || ')');
    PERFORM pg_temp.confere((depois - 'financialInfo') = (antes - 'financialInfo'),
        'nenhuma outra chave de settings mudou (cronograma, diário…)');
    PERFORM pg_temp.confere((depois -> 'financialInfo') - 'transactions' = (antes -> 'financialInfo') - 'transactions',
        'o resto do financialInfo (total, forma, parcelas do contrato) não mudou');

    -- Lista vazia = só tira as do pedido.
    v := pg_temp.como(m, 'authenticated', format(trocar, obra, pedido, '[]'));
    PERFORM pg_temp.confere(v = 'ok:0'
        AND (SELECT jsonb_agg(e ->> 'id' ORDER BY o) FROM public.projects p,
                    jsonb_array_elements(p.settings -> 'financialInfo' -> 'transactions') WITH ORDINALITY t(e, o) WHERE p.id = obra)
            = '["a", "b", "c"]'::jsonb,
        'lista vazia tira as parcelas do pedido (veio ' || v || ')');

    -- 3. Quem não é membro não troca, e nada muda.
    depois := (SELECT settings FROM public.projects WHERE id = obra);
    v := pg_temp.como(x, 'authenticated', format(trocar, obra, pedido, novas));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'não membro → 42501 (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT settings FROM public.projects WHERE id = obra) = depois, 'a recusa não mexeu na obra');

    -- 2. Obra sem financialInfo.
    INSERT INTO public.projects (name, user_id, organization_id, settings)
    VALUES ('TOP obra sem financeiro', m, org, jsonb_build_object('classification', 'OBRA', 'organizationId', org))
    RETURNING id INTO obra2;
    v := pg_temp.como(m, 'authenticated', format(trocar, obra2, pedido, novas));
    PERFORM pg_temp.confere(v = 'ok:2'
        AND (SELECT settings -> 'financialInfo' FROM public.projects WHERE id = obra2)
            = jsonb_build_object('totalValue', 0, 'paymentMethod', 'Parcelamento Próprio', 'installments', '[]'::jsonb, 'transactions', novas),
        'obra sem financeiro nasce com o padrão do addTransaction (veio ' || v || ')');

    -- 4. Entrada inválida.
    v := pg_temp.como(m, 'authenticated', format(trocar, obra, pedido, '{"id": "n"}'));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'não-lista → 22023 (veio ' || v || ')');
    v := pg_temp.como(m, 'authenticated', format(trocar, obra, pedido, jsonb_build_array(jsonb_build_object('id', 'z', 'orderId', outro))));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'parcela de outro pedido → 22023 (veio ' || v || ')');

    -- 5. ACL.
    v := pg_temp.como(NULL, 'anon', format(trocar, obra, pedido, novas));
    PERFORM pg_temp.confere(v LIKE '42501:permission denied for function%', 'anon não executa (veio ' || v || ')');
    PERFORM pg_temp.confere(NOT EXISTS (
        SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
         WHERE p.oid = 'public.fn_obra_trocar_parcelas_do_pedido(uuid, uuid, jsonb)'::regprocedure AND a.grantee = 0)
        AND (SELECT NOT p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig) FROM pg_proc p
              WHERE p.oid = 'public.fn_obra_trocar_parcelas_do_pedido(uuid, uuid, jsonb)'::regprocedure),
        'INVOKER, search_path fixo, sem EXECUTE para PUBLIC');
END $$;

ROLLBACK;
SELECT 'TUDO OK' AS resultado;
