-- scripts/rollback-tarefas-visibilidade.sql
--
-- VOLTA de supabase/migrations/aplicar_20271112998000_tarefas_visibilidade_por_responsavel.sql:
-- devolve `tasks` e as funções ao estado de produção de 13/11/2026 (regra de
-- aplicar_20271112997000 sobre aplicar_20271111995000 e aplicar_20271112800000) — membro
-- do espaço vê/edita as tarefas do espaço, dono do espaço apaga, superadmin vê e edita tudo.
-- Plano: docs/planos/2026-11-11-link-celular-tarefas-diario.md
--        (Ajustes — visibilidade pelo responsável).
--
-- Copiado dos ARQUIVOS, não do banco:
--   _tasks_responsavel_so_conteudo, pode_gerir_envolvidos_da_tarefa,
--   tasks_select_superadmin, tasks_update_superadmin ← aplicar_20271112997000
--   _celular_tarefa_visivel, celular_tarefa_atualizar ← aplicar_20271111995000 (seção 3)
--   tasks_select, tasks_update, tasks_delete         ← 20260605000001_task_spaces_and_folders
--                                                      (= pg_policies de produção em 13/11)
--   privilégios                                      ← os de produção em 13/11 (proacl)
-- Observação: em produção os corpos de _celular_tarefa_visivel e celular_tarefa_atualizar
-- têm CRLF (o arquivo 995000 é CRLF); aqui saem com LF — mesmo código, só o fim de linha.
--
-- Ordem segura: primeiro as funções e policies que hoje chamam minhas_orgs_gestor /
-- is_org_gestor_de voltam ao corpo antigo; só no fim o DROP dessas duas (sem CASCADE: se
-- algo ainda depender delas, o DROP falha e a transação inteira volta).
--
-- Ensaio (migration + esta volta = banco de hoje): scripts/teste-rollback-tarefas-visibilidade.sql
-- Aplicar (só se a 998000 tiver sido aplicada e for preciso voltar):
--   npx supabase db query --linked -f scripts/rollback-tarefas-visibilidade.sql
-- Nunca `supabase db push`.

BEGIN;
SET LOCAL lock_timeout = '2s';

-- ── 1. Funções de volta ao corpo de antes (deixam de chamar minhas_orgs_gestor) ──
CREATE OR REPLACE FUNCTION public._tasks_responsavel_so_conteudo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon')
       AND NOT coalesce(OLD.user_id = auth.uid()
                        OR (OLD.space_id IS NOT NULL AND public.is_task_space_member(OLD.space_id))
                        OR public.is_superadmin(), false)
       AND (   NEW.id                   IS DISTINCT FROM OLD.id
            OR NEW.created_at           IS DISTINCT FROM OLD.created_at
            OR NEW.user_id              IS DISTINCT FROM OLD.user_id
            OR NEW.org_id               IS DISTINCT FROM OLD.org_id
            OR NEW.space_id             IS DISTINCT FROM OLD.space_id
            OR NEW.folder_id            IS DISTINCT FROM OLD.folder_id
            OR NEW.assignee_employee_id IS DISTINCT FROM OLD.assignee_employee_id
            OR NEW.parent_task_id       IS DISTINCT FROM OLD.parent_task_id
            OR NEW.project_id           IS DISTINCT FROM OLD.project_id
            OR NEW.source_module        IS DISTINCT FROM OLD.source_module
            OR NEW.source_ref           IS DISTINCT FROM OLD.source_ref) THEN
        RAISE EXCEPTION 'o responsável só altera título, descrição, datas, prioridade e status da tarefa'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pode_gerir_envolvidos_da_tarefa(p_task_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.tasks t
         WHERE t.id = p_task_id
           AND (   t.user_id = auth.uid()
                OR (t.space_id IS NOT NULL AND public.is_task_space_member(t.space_id))
                OR public.is_superadmin()))
$$;

CREATE OR REPLACE FUNCTION public._celular_tarefa_visivel(p_user UUID, p_org UUID, t public.tasks)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT t.org_id = p_org
       AND (   t.user_id = p_user
            OR (t.space_id IS NOT NULL AND public.is_task_space_member_de(p_user, t.space_id))
            OR public.is_task_collaborator_de(p_user, t.id)
            OR (t.assignee_employee_id IS NOT NULL AND public.is_employee_do_usuario_de(p_user, t.assignee_employee_id)))
$$;

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
            OR (t.space_id IS NOT NULL AND public.is_task_space_member_de(v_user, t.space_id))
            OR (t.assignee_employee_id IS NOT NULL AND public.is_employee_do_usuario_de(v_user, t.assignee_employee_id)))
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

    -- WITH CHECK de tasks_update ∪ tasks_update_assignee sobre a linha nova:
    -- dono e membro do espaço (colunas que a lista branca não deixa mudar)
    -- trocam o responsável; quem edita só por ser o responsável continua tendo
    -- de ser o responsável depois da alteração.
    IF p_patch ? 'assignee_employee_id'
       AND NOT (v_atual.user_id = v_user
                OR (v_atual.space_id IS NOT NULL AND public.is_task_space_member_de(v_user, v_atual.space_id)))
       AND NOT (v_resp IS NOT NULL AND public.is_employee_do_usuario_de(v_user, v_resp)) THEN
        RAISE EXCEPTION 'só o dono da tarefa ou membro do espaço troca o responsável' USING ERRCODE = '42501';
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

-- ── 2. Policies de tasks de volta ───────────────────────────────────────────
DROP POLICY IF EXISTS tasks_select_gestor ON public.tasks;
DROP POLICY IF EXISTS tasks_update_gestor ON public.tasks;

DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks
    FOR SELECT USING (
        user_id = auth.uid()
        OR (space_id IS NOT NULL AND public.is_task_space_member(space_id))
    );

DROP POLICY IF EXISTS tasks_update ON public.tasks;
CREATE POLICY tasks_update ON public.tasks
    FOR UPDATE USING (
        user_id = auth.uid()
        OR (space_id IS NOT NULL AND public.is_task_space_member(space_id))
    )
    WITH CHECK (
        user_id = auth.uid()
        OR (space_id IS NOT NULL AND public.is_task_space_member(space_id))
    );

DROP POLICY IF EXISTS tasks_delete ON public.tasks;
CREATE POLICY tasks_delete ON public.tasks
    FOR DELETE USING (
        user_id = auth.uid()
        OR (
            space_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.task_space_members m
                 WHERE m.space_id = tasks.space_id
                   AND m.user_id = auth.uid()
                   AND m.role = 'owner'
            )
        )
    );

DROP POLICY IF EXISTS tasks_select_superadmin ON public.tasks;
CREATE POLICY tasks_select_superadmin ON public.tasks
    FOR SELECT
    USING ((SELECT public.is_superadmin()));

DROP POLICY IF EXISTS tasks_update_superadmin ON public.tasks;
CREATE POLICY tasks_update_superadmin ON public.tasks
    FOR UPDATE
    USING      ((SELECT public.is_superadmin()))
    WITH CHECK ((SELECT public.is_superadmin()));

-- ── 3. Privilégios = os de produção em 13/11 (CREATE OR REPLACE já os preserva) ──
REVOKE EXECUTE ON FUNCTION public._tasks_responsavel_so_conteudo()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pode_gerir_envolvidos_da_tarefa(UUID)             FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.pode_gerir_envolvidos_da_tarefa(UUID)             TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public._celular_tarefa_visivel(UUID, UUID, public.tasks) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_tarefa_atualizar(TEXT, UUID, JSONB)         FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_tarefa_atualizar(TEXT, UUID, JSONB)         TO anon, authenticated;

-- ── 4. Por último: as duas funções novas da 998000 (nada mais depende delas) ──
DROP FUNCTION IF EXISTS public.is_org_gestor_de(UUID, UUID);
DROP FUNCTION IF EXISTS public.minhas_orgs_gestor();

COMMIT;
