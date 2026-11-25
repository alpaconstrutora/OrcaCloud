-- scripts/teste-condominio-assembleias-estrutura.sql
-- Prova da Tarefa A1 (assembleias de condomínio): tabelas, trava e RLS.
-- Migration: supabase/migrations/aplicar_20271125860000_condominio_assembleias.sql
-- Plano:     docs/planos/2026-11-25-condominio-assembleias-votacoes.md (R1–R10, "Desenho", Task A1).
--
-- O que se prova:
--   • organization_id da assembleia vem de fn_org_do_condominio (o empreendimento do teste
--     é da org A e é OPERADO pela org B: a assembleia nasce na B, mesmo pedindo a A);
--   • rascunho é editável pelo membro (assembleia e itens pela tabela, RLS por conjunto);
--   • CHECKs: ESCOLHA com 1 opção / ESCOLHA fora da maioria dos presentes / APROVACAO com
--     opções / 2ª convocação antes da 1ª / procurador sem nome ou sem procuração;
--   • trava (23514, HINT assembleia_travada), valendo também para postgres:
--     troca de status sem a marca app.assembleia_transicao; qualquer UPDATE fora de
--     RASCUNHO sem a marca; item não muda depois de CONVOCADA (só deliberação em
--     INSTALADA); unidades e votos só em CONVOCADA/INSTALADA; ENCERRADA não muda (só
--     ata_documento_id, com a marca); CANCELADA não muda nada; DELETE de assembleia fora
--     de RASCUNHO; DELETE de voto sempre;
--   • histórico ganha linha a cada inclusão/troca de voto;
--   • leitura: membro lê as 6 tabelas; não-membro não lê nada; anon não tem permissão
--     em nenhuma; membro não escreve em unidades/votos/histórico/eventos;
--   • privilégios: TRUNCATE de ninguém da API; funções de gatilho fora de PUBLIC/anon/
--     authenticated.
--
-- Personagens (contas reais, só leitura de auth.users/organization_members):
--   m — membro (user_id) da org B;   n — conta que não é membro da org B.
-- Fixtures (empreendimento, torre, 2 unidades, 2 documentos) criados aqui dentro.
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …';
-- sucesso = a linha final 'TUDO OK'. Sem a migration (linha MIGRATION vazia) falha já
-- no primeiro INSERT em condominio_assembleias (a tabela não existe) — é o RED.
--
-- Ensaio (migration ainda não aplicada; o montador tira o BEGIN;/COMMIT; dela):
--   bash scripts/montar-ensaio.sh -o /tmp/e.sql scripts/teste-condominio-assembleias-estrutura.sql \
--        supabase/migrations/aplicar_20271125860000_condominio_assembleias.sql
--   npx supabase db query --linked -f /tmp/e.sql
-- Depois de aplicada:
--   npx supabase db query --linked -f scripts/teste-condominio-assembleias-estrutura.sql

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

-- Roda p_sql como p_papel com as claims de p_user.
-- Devolve 'ok:<resultado>' ou '<SQLSTATE>:<HINT>:<mensagem>'.
CREATE FUNCTION pg_temp.como(p_user UUID, p_papel TEXT, p_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT; h TEXT;
BEGIN
    PERFORM set_config('request.jwt.claims', pg_temp.claims(p_user, p_papel), true);
    BEGIN
        EXECUTE format('SET LOCAL ROLE %I', p_papel);
        EXECUTE p_sql INTO v;
        v := 'ok:' || coalesce(v, '<null>');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS h = PG_EXCEPTION_HINT;
        v := SQLSTATE || ':' || coalesce(h, '') || ':' || SQLERRM;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN v;
END $$;

CREATE FUNCTION pg_temp.au(p_user UUID, p_sql TEXT) RETURNS TEXT LANGUAGE sql AS $$
    SELECT pg_temp.como(p_user, 'authenticated', p_sql)
$$;

-- Roda p_sql como postgres (o papel das RPCs SECURITY DEFINER), com ou sem a marca de
-- transição. Mesmo formato de retorno de pg_temp.como.
CREATE FUNCTION pg_temp.pg(p_marca BOOLEAN, p_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT; h TEXT;
BEGIN
    PERFORM set_config('app.assembleia_transicao', CASE WHEN p_marca THEN 'on' ELSE '' END, true);
    BEGIN
        EXECUTE p_sql INTO v;
        v := 'ok:' || coalesce(v, '<null>');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS h = PG_EXCEPTION_HINT;
        v := SQLSTATE || ':' || coalesce(h, '') || ':' || SQLERRM;
    END;
    PERFORM set_config('app.assembleia_transicao', '', true);
    RETURN v;
END $$;

DO $$
DECLARE
    org_a UUID; org_b UUID; m UUID; n UUID;
    e UUID; t UUID; u1 UUID; u2 UUID; u_fora UUID := gen_random_uuid();
    doc UUID; doc_proc UUID;
    a UUID; a_canc UUID; a_apagar UUID; i1 UUID; i2 UUID; i3 UUID; voto UUID;
    v TEXT; tab TEXT;
    trava CONSTANT TEXT := '23514:assembleia_travada:%';
    chk   CONSTANT TEXT := '23514::%check constraint%';
    seis  CONSTANT TEXT[] := ARRAY['condominio_assembleias', 'condominio_assembleia_itens',
                                   'condominio_assembleia_unidades', 'condominio_assembleia_votos',
                                   'condominio_assembleia_votos_historico', 'condominio_assembleia_eventos'];
    upd   CONSTANT TEXT := 'WITH x AS (UPDATE public.%I SET %s WHERE id = %L RETURNING 1) SELECT count(*)::text FROM x';
    del   CONSTANT TEXT := 'WITH x AS (DELETE FROM public.%I WHERE id = %L RETURNING 1) SELECT count(*)::text FROM x';
    nova  CONSTANT TEXT := 'WITH x AS (INSERT INTO public.condominio_assembleias '
                        || '(empreendimento_id, organization_id, tipo, titulo, primeira_convocacao_em, segunda_convocacao_em%s) '
                        || 'VALUES (%L, %L, %L, %L, now() + interval ''7 days'', now() + interval ''7 days 30 minutes''%s) '
                        || 'RETURNING id) SELECT id::text FROM x';
    item  CONSTANT TEXT := 'WITH x AS (INSERT INTO public.condominio_assembleia_itens '
                        || '(assembleia_id, ordem, titulo, tipo, opcoes, quorum) VALUES (%L, %s, %L, %L, %L::text[], %L) '
                        || 'RETURNING id) SELECT id::text FROM x';
    unid  CONSTANT TEXT := 'WITH x AS (INSERT INTO public.condominio_assembleia_unidades '
                        || '(assembleia_id, unit_id, fracao, unidade_rotulo, proprietario_nome, presenca, procurador_nome, procuracao_documento_id) '
                        || 'VALUES (%L, %L, %s, %L, %L, %L, %L, %L) RETURNING id) SELECT id::text FROM x';
    vota  CONSTANT TEXT := 'WITH x AS (INSERT INTO public.condominio_assembleia_votos '
                        || '(assembleia_id, item_id, unit_id, opcao, origem) VALUES (%L, %L, %L, %L, %L) '
                        || 'RETURNING id) SELECT id::text FROM x';
BEGIN
    -- ── fixtures ─────────────────────────────────────────────────────────────
    SELECT om.organization_id, om.user_id INTO org_b, m
      FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
     WHERE om.organization_id IS NOT NULL AND nullif(btrim(au.email), '') IS NOT NULL
     ORDER BY om.organization_id, om.user_id LIMIT 1;
    SELECT o.id INTO org_a FROM public.organizations o WHERE o.id <> org_b ORDER BY o.id LIMIT 1;
    SELECT au.id INTO n FROM auth.users au
     WHERE nullif(btrim(au.email), '') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.organization_members om
                        WHERE om.organization_id = org_b
                          AND (om.user_id = au.id OR (om.user_id IS NULL AND lower(om.email) = lower(au.email))))
     ORDER BY au.id LIMIT 1;
    PERFORM pg_temp.confere(org_b IS NOT NULL AND org_a IS NOT NULL AND m IS NOT NULL AND n IS NOT NULL,
        'fixture: orgs A e B, membro m da B, não-membro n');

    INSERT INTO public.empreendimentos (organization_id, condominio_org_id, name)
    VALUES (org_a, org_b, 'Teste assembleias (ROLLBACK)') RETURNING id INTO e;
    PERFORM pg_temp.confere(public.fn_org_do_condominio(e) = org_b, 'fixture: o condomínio é operado pela org B');
    INSERT INTO public.empreendimento_towers (empreendimento_id, name) VALUES (e, 'Torre teste') RETURNING id INTO t;
    INSERT INTO public.empreendimento_units (tower_id, name) VALUES (t, '101') RETURNING id INTO u1;
    INSERT INTO public.empreendimento_units (tower_id, name) VALUES (t, '102') RETURNING id INTO u2;
    INSERT INTO public.condominio_documentos (empreendimento_id, organization_id, titulo, categoria, url)
    VALUES (e, org_b, 'Ata teste', 'ATA', 'https://exemplo.invalid/ata.pdf') RETURNING id INTO doc;
    INSERT INTO public.condominio_documentos (empreendimento_id, organization_id, titulo, categoria, url, visivel_portal)
    VALUES (e, org_b, 'Procuração teste', 'OUTRO', 'https://exemplo.invalid/proc.pdf', false) RETURNING id INTO doc_proc;

    -- ── organization_id vem de fn_org_do_condominio ──────────────────────────
    -- O membro da B pede a org A: o gatilho grava a B (a org que opera o condomínio).
    v := pg_temp.au(m, format(nova, '', e, org_a, 'AGE', 'Assembleia de teste', ''));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'organization_id vem de fn_org_do_condominio: membro cria (veio ' || v || ')');
    a := substr(v, 4)::uuid;
    PERFORM pg_temp.confere((SELECT organization_id FROM public.condominio_assembleias WHERE id = a) = org_b,
        'organization_id vem de fn_org_do_condominio (gravou a org B, não a A pedida)');
    PERFORM pg_temp.confere((SELECT status FROM public.condominio_assembleias WHERE id = a) = 'RASCUNHO',
        'assembleia nasce RASCUNHO');
    -- Não-membro da B não cria (a org gravada é a B; RLS recusa).
    v := pg_temp.au(n, format(nova, '', e, org_b, 'AGO', 'Intrusa', ''));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'não-membro não cria assembleia (veio ' || v || ')');
    -- Nascer já fora de RASCUNHO = troca de status sem a marca.
    v := pg_temp.au(m, format(nova, ', status', e, org_b, 'AGO', 'Já convocada', ', ''CONVOCADA'''));
    PERFORM pg_temp.confere(v LIKE trava, 'INSERT já CONVOCADA recusado (veio ' || v || ')');

    -- ── rascunho editável por membro ─────────────────────────────────────────
    v := pg_temp.au(m, format(upd, 'condominio_assembleias',
        'titulo = ''Assembleia geral extraordinária'', local = ''Salão de festas'', link_transmissao = ''https://meet.invalid/x''', a));
    PERFORM pg_temp.confere(v = 'ok:1', 'rascunho editável por membro: assembleia (veio ' || v || ')');
    v := pg_temp.au(m, format(item, a, 1, 'Aprovar contas', 'APROVACAO', NULL, 'MAIORIA_PRESENTES'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'rascunho editável por membro: item APROVACAO (veio ' || v || ')');
    i1 := substr(v, 4)::uuid;
    v := pg_temp.au(m, format(item, a, 2, 'Eleger síndico', 'ESCOLHA', '{Ana,Bia}', 'MAIORIA_PRESENTES'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'rascunho editável por membro: item ESCOLHA com 2 opções (veio ' || v || ')');
    i2 := substr(v, 4)::uuid;
    v := pg_temp.au(m, format(item, a, 3, 'Item que sai', 'APROVACAO', NULL, 'MAIORIA_ABSOLUTA'));
    i3 := substr(v, 4)::uuid;
    v := pg_temp.au(m, format(upd, 'condominio_assembleia_itens', 'titulo = ''Aprovar as contas de 2026''', i1));
    PERFORM pg_temp.confere(v = 'ok:1', 'rascunho editável por membro: altera item (veio ' || v || ')');
    v := pg_temp.au(m, format(del, 'condominio_assembleia_itens', i3));
    PERFORM pg_temp.confere(v = 'ok:1', 'rascunho editável por membro: exclui item (veio ' || v || ')');
    v := pg_temp.au(n, format(upd, 'condominio_assembleias', 'titulo = ''invadida''', a));
    PERFORM pg_temp.confere(v = 'ok:0', 'não-membro não altera o rascunho (veio ' || v || ')');

    -- ── CHECKs ───────────────────────────────────────────────────────────────
    v := pg_temp.au(m, format(item, a, 4, 'Só uma opção', 'ESCOLHA', '{Ana}', 'MAIORIA_PRESENTES'));
    PERFORM pg_temp.confere(v LIKE chk, 'ESCOLHA com 1 opção recusada pelo CHECK (veio ' || v || ')');
    v := pg_temp.au(m, format(item, a, 4, 'Escolha por 2/3', 'ESCOLHA', '{Ana,Bia}', 'DOIS_TERCOS'));
    PERFORM pg_temp.confere(v LIKE chk, 'ESCOLHA fora da maioria dos presentes recusada pelo CHECK (veio ' || v || ')');
    v := pg_temp.au(m, format(item, a, 4, 'Aprovação com opções', 'APROVACAO', '{Sim,Não}', 'MAIORIA_PRESENTES'));
    PERFORM pg_temp.confere(v LIKE chk, 'APROVACAO com opções recusada pelo CHECK (veio ' || v || ')');
    v := pg_temp.au(m, format(item, a, 1, 'Ordem repetida', 'APROVACAO', NULL, 'MAIORIA_PRESENTES'));
    PERFORM pg_temp.confere(v LIKE '23505:%', 'ordem repetida na pauta recusada (veio ' || v || ')');
    v := pg_temp.au(m, format(upd, 'condominio_assembleias', 'segunda_convocacao_em = primeira_convocacao_em', a));
    PERFORM pg_temp.confere(v LIKE chk, '2ª convocação não pode ser antes/igual à 1ª (veio ' || v || ')');

    -- ── UPDATE de status direto recusado (assembleia_travada) ────────────────
    v := pg_temp.au(m, format(upd, 'condominio_assembleias', 'status = ''CONVOCADA''', a));
    PERFORM pg_temp.confere(v LIKE trava, 'UPDATE de status direto recusado (assembleia_travada) — membro (veio ' || v || ')');
    v := pg_temp.pg(false, format(upd, 'condominio_assembleias', 'status = ''CONVOCADA''', a));
    PERFORM pg_temp.confere(v LIKE trava, 'UPDATE de status direto recusado (assembleia_travada) — postgres sem marca (veio ' || v || ')');
    -- unidades e votos não existem em RASCUNHO
    v := pg_temp.pg(true, format(unid, a, u1, '0.5', 'Torre teste — 101', 'Fulano', NULL, NULL, NULL));
    PERFORM pg_temp.confere(v LIKE trava, 'unidade não entra em RASCUNHO (veio ' || v || ')');

    -- ── CONVOCADA (transição pela marca, como as RPCs farão) ─────────────────
    v := pg_temp.pg(true, format(upd, 'condominio_assembleias', 'status = ''CONVOCADA'', convocada_em = now()', a));
    PERFORM pg_temp.confere(v = 'ok:1', 'transição RASCUNHO → CONVOCADA com a marca (veio ' || v || ')');
    v := pg_temp.pg(false, format(upd, 'condominio_assembleias', 'local = ''Outro lugar''', a));
    PERFORM pg_temp.confere(v LIKE trava, 'UPDATE fora de RASCUNHO sem a marca recusado — postgres (veio ' || v || ')');
    v := pg_temp.au(m, format(upd, 'condominio_assembleias', 'primeira_convocacao_em = now() + interval ''9 days''', a));
    PERFORM pg_temp.confere(v LIKE trava, 'UPDATE fora de RASCUNHO sem a marca recusado — membro (veio ' || v || ')');
    v := pg_temp.pg(true, format(upd, 'condominio_assembleias', 'local = ''Salão de festas (bloco B)''', a));
    PERFORM pg_temp.confere(v = 'ok:1', 'UPDATE em CONVOCADA com a marca passa (é a porta das RPCs) (veio ' || v || ')');

    -- item não muda depois de CONVOCADA (nem com a marca)
    v := pg_temp.au(m, format(upd, 'condominio_assembleia_itens', 'titulo = ''outro''', i1));
    PERFORM pg_temp.confere(v LIKE trava, 'item não muda depois de CONVOCADA — membro (veio ' || v || ')');
    v := pg_temp.pg(true, format(upd, 'condominio_assembleia_itens', 'titulo = ''outro''', i1));
    PERFORM pg_temp.confere(v LIKE trava, 'item não muda depois de CONVOCADA — postgres com marca (veio ' || v || ')');
    v := pg_temp.au(m, format(upd, 'condominio_assembleia_itens', 'deliberacao = ''cedo demais''', i1));
    PERFORM pg_temp.confere(v LIKE trava, 'deliberação só em INSTALADA (veio ' || v || ')');
    v := pg_temp.au(m, format(item, a, 9, 'Item novo', 'APROVACAO', NULL, 'MAIORIA_PRESENTES'));
    PERFORM pg_temp.confere(v LIKE trava, 'item não entra depois de CONVOCADA (veio ' || v || ')');
    v := pg_temp.au(m, format(del, 'condominio_assembleia_itens', i2));
    PERFORM pg_temp.confere(v LIKE trava, 'item não sai depois de CONVOCADA (veio ' || v || ')');
    v := pg_temp.au(m, format(del, 'condominio_assembleias', a));
    PERFORM pg_temp.confere(v LIKE trava, 'DELETE de assembleia fora de RASCUNHO recusado — membro (veio ' || v || ')');
    v := pg_temp.pg(true, format(del, 'condominio_assembleias', a));
    PERFORM pg_temp.confere(v LIKE trava, 'DELETE de assembleia fora de RASCUNHO recusado — postgres com marca (veio ' || v || ')');

    -- unidades (congeladas na convocação; escrita só pelo papel das RPCs)
    v := pg_temp.pg(false, format(unid, a, u1, '0.005', 'Torre teste — 101', 'Fulano', NULL, NULL, NULL));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'unidade entra em CONVOCADA (veio ' || v || ')');
    v := pg_temp.pg(false, format(unid, a, u2, '0.005', 'Torre teste — 102', 'Beltrana', 'PROCURADOR', 'Procurador X', NULL));
    PERFORM pg_temp.confere(v LIKE chk, 'PROCURADOR sem procuração recusado pelo CHECK (veio ' || v || ')');
    v := pg_temp.pg(false, format(unid, a, u2, '0.005', 'Torre teste — 102', 'Beltrana', 'PROCURADOR', ' ', doc_proc));
    PERFORM pg_temp.confere(v LIKE chk, 'PROCURADOR sem nome recusado pelo CHECK (veio ' || v || ')');
    v := pg_temp.pg(false, format(unid, a, u2, '0.005', 'Torre teste — 102', 'Beltrana', 'PROCURADOR', 'Procurador X', doc_proc));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'PROCURADOR com nome e procuração entra (veio ' || v || ')');
    v := pg_temp.au(m, format(unid, a, u_fora, '0.001', 'Fora', 'Ninguém', NULL, NULL, NULL));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'membro não escreve em unidades (só RPC) (veio ' || v || ')');

    -- votos
    v := pg_temp.pg(false, format(vota, a, i1, u1, 'SIM', 'PORTAL'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'voto entra em CONVOCADA (veio ' || v || ')');
    voto := substr(v, 4)::uuid;
    v := pg_temp.pg(false, format(vota, a, i1, u_fora, 'SIM', 'PORTAL'));
    PERFORM pg_temp.confere(v LIKE '23503:%', 'voto de unidade fora da assembleia recusado (FK) (veio ' || v || ')');
    v := pg_temp.pg(false, format(vota, a, i1, u1, 'NAO', 'PRESENCIAL'));
    PERFORM pg_temp.confere(v LIKE '23505:%', 'um voto por (item, unidade) (veio ' || v || ')');
    v := pg_temp.au(m, format(vota, a, i2, u1, 'Ana', 'PORTAL'));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'membro não escreve em votos (só RPC) (veio ' || v || ')');

    -- histórico ganha linha ao trocar voto
    PERFORM pg_temp.confere((SELECT count(*) FROM public.condominio_assembleia_votos_historico WHERE voto_id = voto) = 1,
        'histórico ganha linha ao incluir voto');
    v := pg_temp.pg(false, format(upd, 'condominio_assembleia_votos',
        'opcao = ''NAO'', origem = ''PRESENCIAL'', votado_em = now()', voto));
    PERFORM pg_temp.confere(v = 'ok:1', 'troca de voto em CONVOCADA (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT count(*) FROM public.condominio_assembleia_votos_historico WHERE voto_id = voto) = 2,
        'histórico ganha linha ao trocar voto');
    PERFORM pg_temp.confere((SELECT array_agg(h.opcao || '/' || h.origem ORDER BY h.id)
                               FROM public.condominio_assembleia_votos_historico h WHERE h.voto_id = voto)
                            = ARRAY['SIM/PORTAL', 'NAO/PRESENCIAL'],
        'histórico guarda as duas versões do voto');

    -- DELETE de voto recusado (sempre: nem com a marca)
    v := pg_temp.pg(false, format(del, 'condominio_assembleia_votos', voto));
    PERFORM pg_temp.confere(v LIKE trava, 'DELETE de voto recusado — sem marca (veio ' || v || ')');
    v := pg_temp.pg(true, format(del, 'condominio_assembleia_votos', voto));
    PERFORM pg_temp.confere(v LIKE trava, 'DELETE de voto recusado — com marca (veio ' || v || ')');

    -- eventos (escrita só pelas RPCs)
    INSERT INTO public.condominio_assembleia_eventos (assembleia_id, evento, ator, papel, detalhe)
    VALUES (a, 'CONVOCADA', m, 'GESTOR', '{}'::jsonb);
    v := pg_temp.au(m, format('WITH x AS (INSERT INTO public.condominio_assembleia_eventos (assembleia_id, evento, papel) '
                           || 'VALUES (%L, ''FORJADO'', ''GESTOR'') RETURNING 1) SELECT count(*)::text FROM x', a));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'membro não escreve em eventos (só RPC) (veio ' || v || ')');
    v := pg_temp.pg(false, format('INSERT INTO public.condominio_assembleia_eventos (assembleia_id, evento, papel) '
                               || 'VALUES (%L, ''X'', ''ADMIN'') RETURNING id::text', a));
    PERFORM pg_temp.confere(v LIKE chk, 'eventos: papel fora de GESTOR/SINDICO/CONDOMINO recusado (veio ' || v || ')');

    -- ── leitura ──────────────────────────────────────────────────────────────
    -- membro lê as 6 (todas têm linha desta assembleia a esta altura)
    FOREACH tab IN ARRAY seis LOOP
        v := pg_temp.au(m, format('SELECT count(*)::text FROM public.%I WHERE %I = %L',
                                  tab, CASE WHEN tab = 'condominio_assembleias' THEN 'id' ELSE 'assembleia_id' END, a));
        PERFORM pg_temp.confere(v LIKE 'ok:%' AND v <> 'ok:0', 'membro lê ' || tab || ' (veio ' || v || ')');
    END LOOP;
    -- não-membro não lê
    FOREACH tab IN ARRAY seis LOOP
        v := pg_temp.au(n, format('SELECT count(*)::text FROM public.%I WHERE %I = %L',
                                  tab, CASE WHEN tab = 'condominio_assembleias' THEN 'id' ELSE 'assembleia_id' END, a));
        PERFORM pg_temp.confere(v = 'ok:0', 'não-membro não lê ' || tab || ' (veio ' || v || ')');
    END LOOP;
    -- anon não lê nenhuma das 6 tabelas (sem privilégio nenhum)
    FOREACH tab IN ARRAY seis LOOP
        v := pg_temp.como(NULL, 'anon', format('SELECT count(*)::text FROM public.%I', tab));
        PERFORM pg_temp.confere(v LIKE '42501:%', 'anon não lê ' || tab || ' (veio ' || v || ')');
    END LOOP;

    -- ── INSTALADA ────────────────────────────────────────────────────────────
    v := pg_temp.pg(true, format(upd, 'condominio_assembleias',
        'status = ''INSTALADA'', instalada_em = now(), instalada_convocacao = 1, '
        || 'presidente_nome = ''Presidente'', secretario_nome = ''Secretária'', quorum_instalacao = ''{}''::jsonb', a));
    PERFORM pg_temp.confere(v = 'ok:1', 'transição CONVOCADA → INSTALADA com a marca (veio ' || v || ')');
    v := pg_temp.au(m, format(upd, 'condominio_assembleia_itens', 'deliberacao = ''Aprovadas por maioria.''', i1));
    PERFORM pg_temp.confere(v = 'ok:1', 'deliberação do item muda em INSTALADA (veio ' || v || ')');
    v := pg_temp.au(m, format(upd, 'condominio_assembleia_itens', 'deliberacao = ''x'', titulo = ''troca''', i1));
    PERFORM pg_temp.confere(v LIKE trava, 'em INSTALADA só a deliberação do item muda (veio ' || v || ')');
    v := pg_temp.pg(false, format(upd, 'condominio_assembleia_unidades', 'presenca = ''PRESENCIAL'', presenca_em = now()',
        (SELECT id FROM public.condominio_assembleia_unidades WHERE assembleia_id = a AND unit_id = u1)));
    PERFORM pg_temp.confere(v = 'ok:1', 'presença muda em INSTALADA (veio ' || v || ')');
    v := pg_temp.pg(false, format(vota, a, i2, u2, 'Bia', 'PRESENCIAL'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'voto entra em INSTALADA (veio ' || v || ')');

    -- ── ENCERRADA não muda, só ata_documento_id ──────────────────────────────
    v := pg_temp.pg(true, format(upd, 'condominio_assembleias',
        'status = ''ENCERRADA'', encerrada_em = now(), retrato = ''{"itens": []}''::jsonb', a));
    PERFORM pg_temp.confere(v = 'ok:1', 'transição INSTALADA → ENCERRADA com a marca (veio ' || v || ')');
    v := pg_temp.pg(false, format(upd, 'condominio_assembleias', format('ata_documento_id = %L', doc), a));
    PERFORM pg_temp.confere(v LIKE trava, 'ENCERRADA: ata_documento_id sem a marca recusado (veio ' || v || ')');
    v := pg_temp.pg(true, format(upd, 'condominio_assembleias', format('ata_documento_id = %L, observacao_geral = ''x''', doc), a));
    PERFORM pg_temp.confere(v LIKE trava, 'ENCERRADA: ata_documento_id junto com outro campo recusado (veio ' || v || ')');
    v := pg_temp.pg(true, format(upd, 'condominio_assembleias', format('ata_documento_id = %L', doc), a));
    PERFORM pg_temp.confere(v = 'ok:1', 'ENCERRADA não muda, só ata_documento_id (com a marca) (veio ' || v || ')');
    v := pg_temp.pg(true, format(upd, 'condominio_assembleias', 'observacao_geral = ''depois''', a));
    PERFORM pg_temp.confere(v LIKE trava, 'ENCERRADA não muda — outro campo com a marca (veio ' || v || ')');
    v := pg_temp.pg(true, format(upd, 'condominio_assembleias', 'retrato = ''{"itens": [1]}''::jsonb', a));
    PERFORM pg_temp.confere(v LIKE trava, 'ENCERRADA não muda — retrato (veio ' || v || ')');
    v := pg_temp.pg(true, format(upd, 'condominio_assembleias', 'status = ''INSTALADA''', a));
    PERFORM pg_temp.confere(v LIKE trava, 'ENCERRADA não volta de estado, nem com a marca (veio ' || v || ')');
    v := pg_temp.au(m, format(upd, 'condominio_assembleias', 'titulo = ''reescrita''', a));
    PERFORM pg_temp.confere(v LIKE trava, 'ENCERRADA não muda — membro (veio ' || v || ')');
    v := pg_temp.au(m, format(upd, 'condominio_assembleia_itens', 'deliberacao = ''reescrita''', i1));
    PERFORM pg_temp.confere(v LIKE trava, 'ENCERRADA: deliberação do item não muda (veio ' || v || ')');
    v := pg_temp.pg(true, format(upd, 'condominio_assembleia_votos', 'opcao = ''SIM''', voto));
    PERFORM pg_temp.confere(v LIKE trava, 'ENCERRADA: voto não muda (veio ' || v || ')');
    v := pg_temp.pg(true, format(vota, a, i2, u1, 'Ana', 'PORTAL'));
    PERFORM pg_temp.confere(v LIKE trava, 'ENCERRADA: voto não entra (veio ' || v || ')');
    v := pg_temp.pg(true, format(upd, 'condominio_assembleia_unidades', 'presenca = NULL, presenca_em = NULL',
        (SELECT id FROM public.condominio_assembleia_unidades WHERE assembleia_id = a AND unit_id = u1)));
    PERFORM pg_temp.confere(v LIKE trava, 'ENCERRADA: presença não muda (veio ' || v || ')');
    v := pg_temp.pg(true, format(del, 'condominio_assembleias', a));
    PERFORM pg_temp.confere(v LIKE trava, 'ENCERRADA: não se exclui (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT ata_documento_id FROM public.condominio_assembleias WHERE id = a) = doc
                        AND (SELECT observacao_geral FROM public.condominio_assembleias WHERE id = a) IS NULL,
        'ENCERRADA: ficou só a ata gravada');

    -- ── CANCELADA não muda nada ──────────────────────────────────────────────
    v := pg_temp.pg(false, format(nova, '', e, org_b, 'AGO', 'Para cancelar', ''));
    a_canc := substr(v, 4)::uuid;
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (SELECT organization_id FROM public.condominio_assembleias WHERE id = a_canc) = org_b,
        'postgres cria rascunho (org pelo gatilho) (veio ' || v || ')');
    v := pg_temp.pg(true, format(upd, 'condominio_assembleias', 'status = ''CONVOCADA'', convocada_em = now()', a_canc));
    PERFORM pg_temp.confere(v = 'ok:1', 'convoca a segunda (veio ' || v || ')');
    v := pg_temp.pg(true, format(upd, 'condominio_assembleias',
        'status = ''CANCELADA'', cancelada_em = now(), motivo_cancelamento = ''teste''', a_canc));
    PERFORM pg_temp.confere(v = 'ok:1', 'transição CONVOCADA → CANCELADA com a marca (veio ' || v || ')');
    v := pg_temp.pg(true, format(upd, 'condominio_assembleias', 'motivo_cancelamento = ''outro''', a_canc));
    PERFORM pg_temp.confere(v LIKE trava, 'CANCELADA não muda, nem com a marca (veio ' || v || ')');
    v := pg_temp.pg(true, format(upd, 'condominio_assembleias', format('ata_documento_id = %L', doc), a_canc));
    PERFORM pg_temp.confere(v LIKE trava, 'CANCELADA: nem a ata (veio ' || v || ')');
    v := pg_temp.pg(true, format(upd, 'condominio_assembleias', 'status = ''RASCUNHO''', a_canc));
    PERFORM pg_temp.confere(v LIKE trava, 'CANCELADA não volta a RASCUNHO (veio ' || v || ')');

    -- ── rascunho se exclui (com a pauta) ─────────────────────────────────────
    v := pg_temp.au(m, format(nova, '', e, org_b, 'AGO', 'Para excluir', ''));
    a_apagar := substr(v, 4)::uuid;
    v := pg_temp.au(m, format(item, a_apagar, 1, 'Item', 'APROVACAO', NULL, 'MAIORIA_PRESENTES'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'item no rascunho a excluir (veio ' || v || ')');
    v := pg_temp.au(m, format(del, 'condominio_assembleias', a_apagar));
    PERFORM pg_temp.confere(v = 'ok:1' AND NOT EXISTS (SELECT 1 FROM public.condominio_assembleia_itens WHERE assembleia_id = a_apagar),
        'rascunho editável por membro: exclui a assembleia e a pauta vai junto (veio ' || v || ')');

    -- ── privilégios ──────────────────────────────────────────────────────────
    FOREACH tab IN ARRAY seis LOOP
        PERFORM pg_temp.confere(NOT has_table_privilege('authenticated', 'public.' || tab, 'TRUNCATE')
                            AND NOT has_table_privilege('anon', 'public.' || tab, 'TRUNCATE')
                            AND NOT has_table_privilege('anon', 'public.' || tab, 'SELECT')
                            AND (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || tab)::regclass),
            tab || ': RLS ligada, sem TRUNCATE para a API, anon sem SELECT');
    END LOOP;
    FOREACH tab IN ARRAY ARRAY['condominio_assembleia_unidades', 'condominio_assembleia_votos',
                               'condominio_assembleia_votos_historico', 'condominio_assembleia_eventos'] LOOP
        PERFORM pg_temp.confere(NOT has_table_privilege('authenticated', 'public.' || tab, 'INSERT')
                            AND NOT has_table_privilege('authenticated', 'public.' || tab, 'UPDATE')
                            AND NOT has_table_privilege('authenticated', 'public.' || tab, 'DELETE')
                            AND has_table_privilege('authenticated', 'public.' || tab, 'SELECT'),
            tab || ': authenticated só lê');
    END LOOP;
    PERFORM pg_temp.confere(
        (SELECT bool_and(NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                     AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
                     AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                                      WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE')
                     AND p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig))
           FROM pg_proc p
          WHERE p.pronamespace = 'public'::regnamespace
            AND p.proname IN ('_assembleia_org_do_condominio', '_assembleia_trava', '_assembleia_votos_historico'))
        AND (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
                AND p.proname IN ('_assembleia_org_do_condominio', '_assembleia_trava', '_assembleia_votos_historico')) = 3,
        'funções de gatilho: SECURITY DEFINER, search_path fixo, fora de PUBLIC/anon/authenticated');
    PERFORM pg_temp.confere(
        (SELECT count(DISTINCT c.relname) FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
          WHERE tg.tgname = 'trg_condominio_assembleia_trava' AND NOT tg.tgisinternal
            AND c.relname IN ('condominio_assembleias', 'condominio_assembleia_itens',
                              'condominio_assembleia_unidades', 'condominio_assembleia_votos')) = 4,
        'trg_condominio_assembleia_trava nas 4 tabelas');
END $$;

ROLLBACK;

SELECT 'TUDO OK' AS resultado;
