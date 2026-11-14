-- scripts/teste-tarefas-responsavel.sql
-- Prova: o RESPONSÁVEL pela tarefa (tasks.assignee_employee_id) vê e edita a
-- tarefa — no app logado (RLS de tasks) e no link do celular (celular_*).
-- Migration: supabase/migrations/aplicar_20271111995000_tarefas_responsavel_ve_e_edita.sql
-- Plano: docs/planos/2026-11-11-link-celular-tarefas-diario.md (Ajustes — responsável).
--
-- Caso real: Iago (f9809eae-…) no link da org 926cf626 (Alpa Construtora e
-- Incorporadora); o colaborador dele é 175d203c-… ("iago Marques", de outra org,
-- compartilhado), com employees.user_id = Iago e e-mail ''.
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …';
-- sucesso = a linha final 'TUDO OK …' (`db query` só devolve o último resultado).
-- A linha final é um SELECT só de leitura, depois do ROLLBACK, com a contagem
-- das tarefas abertas do Iago na org (criador/envolvido + como responsável), só
-- como informação. O Iago é `member`: pela regra de aplicar_20271112998000 ele não
-- tem a perna de owner/admin, e o espaço não dá mais visão.
--
-- Vale com a migration de hoje aplicada e também com
-- aplicar_20271112998000_tarefas_visibilidade_por_responsavel.sql no lugar da
-- linha MIGRATION (ensaio da regra nova).
--
--   npx supabase db query --linked -f scripts/teste-tarefas-responsavel.sql
--
-- Para ensaiar a migration ANTES de aplicá-la, gere um arquivo com o conteúdo
-- dela no lugar da linha MIGRATION abaixo. Sem ela, a prova falha em
-- "Iago vê a tarefa de que é responsável" (é o RED).

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
-- 'ok:<resultado>' ou '<SQLSTATE>:<mensagem>'. O RESET ROLE volta sempre —
-- inclusive no erro, porque o SET LOCAL do subbloco abortado é desfeito junto.
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

-- Chama uma celular_* como anon (sem sessão, como o celular).
CREATE FUNCTION pg_temp.cel(p_sql TEXT) RETURNS TEXT LANGUAGE sql AS $$
    SELECT pg_temp.como(NULL, 'anon', p_sql)
$$;

DO $$
DECLARE
    iago   CONSTANT UUID := 'f9809eae-4935-40b3-bfaa-3879c456c563';
    org    CONSTANT UUID := '926cf626-ba49-4ee4-9f35-472822fb90e6';
    e_iago CONSTANT UUID := '175d203c-666c-45b6-9799-7dcebf086798';
    iago_email TEXT;
    o2 UUID; x UUID; y UUID; y_email TEXT; z UUID; org_vinc UUID; org_z UUID; outra_org UUID;
    u_vazio UUID; u_branco UUID;
    e_outro UUID; e_email UUID; e_vinc_outro UUID; e_vazio UUID; e_branco UUID; e_colab UUID; e_z UUID;
    t_a UUID; t_b UUID; t_y UUID; t_vazio UUID; t_colab UUID; t_z UUID;
    s_iago UUID; p_tr UUID; src_a TEXT;
    st_done UUID; tk TEXT; v TEXT; ref TEXT; tr RECORD;
    sql_conta CONSTANT TEXT := 'SELECT count(*)::text FROM public.tasks t WHERE t.id = %L';
    recusa_resp CONSTANT TEXT := '42501:o responsável só altera título, descrição, datas, prioridade e status da tarefa';
    -- desde a revisão de 13/11 de aplicar_20271112998000, trocar user_id cai antes na trava da autoria
    recusa_autoria CONSTANT TEXT := '42501:a autoria da tarefa não muda: quem a criou, o id e a data de criação ficam como estão';
BEGIN
    SELECT au.email INTO iago_email FROM auth.users au WHERE au.id = iago;
    PERFORM pg_temp.confere(iago_email IS NOT NULL, 'fixture: conta do Iago');
    PERFORM pg_temp.confere(EXISTS (SELECT 1 FROM public.employees e WHERE e.id = e_iago AND e.user_id = iago),
        'fixture: colaborador 175d203c vinculado à conta do Iago (employees.user_id)');

    -- ── fixtures ─────────────────────────────────────────────────────────────
    -- o2: outro membro da org (com conta) — dono das tarefas de teste.
    SELECT om.user_id INTO o2
      FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
     WHERE om.organization_id = org AND om.user_id <> iago
     ORDER BY om.user_id LIMIT 1;
    PERFORM pg_temp.confere(o2 IS NOT NULL, 'fixture: outro membro o2 da org');

    -- x: terceiro membro — nem dono, nem responsável, nem colaborador; e papel
    -- `member` fora de superadmins: owner/admin da org veem toda tarefa com
    -- responsável (aplicar_20271112998000), e o "não vê" deixaria de provar algo.
    SELECT om.user_id INTO x
      FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
     WHERE om.organization_id = org AND om.user_id NOT IN (iago, o2) AND om.role = 'member'
       AND NOT EXISTS (SELECT 1 FROM public.superadmins sa WHERE sa.email = lower(au.email))
     ORDER BY om.user_id LIMIT 1;
    PERFORM pg_temp.confere(x IS NOT NULL, 'fixture: terceiro membro x da org');

    -- y: quarto membro da org, com e-mail, para a perna do e-mail — também
    -- `member` fora de superadmins (como admin, veria a tarefa sem a perna do e-mail).
    SELECT au.id, au.email INTO y, y_email
      FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
     WHERE om.organization_id = org AND au.id NOT IN (iago, o2, x) AND nullif(btrim(au.email), '') IS NOT NULL
       AND om.role = 'member' AND NOT EXISTS (SELECT 1 FROM public.superadmins sa WHERE sa.email = lower(au.email))
       AND public.is_org_member_de(au.id, org)
     ORDER BY au.id LIMIT 1;
    PERFORM pg_temp.confere(y IS NOT NULL, 'fixture: membro y da org com e-mail');

    -- z: conta com e-mail que NÃO é membro da org (Importante 2).
    SELECT au.id INTO z
      FROM auth.users au
     WHERE nullif(btrim(au.email), '') IS NOT NULL AND NOT public.is_org_member_de(au.id, org)
     ORDER BY au.id LIMIT 1;
    PERFORM pg_temp.confere(z IS NOT NULL, 'fixture: conta z fora da org');

    -- Contas sem e-mail útil ('' e '   '), para o assert do e-mail vazio ser
    -- falsificável (Menor 3): sem o nullif(btrim(...)), '' casaria com ''.
    INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), '')    RETURNING id INTO u_vazio;
    INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), '   ') RETURNING id INTO u_branco;

    -- Espaço do Iago na org (o gatilho seed_space_owner_member o põe como membro)
    -- e uma obra da org — destinos das tentativas de tomar a tarefa (Crítico 1).
    INSERT INTO public.task_spaces (org_id, owner_user_id, name) VALUES (org, iago, 'TR espaço do Iago') RETURNING id INTO s_iago;
    PERFORM pg_temp.confere(public.is_task_space_member_de(iago, s_iago), 'fixture: Iago membro do próprio espaço');
    INSERT INTO public.projects (name, organization_id, user_id) VALUES ('TR obra', org, o2) RETURNING id INTO p_tr;
    SELECT o.id INTO outra_org FROM public.organizations o WHERE o.id <> org ORDER BY o.id LIMIT 1;

    -- Colaboradores de teste (org do link, ATIVO):
    --   e_outro      — para quem o Iago tentaria passar a tarefa;
    --   e_email      — sem user_id, e-mail = o de y (com espaço e caixa alta);
    --   e_vinc_outro — e-mail de y, mas user_id = x (vínculo explícito manda);
    --   e_vazio / e_branco — sem user_id, e-mail '' / '   ';
    --   e_colab      — e-mail do Iago, colaborador (não responsável) de t_colab.
    INSERT INTO public.employees (org_id, name, status) VALUES (org, 'TR outro colaborador', 'ATIVO') RETURNING id INTO e_outro;
    INSERT INTO public.employees (org_id, name, email, status)
    VALUES (org, 'TR colaborador pelo e-mail', '  ' || upper(y_email) || ' ', 'ATIVO') RETURNING id INTO e_email;
    SELECT o.id INTO org_vinc FROM public.organizations o
     WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.org_id = o.id AND e.user_id = x)
     ORDER BY o.id LIMIT 1;
    INSERT INTO public.employees (org_id, name, email, user_id, status)
    VALUES (org_vinc, 'TR vinculado a x com e-mail de y', y_email, x, 'ATIVO') RETURNING id INTO e_vinc_outro;
    INSERT INTO public.employees (org_id, name, email, status) VALUES (org, 'TR e-mail vazio', '', 'ATIVO') RETURNING id INTO e_vazio;
    INSERT INTO public.employees (org_id, name, email, status) VALUES (org, 'TR e-mail em branco', '   ', 'ATIVO') RETURNING id INTO e_branco;
    INSERT INTO public.employees (org_id, name, email, status) VALUES (org, 'TR colaborador Iago', iago_email, 'ATIVO') RETURNING id INTO e_colab;
    --   e_z — vinculado (user_id) à conta z, que não é membro da org da tarefa.
    SELECT o.id INTO org_z FROM public.organizations o
     WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.org_id = o.id AND e.user_id = z)
     ORDER BY o.id LIMIT 1;
    INSERT INTO public.employees (org_id, name, user_id, status) VALUES (org_z, 'TR vinculado a z', z, 'ATIVO') RETURNING id INTO e_z;

    -- Tarefas abertas de o2, fora de espaço, na org do link.
    INSERT INTO public.tasks (org_id, user_id, title, status, priority, assignee_employee_id)
    VALUES (org, o2, 'TR Iago responsável (app)', 'open', 3, e_iago) RETURNING id INTO t_a;
    INSERT INTO public.tasks (org_id, user_id, title, status, priority, assignee_employee_id)
    VALUES (org, o2, 'TR Iago responsável (link)', 'open', 3, e_iago) RETURNING id INTO t_b;
    INSERT INTO public.tasks (org_id, user_id, title, status, priority, assignee_employee_id)
    VALUES (org, o2, 'TR y responsável pelo e-mail', 'open', 3, e_email) RETURNING id INTO t_y;
    INSERT INTO public.tasks (org_id, user_id, title, status, priority, assignee_employee_id)
    VALUES (org, o2, 'TR responsável com e-mail vazio', 'open', 3, e_vazio) RETURNING id INTO t_vazio;
    INSERT INTO public.tasks (org_id, user_id, title, status, priority)
    VALUES (org, o2, 'TR Iago só colaborador', 'open', 3) RETURNING id INTO t_colab;
    INSERT INTO public.task_collaborators (task_id, employee_id) VALUES (t_colab, e_colab);
    INSERT INTO public.tasks (org_id, user_id, title, status, priority, assignee_employee_id)
    VALUES (org, o2, 'TR z responsável fora da org', 'open', 3, e_z) RETURNING id INTO t_z;

    -- ── RLS: o responsável vê (o RED) ────────────────────────────────────────
    v := pg_temp.como(iago, 'authenticated', format(sql_conta, t_a));
    PERFORM pg_temp.confere(v = 'ok:1', 'Iago vê a tarefa de que é responsável (veio ' || v || ')');

    -- ── RLS: o responsável conclui ───────────────────────────────────────────
    v := pg_temp.como(iago, 'authenticated', format(
        'WITH u AS (UPDATE public.tasks SET status = ''done'' WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', t_a));
    PERFORM pg_temp.confere(v = 'ok:1', 'Iago conclui a tarefa de que é responsável → 1 linha (veio ' || v || ')');
    SELECT * INTO tr FROM public.tasks WHERE id = t_a;
    PERFORM pg_temp.confere(tr.status = 'done' AND tr.completed_at IS NOT NULL,
        'concluída pelo responsável: status done, completed_at preenchido pelo gatilho');

    -- ── RLS + gatilho: o responsável não passa a tarefa adiante nem a toma ───
    SELECT t.source_module INTO src_a FROM public.tasks t WHERE t.id = t_a;
    -- (Crítico 1: as WITH CHECK de UPDATE se combinam com OR — sem o gatilho,
    -- SET user_id = ele passaria no CHECK de tasks_update.)
    v := pg_temp.como(iago, 'authenticated', format(
        'UPDATE public.tasks SET assignee_employee_id = %L WHERE id = %L RETURNING id::text', e_outro, t_a));
    PERFORM pg_temp.confere(v = recusa_resp, 'Iago trocando o responsável → 42501 (veio ' || v || ')');
    v := pg_temp.como(iago, 'authenticated', format(
        'UPDATE public.tasks SET assignee_employee_id = NULL WHERE id = %L RETURNING id::text', t_a));
    PERFORM pg_temp.confere(v = recusa_resp, 'Iago tirando o responsável → 42501 (veio ' || v || ')');
    v := pg_temp.como(iago, 'authenticated', format(
        'UPDATE public.tasks SET user_id = %L WHERE id = %L RETURNING id::text', iago, t_a));
    PERFORM pg_temp.confere(v IN (recusa_resp, recusa_autoria), 'Iago tomando a posse (SET user_id = ele) → 42501 (veio ' || v || ')');
    v := pg_temp.como(iago, 'authenticated', format(
        'UPDATE public.tasks SET space_id = %L WHERE id = %L RETURNING id::text', s_iago, t_a));
    PERFORM pg_temp.confere(v = recusa_resp, 'Iago levando a tarefa para um espaço dele → 42501 (veio ' || v || ')');
    v := pg_temp.como(iago, 'authenticated', format(
        'UPDATE public.tasks SET org_id = %L WHERE id = %L RETURNING id::text', outra_org, t_a));
    PERFORM pg_temp.confere(v = recusa_resp, 'Iago levando a tarefa para outra org → 42501 (veio ' || v || ')');
    v := pg_temp.como(iago, 'authenticated', format(
        'UPDATE public.tasks SET project_id = %L WHERE id = %L RETURNING id::text', p_tr, t_a));
    PERFORM pg_temp.confere(v = recusa_resp, 'Iago trocando a obra → 42501 (veio ' || v || ')');
    v := pg_temp.como(iago, 'authenticated', format(
        'UPDATE public.tasks SET source_module = ''TR'' WHERE id = %L RETURNING id::text', t_a));
    PERFORM pg_temp.confere(v = recusa_resp, 'Iago trocando source_module → 42501 (veio ' || v || ')');
    v := pg_temp.como(iago, 'authenticated', format(
        'UPDATE public.tasks SET id = gen_random_uuid() WHERE id = %L RETURNING id::text', t_a));
    PERFORM pg_temp.confere(v IN (recusa_resp, recusa_autoria), 'Iago trocando o id → 42501 (veio ' || v || ')');
    v := pg_temp.como(iago, 'authenticated', format(
        'UPDATE public.tasks SET created_at = created_at - interval ''1 day'' WHERE id = %L RETURNING id::text', t_a));
    PERFORM pg_temp.confere(v IN (recusa_resp, recusa_autoria), 'Iago trocando created_at → 42501 (veio ' || v || ')');
    PERFORM pg_temp.confere(EXISTS (SELECT 1 FROM public.tasks WHERE id = t_a), 'recusa do id: a tarefa segue com o id de antes');
    SELECT * INTO tr FROM public.tasks WHERE id = t_a;
    PERFORM pg_temp.confere(tr.assignee_employee_id = e_iago AND tr.user_id = o2 AND tr.space_id IS NULL
                        AND tr.org_id = org AND tr.project_id IS NULL AND tr.source_module IS NOT DISTINCT FROM src_a,
        'recusas não mexeram em responsável, dono, espaço, org, obra nem origem');
    v := pg_temp.como(iago, 'authenticated', format(
        'WITH u AS (UPDATE public.tasks SET title = ''TR editada pelo responsável'', description = ''d'', priority = 1, '
        || 'due_date = now(), start_date = now(), alert_at = now() + interval ''1 day'', snoozed_until = NULL, status = ''open'' '
        || 'WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', t_a));
    PERFORM pg_temp.confere(v = 'ok:1', 'Iago edita título, descrição, datas, prioridade e status → 1 linha (veio ' || v || ')');
    v := pg_temp.como(iago, 'authenticated', format(
        'WITH u AS (UPDATE public.tasks SET status = ''done'' WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', t_a));
    PERFORM pg_temp.confere(v = 'ok:1' AND (SELECT completed_at IS NOT NULL FROM public.tasks WHERE id = t_a),
        'Iago conclui de novo, com o gatilho novo no caminho (veio ' || v || ')');

    -- ── RLS: o responsável não apaga ─────────────────────────────────────────
    v := pg_temp.como(iago, 'authenticated', format(
        'WITH d AS (DELETE FROM public.tasks WHERE id = %L RETURNING 1) SELECT count(*)::text FROM d', t_a));
    PERFORM pg_temp.confere(v = 'ok:0', 'Iago apagando a tarefa de que é responsável → 0 linhas (veio ' || v || ')');
    PERFORM pg_temp.confere(EXISTS (SELECT 1 FROM public.tasks WHERE id = t_a), 'a tarefa continua lá');

    -- ── RLS: o dono continua passando a tarefa adiante ───────────────────────
    v := pg_temp.como(o2, 'authenticated', format(
        'WITH u AS (UPDATE public.tasks SET assignee_employee_id = %L WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', e_outro, t_vazio));
    PERFORM pg_temp.confere(v = 'ok:1', 'dono troca o responsável (tasks_update) (veio ' || v || ')');
    v := pg_temp.como(o2, 'authenticated', format(
        'WITH u AS (UPDATE public.tasks SET space_id = %L, project_id = %L WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u',
        s_iago, p_tr, t_vazio));
    PERFORM pg_temp.confere(v = 'ok:1', 'dono muda espaço e obra (o gatilho não o atinge) (veio ' || v || ')');
    UPDATE public.tasks SET assignee_employee_id = e_vazio, space_id = NULL, project_id = NULL WHERE id = t_vazio;
    -- id e created_at: até aplicar_20271112998000 o dono podia (t_vazio não tem colaborador
    -- nem subtarefa, então trocar o id não esbarra em FK; o id volta depois). Com ela
    -- (revisão de 13/11), a autoria é fixa para todo mundo da API — o dono também recebe a
    -- recusa. A prova reconhece qual regra está no banco pela função minhas_orgs_gestor().
    IF to_regprocedure('public.minhas_orgs_gestor()') IS NULL THEN
        v := pg_temp.como(o2, 'authenticated', format(
            'WITH u AS (UPDATE public.tasks SET created_at = created_at - interval ''1 day'' WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', t_vazio));
        PERFORM pg_temp.confere(v = 'ok:1', 'dono muda created_at (veio ' || v || ')');
        v := pg_temp.como(o2, 'authenticated', format(
            'UPDATE public.tasks SET id = gen_random_uuid() WHERE id = %L RETURNING id::text', t_vazio));
        PERFORM pg_temp.confere(v LIKE 'ok:%' AND v <> 'ok:<null>' AND v <> 'ok:' || t_vazio, 'dono muda o id (veio ' || v || ')');
        UPDATE public.tasks SET id = t_vazio WHERE id = substr(v, 4)::uuid;
    ELSE
        v := pg_temp.como(o2, 'authenticated', format(
            'WITH u AS (UPDATE public.tasks SET created_at = created_at - interval ''1 day'' WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', t_vazio));
        PERFORM pg_temp.confere(v = recusa_autoria, 'dono NÃO muda created_at (autoria fixa) (veio ' || v || ')');
        v := pg_temp.como(o2, 'authenticated', format(
            'UPDATE public.tasks SET id = gen_random_uuid() WHERE id = %L RETURNING id::text', t_vazio));
        PERFORM pg_temp.confere(v = recusa_autoria, 'dono NÃO muda o id (autoria fixa) (veio ' || v || ')');
    END IF;
    PERFORM pg_temp.confere(EXISTS (SELECT 1 FROM public.tasks WHERE id = t_vazio), 'fixture: id de t_vazio restaurado');

    -- ── responsável vinculado que NÃO é membro da org da tarefa (Importante 2)
    PERFORM pg_temp.confere(public.is_employee_do_usuario_de(z, e_z) IS TRUE, 'fixture: e_z é de z');
    v := pg_temp.como(z, 'authenticated', format(sql_conta, t_z));
    PERFORM pg_temp.confere(v = 'ok:0', 'responsável vinculado que não é membro da org da tarefa não vê (veio ' || v || ')');
    v := pg_temp.como(z, 'authenticated', format(
        'WITH u AS (UPDATE public.tasks SET status = ''done'' WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', t_z));
    PERFORM pg_temp.confere(v = 'ok:0', 'responsável que não é membro da org não edita (veio ' || v || ')');

    -- ── RLS: terceiro membro não vê nem edita ────────────────────────────────
    v := pg_temp.como(x, 'authenticated', format(
        'SELECT count(*)::text FROM public.tasks t WHERE t.id IN (%L, %L, %L, %L)', t_a, t_b, t_y, t_vazio));
    PERFORM pg_temp.confere(v = 'ok:0', 'terceiro membro (não dono, não membro de espaço, não responsável) não vê (veio ' || v || ')');
    v := pg_temp.como(x, 'authenticated', format(
        'WITH u AS (UPDATE public.tasks SET title = ''TR x'' WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', t_b));
    PERFORM pg_temp.confere(v = 'ok:0', 'terceiro membro não edita (veio ' || v || ')');

    -- ── colaborador continua só lendo ────────────────────────────────────────
    v := pg_temp.como(iago, 'authenticated', format(sql_conta, t_colab));
    PERFORM pg_temp.confere(v = 'ok:1', 'Iago colaborador vê (tasks_select_collaborator) (veio ' || v || ')');
    v := pg_temp.como(iago, 'authenticated', format(
        'WITH u AS (UPDATE public.tasks SET title = ''TR x'' WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', t_colab));
    PERFORM pg_temp.confere(v = 'ok:0', 'Iago só colaborador não edita (veio ' || v || ')');

    -- ── perna do e-mail ──────────────────────────────────────────────────────
    v := pg_temp.como(y, 'authenticated', format(sql_conta, t_y));
    PERFORM pg_temp.confere(v = 'ok:1', 'y vê a tarefa do colaborador sem user_id com o e-mail dele (veio ' || v || ')');
    PERFORM pg_temp.confere(public.is_employee_do_usuario_de(y, e_email) IS TRUE,
        'e-mail casa sem diferença de caixa e de espaços nas pontas');
    PERFORM pg_temp.confere(public.is_employee_do_usuario_de(y, e_vinc_outro) IS FALSE
                        AND public.is_employee_do_usuario_de(x, e_vinc_outro) IS TRUE,
        'colaborador com user_id: vale o vínculo, não o e-mail');
    PERFORM pg_temp.confere((SELECT count(*) FROM auth.users au WHERE au.id IN (u_vazio, u_branco)) = 2
                        AND public.is_employee_do_usuario_de(u_vazio, e_vazio) IS FALSE
                        AND public.is_employee_do_usuario_de(u_branco, e_branco) IS FALSE
                        AND public.is_employee_do_usuario_de(u_branco, e_vazio) IS FALSE,
        'contas com e-mail '''' / ''   '' não casam com colaborador de e-mail vazio / em branco');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM auth.users au
                                         WHERE public.is_employee_do_usuario_de(au.id, e_vazio)
                                            OR public.is_employee_do_usuario_de(au.id, e_branco)),
        'colaborador com e-mail vazio ou em branco não casa com conta nenhuma');
    v := pg_temp.como(o2, 'authenticated', format(sql_conta, t_vazio));
    PERFORM pg_temp.confere(v = 'ok:1', 'referência: o dono vê a tarefa de responsável sem e-mail (veio ' || v || ')');
    v := pg_temp.como(x, 'authenticated', format(sql_conta, t_vazio));
    PERFORM pg_temp.confere(v = 'ok:0', 'responsável com e-mail vazio não libera para terceiro (veio ' || v || ')');
    PERFORM pg_temp.confere(public.is_employee_do_usuario_de(NULL, e_iago) IS FALSE
                        AND public.is_employee_do_usuario_de(iago, NULL) IS FALSE
                        AND public.is_employee_do_usuario_de(iago, gen_random_uuid()) IS FALSE,
        'NULL ou colaborador inexistente → FALSE');
    v := pg_temp.como(NULL, 'anon', format('SELECT public.is_employee_do_usuario(%L)::text', e_iago));
    PERFORM pg_temp.confere(v = 'ok:false', 'anon chama is_employee_do_usuario e recebe FALSE (veio ' || v || ')');
    v := pg_temp.como(iago, 'authenticated', format('SELECT public.is_employee_do_usuario(%L)::text', e_iago));
    PERFORM pg_temp.confere(v = 'ok:true', 'is_employee_do_usuario com as claims do Iago = TRUE (veio ' || v || ')');

    -- ── privilégios e forma das funções (REGRA #7) ───────────────────────────
    PERFORM pg_temp.confere(
        NOT has_function_privilege('anon', 'public.is_employee_do_usuario_de(uuid,uuid)', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public.is_employee_do_usuario_de(uuid,uuid)', 'EXECUTE')
        AND has_function_privilege('anon', 'public.is_employee_do_usuario(uuid)', 'EXECUTE')
        AND has_function_privilege('authenticated', 'public.is_employee_do_usuario(uuid)', 'EXECUTE')
        AND has_function_privilege('service_role', 'public.is_employee_do_usuario(uuid)', 'EXECUTE')
        AND NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                         WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'is\_employee\_do\_usuario%'
                           AND a.grantee = 0)
        AND (SELECT bool_and(p.prosecdef AND p.provolatile = 's' AND 'search_path=public, pg_temp' = ANY (p.proconfig)) AND count(*) = 2
               FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'is\_employee\_do\_usuario%'),
        'is_employee_do_usuario_de: só interno; is_employee_do_usuario: anon/authenticated/service_role, sem PUBLIC; ambas SECURITY DEFINER STABLE com search_path fixo');
    PERFORM pg_temp.confere(
        NOT has_function_privilege('anon', 'public._celular_tarefa_visivel(uuid,uuid,public.tasks)', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public._celular_tarefa_visivel(uuid,uuid,public.tasks)', 'EXECUTE')
        AND has_function_privilege('anon', 'public.celular_tarefa_atualizar(text,uuid,jsonb)', 'EXECUTE')
        AND has_function_privilege('authenticated', 'public.celular_tarefa_atualizar(text,uuid,jsonb)', 'EXECUTE')
        AND (SELECT p.prosecdef AND p.provolatile = 'v' AND 'search_path=public, pg_temp' = ANY (p.proconfig)
               FROM pg_proc p WHERE p.oid = 'public.celular_tarefa_atualizar(text,uuid,jsonb)'::regprocedure)
        AND (SELECT NOT p.prosecdef AND p.provolatile = 's' AND 'search_path=public, pg_temp' = ANY (p.proconfig)
               FROM pg_proc p WHERE p.oid = 'public._celular_tarefa_visivel(uuid,uuid,public.tasks)'::regprocedure)
        AND NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                         WHERE p.oid IN ('public.celular_tarefa_atualizar(text,uuid,jsonb)'::regprocedure,
                                         'public._celular_tarefa_visivel(uuid,uuid,public.tasks)'::regprocedure)
                           AND a.grantee = 0),
        'reescritas mantêm forma e privilégios do arquivo 960000');
    PERFORM pg_temp.confere(
        (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks'
            AND policyname IN ('tasks_select_assignee', 'tasks_update_assignee')) = 2
        -- INSERT e DELETE seguem com uma policy cada (o superadmin, aplicar_20271112997000,
        -- e o owner/admin, aplicar_20271112998000, acrescentam só SELECT e UPDATE).
        AND (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks' AND cmd = 'INSERT') = 1
        AND (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks' AND cmd = 'DELETE') = 1,
        'tasks: + tasks_select_assignee e tasks_update_assignee; INSERT e DELETE sem mudança');
    -- is_org_member(org_id), ou a forma por conjunto que o #370
    -- (aplicar_20271111940000…) pôs no lugar: org_id IN (SELECT minhas_orgs_membro()).
    PERFORM pg_temp.confere(
        (SELECT bool_and(pg_get_expr(p.polqual, p.polrelid) ~ 'is_org_member\(org_id\)|org_id IN \( SELECT minhas_orgs_membro\(\)'
                         AND (p.polcmd = 'r' OR pg_get_expr(p.polwithcheck, p.polrelid) ~ 'is_org_member\(org_id\)|org_id IN \( SELECT minhas_orgs_membro\(\)'))
              AND count(*) = 2
           FROM pg_policy p WHERE p.polrelid = 'public.tasks'::regclass
            AND p.polname IN ('tasks_select_assignee', 'tasks_update_assignee')),
        'policies do responsável exigem is_org_member(org_id) (USING e CHECK)');
    PERFORM pg_temp.confere(EXISTS (
        SELECT 1 FROM pg_trigger t
         WHERE t.tgrelid = 'public.tasks'::regclass
           AND t.tgname = 'trg_tasks_responsavel_so_conteudo'
           AND t.tgfoid = 'public._tasks_responsavel_so_conteudo()'::regprocedure
           AND (t.tgtype & 1) = 1      -- FOR EACH ROW
           AND (t.tgtype & 2) = 2      -- BEFORE
           AND (t.tgtype & 16) = 16    -- UPDATE
           AND (t.tgtype & (4 | 8 | 32)) = 0),
        'gatilho BEFORE UPDATE FOR EACH ROW em tasks');
    PERFORM pg_temp.confere(
        NOT has_function_privilege('anon', 'public._tasks_responsavel_so_conteudo()', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public._tasks_responsavel_so_conteudo()', 'EXECUTE')
        AND NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                         WHERE p.oid = 'public._tasks_responsavel_so_conteudo()'::regprocedure AND a.grantee = 0)
        AND (SELECT NOT p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig)
               FROM pg_proc p WHERE p.oid = 'public._tasks_responsavel_so_conteudo()'::regprocedure),
        'função do gatilho: SECURITY INVOKER, search_path fixo, sem EXECUTE para PUBLIC/anon/authenticated');

    -- ── link do celular ──────────────────────────────────────────────────────
    PERFORM pg_temp.confere(public._celular_tarefa_visivel(iago, org, (SELECT t FROM public.tasks t WHERE t.id = t_b)) IS TRUE,
        '_celular_tarefa_visivel(Iago, org do link, tarefa de que é responsável) = TRUE');
    PERFORM pg_temp.confere(public._celular_tarefa_visivel(iago, gen_random_uuid(), (SELECT t FROM public.tasks t WHERE t.id = t_b)) IS FALSE,
        '_celular_tarefa_visivel: org diferente da do link → FALSE (a org continua obrigatória)');

    v := pg_temp.como(iago, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', iago, org));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'Iago gera o próprio link na org (veio ' || v || ')');
    tk := substr(v, 4);

    v := pg_temp.cel(format(
        'SELECT string_agg(e->>''id'', '','') FROM jsonb_array_elements(public.celular_tarefas_listar(%L)->''tarefas'') e', tk));
    PERFORM pg_temp.confere(strpos(v, t_b::text) > 0, 'celular_tarefas_listar (anon + token do Iago) traz a tarefa de que é responsável');
    PERFORM pg_temp.confere(strpos(v, t_colab::text) > 0 AND strpos(v, t_y::text) = 0 AND strpos(v, t_vazio::text) = 0,
        'listar: traz a de colaborador; não traz as de outro responsável');

    SELECT ts.id INTO st_done FROM public.task_statuses ts WHERE ts.org_id = org AND ts.is_done ORDER BY ts.position, ts.id LIMIT 1;
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, %L::jsonb)->>''status''', tk, t_b,
        jsonb_strip_nulls(jsonb_build_object('status', 'done', 'status_id', st_done))));
    PERFORM pg_temp.confere(v = 'ok:done', 'link: responsável conclui a tarefa (veio ' || v || ')');
    SELECT * INTO tr FROM public.tasks WHERE id = t_b;
    PERFORM pg_temp.confere(tr.status = 'done' AND tr.completed_at IS NOT NULL AND tr.status_id IS NOT DISTINCT FROM st_done,
        'link: concluída, completed_at preenchido');

    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, %L::jsonb)::text', tk, t_b,
        jsonb_build_object('assignee_employee_id', e_outro)));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'link: responsável trocando o responsável → 42501 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, ''{"assignee_employee_id":null}'')::text', tk, t_b));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'link: responsável tirando o responsável → 42501 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, %L::jsonb)->>''assignee_employee_id''', tk, t_b,
        jsonb_build_object('assignee_employee_id', e_iago)));
    PERFORM pg_temp.confere(v = 'ok:' || e_iago, 'link: manter a si mesmo como responsável passa (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT assignee_employee_id FROM public.tasks WHERE id = t_b) = e_iago,
        'link: recusas não trocaram o responsável');

    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, ''{"title":"TR x"}'')::text', tk, t_colab));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'link: Iago só colaborador continua sem editar → 42501 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, ''{"title":"TR x"}'')::text', tk, t_y));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'link: tarefa de outro responsável → 42501 (veio ' || v || ')');

    -- ── paridade: RLS do Iago (sem filtro de org) ∩ org = _celular_tarefa_visivel
    ref := pg_temp.como(iago, 'authenticated', format(
        'SELECT coalesce(string_agg(s.id::text, '','' ORDER BY s.id), '''') '
        || 'FROM (SELECT t.id, t.org_id FROM public.tasks t WHERE t.status = ''open'') s WHERE s.org_id = %L', org));
    SELECT 'ok:' || coalesce(string_agg(t.id::text, ',' ORDER BY t.id), '') INTO v
      FROM public.tasks t
     WHERE t.status = 'open' AND public._celular_tarefa_visivel(iago, org, t);
    PERFORM pg_temp.confere(ref LIKE 'ok:%' AND v = ref,
        'paridade: abertas do Iago pela RLS = pelo _celular_tarefa_visivel na org (RLS: ' || ref || ' / link: ' || v || ')');
    RAISE NOTICE 'paridade: % abertas (com as fixtures)', array_length(string_to_array(substr(ref, 4), ','), 1);
END $$;

ROLLBACK;

-- Só leitura, depois do ROLLBACK: tarefas abertas do Iago na org do link como
-- criador/envolvido e como responsável (o Iago é `member`: sem perna de owner/admin).
SELECT format('TUDO OK — Iago na org 926cf626: %s abertas como criador/envolvido + %s só como responsável = %s',
              count(*) FILTER (WHERE r.antiga),
              count(*) FILTER (WHERE r.responsavel AND NOT r.antiga),
              count(*) FILTER (WHERE r.antiga OR r.responsavel)) AS resultado
  FROM (SELECT (t.user_id = i.id
                OR public.is_task_collaborator_de(i.id, t.id)) AS antiga,
               EXISTS (SELECT 1 FROM public.employees e
                        WHERE e.id = t.assignee_employee_id
                          AND (e.user_id = i.id
                               OR (e.user_id IS NULL AND nullif(btrim(e.email), '') IS NOT NULL
                                   AND lower(btrim(e.email)) = lower(i.email))))
               AND public.is_org_member_de(i.id, t.org_id) AS responsavel
          FROM public.tasks t
          CROSS JOIN (SELECT au.id, au.email FROM auth.users au
                       WHERE au.id = 'f9809eae-4935-40b3-bfaa-3879c456c563') i
         WHERE t.org_id = '926cf626-ba49-4ee4-9f35-472822fb90e6' AND t.status = 'open') r;
