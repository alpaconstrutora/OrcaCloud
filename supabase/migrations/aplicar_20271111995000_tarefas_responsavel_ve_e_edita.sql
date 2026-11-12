-- aplicar_20271111995000_tarefas_responsavel_ve_e_edita.sql
--
-- O RESPONSÁVEL pela tarefa (tasks.assignee_employee_id) vê e edita a tarefa —
-- no app logado (RLS de tasks) e no link do celular (_celular_tarefa_visivel e
-- celular_tarefa_atualizar).
-- Plano: docs/planos/2026-11-11-link-celular-tarefas-diario.md (Ajustes — responsável).
-- Prova: scripts/teste-tarefas-responsavel.sql.
-- Depende de: aplicar_20271111950000_link_celular_tabela_e_gemeos.sql e
-- aplicar_20271111960000_link_celular_rpcs_tarefas.sql.
--
-- Causa (2026-11-11): Iago via 2 tarefas no link; outras 5 abertas na org tinham
-- ele como responsável, criadas por outro usuário. Nenhuma regra de tasks olhava
-- o responsável (tasks_select / tasks_select_collaborator / tasks_update só
-- conhecem dono, membro do espaço e colaborador).
--
-- "É o responsável" = o colaborador (employees) do responsável é a pessoa:
--   employees.user_id = usuário, OU — só quando o colaborador não tem user_id —
--   e-mail do colaborador (não vazio) = e-mail da conta em auth.users.
-- REGRA #7, pergunta 1, perna por perna:
--   • e.user_id = p_user: vínculo explícito colaborador → conta; sozinho basta,
--     é exatamente o que se quer liberar.
--   • perna do e-mail: só vale com user_id NULL (vínculo explícito para OUTRA
--     conta não é atropelado pelo e-mail) e e-mail não vazio ('' não casa com
--     ninguém). É o mesmo critério de is_task_collaborator_de, com o vazio fora.
--   • policy: assignee_employee_id IS NOT NULL AND is_employee_do_usuario(...)
--     — tarefa sem responsável não é liberada por esta policy.
--   • tasks_update_assignee WITH CHECK = mesma expressão: o responsável edita,
--     mas não passa a tarefa para outra pessoa (nem a deixa sem responsável).
--     Dono e membro do espaço continuam podendo, por tasks_update.
--   • INSERT e DELETE não mudam: o responsável não apaga a tarefa.
-- REGRA #7, pergunta 2:
--   • is_employee_do_usuario_de(user, employee): interno, ninguém da API executa.
--   • is_employee_do_usuario(employee): usa auth.uid() — só responde "este
--     colaborador é VOCÊ?"; anon recebe FALSE. EXECUTE para anon, authenticated
--     e service_role porque as policies de tasks são TO public e avaliadas como
--     o papel de quem consulta (mesmo critério de is_task_space_member).
--
-- Link do celular: _celular_tarefa_visivel e celular_tarefa_atualizar copiados
-- do ARQUIVO aplicar_20271111960000_link_celular_rpcs_tarefas.sql, com a perna
-- nova. Em celular_tarefa_atualizar entra também o equivalente do WITH CHECK
-- acima: quem só edita por ser o responsável não troca o responsável (42501).
--
-- Idempotente (CREATE OR REPLACE, DROP POLICY IF EXISTS). Aplicar com
-- `npx supabase db query --linked -f` — nunca `db push`.

-- ── 1. "Este colaborador é este usuário?" ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_employee_do_usuario_de(p_user UUID, p_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT p_user IS NOT NULL
       AND p_employee_id IS NOT NULL
       AND EXISTS (
           SELECT 1
             FROM public.employees e
            WHERE e.id = p_employee_id
              AND (   e.user_id = p_user
                   OR (    e.user_id IS NULL
                       AND nullif(btrim(e.email), '') IS NOT NULL
                       AND lower(btrim(e.email)) = (SELECT lower(u.email) FROM auth.users u WHERE u.id = p_user))))
$$;

CREATE OR REPLACE FUNCTION public.is_employee_do_usuario(p_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.is_employee_do_usuario_de(auth.uid(), p_employee_id);
END;
$$;

-- ── 2. RLS de tasks: o responsável vê e edita ───────────────────────────────
DROP POLICY IF EXISTS tasks_select_assignee ON public.tasks;
CREATE POLICY tasks_select_assignee ON public.tasks
    FOR SELECT
    USING (assignee_employee_id IS NOT NULL AND public.is_employee_do_usuario(assignee_employee_id));

DROP POLICY IF EXISTS tasks_update_assignee ON public.tasks;
CREATE POLICY tasks_update_assignee ON public.tasks
    FOR UPDATE
    USING      (assignee_employee_id IS NOT NULL AND public.is_employee_do_usuario(assignee_employee_id))
    WITH CHECK (assignee_employee_id IS NOT NULL AND public.is_employee_do_usuario(assignee_employee_id));

-- ── 3. Link do celular ──────────────────────────────────────────────────────
-- tasks_select ∪ tasks_select_collaborator ∪ tasks_select_assignee para p_user,
-- presa à org do link.
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

-- ── Atualizar tarefa ────────────────────────────────────────────────────────
-- Lista branca: title, description, start_date, due_date, priority,
-- status ('open'|'done'), status_id, assignee_employee_id; chave fora → 22023.
-- Só mexe nas chaves enviadas. Tarefa: da org do link e editável por
-- tasks_update (dono, ou membro do espaço) ou tasks_update_assignee (o
-- responsável) — colaborador só lê; senão 42501, sem dizer se a tarefa existe.
-- Quem edita só por ser o responsável não troca o responsável (o WITH CHECK de
-- tasks_update_assignee); senão 42501. status_id: da org do link; responsável:
-- em _celular_responsaveis da org do link; senão 42501.
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

-- ── 4. Privilégios (REGRA #7) ───────────────────────────────────────────────
-- Interno: nenhum papel da API executa; só is_employee_do_usuario e as
-- celular_*, que rodam como dono.
REVOKE EXECUTE ON FUNCTION public.is_employee_do_usuario_de(UUID, UUID)             FROM PUBLIC, anon, authenticated;

-- Usada pelas policies de tasks (TO public, avaliadas como o papel de quem
-- consulta): anon, authenticated e service_role executam; sai o PUBLIC.
REVOKE EXECUTE ON FUNCTION public.is_employee_do_usuario(UUID)                      FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_employee_do_usuario(UUID)                      TO anon, authenticated, service_role;

-- Reescritas: os mesmos privilégios do arquivo 960000 (CREATE OR REPLACE
-- preserva a ACL; repetidos aqui para o arquivo valer sozinho).
REVOKE EXECUTE ON FUNCTION public._celular_tarefa_visivel(UUID, UUID, public.tasks) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_tarefa_atualizar(TEXT, UUID, JSONB)         FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_tarefa_atualizar(TEXT, UUID, JSONB)         TO anon, authenticated;
