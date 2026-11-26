-- scripts/teste-condominio-assembleias-conduzir.sql
-- Prova da Tarefa A2 (assembleias de condomínio): impedimento, apuração e as
-- transições conduzidas pelo gestor.
-- Migrations: supabase/migrations/aplicar_20271125860000_condominio_assembleias.sql (A1)
--             supabase/migrations/aplicar_20271125860100_condominio_assembleias_conduzir.sql (A2)
-- Plano:      docs/planos/2026-11-25-condominio-assembleias-votacoes.md (R1–R10, "Desenho", Task A2).
--
-- O que se prova (nomes dos casos do brief entre aspas no FALHOU):
--   • fn_assembleia_unidade_impedida: cota vencida e não paga impede; cancelada, paga,
--     vencendo hoje ou de rateio cancelado não impedem; o motivo é o da MAIS ANTIGA;
--   • convocar: 4 unidades com fração entram (fração e proprietários congelados), 1 sem
--     fração fica "fora"; aviso ASSEMBLEIA com valido_ate = dia da 2ª EM BRASÍLIA (2ª às
--     22:30-03:00, que em UTC já é o dia seguinte); sem item / 1ª no passado recusam;
--   • instalar: 1ª exige 50% das frações presentes e não impedidas (0,4 recusa, 0,5 aceita);
--     2ª só a partir do horário (1ª às "19:00", 2ª às "19:30", agora "19:10"); edital
--     confirmado obrigatório; quórum e impedidas gravados na instalação;
--   • presença: impedida não registra; procuração tem de ser do mesmo condomínio;
--     "pagou durante a reunião" → registra e vota, e o quórum gravado não muda;
--   • apuração de cada quórum (R8) com os números do brief, em numeric exato;
--   • lançar voto sobre voto PORTAL troca a origem (histórico com 2 linhas);
--   • encerrar grava deliberações e o retrato (= fn_assembleia_apurar no instante);
--     a 2ª chamada recebe "já foi encerrada"; vincular ata (só documento ATA do condomínio);
--   • cancelar publica 'Cancelada: …';
--   • invólucros: não-membro recebe 42501 em todos; anon/authenticated não executam
--     _assembleia_* nem fn_assembleia_*;
--   • A10 (impedimento marcado à mão): "marcar impedida bloqueia presença e voto"; "voto
--     dado antes de marcar continua valendo"; "desmarcar libera"; "motivo vazio recusado
--     (sem_motivo)"; "não-membro 42501"; "cotas_conferidas false sem título / true com
--     título" (título em rateio CANCELADO não conta); "instalar grava cotasConferidas e
--     origem" (MANUAL × AUTOMATICA em quorum_instalacao.impedidas);
--   • decisões da revisão da A1 (nesta migration):
--       1. assembleia: INSERT/UPDATE do app só nas 7 colunas do rascunho (retrato,
--          ata_documento_id, created_by… recusados com 42501);
--       2. ESCOLHA: opções sem repetição, sem vazia, sem NULL e sem 'ABSTENCAO';
--       3. excluir o aviso (ou a ata) de assembleia convocada: mensagem própria.
--
-- Personagens (contas reais, só leitura de auth.users/organization_members):
--   m — membro da org B (a que opera o condomínio);   n — não é membro da org B.
-- Fixtures (empreendimentos, torre, unidades, clientes, ocupações, rateios, títulos,
-- documentos) criados aqui dentro.
--
-- Hora: nada de relógio falso no código. As convocações nascem no futuro (2030, com
-- -03:00 explícito) e o teste desloca 1ª/2ª para perto de now() com a marca
-- app.assembleia_transicao ligada por ele mesmo.
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …';
-- sucesso = a linha final 'TUDO OK'. Sem a A2, falha na primeira chamada de função nova.
--
-- Ensaio (migrations ainda não aplicadas; o montador tira o BEGIN;/COMMIT; delas):
--   bash scripts/montar-ensaio.sh -o /tmp/e.sql scripts/teste-condominio-assembleias-conduzir.sql \
--        supabase/migrations/aplicar_20271125860000_condominio_assembleias.sql \
--        supabase/migrations/aplicar_20271125860100_condominio_assembleias_conduzir.sql
--   npx supabase db query --linked -f /tmp/e.sql
-- Depois de aplicadas:
--   npx supabase db query --linked -f scripts/teste-condominio-assembleias-conduzir.sql

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

-- Roda p_sql como p_papel (NULL = postgres, o papel das RPCs) com as claims de p_user.
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
CREATE FUNCTION pg_temp.pg(p_sql TEXT) RETURNS TEXT LANGUAGE sql AS $$
    SELECT pg_temp.como(NULL, NULL, p_sql)
$$;

-- O que só o teste faz: deslocar as datas da convocação (e só com a marca, como a trava exige).
CREATE FUNCTION pg_temp.desloca(p_a UUID, p_primeira TIMESTAMPTZ, p_segunda TIMESTAMPTZ) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('app.assembleia_transicao', 'on', true);
    UPDATE public.condominio_assembleias
       SET primeira_convocacao_em = p_primeira, segunda_convocacao_em = p_segunda
     WHERE id = p_a;
    PERFORM set_config('app.assembleia_transicao', '', true);
END $$;

-- Resultado / porOpcao de um item na apuração ao vivo (plpgsql: a função é da A2).
CREATE FUNCTION pg_temp.item_apurado(p_a UUID, p_item UUID) RETURNS JSONB LANGUAGE plpgsql AS $$
BEGIN
    RETURN (SELECT x FROM jsonb_array_elements(public.fn_assembleia_apurar(p_a) -> 'itens') x
             WHERE x ->> 'itemId' = p_item::text);
END $$;

CREATE FUNCTION pg_temp.res(p_a UUID, p_item UUID) RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
    RETURN pg_temp.item_apurado(p_a, p_item) ->> 'resultado';
END $$;

-- Gestor m lança o voto presencial; tem de passar.
CREATE FUNCTION pg_temp.vota(p_m UUID, p_item UUID, p_unit UUID, p_opcao TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
    v := pg_temp.au(p_m, format('SELECT public.condominio_assembleia_lancar_voto(%L, %L, %L)::text', p_item, p_unit, p_opcao));
    PERFORM pg_temp.confere(v LIKE 'ok:%', format('lançar voto %s em %s (veio %s)', p_opcao, p_item, v));
END $$;

-- Gestor m registra presença; devolve o resultado cru.
CREATE FUNCTION pg_temp.presenca(p_m UUID, p_a UUID, p_unit UUID, p_presenca TEXT,
                                 p_procurador TEXT DEFAULT NULL, p_procuracao UUID DEFAULT NULL) RETURNS TEXT LANGUAGE sql AS $$
    SELECT pg_temp.au(p_m, format('SELECT public.condominio_assembleia_registrar_presenca(%L, %L, %L, %L, %L)::text',
                                  p_a, p_unit, p_presenca, p_procurador, p_procuracao))
$$;

-- A10: p_user marca (motivo) ou desmarca (NULL) a unidade como impedida; devolve o resultado cru.
CREATE FUNCTION pg_temp.marcar(p_user UUID, p_a UUID, p_unit UUID, p_motivo TEXT) RETURNS TEXT LANGUAGE sql AS $$
    SELECT pg_temp.au(p_user, format('SELECT public.condominio_assembleia_marcar_impedida(%L, %L, %L)::text',
                                     p_a, p_unit, p_motivo))
$$;

DO $$
DECLARE
    org_a UUID; org_b UUID; m UUID; n UUID;
    e UUID; e2 UUID; t UUID; u1 UUID; u2 UUID; u3 UUID; u4 UUID; u5 UUID;
    c1 UUID; c1b UUID; c2 UUID; c3 UUID; c4 UUID; c_ex UUID; c_inq UUID;
    r1 UUID; r2 UUID; r3 UUID; r4 UUID;
    ea UUID; iE1 UUID; a_e2 UUID; tx_e2 UUID;
    e3 UUID; t3 UUID; u31 UUID; a3 UUID; i31 UUID;
    motivo_m CONSTANT TEXT := 'Acordo de parcelamento descumprido (débito de 03/2026)';
    tx1_velho UUID; tx1_novo UUID; tx2_canc UUID; tx2_rcanc UUID; tx3_pago UUID; tx4_hoje UUID;
    doc_proc UUID; doc_proc_outro UUID; doc_ata UUID; doc_ata_outro UUID; doc_outro UUID;
    a UUID; b UUID; c UUID; d UUID;
    iA1 UUID; iA2 UUID; iA3 UUID; iA4 UUID; iA5 UUID; iB1 UUID; iC1 UUID;
    v TEXT; j JSONB; q JSONB; ret JSONB; ap JSONB; f TEXT;
    hoje DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    venc_velho DATE; venc_novo DATE; comp_velha DATE; comp_nova DATE;
    motivo_u1 TEXT;
    nova CONSTANT TEXT := 'WITH x AS (INSERT INTO public.condominio_assembleias '
                       || '(empreendimento_id, tipo, titulo, local, primeira_convocacao_em, segunda_convocacao_em) '
                       || 'VALUES (%L, %L, %L, ''Salão de festas'', %L::timestamptz, %L::timestamptz) RETURNING id) SELECT id::text FROM x';
    item CONSTANT TEXT := 'WITH x AS (INSERT INTO public.condominio_assembleia_itens '
                       || '(assembleia_id, ordem, titulo, tipo, opcoes, quorum) VALUES (%L, %s, %L, %L, %L::text[], %L) '
                       || 'RETURNING id) SELECT id::text FROM x';
    upd  CONSTANT TEXT := 'WITH x AS (UPDATE public.condominio_assembleias SET %s WHERE id = %L RETURNING 1) SELECT count(*)::text FROM x';
    -- datas "de edital" (futuras), com fuso explícito
    p1 CONSTANT TEXT := '2030-03-10 19:00:00-03:00';
    p2 CONSTANT TEXT := '2030-03-10 22:30:00-03:00';   -- em UTC já é 11/03 01:30
    chk CONSTANT TEXT := '23514|||%check constraint%';
BEGIN
    -- ═══ fixtures ═══════════════════════════════════════════════════════════
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

    -- Condomínio da org A operado pela org B (fn_org_do_condominio = B).
    -- Razão social ≠ nome: o edital usa a razão social, e a ata tem de sair com o MESMO nome.
    INSERT INTO public.empreendimentos (organization_id, condominio_org_id, name, condominio_cnpj, condominio_razao_social)
    VALUES (org_a, org_b, 'Teste assembleias A2 (ROLLBACK)', '12.345.678/0001-90', 'Condomínio Residencial Teste A2')
    RETURNING id INTO e;
    INSERT INTO public.empreendimentos (organization_id, condominio_org_id, name)
    VALUES (org_a, org_b, 'Outro condomínio A2 (ROLLBACK)') RETURNING id INTO e2;
    INSERT INTO public.empreendimento_towers (empreendimento_id, name) VALUES (e, 'Torre T') RETURNING id INTO t;
    -- 4 unidades com fração 0,1 / 0,2 / 0,3 / 0,4 (total 1,0) e 1 sem fração.
    INSERT INTO public.empreendimento_units (tower_id, name, fracao_ideal_decimal) VALUES (t, '101', 0.1) RETURNING id INTO u1;
    INSERT INTO public.empreendimento_units (tower_id, name, fracao_ideal_decimal) VALUES (t, '102', 0.2) RETURNING id INTO u2;
    INSERT INTO public.empreendimento_units (tower_id, name, fracao_ideal_decimal) VALUES (t, '103', 0.3) RETURNING id INTO u3;
    INSERT INTO public.empreendimento_units (tower_id, name, fracao_ideal_decimal) VALUES (t, '104', 0.4) RETURNING id INTO u4;
    INSERT INTO public.empreendimento_units (tower_id, name) VALUES (t, 'Garagem') RETURNING id INTO u5;

    -- Proprietários: u1 tem dois vigentes, um antigo (encerrado) e um inquilino.
    INSERT INTO public.clients (name, organization_id) VALUES ('Bruno Teste', org_b) RETURNING id INTO c1b;
    INSERT INTO public.clients (name, organization_id) VALUES ('Ana Teste', org_b) RETURNING id INTO c1;
    INSERT INTO public.clients (name, organization_id) VALUES ('Carla Teste', org_b) RETURNING id INTO c2;
    INSERT INTO public.clients (name, organization_id) VALUES ('Davi Teste', org_b) RETURNING id INTO c3;
    INSERT INTO public.clients (name, organization_id) VALUES ('Eva Teste', org_b) RETURNING id INTO c4;
    INSERT INTO public.clients (name, organization_id) VALUES ('Ex-dono Teste', org_b) RETURNING id INTO c_ex;
    INSERT INTO public.clients (name, organization_id) VALUES ('Inquilino Teste', org_b) RETURNING id INTO c_inq;
    INSERT INTO public.unit_occupancies (unit_id, client_id, organization_id, role, started_at, ended_at) VALUES
        (u1, c1,    org_b, 'PROPRIETARIO', DATE '2020-01-01', NULL),
        (u1, c1b,   org_b, 'PROPRIETARIO', DATE '2021-01-01', NULL),
        (u1, c_ex,  org_b, 'PROPRIETARIO', DATE '2010-01-01', DATE '2019-12-31'),
        (u1, c_inq, org_b, 'INQUILINO',    DATE '2022-01-01', NULL),
        (u2, c2,    org_b, 'PROPRIETARIO', DATE '2020-01-01', NULL),
        (u3, c3,    org_b, 'PROPRIETARIO', DATE '2020-01-01', NULL),
        (u4, c4,    org_b, 'PROPRIETARIO', DATE '2020-01-01', NULL);

    -- Títulos de cota fabricados (o mesmo formato de condominioCobrancaService).
    venc_velho := hoje - 50;  comp_velha := date_trunc('month', venc_velho - 30)::date;
    venc_novo  := hoje - 20;  comp_nova  := date_trunc('month', venc_novo - 30)::date;
    INSERT INTO public.internal_transactions (organization_id, source_system, transaction_date, due_date, amount, direction, status, business_status, description)
    VALUES (org_b, 'CONDOMINIO_RATEIO', venc_velho, venc_velho, 100, 'CREDIT', 'PENDING', 'PREVISTO', 'Cota teste u1 velha') RETURNING id INTO tx1_velho;
    INSERT INTO public.internal_transactions (organization_id, source_system, transaction_date, due_date, amount, direction, status, business_status, description)
    VALUES (org_b, 'CONDOMINIO_RATEIO', venc_novo, venc_novo, 100, 'CREDIT', 'PENDING', 'PREVISTO', 'Cota teste u1 nova') RETURNING id INTO tx1_novo;
    INSERT INTO public.internal_transactions (organization_id, source_system, transaction_date, due_date, amount, direction, status, business_status, description)
    VALUES (org_b, 'CONDOMINIO_RATEIO', venc_velho, venc_velho, 100, 'CREDIT', 'CANCELLED', 'PREVISTO', 'Cota teste u2 cancelada') RETURNING id INTO tx2_canc;
    INSERT INTO public.internal_transactions (organization_id, source_system, transaction_date, due_date, amount, direction, status, business_status, description)
    VALUES (org_b, 'CONDOMINIO_RATEIO', venc_velho, venc_velho, 100, 'CREDIT', 'PENDING', 'PREVISTO', 'Cota teste u2 de rateio cancelado') RETURNING id INTO tx2_rcanc;
    INSERT INTO public.internal_transactions (organization_id, source_system, transaction_date, due_date, amount, direction, status, business_status, description)
    VALUES (org_b, 'CONDOMINIO_RATEIO', venc_velho, venc_velho, 100, 'CREDIT', 'CONCILIATED', 'PREVISTO', 'Cota teste u3 conciliada') RETURNING id INTO tx3_pago;
    INSERT INTO public.internal_transactions (organization_id, source_system, transaction_date, due_date, amount, direction, status, business_status, description)
    VALUES (org_b, 'CONDOMINIO_RATEIO', hoje, hoje, 100, 'CREDIT', 'PENDING', 'PREVISTO', 'Cota teste u4 vence hoje') RETURNING id INTO tx4_hoje;

    -- Rateio da competência velha (u1 vencida, u2 cancelada, u3 paga, u4 vence hoje),
    -- rateio da competência nova (u1 vencida) e rateio CANCELADO (u2 vencida).
    INSERT INTO public.condominio_rateios (empreendimento_id, organization_id, competencia, criterio)
    VALUES (e, org_b, comp_velha, 'FRACAO_IDEAL') RETURNING id INTO r1;
    INSERT INTO public.condominio_rateios (empreendimento_id, organization_id, competencia, criterio)
    VALUES (e, org_b, comp_nova, 'FRACAO_IDEAL') RETURNING id INTO r2;
    INSERT INTO public.condominio_rateios (empreendimento_id, organization_id, competencia, criterio, status)
    VALUES (e, org_b, comp_velha, 'FRACAO_IDEAL', 'CANCELADO') RETURNING id INTO r3;
    INSERT INTO public.condominio_rateio_itens (rateio_id, unit_id, organization_id, peso, valor, transaction_id) VALUES
        (r1, u1, org_b, 0.1, 100, tx1_velho), (r1, u2, org_b, 0.2, 100, tx2_canc),
        (r1, u3, org_b, 0.3, 100, tx3_pago),  (r1, u4, org_b, 0.4, 100, tx4_hoje),
        (r2, u1, org_b, 0.1, 100, tx1_novo),  (r3, u2, org_b, 0.2, 100, tx2_rcanc);
    UPDATE public.condominio_rateios SET status = 'FECHADO', fechado_em = now() WHERE id IN (r1, r2);

    -- Documentos: procurações e atas (deste e de outro condomínio).
    INSERT INTO public.condominio_documentos (empreendimento_id, organization_id, titulo, categoria, url, visivel_portal)
    VALUES (e, org_b, 'Procuração 102', 'OUTRO', 'https://exemplo.invalid/p.pdf', false) RETURNING id INTO doc_proc;
    INSERT INTO public.condominio_documentos (empreendimento_id, organization_id, titulo, categoria, url, visivel_portal)
    VALUES (e2, org_b, 'Procuração de outro condomínio', 'OUTRO', 'https://exemplo.invalid/p2.pdf', false) RETURNING id INTO doc_proc_outro;
    INSERT INTO public.condominio_documentos (empreendimento_id, organization_id, titulo, categoria, url)
    VALUES (e, org_b, 'Ata teste', 'ATA', 'https://exemplo.invalid/ata.pdf') RETURNING id INTO doc_ata;
    INSERT INTO public.condominio_documentos (empreendimento_id, organization_id, titulo, categoria, url)
    VALUES (e2, org_b, 'Ata de outro condomínio', 'ATA', 'https://exemplo.invalid/ata2.pdf') RETURNING id INTO doc_ata_outro;
    INSERT INTO public.condominio_documentos (empreendimento_id, organization_id, titulo, categoria, url)
    VALUES (e, org_b, 'Laudo teste', 'LAUDO', 'https://exemplo.invalid/laudo.pdf') RETURNING id INTO doc_outro;

    -- ═══ impedimento (R3) ═══════════════════════════════════════════════════
    motivo_u1 := format('Cota de %s vencida em %s', to_char(comp_velha, 'MM/YYYY'), to_char(venc_velho, 'DD/MM/YYYY'));
    v := pg_temp.pg(format('SELECT public.fn_assembleia_unidade_impedida(%L)', u1));
    PERFORM pg_temp.confere(v = 'ok:' || motivo_u1, 'impedida: cota vencida e não paga, motivo da MAIS ANTIGA (esperado '
        || motivo_u1 || ', veio ' || v || ')');
    PERFORM pg_temp.confere(public.fn_assembleia_unidade_impedida(u2) IS NULL,
        'impedida: título cancelado e título de rateio cancelado não impedem');
    PERFORM pg_temp.confere(public.fn_assembleia_unidade_impedida(u3) IS NULL, 'impedida: título conciliado (pago) não impede');
    PERFORM pg_temp.confere(public.fn_assembleia_unidade_impedida(u4) IS NULL, 'impedida: cota que vence HOJE (Brasília) não impede');
    PERFORM pg_temp.confere(public.fn_assembleia_unidade_impedida(u5) IS NULL, 'impedida: unidade sem cota é quite');

    -- ═══ decisão 1 da revisão: colunas que o app grava na assembleia ════════
    v := pg_temp.au(m, format(nova, e, 'AGE', 'Rascunho D (sem pauta)', p1, p2));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'membro cria rascunho só com as colunas liberadas (veio ' || v || ')');
    d := substr(v, 4)::uuid;
    PERFORM pg_temp.confere((SELECT created_by FROM public.condominio_assembleias WHERE id = d) = m
                        AND (SELECT organization_id FROM public.condominio_assembleias WHERE id = d) = org_b,
        'created_by = auth.uid() pelo DEFAULT e org do condomínio pelo gatilho');
    v := pg_temp.au(m, format(upd, 'titulo = ''Rascunho D renomeado''', d));
    PERFORM pg_temp.confere(v = 'ok:1', 'membro UPDATE de titulo em RASCUNHO passa (veio ' || v || ')');
    v := pg_temp.au(m, format(upd, 'retrato = ''{"itens": []}''::jsonb', d));
    PERFORM pg_temp.confere(v LIKE '42501|%', 'membro UPDATE de retrato em RASCUNHO recusado 42501 (veio ' || v || ')');
    v := pg_temp.au(m, format(upd, format('ata_documento_id = %L', doc_ata), d));
    PERFORM pg_temp.confere(v LIKE '42501|%', 'membro UPDATE de ata_documento_id em RASCUNHO recusado 42501 (veio ' || v || ')');
    v := pg_temp.au(m, format(upd, format('created_by = %L', n), d));
    PERFORM pg_temp.confere(v LIKE '42501|%', 'membro não troca created_by (veio ' || v || ')');
    v := pg_temp.au(m, format('WITH x AS (INSERT INTO public.condominio_assembleias (empreendimento_id, tipo, titulo, created_by) '
                           || 'VALUES (%L, ''AGO'', ''Forjada'', %L) RETURNING id) SELECT id::text FROM x', e, n));
    PERFORM pg_temp.confere(v LIKE '42501|%', 'membro não forja created_by no INSERT (veio ' || v || ')');
    v := pg_temp.au(m, format('WITH x AS (INSERT INTO public.condominio_assembleias (empreendimento_id, tipo, titulo, organization_id) '
                           || 'VALUES (%L, ''AGO'', ''Com org'', %L) RETURNING id) SELECT id::text FROM x', e, org_b));
    PERFORM pg_temp.confere(v LIKE '42501|%', 'membro não manda organization_id no INSERT (veio ' || v || ')');

    -- ═══ decisão 2 da revisão: opções da ESCOLHA ════════════════════════════
    v := pg_temp.au(m, format(item, d, 1, 'Repetida', 'ESCOLHA', '{Ana,Ana}', 'MAIORIA_PRESENTES'));
    PERFORM pg_temp.confere(v LIKE chk, 'ESCOLHA com opção repetida recusada (veio ' || v || ')');
    v := pg_temp.au(m, format(item, d, 1, 'Repetida sem caixa', 'ESCOLHA', '{Ana," ana"}', 'MAIORIA_PRESENTES'));
    PERFORM pg_temp.confere(v LIKE chk, 'ESCOLHA com opção repetida (caixa/espaço) recusada (veio ' || v || ')');
    v := pg_temp.au(m, format(item, d, 1, 'Vazia', 'ESCOLHA', '{Ana,"  "}', 'MAIORIA_PRESENTES'));
    PERFORM pg_temp.confere(v LIKE chk, 'ESCOLHA com opção em branco recusada (veio ' || v || ')');
    v := pg_temp.au(m, format(item, d, 1, 'Nula', 'ESCOLHA', '{Ana,Bia,NULL}', 'MAIORIA_PRESENTES'));
    PERFORM pg_temp.confere(v LIKE chk, 'ESCOLHA com opção NULL recusada (veio ' || v || ')');
    v := pg_temp.au(m, format(item, d, 1, 'Abstenção', 'ESCOLHA', '{Ana,ABSTENCAO}', 'MAIORIA_PRESENTES'));
    PERFORM pg_temp.confere(v LIKE chk, 'ESCOLHA com opção ABSTENCAO recusada (veio ' || v || ')');
    v := pg_temp.au(m, format(item, d, 1, 'Só uma', 'ESCOLHA', '{Ana}', 'MAIORIA_PRESENTES'));
    PERFORM pg_temp.confere(v LIKE chk, 'ESCOLHA com 1 opção continua recusada (veio ' || v || ')');

    -- ═══ convocar ═══════════════════════════════════════════════════════════
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_convocar(%L, %L)::text', d, 'Edital D'));
    PERFORM pg_temp.confere(v LIKE 'P0001|sem_itens|%', 'não convoca sem item (veio ' || v || ')');
    -- Condomínio sem nenhuma fração ideal: total seria 0 e todo quórum perderia sentido.
    v := pg_temp.au(m, format(nova, e2, 'AGO', 'Sem frações', p1, p2));
    a_e2 := substr(v, 4)::uuid;
    PERFORM pg_temp.au(m, format(item, a_e2, 1, 'Item', 'APROVACAO', NULL, 'MAIORIA_PRESENTES'));
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_convocar(%L, %L)::text', a_e2, 'Edital'));
    PERFORM pg_temp.confere(v LIKE 'P0001|sem_unidades|%', 'não convoca condomínio sem unidade com fração (veio ' || v || ')');

    -- Assembleia A: a reunião completa.
    v := pg_temp.au(m, format(nova, e, 'AGE', 'Assembleia A', p1, p2));
    a := substr(v, 4)::uuid;
    iA1 := substr(pg_temp.au(m, format(item, a, 1, 'Aprovar contas',     'APROVACAO', NULL, 'MAIORIA_PRESENTES')), 4)::uuid;
    iA2 := substr(pg_temp.au(m, format(item, a, 2, 'Obra útil',          'APROVACAO', NULL, 'MAIORIA_ABSOLUTA')), 4)::uuid;
    iA3 := substr(pg_temp.au(m, format(item, a, 3, 'Alterar convenção',  'APROVACAO', NULL, 'DOIS_TERCOS')), 4)::uuid;
    iA4 := substr(pg_temp.au(m, format(item, a, 4, 'Novo pavimento',     'APROVACAO', NULL, 'UNANIMIDADE')), 4)::uuid;
    iA5 := substr(pg_temp.au(m, format(item, a, 5, 'Eleger síndico',     'ESCOLHA', '{Ana,Bia}', 'MAIORIA_PRESENTES')), 4)::uuid;
    PERFORM pg_temp.confere(iA1 IS NOT NULL AND iA5 IS NOT NULL, 'fixture: pauta da assembleia A');

    -- 1ª convocação no passado: recusa (e sem as datas também).
    v := pg_temp.au(m, format(upd, 'primeira_convocacao_em = ''2026-01-01 19:00-03:00'', segunda_convocacao_em = ''2026-01-01 19:30-03:00''', a));
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_convocar(%L, %L)::text', a, 'Edital A'));
    PERFORM pg_temp.confere(v LIKE 'P0001|primeira_no_passado|%', '1ª convocação no passado recusa (veio ' || v || ')');
    v := pg_temp.au(m, format(upd, 'primeira_convocacao_em = NULL, segunda_convocacao_em = NULL', a));
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_convocar(%L, %L)::text', a, 'Edital A'));
    PERFORM pg_temp.confere(v LIKE 'P0001|sem_datas|%', 'convocar exige 1ª e 2ª convocação (veio ' || v || ')');
    v := pg_temp.au(m, format(upd, format('primeira_convocacao_em = %L, segunda_convocacao_em = %L', p1, p2), a));
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_convocar(%L, %L)::text', a, ''));
    PERFORM pg_temp.confere(v LIKE 'P0001|sem_corpo|%', 'convocar exige o texto do aviso (veio ' || v || ')');

    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_convocar(%L, %L)::text', a, 'Edital A — texto do sistema'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'convocar A (veio ' || v || ')');
    j := substr(v, 4)::jsonb;
    PERFORM pg_temp.confere((j ->> 'unidades')::int = 4 AND j -> 'fora' = '["Torre T — Garagem"]'::jsonb,
        'convocar cria 4 unidades e devolve 1 fora (veio ' || j::text || ')');
    PERFORM pg_temp.confere((SELECT count(*) FROM public.condominio_assembleia_unidades WHERE assembleia_id = a) = 4
                        AND (SELECT sum(fracao) FROM public.condominio_assembleia_unidades WHERE assembleia_id = a) = 1.0
                        AND (SELECT fracao FROM public.condominio_assembleia_unidades WHERE assembleia_id = a AND unit_id = u3) = 0.3
                        AND NOT EXISTS (SELECT 1 FROM public.condominio_assembleia_unidades WHERE assembleia_id = a AND unit_id = u5),
        'convocar cria 4 unidades com a fração congelada (a sem fração fica fora)');
    PERFORM pg_temp.confere((SELECT unidade_rotulo || ' / ' || proprietario_nome FROM public.condominio_assembleia_unidades
                              WHERE assembleia_id = a AND unit_id = u1) = 'Torre T — 101 / Ana Teste, Bruno Teste',
        'convocar: rótulo = torre + unidade; proprietários = os PROPRIETARIO vigentes (veio '
        || coalesce((SELECT unidade_rotulo || ' / ' || proprietario_nome FROM public.condominio_assembleia_unidades
                      WHERE assembleia_id = a AND unit_id = u1), '<null>') || ')');
    SELECT to_jsonb(av) INTO q FROM public.condominio_avisos av
     WHERE av.id = (SELECT aviso_id FROM public.condominio_assembleias WHERE id = a);
    PERFORM pg_temp.confere(q ->> 'categoria' = 'ASSEMBLEIA' AND q ->> 'titulo' = 'Convocação: Assembleia A'
                        AND q ->> 'corpo' = 'Edital A — texto do sistema' AND (q ->> 'empreendimento_id')::uuid = e
                        AND (q ->> 'organization_id')::uuid = org_b,
        'convocar publica aviso ASSEMBLEIA (veio ' || coalesce(q::text, '<sem aviso>') || ')');
    PERFORM pg_temp.confere((q ->> 'valido_ate')::date = DATE '2030-03-10',
        'convocar publica aviso ASSEMBLEIA com valido_ate = dia da 2ª em Brasília (2ª às 22:30-03:00; veio '
        || coalesce(q ->> 'valido_ate', '<null>') || ')');
    PERFORM pg_temp.confere((SELECT status FROM public.condominio_assembleias WHERE id = a) = 'CONVOCADA'
                        AND (SELECT convocada_em FROM public.condominio_assembleias WHERE id = a) IS NOT NULL,
        'convocar: status CONVOCADA');
    PERFORM pg_temp.confere(EXISTS (SELECT 1 FROM public.condominio_assembleia_eventos
                                     WHERE assembleia_id = a AND evento = 'CONVOCADA' AND papel = 'GESTOR' AND ator = m),
        'convocar grava evento com ator = auth.uid() e papel GESTOR');
    PERFORM pg_temp.confere(coalesce(current_setting('app.assembleia_transicao', true), '') <> 'on',
        'a marca de transição não fica ligada depois da RPC');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_convocar(%L, %L)::text', a, 'De novo'));
    PERFORM pg_temp.confere(v LIKE 'P0001|estado|%', 'convocar duas vezes recusa pelo estado (veio ' || v || ')');

    -- ═══ A10: cotas conferidas e impedimento marcado à mão ══════════════════
    -- Conferida = há título de cota (transaction_id) em rateio NÃO cancelado do condomínio.
    PERFORM pg_temp.confere(public.fn_assembleia_cotas_conferidas(e) IS TRUE,
        'cotas_conferidas false sem título / true com título: condomínio com títulos → true');
    PERFORM pg_temp.confere(public.fn_assembleia_cotas_conferidas(e2) IS FALSE,
        'cotas_conferidas false sem título / true com título: condomínio sem título → false');
    -- Título que vence no futuro (não impede ninguém): só a existência dele importa aqui.
    INSERT INTO public.internal_transactions (organization_id, source_system, transaction_date, due_date, amount, direction, status, business_status, description)
    VALUES (org_b, 'CONDOMINIO_RATEIO', hoje + 30, hoje + 30, 100, 'CREDIT', 'PENDING', 'PREVISTO', 'Cota teste e2') RETURNING id INTO tx_e2;
    INSERT INTO public.condominio_rateios (empreendimento_id, organization_id, competencia, criterio)
    VALUES (e2, org_b, comp_velha, 'FRACAO_IDEAL') RETURNING id INTO r4;
    INSERT INTO public.condominio_rateio_itens (rateio_id, unit_id, organization_id, peso, valor, transaction_id)
    VALUES (r4, u4, org_b, 1, 100, tx_e2);
    PERFORM pg_temp.confere(public.fn_assembleia_cotas_conferidas(e2) IS TRUE,
        'cotas_conferidas: título em rateio não cancelado conta');
    UPDATE public.condominio_rateios SET status = 'CANCELADO' WHERE id = r4;
    PERFORM pg_temp.confere(public.fn_assembleia_cotas_conferidas(e2) IS FALSE,
        'cotas_conferidas: título só em rateio CANCELADO não conta');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_cotas_conferidas(%L)::text', a_e2));
    PERFORM pg_temp.confere(v = 'ok:false', 'RPC cotas_conferidas: rascunho de condomínio sem título → false (veio ' || v || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_cotas_conferidas(%L)::text', a));
    PERFORM pg_temp.confere(v = 'ok:true', 'RPC cotas_conferidas: condomínio com título → true (veio ' || v || ')');
    v := pg_temp.au(n, format('SELECT public.condominio_assembleia_cotas_conferidas(%L)::text', a));
    PERFORM pg_temp.confere(v LIKE '42501|%', 'RPC cotas_conferidas: não-membro 42501 (veio ' || v || ')');

    -- Assembleia E: o gestor marca à mão.
    v := pg_temp.au(m, format(nova, e, 'AGE', 'Assembleia E (impedimento à mão)', p1, p2));
    ea := substr(v, 4)::uuid;
    iE1 := substr(pg_temp.au(m, format(item, ea, 1, 'Pintura da fachada', 'APROVACAO', NULL, 'MAIORIA_PRESENTES')), 4)::uuid;
    v := pg_temp.marcar(m, ea, u2, motivo_m);
    PERFORM pg_temp.confere(v LIKE 'P0001|estado|%', 'marcar impedida em RASCUNHO recusa pelo estado (veio ' || v || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_convocar(%L, %L)::text', ea, 'Edital E'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'convocar E (veio ' || v || ')');

    v := pg_temp.marcar(m, ea, u2, '   ');
    PERFORM pg_temp.confere(v LIKE 'P0001|sem_motivo|%', 'motivo vazio recusado (sem_motivo): só espaços (veio ' || v || ')');
    v := pg_temp.marcar(m, ea, u2, '');
    PERFORM pg_temp.confere(v LIKE 'P0001|sem_motivo|%', 'motivo vazio recusado (sem_motivo): texto vazio (veio ' || v || ')');
    v := pg_temp.marcar(m, ea, u2, ' ... ');
    PERFORM pg_temp.confere(v LIKE 'P0001|sem_motivo|%', 'motivo só com pontos recusado (sem_motivo) (veio ' || v || ')');
    v := pg_temp.marcar(m, ea, u2, repeat('x', 201));
    PERFORM pg_temp.confere(v LIKE 'P0001|motivo_longo|%', 'motivo com 201 caracteres recusado (motivo_longo) (veio ' || v || ')');
    v := pg_temp.marcar(n, ea, u2, motivo_m);
    PERFORM pg_temp.confere(v LIKE '42501|%', 'não-membro 42501 ao marcar (veio ' || v || ')');
    v := pg_temp.como(NULL, 'anon', format('SELECT public.condominio_assembleia_marcar_impedida(%L, %L, %L)::text', ea, u2, motivo_m));
    PERFORM pg_temp.confere(v LIKE '42501|%', 'anon não marca (veio ' || v || ')');
    v := pg_temp.marcar(m, ea, u5, motivo_m);
    PERFORM pg_temp.confere(v LIKE 'P0001|unidade_fora|%', 'marcar unidade fora da assembleia recusado (veio ' || v || ')');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM public.condominio_assembleia_unidades
                                         WHERE assembleia_id = ea AND impedimento_manual IS NOT NULL),
        'recusas não marcaram nada');

    v := pg_temp.marcar(m, ea, u2, '  ' || motivo_m || '.  ');
    PERFORM pg_temp.confere(v LIKE 'ok:%'
                        AND (SELECT impedimento_manual FROM public.condominio_assembleia_unidades
                              WHERE assembleia_id = ea AND unit_id = u2) = motivo_m
                        AND (SELECT impedimento_manual_em IS NOT NULL FROM public.condominio_assembleia_unidades
                              WHERE assembleia_id = ea AND unit_id = u2),
        'marcar impedida grava o motivo (sem espaços nas pontas nem ponto final) e a hora (veio ' || v || ')');
    PERFORM pg_temp.confere(EXISTS (SELECT 1 FROM public.condominio_assembleia_eventos
                                     WHERE assembleia_id = ea AND evento = 'IMPEDIMENTO_MANUAL' AND papel = 'GESTOR'
                                       AND ator = m AND unit_id = u2 AND detalhe ->> 'motivo' = motivo_m),
        'marcar impedida grava evento IMPEDIMENTO_MANUAL com ator, papel e motivo');
    PERFORM pg_temp.confere(public.fn_assembleia_impedimento(ea, u2) = motivo_m
                        AND public.fn_assembleia_impedimento(ea, u1) = motivo_u1
                        AND public.fn_assembleia_impedimento(ea, u3) IS NULL,
        'fn_assembleia_impedimento: marcado à mão → motivo do gestor; senão a regra automática');
    v := pg_temp.presenca(m, ea, u2, 'PRESENCIAL');
    PERFORM pg_temp.confere(v LIKE 'P0001|unidade_impedida|' || motivo_m || '|%',
        'marcar impedida bloqueia presença e voto: presença recusada com o motivo do gestor (veio ' || v || ')');

    -- desmarcar libera
    -- 200 caracteres (o ponto final sai antes de contar) é o limite que passa.
    v := pg_temp.marcar(m, ea, u4, repeat('y', 200) || '...');
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (SELECT impedimento_manual FROM public.condominio_assembleia_unidades
                                                 WHERE assembleia_id = ea AND unit_id = u4) = repeat('y', 200),
        'motivo com 200 caracteres (+ pontos finais) aceito e normalizado (veio ' || v || ')');
    v := pg_temp.presenca(m, ea, u4, 'PRESENCIAL');
    PERFORM pg_temp.confere(v LIKE 'P0001|unidade_impedida|%', 'u4 marcada não registra presença (veio ' || v || ')');
    v := pg_temp.marcar(m, ea, u4, NULL);
    PERFORM pg_temp.confere(v LIKE 'ok:%'
                        AND (SELECT impedimento_manual IS NULL AND impedimento_manual_em IS NULL
                               FROM public.condominio_assembleia_unidades WHERE assembleia_id = ea AND unit_id = u4)
                        AND EXISTS (SELECT 1 FROM public.condominio_assembleia_eventos
                                     WHERE assembleia_id = ea AND evento = 'IMPEDIMENTO_MANUAL' AND unit_id = u4
                                       AND detalhe -> 'motivo' = 'null'::jsonb),
        'desmarcar libera: limpa motivo e hora, evento com motivo null (veio ' || v || ')');
    v := pg_temp.presenca(m, ea, u4, 'PRESENCIAL');
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'desmarcar libera: presença registrada (veio ' || v || ')');
    v := pg_temp.presenca(m, ea, u3, 'PRESENCIAL');
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'presença u3 em E (veio ' || v || ')');

    -- instalar grava cotasConferidas e origem
    PERFORM pg_temp.desloca(ea, now() - interval '40 minutes', now() - interval '10 minutes');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_instalar(%L, 2::smallint, %L, %L, true)::text', ea, 'P', 'S'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'instalar E (veio ' || v || ')');
    SELECT quorum_instalacao INTO q FROM public.condominio_assembleias WHERE id = ea;
    PERFORM pg_temp.confere(q -> 'cotasConferidas' = 'true'::jsonb
                        AND jsonb_array_length(q -> 'impedidas') = 2
                        AND (q ->> 'presentesUnidades')::int = 2
                        AND (q ->> 'presentesFracao')::numeric = 0.7
                        AND EXISTS (SELECT 1 FROM jsonb_array_elements(q -> 'impedidas') x
                                     WHERE x ->> 'unitId' = u1::text AND x ->> 'origem' = 'AUTOMATICA' AND x ->> 'motivo' = motivo_u1)
                        AND EXISTS (SELECT 1 FROM jsonb_array_elements(q -> 'impedidas') x
                                     WHERE x ->> 'unitId' = u2::text AND x ->> 'origem' = 'MANUAL' AND x ->> 'motivo' = motivo_m)
                        AND (SELECT impedida_na_instalacao FROM public.condominio_assembleia_unidades WHERE assembleia_id = ea AND unit_id = u2),
        'instalar grava cotasConferidas e origem (veio ' || coalesce(q::text, '<null>') || ')');

    -- voto dado antes de marcar continua valendo
    PERFORM pg_temp.vota(m, iE1, u3, 'SIM');
    v := pg_temp.marcar(m, ea, u3, 'Débito reconhecido na reunião');
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'marcar depois de votar (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT opcao || '/' || origem FROM public.condominio_assembleia_votos WHERE item_id = iE1 AND unit_id = u3) = 'SIM/PRESENCIAL'
                        AND (pg_temp.item_apurado(ea, iE1) -> 'porOpcao' -> 'SIM' ->> 'unidades')::int = 1
                        AND (SELECT quorum_instalacao FROM public.condominio_assembleias WHERE id = ea) = q,
        'voto dado antes de marcar continua valendo (e o quórum gravado não muda)');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_lancar_voto(%L, %L, %L)::text', iE1, u3, 'NAO'));
    PERFORM pg_temp.confere(v LIKE 'P0001|unidade_impedida|Débito reconhecido na reunião|%'
                        AND (SELECT opcao FROM public.condominio_assembleia_votos WHERE item_id = iE1 AND unit_id = u3) = 'SIM',
        'marcar impedida bloqueia presença e voto: voto recusado (veio ' || v || ')');
    v := pg_temp.marcar(m, ea, u3, NULL);
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'desmarcar u3 (veio ' || v || ')');
    PERFORM pg_temp.vota(m, iE1, u3, 'NAO');
    PERFORM pg_temp.confere((SELECT opcao FROM public.condominio_assembleia_votos WHERE item_id = iE1 AND unit_id = u3) = 'NAO',
        'desmarcar libera: volta a votar');

    -- Condomínio SEM título de cota: instalar grava cotasConferidas = false, e o retrato herda.
    INSERT INTO public.empreendimentos (organization_id, condominio_org_id, name)
    VALUES (org_a, org_b, 'Condomínio sem cotas A10 (ROLLBACK)') RETURNING id INTO e3;
    INSERT INTO public.empreendimento_towers (empreendimento_id, name) VALUES (e3, 'Torre S') RETURNING id INTO t3;
    INSERT INTO public.empreendimento_units (tower_id, name, fracao_ideal_decimal) VALUES (t3, '201', 1) RETURNING id INTO u31;
    PERFORM pg_temp.confere(public.fn_assembleia_cotas_conferidas(e3) IS FALSE, 'fixture: condomínio sem título');
    a3 := substr(pg_temp.au(m, format(nova, e3, 'AGE', 'Assembleia sem cotas', p1, p2)), 4)::uuid;
    i31 := substr(pg_temp.au(m, format(item, a3, 1, 'Orçamento', 'APROVACAO', NULL, 'MAIORIA_PRESENTES')), 4)::uuid;
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_convocar(%L, %L)::text', a3, 'Edital sem cotas'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'convocar a assembleia sem cotas (veio ' || v || ')');
    v := pg_temp.marcar(m, a3, u31, 'Em atraso segundo a administradora');
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'marcar a única unidade (veio ' || v || ')');
    PERFORM pg_temp.desloca(a3, now() - interval '40 minutes', now() - interval '10 minutes');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_instalar(%L, 2::smallint, %L, %L, true)::text', a3, 'P', 'S'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'instalar a assembleia sem cotas (veio ' || v || ')');
    SELECT quorum_instalacao INTO q FROM public.condominio_assembleias WHERE id = a3;
    PERFORM pg_temp.confere(q -> 'cotasConferidas' = 'false'::jsonb
                        AND q -> 'impedidas' -> 0 ->> 'origem' = 'MANUAL'
                        AND q -> 'impedidas' -> 0 ->> 'motivo' = 'Em atraso segundo a administradora',
        'instalar sem título de cota grava cotasConferidas = false (veio ' || coalesce(q::text, '<null>') || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_encerrar(%L, NULL, NULL)::text', a3));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'encerrar a assembleia sem cotas (veio ' || v || ')');
    SELECT retrato INTO ret FROM public.condominio_assembleias WHERE id = a3;
    PERFORM pg_temp.confere(ret -> 'cabecalho' -> 'quorumInstalacao' -> 'cotasConferidas' = 'false'::jsonb
                        AND ret -> 'impedidasNaInstalacao' -> 0 ->> 'origem' = 'MANUAL',
        'o retrato herda cotasConferidas = false e a origem MANUAL (veio ' || coalesce(ret::text, '<null>') || ')');
    ret := NULL;

    -- ═══ instalar: 1ª convocação e quórum ═══════════════════════════════════
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_instalar(%L, 1::smallint, %L, %L, true)::text', a, 'Pres', 'Sec'));
    PERFORM pg_temp.confere(v LIKE 'P0001|antes_do_horario|%', 'instalar na 1ª antes do horário recusa (veio ' || v || ')');
    -- Agora a 1ª já começou (como se fossem 19:10 de uma reunião marcada para 19:00 / 19:30).
    PERFORM pg_temp.desloca(a, now() - interval '10 minutes', now() + interval '20 minutes');

    v := pg_temp.presenca(m, a, u4, 'PRESENCIAL');
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'registrar presença u4 (veio ' || v || ')');
    -- u1 votou pelo portal quando ainda estava quite (o voto vale), mas hoje está
    -- impedida: não conta para o quórum. Presentes não impedidos = só u4 (0,4).
    INSERT INTO public.condominio_assembleia_votos (assembleia_id, item_id, unit_id, opcao, origem, client_id)
    VALUES (a, iA1, u1, 'SIM', 'PORTAL', c1);
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_instalar(%L, 1::smallint, %L, %L, true)::text', a, 'Pres', 'Sec'));
    PERFORM pg_temp.confere(v LIKE 'P0001|sem_quorum_primeira|%', '1ª recusada com presentes 0,4 (sem_quorum_primeira) (veio ' || v || ')');
    PERFORM pg_temp.confere(v LIKE '%há 40,00% presentes%', 'sem_quorum_primeira diz o percentual presente (veio ' || v || ')');

    v := pg_temp.presenca(m, a, u1, 'PRESENCIAL');
    PERFORM pg_temp.confere(v LIKE 'P0001|unidade_impedida|' || motivo_u1 || '|%',
        'impedida não registra presença (HINT unidade_impedida, DETAIL = motivo) (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT presenca FROM public.condominio_assembleia_unidades WHERE assembleia_id = a AND unit_id = u1) IS NULL,
        'impedida não registra presença (linha intacta)');

    -- Presença NULL remove; procurador exige procuração do mesmo condomínio.
    v := pg_temp.presenca(m, a, u4, NULL);
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (SELECT presenca FROM public.condominio_assembleia_unidades
                                                 WHERE assembleia_id = a AND unit_id = u4) IS NULL,
        'remove presença sem voto presencial (presença NULL) (veio ' || v || ')');
    v := pg_temp.presenca(m, a, u3, 'PROCURADOR', 'Procurador X', doc_proc_outro);
    PERFORM pg_temp.confere(v LIKE 'P0001|procuracao_invalida|%', 'procuração de outro condomínio recusada (veio ' || v || ')');
    v := pg_temp.presenca(m, a, u3, 'PROCURADOR', '  ', doc_proc);
    PERFORM pg_temp.confere(v LIKE 'P0001|procuracao_invalida|%', 'procurador sem nome recusado (veio ' || v || ')');
    v := pg_temp.presenca(m, a, u3, 'PROCURADOR', 'Procurador X', doc_proc);
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (SELECT procurador_nome || '/' || procuracao_documento_id::text
                                                 FROM public.condominio_assembleia_unidades WHERE assembleia_id = a AND unit_id = u3)
                                              = 'Procurador X/' || doc_proc::text,
        'presença por procurador com procuração do condomínio (veio ' || v || ')');
    v := pg_temp.presenca(m, a, u3, 'ONLINE');
    PERFORM pg_temp.confere(v LIKE 'P0001|presenca_invalida|%', 'forma de presença inválida recusada (veio ' || v || ')');
    v := pg_temp.presenca(m, a, gen_random_uuid(), 'PRESENCIAL');
    PERFORM pg_temp.confere(v LIKE 'P0001|unidade_fora|%', 'unidade que não participa recusada (veio ' || v || ')');

    -- u2 "presente" por ter votado pelo portal (o voto que a A3 vai gravar).
    INSERT INTO public.condominio_assembleia_votos (assembleia_id, item_id, unit_id, opcao, origem, client_id)
    VALUES (a, iA4, u2, 'SIM', 'PORTAL', c2);
    -- presentes não impedidos = u2 (0,2, portal) + u3 (0,3, procurador) = 0,5
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_instalar(%L, 1::smallint, %L, %L, false)::text', a, 'Pres', 'Sec'));
    PERFORM pg_temp.confere(v LIKE 'P0001|edital_nao_confirmado|%', 'instalar exige confirmar o edital entregue (veio ' || v || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_instalar(%L, 1::smallint, %L, %L, true)::text', a, ' ', 'Sec'));
    PERFORM pg_temp.confere(v LIKE 'P0001|sem_mesa|%', 'instalar exige presidente e secretário (veio ' || v || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_instalar(%L, 1::smallint, %L, %L, true)::text', a, 'Maria Presidente', 'João Secretário'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', '1ª aceita com presentes 0,5 (veio ' || v || ')');
    SELECT quorum_instalacao INTO q FROM public.condominio_assembleias WHERE id = a;
    PERFORM pg_temp.confere((q ->> 'presentesFracao')::numeric = 0.5 AND (q ->> 'presentesUnidades')::int = 2
                        AND (q ->> 'total')::numeric = 1.0 AND (q ->> 'convocacao')::int = 1
                        AND jsonb_array_length(q -> 'impedidas') = 1
                        AND q -> 'impedidas' -> 0 ->> 'unitId' = u1::text
                        AND q -> 'impedidas' -> 0 ->> 'motivo' = motivo_u1,
        '1ª aceita com presentes 0,5: quórum gravado (veio ' || coalesce(q::text, '<null>') || ')');
    PERFORM pg_temp.confere((SELECT status || '/' || instalada_convocacao || '/' || presidente_nome || '/' || secretario_nome
                               FROM public.condominio_assembleias WHERE id = a) = 'INSTALADA/1/Maria Presidente/João Secretário'
                        AND (SELECT edital_entregue_em IS NOT NULL AND instalada_em IS NOT NULL FROM public.condominio_assembleias WHERE id = a),
        'instalar grava estado, convocação, mesa e edital entregue');
    PERFORM pg_temp.confere((SELECT array_agg(unit_id ORDER BY unit_id) FROM public.condominio_assembleia_unidades
                              WHERE assembleia_id = a AND impedida_na_instalacao) = ARRAY[u1]
                        AND (SELECT count(*) FROM public.condominio_assembleia_unidades
                              WHERE assembleia_id = a AND impedida_na_instalacao IS FALSE) = 3,
        'instalar grava impedida_na_instalacao por unidade');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_instalar(%L, 1::smallint, %L, %L, true)::text', a, 'P', 'S'));
    PERFORM pg_temp.confere(v LIKE 'P0001|estado|%já foi instalada%', 'instalar duas vezes recusa (veio ' || v || ')');

    -- Quem chega atrasado registra presença depois de instalada.
    v := pg_temp.presenca(m, a, u4, 'PRESENCIAL');
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'presença depois de instalada (veio ' || v || ')');
    v := pg_temp.presenca(m, a, u2, 'PRESENCIAL');
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'u2 chega à sala (veio ' || v || ')');

    -- ═══ lançar voto ════════════════════════════════════════════════════════
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_lancar_voto(%L, %L, %L)::text', iA1, u1, 'SIM'));
    PERFORM pg_temp.confere(v LIKE 'P0001|unidade_impedida|' || motivo_u1 || '|%', 'impedida não vota (veio ' || v || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_lancar_voto(%L, %L, %L)::text', iA1, u3, 'TALVEZ'));
    PERFORM pg_temp.confere(v LIKE 'P0001|opcao_invalida|%', 'APROVACAO: opção fora de SIM/NAO/ABSTENCAO recusada (veio ' || v || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_lancar_voto(%L, %L, %L)::text', iA5, u3, 'Carlos'));
    PERFORM pg_temp.confere(v LIKE 'P0001|opcao_invalida|%', 'ESCOLHA: opção fora da lista recusada (veio ' || v || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_lancar_voto(%L, %L, %L)::text', iA5, u3, 'SIM'));
    PERFORM pg_temp.confere(v LIKE 'P0001|opcao_invalida|%', 'ESCOLHA: SIM não é opção (veio ' || v || ')');

    -- Sobre o voto PORTAL de u2 no item 4.
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_lancar_voto(%L, %L, %L)::text', iA4, u2, 'SIM'));
    j := CASE WHEN v LIKE 'ok:%' THEN substr(v, 4)::jsonb END;
    PERFORM pg_temp.confere(j IS NOT NULL AND j -> 'anterior' ->> 'origem' = 'PORTAL' AND j ->> 'origem' = 'PRESENCIAL',
        'lançar voto sobre voto PORTAL devolve o voto anterior (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT origem || '/' || lancado_por::text || '/' || coalesce(client_id::text, '-')
                               FROM public.condominio_assembleia_votos WHERE item_id = iA4 AND unit_id = u2) = 'PRESENCIAL/' || m::text || '/-',
        'lançar voto sobre voto PORTAL troca origem (e quem lançou)');
    PERFORM pg_temp.confere((SELECT array_agg(origem ORDER BY id) FROM public.condominio_assembleia_votos_historico
                              WHERE item_id = iA4 AND unit_id = u2) = ARRAY['PORTAL', 'PRESENCIAL'],
        'lançar voto sobre voto PORTAL: histórico tem 2 linhas');

    -- ═══ apuração (R8) ══════════════════════════════════════════════════════
    PERFORM pg_temp.vota(m, iA1, u3, 'SIM');
    PERFORM pg_temp.vota(m, iA1, u2, 'NAO');
    -- Voto presencial não se apaga; a presença de quem votou na sala também não.
    v := pg_temp.presenca(m, a, u3, NULL);
    PERFORM pg_temp.confere(v LIKE 'P0001|tem_voto_presencial|%'
                        AND (SELECT presenca FROM public.condominio_assembleia_unidades
                              WHERE assembleia_id = a AND unit_id = u3) = 'PROCURADOR',
        'não remove presença com voto presencial (veio ' || v || ')');
    v := pg_temp.presenca(m, a, u3, 'PRESENCIAL');
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'trocar a forma de presença de quem votou continua valendo (veio ' || v || ')');
    v := pg_temp.presenca(m, a, u3, 'PROCURADOR', 'Procurador X', doc_proc);
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'volta ao procurador (veio ' || v || ')');
    PERFORM pg_temp.confere(pg_temp.res(a, iA1) = 'APROVADO', 'MAIORIA_PRESENTES: SIM 0,3 × NÃO 0,2 → APROVADO (veio ' || coalesce(pg_temp.res(a, iA1), '<null>') || ')');

    PERFORM pg_temp.vota(m, iA2, u2, 'SIM');
    PERFORM pg_temp.vota(m, iA2, u3, 'SIM');
    PERFORM pg_temp.confere(pg_temp.res(a, iA2) = 'QUORUM_NAO_ATINGIDO', 'MAIORIA_ABSOLUTA: SIM 0,5 → QUORUM_NAO_ATINGIDO (veio ' || coalesce(pg_temp.res(a, iA2), '<null>') || ')');

    PERFORM pg_temp.vota(m, iA3, u2, 'SIM');
    PERFORM pg_temp.vota(m, iA3, u4, 'SIM');
    PERFORM pg_temp.confere(pg_temp.res(a, iA3) = 'QUORUM_NAO_ATINGIDO', 'DOIS_TERCOS: SIM 0,6 → QUORUM_NAO_ATINGIDO (veio ' || coalesce(pg_temp.res(a, iA3), '<null>') || ')');

    PERFORM pg_temp.vota(m, iA4, u3, 'SIM');
    PERFORM pg_temp.vota(m, iA4, u4, 'SIM');
    PERFORM pg_temp.confere(pg_temp.res(a, iA4) = 'QUORUM_NAO_ATINGIDO', 'UNANIMIDADE: 3 SIM + 1 ausente → QUORUM_NAO_ATINGIDO (veio ' || coalesce(pg_temp.res(a, iA4), '<null>') || ')');

    -- ── pagou durante a reunião ──────────────────────────────────────────────
    SELECT quorum_instalacao INTO q FROM public.condominio_assembleias WHERE id = a;
    UPDATE public.internal_transactions SET business_status = 'RECEBIDO' WHERE id IN (tx1_velho, tx1_novo);
    PERFORM pg_temp.confere(public.fn_assembleia_unidade_impedida(u1) IS NULL, 'pagou durante a reunião: deixa de estar impedida');
    v := pg_temp.presenca(m, a, u1, 'PRESENCIAL');
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'pagou durante a reunião: registra presença (veio ' || v || ')');
    PERFORM pg_temp.vota(m, iA1, u1, 'NAO');
    PERFORM pg_temp.confere((SELECT quorum_instalacao FROM public.condominio_assembleias WHERE id = a) = q
                        AND (SELECT impedida_na_instalacao FROM public.condominio_assembleia_unidades WHERE assembleia_id = a AND unit_id = u1),
        'pagou durante a reunião: quorum_instalacao igual e a ata ainda a lista como impedida na instalação');

    j := pg_temp.item_apurado(a, iA1);
    PERFORM pg_temp.confere(j ->> 'resultado' = 'REJEITADO'
                        AND (j -> 'porOpcao' -> 'SIM' ->> 'fracao')::numeric = 0.3 AND (j -> 'porOpcao' -> 'SIM' ->> 'unidades')::int = 1
                        AND (j -> 'porOpcao' -> 'NAO' ->> 'fracao')::numeric = 0.3 AND (j -> 'porOpcao' -> 'NAO' ->> 'unidades')::int = 2
                        AND (j -> 'porOpcao' -> 'ABSTENCAO' ->> 'fracao')::numeric = 0,
        'empate 0,3 × 0,3 → REJEITADO (veio ' || coalesce(j::text, '<null>') || ')');

    PERFORM pg_temp.vota(m, iA2, u3, 'ABSTENCAO');
    PERFORM pg_temp.vota(m, iA2, u4, 'SIM');
    PERFORM pg_temp.confere(pg_temp.res(a, iA2) = 'APROVADO', 'MAIORIA_ABSOLUTA: SIM 0,6 → APROVADO (veio ' || coalesce(pg_temp.res(a, iA2), '<null>') || ')');

    PERFORM pg_temp.vota(m, iA3, u2, 'ABSTENCAO');
    PERFORM pg_temp.vota(m, iA3, u3, 'SIM');
    PERFORM pg_temp.confere(pg_temp.res(a, iA3) = 'APROVADO', 'DOIS_TERCOS: SIM 0,7 → APROVADO (veio ' || coalesce(pg_temp.res(a, iA3), '<null>') || ')');
    PERFORM pg_temp.vota(m, iA3, u2, 'SIM');
    PERFORM pg_temp.vota(m, iA3, u4, 'NAO');
    PERFORM pg_temp.confere(pg_temp.res(a, iA3) = 'REJEITADO', 'DOIS_TERCOS: NÃO 0,4 → REJEITADO (veio ' || coalesce(pg_temp.res(a, iA3), '<null>') || ')');

    PERFORM pg_temp.vota(m, iA5, u3, 'Ana');
    PERFORM pg_temp.vota(m, iA5, u1, 'Bia');
    PERFORM pg_temp.vota(m, iA5, u2, 'Bia');
    PERFORM pg_temp.vota(m, iA5, u4, 'ABSTENCAO');
    j := pg_temp.item_apurado(a, iA5);
    PERFORM pg_temp.confere(j ->> 'resultado' = 'SEM_DECISAO' AND j -> 'vencedora' = 'null'::jsonb
                        AND (j -> 'porOpcao' -> 'ABSTENCAO' ->> 'fracao')::numeric = 0.4,
        'ESCOLHA empate → SEM_DECISAO (veio ' || coalesce(j::text, '<null>') || ')');
    PERFORM pg_temp.vota(m, iA5, u4, 'Ana');
    j := pg_temp.item_apurado(a, iA5);
    PERFORM pg_temp.confere(j ->> 'resultado' = 'APROVADO' AND j ->> 'vencedora' = 'Ana',
        'ESCOLHA: opção de maior fração, única → APROVADO com vencedora (veio ' || coalesce(j::text, '<null>') || ')');

    ap := public.fn_assembleia_apurar(a);
    PERFORM pg_temp.confere((ap ->> 'total')::numeric = 1.0 AND (ap ->> 'presentesFracao')::numeric = 1.0
                        AND (ap ->> 'presentesUnidades')::int = 4 AND jsonb_array_length(ap -> 'itens') = 5
                        AND ap -> 'itens' -> 0 ->> 'itemId' = iA1::text AND (ap -> 'itens' -> 0 ->> 'ordem')::int = 1
                        AND ap -> 'itens' -> 0 ->> 'quorum' = 'MAIORIA_PRESENTES' AND ap -> 'itens' -> 0 ->> 'tipo' = 'APROVACAO'
                        AND ap -> 'itens' -> 0 ->> 'titulo' = 'Aprovar contas',
        'apuração: cabeçalho (total, presentes) e itens em ordem (veio ' || ap::text || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_apuracao(%L)::text', a));
    PERFORM pg_temp.confere(v = 'ok:' || ap::text, 'invólucro da apuração devolve fn_assembleia_apurar (veio ' || v || ')');

    -- ═══ não-membro recebe 42501 em todos os invólucros ═════════════════════
    FOREACH f IN ARRAY ARRAY[
        format('SELECT public.condominio_assembleia_convocar(%L, %L)::text', a, 'x'),
        format('SELECT public.condominio_assembleia_cancelar(%L, %L, %L)::text', a, 'x', 'x'),
        format('SELECT public.condominio_assembleia_registrar_presenca(%L, %L, %L, NULL, NULL)::text', a, u4, 'PRESENCIAL'),
        format('SELECT public.condominio_assembleia_instalar(%L, 2::smallint, %L, %L, true)::text', a, 'P', 'S'),
        format('SELECT public.condominio_assembleia_lancar_voto(%L, %L, %L)::text', iA1, u4, 'SIM'),
        format('SELECT public.condominio_assembleia_encerrar(%L, NULL, NULL)::text', a),
        format('SELECT public.condominio_assembleia_vincular_ata(%L, %L)::text', a, doc_ata),
        format('SELECT public.condominio_assembleia_apuracao(%L)::text', a),
        format('SELECT public.condominio_assembleia_marcar_impedida(%L, %L, %L)::text', a, u4, 'x'),
        format('SELECT public.condominio_assembleia_cotas_conferidas(%L)::text', a)] LOOP
        v := pg_temp.au(n, f);
        PERFORM pg_temp.confere(v LIKE '42501|%', 'não-membro recebe 42501 em todos os invólucros: ' || f || ' (veio ' || v || ')');
        v := pg_temp.como(NULL, 'anon', f);
        PERFORM pg_temp.confere(v LIKE '42501|%', 'anon não executa os invólucros: ' || f || ' (veio ' || v || ')');
    END LOOP;
    PERFORM pg_temp.confere((SELECT count(*) FROM public.condominio_assembleia_votos WHERE item_id = iA1) = 3
                        AND (SELECT status FROM public.condominio_assembleias WHERE id = a) = 'INSTALADA',
        'não-membro não mudou nada');

    -- ═══ encerrar ═══════════════════════════════════════════════════════════
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_encerrar(%L, %L::jsonb, NULL)::text',
                              a, jsonb_build_object(gen_random_uuid()::text, 'item de outra assembleia')));
    PERFORM pg_temp.confere(v LIKE 'P0001|item_fora|%', 'deliberação de item de outra assembleia recusada (veio ' || v || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_encerrar(%L, %L::jsonb, %L)::text',
                              a, jsonb_build_object(iA1::text, 'Contas rejeitadas; refazer.', iA5::text, 'Ana eleita.'),
                              'Sem mais assuntos.'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'encerrar A (veio ' || v || ')');
    SELECT retrato INTO ret FROM public.condominio_assembleias WHERE id = a;
    PERFORM pg_temp.confere(substr(v, 4)::jsonb = ret, 'encerrar devolve o retrato gravado');
    PERFORM pg_temp.confere((SELECT status FROM public.condominio_assembleias WHERE id = a) = 'ENCERRADA'
                        AND (SELECT observacao_geral FROM public.condominio_assembleias WHERE id = a) = 'Sem mais assuntos.'
                        AND (SELECT deliberacao FROM public.condominio_assembleia_itens WHERE id = iA1) = 'Contas rejeitadas; refazer.'
                        AND (SELECT deliberacao FROM public.condominio_assembleia_itens WHERE id = iA2) IS NULL,
        'encerrar grava status, observação e deliberação por item');
    PERFORM pg_temp.confere(jsonb_build_object('total', ret -> 'total', 'presentesFracao', ret -> 'presentesFracao',
                                               'presentesUnidades', ret -> 'presentesUnidades', 'itens', ret -> 'itens')
                            = public.fn_assembleia_apurar(a)
                        AND ret -> 'itens' = ap -> 'itens',
        'retrato idêntico a fn_assembleia_apurar no instante');
    PERFORM pg_temp.confere(jsonb_array_length(ret -> 'unidades') = 4 AND jsonb_array_length(ret -> 'votos') = 16
                        AND jsonb_array_length(ret -> 'impedidasNaInstalacao') = 1
                        AND ret -> 'impedidasNaInstalacao' -> 0 ->> 'unitId' = u1::text
                        AND ret -> 'cabecalho' ->> 'presidente' = 'Maria Presidente'
                        AND (ret -> 'cabecalho' ->> 'convocacao')::int = 1
                        AND ret -> 'cabecalho' ->> 'observacaoGeral' = 'Sem mais assuntos.'
                        AND ret -> 'cabecalho' ->> 'condominioCnpj' = '12.345.678/0001-90'
                        -- nome do edital (razão social, senão o nome) congelado no retrato
                        AND ret -> 'cabecalho' ->> 'condominio' = 'Condomínio Residencial Teste A2'
                        AND ret -> 'cabecalho' -> 'instaladaPor' ->> 'id' = m::text
                        AND ret -> 'cabecalho' -> 'instaladaPor' ->> 'papel' = 'GESTOR'
                        AND (ret -> 'cabecalho' -> 'instaladaPor' ->> 'em')::timestamptz
                            = (SELECT instalada_em FROM public.condominio_assembleias WHERE id = a)
                        AND ret -> 'cabecalho' -> 'instaladaPor' ? 'nome'
                        AND ret -> 'cabecalho' -> 'instaladaPor' -> 'nome'
                            = coalesce(to_jsonb((SELECT p.name FROM public.profiles p WHERE p.id = m)), 'null'::jsonb)
                        AND ret -> 'cabecalho' -> 'editalConfirmadoPor' ->> 'id' = m::text
                        AND ret -> 'cabecalho' -> 'editalConfirmadoPor' ? 'nome'
                        AND (ret -> 'cabecalho' -> 'editalConfirmadoPor' ->> 'em')::timestamptz
                            = (SELECT edital_entregue_em FROM public.condominio_assembleias WHERE id = a)
                        AND ret -> 'deliberacoes' ->> iA5::text = 'Ana eleita.'
                        AND EXISTS (SELECT 1 FROM jsonb_array_elements(ret -> 'votos') x
                                     WHERE x ->> 'itemId' = iA4::text AND x ->> 'unitId' = u2::text AND x ->> 'origem' = 'PRESENCIAL')
                        AND EXISTS (SELECT 1 FROM jsonb_array_elements(ret -> 'unidades') x
                                     WHERE x ->> 'unitId' = u3::text AND x ->> 'presenca' = 'PROCURADOR'
                                       AND x ->> 'procurador' = 'Procurador X'),
        'retrato: presença por unidade, voto por unidade/item com origem, impedidas, cabeçalho (veio ' || ret::text || ')');

    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_encerrar(%L, NULL, NULL)::text', a));
    PERFORM pg_temp.confere((v LIKE 'P0001|estado|%' OR v LIKE '23514|assembleia_travada|%') AND v LIKE '%já foi encerrada%',
        'encerrar duas vezes → 2ª recebe assembleia_travada ou estado (veio ' || v || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_lancar_voto(%L, %L, %L)::text', iA1, u3, 'NAO'));
    PERFORM pg_temp.confere(v LIKE 'P0001|estado|%', 'encerrada não aceita voto (veio ' || v || ')');
    v := pg_temp.presenca(m, a, u3, NULL);
    PERFORM pg_temp.confere(v LIKE 'P0001|estado|%', 'encerrada não aceita presença (veio ' || v || ')');

    -- ═══ vincular ata ═══════════════════════════════════════════════════════
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_vincular_ata(%L, %L)::text', a, doc_outro));
    PERFORM pg_temp.confere(v LIKE 'P0001|documento_invalido|%', 'ata: documento fora da categoria ATA recusado (veio ' || v || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_vincular_ata(%L, %L)::text', a, doc_ata_outro));
    PERFORM pg_temp.confere(v LIKE 'P0001|documento_invalido|%', 'ata: documento de outro condomínio recusado (veio ' || v || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_vincular_ata(%L, %L)::text', a, doc_ata));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (SELECT ata_documento_id FROM public.condominio_assembleias WHERE id = a) = doc_ata
                        AND (SELECT retrato FROM public.condominio_assembleias WHERE id = a) = ret,
        'ata vinculada (e o retrato não muda) (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT array_agg(DISTINCT evento ORDER BY evento) FROM public.condominio_assembleia_eventos
                              WHERE assembleia_id = a AND papel = 'GESTOR' AND ator = m)
                            = ARRAY['ATA_VINCULADA', 'CONVOCADA', 'ENCERRADA', 'INSTALADA', 'PRESENCA', 'VOTO_LANCADO'],
        'eventos de cada ação com ator e papel (veio ' || coalesce((SELECT array_agg(DISTINCT evento ORDER BY evento)::text
            FROM public.condominio_assembleia_eventos WHERE assembleia_id = a), '<nada>') || ')');

    -- ═══ decisão 3 da revisão: excluir aviso / ata de assembleia convocada ══
    v := pg_temp.pg(format('DELETE FROM public.condominio_avisos WHERE id = %L RETURNING 1',
                           (SELECT aviso_id FROM public.condominio_assembleias WHERE id = a)));
    PERFORM pg_temp.confere(v LIKE '23514|assembleia_travada||Este aviso ou documento pertence a uma assembleia convocada e não pode ser excluído.',
        'excluir o aviso da convocação: recusa com a mensagem própria (veio ' || v || ')');
    v := pg_temp.pg(format('DELETE FROM public.condominio_documentos WHERE id = %L RETURNING 1', doc_ata));
    PERFORM pg_temp.confere(v LIKE '23514|assembleia_travada||Este aviso ou documento pertence a uma assembleia convocada e não pode ser excluído.',
        'excluir o documento da ata: recusa com a mensagem própria (veio ' || v || ')');

    -- ═══ 2ª convocação: só a partir do horário ══════════════════════════════
    v := pg_temp.au(m, format(nova, e, 'AGO', 'Assembleia B', p1, p2));
    b := substr(v, 4)::uuid;
    iB1 := substr(pg_temp.au(m, format(item, b, 1, 'Orçamento', 'APROVACAO', NULL, 'MAIORIA_PRESENTES')), 4)::uuid;
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_convocar(%L, %L)::text', b, 'Edital B'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'convocar B (veio ' || v || ')');
    -- 1ª às "19:00", 2ª às "19:30", agora "19:10" (relativo a now(): o código não tem relógio falso).
    PERFORM pg_temp.desloca(b, now() - interval '10 minutes', now() + interval '20 minutes');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_instalar(%L, 2::smallint, %L, %L, true)::text', b, 'P', 'S'));
    PERFORM pg_temp.confere(v LIKE 'P0001|antes_do_horario|%', '2ª recusada antes do horário (veio ' || v || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_instalar(%L, 1::smallint, %L, %L, true)::text', b, 'P', 'S'));
    PERFORM pg_temp.confere(v LIKE 'P0001|sem_quorum_primeira|%', 'B sem ninguém: 1ª recusada (veio ' || v || ')');
    PERFORM pg_temp.desloca(b, now() - interval '40 minutes', now() - interval '10 minutes');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_instalar(%L, 2::smallint, %L, %L, true)::text', b, 'P', 'S'));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (SELECT instalada_convocacao FROM public.condominio_assembleias WHERE id = b) = 2,
        '2ª aceita a partir do horário, com qualquer número (veio ' || v || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_cancelar(%L, %L, %L)::text', b, 'Motivo', 'Corpo'));
    PERFORM pg_temp.confere(v LIKE 'P0001|estado|%', 'instalada não se cancela (veio ' || v || ')');

    -- ═══ cancelar ═══════════════════════════════════════════════════════════
    v := pg_temp.au(m, format(nova, e, 'AGE', 'Assembleia C', p1, p2));
    c := substr(v, 4)::uuid;
    iC1 := substr(pg_temp.au(m, format(item, c, 1, 'Pintura', 'APROVACAO', NULL, 'MAIORIA_PRESENTES')), 4)::uuid;
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_cancelar(%L, %L, %L)::text', c, 'Motivo', 'Corpo'));
    PERFORM pg_temp.confere(v LIKE 'P0001|estado|%', 'rascunho não se cancela (exclui-se) (veio ' || v || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_convocar(%L, %L)::text', c, 'Edital C'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'convocar C (veio ' || v || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_cancelar(%L, %L, %L)::text', c, '  ', 'Corpo'));
    PERFORM pg_temp.confere(v LIKE 'P0001|sem_motivo|%', 'cancelar exige motivo (veio ' || v || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_cancelar(%L, %L, %L)::text', c, 'Síndico renunciou', 'A assembleia foi cancelada.'));
    PERFORM pg_temp.confere(v LIKE 'ok:%'
                        AND (SELECT status || '/' || motivo_cancelamento FROM public.condominio_assembleias WHERE id = c) = 'CANCELADA/Síndico renunciou'
                        AND EXISTS (SELECT 1 FROM public.condominio_avisos WHERE empreendimento_id = e AND categoria = 'ASSEMBLEIA'
                                       AND titulo = 'Cancelada: Assembleia C' AND corpo = 'A assembleia foi cancelada.')
                        AND EXISTS (SELECT 1 FROM public.condominio_assembleia_eventos WHERE assembleia_id = c AND evento = 'CANCELADA' AND ator = m),
        'cancelar: status, motivo e aviso ''Cancelada: …'' (veio ' || v || ')');
    v := pg_temp.au(m, format('SELECT public.condominio_assembleia_cancelar(%L, %L, %L)::text', c, 'De novo', 'x'));
    PERFORM pg_temp.confere(v LIKE 'P0001|estado|%', 'cancelar duas vezes recusa (veio ' || v || ')');

    -- ═══ privilégios: núcleo fora da API, invólucros só para authenticated ══
    v := pg_temp.au(m, format('SELECT public._assembleia_convocar(%L, %L, %L, ''GESTOR'')::text', d, 'x', m));
    PERFORM pg_temp.confere(v LIKE '42501|%', 'authenticated não executa _assembleia_convocar (veio ' || v || ')');
    v := pg_temp.au(m, format('SELECT public.fn_assembleia_unidade_impedida(%L)', u1));
    PERFORM pg_temp.confere(v LIKE '42501|%', 'authenticated não executa fn_assembleia_unidade_impedida (veio ' || v || ')');
    PERFORM pg_temp.confere(
        (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
            AND p.proname IN ('_assembleia_convocar', '_assembleia_cancelar', '_assembleia_registrar_presenca',
                              '_assembleia_instalar', '_assembleia_lancar_voto', '_assembleia_encerrar',
                              '_assembleia_vincular_ata', 'fn_assembleia_apurar', 'fn_assembleia_unidade_impedida',
                              '_assembleia_marcar_impedida', 'fn_assembleia_impedimento', 'fn_assembleia_cotas_conferidas')) = 12
        AND (SELECT bool_and(NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                         AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
                         AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                                          WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE')
                         AND p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig))
               FROM pg_proc p
              WHERE p.pronamespace = 'public'::regnamespace
                AND (p.proname LIKE '\_assembleia\_%' OR p.proname LIKE 'fn\_assembleia\_%')
                AND p.proname <> 'fn_assembleia_opcoes_validas'),
        'anon/authenticated não executam _assembleia_* nem fn_assembleia_* (SECURITY DEFINER, search_path fixo, fora de PUBLIC)');
    PERFORM pg_temp.confere(
        (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
            AND p.proname IN ('condominio_assembleia_convocar', 'condominio_assembleia_cancelar',
                              'condominio_assembleia_registrar_presenca', 'condominio_assembleia_instalar',
                              'condominio_assembleia_lancar_voto', 'condominio_assembleia_encerrar',
                              'condominio_assembleia_vincular_ata', 'condominio_assembleia_apuracao',
                              'condominio_assembleia_marcar_impedida', 'condominio_assembleia_cotas_conferidas')
            AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
            AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
            AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                             WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE')
            AND p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig)) = 10,
        'os 10 invólucros: authenticated executa; anon e PUBLIC não');
    PERFORM pg_temp.confere(NOT has_column_privilege('authenticated', 'public.condominio_assembleia_unidades', 'impedimento_manual', 'UPDATE')
                        AND NOT has_column_privilege('authenticated', 'public.condominio_assembleia_unidades', 'impedimento_manual', 'INSERT')
                        AND has_column_privilege('authenticated', 'public.condominio_assembleia_unidades', 'impedimento_manual', 'SELECT'),
        'impedimento_manual: o app só lê (marca só pela RPC)');
    PERFORM pg_temp.confere(
        (SELECT NOT has_function_privilege('anon', p.oid, 'EXECUTE')
            AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                             WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE')
           FROM pg_proc p WHERE p.oid = 'public.fn_assembleia_opcoes_validas(text[])'::regprocedure),
        'fn_assembleia_opcoes_validas (do CHECK) fora de PUBLIC/anon');
    PERFORM pg_temp.confere(NOT has_table_privilege('authenticated', 'public.condominio_assembleias', 'INSERT')
                        AND NOT has_table_privilege('authenticated', 'public.condominio_assembleias', 'UPDATE')
                        AND has_table_privilege('authenticated', 'public.condominio_assembleias', 'SELECT')
                        AND has_table_privilege('authenticated', 'public.condominio_assembleias', 'DELETE')
                        AND has_column_privilege('authenticated', 'public.condominio_assembleias', 'titulo', 'UPDATE')
                        AND NOT has_column_privilege('authenticated', 'public.condominio_assembleias', 'status', 'UPDATE')
                        AND NOT has_column_privilege('authenticated', 'public.condominio_assembleias', 'organization_id', 'INSERT'),
        'assembleia: INSERT/UPDATE só por coluna; SELECT/DELETE como na A1');
END $$;

ROLLBACK;

SELECT 'TUDO OK' AS resultado;
