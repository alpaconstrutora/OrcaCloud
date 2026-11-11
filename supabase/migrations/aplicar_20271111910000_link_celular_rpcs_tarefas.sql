-- aplicar_20271111910000_link_celular_rpcs_tarefas.sql
--
-- Link do celular — RPCs de Minhas Tarefas por token, sem login.
-- Plano: docs/planos/2026-11-11-link-celular-tarefas-diario.md (Parte 1 / Task 2).
-- Prova: scripts/teste-link-celular-tarefas.sql (seção B).
-- Depende de: aplicar_20271111900000_link_celular_tabela_e_gemeos.sql
-- (_mobile_link_resolver e os gêmeos is_*_de).
--
-- Toda celular_* começa pelo resolver: token → (dono do link, org do link). Daí
-- em diante TUDO fica preso a essa org — nunca às outras orgs do usuário — e a
-- visibilidade é a mesma das policies de tasks/task_spaces/task_folders/
-- task_statuses, com os gêmeos *_de no lugar de auth.uid():
--   tasks_select              user_id = u OR (space_id NOT NULL AND membro do espaço)
--   tasks_select_collaborator colaborador da tarefa
--   tasks_update              user_id = u OR (space_id NOT NULL AND membro do espaço)
--                             (colaborador só LÊ)
--   task_spaces_select        dono OR membro
--   task_folders_select       membro do espaço
--   task_statuses_select      membro da org (o resolver já conferiu)
--
-- São VOLATILE: o resolver grava last_used_at. SECURITY DEFINER com
-- search_path fixo. Escrita só por lista branca de chaves (chave estranha →
-- 22023); user_id/org_id/status/source_module da tarefa nova são forçados aqui.
--
-- REGRA #7: celular_* com REVOKE de PUBLIC e anon e GRANT a anon e
-- authenticated (o celular chama sem sessão, só com o token). Internos
-- _celular_* sem EXECUTE para nenhum papel da API.
-- Aplicar com `npx supabase db query --linked -f` — nunca `db push`.

-- ── Internos ────────────────────────────────────────────────────────────────

-- A linha de tarefa no formato de TASK_COLS (components/TasksMobileApp.tsx).
-- Um lugar só para as 17 colunas: listar, criar e atualizar devolvem isto.
CREATE OR REPLACE FUNCTION public._celular_tarefa_json(t public.tasks)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT jsonb_build_object(
        'id',                   t.id,
        'org_id',               t.org_id,
        'title',                t.title,
        'description',          t.description,
        'start_date',           t.start_date,
        'due_date',             t.due_date,
        'priority',             t.priority,
        'status',               t.status,
        'status_id',            t.status_id,
        'source_module',        t.source_module,
        'space_id',             t.space_id,
        'folder_id',            t.folder_id,
        'project_id',           t.project_id,
        'assignee_employee_id', t.assignee_employee_id,
        'alert_at',             t.alert_at,
        'parent_task_id',       t.parent_task_id,
        'created_at',           t.created_at)
$$;

-- tasks_select ∪ tasks_select_collaborator para p_user, presa à org do link.
CREATE OR REPLACE FUNCTION public._celular_tarefa_visivel(p_user UUID, p_org UUID, t public.tasks)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT t.org_id = p_org
       AND (   t.user_id = p_user
            OR (t.space_id IS NOT NULL AND public.is_task_space_member_de(p_user, t.space_id))
            OR public.is_task_collaborator_de(p_user, t.id))
$$;

-- Responsáveis atribuíveis na org — a regra de listAssignable
-- (TasksMobileApp.tsx / TasksModule.loadEmployees): ATIVO, da org ou
-- compartilhado com ela por employee_org_shares.target_org_id.
CREATE OR REPLACE FUNCTION public._celular_responsaveis(p_org UUID)
RETURNS TABLE (id UUID, name TEXT)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT e.id, e.name
      FROM public.employees e
     WHERE e.status = 'ATIVO'
       AND (   e.org_id = p_org
            OR e.id IN (SELECT s.employee_id FROM public.employee_org_shares s WHERE s.target_org_id = p_org))
$$;

-- Lê uma data do payload: NULL/ausente → NULL; texto inválido → 22023.
-- STABLE: texto sem fuso é lido no fuso da sessão.
CREATE OR REPLACE FUNCTION public._celular_data(p_dados JSONB, p_chave TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN (p_dados ->> p_chave)::timestamptz;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN
    RAISE EXCEPTION 'data inválida em %', p_chave USING ERRCODE = '22023';
END;
$$;

-- Lê um UUID do payload: NULL/ausente → NULL; texto inválido → 22023.
CREATE OR REPLACE FUNCTION public._celular_uuid(p_dados JSONB, p_chave TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN (p_dados ->> p_chave)::uuid;
EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'identificador inválido em %', p_chave USING ERRCODE = '22023';
END;
$$;

-- Lê a prioridade (inteiro 1–4) do payload; qualquer outra coisa → 22023.
CREATE OR REPLACE FUNCTION public._celular_prioridade(p_dados JSONB)
RETURNS SMALLINT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    IF jsonb_typeof(p_dados -> 'priority') = 'number'
       AND (p_dados ->> 'priority') ~ '^[1-4]$' THEN
        RETURN (p_dados ->> 'priority')::smallint;
    END IF;
    RAISE EXCEPTION 'prioridade inválida (1 a 4)' USING ERRCODE = '22023';
END;
$$;

-- ── Sessão ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.celular_sessao(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID;
    v_org  UUID;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    RETURN jsonb_build_object(
        'user_id',  v_user,
        'nome',     (SELECT p.name FROM public.profiles p WHERE p.id = v_user),
        'org_id',   v_org,
        'org_nome', (SELECT o.name FROM public.organizations o WHERE o.id = v_org));
END;
$$;

-- ── Tarefas abertas ─────────────────────────────────────────────────────────
-- O filtro de loadTasks (TasksMobileApp.tsx): abertas, raiz, due_date ASC NULLS
-- LAST, priority ASC, limite 300. Recorte: p_folder_id = só a pasta;
-- p_space_id = só o espaço; p_space_id + p_sem_pasta = do espaço sem pasta.
-- nomes_obras: só das obras das tarefas devolvidas, e só obras da org do link.
CREATE OR REPLACE FUNCTION public.celular_tarefas_listar(
    p_token     TEXT,
    p_space_id  UUID    DEFAULT NULL,
    p_folder_id UUID    DEFAULT NULL,
    p_sem_pasta BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user    UUID;
    v_org     UUID;
    v_tarefas JSONB;
    v_obras   JSONB;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    IF coalesce(p_sem_pasta, false) AND p_space_id IS NULL THEN
        RAISE EXCEPTION '"sem pasta" exige o espaço' USING ERRCODE = '22023';
    END IF;

    WITH sel AS (
        SELECT t AS linha, t.id, t.due_date, t.priority, t.project_id
          FROM public.tasks t
         WHERE t.org_id = v_org
           AND t.status = 'open'
           AND t.parent_task_id IS NULL
           AND (p_space_id  IS NULL OR t.space_id  = p_space_id)
           AND (p_folder_id IS NULL OR t.folder_id = p_folder_id)
           AND (NOT coalesce(p_sem_pasta, false) OR t.folder_id IS NULL)
           AND public._celular_tarefa_visivel(v_user, v_org, t)
         ORDER BY t.due_date ASC NULLS LAST, t.priority ASC, t.id
         LIMIT 300
    )
    SELECT coalesce(jsonb_agg(public._celular_tarefa_json(sel.linha)
                              ORDER BY sel.due_date ASC NULLS LAST, sel.priority ASC, sel.id), '[]'::jsonb),
           coalesce((SELECT jsonb_object_agg(p.id, p.name)
                       FROM public.projects p
                      WHERE p.id IN (SELECT s2.project_id FROM sel s2 WHERE s2.project_id IS NOT NULL)
                        AND (   p.organization_id = v_org
                             OR (p.organization_id IS NULL AND p.settings ->> 'organizationId' = v_org::text))),
                    '{}'::jsonb)
      INTO v_tarefas, v_obras
      FROM sel;

    RETURN jsonb_build_object('tarefas', v_tarefas, 'nomes_obras', v_obras);
END;
$$;

-- ── Espaços (TaskSpaceWithMeta, taskSpaceService.listSpaces) ────────────────
-- Espaços da org do link de que o dono do link é dono ou membro. Pastas e
-- membros seguem task_folders_select / task_space_members_select (só membro do
-- espaço enxerga); open_task_count conta só tarefas que ele enxerga.
CREATE OR REPLACE FUNCTION public.celular_espacos_listar(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID;
    v_org  UUID;
    v      JSONB;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    SELECT coalesce(jsonb_agg(
               jsonb_build_object(
                   'id',            s.id,
                   'org_id',        s.org_id,
                   'owner_user_id', s.owner_user_id,
                   'name',          s.name,
                   'color',         s.color,
                   'icon',          s.icon,
                   'position',      s.position,
                   'created_at',    s.created_at,
                   'updated_at',    s.updated_at,
                   'folders', CASE WHEN m.membro THEN coalesce((
                       SELECT jsonb_agg(jsonb_build_object(
                                  'id',         f.id,
                                  'space_id',   f.space_id,
                                  'name',       f.name,
                                  'color',      f.color,
                                  'position',   f.position,
                                  'created_at', f.created_at)
                              ORDER BY f.position, f.created_at, f.id)
                         FROM public.task_folders f
                        WHERE f.space_id = s.id), '[]'::jsonb)
                       ELSE '[]'::jsonb END,
                   'member_count', CASE WHEN m.membro
                       THEN (SELECT count(*) FROM public.task_space_members tsm WHERE tsm.space_id = s.id)
                       ELSE 0 END,
                   'open_task_count', (
                       SELECT count(*)
                         FROM public.tasks t
                        WHERE t.space_id = s.id
                          AND t.status = 'open'
                          AND t.parent_task_id IS NULL
                          AND public._celular_tarefa_visivel(v_user, v_org, t)))
               ORDER BY s.position, s.created_at, s.id), '[]'::jsonb)
      INTO v
      FROM public.task_spaces s
      CROSS JOIN LATERAL (SELECT public.is_task_space_member_de(v_user, s.id) AS membro) m
     WHERE s.org_id = v_org
       AND (s.owner_user_id = v_user OR m.membro);

    RETURN v;
END;
$$;

-- ── Status da org (taskStatusService.list) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.celular_status_listar(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID;
    v_org  UUID;
    v      JSONB;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id',         ts.id,
               'org_id',     ts.org_id,
               'name',       ts.name,
               'color',      ts.color,
               'position',   ts.position,
               'is_default', ts.is_default,
               'is_done',    ts.is_done)
           ORDER BY ts.position, ts.id), '[]'::jsonb)
      INTO v
      FROM public.task_statuses ts
     WHERE ts.org_id = v_org;

    RETURN v;
END;
$$;

-- ── Responsáveis (listAssignable) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.celular_responsaveis_listar(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID;
    v_org  UUID;
    v      JSONB;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name) ORDER BY e.name, e.id), '[]'::jsonb)
      INTO v
      FROM public._celular_responsaveis(v_org) e;

    RETURN v;
END;
$$;

-- ── Criar tarefa ────────────────────────────────────────────────────────────
-- Aceita só: title (obrigatório), description, start_date, due_date, priority
-- (1–4; ausente = 3, o padrão do celular), space_id, folder_id. Força dono e org
-- do link, status 'open' e source_module 'manual'. Espaço: da org do link e o
-- dono do link é membro ou dono. Pasta: do espaço informado.
CREATE OR REPLACE FUNCTION public.celular_tarefa_criar(p_token TEXT, p_dados JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user   UUID;
    v_org    UUID;
    v_titulo TEXT;
    v_space  UUID;
    v_folder UUID;
    v_extra  TEXT;
    v_nova   public.tasks;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' THEN
        RAISE EXCEPTION 'dados da tarefa precisam ser um objeto' USING ERRCODE = '22023';
    END IF;

    SELECT string_agg(k, ', ' ORDER BY k) INTO v_extra
      FROM jsonb_object_keys(p_dados) k
     WHERE k NOT IN ('title', 'description', 'start_date', 'due_date', 'priority', 'space_id', 'folder_id');
    IF v_extra IS NOT NULL THEN
        RAISE EXCEPTION 'campo não aceito: %', v_extra USING ERRCODE = '22023';
    END IF;

    v_titulo := btrim(p_dados ->> 'title');
    IF v_titulo IS NULL OR v_titulo = '' THEN
        RAISE EXCEPTION 'informe o título da tarefa' USING ERRCODE = '22023';
    END IF;

    v_space  := public._celular_uuid(p_dados, 'space_id');
    v_folder := public._celular_uuid(p_dados, 'folder_id');

    IF v_space IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.task_spaces s
         WHERE s.id = v_space
           AND s.org_id = v_org
           AND (s.owner_user_id = v_user OR public.is_task_space_member_de(v_user, s.id))
    ) THEN
        RAISE EXCEPTION 'sem acesso a este espaço' USING ERRCODE = '42501';
    END IF;

    IF v_folder IS NOT NULL AND (v_space IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.task_folders f WHERE f.id = v_folder AND f.space_id = v_space
    )) THEN
        RAISE EXCEPTION 'a pasta não é deste espaço' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.tasks AS t
           (org_id, user_id, title, description, start_date, due_date, priority,
            status, source_module, space_id, folder_id)
    VALUES (v_org, v_user, v_titulo,
            nullif(btrim(p_dados ->> 'description'), ''),
            public._celular_data(p_dados, 'start_date'),
            public._celular_data(p_dados, 'due_date'),
            CASE WHEN p_dados ? 'priority' THEN public._celular_prioridade(p_dados) ELSE 3 END,
            'open', 'manual', v_space, v_folder)
    RETURNING t.* INTO v_nova;

    RETURN public._celular_tarefa_json(v_nova);
END;
$$;

-- ── Atualizar tarefa ────────────────────────────────────────────────────────
-- Lista branca: title, description, start_date, due_date, priority,
-- status ('open'|'done'), status_id, assignee_employee_id; chave fora → 22023.
-- Só mexe nas chaves enviadas. Tarefa: da org do link e editável por
-- tasks_update (dono, ou membro do espaço) — colaborador só lê; senão 42501,
-- sem dizer se a tarefa existe. status_id: da org do link; responsável: em
-- _celular_responsaveis da org do link; senão 42501.
-- completed_at fica com o gatilho tasks_touch_updated_at.
CREATE OR REPLACE FUNCTION public.celular_tarefa_atualizar(p_token TEXT, p_task_id UUID, p_patch JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user      UUID;
    v_org       UUID;
    v_extra     TEXT;
    v_titulo    TEXT;
    v_status    TEXT;
    v_status_id UUID;
    v_resp      UUID;
    v_atual     public.tasks;
    v_nova      public.tasks;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
        RAISE EXCEPTION 'alteração precisa ser um objeto' USING ERRCODE = '22023';
    END IF;

    SELECT string_agg(k, ', ' ORDER BY k) INTO v_extra
      FROM jsonb_object_keys(p_patch) k
     WHERE k NOT IN ('title', 'description', 'start_date', 'due_date', 'priority',
                     'status', 'status_id', 'assignee_employee_id');
    IF v_extra IS NOT NULL THEN
        RAISE EXCEPTION 'campo não aceito: %', v_extra USING ERRCODE = '22023';
    END IF;

    SELECT t.* INTO v_atual
      FROM public.tasks t
     WHERE t.id = p_task_id
       AND t.org_id = v_org
       AND (t.user_id = v_user
            OR (t.space_id IS NOT NULL AND public.is_task_space_member_de(v_user, t.space_id)))
       FOR UPDATE;
    IF v_atual.id IS NULL THEN
        RAISE EXCEPTION 'tarefa não encontrada ou sem permissão para editar' USING ERRCODE = '42501';
    END IF;

    IF p_patch ? 'title' THEN
        v_titulo := btrim(p_patch ->> 'title');
        IF v_titulo IS NULL OR v_titulo = '' THEN
            RAISE EXCEPTION 'informe o título da tarefa' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF p_patch ? 'status' THEN
        v_status := p_patch ->> 'status';
        IF v_status IS NULL OR v_status NOT IN ('open', 'done') THEN
            RAISE EXCEPTION 'status inválido (open ou done)' USING ERRCODE = '22023';
        END IF;
    END IF;

    v_status_id := public._celular_uuid(p_patch, 'status_id');
    IF v_status_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.task_statuses ts WHERE ts.id = v_status_id AND ts.org_id = v_org
    ) THEN
        RAISE EXCEPTION 'status de outra organização' USING ERRCODE = '42501';
    END IF;

    v_resp := public._celular_uuid(p_patch, 'assignee_employee_id');
    IF v_resp IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public._celular_responsaveis(v_org) e WHERE e.id = v_resp
    ) THEN
        RAISE EXCEPTION 'responsável fora desta organização' USING ERRCODE = '42501';
    END IF;

    UPDATE public.tasks AS t SET
        title                = CASE WHEN p_patch ? 'title'       THEN v_titulo ELSE t.title END,
        description          = CASE WHEN p_patch ? 'description' THEN nullif(btrim(p_patch ->> 'description'), '') ELSE t.description END,
        start_date           = CASE WHEN p_patch ? 'start_date'  THEN public._celular_data(p_patch, 'start_date') ELSE t.start_date END,
        due_date             = CASE WHEN p_patch ? 'due_date'    THEN public._celular_data(p_patch, 'due_date') ELSE t.due_date END,
        priority             = CASE WHEN p_patch ? 'priority'    THEN public._celular_prioridade(p_patch) ELSE t.priority END,
        status               = CASE WHEN p_patch ? 'status'      THEN v_status ELSE t.status END,
        status_id            = CASE WHEN p_patch ? 'status_id'   THEN v_status_id ELSE t.status_id END,
        assignee_employee_id = CASE WHEN p_patch ? 'assignee_employee_id' THEN v_resp ELSE t.assignee_employee_id END
     WHERE t.id = v_atual.id
    RETURNING t.* INTO v_nova;

    RETURN public._celular_tarefa_json(v_nova);
END;
$$;

-- ── Privilégios (REGRA #7) ──────────────────────────────────────────────────
-- Internos: nenhum papel da API executa; só as celular_*, que rodam como dono.
REVOKE EXECUTE ON FUNCTION public._celular_tarefa_json(public.tasks)                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._celular_tarefa_visivel(UUID, UUID, public.tasks) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._celular_responsaveis(UUID)                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._celular_data(JSONB, TEXT)                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._celular_uuid(JSONB, TEXT)                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._celular_prioridade(JSONB)                        FROM PUBLIC, anon, authenticated;

-- celular_*: o celular chama como anon, só com o token; a autorização é o
-- resolver + as regras acima, dentro de cada função.
REVOKE EXECUTE ON FUNCTION public.celular_sessao(TEXT)                                FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_sessao(TEXT)                                TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_tarefas_listar(TEXT, UUID, UUID, BOOLEAN)   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_tarefas_listar(TEXT, UUID, UUID, BOOLEAN)   TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_espacos_listar(TEXT)                        FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_espacos_listar(TEXT)                        TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_status_listar(TEXT)                         FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_status_listar(TEXT)                         TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_responsaveis_listar(TEXT)                   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_responsaveis_listar(TEXT)                   TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_tarefa_criar(TEXT, JSONB)                   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_tarefa_criar(TEXT, JSONB)                   TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_tarefa_atualizar(TEXT, UUID, JSONB)         FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_tarefa_atualizar(TEXT, UUID, JSONB)         TO anon, authenticated;
