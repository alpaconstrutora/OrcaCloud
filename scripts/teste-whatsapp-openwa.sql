-- scripts/teste-whatsapp-openwa.sql
-- Prova do banco do WhatsApp pelo OpenWA (fila, conexão, uso por organização, campainha).
-- Migration: supabase/migrations/aplicar_20271123100000_whatsapp_openwa.sql
-- Plano: docs/planos/2026-11-23-whatsapp-openwa-piloto-pedido.md (Design §2; Task 2).
--
-- O que prova:
--   • membro da org A vê as wa_mensagens da A e não as da B; entrada sem organização
--     é invisível para membro comum;
--   • authenticated não grava (INSERT/UPDATE/DELETE) em nenhuma das 4 tabelas e não lê
--     wa_conexoes direto (só pela wa_situacao);
--   • wa_pode_usar: sem a flag → false; com a flag → true; outra org → false;
--     superadmin → true; EXECUTE negado a authenticated;
--   • wa_pegar_pendentes: marca enviando + trava + tentativas+1; a 2ª chamada não devolve as
--     travadas; retoma presa em enviando com trava vencida (< 23 h) e marca incerta a mais velha;
--     pendente que JÁ foi tentada (tentativas > 0) e tem mais de 23 h vira incerta e não volta
--     (a chave do OpenWA já expirou); pendente nunca tentada com mais de 23 h continua saindo;
--     respeita proxima_tentativa_em e trava_ate; negado a authenticated;
--   • (organization_id, comando_id) único; saída sem organização recusada;
--   • saída pendente toca a campainha (1 linha em realtime.messages, tópico wa-campainha,
--     payload sem telefone/texto); entrada não toca;
--   • wa_definir_uso: membro comum → erro; owner → grava; desligar apaga e cancela as saídas
--     pendentes daquela org (não mexe em outra org nem no que já está enviando);
--   • order_chats.canal nasce 'app' e só aceita app|whatsapp; job wa-limpar-eventos.
--     Só service_role grava canal whatsapp (INSERT de authenticated sai app; UPDATE mantém).
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …';
-- sucesso = a linha final 'TUDO OK'. Sem a migration (linha MIGRATION vazia), falha em
-- "tabela wa_mensagens existe" (é o RED).
--
--   bash scripts/montar-ensaio.sh -o "$TEMP/ensaio-wa.sql" scripts/teste-whatsapp-openwa.sql \
--        supabase/migrations/aplicar_20271123100000_whatsapp_openwa.sql
--   npx supabase db query --linked -f "$TEMP/ensaio-wa.sql"          # última linha: TUDO OK
-- Depois de aplicada a migration, a prova roda como está:
--   npx supabase db query --linked -f scripts/teste-whatsapp-openwa.sql

BEGIN;
-- MIGRATION

CREATE FUNCTION pg_temp.confere(p_ok BOOLEAN, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
END $$;

-- Roda p_sql como authenticated com as claims de p_user (sub + e-mail + role).
CREATE FUNCTION pg_temp.como(p_user UUID, p_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object(
        'sub', p_user, 'role', 'authenticated',
        'email', (SELECT u.email FROM auth.users u WHERE u.id = p_user))::text, true);
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

DO $$
DECLARE
    org_a UUID; org_b UUID; m UUID; dono UUID; sa UUID;
    s_a UUID; s_b UUID; e_null UUID;
    p1 UUID; p2 UUID; p3 UUID; p4 UUID; p5 UUID; e1 UUID; e2 UUID; e3 UUID;
    pv0 UUID; pv1 UUID; b_pend UUID;
    ped UUID; comprador UUID; oc UUID;
    pegou1 UUID[]; pegou2 UUID[];
    n_antes BIGINT; n_depois BIGINT;
    v TEXT; t TEXT;
    ins TEXT;
BEGIN
    PERFORM pg_temp.confere(to_regclass('public.wa_mensagens') IS NOT NULL, 'tabela wa_mensagens existe');

    -- ── fixtures ────────────────────────────────────────────────────────────
    -- m: membro comum (role member, não superadmin) da org A; org B: uma org de que m
    -- não é membro; dono: owner/admin da A que não é superadmin; sa: um superadmin com conta.
    SELECT om.organization_id, om.user_id INTO org_a, m
      FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
     WHERE om.role = 'member'
       AND NOT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.email = lower(au.email))
       AND EXISTS (SELECT 1 FROM public.organization_members o2 JOIN auth.users u2 ON u2.id = o2.user_id
                    WHERE o2.organization_id = om.organization_id AND o2.role IN ('owner', 'admin')
                      AND NOT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.email = lower(u2.email)))
     ORDER BY om.organization_id, om.user_id LIMIT 1;
    PERFORM pg_temp.confere(m IS NOT NULL, 'fixture: membro comum numa org com owner/admin não superadmin');
    SELECT o2.user_id INTO dono
      FROM public.organization_members o2 JOIN auth.users u2 ON u2.id = o2.user_id
     WHERE o2.organization_id = org_a AND o2.role IN ('owner', 'admin')
       AND NOT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.email = lower(u2.email))
     ORDER BY o2.role DESC, o2.user_id LIMIT 1;
    SELECT o.id INTO org_b FROM public.organizations o
     WHERE o.id <> org_a
       AND o.id NOT IN (SELECT om.organization_id FROM public.organization_members om JOIN auth.users au ON au.id = m
                         WHERE om.organization_id IS NOT NULL
                           AND (om.user_id = m OR (om.user_id IS NULL AND lower(om.email) = lower(au.email))))
     ORDER BY o.id LIMIT 1;
    PERFORM pg_temp.confere(dono IS NOT NULL AND org_b IS NOT NULL, 'fixture: dono da A e uma org B sem o membro');
    SELECT u.id INTO sa FROM public.superadmins s JOIN auth.users u ON lower(u.email) = s.email ORDER BY u.email LIMIT 1;
    PERFORM pg_temp.confere(sa IS NOT NULL, 'fixture: um superadmin com conta');

    -- ── linha inicial da conexão ───────────────────────────────────────────
    PERFORM pg_temp.confere((SELECT count(*) FROM public.wa_conexoes
                              WHERE nome = 'ÒPURA' AND sessao_remota = 'opura') = 1,
        'wa_conexoes tem a linha inicial ÒPURA/opura');

    -- ── RLS de leitura de wa_mensagens ──────────────────────────────────────
    ins := 'INSERT INTO public.wa_mensagens (organization_id, direcao, telefone, chat_id_remoto, texto, status, comando_id, proxima_tentativa_em) '
        || 'VALUES (%L, ''saida'', ''5565999990000'', ''5565999990000@c.us'', ''TS texto'', %L, %L, %L) RETURNING id';
    EXECUTE format(ins, org_a, 'aceita', 'ts-a-1', now()) INTO s_a;
    EXECUTE format(ins, org_b, 'aceita', 'ts-b-1', now()) INTO s_b;
    INSERT INTO public.wa_mensagens (organization_id, direcao, telefone, chat_id_remoto, texto, status, provider_message_id)
    VALUES (NULL, 'entrada', '5565999990000', '5565999990000@c.us', 'TS resposta', 'recebida', 'ts-prov-1')
    RETURNING id INTO e_null;

    v := pg_temp.como(m, format('SELECT count(*)::text FROM public.wa_mensagens WHERE id = %L', s_a));
    PERFORM pg_temp.confere(v = 'ok:1', 'membro da A vê a mensagem da A (veio ' || v || ')');
    v := pg_temp.como(m, format('SELECT count(*)::text FROM public.wa_mensagens WHERE id = %L', s_b));
    PERFORM pg_temp.confere(v = 'ok:0', 'membro da A NÃO vê a mensagem da B (veio ' || v || ')');
    v := pg_temp.como(m, format('SELECT count(*)::text FROM public.wa_mensagens WHERE id = %L', e_null));
    PERFORM pg_temp.confere(v = 'ok:0', 'entrada sem organização invisível para membro comum (veio ' || v || ')');

    -- ── authenticated não grava em nenhuma das 4 tabelas ────────────────────
    v := pg_temp.como(m, format('INSERT INTO public.wa_mensagens (organization_id, direcao, chat_id_remoto, status, comando_id) VALUES (%L, ''saida'', ''x@c.us'', ''pendente'', ''ts-hack'') RETURNING 1::text', org_a));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'authenticated não insere em wa_mensagens (veio ' || v || ')');
    v := pg_temp.como(m, format('WITH u AS (UPDATE public.wa_mensagens SET texto = ''hack'' WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', s_a));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'authenticated não altera wa_mensagens (veio ' || v || ')');
    v := pg_temp.como(m, format('WITH d AS (DELETE FROM public.wa_mensagens WHERE id = %L RETURNING 1) SELECT count(*)::text FROM d', s_a));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'authenticated não apaga wa_mensagens (veio ' || v || ')');

    v := pg_temp.como(m, format('INSERT INTO public.wa_uso_por_org (organization_id, conexao_id) SELECT %L, id FROM public.wa_conexoes LIMIT 1 RETURNING 1::text', org_a));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'authenticated não insere em wa_uso_por_org (veio ' || v || ')');
    v := pg_temp.como(m, 'WITH u AS (UPDATE public.wa_uso_por_org SET envio_automatico_pedido = false RETURNING 1) SELECT count(*)::text FROM u');
    PERFORM pg_temp.confere(v LIKE '42501:%', 'authenticated não altera wa_uso_por_org (veio ' || v || ')');
    v := pg_temp.como(m, 'WITH d AS (DELETE FROM public.wa_uso_por_org RETURNING 1) SELECT count(*)::text FROM d');
    PERFORM pg_temp.confere(v LIKE '42501:%', 'authenticated não apaga wa_uso_por_org (veio ' || v || ')');

    v := pg_temp.como(m, 'INSERT INTO public.wa_conexoes (nome, sessao_remota) VALUES (''hack'', ''hack'') RETURNING 1::text');
    PERFORM pg_temp.confere(v LIKE '42501:%', 'authenticated não insere em wa_conexoes (veio ' || v || ')');
    v := pg_temp.como(m, 'WITH u AS (UPDATE public.wa_conexoes SET estado = ''conectado'' RETURNING 1) SELECT count(*)::text FROM u');
    PERFORM pg_temp.confere(v LIKE '42501:%', 'authenticated não altera wa_conexoes (veio ' || v || ')');
    v := pg_temp.como(m, 'WITH d AS (DELETE FROM public.wa_conexoes RETURNING 1) SELECT count(*)::text FROM d');
    PERFORM pg_temp.confere(v LIKE '42501:%', 'authenticated não apaga wa_conexoes (veio ' || v || ')');
    v := pg_temp.como(m, 'SELECT count(*)::text FROM public.wa_conexoes');
    PERFORM pg_temp.confere(v LIKE '42501:%', 'authenticated não lê wa_conexoes direto (veio ' || v || ')');

    v := pg_temp.como(m, format('INSERT INTO public.wa_eventos_recebidos (organization_id, chave_evento, tipo) VALUES (%L, ''ts-hack'', ''x'') RETURNING 1::text', org_a));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'authenticated não insere em wa_eventos_recebidos (veio ' || v || ')');
    v := pg_temp.como(m, 'WITH u AS (UPDATE public.wa_eventos_recebidos SET tipo = ''x'' RETURNING 1) SELECT count(*)::text FROM u');
    PERFORM pg_temp.confere(v LIKE '42501:%', 'authenticated não altera wa_eventos_recebidos (veio ' || v || ')');
    v := pg_temp.como(m, 'WITH d AS (DELETE FROM public.wa_eventos_recebidos RETURNING 1) SELECT count(*)::text FROM d');
    PERFORM pg_temp.confere(v LIKE '42501:%', 'authenticated não apaga wa_eventos_recebidos (veio ' || v || ')');

    -- TRUNCATE passa por cima da RLS: nem authenticated nem anon podem.
    FOREACH t IN ARRAY ARRAY['wa_conexoes', 'wa_uso_por_org', 'wa_mensagens', 'wa_eventos_recebidos'] LOOP
        PERFORM pg_temp.confere(NOT has_table_privilege('authenticated', 'public.' || t, 'TRUNCATE')
                                AND NOT has_table_privilege('anon', 'public.' || t, 'TRUNCATE')
                                AND NOT has_table_privilege('anon', 'public.' || t, 'SELECT'),
            t || ': sem TRUNCATE para o cliente e sem leitura para anon');
    END LOOP;

    -- ── wa_pode_usar ────────────────────────────────────────────────────────
    UPDATE public.organization_members SET permissions = coalesce(permissions, '{}'::jsonb) - 'canUseWhatsappEmpresa'
     WHERE organization_id = org_a AND user_id = m;
    PERFORM pg_temp.confere(public.wa_pode_usar(m, org_a) = false, 'wa_pode_usar: membro sem a flag → false');
    UPDATE public.organization_members SET permissions = coalesce(permissions, '{}'::jsonb) || '{"canUseWhatsappEmpresa": false}'::jsonb
     WHERE organization_id = org_a AND user_id = m;
    PERFORM pg_temp.confere(public.wa_pode_usar(m, org_a) = false, 'wa_pode_usar: flag false → false');
    UPDATE public.organization_members SET permissions = coalesce(permissions, '{}'::jsonb) || '{"canUseWhatsappEmpresa": true}'::jsonb
     WHERE organization_id = org_a AND user_id = m;
    PERFORM pg_temp.confere(public.wa_pode_usar(m, org_a) = true, 'wa_pode_usar: membro com a flag → true');
    PERFORM pg_temp.confere(public.wa_pode_usar(m, org_b) = false, 'wa_pode_usar: de outra org → false');
    PERFORM pg_temp.confere(public.wa_pode_usar(sa, org_b) = true, 'wa_pode_usar: superadmin → true');
    PERFORM pg_temp.confere(public.wa_pode_usar(NULL, org_a) = false AND public.wa_pode_usar(m, NULL) = false,
        'wa_pode_usar: usuário ou org nulos → false');
    v := pg_temp.como(m, format('SELECT public.wa_pode_usar(%L, %L)::text', m, org_a));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'wa_pode_usar: EXECUTE negado a authenticated (veio ' || v || ')');

    -- ── wa_pegar_pendentes ─────────────────────────────────────────────────
    -- p1..p3 elegíveis (proxima_tentativa_em no passado distante: vêm primeiro);
    -- p4 ainda não chegou a hora; p5 com trava valendo.
    EXECUTE format(ins, org_a, 'pendente', 'ts-p1', '2000-01-01') INTO p1;
    EXECUTE format(ins, org_a, 'pendente', 'ts-p2', '2000-01-01') INTO p2;
    EXECUTE format(ins, org_b, 'pendente', 'ts-p3', '2000-01-01') INTO p3;
    EXECUTE format(ins, org_a, 'pendente', 'ts-p4', now() + interval '1 hour') INTO p4;
    EXECUTE format(ins, org_a, 'pendente', 'ts-p5', '2000-01-01') INTO p5;
    UPDATE public.wa_mensagens SET trava_ate = now() + interval '5 minutes' WHERE id = p5;
    -- presas em enviando (o worker caiu no meio do envio), já com 1 tentativa:
    -- e1: trava vencida, criada há 1 h → volta; e2: trava vencida, criada há 24 h → incerta;
    -- e3: trava ainda valendo → não volta.
    -- proxima_tentativa_em no passado distante (como p1..p3): a pega ordena por ela e tem
    -- LIMIT — com now() a prova dependeria de a fila real ter menos de 10 linhas na frente.
    INSERT INTO public.wa_mensagens (organization_id, direcao, chat_id_remoto, texto, status, comando_id, tentativas, trava_ate, criado_em, proxima_tentativa_em)
    VALUES (org_a, 'saida', '5565999990000@c.us', 'TS', 'enviando', 'ts-e1', 1, now() - interval '1 minute', now() - interval '1 hour', '2000-01-01')
    RETURNING id INTO e1;
    INSERT INTO public.wa_mensagens (organization_id, direcao, chat_id_remoto, texto, status, comando_id, tentativas, trava_ate, criado_em, proxima_tentativa_em)
    VALUES (org_a, 'saida', '5565999990000@c.us', 'TS', 'enviando', 'ts-e2', 1, now() - interval '1 minute', now() - interval '24 hours', '2000-01-01')
    RETURNING id INTO e2;
    INSERT INTO public.wa_mensagens (organization_id, direcao, chat_id_remoto, texto, status, comando_id, tentativas, trava_ate, criado_em, proxima_tentativa_em)
    VALUES (org_a, 'saida', '5565999990000@c.us', 'TS', 'enviando', 'ts-e3', 1, now() + interval '1 minute', now() - interval '1 hour', '2000-01-01')
    RETURNING id INTO e3;
    -- pendentes criadas há 24 h: pv1 já foi tentada (voltou a pendente depois de um timeout/5xx)
    -- → a chave do OpenWA (24 h) já pode ter expirado: vira incerta, não volta; pv0 nunca foi
    -- tentada → sai normalmente.
    INSERT INTO public.wa_mensagens (organization_id, direcao, chat_id_remoto, texto, status, comando_id, tentativas, criado_em, proxima_tentativa_em)
    VALUES (org_a, 'saida', '5565999990000@c.us', 'TS', 'pendente', 'ts-pv1', 1, now() - interval '24 hours', '2000-01-01')
    RETURNING id INTO pv1;
    INSERT INTO public.wa_mensagens (organization_id, direcao, chat_id_remoto, texto, status, comando_id, tentativas, criado_em, proxima_tentativa_em)
    VALUES (org_a, 'saida', '5565999990000@c.us', 'TS', 'pendente', 'ts-pv0', 0, now() - interval '24 hours', '2000-01-01')
    RETURNING id INTO pv0;

    v := pg_temp.como(m, 'SELECT count(*)::text FROM public.wa_pegar_pendentes(10)');
    PERFORM pg_temp.confere(v LIKE '42501:%', 'wa_pegar_pendentes: negado a authenticated (veio ' || v || ')');

    SELECT array_agg(id) INTO pegou1 FROM public.wa_pegar_pendentes(10);
    PERFORM pg_temp.confere(pegou1 @> ARRAY[p1, p2, p3], 'wa_pegar_pendentes: 1ª chamada devolve as 3 elegíveis');
    PERFORM pg_temp.confere(NOT (pegou1 && ARRAY[p4, p5]), 'wa_pegar_pendentes: não devolve a de hora futura nem a travada');
    PERFORM pg_temp.confere((SELECT bool_and(status = 'enviando' AND tentativas = 1
                                             AND trava_ate > now() + interval '1 minute'
                                             AND trava_ate <= now() + interval '2 minutes')
                               FROM public.wa_mensagens WHERE id IN (p1, p2, p3)),
        'wa_pegar_pendentes: as pegas viram enviando com trava de 2 min e tentativas 0 → 1');
    PERFORM pg_temp.confere((SELECT bool_and(status = 'pendente' AND tentativas = 0) FROM public.wa_mensagens WHERE id IN (p4, p5)),
        'wa_pegar_pendentes: as não elegíveis continuam pendente, sem tentativa');
    -- (a) presa em enviando, trava vencida, criada há 1 h: volta e soma 1 tentativa
    PERFORM pg_temp.confere(e1 = ANY (pegou1), 'wa_pegar_pendentes: presa em enviando com trava vencida (1 h) volta');
    PERFORM pg_temp.confere((SELECT status = 'enviando' AND tentativas = 2 AND trava_ate > now() + interval '1 minute'
                               FROM public.wa_mensagens WHERE id = e1),
        'wa_pegar_pendentes: a presa retomada ganha trava nova e tentativas 1 → 2');
    -- (b) presa criada há 24 h: não volta e vira incerta
    PERFORM pg_temp.confere(NOT (e2 = ANY (pegou1)), 'wa_pegar_pendentes: presa criada há 24 h NÃO volta');
    PERFORM pg_temp.confere((SELECT status = 'incerta' AND tentativas = 1 AND trava_ate IS NULL AND erro LIKE '%24 h%'
                               FROM public.wa_mensagens WHERE id = e2),
        'wa_pegar_pendentes: presa criada há 24 h vira incerta, com o motivo');
    -- (c) enviando com trava ainda valendo: não volta
    PERFORM pg_temp.confere(NOT (e3 = ANY (pegou1)), 'wa_pegar_pendentes: enviando com trava valendo NÃO volta');
    PERFORM pg_temp.confere((SELECT status = 'enviando' AND tentativas = 1 FROM public.wa_mensagens WHERE id = e3),
        'wa_pegar_pendentes: enviando com trava valendo fica como estava');
    -- (d) pendente já tentada, criada há 24 h: não volta e vira incerta
    PERFORM pg_temp.confere(NOT (pv1 = ANY (pegou1)), 'wa_pegar_pendentes: pendente já tentada com mais de 23 h NÃO volta');
    PERFORM pg_temp.confere((SELECT status = 'incerta' AND tentativas = 1 AND trava_ate IS NULL
                                    AND erro LIKE '%mais de 23 h sem confirmação; pode ter saído%'
                               FROM public.wa_mensagens WHERE id = pv1),
        'wa_pegar_pendentes: pendente já tentada com mais de 23 h vira incerta, com o motivo');
    -- (e) pendente nunca tentada, criada há 24 h: sai normalmente
    PERFORM pg_temp.confere(pv0 = ANY (pegou1), 'wa_pegar_pendentes: pendente nunca tentada com mais de 23 h volta');
    PERFORM pg_temp.confere((SELECT status = 'enviando' AND tentativas = 1 FROM public.wa_mensagens WHERE id = pv0),
        'wa_pegar_pendentes: pendente nunca tentada vira enviando com tentativas 0 → 1');
    SELECT coalesce(array_agg(id), '{}') INTO pegou2 FROM public.wa_pegar_pendentes(10);
    PERFORM pg_temp.confere(NOT (pegou2 && ARRAY[p1, p2, p3, p4, p5, e1, e2, e3, pv0, pv1]), 'wa_pegar_pendentes: 2ª chamada não devolve as já travadas');

    -- ── unicidade e CHECKs ─────────────────────────────────────────────────
    BEGIN
        EXECUTE format(ins, org_a, 'pendente', 'ts-p1', now());
        RAISE EXCEPTION 'FALHOU: comando_id repetido na mesma org foi aceito';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    EXECUTE format(ins, org_b, 'aceita', 'ts-p1', now()) INTO v;   -- mesmo comando_id em OUTRA org: pode
    PERFORM pg_temp.confere(v IS NOT NULL, 'mesmo comando_id em outra org é aceito');
    BEGIN
        INSERT INTO public.wa_mensagens (organization_id, direcao, chat_id_remoto, status, comando_id)
        VALUES (NULL, 'saida', 'x@c.us', 'pendente', 'ts-sem-org');
        RAISE EXCEPTION 'FALHOU: saída sem organização foi aceita';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO public.wa_mensagens (organization_id, direcao, chat_id_remoto, status, provider_message_id)
        VALUES (NULL, 'entrada', '5565999990000@c.us', 'recebida', 'ts-prov-1');
        RAISE EXCEPTION 'FALHOU: (chat_id_remoto, provider_message_id) repetido foi aceito';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    -- ── campainha ──────────────────────────────────────────────────────────
    SELECT count(*) INTO n_antes FROM realtime.messages WHERE topic = 'wa-campainha';
    EXECUTE format(ins, org_a, 'pendente', 'ts-campainha', now());
    SELECT count(*) INTO n_depois FROM realtime.messages WHERE topic = 'wa-campainha';
    PERFORM pg_temp.confere(n_depois = n_antes + 1,
        format('saída pendente toca a campainha 1 vez (antes %s, depois %s)', n_antes, n_depois));
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM realtime.messages WHERE topic = 'wa-campainha'
                                          AND (payload ? 'telefone' OR payload ? 'texto' OR (payload - 'id') <> '{}'::jsonb
                                               OR event <> 'fila' OR private)),
        'campainha: payload vazio (sem telefone/texto), evento fila, tópico público');
    INSERT INTO public.wa_mensagens (organization_id, direcao, chat_id_remoto, texto, status)
    VALUES (org_a, 'entrada', '5565999990000@c.us', 'TS entrada', 'recebida');
    EXECUTE format(ins, org_a, 'aceita', 'ts-ja-aceita', now());
    SELECT count(*) INTO n_antes FROM realtime.messages WHERE topic = 'wa-campainha';
    PERFORM pg_temp.confere(n_antes = n_depois, 'entrada e saída não pendente não tocam a campainha');

    -- ── wa_definir_uso e wa_situacao ───────────────────────────────────────
    DELETE FROM public.wa_uso_por_org WHERE organization_id = org_a;
    v := pg_temp.como(m, format('SELECT public.wa_definir_uso(%L, true, true)::text', org_a));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'wa_definir_uso: membro comum → erro (veio ' || v || ')');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM public.wa_uso_por_org WHERE organization_id = org_a),
        'wa_definir_uso: o membro comum não gravou nada');
    v := pg_temp.como(dono, format('SELECT public.wa_definir_uso(%L, true, false)::text', org_a));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'wa_definir_uso: owner/admin grava (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT envio_automatico_pedido = false AND atualizado_por = dono AND conexao_id IS NOT NULL
                               FROM public.wa_uso_por_org WHERE organization_id = org_a),
        'wa_definir_uso: linha gravada com envio automático desligado e quem alterou');
    v := pg_temp.como(dono, format('SELECT public.wa_definir_uso(%L, true, true)::text', org_b));
    PERFORM pg_temp.confere(v LIKE '42501:%' OR EXISTS (SELECT 1 FROM public.organization_members
                                                         WHERE organization_id = org_b AND user_id = dono AND role IN ('owner', 'admin')),
        'wa_definir_uso: owner da A não liga a B (veio ' || v || ')');

    -- estado: só "veio preenchido" — depois de aplicada a migration o worker muda o estado real.
    v := pg_temp.como(m, format('SELECT string_agg((estado IS NOT NULL) || ''|'' || usa_na_org || ''|'' || envio_automatico_pedido, '','') FROM public.wa_situacao() WHERE organization_id = %L', org_a));
    PERFORM pg_temp.confere(v = 'ok:true|true|false', 'wa_situacao: membro vê a A usando, sem envio automático (veio ' || v || ')');
    v := pg_temp.como(m, format('SELECT count(*)::text FROM public.wa_situacao() WHERE organization_id = %L', org_b));
    PERFORM pg_temp.confere(v = 'ok:0', 'wa_situacao: não traz org de que o usuário não é membro (veio ' || v || ')');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM public.wa_situacao()), 'wa_situacao: sem usuário na requisição = vazio');

    -- antes de desligar: a A tem pendentes (p4 de hora futura, p5 travada, ts-campainha) e
    -- e1/pv0 em enviando; a B tem uma pendente.
    EXECUTE format(ins, org_b, 'pendente', 'ts-m5-b', '2000-01-01') INTO b_pend;
    PERFORM pg_temp.confere((SELECT count(*) FROM public.wa_mensagens
                              WHERE organization_id = org_a AND direcao = 'saida' AND status = 'pendente') >= 3,
        'fixture: a org A tem saídas pendentes antes de desligar');
    v := pg_temp.como(dono, format('SELECT public.wa_definir_uso(%L, false, NULL)::text', org_a));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND NOT EXISTS (SELECT 1 FROM public.wa_uso_por_org WHERE organization_id = org_a),
        'wa_definir_uso: desligar tira a org do uso (veio ' || v || ')');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM public.wa_mensagens
                                         WHERE organization_id = org_a AND direcao = 'saida' AND status = 'pendente'),
        'wa_definir_uso: desligar não deixa saída pendente na org');
    PERFORM pg_temp.confere((SELECT bool_and(status = 'cancelada' AND trava_ate IS NULL
                                             AND erro LIKE '%uso do WhatsApp desligado na organização%')
                               FROM public.wa_mensagens WHERE id IN (p4, p5)),
        'wa_definir_uso: desligar cancela as pendentes da org, com o motivo');
    PERFORM pg_temp.confere((SELECT status FROM public.wa_mensagens WHERE id = b_pend) = 'pendente',
        'wa_definir_uso: desligar a A não mexe na pendente da B');
    PERFORM pg_temp.confere((SELECT bool_and(status = 'enviando') FROM public.wa_mensagens WHERE id IN (e1, pv0)),
        'wa_definir_uso: desligar não mexe no que já está enviando');
    v := pg_temp.como(m, format('SELECT string_agg(usa_na_org || ''|'' || envio_automatico_pedido, '','') FROM public.wa_situacao() WHERE organization_id = %L', org_a));
    PERFORM pg_temp.confere(v = 'ok:false|false', 'wa_situacao: org desligada aparece sem uso (veio ' || v || ')');

    -- ── order_chats.canal ──────────────────────────────────────────────────
    PERFORM pg_temp.confere((SELECT column_default LIKE '''app''%' AND is_nullable = 'NO'
                               FROM information_schema.columns
                              WHERE table_schema = 'public' AND table_name = 'order_chats' AND column_name = 'canal'),
        'order_chats.canal: NOT NULL DEFAULT ''app''');
    PERFORM pg_temp.confere(EXISTS (SELECT 1 FROM pg_constraint
                                     WHERE conrelid = 'public.order_chats'::regclass AND contype = 'c'
                                       AND pg_get_constraintdef(oid) LIKE '%canal%app%whatsapp%'),
        'order_chats.canal: CHECK app|whatsapp');

    -- Só service_role grava canal = 'whatsapp'. comprador: conta com e-mail de membro da
    -- org do projeto do pedido (a regra de purchase_order_is_buyer).
    SELECT po.id, au.id INTO ped, comprador
      FROM public.purchase_orders po
      JOIN public.projects p ON p.id = po.project_id
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      JOIN auth.users au ON lower(au.email) = lower(om.email)
     ORDER BY po.id, au.id LIMIT 1;
    PERFORM pg_temp.confere(ped IS NOT NULL, 'fixture: um pedido e um comprador dele');
    v := pg_temp.como(comprador, format(
        'INSERT INTO public.order_chats (order_id, sender_email, sender_name, message, sender_role, canal) '
        || 'VALUES (%L, ''ts@ts'', ''TS'', ''TS falso'', ''buyer'', ''whatsapp'') RETURNING canal', ped));
    PERFORM pg_temp.confere(v = 'ok:app', 'order_chats: comprador (authenticated) que manda canal whatsapp grava app (veio ' || v || ')');

    -- service_role grava whatsapp; quem não é service_role não troca o canal no UPDATE.
    PERFORM set_config('request.jwt.claims', '{"role": "service_role"}', true);
    INSERT INTO public.order_chats (order_id, sender_email, sender_name, message, sender_role, canal)
    VALUES (ped, 'ts@ts', 'TS', 'TS do whatsapp', 'supplier', 'whatsapp') RETURNING id INTO oc;
    PERFORM pg_temp.confere((SELECT canal FROM public.order_chats WHERE id = oc) = 'whatsapp',
        'order_chats: service_role grava canal whatsapp');
    PERFORM set_config('request.jwt.claims', json_build_object('sub', comprador, 'role', 'authenticated')::text, true);
    UPDATE public.order_chats SET canal = 'app', message = 'TS editada' WHERE id = oc;
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM pg_temp.confere((SELECT canal = 'whatsapp' AND message = 'TS editada' FROM public.order_chats WHERE id = oc),
        'order_chats: UPDATE de quem não é service_role mantém o canal anterior');

    -- ── forma ──────────────────────────────────────────────────────────────
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                                          AND tablename IN ('wa_conexoes', 'wa_uso_por_org', 'wa_mensagens', 'wa_eventos_recebidos')
                                          AND cmd <> 'SELECT'),
        'nenhuma policy de escrita nas tabelas wa_*');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                                          AND tablename IN ('wa_conexoes', 'wa_eventos_recebidos')),
        'wa_conexoes e wa_eventos_recebidos sem policy nenhuma (só service_role / RPC)');
    PERFORM pg_temp.confere(NOT has_function_privilege('authenticated', 'public.wa_pode_usar(uuid, uuid)', 'EXECUTE')
                            AND NOT has_function_privilege('anon', 'public.wa_pode_usar(uuid, uuid)', 'EXECUTE')
                            AND NOT has_function_privilege('authenticated', 'public.wa_pegar_pendentes(integer)', 'EXECUTE')
                            AND NOT has_function_privilege('anon', 'public.wa_pegar_pendentes(integer)', 'EXECUTE')
                            AND has_function_privilege('service_role', 'public.wa_pode_usar(uuid, uuid)', 'EXECUTE')
                            AND has_function_privilege('service_role', 'public.wa_pegar_pendentes(integer)', 'EXECUTE'),
        'wa_pode_usar e wa_pegar_pendentes: só service_role');
    PERFORM pg_temp.confere(has_function_privilege('authenticated', 'public.wa_situacao()', 'EXECUTE')
                            AND NOT has_function_privilege('anon', 'public.wa_situacao()', 'EXECUTE')
                            AND has_function_privilege('authenticated', 'public.wa_definir_uso(uuid, boolean, boolean)', 'EXECUTE')
                            AND NOT has_function_privilege('anon', 'public.wa_definir_uso(uuid, boolean, boolean)', 'EXECUTE'),
        'wa_situacao e wa_definir_uso: authenticated sim, anon não');
    PERFORM pg_temp.confere(EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-limpar-eventos'
                                      AND command LIKE '%wa_eventos_recebidos%' AND command LIKE '%30 days%'
                                      AND command NOT LIKE '%http_post%'),
        'job wa-limpar-eventos agendado, SQL puro, 30 dias');
END $$;

ROLLBACK;

SELECT 'TUDO OK' AS resultado;
