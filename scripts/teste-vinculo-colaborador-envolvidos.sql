-- scripts/teste-vinculo-colaborador-envolvidos.sql
-- Prova: (1) só owner/admin vincula colaborador a uma conta (employees.user_id,
-- ou e-mail igual ao de um login); (2) task_collaborators volta a funcionar pela
-- API e só quem gere a tarefa (dono / membro do espaço) mexe nos envolvidos.
-- Migration: supabase/migrations/aplicar_20271112400000_vinculo_colaborador_e_envolvidos_trava.sql
-- Plano: docs/planos/2026-11-11-link-celular-tarefas-diario.md (Ajustes — brechas).
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …';
-- sucesso = a linha final 'TUDO OK' (`db query` só devolve o último resultado).
--
--   npx supabase db query --linked -f scripts/teste-vinculo-colaborador-envolvidos.sql
--
-- Para ensaiar a migration ANTES de aplicá-la, gere um arquivo com o conteúdo
-- dela no lugar da linha MIGRATION abaixo. Sem ela, a prova falha em
-- "membro comum vinculando o colaborador à própria conta → 42501" (é o RED).

BEGIN;
-- MIGRATION

CREATE FUNCTION pg_temp.confere(p_ok BOOLEAN, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
END $$;

-- Roda p_sql como authenticated com as claims de p_user (sub + e-mail + role) e
-- devolve 'ok:<resultado>' ou '<SQLSTATE>:<mensagem>'.
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
    org CONSTANT UUID := '926cf626-ba49-4ee4-9f35-472822fb90e6';
    recusa CONSTANT TEXT := '42501:só owner ou admin da organização vincula o colaborador a um usuário do sistema '
                         || '(campo Usuário do sistema, ou e-mail igual ao de um login)';
    m UUID; m_email TEXT; m2 UUID; g UUID; y UUID; y_email TEXT; x UUID; e_x UUID;
    e_alvo UUID; e_novo UUID; e_ja_y UUID; e_m UUID;
    t1 UUID; t2 UUID; t3 UUID; s UUID; v TEXT;
    upd CONSTANT TEXT := 'WITH u AS (UPDATE public.employees SET %s WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u';
BEGIN
    -- ── fixtures ─────────────────────────────────────────────────────────────
    -- m, m2: membros comuns (papel member, não superadmin) da org, com e-mail.
    SELECT au.id, au.email INTO m, m_email
      FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
     WHERE om.organization_id = org AND om.role = 'member' AND nullif(btrim(au.email), '') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.superadmins sa WHERE sa.email = lower(au.email))
     ORDER BY au.id LIMIT 1;
    PERFORM pg_temp.confere(m IS NOT NULL, 'fixture: membro comum m');
    SELECT au.id INTO m2
      FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
     WHERE om.organization_id = org AND om.role = 'member' AND au.id <> m
       AND NOT EXISTS (SELECT 1 FROM public.superadmins sa WHERE sa.email = lower(au.email))
     ORDER BY au.id LIMIT 1;
    PERFORM pg_temp.confere(m2 IS NOT NULL, 'fixture: segundo membro comum m2');
    -- g: conta que não é superadmin, posta como admin da org (só nesta transação).
    SELECT au.id INTO g FROM auth.users au
     WHERE NOT EXISTS (SELECT 1 FROM public.superadmins sa WHERE sa.email = lower(au.email))
       AND NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = org AND om.user_id = au.id)
       AND nullif(btrim(au.email), '') IS NOT NULL
     ORDER BY au.id LIMIT 1;
    PERFORM pg_temp.confere(g IS NOT NULL, 'fixture: conta g para admin');
    INSERT INTO public.organization_members (organization_id, user_id, email, role) VALUES (org, g, (SELECT email FROM auth.users WHERE id = g), 'admin');
    -- y: outra conta com e-mail (um "login" qualquer).
    SELECT au.id, au.email INTO y, y_email FROM auth.users au
     WHERE au.id NOT IN (m, m2, g) AND nullif(btrim(au.email), '') IS NOT NULL ORDER BY au.id LIMIT 1;
    -- x: membro de outra org que NÃO é membro desta, com colaborador e_x na org dele.
    SELECT om.user_id, om.organization_id INTO x, v FROM public.organization_members om
     WHERE om.organization_id <> org AND om.user_id IS NOT NULL AND om.role = 'member'
       AND NOT public.is_org_member_de(om.user_id, org)
       AND NOT EXISTS (SELECT 1 FROM public.superadmins sa JOIN auth.users au ON au.id = om.user_id WHERE sa.email = lower(au.email))
     ORDER BY om.user_id LIMIT 1;

    -- Colaboradores (criados como postgres: o gatilho não se aplica).
    INSERT INTO public.employees (org_id, name, status) VALUES (org, 'TV alvo', 'ATIVO') RETURNING id INTO e_alvo;
    INSERT INTO public.employees (org_id, name, email, user_id, status) VALUES (org, 'TV já de y', '', y, 'ATIVO') RETURNING id INTO e_ja_y;
    INSERT INTO public.employees (org_id, name, email, status) VALUES (org, 'TV e-mail de m', m_email, 'ATIVO') RETURNING id INTO e_m;
    PERFORM pg_temp.confere(EXISTS (SELECT 1 FROM public.employees WHERE id = e_m),
        'postgres (sem claims) cria colaborador com e-mail de login — gatilho não se aplica');

    -- ── 1. vínculo colaborador → conta ───────────────────────────────────────
    v := pg_temp.como(m, format(upd, format('user_id = %L', m), e_alvo));
    PERFORM pg_temp.confere(v = recusa, 'membro comum vinculando o colaborador à própria conta → 42501 (veio ' || v || ')');
    v := pg_temp.como(m, format(upd, format('user_id = %L', m2), e_alvo));
    PERFORM pg_temp.confere(v = recusa, 'membro comum vinculando o colaborador à conta de outro → 42501 (veio ' || v || ')');
    v := pg_temp.como(m, format(upd, 'user_id = NULL', e_ja_y));
    PERFORM pg_temp.confere(v = recusa, 'membro comum desfazendo um vínculo → 42501 (veio ' || v || ')');
    v := pg_temp.como(m, format(upd, format('email = %L', '  ' || upper(m_email) || ' '), e_alvo));
    PERFORM pg_temp.confere(v = recusa, 'membro comum pondo o PRÓPRIO e-mail de login (caixa/espaços) no colaborador → 42501 (veio ' || v || ')');
    v := pg_temp.como(m, format(upd, format('email = %L', y_email), e_alvo));
    PERFORM pg_temp.confere(v = recusa, 'membro comum pondo o e-mail de outro login no colaborador → 42501 (veio ' || v || ')');
    v := pg_temp.como(m, format('INSERT INTO public.employees (org_id, name, user_id, status) VALUES (%L, ''TV novo'', %L, ''ATIVO'') RETURNING 1::text', org, m));
    PERFORM pg_temp.confere(v = recusa, 'membro comum criando colaborador já vinculado → 42501 (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT user_id IS NULL AND email IS NULL FROM public.employees WHERE id = e_alvo)
                        AND (SELECT user_id = y FROM public.employees WHERE id = e_ja_y),
        'recusas não mexeram nos colaboradores');

    -- O que o RH faz no dia a dia continua livre para o membro comum.
    v := pg_temp.como(m, format(upd, '"email" = ''tv-sem-login@exemplo.invalid'', phone = ''1''', e_alvo));
    PERFORM pg_temp.confere(v = 'ok:1', 'membro comum troca e-mail que não é login (veio ' || v || ')');
    v := pg_temp.como(m, format(upd, 'email = email, user_id = user_id, phone = ''2''', e_m));
    PERFORM pg_temp.confere(v = 'ok:1', 'membro comum salva colaborador sem mudar e-mail (já de login) nem vínculo (veio ' || v || ')');
    v := pg_temp.como(m, format(upd, format('email = %L', upper(y_email)), e_ja_y));
    PERFORM pg_temp.confere(v = 'ok:1', 'membro comum põe no colaborador o e-mail da PRÓPRIA conta vinculada (veio ' || v || ')');
    v := pg_temp.como(m, format(upd, '"email" = NULL', e_m));
    PERFORM pg_temp.confere(v = 'ok:1', 'membro comum apaga o e-mail (desvincula pelo e-mail) (veio ' || v || ')');
    v := pg_temp.como(m, format('INSERT INTO public.employees (org_id, name, email, status) VALUES (%L, ''TV novo com e-mail'', %L, ''ATIVO'') RETURNING id::text', org, m_email));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND v <> 'ok:<null>', 'membro comum cria colaborador com e-mail de login (hire_candidate/academy) (veio ' || v || ')');
    e_novo := substr(v, 4)::uuid;

    -- owner/admin vincula.
    v := pg_temp.como(g, format(upd, format('user_id = %L', m), e_alvo));
    PERFORM pg_temp.confere(v = 'ok:1', 'admin da org vincula o colaborador (veio ' || v || ')');
    v := pg_temp.como(g, format(upd, format('email = %L', y_email), e_novo));
    PERFORM pg_temp.confere(v = 'ok:1', 'admin da org põe e-mail de login (veio ' || v || ')');
    -- admin de OUTRA org não vincula colaborador desta (nem vê, pela RLS de employees).
    IF x IS NOT NULL THEN
        v := pg_temp.como(x, format(upd, format('user_id = %L', x), e_ja_y));
        PERFORM pg_temp.confere(v IN ('ok:0', recusa), 'quem não é desta org não vincula colaborador dela (veio ' || v || ')');
    END IF;

    -- ── 2. task_collaborators ────────────────────────────────────────────────
    -- Como postgres: e-mails de volta ao exato do login (is_task_collaborator
    -- compara com a caixa exata).
    UPDATE public.employees SET email = y_email WHERE id = e_ja_y;
    UPDATE public.employees SET email = m_email WHERE id = e_m;
    -- t1: de m2, sem espaço. t2: de g, no espaço s, de que m é membro. t3: de m.
    INSERT INTO public.tasks (org_id, user_id, title, status, priority) VALUES (org, m2, 'TV t1 de m2', 'open', 3) RETURNING id INTO t1;
    INSERT INTO public.task_spaces (org_id, owner_user_id, name) VALUES (org, g, 'TV espaço') RETURNING id INTO s;
    INSERT INTO public.task_space_members (space_id, user_id, role) VALUES (s, m, 'member');
    INSERT INTO public.tasks (org_id, user_id, title, status, priority, space_id) VALUES (org, g, 'TV t2 no espaço', 'open', 3, s) RETURNING id INTO t2;
    INSERT INTO public.tasks (org_id, user_id, title, status, priority) VALUES (org, m, 'TV t3 de m', 'open', 3) RETURNING id INTO t3;
    INSERT INTO public.task_collaborators (task_id, employee_id) VALUES (t2, e_ja_y);

    v := pg_temp.como(m, 'SELECT count(*)::text FROM public.task_collaborators');
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'task_collaborators volta a ser lido pela API (antes: 42501 permission denied for table users) (veio ' || v || ')');

    v := pg_temp.como(m, format('INSERT INTO public.task_collaborators (task_id, employee_id) VALUES (%L, %L) RETURNING 1::text', t1, e_m));
    PERFORM pg_temp.confere(v LIKE '42501:%row-level security%', 'm se pondo como envolvido de tarefa alheia → recusa (veio ' || v || ')');
    v := pg_temp.como(m, format('INSERT INTO public.task_collaborators (task_id, employee_id) VALUES (%L, %L) RETURNING 1::text', t3, e_ja_y));
    PERFORM pg_temp.confere(v = 'ok:1', 'dono põe envolvido na própria tarefa (veio ' || v || ')');
    v := pg_temp.como(m, format('SELECT count(*)::text FROM public.task_collaborators WHERE task_id = %L', t2));
    PERFORM pg_temp.confere(v = 'ok:1', 'membro do espaço LÊ os envolvidos da tarefa do espaço (veio ' || v || ')');
    v := pg_temp.como(m, format('INSERT INTO public.task_collaborators (task_id, employee_id) VALUES (%L, %L) RETURNING 1::text', t2, e_m));
    PERFORM pg_temp.confere(v = 'ok:1', 'membro do espaço põe envolvido (veio ' || v || ')');
    v := pg_temp.como(m, format('WITH u AS (UPDATE public.task_collaborators SET task_id = %L WHERE task_id = %L AND employee_id = %L RETURNING 1) SELECT count(*)::text FROM u', t1, t3, e_ja_y));
    PERFORM pg_temp.confere(v LIKE '42501:%row-level security%', 'dono levando a linha de envolvido para tarefa alheia → recusa (veio ' || v || ')');

    -- m2 (dono de t1) não mexe nos envolvidos de t2 (não é dono nem do espaço).
    v := pg_temp.como(m2, format('SELECT count(*)::text FROM public.task_collaborators WHERE task_id = %L', t2));
    PERFORM pg_temp.confere(v = 'ok:0', 'quem não gere a tarefa nem é envolvido não lê os envolvidos (veio ' || v || ')');
    v := pg_temp.como(m2, format('WITH d AS (DELETE FROM public.task_collaborators WHERE task_id = %L RETURNING 1) SELECT count(*)::text FROM d', t2));
    PERFORM pg_temp.confere(v = 'ok:0', 'quem não gere a tarefa não apaga envolvidos (veio ' || v || ')');

    -- y é envolvido de t2 (e_ja_y tem o e-mail dele): lê a lista da tarefa.
    v := pg_temp.como(y, format('SELECT count(*)::text FROM public.task_collaborators WHERE task_id = %L', t2));
    PERFORM pg_temp.confere(v = 'ok:2', 'envolvido lê os envolvidos da tarefa (veio ' || v || ')');
    v := pg_temp.como(y, format('SELECT count(*)::text FROM public.tasks WHERE id = %L', t2));
    PERFORM pg_temp.confere(v = 'ok:1', 'envolvido vê a tarefa (tasks_select_collaborator) (veio ' || v || ')');

    -- O TaskForm do membro do espaço: apaga tudo e reinsere o que leu.
    v := pg_temp.como(m, format('WITH d AS (DELETE FROM public.task_collaborators WHERE task_id = %L RETURNING 1) SELECT count(*)::text FROM d', t2));
    PERFORM pg_temp.confere(v = 'ok:2', 'membro do espaço apaga os envolvidos que lê (veio ' || v || ')');

    -- ── forma ────────────────────────────────────────────────────────────────
    PERFORM pg_temp.confere(
        (SELECT string_agg(cmd, ',' ORDER BY cmd) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'task_collaborators')
            = 'DELETE,INSERT,SELECT,UPDATE'
        AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = 'public.task_collaborators'::regclass
                         AND (coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) LIKE '%auth.users%'),
        'task_collaborators: uma policy por comando, nenhuma lê auth.users');
    PERFORM pg_temp.confere(
        (SELECT pg_get_expr(p.polwithcheck, p.polrelid) LIKE '%pode_gerir_envolvidos_da_tarefa%'
           FROM pg_policy p WHERE p.polrelid = 'public.task_collaborators'::regclass AND p.polname = 'task_collaborators_update'),
        'UPDATE de envolvidos tem WITH CHECK');
    PERFORM pg_temp.confere(EXISTS (
        SELECT 1 FROM pg_trigger t
         WHERE t.tgrelid = 'public.employees'::regclass AND t.tgname = 'trg_employees_vinculo_so_gestor'
           AND t.tgfoid = 'public._employees_vinculo_so_gestor()'::regprocedure
           AND (t.tgtype & 1) = 1 AND (t.tgtype & 2) = 2 AND (t.tgtype & 4) = 4 AND (t.tgtype & 16) = 16),
        'gatilho BEFORE INSERT OR UPDATE FOR EACH ROW em employees');
    PERFORM pg_temp.confere(
        NOT has_function_privilege('anon', 'public._employees_vinculo_so_gestor()', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public._employees_vinculo_so_gestor()', 'EXECUTE')
        AND has_function_privilege('authenticated', 'public.pode_gerir_envolvidos_da_tarefa(uuid)', 'EXECUTE')
        AND has_function_privilege('anon', 'public.pode_gerir_envolvidos_da_tarefa(uuid)', 'EXECUTE')
        AND NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                         WHERE p.oid IN ('public._employees_vinculo_so_gestor()'::regprocedure,
                                         'public.pode_gerir_envolvidos_da_tarefa(uuid)'::regprocedure)
                           AND a.grantee = 0)
        AND (SELECT p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig)
               FROM pg_proc p WHERE p.oid = 'public._employees_vinculo_so_gestor()'::regprocedure)
        AND (SELECT NOT p.prosecdef AND p.provolatile = 's' AND 'search_path=public, pg_temp' = ANY (p.proconfig)
               FROM pg_proc p WHERE p.oid = 'public.pode_gerir_envolvidos_da_tarefa(uuid)'::regprocedure),
        'privilégios e forma das funções (REGRA #7)');
END $$;

ROLLBACK;

SELECT 'TUDO OK' AS resultado;
