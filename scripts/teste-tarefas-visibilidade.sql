-- scripts/teste-tarefas-visibilidade.sql
-- Prova: quem vê uma tarefa é quem a criou, o responsável, os Envolvidos (só consulta) e o
-- proprietário/admin da organização da tarefa — e este só se ela tem responsável ou está
-- num espaço (sem responsável e fora de espaço = agenda pessoal). Espaço não dá visão.
-- Editar: criador tudo; owner/admin tudo no que vê (menos deixar a tarefa como agenda
-- pessoal de outro); responsável só conteúdo; envolvido nada. Apagar: só quem criou.
-- Envolvidos: geridos pelo criador e pelo owner/admin no que vê. Link = app.
-- Migration: supabase/migrations/aplicar_20271112998000_tarefas_visibilidade_por_responsavel.sql
-- Plano: docs/planos/2026-11-11-link-celular-tarefas-diario.md
--        (Ajustes — visibilidade pelo responsável, 2026-11-12).
--
-- Personagens (org 926cf626, contas reais com papel `member`, fora de superadmins):
--   c  — cria todas as tarefas de teste e é dono do espaço S;
--   r  — responsável (colaborador vinculado a ele por employees.user_id);
--   en — envolvido (colaborador com o e-mail da conta dele);
--   sm — membro do espaço S, nada mais (cria T_SM no espaço);
--   g  — conta que não é superadmin, posta como ADMIN da org só nesta transação;
--   sa — um superadmin (owner/admin da org pelos gatilhos de membership).
-- Tarefas (todas de c, menos T_SM):
--   T_P  pessoal (sem responsável, fora de espaço)   T_R  com responsável r, fora de espaço
--   T_S  no espaço S, sem responsável                T_SR no espaço S, com responsável r
--   T_E  pessoal, com en envolvido                   T_SM de sm, no espaço S, sem responsável
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …';
-- sucesso = a linha final 'TUDO OK'. Sem a migration (linha MIGRATION vazia), falha em
-- "sm (membro do espaço) vê só a própria" (é o RED: hoje o espaço dá visão). Com a
-- versão da migration anterior à revisão de 13/11 (gatilho isentava o owner/admin da
-- trava de user_id), falha em "admin não troca a autoria para si".
-- Autoria (user_id, id, created_at): ninguém da API muda — nem criador, nem admin.
--
-- Ensaio (migration ainda não aplicada; o montador tira o BEGIN;/COMMIT; dela):
--   bash scripts/montar-ensaio.sh -o /tmp/e.sql scripts/teste-tarefas-visibilidade.sql \
--        supabase/migrations/aplicar_20271112998000_tarefas_visibilidade_por_responsavel.sql
--   npx supabase db query --linked -f /tmp/e.sql
-- Depois de aplicada:
--   npx supabase db query --linked -f scripts/teste-tarefas-visibilidade.sql

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

-- Roda p_sql como p_papel com as claims de p_user; 'ok:<resultado>' ou '<SQLSTATE>:<mensagem>'.
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

CREATE FUNCTION pg_temp.au(p_user UUID, p_sql TEXT) RETURNS TEXT LANGUAGE sql AS $$
    SELECT pg_temp.como(p_user, 'authenticated', p_sql)
$$;

-- Chama uma celular_* como anon (sem sessão, como o celular).
CREATE FUNCTION pg_temp.cel(p_sql TEXT) RETURNS TEXT LANGUAGE sql AS $$
    SELECT pg_temp.como(NULL, 'anon', p_sql)
$$;

DO $$
DECLARE
    org CONSTANT UUID := '926cf626-ba49-4ee4-9f35-472822fb90e6';
    c UUID; r UUID; en UUID; sm UUID; g UUID; sa UUID;
    e_r UUID; e_en UUID; e_outro UUID; s UUID;
    t_p UUID; t_r UUID; t_s UUID; t_sr UUID; t_e UUID; t_sm UUID;
    vals TEXT; vis TEXT; v TEXT; ref TEXT; u UUID; tk TEXT; j JSONB;
    recusa_resp     CONSTANT TEXT := '42501:o responsável só altera título, descrição, datas, prioridade e status da tarefa';
    recusa_pessoal  CONSTANT TEXT := '42501:só quem criou a tarefa pode deixá-la sem responsável e fora de espaço (ela vira a agenda pessoal de quem a criou)';
    recusa_autoria  CONSTANT TEXT := '42501:a autoria da tarefa não muda: quem a criou, o id e a data de criação ficam como estão';
    upd  CONSTANT TEXT := 'WITH u AS (UPDATE public.tasks SET %s WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u';
    del  CONSTANT TEXT := 'WITH d AS (DELETE FROM public.tasks WHERE id = %L RETURNING 1) SELECT count(*)::text FROM d';
    colab CONSTANT TEXT := 'INSERT INTO public.task_collaborators (task_id, employee_id) VALUES (%L, %L) RETURNING 1::text';
BEGIN
    -- ── fixtures ─────────────────────────────────────────────────────────────
    -- quatro membros comuns, distintos, com e-mail
    FOR u IN
        SELECT au.id FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
         WHERE om.organization_id = org AND om.role = 'member' AND nullif(btrim(au.email), '') IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.superadmins x WHERE x.email = lower(au.email))
           AND NOT EXISTS (SELECT 1 FROM public.organization_members o2
                            WHERE o2.organization_id = org AND o2.user_id = au.id AND o2.role IN ('owner', 'admin'))
         ORDER BY au.id
    LOOP
        IF c IS NULL THEN c := u; ELSIF r IS NULL THEN r := u; ELSIF en IS NULL THEN en := u; ELSIF sm IS NULL THEN sm := u; END IF;
    END LOOP;
    PERFORM pg_temp.confere(sm IS NOT NULL, 'fixture: quatro membros comuns (c, r, en, sm)');
    SELECT au.id INTO g FROM auth.users au
     WHERE NOT EXISTS (SELECT 1 FROM public.superadmins x WHERE x.email = lower(au.email))
       AND NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = org AND om.user_id = au.id)
       AND nullif(btrim(au.email), '') IS NOT NULL
     ORDER BY au.id LIMIT 1;
    PERFORM pg_temp.confere(g IS NOT NULL, 'fixture: conta g para admin');
    INSERT INTO public.organization_members (organization_id, user_id, email, role)
    VALUES (org, g, (SELECT email FROM auth.users WHERE id = g), 'admin');
    SELECT au.id INTO sa FROM public.superadmins x JOIN auth.users au ON lower(au.email) = x.email
     WHERE EXISTS (SELECT 1 FROM public.organization_members om
                    WHERE om.organization_id = org AND om.user_id = au.id AND om.role IN ('owner', 'admin'))
     ORDER BY au.email LIMIT 1;
    PERFORM pg_temp.confere(sa IS NOT NULL, 'fixture: superadmin owner/admin da org');

    INSERT INTO public.employees (org_id, name, user_id, status) VALUES (org, 'TVZ responsável r', r, 'ATIVO') RETURNING id INTO e_r;
    INSERT INTO public.employees (org_id, name, email, status)
    VALUES (org, 'TVZ envolvido en', (SELECT email FROM auth.users WHERE id = en), 'ATIVO') RETURNING id INTO e_en;
    INSERT INTO public.employees (org_id, name, status) VALUES (org, 'TVZ outro', 'ATIVO') RETURNING id INTO e_outro;
    PERFORM pg_temp.confere(public.is_employee_do_usuario_de(r, e_r), 'fixture: e_r é de r');

    INSERT INTO public.task_spaces (org_id, owner_user_id, name) VALUES (org, c, 'TVZ espaço S') RETURNING id INTO s;
    INSERT INTO public.task_space_members (space_id, user_id, role) VALUES (s, sm, 'member') ON CONFLICT DO NOTHING;
    PERFORM pg_temp.confere(public.is_task_space_member_de(sm, s) AND public.is_task_space_member_de(c, s)
                        AND EXISTS (SELECT 1 FROM public.task_space_members WHERE space_id = s AND user_id = c AND role = 'owner'),
        'fixture: c dono (owner) e sm membro do espaço S');

    INSERT INTO public.tasks (org_id, user_id, title, status, priority) VALUES (org, c, 'TVZ P', 'open', 3) RETURNING id INTO t_p;
    INSERT INTO public.tasks (org_id, user_id, title, status, priority, assignee_employee_id) VALUES (org, c, 'TVZ R', 'open', 3, e_r) RETURNING id INTO t_r;
    INSERT INTO public.tasks (org_id, user_id, title, status, priority, space_id) VALUES (org, c, 'TVZ S', 'open', 3, s) RETURNING id INTO t_s;
    INSERT INTO public.tasks (org_id, user_id, title, status, priority, space_id, assignee_employee_id) VALUES (org, c, 'TVZ SR', 'open', 3, s, e_r) RETURNING id INTO t_sr;
    INSERT INTO public.tasks (org_id, user_id, title, status, priority) VALUES (org, c, 'TVZ E', 'open', 3) RETURNING id INTO t_e;
    INSERT INTO public.task_collaborators (task_id, employee_id) VALUES (t_e, e_en);
    INSERT INTO public.tasks (org_id, user_id, title, status, priority, space_id) VALUES (org, sm, 'TVZ SM', 'open', 3, s) RETURNING id INTO t_sm;

    vals := format('(VALUES (''E'', %L::uuid), (''P'', %L::uuid), (''R'', %L::uuid), (''S'', %L::uuid), (''SM'', %L::uuid), (''SR'', %L::uuid)) f(nome, id)',
                   t_e, t_p, t_r, t_s, t_sm, t_sr);
    vis := 'SELECT coalesce(string_agg(f.nome, '','' ORDER BY f.nome), '''') FROM ' || vals || ' JOIN public.tasks t ON t.id = f.id';

    -- ── VER ──────────────────────────────────────────────────────────────────
    v := pg_temp.au(sm, vis);
    PERFORM pg_temp.confere(v = 'ok:SM', 'sm (membro do espaço) vê só a própria — espaço não dá visão (veio ' || v || ')');
    v := pg_temp.au(c, vis);
    PERFORM pg_temp.confere(v = 'ok:E,P,R,S,SR', 'c (criador, dono do espaço) vê as que criou e não a de sm no espaço dele (veio ' || v || ')');
    v := pg_temp.au(r, vis);
    PERFORM pg_temp.confere(v = 'ok:R,SR', 'r (responsável) vê só as de que é responsável (veio ' || v || ')');
    v := pg_temp.au(en, vis);
    PERFORM pg_temp.confere(v = 'ok:E', 'en (envolvido) vê só aquela em que está envolvido (veio ' || v || ')');
    v := pg_temp.au(g, vis);
    PERFORM pg_temp.confere(v = 'ok:R,S,SM,SR', 'g (admin) vê as com responsável e as de espaço; não a agenda pessoal (veio ' || v || ')');
    v := pg_temp.au(sa, vis);
    PERFORM pg_temp.confere(v = 'ok:R,S,SM,SR', 'superadmin (owner/admin da org) = admin: não vê agenda pessoal alheia (veio ' || v || ')');

    -- ── EDITAR ───────────────────────────────────────────────────────────────
    -- envolvido não edita; membro do espaço não edita o que não vê
    v := pg_temp.au(en, format(upd, 'title = ''TVZ x''', t_e));
    PERFORM pg_temp.confere(v = 'ok:0', 'envolvido não edita (veio ' || v || ')');
    v := pg_temp.au(sm, format(upd, 'title = ''TVZ x''', t_s));
    PERFORM pg_temp.confere(v = 'ok:0', 'membro do espaço não edita tarefa alheia do espaço (veio ' || v || ')');
    v := pg_temp.au(sm, format(upd, format('assignee_employee_id = %L', e_outro), t_s));
    PERFORM pg_temp.confere(v = 'ok:0', 'membro do espaço não atribui responsável a tarefa alheia (veio ' || v || ')');
    -- responsável: só conteúdo
    v := pg_temp.au(r, format(upd, 'title = ''TVZ R editada'', status = ''done''', t_r));
    PERFORM pg_temp.confere(v = 'ok:1', 'responsável edita conteúdo (veio ' || v || ')');
    v := pg_temp.au(r, format(upd, format('assignee_employee_id = %L', e_outro), t_r));
    PERFORM pg_temp.confere(v = recusa_resp, 'responsável não troca o responsável (veio ' || v || ')');
    v := pg_temp.au(r, format(upd, format('space_id = %L', s), t_r));
    PERFORM pg_temp.confere(v = recusa_resp, 'responsável não muda o espaço (veio ' || v || ')');
    -- admin: tudo no que vê
    v := pg_temp.au(g, format(upd, format('title = ''TVZ R por g'', status = ''open'', assignee_employee_id = %L, space_id = %L', e_outro, s), t_r));
    PERFORM pg_temp.confere(v = 'ok:1', 'admin edita título, status, responsável e espaço da tarefa que vê (veio ' || v || ')');
    v := pg_temp.au(g, format(upd, 'space_id = NULL', t_r));
    PERFORM pg_temp.confere(v = 'ok:1', 'admin tira do espaço (continua com responsável) (veio ' || v || ')');
    v := pg_temp.au(g, format(upd, 'assignee_employee_id = NULL', t_r));
    PERFORM pg_temp.confere(v = recusa_pessoal, 'admin tirando o responsável de tarefa fora de espaço → recusa explicada (veio ' || v || ')');
    v := pg_temp.au(g, format(upd, 'assignee_employee_id = NULL', t_sr));
    PERFORM pg_temp.confere(v = 'ok:1', 'admin tira o responsável de tarefa de espaço (continua vendo) (veio ' || v || ')');
    v := pg_temp.au(g, format(upd, 'title = ''TVZ x''', t_p));
    PERFORM pg_temp.confere(v = 'ok:0', 'admin não edita agenda pessoal alheia (veio ' || v || ')');
    -- autoria: o admin não toma a tarefa para si (nem a passa a outro) — senão apagaria
    v := pg_temp.au(g, format(upd, format('user_id = %L', g), t_r));
    PERFORM pg_temp.confere(v = recusa_autoria, 'admin não troca a autoria para si (veio ' || v || ')');
    v := pg_temp.au(g, format(upd, format('user_id = %L', sm), t_s));
    PERFORM pg_temp.confere(v = recusa_autoria, 'admin não troca a autoria para um terceiro (veio ' || v || ')');
    v := pg_temp.au(g, format(upd, 'id = gen_random_uuid()', t_r));
    PERFORM pg_temp.confere(v = recusa_autoria, 'admin não troca o id (veio ' || v || ')');
    v := pg_temp.au(g, format(upd, 'created_at = created_at - interval ''1 day''', t_r));
    PERFORM pg_temp.confere(v = recusa_autoria, 'admin não troca o created_at (veio ' || v || ')');
    v := pg_temp.au(sa, format(upd, format('user_id = %L', sa), t_s));
    PERFORM pg_temp.confere(v = recusa_autoria, 'superadmin não troca a autoria (veio ' || v || ')');
    v := pg_temp.au(g, format(del, t_r));
    PERFORM pg_temp.confere(v = 'ok:0' AND (SELECT user_id FROM public.tasks WHERE id = t_r) = c,
        'depois da tentativa, a tarefa segue de c e o admin não apaga (veio ' || v || ')');
    v := pg_temp.au(sa, format(upd, 'title = ''TVZ S por sa''', t_s));
    PERFORM pg_temp.confere(v = 'ok:1', 'superadmin edita tarefa de espaço (veio ' || v || ')');
    v := pg_temp.au(sa, format(upd, 'title = ''TVZ x''', t_e));
    PERFORM pg_temp.confere(v = 'ok:0', 'superadmin não edita agenda pessoal alheia (veio ' || v || ')');
    UPDATE public.tasks SET assignee_employee_id = e_r WHERE id IN (t_r, t_sr);
    -- criador: tudo, inclusive deixar como agenda pessoal
    v := pg_temp.au(c, format(upd, 'assignee_employee_id = NULL', t_r));
    PERFORM pg_temp.confere(v = 'ok:1', 'criador tira o responsável (vira agenda pessoal dele) (veio ' || v || ')');
    v := pg_temp.au(r, format('SELECT count(*)::text FROM public.tasks WHERE id = %L', t_r));
    PERFORM pg_temp.confere(v = 'ok:0', 'sem responsável, o ex-responsável deixa de ver (veio ' || v || ')');
    v := pg_temp.au(c, format(upd, format('assignee_employee_id = %L', e_r), t_r));
    PERFORM pg_temp.confere(v = 'ok:1', 'criador põe o responsável de volta (veio ' || v || ')');
    v := pg_temp.au(c, format(upd, format('user_id = %L', g), t_p));
    PERFORM pg_temp.confere(v = recusa_autoria, 'criador não passa a autoria adiante (veio ' || v || ')');
    v := pg_temp.au(c, format(upd, 'created_at = created_at - interval ''1 day''', t_p));
    PERFORM pg_temp.confere(v = recusa_autoria, 'criador não troca o created_at (veio ' || v || ')');

    -- ── APAGAR: só quem criou ────────────────────────────────────────────────
    v := pg_temp.au(c, format(del, t_sm));
    PERFORM pg_temp.confere(v = 'ok:0', 'dono do espaço não apaga tarefa alheia do espaço (veio ' || v || ')');
    v := pg_temp.au(g, format(del, t_r));
    PERFORM pg_temp.confere(v = 'ok:0', 'admin não apaga (veio ' || v || ')');
    v := pg_temp.au(sa, format(del, t_s));
    PERFORM pg_temp.confere(v = 'ok:0', 'superadmin não apaga o que não criou (veio ' || v || ')');
    v := pg_temp.au(r, format(del, t_r));
    PERFORM pg_temp.confere(v = 'ok:0', 'responsável não apaga (veio ' || v || ')');
    v := pg_temp.au(sm, format(del, t_s));
    PERFORM pg_temp.confere(v = 'ok:0', 'membro do espaço não apaga (veio ' || v || ')');
    v := pg_temp.au(en, format(del, t_e));
    PERFORM pg_temp.confere(v = 'ok:0', 'envolvido não apaga (veio ' || v || ')');

    -- ── ENVOLVIDOS ───────────────────────────────────────────────────────────
    v := pg_temp.au(c, format(colab, t_r, e_outro));
    PERFORM pg_temp.confere(v = 'ok:1', 'criador põe envolvido (veio ' || v || ')');
    v := pg_temp.au(g, format(colab, t_s, e_outro));
    PERFORM pg_temp.confere(v = 'ok:1', 'admin põe envolvido na tarefa que vê (veio ' || v || ')');
    v := pg_temp.au(g, format(colab, t_e, e_outro));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'admin não põe envolvido em agenda pessoal alheia (veio ' || v || ')');
    v := pg_temp.au(sm, format(colab, t_s, e_en));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'membro do espaço não põe envolvido (veio ' || v || ')');
    v := pg_temp.au(r, format(colab, t_r, e_en));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'responsável não põe envolvido (veio ' || v || ')');
    v := pg_temp.au(en, format(colab, t_e, e_outro));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'envolvido não põe envolvido (veio ' || v || ')');
    v := pg_temp.au(en, format('SELECT count(*)::text FROM public.task_collaborators WHERE task_id = %L', t_e));
    PERFORM pg_temp.confere(v = 'ok:1', 'envolvido lê os envolvidos da tarefa (veio ' || v || ')');
    -- t_s tem e_outro (posto por g) e t_e tem e_en: quem não gere nem é envolvido lê 0
    PERFORM pg_temp.confere((SELECT count(*) FROM public.task_collaborators WHERE task_id IN (t_s, t_e)) = 2,
        'fixture: t_s e t_e com um envolvido cada');
    v := pg_temp.au(sm, format('SELECT count(*)::text FROM public.task_collaborators WHERE task_id IN (%L, %L)', t_s, t_e));
    PERFORM pg_temp.confere(v = 'ok:0', 'quem não gere nem é envolvido não lê os envolvidos (sm em t_s/t_e) (veio ' || v || ')');
    v := pg_temp.au(r, format('SELECT count(*)::text FROM public.task_collaborators WHERE task_id = %L', t_e));
    PERFORM pg_temp.confere(v = 'ok:0', 'quem não gere nem é envolvido não lê os envolvidos (r em t_e) (veio ' || v || ')');
    v := pg_temp.au(g, format('WITH d AS (DELETE FROM public.task_collaborators WHERE task_id = %L RETURNING 1) SELECT count(*)::text FROM d', t_s));
    PERFORM pg_temp.confere(v = 'ok:1', 'admin apaga os envolvidos que lê (o TaskForm apaga e reinsere) (veio ' || v || ')');

    -- ── LINK = APP ───────────────────────────────────────────────────────────
    -- Abertas da org pela RLS de cada um = pelo _celular_tarefa_visivel (com as fixtures).
    FOREACH u IN ARRAY ARRAY[c, r, en, sm, g, sa] LOOP
        ref := pg_temp.au(u, format(
            'SELECT coalesce(string_agg(t.id::text, '','' ORDER BY t.id), '''') FROM public.tasks t '
            || 'WHERE t.org_id = %L AND t.status = ''open''', org));
        SELECT 'ok:' || coalesce(string_agg(t.id::text, ',' ORDER BY t.id), '') INTO v
          FROM public.tasks t WHERE t.org_id = org AND t.status = 'open' AND public._celular_tarefa_visivel(u, org, t);
        PERFORM pg_temp.confere(ref LIKE 'ok:%' AND v = ref,
            'paridade link = app para ' || u || ' (RLS ' || length(ref) || ' / link ' || length(v) || ' caracteres)');
    END LOOP;

    -- Pelo token: membro comum (sm), responsável (r) e admin (g).
    v := pg_temp.au(sm, format('SELECT public.mobile_link_generate(%L, %L)', sm, org));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'sm gera o próprio link (veio ' || v || ')');
    tk := substr(v, 4);
    v := pg_temp.cel(format(
        'SELECT coalesce(string_agg(e->>''id'', '','' ORDER BY e->>''id''), '''') FROM jsonb_array_elements(public.celular_tarefas_listar(%L, %L)->''tarefas'') e', tk, s));
    PERFORM pg_temp.confere(v = 'ok:' || t_sm, 'link de sm: no espaço S só a dele (veio ' || v || ')');
    j := (SELECT e FROM jsonb_array_elements(public.celular_espacos_listar(tk)) e WHERE e->>'id' = s::text);
    ref := pg_temp.au(sm, format('SELECT count(*)::text FROM public.tasks t WHERE t.space_id = %L AND t.status = ''open'' AND t.parent_task_id IS NULL', s));
    PERFORM pg_temp.confere(j IS NOT NULL AND 'ok:' || (j->>'open_task_count') = ref AND ref = 'ok:1',
        'link de sm: open_task_count do espaço = o que a RLS entrega (1) (RLS ' || ref || ' / link ' || coalesce(j->>'open_task_count', '-') || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, ''{"title":"TVZ x"}'')::text', tk, t_s));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'link de sm: não edita tarefa alheia do espaço (veio ' || v || ')');

    v := pg_temp.au(r, format('SELECT public.mobile_link_generate(%L, %L)', r, org));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'r gera o próprio link (veio ' || v || ')');
    tk := substr(v, 4);
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, ''{"title":"TVZ R pelo link"}'')->>''title''', tk, t_r));
    PERFORM pg_temp.confere(v = 'ok:TVZ R pelo link', 'link de r: responsável edita o conteúdo (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, %L::jsonb)::text', tk, t_r, jsonb_build_object('assignee_employee_id', e_outro)));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'link de r: responsável não troca o responsável (veio ' || v || ')');

    v := pg_temp.au(g, format('SELECT public.mobile_link_generate(%L, %L)', g, org));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'g gera o próprio link (veio ' || v || ')');
    tk := substr(v, 4);
    v := pg_temp.cel(format(
        'SELECT coalesce(string_agg(e->>''id'', '','' ORDER BY e->>''id''), '''') FROM jsonb_array_elements(public.celular_tarefas_listar(%L, %L)->''tarefas'') e', tk, s));
    SELECT 'ok:' || string_agg(x::text, ',' ORDER BY x::text) INTO ref FROM unnest(ARRAY[t_s, t_sm, t_sr]) x;
    PERFORM pg_temp.confere(v = ref, 'link de g: no espaço S, as três (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, ''{"title":"TVZ x"}'')::text', tk, t_p));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'link de g: não edita agenda pessoal alheia (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, %L::jsonb)::text', tk, t_r, jsonb_build_object('user_id', g)));
    PERFORM pg_temp.confere(v = '22023:campo não aceito: user_id', 'link de g: autoria fora da lista branca (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, %L::jsonb)->>''assignee_employee_id''', tk, t_r, jsonb_build_object('assignee_employee_id', e_outro)));
    PERFORM pg_temp.confere(v = 'ok:' || e_outro, 'link de g: admin troca o responsável (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, ''{"assignee_employee_id":null}'')::text', tk, t_r));
    PERFORM pg_temp.confere(v = recusa_pessoal, 'link de g: tirar o responsável de tarefa fora de espaço → recusa explicada (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, ''{"assignee_employee_id":null}'')->>''assignee_employee_id''', tk, t_sr));
    PERFORM pg_temp.confere(v = 'ok:<null>', 'link de g: tira o responsável de tarefa de espaço (veio ' || v || ')');

    -- ── forma (REGRA #7) ─────────────────────────────────────────────────────
    PERFORM pg_temp.confere(
        (SELECT string_agg(policyname, ',' ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks')
            = 'tasks_delete,tasks_insert,tasks_select,tasks_select_assignee,tasks_select_collaborator,tasks_select_gestor,tasks_update,tasks_update_assignee,tasks_update_gestor'
        AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks'
                         AND cmd <> 'INSERT'
                         AND (coalesce(qual, '') || coalesce(with_check, '')) ~ 'is_task_space_member|task_space_members|is_superadmin'),
        'tasks: sem perna de espaço nem de superadmin fora do INSERT; gestor no lugar do superadmin');
    PERFORM pg_temp.confere(
        has_function_privilege('anon', 'public.minhas_orgs_gestor()', 'EXECUTE')
        AND has_function_privilege('authenticated', 'public.minhas_orgs_gestor()', 'EXECUTE')
        AND has_function_privilege('service_role', 'public.minhas_orgs_gestor()', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.is_org_gestor_de(uuid,uuid)', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public.is_org_gestor_de(uuid,uuid)', 'EXECUTE')
        AND NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                         WHERE p.oid IN ('public.minhas_orgs_gestor()'::regprocedure, 'public.is_org_gestor_de(uuid,uuid)'::regprocedure)
                           AND a.grantee = 0)
        AND (SELECT bool_and(p.prosecdef AND p.provolatile = 's' AND 'search_path=public, pg_temp' = ANY (p.proconfig))
               FROM pg_proc p WHERE p.oid IN ('public.minhas_orgs_gestor()'::regprocedure, 'public.is_org_gestor_de(uuid,uuid)'::regprocedure)),
        'minhas_orgs_gestor: anon/authenticated/service_role sem PUBLIC; is_org_gestor_de: só interno; SECURITY DEFINER STABLE, search_path fixo');
    v := pg_temp.como(NULL, 'anon', 'SELECT count(*)::text FROM public.minhas_orgs_gestor()');
    PERFORM pg_temp.confere(v = 'ok:0', 'anon: minhas_orgs_gestor vazio (veio ' || v || ')');
    v := pg_temp.au(g, format('SELECT (%L::uuid IN (SELECT public.minhas_orgs_gestor()))::text', org));
    PERFORM pg_temp.confere(v = 'ok:true' AND public.is_org_gestor_de(g, org) AND NOT public.is_org_gestor_de(sm, org),
        'gestor: g admin da org sim, sm membro não (conjunto e gêmeo)');
END $$;

ROLLBACK;

SELECT 'TUDO OK' AS resultado;
