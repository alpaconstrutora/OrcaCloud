-- scripts/teste-condominio-assembleias-portal.sql
-- Prova da Tarefa A3 (assembleias de condomínio): leitura e voto do condômino pelo
-- Portal do Cliente, e a leitura das impedidas para o gestor.
-- Migrations: supabase/migrations/aplicar_20271125860000_condominio_assembleias.sql (A1)
--             supabase/migrations/aplicar_20271125860100_condominio_assembleias_conduzir.sql (A2)
--             supabase/migrations/aplicar_20271125860200_condominio_assembleias_portal.sql (A3)
-- Plano:      docs/planos/2026-11-25-condominio-assembleias-votacoes.md (R2, R3, R5, R7,
--             "Desenho › RPCs/Telas", Task A3).
--
-- O que se prova (nomes dos casos do brief entre aspas no FALHOU):
--   • leitura (fn_assembleias_payload_for_client pelos dois invólucros):
--       "RASCUNHO não aparece no payload" (nem CANCELADA); minhasUnidades = só as unidades
--       da assembleia em que o cliente é PROPRIETARIO vigente (uma cédula por unidade);
--       impedida = o motivo do banco; sessaoValida = sessão com o e-mail do cadastro —
--       inclusive quando a leitura veio pelo token; "payload não traz voto de outra
--       unidade"; "ENCERRADA traz resultado e recusa voto" (resultado = itens do retrato,
--       sem cabeçalho nem nomes);
--   • voto (client_portal_assembleia_votar, identidade SÓ pelo JWT):
--       "proprietário logado vota"; "votar com token + sessão"; "anon não vota";
--       "membro não vota" (sem_direito_de_voto); "e-mail não confirmado não vota" (e
--       sessaoValida = false); "inquilino não vota"; "troca de voto até
--       encerrar vale o último"; "voto PORTAL depois de PRESENCIAL substitui";
--       "impedida recebe unidade_impedida"; opção inválida; unidade fora; item inexistente;
--   • condominio_assembleia_impedimentos: membro vê a impedida com o motivo; não-membro 42501;
--   • A2 refatorada aqui (núcleo do voto em auxiliares comuns): o voto presencial continua
--     exigindo presença e recusando impedida;
--   • privilégios: payload fora da API; token para anon+authenticated; demais só authenticated.
--
-- Personagens (contas reais, só leitura de auth.users/organization_members):
--   m — membro da org B (a que opera o condomínio), e-mail diferente do proprietário;
--   p — NÃO é membro da org B; o e-mail dele vai no cliente proprietário (c_p);
--   q — NÃO é membro da org B; o e-mail dele vai no cliente inquilino (c_inq).
-- Fixtures (empreendimento, torre, unidades, clientes, ocupações, rateio, título, token,
-- documento) criados aqui dentro.
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …';
-- sucesso = a linha final 'TUDO OK'. Sem a A3, falha na primeira chamada de função nova.
--
-- Ensaio (migrations ainda não aplicadas; o montador tira o BEGIN;/COMMIT; delas):
--   bash scripts/montar-ensaio.sh -o /tmp/e.sql scripts/teste-condominio-assembleias-portal.sql \
--        supabase/migrations/aplicar_20271125860000_condominio_assembleias.sql \
--        supabase/migrations/aplicar_20271125860100_condominio_assembleias_conduzir.sql \
--        supabase/migrations/aplicar_20271125860200_condominio_assembleias_portal.sql
--   npx supabase db query --linked -f /tmp/e.sql
-- Depois de aplicadas:
--   npx supabase db query --linked -f scripts/teste-condominio-assembleias-portal.sql

BEGIN;
-- MIGRATION

CREATE FUNCTION pg_temp.confere(p_ok BOOLEAN, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
END $$;

-- Claims de um usuário real (sub + e-mail de auth.users), como o PostgREST monta.
CREATE FUNCTION pg_temp.claims(p_user UUID, p_papel TEXT) RETURNS TEXT LANGUAGE sql AS $$
    SELECT CASE WHEN p_user IS NULL THEN json_build_object('role', p_papel)::text
                ELSE json_build_object('sub', p_user,
                                       'email', (SELECT u.email FROM auth.users u WHERE u.id = p_user),
                                       'role', p_papel)::text END
$$;

-- Roda p_sql como p_papel (NULL = postgres) com as claims de p_user.
-- Devolve 'ok:<resultado>' ou '<SQLSTATE>|<HINT>|<DETAIL>|<mensagem>'.
CREATE FUNCTION pg_temp.como(p_user UUID, p_papel TEXT, p_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT; h TEXT; d TEXT;
BEGIN
    PERFORM set_config('request.jwt.claims', pg_temp.claims(p_user, coalesce(p_papel, 'authenticated')), true);
    BEGIN
        IF p_papel IS NOT NULL THEN EXECUTE format('SET LOCAL ROLE %I', p_papel); END IF;
        EXECUTE p_sql INTO v;
        v := 'ok:' || coalesce(v, '<null>');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS h = PG_EXCEPTION_HINT, d = PG_EXCEPTION_DETAIL;
        v := SQLSTATE || '|' || coalesce(h, '') || '|' || coalesce(d, '') || '|' || SQLERRM;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN v;
END $$;

CREATE FUNCTION pg_temp.au(p_user UUID, p_sql TEXT) RETURNS TEXT LANGUAGE sql AS $$
    SELECT pg_temp.como(p_user, 'authenticated', p_sql)
$$;

-- Deslocar as datas da convocação (só com a marca, como a trava exige).
CREATE FUNCTION pg_temp.desloca(p_a UUID, p_primeira TIMESTAMPTZ, p_segunda TIMESTAMPTZ) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('app.assembleia_transicao', 'on', true);
    UPDATE public.condominio_assembleias
       SET primeira_convocacao_em = p_primeira, segunda_convocacao_em = p_segunda
     WHERE id = p_a;
    PERFORM set_config('app.assembleia_transicao', '', true);
END $$;

-- Voto pelo portal, como p_user autenticado (sem token, sem client_id).
CREATE FUNCTION pg_temp.vota(p_user UUID, p_item UUID, p_unit UUID, p_opcao TEXT) RETURNS TEXT LANGUAGE sql AS $$
    SELECT pg_temp.au(p_user, format('SELECT public.client_portal_assembleia_votar(%L, %L, %L)::text', p_item, p_unit, p_opcao))
$$;

-- Leitura pelo cliente (p_user autenticado) — devolve o jsonb cru do invólucro.
CREATE FUNCTION pg_temp.le(p_user UUID, p_client UUID) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
    v := pg_temp.au(p_user, format('SELECT public.client_portal_get_assembleias_for_client(%L)::text', p_client));
    IF v NOT LIKE 'ok:%' THEN RAISE EXCEPTION 'FALHOU: leitura for_client deu erro (veio %)', v; END IF;
    RETURN substr(v, 4)::jsonb;
END $$;

-- A assembleia p_a dentro da lista do payload (NULL se não está).
CREATE FUNCTION pg_temp.da(p_res JSONB, p_a UUID) RETURNS JSONB LANGUAGE sql AS $$
    SELECT x FROM jsonb_array_elements(coalesce(p_res -> 'assembleias', '[]'::jsonb)) x WHERE x ->> 'id' = p_a::text
$$;

-- A cédula da unidade p_u dentro de uma assembleia do payload (NULL se não está).
CREATE FUNCTION pg_temp.cedula(p_ass JSONB, p_u UUID) RETURNS JSONB LANGUAGE sql AS $$
    SELECT x FROM jsonb_array_elements(coalesce(p_ass -> 'minhasUnidades', '[]'::jsonb)) x WHERE x ->> 'unitId' = p_u::text
$$;

DO $$
DECLARE
    org_a UUID; org_b UUID; m UUID; p UUID; q UUID;
    email_p TEXT; email_q TEXT; confirmado_p TIMESTAMPTZ;
    e UUID; t UUID; u1 UUID; u2 UUID; u3 UUID; u5 UUID;
    c_p UUID; c_inq UUID; c_outro UUID;
    r1 UUID; tx2 UUID; doc_ata UUID;
    a UUID; rasc UUID; canc UUID; i1 UUID; i2 UUID; ir UUID;
    tok TEXT;
    v TEXT; res JSONB; ass JSONB; ced JSONB; j JSONB; ret JSONB; f TEXT;
    hoje DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    venc DATE; comp DATE; motivo_u2 TEXT;
    nova CONSTANT TEXT := 'WITH x AS (INSERT INTO public.condominio_assembleias '
                       || '(empreendimento_id, tipo, titulo, local, link_transmissao, primeira_convocacao_em, segunda_convocacao_em) '
                       || 'VALUES (%L, %L, %L, ''Salão de festas'', ''https://exemplo.invalid/sala'', %L::timestamptz, %L::timestamptz) '
                       || 'RETURNING id) SELECT id::text FROM x';
    item CONSTANT TEXT := 'WITH x AS (INSERT INTO public.condominio_assembleia_itens '
                       || '(assembleia_id, ordem, titulo, descricao, tipo, opcoes, quorum) VALUES (%L, %s, %L, %L, %L, %L::text[], %L) '
                       || 'RETURNING id) SELECT id::text FROM x';
    p1 CONSTANT TEXT := '2030-03-10 19:00:00-03:00';
    p2 CONSTANT TEXT := '2030-03-10 19:30:00-03:00';
BEGIN
    -- ═══ personagens ════════════════════════════════════════════════════════
    SELECT om.organization_id, om.user_id INTO org_b, m
      FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
     WHERE om.organization_id IS NOT NULL AND nullif(btrim(au.email), '') IS NOT NULL
     ORDER BY om.organization_id, om.user_id LIMIT 1;
    SELECT o.id INTO org_a FROM public.organizations o WHERE o.id <> org_b ORDER BY o.id LIMIT 1;
    -- p e q: não são membros da org B, e-mails diferentes entre si e do de m.
    SELECT au.id, au.email INTO p, email_p FROM auth.users au
     WHERE nullif(btrim(au.email), '') IS NOT NULL AND au.email_confirmed_at IS NOT NULL
       AND lower(au.email) <> (SELECT lower(x.email) FROM auth.users x WHERE x.id = m)
       AND NOT EXISTS (SELECT 1 FROM public.organization_members om
                        WHERE om.organization_id = org_b
                          AND (om.user_id = au.id OR lower(om.email) = lower(au.email)))
     ORDER BY au.id LIMIT 1;
    SELECT au.id, au.email INTO q, email_q FROM auth.users au
     WHERE nullif(btrim(au.email), '') IS NOT NULL AND au.email_confirmed_at IS NOT NULL AND au.id <> p
       AND lower(au.email) NOT IN (lower(email_p), (SELECT lower(x.email) FROM auth.users x WHERE x.id = m))
       AND NOT EXISTS (SELECT 1 FROM public.organization_members om
                        WHERE om.organization_id = org_b
                          AND (om.user_id = au.id OR lower(om.email) = lower(au.email)))
     ORDER BY au.id LIMIT 1;
    PERFORM pg_temp.confere(org_b IS NOT NULL AND org_a IS NOT NULL AND m IS NOT NULL AND p IS NOT NULL AND q IS NOT NULL,
        'fixture: orgs A e B, membro m da B, não-membros p e q');

    -- ═══ condomínio em operação (org A, operado pela B) ══════════════════════
    INSERT INTO public.empreendimentos (organization_id, condominio_org_id, name, status)
    VALUES (org_a, org_b, 'Teste assembleias A3 (ROLLBACK)', 'EM_OPERACAO') RETURNING id INTO e;
    INSERT INTO public.empreendimento_towers (empreendimento_id, name) VALUES (e, 'Torre T') RETURNING id INTO t;
    INSERT INTO public.empreendimento_units (tower_id, name, fracao_ideal_decimal) VALUES (t, '101', 0.25) RETURNING id INTO u1;
    INSERT INTO public.empreendimento_units (tower_id, name, fracao_ideal_decimal) VALUES (t, '102', 0.25) RETURNING id INTO u2;
    INSERT INTO public.empreendimento_units (tower_id, name, fracao_ideal_decimal) VALUES (t, '103', 0.5)  RETURNING id INTO u3;
    INSERT INTO public.empreendimento_units (tower_id, name) VALUES (t, 'Garagem') RETURNING id INTO u5;

    -- c_p (e-mail de p): dono de 101 (quite), 102 (impedida) e da Garagem (sem fração,
    -- fora da assembleia). c_inq (e-mail de q): inquilino de 101. c_outro: dono de 103.
    INSERT INTO public.clients (name, organization_id, email) VALUES ('Paula Proprietária', org_b, email_p) RETURNING id INTO c_p;
    INSERT INTO public.clients (name, organization_id, email) VALUES ('Ivo Inquilino', org_b, email_q) RETURNING id INTO c_inq;
    INSERT INTO public.clients (name, organization_id) VALUES ('Otto Outro', org_b) RETURNING id INTO c_outro;
    INSERT INTO public.unit_occupancies (unit_id, client_id, organization_id, role, started_at, ended_at) VALUES
        (u1, c_p,     org_b, 'PROPRIETARIO', DATE '2020-01-01', NULL),
        (u1, c_inq,   org_b, 'INQUILINO',    DATE '2022-01-01', NULL),
        (u2, c_p,     org_b, 'PROPRIETARIO', DATE '2020-01-01', NULL),
        (u5, c_p,     org_b, 'PROPRIETARIO', DATE '2020-01-01', NULL),
        (u3, c_outro, org_b, 'PROPRIETARIO', DATE '2020-01-01', NULL);

    -- 102 impedida: cota vencida e não paga (mesmo formato de condominioCobrancaService).
    venc := hoje - 20; comp := date_trunc('month', venc - 30)::date;
    INSERT INTO public.internal_transactions (organization_id, source_system, transaction_date, due_date, amount, direction, status, business_status, description)
    VALUES (org_b, 'CONDOMINIO_RATEIO', venc, venc, 100, 'CREDIT', 'PENDING', 'PREVISTO', 'Cota teste A3 u2') RETURNING id INTO tx2;
    INSERT INTO public.condominio_rateios (empreendimento_id, organization_id, competencia, criterio)
    VALUES (e, org_b, comp, 'FRACAO_IDEAL') RETURNING id INTO r1;
    INSERT INTO public.condominio_rateio_itens (rateio_id, unit_id, organization_id, peso, valor, transaction_id)
    VALUES (r1, u2, org_b, 0.25, 100, tx2);
    UPDATE public.condominio_rateios SET status = 'FECHADO', fechado_em = now() WHERE id = r1;
    motivo_u2 := format('Cota de %s vencida em %s', to_char(comp, 'MM/YYYY'), to_char(venc, 'DD/MM/YYYY'));

    INSERT INTO public.condominio_documentos (empreendimento_id, organization_id, titulo, categoria, url)
    VALUES (e, org_b, 'Ata teste A3', 'ATA', 'https://exemplo.invalid/ata.pdf') RETURNING id INTO doc_ata;

    -- Link do portal de c_p.
    INSERT INTO public.client_portal_tokens (org_id, client_id) VALUES (org_b, c_p) RETURNING token INTO tok;

    -- ═══ assembleias: rascunho, cancelada e a convocada A ════════════════════
    rasc := substr(pg_temp.au(m, format(nova, e, 'AGO', 'Rascunho invisível', p1, p2)), 4)::uuid;
    ir   := substr(pg_temp.au(m, format(item, rasc, 1, 'Item do rascunho', NULL, 'APROVACAO', NULL, 'MAIORIA_PRESENTES')), 4)::uuid;
    canc := substr(pg_temp.au(m, format(nova, e, 'AGE', 'Cancelada invisível', p1, p2)), 4)::uuid;
    PERFORM pg_temp.au(m, format(item, canc, 1, 'Item', NULL, 'APROVACAO', NULL, 'MAIORIA_PRESENTES'));
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_convocar(%L, %L)::text', canc, 'Edital'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'fixture: convocar a que será cancelada (veio ' || v || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_cancelar(%L, %L, NULL)::text', canc, 'Teste'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'fixture: cancelar (veio ' || v || ')');

    a  := substr(pg_temp.au(m, format(nova, e, 'AGE', 'Assembleia A3', p1, p2)), 4)::uuid;
    i1 := substr(pg_temp.au(m, format(item, a, 1, 'Aprovar contas', 'Contas de 2029', 'APROVACAO', NULL, 'MAIORIA_PRESENTES')), 4)::uuid;
    i2 := substr(pg_temp.au(m, format(item, a, 2, 'Eleger síndico', NULL, 'ESCOLHA', '{Ana,Bia}', 'MAIORIA_PRESENTES')), 4)::uuid;
    PERFORM pg_temp.confere(a IS NOT NULL AND i1 IS NOT NULL AND i2 IS NOT NULL AND rasc IS NOT NULL, 'fixture: pauta da assembleia A');

    -- RASCUNHO: ninguém vê, ninguém vota.
    res := pg_temp.le(p, c_p);
    PERFORM pg_temp.confere(res ->> 'ok' = 'true' AND jsonb_typeof(res -> 'assembleias') = 'array'
                        AND pg_temp.da(res, rasc) IS NULL AND pg_temp.da(res, a) IS NULL,
        'RASCUNHO não aparece no payload (veio ' || res::text || ')');
    v := pg_temp.vota(p, ir, u1, 'SIM');
    PERFORM pg_temp.confere(v LIKE 'P0001|estado|%', 'RASCUNHO não aceita voto do portal (veio ' || v || ')');

    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_convocar(%L, %L)::text', a, 'Edital A3'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'convocar A (veio ' || v || ')');

    -- ═══ leitura: o cliente logado ══════════════════════════════════════════
    res := pg_temp.le(p, c_p);
    ass := pg_temp.da(res, a);
    PERFORM pg_temp.confere(ass IS NOT NULL AND pg_temp.da(res, rasc) IS NULL AND pg_temp.da(res, canc) IS NULL
                        AND jsonb_array_length(res -> 'assembleias') = 1,
        'RASCUNHO não aparece no payload (nem CANCELADA); a CONVOCADA sim (veio ' || res::text || ')');
    PERFORM pg_temp.confere(ass ->> 'status' = 'CONVOCADA' AND ass ->> 'titulo' = 'Assembleia A3' AND ass ->> 'tipo' = 'AGE'
                        AND ass ->> 'condominioNome' = 'Teste assembleias A3 (ROLLBACK)'
                        AND ass ->> 'local' = 'Salão de festas' AND ass ->> 'linkTransmissao' = 'https://exemplo.invalid/sala'
                        AND (ass ->> 'primeiraConvocacaoEm')::timestamptz = p1::timestamptz
                        AND (ass ->> 'segundaConvocacaoEm')::timestamptz = p2::timestamptz
                        AND ass -> 'resultado' = 'null'::jsonb AND ass -> 'ataDocumentoId' = 'null'::jsonb
                        AND ass ->> 'sessaoValida' = 'true',
        'payload: dados da assembleia e sessão válida do proprietário (veio ' || ass::text || ')');
    -- total = soma das frações de TODAS as participantes (101 + 102 + 103 = 0,25 + 0,25 + 0,5),
    -- inclusive a impedida e a que não é do cliente: é o denominador do % do resultado (R8).
    PERFORM pg_temp.confere((ass ->> 'total')::numeric = 1
                        AND (ass ->> 'total')::numeric = (SELECT sum(fracao) FROM public.condominio_assembleia_unidades WHERE assembleia_id = a),
        'payload: total = soma das frações participantes (veio ' || coalesce(ass ->> 'total', 'null') || ')');
    PERFORM pg_temp.confere(jsonb_array_length(ass -> 'itens') = 2
                        AND ass -> 'itens' -> 0 ->> 'id' = i1::text AND (ass -> 'itens' -> 0 ->> 'ordem')::int = 1
                        AND ass -> 'itens' -> 0 ->> 'titulo' = 'Aprovar contas' AND ass -> 'itens' -> 0 ->> 'descricao' = 'Contas de 2029'
                        AND ass -> 'itens' -> 0 ->> 'tipo' = 'APROVACAO' AND ass -> 'itens' -> 0 ->> 'quorum' = 'MAIORIA_PRESENTES'
                        AND ass -> 'itens' -> 0 -> 'opcoes' = 'null'::jsonb
                        AND ass -> 'itens' -> 1 ->> 'id' = i2::text AND ass -> 'itens' -> 1 -> 'opcoes' = '["Ana", "Bia"]'::jsonb,
        'payload: pauta em ordem com tipo, opções e quórum (veio ' || (ass -> 'itens')::text || ')');
    PERFORM pg_temp.confere(jsonb_array_length(ass -> 'minhasUnidades') = 2
                        AND pg_temp.cedula(ass, u1) IS NOT NULL AND pg_temp.cedula(ass, u2) IS NOT NULL
                        AND pg_temp.cedula(ass, u3) IS NULL AND pg_temp.cedula(ass, u5) IS NULL
                        AND pg_temp.cedula(ass, u1) ->> 'rotulo' = 'Torre T — 101'
                        AND pg_temp.cedula(ass, u1) -> 'impedida' = 'null'::jsonb
                        AND pg_temp.cedula(ass, u2) ->> 'impedida' = motivo_u2
                        AND pg_temp.cedula(ass, u1) -> 'votos' = '{}'::jsonb,
        'payload: uma cédula por unidade da assembleia em que é PROPRIETARIO (sem a Garagem fora, sem a 103); '
        || 'impedida = motivo do banco (veio ' || (ass -> 'minhasUnidades')::text || ')');

    -- O inquilino vê a assembleia do condomínio, mas sem cédula.
    res := pg_temp.le(q, c_inq);
    ass := pg_temp.da(res, a);
    PERFORM pg_temp.confere(ass IS NOT NULL AND ass -> 'minhasUnidades' = '[]'::jsonb AND ass ->> 'sessaoValida' = 'true',
        'inquilino vê a assembleia, sem cédula (veio ' || coalesce(ass::text, res::text) || ')');

    -- Gestor espiando o portal do cliente: lê, mas a sessão não é a do cliente.
    res := pg_temp.le(m, c_p);
    PERFORM pg_temp.confere(res ->> 'ok' = 'true' AND pg_temp.da(res, a) ->> 'sessaoValida' = 'false'
                        AND jsonb_array_length(pg_temp.da(res, a) -> 'minhasUnidades') = 2,
        'membro da org lê pelo for_client com sessaoValida = false (veio ' || res::text || ')');
    -- Outro cliente logado (não é membro, e-mail de outro cadastro): sem permissão.
    res := pg_temp.le(q, c_p);
    PERFORM pg_temp.confere(res ->> 'ok' = 'false' AND NOT res ? 'assembleias',
        'for_client: quem não é membro nem o próprio cliente não lê (veio ' || res::text || ')');
    v := pg_temp.como(NULL, 'anon', format('SELECT public.client_portal_get_assembleias_for_client(%L)::text', c_p));
    PERFORM pg_temp.confere(v LIKE '42501|%', 'anon não executa o for_client (veio ' || v || ')');

    -- ═══ leitura pelo link (token) ══════════════════════════════════════════
    v := pg_temp.como(NULL, 'anon', format('SELECT public.client_portal_get_assembleias(%L)::text', tok));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (substr(v, 4)::jsonb) ->> 'ok' = 'true'
                        AND pg_temp.da(substr(v, 4)::jsonb, a) ->> 'sessaoValida' = 'false'
                        AND jsonb_array_length(pg_temp.da(substr(v, 4)::jsonb, a) -> 'minhasUnidades') = 2,
        'token sem sessão: lê a pauta e a cédula, sessaoValida = false (veio ' || v || ')');
    v := pg_temp.como(NULL, 'anon', format('SELECT public.client_portal_get_assembleias(%L)::text', 'token-que-nao-existe'));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (substr(v, 4)::jsonb) ->> 'ok' = 'false' AND NOT (substr(v, 4)::jsonb) ? 'assembleias',
        'token inválido: ok = false, sem assembleias (veio ' || v || ')');

    -- ═══ voto ═══════════════════════════════════════════════════════════════
    v := pg_temp.vota(p, i1, u1, 'SIM');
    j := CASE WHEN v LIKE 'ok:%' THEN substr(v, 4)::jsonb END;
    PERFORM pg_temp.confere(j IS NOT NULL AND j ->> 'origem' = 'PORTAL' AND j ->> 'opcao' = 'SIM'
                        AND j -> 'anterior' = 'null'::jsonb,
        'proprietário logado vota (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT opcao || '/' || origem || '/' || client_id::text || '/' || coalesce(lancado_por::text, '-')
                               FROM public.condominio_assembleia_votos WHERE item_id = i1 AND unit_id = u1)
                            = 'SIM/PORTAL/' || c_p::text || '/-',
        'proprietário logado vota: origem PORTAL, client_id do cliente, sem lancado_por');
    PERFORM pg_temp.confere(EXISTS (SELECT 1 FROM public.condominio_assembleia_eventos
                                     WHERE assembleia_id = a AND evento = 'VOTO_PORTAL' AND papel = 'CONDOMINO'
                                       AND ator = c_p AND unit_id = u1 AND detalhe ->> 'itemId' = i1::text
                                       AND detalhe ->> 'usuario' = p::text),
        'proprietário logado vota: evento VOTO_PORTAL com papel CONDOMINO');

    v := pg_temp.vota(p, i1, u1, 'NAO');
    j := CASE WHEN v LIKE 'ok:%' THEN substr(v, 4)::jsonb END;
    PERFORM pg_temp.confere(j IS NOT NULL AND j -> 'anterior' ->> 'opcao' = 'SIM' AND NOT (j -> 'anterior') ? 'lancadoPor'
                        AND (SELECT opcao FROM public.condominio_assembleia_votos WHERE item_id = i1 AND unit_id = u1) = 'NAO'
                        AND (SELECT array_agg(opcao ORDER BY id) FROM public.condominio_assembleia_votos_historico
                              WHERE item_id = i1 AND unit_id = u1) = ARRAY['SIM', 'NAO'],
        'troca de voto até encerrar vale o último (histórico SIM, NAO) (veio ' || v || ')');

    v := pg_temp.vota(p, i1, u1, 'TALVEZ');
    PERFORM pg_temp.confere(v LIKE 'P0001|opcao_invalida|%', 'APROVACAO: opção fora de SIM/NAO/ABSTENCAO recusada (veio ' || v || ')');
    v := pg_temp.vota(p, i2, u1, 'SIM');
    PERFORM pg_temp.confere(v LIKE 'P0001|opcao_invalida|%', 'ESCOLHA: SIM não é opção (veio ' || v || ')');
    v := pg_temp.vota(p, i2, u1, NULL);
    PERFORM pg_temp.confere(v LIKE 'P0001|opcao_invalida|%', 'opção NULL recusada (veio ' || v || ')');

    v := pg_temp.vota(p, i1, u2, 'SIM');
    PERFORM pg_temp.confere(v LIKE 'P0001|unidade_impedida|' || motivo_u2 || '|%'
                        AND NOT EXISTS (SELECT 1 FROM public.condominio_assembleia_votos WHERE unit_id = u2),
        'impedida recebe unidade_impedida (DETAIL = motivo) (veio ' || v || ')');
    v := pg_temp.vota(p, i1, u5, 'SIM');
    PERFORM pg_temp.confere(v LIKE 'P0001|unidade_fora|%', 'unidade do cliente fora da assembleia (sem fração) recusada (veio ' || v || ')');
    v := pg_temp.vota(p, gen_random_uuid(), u1, 'SIM');
    PERFORM pg_temp.confere(v LIKE 'P0002|nao_encontrada|%', 'item inexistente: nao_encontrada (veio ' || v || ')');

    v := pg_temp.vota(m, i1, u1, 'SIM');
    PERFORM pg_temp.confere(v LIKE '42501|sem_direito_de_voto|%', 'membro não vota (veio ' || v || ')');
    v := pg_temp.vota(q, i1, u1, 'SIM');
    PERFORM pg_temp.confere(v LIKE '42501|sem_direito_de_voto|%', 'inquilino não vota (veio ' || v || ')');
    v := pg_temp.vota(p, i1, u3, 'SIM');
    PERFORM pg_temp.confere(v LIKE '42501|sem_direito_de_voto|%', 'proprietário não vota por unidade de outro (veio ' || v || ')');
    v := pg_temp.como(NULL, 'anon', format('SELECT public.client_portal_assembleia_votar(%L, %L, %L)::text', i1, u1, 'SIM'));
    PERFORM pg_temp.confere(v LIKE '42501|%', 'anon não vota (veio ' || v || ')');
    -- E-mail não confirmado: o JWT traz o e-mail do cadastro, mas a conta nunca provou que
    -- o e-mail é dela — não vota, e a leitura diz sessaoValida = false (a cédula desliga).
    -- (Só dentro deste BEGIN … ROLLBACK; volta ao valor original logo depois.)
    SELECT email_confirmed_at INTO confirmado_p FROM auth.users WHERE id = p;
    UPDATE auth.users SET email_confirmed_at = NULL WHERE id = p;
    v := pg_temp.vota(p, i1, u1, 'SIM');
    PERFORM pg_temp.confere(v LIKE '42501|sem_direito_de_voto|%', 'e-mail não confirmado não vota (veio ' || v || ')');
    res := pg_temp.le(p, c_p);
    PERFORM pg_temp.confere(pg_temp.da(res, a) ->> 'sessaoValida' = 'false',
        'e-mail não confirmado: sessaoValida = false (veio ' || res::text || ')');
    UPDATE auth.users SET email_confirmed_at = confirmado_p WHERE id = p;
    PERFORM pg_temp.confere((SELECT opcao FROM public.condominio_assembleia_votos WHERE item_id = i1 AND unit_id = u1) = 'NAO',
        'recusas não mudaram o voto');

    -- Votar com token + sessão: a leitura vem pelo link, e com a sessão do proprietário
    -- ela já diz sessaoValida = true; o voto passa pela sessão.
    v := pg_temp.au(p, format('SELECT public.client_portal_get_assembleias(%L)::text', tok));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND pg_temp.da(substr(v, 4)::jsonb, a) ->> 'sessaoValida' = 'true',
        'votar com token + sessão: leitura pelo token com sessão do proprietário diz sessaoValida = true (veio ' || v || ')');
    v := pg_temp.vota(p, i2, u1, 'Bia');
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (SELECT opcao FROM public.condominio_assembleia_votos WHERE item_id = i2 AND unit_id = u1) = 'Bia',
        'votar com token + sessão (veio ' || v || ')');

    -- Voto de outra unidade (103) não aparece no payload de c_p.
    INSERT INTO public.condominio_assembleia_votos (assembleia_id, item_id, unit_id, opcao, origem, client_id)
    VALUES (a, i1, u3, 'SIM', 'PORTAL', c_outro);
    res := pg_temp.le(p, c_p);
    ass := pg_temp.da(res, a);
    ced := pg_temp.cedula(ass, u1);
    PERFORM pg_temp.confere(ced -> 'votos' ->> i1::text IS NOT NULL
                        AND ced -> 'votos' -> i1::text ->> 'opcao' = 'NAO' AND ced -> 'votos' -> i1::text ->> 'origem' = 'PORTAL'
                        AND ced -> 'votos' -> i1::text ->> 'votadoEm' IS NOT NULL
                        AND ced -> 'votos' -> i2::text ->> 'opcao' = 'Bia'
                        AND pg_temp.cedula(ass, u2) -> 'votos' = '{}'::jsonb
                        AND position(u3::text IN res::text) = 0 AND position(c_outro::text IN res::text) = 0
                        AND position('Otto Outro' IN res::text) = 0,
        'payload não traz voto de outra unidade (veio ' || res::text || ')');

    -- ═══ impedimentos (leitura do gestor) ═══════════════════════════════════
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_impedimentos(%L)::text', a));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND substr(v, 4)::jsonb = jsonb_build_array(jsonb_build_object('unitId', u2, 'motivo', motivo_u2)),
        'impedimentos: membro vê a impedida com o motivo (veio ' || v || ')');
    v := pg_temp.au(p, format('SELECT public.condominio_assembleia_impedimentos(%L)::text', a));
    PERFORM pg_temp.confere(v LIKE '42501|%', 'impedimentos: não-membro recebe 42501 (veio ' || v || ')');
    v := pg_temp.au(p, format('SELECT public.condominio_assembleia_impedimentos(%L)::text', gen_random_uuid()));
    PERFORM pg_temp.confere(v LIKE '42501|%', 'impedimentos: assembleia inexistente também 42501 (veio ' || v || ')');
    v := pg_temp.como(NULL, 'anon', format('SELECT public.condominio_assembleia_impedimentos(%L)::text', a));
    PERFORM pg_temp.confere(v LIKE '42501|%', 'impedimentos: anon não executa (veio ' || v || ')');

    -- ═══ instalada: o voto do portal continua aberto ════════════════════════
    PERFORM pg_temp.desloca(a, now() - interval '40 minutes', now() - interval '10 minutes');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_registrar_presenca(%L, %L, %L, NULL, NULL)::text', a, u1, 'PRESENCIAL'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'presença de 101 na sala (veio ' || v || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_instalar(%L, 2::smallint, %L, %L, true)::text',
                              a, 'Maria Presidente', 'João Secretário'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'instalar A em 2ª (veio ' || v || ')');

    -- A2 (refatorada nesta migration): o gestor continua lançando, com as mesmas recusas.
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_lancar_voto(%L, %L, %L)::text', i1, u2, 'SIM'));
    PERFORM pg_temp.confere(v LIKE 'P0001|unidade_impedida|' || motivo_u2 || '|%', 'gestor: impedida não vota na sala (veio ' || v || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_lancar_voto(%L, %L, %L)::text', i1, u3, 'SIM'));
    PERFORM pg_temp.confere(v LIKE 'P0001|sem_presenca|%', 'gestor: sem presença não lança (veio ' || v || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_lancar_voto(%L, %L, %L)::text', i2, u1, 'Carla'));
    PERFORM pg_temp.confere(v LIKE 'P0001|opcao_invalida|%', 'gestor: opção inválida (veio ' || v || ')');

    -- Voto PORTAL depois de PRESENCIAL substitui (vale o último, venha de onde vier).
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_lancar_voto(%L, %L, %L)::text', i1, u1, 'SIM'));
    j := CASE WHEN v LIKE 'ok:%' THEN substr(v, 4)::jsonb END;
    PERFORM pg_temp.confere(j IS NOT NULL AND j -> 'anterior' ->> 'origem' = 'PORTAL' AND j -> 'anterior' ->> 'opcao' = 'NAO'
                        AND (SELECT origem || '/' || lancado_por::text || '/' || coalesce(client_id::text, '-')
                               FROM public.condominio_assembleia_votos WHERE item_id = i1 AND unit_id = u1) = 'PRESENCIAL/' || m::text || '/-',
        'gestor lança na sala sobre o voto do portal (veio ' || v || ')');
    v := pg_temp.vota(p, i1, u1, 'ABSTENCAO');
    j := CASE WHEN v LIKE 'ok:%' THEN substr(v, 4)::jsonb END;
    PERFORM pg_temp.confere(j IS NOT NULL AND j -> 'anterior' ->> 'origem' = 'PRESENCIAL' AND j -> 'anterior' ->> 'opcao' = 'SIM'
                        AND (SELECT opcao || '/' || origem || '/' || client_id::text || '/' || coalesce(lancado_por::text, '-')
                               FROM public.condominio_assembleia_votos WHERE item_id = i1 AND unit_id = u1)
                            = 'ABSTENCAO/PORTAL/' || c_p::text || '/-'
                        AND (SELECT array_agg(origem ORDER BY id) FROM public.condominio_assembleia_votos_historico
                              WHERE item_id = i1 AND unit_id = u1) = ARRAY['PORTAL', 'PORTAL', 'PRESENCIAL', 'PORTAL'],
        'voto PORTAL depois de PRESENCIAL substitui (veio ' || v || ')');
    res := pg_temp.le(p, c_p);
    PERFORM pg_temp.confere(pg_temp.da(res, a) ->> 'status' = 'INSTALADA'
                        AND pg_temp.cedula(pg_temp.da(res, a), u1) -> 'votos' -> i1::text ->> 'opcao' = 'ABSTENCAO'
                        AND pg_temp.cedula(pg_temp.da(res, a), u2) ->> 'impedida' = motivo_u2,
        'payload da INSTALADA: o último voto e a impedida (veio ' || res::text || ')');

    -- ═══ encerrada ══════════════════════════════════════════════════════════
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_encerrar(%L, NULL, %L)::text', a, 'Sem mais assuntos.'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'encerrar A (veio ' || v || ')');
    SELECT retrato INTO ret FROM public.condominio_assembleias WHERE id = a;
    v := pg_temp.vota(p, i1, u1, 'SIM');
    PERFORM pg_temp.confere(v LIKE 'P0001|estado|%já foi encerrada%'
                        AND (SELECT opcao FROM public.condominio_assembleia_votos WHERE item_id = i1 AND unit_id = u1) = 'ABSTENCAO',
        'ENCERRADA traz resultado e recusa voto: voto recusado (veio ' || v || ')');
    res := pg_temp.le(p, c_p);
    ass := pg_temp.da(res, a);
    PERFORM pg_temp.confere(ass ->> 'status' = 'ENCERRADA' AND ass -> 'resultado' = ret -> 'itens'
                        AND jsonb_array_length(ass -> 'resultado') = 2
                        AND ass -> 'resultado' -> 0 ->> 'resultado' IS NOT NULL
                        AND pg_temp.cedula(ass, u1) -> 'votos' -> i1::text ->> 'opcao' = 'ABSTENCAO'
                        AND pg_temp.cedula(ass, u2) -> 'impedida' = 'null'::jsonb,
        'ENCERRADA traz resultado e recusa voto: resultado = itens do retrato, voto da unidade (veio ' || coalesce(ass::text, res::text) || ')');
    PERFORM pg_temp.confere(ass -> 'total' = ret -> 'total' AND (ass ->> 'total')::numeric = 1,
        'ENCERRADA: total = o do retrato (o mesmo da ata) (veio ' || coalesce(ass ->> 'total', 'null') || ')');
    PERFORM pg_temp.confere(position('Maria Presidente' IN res::text) = 0 AND position('instaladaPor' IN res::text) = 0
                        AND position('cabecalho' IN res::text) = 0 AND position(m::text IN res::text) = 0
                        AND position(u3::text IN res::text) = 0,
        'ENCERRADA: sem cabeçalho do retrato, sem nome/id de quem conduziu, sem outra unidade (veio ' || res::text || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_vincular_ata(%L, %L)::text', a, doc_ata));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'vincular ata (veio ' || v || ')');
    PERFORM pg_temp.confere(pg_temp.da(pg_temp.le(p, c_p), a) ->> 'ataDocumentoId' = doc_ata::text,
        'ENCERRADA traz ataDocumentoId');

    -- ═══ privilégios ════════════════════════════════════════════════════════
    v := pg_temp.au(p, format('SELECT public.fn_assembleias_payload_for_client(%L)::text', c_p));
    PERFORM pg_temp.confere(v LIKE '42501|%', 'authenticated não executa fn_assembleias_payload_for_client (veio ' || v || ')');
    v := pg_temp.au(p, format('SELECT public._assembleia_votar_portal(%L, %L, %L, %L, %L)::text', i1, u1, 'SIM', c_p, p));
    PERFORM pg_temp.confere(v LIKE '42501|%', 'authenticated não executa _assembleia_votar_portal (veio ' || v || ')');
    PERFORM pg_temp.confere(
        (SELECT bool_and(NOT has_function_privilege('anon', x.oid, 'EXECUTE')
                     AND NOT has_function_privilege('authenticated', x.oid, 'EXECUTE')
                     AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(pr.proacl, acldefault('f', pr.proowner))) y
                                      WHERE y.grantee = 0 AND y.privilege_type = 'EXECUTE')
                     AND pr.prosecdef AND 'search_path=public, pg_temp' = ANY (pr.proconfig))
               AND count(*) = 6
           FROM (VALUES ('public.fn_assembleias_payload_for_client(uuid)'::regprocedure),
                        ('public._assembleia_votar_portal(uuid, uuid, text, uuid, uuid)'::regprocedure),
                        ('public._assembleia_unidade_votante(uuid, uuid)'::regprocedure),
                        ('public._assembleia_exige_opcao(text, text[], text)'::regprocedure),
                        ('public._assembleia_gravar_voto(uuid, uuid, uuid, text, text, uuid, uuid)'::regprocedure),
                        ('public._assembleia_lancar_voto(uuid, uuid, text, uuid, text)'::regprocedure)) x(oid)
           JOIN pg_proc pr ON pr.oid = x.oid),
        'payload e núcleo: fora de PUBLIC/anon/authenticated, SECURITY DEFINER, search_path fixo');
    PERFORM pg_temp.confere(
        (SELECT has_function_privilege('anon', p0.oid, 'EXECUTE') AND has_function_privilege('authenticated', p0.oid, 'EXECUTE')
            AND p0.prosecdef AND 'search_path=public, pg_temp' = ANY (p0.proconfig)
           FROM pg_proc p0 WHERE p0.oid = 'public.client_portal_get_assembleias(text)'::regprocedure),
        'client_portal_get_assembleias: anon e authenticated executam');
    PERFORM pg_temp.confere(
        (SELECT bool_and(has_function_privilege('authenticated', x.oid, 'EXECUTE')
                     AND NOT has_function_privilege('anon', x.oid, 'EXECUTE')
                     AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(pr.proacl, acldefault('f', pr.proowner))) y
                                      WHERE y.grantee = 0 AND y.privilege_type = 'EXECUTE')
                     AND pr.prosecdef AND 'search_path=public, pg_temp' = ANY (pr.proconfig))
               AND count(*) = 3
           FROM (VALUES ('public.client_portal_get_assembleias_for_client(uuid)'::regprocedure),
                        ('public.client_portal_assembleia_votar(uuid, uuid, text)'::regprocedure),
                        ('public.condominio_assembleia_impedimentos(uuid)'::regprocedure)) x(oid)
           JOIN pg_proc pr ON pr.oid = x.oid),
        'for_client, votar e impedimentos: só authenticated (fora de PUBLIC/anon)');
    PERFORM pg_temp.confere(
        (SELECT NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(pr.proacl, acldefault('f', pr.proowner))) y
                             WHERE y.grantee = 0 AND y.privilege_type = 'EXECUTE')
           FROM pg_proc pr WHERE pr.oid = 'public.client_portal_get_assembleias(text)'::regprocedure),
        'client_portal_get_assembleias fora de PUBLIC');
END $$;

ROLLBACK;

SELECT 'TUDO OK' AS resultado;
