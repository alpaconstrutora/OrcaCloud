-- scripts/teste-condominio-assembleias-sindico.sql
-- Prova da Tarefa B1 (assembleias de condomínio, fase B): a porta do SÍNDICO.
-- Migration: supabase/migrations/aplicar_20271126860000_condominio_assembleias_sindico.sql
-- Depende de (já aplicadas em produção): aplicar_20271125860000 / 860100 / 860200 (fase A).
-- Plano:     docs/planos/2026-11-25-condominio-assembleias-votacoes.md ("Fase B", Task B1).
--
-- O que se prova (nomes dos casos do brief entre aspas no FALHOU):
--   • "síndico logado convoca e encerra" — rascunho, pauta, convocar, presença, instalar,
--     voto presencial e encerrar pela porta do síndico (sindico_portal_assembleia_*);
--     a ata sai com o NOME do síndico (o ator é o client_id dele);
--   • "síndico só por link (sem sessão) recusado" — anon nem executa; com o link e a sessão
--     de OUTRA pessoa: 42501 / sindico_sem_sessao; link + a sessão dele: vale;
--   • "mandato vencido recusado" (42501 / sindico_sem_acesso);
--   • "síndico de outro prédio recusado" (42501 / sindico_fora_do_mandato) em TODAS as
--     portas; anon recusado em todas; assembleia inexistente não se revela;
--   • "evento registra papel SINDICO" (CONVOCADA, PRESENCA, IMPEDIMENTO_MANUAL, INSTALADA,
--     VOTO_LANCADO, ENCERRADA, ATA_VINCULADA, CANCELADA) — e GESTOR no que o gestor fez;
--   • "gestor e síndico na mesma assembleia: segundo Encerrar recebe assembleia_travada"
--     (o núcleo recusa com estado/assembleia_travada e "já foi encerrada");
--   • leituras de fora de `ops` (A7): unidades_fora, leituras do aviso, impedimentos;
--     A10: marcar_impedida e cotas_conferidas como síndico;
--   • rascunho/pauta: só as 7 colunas, org do condomínio; pauta reescrita numa transação
--     só (item recusado não apaga a anterior); fora de RASCUNHO a trava recusa;
--   • autorizar_documento (Edge Function): { ok, org = fn_org_do_condominio };
--   • privilégios: auxiliares fora da API; portas só authenticated, DEFINER, search_path.
--
-- Personagens (contas reais, só leitura de auth.users/organization_members):
--   m — membro da org B (a que opera o condomínio): o gestor;
--   s — NÃO é membro da org B; o e-mail dele vai no cliente c_s, síndico do condomínio e;
--   n — NÃO é membro da org B; o e-mail dele vai no cliente c_n, síndico de OUTRO condomínio (e2).
-- Fixtures criados aqui dentro.
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …';
-- sucesso = a linha final 'TUDO OK'. Sem a B1, falha na primeira chamada de função nova.
--
-- Ensaio (a migration ainda não aplicada; o montador tira o BEGIN;/COMMIT; dela):
--   bash scripts/montar-ensaio.sh -o /tmp/e.sql scripts/teste-condominio-assembleias-sindico.sql \
--        supabase/migrations/aplicar_20271126860000_condominio_assembleias_sindico.sql
--   npx supabase db query --linked -f /tmp/e.sql
-- Depois de aplicada:
--   npx supabase db query --linked -f scripts/teste-condominio-assembleias-sindico.sql

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

-- Resultado jsonb de uma chamada que TEM de dar certo.
CREATE FUNCTION pg_temp.ok(p_user UUID, p_sql TEXT, p_caso TEXT) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
    v := pg_temp.au(p_user, p_sql);
    IF v NOT LIKE 'ok:%' THEN RAISE EXCEPTION 'FALHOU: % (veio %)', p_caso, v; END IF;
    RETURN substr(v, 4)::jsonb;
END $$;

-- Deslocar as datas da convocação (só com a marca, como a trava exige).
CREATE FUNCTION pg_temp.desloca(p_a UUID, p_primeira TIMESTAMPTZ, p_segunda TIMESTAMPTZ) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('app.assembleia_transicao', 'on', true);
    UPDATE public.condominio_assembleias
       SET primeira_convocacao_em = p_primeira, segunda_convocacao_em = p_segunda
     WHERE id = p_a;
    PERFORM set_config('app.assembleia_transicao', '', true);
END $$;

-- Há evento p_evento da assembleia com esse papel e esse ator? (Na mesma transação todos
-- os eventos têm o mesmo `em` = now(): "o último" não se distingue — por isso EXISTS.)
CREATE FUNCTION pg_temp.evento(p_a UUID, p_evento TEXT, p_papel TEXT, p_ator UUID) RETURNS BOOLEAN LANGUAGE sql AS $$
    SELECT EXISTS (SELECT 1 FROM public.condominio_assembleia_eventos ev
                    WHERE ev.assembleia_id = p_a AND ev.evento = p_evento
                      AND ev.papel = p_papel AND ev.ator IS NOT DISTINCT FROM p_ator)
$$;

DO $$
DECLARE
    org_a UUID; org_b UUID; m UUID; s UUID; n UUID;
    email_s TEXT; email_n TEXT;
    e UUID; e2 UUID; t UUID; t2 UUID; u1 UUID; u2 UUID; u3 UUID; ux UUID;
    c_s UUID; c_n UUID; c_o1 UUID; c_o2 UUID; occ1 UUID; acc1 UUID;
    doc_ata UUID; doc_proc UUID; doc_outro UUID;
    a UUID; b UUID; rasc UUID; a2 UUID; i1 UUID; i2 UUID; i1b UUID;
    tok TEXT;
    v TEXT; j JSONB; ap JSONB; ret JSONB; f TEXT;
    hoje DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    p1 CONSTANT TEXT := '2030-03-10 19:00:00-03:00';
    p2 CONSTANT TEXT := '2030-03-10 19:30:00-03:00';
    -- sindico_portal_assembleia_salvar_rascunho(token, client, assembleia, empreendimento, tipo,
    --   titulo, local, link, 1ª, 2ª)
    rascunho CONSTANT TEXT := 'SELECT public.sindico_portal_assembleia_salvar_rascunho(%L, %L, %L, %L, %L, %L, %L, %L, %L::timestamptz, %L::timestamptz)::text';
    itens CONSTANT TEXT := 'SELECT public.sindico_portal_assembleia_salvar_itens(%L, %L, %L, %L::jsonb)::text';
BEGIN
    -- ═══ personagens ════════════════════════════════════════════════════════
    SELECT om.organization_id, om.user_id INTO org_b, m
      FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
     WHERE om.organization_id IS NOT NULL AND nullif(btrim(au.email), '') IS NOT NULL
     ORDER BY om.organization_id, om.user_id LIMIT 1;
    SELECT o.id INTO org_a FROM public.organizations o WHERE o.id <> org_b ORDER BY o.id LIMIT 1;
    SELECT au.id, au.email INTO s, email_s FROM auth.users au
     WHERE nullif(btrim(au.email), '') IS NOT NULL
       AND lower(au.email) <> (SELECT lower(x.email) FROM auth.users x WHERE x.id = m)
       AND NOT EXISTS (SELECT 1 FROM public.organization_members om
                        WHERE om.organization_id = org_b
                          AND (om.user_id = au.id OR lower(om.email) = lower(au.email)))
     ORDER BY au.id LIMIT 1;
    SELECT au.id, au.email INTO n, email_n FROM auth.users au
     WHERE nullif(btrim(au.email), '') IS NOT NULL AND au.id <> s
       AND lower(au.email) NOT IN (lower(email_s), (SELECT lower(x.email) FROM auth.users x WHERE x.id = m))
       AND NOT EXISTS (SELECT 1 FROM public.organization_members om
                        WHERE om.organization_id = org_b
                          AND (om.user_id = au.id OR lower(om.email) = lower(au.email)))
     ORDER BY au.id LIMIT 1;
    PERFORM pg_temp.confere(org_b IS NOT NULL AND org_a IS NOT NULL AND m IS NOT NULL AND s IS NOT NULL AND n IS NOT NULL,
        'fixture: orgs A e B, membro m da B, não-membros s e n');

    -- ═══ condomínios: e (síndico c_s) e e2 (síndico c_n), org A operados pela B ═════
    INSERT INTO public.clients (name, organization_id, email) VALUES ('Sara Síndica', org_b, email_s) RETURNING id INTO c_s;
    INSERT INTO public.clients (name, organization_id, email) VALUES ('Nico Síndico de Outro', org_b, email_n) RETURNING id INTO c_n;
    INSERT INTO public.clients (name, organization_id) VALUES ('Olga Dona 101', org_b) RETURNING id INTO c_o1;
    INSERT INTO public.clients (name, organization_id) VALUES ('Omar Dono 102', org_b) RETURNING id INTO c_o2;

    INSERT INTO public.empreendimentos (organization_id, condominio_org_id, name, status,
                                        sindico_client_id, sindico_mandato_inicio, sindico_mandato_fim)
    VALUES (org_a, org_b, 'Teste assembleias B1 (ROLLBACK)', 'EM_OPERACAO', c_s, hoje - 30, hoje + 365)
    RETURNING id INTO e;
    INSERT INTO public.empreendimentos (organization_id, condominio_org_id, name, status,
                                        sindico_client_id, sindico_mandato_inicio, sindico_mandato_fim)
    VALUES (org_a, org_b, 'Outro condomínio B1 (ROLLBACK)', 'EM_OPERACAO', c_n, hoje - 30, NULL)
    RETURNING id INTO e2;

    INSERT INTO public.empreendimento_towers (empreendimento_id, name) VALUES (e, 'Torre T') RETURNING id INTO t;
    INSERT INTO public.empreendimento_units (tower_id, name, fracao_ideal_decimal) VALUES (t, '101', 0.5) RETURNING id INTO u1;
    INSERT INTO public.empreendimento_units (tower_id, name, fracao_ideal_decimal) VALUES (t, '102', 0.5) RETURNING id INTO u2;
    INSERT INTO public.empreendimento_units (tower_id, name) VALUES (t, 'Garagem') RETURNING id INTO u3;
    INSERT INTO public.empreendimento_towers (empreendimento_id, name) VALUES (e2, 'Torre X') RETURNING id INTO t2;
    INSERT INTO public.empreendimento_units (tower_id, name, fracao_ideal_decimal) VALUES (t2, '1', 1) RETURNING id INTO ux;

    INSERT INTO public.unit_occupancies (unit_id, client_id, organization_id, role, started_at, ended_at)
    VALUES (u1, c_o1, org_b, 'PROPRIETARIO', DATE '2020-01-01', NULL) RETURNING id INTO occ1;
    INSERT INTO public.unit_occupancies (unit_id, client_id, organization_id, role, started_at, ended_at)
    VALUES (u2, c_o2, org_b, 'PROPRIETARIO', DATE '2020-01-01', NULL);

    INSERT INTO public.condominio_documentos (empreendimento_id, organization_id, titulo, categoria, url)
    VALUES (e, org_b, 'Ata teste B1', 'ATA', 'https://exemplo.invalid/ata.pdf') RETURNING id INTO doc_ata;
    INSERT INTO public.condominio_documentos (empreendimento_id, organization_id, titulo, categoria, url, visivel_portal)
    VALUES (e, org_b, 'Procuração teste B1', 'OUTRO', 'https://exemplo.invalid/proc.pdf', false) RETURNING id INTO doc_proc;
    INSERT INTO public.condominio_documentos (empreendimento_id, organization_id, titulo, categoria, url)
    VALUES (e2, org_b, 'Ata de outro condomínio', 'ATA', 'https://exemplo.invalid/x.pdf') RETURNING id INTO doc_outro;

    -- Link do Portal do Síndico de c_s.
    INSERT INTO public.sindico_portal_tokens (org_id, client_id, token)
    VALUES (org_b, c_s, 'teste-b1-' || gen_random_uuid()::text) RETURNING token INTO tok;

    -- ═══ "síndico logado convoca e encerra": rascunho ═══════════════════════
    j := pg_temp.ok(s, format(rascunho, NULL, c_s, NULL, e, 'AGE', '  Assembleia B1  ', ' Salão ', '', p1, p2),
        'síndico logado cria o rascunho');
    a := (j ->> 'id')::uuid;
    PERFORM pg_temp.confere(j ->> 'status' = 'RASCUNHO' AND j ->> 'titulo' = 'Assembleia B1' AND j ->> 'local' = 'Salão'
                        AND j -> 'link_transmissao' = 'null'::jsonb AND (j ->> 'organization_id')::uuid = org_b
                        AND (j ->> 'created_by')::uuid = s AND (j ->> 'empreendimento_id')::uuid = e,
        'rascunho do síndico: só as 7 colunas, org do condomínio (B), created_by = a sessão (veio ' || j::text || ')');

    -- Editar o rascunho (mesma função com o id).
    j := pg_temp.ok(s, format(rascunho, NULL, c_s, a, e, 'AGO', 'Assembleia B1', 'Salão de festas', 'https://exemplo.invalid/sala', p1, p2),
        'síndico edita o rascunho');
    PERFORM pg_temp.confere(j ->> 'tipo' = 'AGO' AND j ->> 'local' = 'Salão de festas' AND (j ->> 'id')::uuid = a,
        'edição do rascunho grava (veio ' || j::text || ')');

    -- Pauta: dois itens; reescrita mantém o id do item com id.
    j := pg_temp.ok(s, format(itens, NULL, c_s, a,
            '[{"titulo":" Aprovar contas ","descricao":"Contas de 2029","tipo":"APROVACAO","quorum":"MAIORIA_PRESENTES","assunto":"APROVAR_CONTAS"},'
         || '{"titulo":"Eleger síndico","tipo":"ESCOLHA","opcoes":[" Ana ","Bia"],"quorum":"MAIORIA_PRESENTES"}]'),
        'síndico grava a pauta');
    PERFORM pg_temp.confere(jsonb_array_length(j) = 2 AND j -> 0 ->> 'titulo' = 'Aprovar contas' AND (j -> 0 ->> 'ordem')::int = 1
                        AND j -> 0 -> 'opcoes' = 'null'::jsonb AND j -> 1 -> 'opcoes' = '["Ana", "Bia"]'::jsonb
                        AND (j -> 1 ->> 'ordem')::int = 2 AND j -> 0 ->> 'assunto' = 'APROVAR_CONTAS',
        'pauta: ordem 1..n, títulos e opções aparados, APROVACAO sem opções (veio ' || j::text || ')');
    i1 := (j -> 0 ->> 'id')::uuid; i2 := (j -> 1 ->> 'id')::uuid;

    j := pg_temp.ok(s, format(itens, NULL, c_s, a,
            format('[{"id":"%s","titulo":"Eleger síndico","tipo":"ESCOLHA","opcoes":["Ana","Bia"]},'
                || '{"id":"%s","titulo":"Aprovar contas","tipo":"APROVACAO","quorum":"MAIORIA_PRESENTES"}]', i2, i1)),
        'síndico reordena a pauta');
    PERFORM pg_temp.confere(jsonb_array_length(j) = 2 AND (j -> 0 ->> 'id')::uuid = i2 AND (j -> 1 ->> 'id')::uuid = i1
                        AND (j -> 1 ->> 'ordem')::int = 2,
        'pauta reescrita: mantém o id e troca a ordem (veio ' || j::text || ')');

    -- Item recusado (ESCOLHA com 1 opção) não apaga a pauta anterior: uma transação só.
    v := pg_temp.au(s, format(itens, NULL, c_s, a, '[{"titulo":"X","tipo":"APROVACAO"},{"titulo":"Y","tipo":"ESCOLHA","opcoes":["Só uma"]}]'));
    PERFORM pg_temp.confere(v LIKE '23514|%condominio_assembleia_itens_tipo_opcoes%',
        'item de escolha com 1 opção recusado pelo CHECK (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT count(*) FROM public.condominio_assembleia_itens WHERE assembleia_id = a) = 2
                        AND EXISTS (SELECT 1 FROM public.condominio_assembleia_itens WHERE id = i1),
        'pauta recusada deixa a anterior como estava');
    v := pg_temp.au(s, format(itens, NULL, c_s, a, '{"titulo":"não é lista"}'));
    PERFORM pg_temp.confere(v LIKE 'P0001|itens_invalidos|%', 'pauta que não é lista: itens_invalidos (veio ' || v || ')');

    -- ═══ "síndico só por link (sem sessão) recusado" ═══════════════════════
    f := format('SELECT public.sindico_portal_assembleia_convocar(%L, NULL, %L, %L)::text', tok, a, 'Edital');
    v := pg_temp.como(NULL, 'anon', f);
    PERFORM pg_temp.confere(v LIKE '42501|%', 'síndico só por link (sem sessão) recusado: anon nem executa (veio ' || v || ')');
    v := pg_temp.au(m, f);
    PERFORM pg_temp.confere(v LIKE '42501|sindico_sem_sessao|%' AND v LIKE '%entre no Portal do Síndico%',
        'síndico só por link (sem sessão) recusado: link com a sessão de outra pessoa (veio ' || v || ')');
    v := pg_temp.au(n, format('SELECT public.sindico_portal_assembleia_carregar(NULL, %L, %L)::text', c_s, a));
    -- n não é dono do cadastro nem membro da org: nem a leitura passaria.
    PERFORM pg_temp.confere(v LIKE '42501|sindico_sem_acesso|%',
        'outro usuário não se passa pelo síndico com o client_id dele (veio ' || v || ')');
    -- Link + a sessão do próprio síndico (entrou pelo link e fez login): vale.
    j := pg_temp.ok(s, format('SELECT public.sindico_portal_assembleia_unidades_fora(%L, NULL, %L)::text', tok, a),
        'link + sessão do próprio síndico vale');
    PERFORM pg_temp.confere(j = '["Torre T — Garagem"]'::jsonb,
        'unidades_fora: a unidade sem fração, com o rótulo do Convocar (veio ' || j::text || ')');

    -- ═══ "mandato vencido recusado" ═══════════════════════════════════════
    UPDATE public.empreendimentos SET sindico_mandato_fim = hoje - 1 WHERE id = e;
    v := pg_temp.au(s, format('SELECT public.sindico_portal_assembleia_convocar(NULL, %L, %L, %L)::text', c_s, a, 'Edital'));
    PERFORM pg_temp.confere(v LIKE '42501|sindico_sem_acesso|%' AND v LIKE '%mandato%',
        'mandato vencido recusado (veio ' || v || ')');
    -- Com mandato vigente em OUTRO condomínio, o vencido continua fora.
    UPDATE public.empreendimentos SET sindico_client_id = c_s WHERE id = e2;
    v := pg_temp.au(s, format('SELECT public.sindico_portal_assembleia_listar(NULL, %L, %L)::text', c_s, e));
    PERFORM pg_temp.confere(v LIKE '42501|sindico_fora_do_mandato|%',
        'mandato vencido recusado mesmo com mandato vigente em outro prédio (veio ' || v || ')');
    UPDATE public.empreendimentos SET sindico_client_id = c_n WHERE id = e2;
    UPDATE public.empreendimentos SET sindico_mandato_fim = hoje + 365 WHERE id = e;

    -- ═══ "síndico de outro prédio recusado" ═══════════════════════════════
    v := pg_temp.au(n, format('SELECT public.sindico_portal_assembleia_convocar(NULL, %L, %L, %L)::text', c_n, a, 'Edital'));
    PERFORM pg_temp.confere(v LIKE '42501|sindico_fora_do_mandato|%', 'síndico de outro prédio recusado (veio ' || v || ')');
    v := pg_temp.au(s, format(rascunho, NULL, c_s, NULL, e2, 'AGE', 'Invasão', NULL, NULL, p1, p2));
    PERFORM pg_temp.confere(v LIKE '42501|sindico_fora_do_mandato|%', 'síndico não cria rascunho em outro prédio (veio ' || v || ')');
    v := pg_temp.au(s, format(rascunho, NULL, c_s, a, e2, 'AGE', 'Mudar de prédio', NULL, NULL, p1, p2));
    PERFORM pg_temp.confere(v LIKE '42501|sindico_fora_do_mandato|%', 'síndico não muda o rascunho para outro prédio (veio ' || v || ')');
    v := pg_temp.au(s, format('SELECT public.sindico_portal_assembleia_carregar(NULL, %L, %L)::text', c_s, gen_random_uuid()));
    PERFORM pg_temp.confere(v LIKE '42501|sindico_fora_do_mandato|%', 'assembleia inexistente: 42501, não diz se existe (veio ' || v || ')');
    -- A porta do gestor continua fechada para o síndico (não é membro da org).
    v := pg_temp.au(s, format('SELECT public.condominio_assembleia_convocar(%L, %L)::text', a, 'Edital'));
    PERFORM pg_temp.confere(v LIKE '42501|%', 'síndico não usa a porta do gestor (veio ' || v || ')');

    -- ═══ convocar (síndico) ════════════════════════════════════════════════
    PERFORM pg_temp.confere(pg_temp.ok(s, format('SELECT public.sindico_portal_assembleia_leituras(NULL, %L, %L)::text', c_s, a),
                                       'leituras antes de convocar') = '0'::jsonb,
        'leituras: 0 antes de convocar (sem aviso)');
    PERFORM pg_temp.confere(pg_temp.ok(s, format('SELECT public.sindico_portal_assembleia_cotas_conferidas(NULL, %L, %L)::text', c_s, a),
                                       'cotas_conferidas') = 'false'::jsonb,
        'cotas_conferidas como síndico: false (nenhuma cota cobrada pelo app)');
    j := pg_temp.ok(s, format('SELECT public.sindico_portal_assembleia_convocar(NULL, %L, %L, %L)::text', c_s, a, 'Edital de convocação B1'),
        'síndico logado convoca e encerra: convocar');
    PERFORM pg_temp.confere((j ->> 'unidades')::int = 2 AND j -> 'fora' = '["Torre T — Garagem"]'::jsonb,
        'convocar: 2 unidades com fração, Garagem fora (veio ' || j::text || ')');
    PERFORM pg_temp.confere(pg_temp.evento(a, 'CONVOCADA', 'SINDICO', c_s),
        'evento registra papel SINDICO: CONVOCADA, ator = client do síndico');
    PERFORM pg_temp.confere((SELECT av.publicado_por FROM public.condominio_avisos av WHERE av.id = (j ->> 'avisoId')::uuid) = 'Síndico',
        'aviso da convocação publicado pelo Síndico');

    -- Fora de RASCUNHO: pauta, rascunho e exclusão recusados pela trava.
    v := pg_temp.au(s, format(itens, NULL, c_s, a, '[{"titulo":"X","tipo":"APROVACAO"}]'));
    PERFORM pg_temp.confere(v LIKE '23514|assembleia_travada|%pauta não muda%', 'convocada: pauta não muda (veio ' || v || ')');
    v := pg_temp.au(s, format(rascunho, NULL, c_s, a, e, 'AGO', 'Outro título', NULL, NULL, p1, p2));
    PERFORM pg_temp.confere(v LIKE '23514|assembleia_travada|%', 'convocada: dados do edital não mudam (veio ' || v || ')');
    v := pg_temp.au(s, format('SELECT public.sindico_portal_assembleia_excluir_rascunho(NULL, %L, %L)::text', c_s, a));
    PERFORM pg_temp.confere(v LIKE '23514|assembleia_travada|%', 'convocada não se exclui (veio ' || v || ')');

    -- Leituras do aviso.
    INSERT INTO public.condominio_aviso_leituras (aviso_id, client_id) VALUES ((j ->> 'avisoId')::uuid, c_o1);
    PERFORM pg_temp.confere(pg_temp.ok(s, format('SELECT public.sindico_portal_assembleia_leituras(NULL, %L, %L)::text', c_s, a),
                                       'leituras depois de convocar') = '1'::jsonb,
        'leituras: conta as confirmações do aviso da convocação');

    -- ═══ A10 como síndico: marcar/desmarcar impedida ═════════════════════════
    j := pg_temp.ok(s, format('SELECT public.sindico_portal_assembleia_marcar_impedida(NULL, %L, %L, %L, %L)::text',
                              c_s, a, u2, 'Inadimplente segundo a administradora.'), 'síndico marca impedida');
    PERFORM pg_temp.confere(j ->> 'motivo' = 'Inadimplente segundo a administradora', 'marcar_impedida: motivo sem ponto final');
    PERFORM pg_temp.confere(pg_temp.evento(a, 'IMPEDIMENTO_MANUAL', 'SINDICO', c_s), 'evento registra papel SINDICO: IMPEDIMENTO_MANUAL');
    j := pg_temp.ok(s, format('SELECT public.sindico_portal_assembleia_impedimentos(NULL, %L, %L)::text', c_s, a), 'impedimentos');
    PERFORM pg_temp.confere(jsonb_array_length(j) = 1 AND (j -> 0 ->> 'unitId')::uuid = u2 AND j -> 0 ->> 'origem' = 'MANUAL'
                        AND j -> 0 ->> 'motivo' = 'Inadimplente segundo a administradora',
        'impedimentos como síndico: a marcada, com motivo e origem MANUAL (veio ' || j::text || ')');
    v := pg_temp.au(s, format('SELECT public.sindico_portal_assembleia_registrar_presenca(NULL, %L, %L, %L, %L, NULL, NULL)::text',
                              c_s, a, u2, 'PRESENCIAL'));
    PERFORM pg_temp.confere(v LIKE 'P0001|unidade_impedida|%', 'impedida não registra presença (núcleo) (veio ' || v || ')');
    PERFORM pg_temp.ok(s, format('SELECT public.sindico_portal_assembleia_marcar_impedida(NULL, %L, %L, %L, NULL)::text', c_s, a, u2),
        'síndico desmarca');
    PERFORM pg_temp.confere(pg_temp.ok(s, format('SELECT public.sindico_portal_assembleia_impedimentos(NULL, %L, %L)::text', c_s, a),
                                       'impedimentos depois de desmarcar') = '[]'::jsonb,
        'desmarcada some dos impedimentos');

    -- ═══ presença (síndico e gestor na mesma assembleia) ══════════════════════
    j := pg_temp.ok(s, format('SELECT public.sindico_portal_assembleia_registrar_presenca(NULL, %L, %L, %L, %L, %L, %L)::text',
                              c_s, a, u1, 'PROCURADOR', 'Paulo Procurador', doc_proc), 'síndico registra presença por procurador');
    PERFORM pg_temp.confere(j ->> 'presenca' = 'PROCURADOR' AND (j ->> 'procuracaoDocumentoId')::uuid = doc_proc,
        'presença por procurador com a procuração do condomínio (veio ' || j::text || ')');
    PERFORM pg_temp.confere(pg_temp.evento(a, 'PRESENCA', 'SINDICO', c_s), 'evento registra papel SINDICO: PRESENCA');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_registrar_presenca(%L, %L, %L, NULL, NULL)::text', a, u2, 'PRESENCIAL'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'gestor registra presença na mesma assembleia (veio ' || v || ')');
    PERFORM pg_temp.confere(pg_temp.evento(a, 'PRESENCA', 'GESTOR', m), 'evento do gestor continua GESTOR');

    -- ═══ instalar e votar (síndico) ═════════════════════════════════════════
    PERFORM pg_temp.desloca(a, now() - interval '40 minutes', now() - interval '10 minutes');
    j := pg_temp.ok(s, format('SELECT public.sindico_portal_assembleia_instalar(NULL, %L, %L, 2::smallint, %L, %L, true)::text',
                              c_s, a, 'Maria Presidente', 'João Secretário'), 'síndico instala');
    PERFORM pg_temp.confere((j ->> 'convocacao')::int = 2 AND (j ->> 'presentesUnidades')::int = 2,
        'instalar: 2ª convocação, 2 presentes (veio ' || j::text || ')');
    PERFORM pg_temp.confere(pg_temp.evento(a, 'INSTALADA', 'SINDICO', c_s), 'evento registra papel SINDICO: INSTALADA');

    j := pg_temp.ok(s, format('SELECT public.sindico_portal_assembleia_lancar_voto(NULL, %L, %L, %L, %L)::text', c_s, i1, u1, 'SIM'),
        'síndico lança voto presencial');
    PERFORM pg_temp.confere(j ->> 'origem' = 'PRESENCIAL' AND j ->> 'opcao' = 'SIM', 'voto lançado (veio ' || j::text || ')');
    PERFORM pg_temp.confere(pg_temp.evento(a, 'VOTO_LANCADO', 'SINDICO', c_s), 'evento registra papel SINDICO: VOTO_LANCADO');
    PERFORM pg_temp.confere((SELECT v2.lancado_por FROM public.condominio_assembleia_votos v2 WHERE v2.item_id = i1 AND v2.unit_id = u1) = c_s,
        'voto presencial: lancado_por = client do síndico');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_lancar_voto(%L, %L, %L)::text', i2, u2, 'Bia'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'gestor lança voto na mesma assembleia (veio ' || v || ')');
    v := pg_temp.au(s, format('SELECT public.sindico_portal_assembleia_lancar_voto(NULL, %L, %L, %L, %L)::text', c_s, i1, u2, 'TALVEZ'));
    PERFORM pg_temp.confere(v LIKE 'P0001|opcao_invalida|%', 'opção inválida: regra do núcleo vale para o síndico (veio ' || v || ')');

    ap := pg_temp.ok(s, format('SELECT public.sindico_portal_assembleia_apuracao(NULL, %L, %L)::text', c_s, a), 'apuração');
    PERFORM pg_temp.confere(ap = public.fn_assembleia_apurar(a), 'apuração do síndico = fn_assembleia_apurar');

    j := pg_temp.ok(s, format('SELECT public.sindico_portal_assembleia_carregar(NULL, %L, %L)::text', c_s, a), 'carregar');
    PERFORM pg_temp.confere(j -> 'assembleia' ->> 'status' = 'INSTALADA' AND jsonb_array_length(j -> 'itens') = 2
                        AND jsonb_array_length(j -> 'unidades') = 2 AND jsonb_array_length(j -> 'votos') = 2
                        AND (j -> 'itens' -> 0 ->> 'ordem')::int = 1 AND j -> 'unidades' -> 0 ? 'impedimento_manual'
                        AND j -> 'assembleia' ? 'quorum_instalacao',
        'carregar: assembleia, itens em ordem, unidades e votos (linhas cruas) (veio ' || j::text || ')');
    j := pg_temp.ok(s, format('SELECT public.sindico_portal_assembleia_listar(NULL, %L, %L)::text', c_s, e), 'listar');
    PERFORM pg_temp.confere(jsonb_array_length(j) = 1 AND (j -> 0 ->> 'id')::uuid = a AND j -> 0 ->> 'status' = 'INSTALADA',
        'listar: as assembleias do condomínio (veio ' || j::text || ')');

    -- ═══ encerrar: síndico primeiro, gestor depois ═══════════════════════════
    ret := pg_temp.ok(s, format('SELECT public.sindico_portal_assembleia_encerrar(NULL, %L, %L, %L::jsonb, %L)::text',
                                c_s, a, jsonb_build_object(i1::text, 'Contas aprovadas.'), 'Sem mais.'),
        'síndico logado convoca e encerra: encerrar');
    PERFORM pg_temp.confere(ret -> 'cabecalho' ->> 'encerradaPorPapel' = 'SINDICO'
                        AND (ret -> 'cabecalho' ->> 'encerradaPor')::uuid = c_s
                        AND ret -> 'cabecalho' -> 'instaladaPor' ->> 'nome' = 'Sara Síndica'
                        AND ret -> 'cabecalho' -> 'instaladaPor' ->> 'papel' = 'SINDICO'
                        AND ret -> 'cabecalho' -> 'editalConfirmadoPor' ->> 'nome' = 'Sara Síndica'
                        AND ret -> 'deliberacoes' ->> i1::text = 'Contas aprovadas.',
        'retrato: encerrado pelo síndico, a ata sai com o NOME dele (veio ' || (ret -> 'cabecalho')::text || ')');
    PERFORM pg_temp.confere(pg_temp.evento(a, 'ENCERRADA', 'SINDICO', c_s), 'evento registra papel SINDICO: ENCERRADA');
    PERFORM pg_temp.confere((SELECT status FROM public.condominio_assembleias WHERE id = a) = 'ENCERRADA', 'assembleia ENCERRADA');

    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_encerrar(%L, NULL, NULL)::text', a));
    PERFORM pg_temp.confere((v LIKE 'P0001|estado|%' OR v LIKE '23514|assembleia_travada|%') AND v LIKE '%já foi encerrada%',
        'gestor e síndico na mesma assembleia: segundo Encerrar recebe assembleia_travada (veio ' || v || ')');
    v := pg_temp.au(s, format('SELECT public.sindico_portal_assembleia_encerrar(NULL, %L, %L, NULL, NULL)::text', c_s, a));
    PERFORM pg_temp.confere((v LIKE 'P0001|estado|%' OR v LIKE '23514|assembleia_travada|%') AND v LIKE '%já foi encerrada%',
        'segundo Encerrar (síndico de novo) também recusado (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT count(*) FROM public.condominio_assembleia_eventos WHERE assembleia_id = a AND evento = 'ENCERRADA') = 1,
        'um só evento ENCERRADA');

    -- Ata: documento do condomínio (sim); de outro condomínio (não).
    v := pg_temp.au(s, format('SELECT public.sindico_portal_assembleia_vincular_ata(NULL, %L, %L, %L)::text', c_s, a, doc_outro));
    PERFORM pg_temp.confere(v LIKE 'P0001|documento_invalido|%', 'ata de outro condomínio recusada (veio ' || v || ')');
    j := pg_temp.ok(s, format('SELECT public.sindico_portal_assembleia_vincular_ata(NULL, %L, %L, %L)::text', c_s, a, doc_ata),
        'síndico vincula a ata');
    PERFORM pg_temp.confere((j ->> 'ataDocumentoId')::uuid = doc_ata, 'vincular_ata devolve o documento');
    PERFORM pg_temp.confere(pg_temp.evento(a, 'ATA_VINCULADA', 'SINDICO', c_s), 'evento registra papel SINDICO: ATA_VINCULADA');

    -- ═══ cancelar (síndico cancela a que o gestor convocou) ═══════════════════
    b := (pg_temp.ok(s, format(rascunho, NULL, c_s, NULL, e, 'AGE', 'Assembleia B1 cancelável', NULL, NULL, p1, p2),
                     'segundo rascunho') ->> 'id')::uuid;
    PERFORM pg_temp.ok(s, format(itens, NULL, c_s, b, '[{"titulo":"Item","tipo":"APROVACAO"}]'), 'pauta do segundo');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_convocar(%L, %L)::text', b, 'Edital'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'gestor convoca o rascunho que o síndico criou (veio ' || v || ')');
    PERFORM pg_temp.confere(pg_temp.evento(b, 'CONVOCADA', 'GESTOR', m), 'evento do gestor: CONVOCADA GESTOR');
    v := pg_temp.au(s, format('SELECT public.sindico_portal_assembleia_cancelar(NULL, %L, %L, %L, NULL)::text', c_s, b, ' '));
    PERFORM pg_temp.confere(v LIKE 'P0001|sem_motivo|%', 'cancelar sem motivo recusado (veio ' || v || ')');
    j := pg_temp.ok(s, format('SELECT public.sindico_portal_assembleia_cancelar(NULL, %L, %L, %L, NULL)::text', c_s, b, 'Data errada'),
        'síndico cancela');
    PERFORM pg_temp.confere(j ->> 'status' = 'CANCELADA', 'cancelada');
    PERFORM pg_temp.confere(pg_temp.evento(b, 'CANCELADA', 'SINDICO', c_s), 'evento registra papel SINDICO: CANCELADA');

    -- ═══ excluir rascunho ═══════════════════════════════════════════════════
    rasc := (pg_temp.ok(s, format(rascunho, NULL, c_s, NULL, e, 'AGO', 'Rascunho a excluir', NULL, NULL, NULL, NULL),
                        'rascunho sem datas') ->> 'id')::uuid;
    PERFORM pg_temp.ok(s, format(itens, NULL, c_s, rasc, '[{"titulo":"Item","tipo":"APROVACAO"}]'), 'pauta do rascunho');
    v := pg_temp.au(s, format('SELECT public.sindico_portal_assembleia_convocar(NULL, %L, %L, %L)::text', c_s, rasc, 'Edital'));
    PERFORM pg_temp.confere(v LIKE 'P0001|sem_datas|%', 'convocar sem datas: regra do núcleo (veio ' || v || ')');
    j := pg_temp.ok(s, format('SELECT public.sindico_portal_assembleia_excluir_rascunho(NULL, %L, %L)::text', c_s, rasc),
        'síndico exclui o rascunho');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM public.condominio_assembleias WHERE id = rasc)
                        AND NOT EXISTS (SELECT 1 FROM public.condominio_assembleia_itens WHERE assembleia_id = rasc),
        'rascunho excluído (com a pauta)');

    -- ═══ autorizar_documento (Edge Function sindico-portal-documentos) ═══════
    j := pg_temp.ok(s, format('SELECT public.sindico_portal_assembleia_autorizar_documento(NULL, %L, %L)::text', c_s, e),
        'autorizar documento');
    PERFORM pg_temp.confere(j ->> 'ok' = 'true' AND (j ->> 'org')::uuid = org_b AND (j ->> 'org')::uuid = public.fn_org_do_condominio(e),
        'autorizar_documento: ok e org = fn_org_do_condominio (veio ' || j::text || ')');
    j := pg_temp.ok(m, format('SELECT public.sindico_portal_assembleia_autorizar_documento(%L, NULL, %L)::text', tok, e),
        'autorizar documento com o link e outra sessão');
    PERFORM pg_temp.confere(j ->> 'ok' = 'false' AND j ->> 'hint' = 'sindico_sem_sessao' AND NOT j ? 'org',
        'autorizar_documento: só o link não autoriza (veio ' || j::text || ')');
    j := pg_temp.ok(s, format('SELECT public.sindico_portal_assembleia_autorizar_documento(NULL, %L, %L)::text', c_s, e2),
        'autorizar documento de outro prédio');
    PERFORM pg_temp.confere(j ->> 'ok' = 'false' AND j ->> 'hint' = 'sindico_fora_do_mandato' AND NOT j ? 'org',
        'autorizar_documento: outro prédio não autoriza (veio ' || j::text || ')');
    v := pg_temp.como(NULL, 'anon', format('SELECT public.sindico_portal_assembleia_autorizar_documento(%L, NULL, %L)::text', tok, e));
    PERFORM pg_temp.confere(v LIKE '42501|%', 'autorizar_documento: anon nem executa (veio ' || v || ')');

    -- ═══ todas as portas: outro prédio e anon recusados ══════════════════════
    a2 := (pg_temp.ok(s, format(rascunho, NULL, c_s, NULL, e, 'AGE', 'Para a varredura', NULL, NULL, p1, p2), 'rascunho da varredura') ->> 'id')::uuid;
    FOREACH f IN ARRAY ARRAY[
        format('SELECT public.sindico_portal_assembleia_listar(NULL, %L, %L)::text', c_n, e),
        format('SELECT public.sindico_portal_assembleia_carregar(NULL, %L, %L)::text', c_n, a2),
        format('SELECT public.sindico_portal_assembleia_unidades_fora(NULL, %L, %L)::text', c_n, a2),
        format('SELECT public.sindico_portal_assembleia_leituras(NULL, %L, %L)::text', c_n, a2),
        format('SELECT public.sindico_portal_assembleia_impedimentos(NULL, %L, %L)::text', c_n, a2),
        format('SELECT public.sindico_portal_assembleia_apuracao(NULL, %L, %L)::text', c_n, a2),
        format('SELECT public.sindico_portal_assembleia_cotas_conferidas(NULL, %L, %L)::text', c_n, a2),
        format(rascunho, NULL, c_n, a2, e, 'AGE', 'x', NULL, NULL, p1, p2),
        format(rascunho, NULL, c_n, NULL, e, 'AGE', 'x', NULL, NULL, p1, p2),
        format(itens, NULL, c_n, a2, '[]'),
        format('SELECT public.sindico_portal_assembleia_excluir_rascunho(NULL, %L, %L)::text', c_n, a2),
        format('SELECT public.sindico_portal_assembleia_convocar(NULL, %L, %L, %L)::text', c_n, a2, 'x'),
        format('SELECT public.sindico_portal_assembleia_cancelar(NULL, %L, %L, %L, NULL)::text', c_n, a, 'x'),
        format('SELECT public.sindico_portal_assembleia_registrar_presenca(NULL, %L, %L, %L, %L, NULL, NULL)::text', c_n, a, u1, 'PRESENCIAL'),
        format('SELECT public.sindico_portal_assembleia_instalar(NULL, %L, %L, 2::smallint, %L, %L, true)::text', c_n, a, 'P', 'S'),
        format('SELECT public.sindico_portal_assembleia_lancar_voto(NULL, %L, %L, %L, %L)::text', c_n, i1, u1, 'SIM'),
        format('SELECT public.sindico_portal_assembleia_encerrar(NULL, %L, %L, NULL, NULL)::text', c_n, a),
        format('SELECT public.sindico_portal_assembleia_vincular_ata(NULL, %L, %L, %L)::text', c_n, a, doc_ata),
        format('SELECT public.sindico_portal_assembleia_marcar_impedida(NULL, %L, %L, %L, %L)::text', c_n, a, u1, 'x')] LOOP
        v := pg_temp.au(n, f);
        PERFORM pg_temp.confere(v LIKE '42501|sindico_fora_do_mandato|%',
            'síndico de outro prédio recusado em todas as portas: ' || f || ' (veio ' || v || ')');
        v := pg_temp.como(NULL, 'anon', f);
        PERFORM pg_temp.confere(v LIKE '42501|%', 'anon não executa as portas: ' || f || ' (veio ' || v || ')');
    END LOOP;
    PERFORM pg_temp.confere(EXISTS (SELECT 1 FROM public.condominio_assembleias WHERE id = a2),
        'varredura não excluiu nada');

    -- ═══ privilégios ════════════════════════════════════════════════════════
    PERFORM pg_temp.confere(
        (SELECT bool_and(NOT has_function_privilege('anon', x.oid, 'EXECUTE')
                     AND NOT has_function_privilege('authenticated', x.oid, 'EXECUTE')
                     AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(pr.proacl, acldefault('f', pr.proowner))) y
                                      WHERE y.grantee = 0 AND y.privilege_type = 'EXECUTE')
                     AND pr.prosecdef AND 'search_path=public, pg_temp' = ANY (pr.proconfig))
               AND count(*) = 3
           FROM (VALUES ('public._assembleia_sindico_acesso(text, uuid, uuid)'::regprocedure),
                        ('public._assembleia_exige_sindico_do_predio(text, uuid, uuid)'::regprocedure),
                        ('public._assembleia_exige_sindico(text, uuid, uuid)'::regprocedure)) x(oid)
           JOIN pg_proc pr ON pr.oid = x.oid),
        'auxiliares do síndico: fora de PUBLIC/anon/authenticated, SECURITY DEFINER, search_path fixo');
    PERFORM pg_temp.confere(
        (SELECT bool_and(has_function_privilege('authenticated', pr.oid, 'EXECUTE')
                     AND NOT has_function_privilege('anon', pr.oid, 'EXECUTE')
                     AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(pr.proacl, acldefault('f', pr.proowner))) y
                                      WHERE y.grantee = 0 AND y.privilege_type = 'EXECUTE')
                     AND pr.prosecdef AND 'search_path=public, pg_temp' = ANY (pr.proconfig))
               AND count(*) = 19
           FROM pg_proc pr
          WHERE pr.pronamespace = 'public'::regnamespace AND pr.proname LIKE 'sindico\_portal\_assembleia\_%'),
        'as 19 portas do síndico: só authenticated (fora de PUBLIC/anon), SECURITY DEFINER, search_path fixo');
    -- O núcleo continua fora da API.
    v := pg_temp.au(s, format('SELECT public._assembleia_convocar(%L, %L, %L, %L)::text', a2, 'x', c_s, 'SINDICO'));
    PERFORM pg_temp.confere(v LIKE '42501|%', 'authenticated não executa o núcleo (veio ' || v || ')');
END $$;

ROLLBACK;

SELECT 'TUDO OK' AS resultado;
