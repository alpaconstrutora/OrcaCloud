-- scripts/teste-diario-registrado-por.sql
-- Prova do "registrado por" / "editado por" do Diário de Obras
-- (docs/planos/2026-11-11-link-celular-tarefas-diario.md,
--  ### Ajustes — Diário: registrado por (2026-11-13);
--  migration aplicar_20271113300000_diario_registrado_por.sql).
--
--   1. membro cria → registradoPor = membro {id, nome, em}; sem editadoPor;
--      registradoPor/editadoPor forjados em p_entry descartados;
--   2. admin edita → registradoPor intacto, editadoPor = admin (nome pela
--      org, quando o perfil não tem nome); forjados descartados na edição;
--   3. pelo link (celular_diario_salvar como anon) → carimbo do dono do link;
--   4. registro antigo sem carimbo editado → registradoPor segue ausente,
--      editadoPor carimbado (nome pela parte local do e-mail);
--   5. excluir segue igual; aprovação segue valendo;
--   6. Portal do Cliente (client_portal_get_data) não devolve a autoria.
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …';
-- sucesso = a linha final 'TUDO OK' (`db query` só devolve o último resultado).
--
--   npx supabase db query --linked -f scripts/teste-diario-registrado-por.sql
--
-- Para ensaiar a migration ANTES de aplicá-la, gere um arquivo com o conteúdo de
--   supabase/migrations/aplicar_20271113300000_diario_registrado_por.sql
-- no lugar da linha MIGRATION abaixo. Sem ela, a prova falha no carimbo da
-- criação ("FALHOU: criar: registradoPor = membro …").

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

-- Roda p_sql como p_papel (anon/authenticated) com as claims de p_user e devolve
-- 'ok:<resultado>' ou '<SQLSTATE>:<mensagem>'.
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

-- O registro p_id gravado em settings.diaryEntries do projeto p_proj.
CREATE FUNCTION pg_temp.reg(p_proj UUID, p_id TEXT) RETURNS JSONB LANGUAGE sql AS $$
    SELECT e FROM public.projects p, jsonb_array_elements(coalesce(p.settings -> 'diaryEntries', '[]'::jsonb)) e
     WHERE p.id = p_proj AND e ->> 'id' = p_id
$$;

-- Carimbo esperado: {id, nome, em = now() em ISO UTC} (now() é fixo na transação).
CREATE FUNCTION pg_temp.carimbo(p_user UUID, p_nome TEXT) RETURNS JSONB LANGUAGE sql AS $$
    SELECT jsonb_build_object('id', p_user, 'nome', p_nome,
                              'em', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
$$;

DO $$
DECLARE
    org CONSTANT UUID := '926cf626-ba49-4ee4-9f35-472822fb90e6';
    msg_aprovar CONSTANT TEXT := '42501:Aprovar ou recusar registro do diário exige a permissão de aprovação '
                              || '(Usuários › Permissões Detalhadas › Operação de Obra).';
    salvar  CONSTANT TEXT := 'SELECT public.diary_upsert_entry(%L::uuid, %L::jsonb)::text';
    excluir CONSTANT TEXT := 'SELECT public.diary_delete_entry(%L::uuid, %L::text)::text';
    cel_salvar CONSTANT TEXT := 'SELECT public.celular_diario_salvar(%L, %L::uuid, %L::jsonb)::text';
    forjado CONSTANT JSONB := jsonb_build_object(
        'registradoPor', jsonb_build_object('id', '00000000-0000-0000-0000-000000000001', 'nome', 'Forjado', 'em', '2000-01-01T00:00:00.000Z'),
        'editadoPor',    jsonb_build_object('id', '00000000-0000-0000-0000-000000000002', 'nome', 'Forjado', 'em', '2000-01-01T00:00:00.000Z'));
    e1  CONSTANT JSONB := '{"id": "tra-1", "date": "2026-11-12", "status": "Rascunho", "notes": "primeiro"}';
    e1b CONSTANT JSONB := '{"id": "tra-1", "date": "2026-11-12", "status": "Rascunho", "notes": "editado"}';
    e2  CONSTANT JSONB := '{"id": "tra-2", "date": "2026-11-11", "status": "Rascunho", "notes": "pelo link"}';
    e_velho CONSTANT JSONB := '{"id": "tra-v", "date": "2026-10-01", "status": "Rascunho", "notes": "antigo"}';
    m UUID; g UUID; d1 UUID; d2 UUID; cli UUID; tk TEXT; tk_cli TEXT;
    nome_m CONSTANT TEXT := 'TV Autor M';
    nome_g CONSTANT TEXT := 'TV Admin G';
    email_g TEXT;
    v TEXT; r JSONB; reg JSONB; reg_m JSONB; j JSONB;
BEGIN
    -- ── fixtures ─────────────────────────────────────────────────────────────
    -- m: membro comum SEM canApproveDiary. Perfil com nome = nome_m e outro nome
    -- na org: o perfil vem primeiro.
    SELECT au.id INTO m
      FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
     WHERE om.organization_id = org AND om.role = 'member' AND nullif(btrim(au.email), '') IS NOT NULL
       AND NOT coalesce((om.permissions ->> 'canApproveDiary')::boolean, false)
       AND NOT EXISTS (SELECT 1 FROM public.superadmins sa WHERE sa.email = lower(au.email))
     ORDER BY au.id LIMIT 1;
    PERFORM pg_temp.confere(m IS NOT NULL, 'fixture: membro comum m');
    INSERT INTO public.profiles (id, name) VALUES (m, nome_m)
        ON CONFLICT (id) DO UPDATE SET name = excluded.name;
    UPDATE public.organization_members SET name = 'TV nome da org de M' WHERE organization_id = org AND user_id = m;
    -- g: conta não superadmin, fora da org, posta como admin com nome na org e
    -- SEM nome no perfil (o carimbo cai no nome da org).
    SELECT au.id, au.email INTO g, email_g FROM auth.users au
     WHERE NOT EXISTS (SELECT 1 FROM public.superadmins sa WHERE sa.email = lower(au.email))
       AND NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = org AND om.user_id = au.id)
       AND nullif(btrim(au.email), '') IS NOT NULL AND au.id <> m
     ORDER BY au.id LIMIT 1;
    PERFORM pg_temp.confere(g IS NOT NULL, 'fixture: conta g para admin');
    DELETE FROM public.profiles WHERE id = g;
    INSERT INTO public.organization_members (organization_id, user_id, email, role, name)
    VALUES (org, g, email_g, 'admin', nome_g);

    INSERT INTO public.projects (name, user_id, organization_id, settings)
    VALUES ('TRA diário', g, org, jsonb_build_object('classification', 'DIARIO', 'organizationId', org))
    RETURNING id INTO d1;

    -- ── 1. membro cria (com carimbos forjados no payload) ───────────────────
    v := pg_temp.como(m, 'authenticated', format(salvar, d1, e1 || forjado));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'criar: membro salva (veio ' || v || ')');
    r := substr(v, 4)::jsonb;
    reg := pg_temp.reg(d1, 'tra-1');
    PERFORM pg_temp.confere(reg -> 'registradoPor' = pg_temp.carimbo(m, nome_m),
        'criar: registradoPor = membro (veio ' || coalesce(reg::text, '<null>') || ')');
    PERFORM pg_temp.confere(NOT (reg ? 'editadoPor'), 'criar: sem editadoPor (forjado descartado) (veio ' || reg::text || ')');
    PERFORM pg_temp.confere(reg - 'registradoPor' = e1, 'criar: o resto do registro é o que o membro mandou');
    PERFORM pg_temp.confere(r -> 'entries' = jsonb_build_array(reg) AND r -> 'anterior' = 'null'::jsonb,
        'criar: o retorno traz o registro carimbado (o front usa o retorno) (veio ' || r::text || ')');
    reg_m := reg -> 'registradoPor';

    -- ── 2. admin edita (com carimbos forjados) ──────────────────────────────
    v := pg_temp.como(g, 'authenticated', format(salvar, d1, e1b || forjado));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'editar: admin salva (veio ' || v || ')');
    r := substr(v, 4)::jsonb;
    reg := pg_temp.reg(d1, 'tra-1');
    PERFORM pg_temp.confere(reg -> 'registradoPor' = reg_m, 'editar: registradoPor intacto (veio ' || reg::text || ')');
    PERFORM pg_temp.confere(reg -> 'editadoPor' = pg_temp.carimbo(g, nome_g),
        'editar: editadoPor = admin, nome pela org (veio ' || reg::text || ')');
    PERFORM pg_temp.confere(reg - 'registradoPor' - 'editadoPor' = e1b, 'editar: o resto é o que o admin mandou');
    PERFORM pg_temp.confere(r -> 'anterior' -> 'registradoPor' = reg_m AND NOT (r -> 'anterior' ? 'editadoPor'),
        'editar: anterior = o registro como estava (veio ' || r::text || ')');
    -- Editar de novo, agora o membro: editadoPor passa a ser ele; registradoPor segue.
    v := pg_temp.como(m, 'authenticated', format(salvar, d1, e1));
    reg := pg_temp.reg(d1, 'tra-1');
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND reg -> 'registradoPor' = reg_m AND reg -> 'editadoPor' = pg_temp.carimbo(m, nome_m),
        'reeditar: editadoPor = quem editou por último (veio ' || v || ')');

    -- ── 3. pelo link do celular ──────────────────────────────────────────────
    v := pg_temp.como(m, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', m, org));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'fixture: link de m (veio ' || v || ')');
    tk := substr(v, 4);
    v := pg_temp.como(NULL, 'anon', format(cel_salvar, tk, d1, e2 || forjado));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'link: salva (veio ' || v || ')');
    reg := pg_temp.reg(d1, 'tra-2');
    PERFORM pg_temp.confere(reg -> 'registradoPor' = pg_temp.carimbo(m, nome_m) AND NOT (reg ? 'editadoPor'),
        'link: registradoPor = dono do link, forjados descartados (veio ' || coalesce(reg::text, '<null>') || ')');
    v := pg_temp.como(NULL, 'anon', format(cel_salvar, tk, d1, e2 || '{"notes": "editado pelo link"}'));
    reg := pg_temp.reg(d1, 'tra-2');
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND reg -> 'editadoPor' = pg_temp.carimbo(m, nome_m)
                            AND reg -> 'registradoPor' = pg_temp.carimbo(m, nome_m),
        'link: edição carimba editadoPor = dono do link (veio ' || v || ')');

    -- ── 4. registro antigo, sem carimbo ─────────────────────────────────────
    -- Sem nome no perfil nem na org: o nome cai na parte local do e-mail.
    UPDATE public.organization_members SET name = NULL WHERE organization_id = org AND user_id = g;
    INSERT INTO public.projects (name, user_id, organization_id, settings)
    VALUES ('TRA diário antigo', g, org, jsonb_build_object('classification', 'DIARIO', 'organizationId', org,
                'diaryEntries', jsonb_build_array(e_velho)))
    RETURNING id INTO d2;
    v := pg_temp.como(g, 'authenticated', format(salvar, d2, e_velho || '{"notes": "mexido"}'));
    reg := pg_temp.reg(d2, 'tra-v');
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND NOT (reg ? 'registradoPor'),
        'antigo: registradoPor segue ausente (veio ' || coalesce(reg::text, v) || ')');
    PERFORM pg_temp.confere(reg -> 'editadoPor' = pg_temp.carimbo(g, split_part(email_g, '@', 1)),
        'antigo: editadoPor = admin, nome pela parte local do e-mail (veio ' || reg::text || ')');
    -- Forjar registradoPor num registro antigo também não pega.
    v := pg_temp.como(g, 'authenticated', format(salvar, d2, e_velho || forjado));
    reg := pg_temp.reg(d2, 'tra-v');
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND NOT (reg ? 'registradoPor'),
        'antigo: registradoPor forjado na edição é descartado (veio ' || coalesce(reg::text, v) || ')');

    -- ── 5. excluir segue igual; aprovação segue valendo ─────────────────────
    reg := pg_temp.reg(d1, 'tra-2');
    v := pg_temp.como(m, 'authenticated', format(excluir, d1, 'tra-2'));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (substr(v, 4)::jsonb) -> 'anterior' = reg
                            AND pg_temp.reg(d1, 'tra-2') IS NULL
                            AND pg_temp.reg(d1, 'tra-1') IS NOT NULL,
        'excluir: tira só o registro, anterior = ele como estava (veio ' || v || ')');
    v := pg_temp.como(m, 'authenticated', format(salvar, d1, e1 || '{"status": "Aprovado"}'));
    PERFORM pg_temp.confere(v = msg_aprovar, 'aprovação: membro sem a chave aprovando → 42501 (veio ' || v || ')');
    PERFORM pg_temp.confere(pg_temp.reg(d1, 'tra-1') ->> 'status' = 'Rascunho', 'aprovação: recusa não mexeu no registro');

    -- ── 6. Portal do Cliente não devolve a autoria ──────────────────────────
    INSERT INTO public.clients (name, organization_id) VALUES ('TRA cliente', org) RETURNING id INTO cli;
    UPDATE public.projects
       SET settings = settings || jsonb_build_object('clientId', cli)
     WHERE id = d1;
    PERFORM pg_temp.confere(pg_temp.reg(d1, 'tra-1') ? 'registradoPor', 'fixture: o diário do cliente tem registro carimbado');
    INSERT INTO public.client_portal_tokens (client_id, org_id) VALUES (cli, org) RETURNING token INTO tk_cli;
    v := pg_temp.como(NULL, 'anon', format('SELECT public.client_portal_get_data(%L)::text', tk_cli));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'portal: lê (veio ' || left(v, 300) || ')');
    j := substr(v, 4)::jsonb;
    PERFORM pg_temp.confere((j -> 'project' ->> 'id')::uuid = d1, 'portal: o projeto é o diário do cliente');
    PERFORM pg_temp.confere(jsonb_array_length(j -> 'project' -> 'settings' -> 'diaryEntries') = 1
                            AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j -> 'project' -> 'settings' -> 'diaryEntries') e
                                             WHERE e ? 'registradoPor' OR e ? 'editadoPor'),
        'portal: registros sem registradoPor/editadoPor (veio ' || (j -> 'project' -> 'settings' -> 'diaryEntries')::text || ')');
    PERFORM pg_temp.confere((j -> 'project' -> 'settings' -> 'diaryEntries' -> 0)
                            = pg_temp.reg(d1, 'tra-1') - 'registradoPor' - 'editadoPor',
        'portal: o resto do registro vem igual');
    PERFORM pg_temp.confere((j -> 'project' -> 'settings') - 'diaryEntries'
                            = (SELECT settings - 'diaryEntries' FROM public.projects WHERE id = d1),
        'portal: o resto de settings vem igual');
    PERFORM pg_temp.confere(has_function_privilege('anon', 'public.client_portal_get_data(text)', 'EXECUTE')
                            AND has_function_privilege('authenticated', 'public.client_portal_get_data(text)', 'EXECUTE'),
        'portal: anon e authenticated seguem executando');
END $$;

ROLLBACK;

SELECT 'TUDO OK' AS resultado;
