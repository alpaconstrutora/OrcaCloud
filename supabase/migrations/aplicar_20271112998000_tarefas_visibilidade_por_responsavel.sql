-- aplicar_20271112998000_tarefas_visibilidade_por_responsavel.sql
--
-- Quem vê uma tarefa: quem a criou, o responsável, os Envolvidos (só consulta) e o
-- proprietário/admin da organização da tarefa. Espaço não dá mais visão.
-- Plano: docs/planos/2026-11-11-link-celular-tarefas-diario.md
--        (Ajustes — visibilidade pelo responsável, 2026-11-12).
-- Prova: scripts/teste-tarefas-visibilidade.sql (+ as quatro provas de tarefas adaptadas).
--
-- Pedido (2026-11-12): "Quando eu coloco o responsavel pela tarefa. deve ficar visivel
-- penas para este responsável." Regra final do usuário: "Quem criou a tarefa, quem é o
-- responsável, o proprietário, o admin e os selecionados para visualizacao vê a tarefa".
-- Decisões:
--   • "proprietário e admin" = organization_members.role 'owner'/'admin' da org DA TAREFA.
--   • "espaço não dá visão": ser membro de um espaço não libera as tarefas dele (o espaço
--     só organiza). Saem as pernas de membro do espaço de SELECT, UPDATE e DELETE.
--   • "pessoal fica pessoal": sem responsável E fora de espaço = agenda pessoal → só quem
--     criou e os Envolvidos; owner/admin (e superadmin) NÃO veem. Isso tira dos superadmins
--     as cópias por membro do "Renovar contrato" (generate_rental_renewal_alerts).
--   • "selecionados para visualização" = os Envolvidos (task_collaborators), só leitura.
--
-- Regra (app logado = link do celular):
--   VER     criador OU responsável (membro da org) OU envolvido
--           OU owner/admin da org da tarefa, se ela tem responsável ou está num espaço.
--   EDITAR  criador: tudo. owner/admin: tudo, na tarefa que vê. responsável: só conteúdo
--           (gatilho). envolvido: nada.
--           Deixar a tarefa sem responsável E fora de espaço (vira agenda pessoal do
--           criador) só o criador: quem mais o fizesse deixaria de ver a linha que acabou de
--           gravar, e o PostgreSQL recusaria com 42501 genérico ("new row violates
--           row-level security policy") — o gatilho recusa antes, com a explicação.
--   APAGAR  só quem criou (sai a perna do dono do espaço: espaço não dá nada).
--   CRIAR   sem mudança (tasks_insert: criador; num espaço, só sendo membro dele — o espaço
--           continua sendo onde a tarefa se organiza).
--   ENVOLVIDOS geridos por quem edita a tarefa inteira: criador, ou owner/admin na tarefa
--           que vê.
--
-- Superadmin: sem perna própria. Os gatilhos de membership põem os superadmins como
-- owner/admin em toda organização (medido em 12/11/2026: 8 de 8 orgs, para os dois), então
-- a perna de owner/admin já os cobre — e uma regra só mantém o link igual ao app (o link
-- não tem perna de superadmin). Saem tasks_select_superadmin e tasks_update_superadmin
-- (aplicar_20271112997000), substituídas por tasks_select_gestor / tasks_update_gestor.
--
-- REGRA #7, pergunta 1, perna por perna:
--   • user_id = auth.uid(): o criador; sozinho basta, é o que se quer.
--   • responsável: igual a antes (is_employee_do_usuario + membro da org da tarefa).
--   • envolvido: igual a antes (is_task_collaborator).
--   • gestor: org_id ∈ orgs em que sou owner/admin E (tem responsável OU está em espaço) —
--     nunca libera a agenda pessoal alheia, nem tarefa de outra org.
-- REGRA #7, pergunta 2:
--   • minhas_orgs_gestor(): SECURITY DEFINER (lê organization_members, que a RLS recorta);
--     só responde "em que orgs EU sou owner/admin" (auth.uid() / e-mail do JWT); anon recebe
--     conjunto vazio. EXECUTE para anon, authenticated e service_role porque as policies de
--     tasks são TO public e avaliadas como o papel de quem consulta (mesmo critério de
--     minhas_orgs_membro). Mesma identidade de minhas_orgs_membro (user_id; e-mail só com
--     user_id NULL), sem a perna de corretor (corretor não é owner/admin).
--   • is_org_gestor_de(user, org): gêmeo interno do link (molde: is_org_member_de); ninguém
--     da API executa.
-- Desempenho: forma de conjunto `org_id IN (SELECT public.minhas_orgs_gestor())` (avaliada
-- uma vez por consulta) e `(SELECT auth.uid())`, como as policies do #382.
--
-- Funções reescritas, copiadas dos ARQUIVOS (não do banco), só com as pernas trocadas:
--   _tasks_responsavel_so_conteudo, pode_gerir_envolvidos_da_tarefa ← aplicar_20271112997000;
--   _celular_tarefa_visivel, celular_tarefa_atualizar              ← aplicar_20271111995000.
-- celular_tarefas_listar e celular_espacos_listar (open_task_count) usam
-- _celular_tarefa_visivel e acompanham sem mudança. No app, a contagem de tarefas do espaço
-- (taskSpaceService.listSpaces) lê tasks pela RLS e acompanha sozinha.
--
-- Idempotente. Aplicar com `npx supabase db query --linked -f` — nunca `db push`.
--
-- ROLLBACK (volta à regra de aplicar_20271112997000):
--   DROP POLICY tasks_select_gestor, tasks_update_gestor ON public.tasks;
--   CREATE POLICY tasks_select ON public.tasks FOR SELECT
--     USING (user_id = auth.uid() OR (space_id IS NOT NULL AND is_task_space_member(space_id)));
--   CREATE POLICY tasks_update ON public.tasks FOR UPDATE
--     USING      (user_id = auth.uid() OR (space_id IS NOT NULL AND is_task_space_member(space_id)))
--     WITH CHECK (user_id = auth.uid() OR (space_id IS NOT NULL AND is_task_space_member(space_id)));
--   CREATE POLICY tasks_delete ON public.tasks FOR DELETE
--     USING (user_id = auth.uid() OR (space_id IS NOT NULL AND EXISTS (SELECT 1 FROM task_space_members m
--            WHERE m.space_id = tasks.space_id AND m.user_id = auth.uid() AND m.role = 'owner')));
--   (cada uma precedida de DROP POLICY IF EXISTS) + reaplicar aplicar_20271112997000 inteiro
--   (tasks_*_superadmin, _tasks_responsavel_so_conteudo, pode_gerir_envolvidos_da_tarefa) +
--   CREATE OR REPLACE de _celular_tarefa_visivel e celular_tarefa_atualizar do arquivo
--   aplicar_20271111995000 (seção 3) + DROP FUNCTION public.is_org_gestor_de(UUID, UUID),
--   public.minhas_orgs_gestor() (depois das policies, que dependem dela).

-- ── 1. "Em que orgs sou owner/admin?" ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.minhas_orgs_gestor()
RETURNS SETOF UUID
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT m.organization_id
      FROM public.organization_members m
     WHERE m.organization_id IS NOT NULL
       AND m.role IN ('owner', 'admin')
       AND ((m.user_id IS NOT NULL AND m.user_id = auth.uid())
         OR (m.user_id IS NULL AND lower(m.email) = lower(auth.jwt() ->> 'email')))
$$;
REVOKE EXECUTE ON FUNCTION public.minhas_orgs_gestor() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.minhas_orgs_gestor() TO anon, authenticated, service_role;

-- Gêmeo do link: o usuário p_user é owner/admin de p_org?
CREATE OR REPLACE FUNCTION public.is_org_gestor_de(p_user UUID, p_org UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT p_user IS NOT NULL
       AND p_org IS NOT NULL
       AND EXISTS (
           SELECT 1
             FROM public.organization_members m
            WHERE m.organization_id = p_org
              AND m.role IN ('owner', 'admin')
              AND ((m.user_id IS NOT NULL AND m.user_id = p_user)
                OR (m.user_id IS NULL
                    AND lower(m.email) = (SELECT lower(u.email) FROM auth.users u WHERE u.id = p_user))))
$$;
REVOKE EXECUTE ON FUNCTION public.is_org_gestor_de(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ── 2. RLS de tasks ─────────────────────────────────────────────────────────
-- Ver: criador (o responsável e o envolvido seguem em tasks_select_assignee e
-- tasks_select_collaborator, sem mudança).
DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks
    FOR SELECT
    USING (user_id = (SELECT auth.uid()));

-- Ver: owner/admin da org da tarefa, se ela não é agenda pessoal.
DROP POLICY IF EXISTS tasks_select_superadmin ON public.tasks;
DROP POLICY IF EXISTS tasks_select_gestor ON public.tasks;
CREATE POLICY tasks_select_gestor ON public.tasks
    FOR SELECT
    USING ((assignee_employee_id IS NOT NULL OR space_id IS NOT NULL)
           AND COALESCE(org_id IN (SELECT public.minhas_orgs_gestor()), false));

-- Editar: criador (tudo; continua sendo o criador depois).
DROP POLICY IF EXISTS tasks_update ON public.tasks;
CREATE POLICY tasks_update ON public.tasks
    FOR UPDATE
    USING      (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

-- Editar: owner/admin na tarefa que vê; a linha nova tem de continuar visível para ele.
DROP POLICY IF EXISTS tasks_update_superadmin ON public.tasks;
DROP POLICY IF EXISTS tasks_update_gestor ON public.tasks;
CREATE POLICY tasks_update_gestor ON public.tasks
    FOR UPDATE
    USING      ((assignee_employee_id IS NOT NULL OR space_id IS NOT NULL)
                AND COALESCE(org_id IN (SELECT public.minhas_orgs_gestor()), false))
    WITH CHECK ((assignee_employee_id IS NOT NULL OR space_id IS NOT NULL)
                AND COALESCE(org_id IN (SELECT public.minhas_orgs_gestor()), false));

-- Apagar: só quem criou.
DROP POLICY IF EXISTS tasks_delete ON public.tasks;
CREATE POLICY tasks_delete ON public.tasks
    FOR DELETE
    USING (user_id = (SELECT auth.uid()));

-- ── 3. Gatilho: o responsável só mexe no conteúdo; agenda pessoal só pelo criador ──
-- Isento da trava do conteúdo: o criador e o owner/admin da org da linha ANTIGA (que, pela
-- RLS, só chega aqui numa tarefa que vê). Sai a perna de membro do espaço e a de
-- superadmin (coberta pela de owner/admin).
CREATE OR REPLACE FUNCTION public._tasks_responsavel_so_conteudo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon')
       AND NOT coalesce(OLD.user_id = auth.uid()
                        OR OLD.org_id IN (SELECT public.minhas_orgs_gestor()), false)
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
    -- Sem responsável e fora de espaço = agenda pessoal de quem criou: só o criador deixa
    -- a tarefa assim (quem mais o fizesse deixaria de vê-la e cairia no 42501 genérico).
    IF current_user IN ('authenticated', 'anon')
       AND NEW.assignee_employee_id IS NULL AND NEW.space_id IS NULL
       AND NOT coalesce(OLD.user_id = auth.uid(), false) THEN
        RAISE EXCEPTION 'só quem criou a tarefa pode deixá-la sem responsável e fora de espaço (ela vira a agenda pessoal de quem a criou)'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._tasks_responsavel_so_conteudo() FROM PUBLIC, anon, authenticated;

-- ── 4. Envolvidos: geridos por quem edita a tarefa inteira ──────────────────
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
                OR ((t.assignee_employee_id IS NOT NULL OR t.space_id IS NOT NULL)
                    AND t.org_id IN (SELECT public.minhas_orgs_gestor()))))
$$;
REVOKE EXECUTE ON FUNCTION public.pode_gerir_envolvidos_da_tarefa(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.pode_gerir_envolvidos_da_tarefa(UUID) TO anon, authenticated, service_role;

-- ── 5. Link do celular: a mesma regra, para p_user, presa à org do link ──────
-- tasks_select ∪ tasks_select_collaborator ∪ tasks_select_assignee ∪ tasks_select_gestor.
-- O is_org_member do responsável não entra: t.org_id = org do link, e o
-- _mobile_link_resolver reconfere is_org_member_de a cada chamada.
CREATE OR REPLACE FUNCTION public._celular_tarefa_visivel(p_user UUID, p_org UUID, t public.tasks)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT t.org_id = p_org
       AND (   t.user_id = p_user
            OR public.is_task_collaborator_de(p_user, t.id)
            OR (t.assignee_employee_id IS NOT NULL AND public.is_employee_do_usuario_de(p_user, t.assignee_employee_id))
            OR ((t.assignee_employee_id IS NOT NULL OR t.space_id IS NOT NULL)
                AND public.is_org_gestor_de(p_user, p_org)))
$$;
REVOKE EXECUTE ON FUNCTION public._celular_tarefa_visivel(UUID, UUID, public.tasks) FROM PUBLIC, anon, authenticated;

-- ── Atualizar tarefa ────────────────────────────────────────────────────────
-- Lista branca: title, description, start_date, due_date, priority,
-- status ('open'|'done'), status_id, assignee_employee_id; chave fora → 22023.
-- Só mexe nas chaves enviadas. Tarefa: da org do link e editável por
-- tasks_update (criador), tasks_update_gestor (owner/admin, tarefa que vê) ou
-- tasks_update_assignee (o responsável) — envolvido só lê; senão 42501, sem dizer se a
-- tarefa existe. Quem edita só por ser o responsável não troca o responsável; só o
-- criador tira o responsável de tarefa fora de espaço (o gatilho do app); senão 42501.
-- status_id: da org do link; responsável: em _celular_responsaveis da org do link;
-- senão 42501. completed_at fica com o gatilho tasks_touch_updated_at.
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
    v_tudo      BOOLEAN;
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
            OR ((t.assignee_employee_id IS NOT NULL OR t.space_id IS NOT NULL) AND public.is_org_gestor_de(v_user, v_org))
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

    -- WITH CHECK de tasks_update ∪ tasks_update_gestor ∪ tasks_update_assignee e o gatilho
    -- do app sobre a linha nova (espaço e criador a lista branca não deixa mudar):
    --   • criador e owner/admin trocam o responsável; quem edita só por ser o responsável
    --     continua tendo de ser o responsável depois da alteração;
    --   • tirar o responsável de tarefa fora de espaço (vira agenda pessoal) só o criador.
    v_tudo := v_atual.user_id = v_user
              OR ((v_atual.assignee_employee_id IS NOT NULL OR v_atual.space_id IS NOT NULL)
                  AND public.is_org_gestor_de(v_user, v_org));
    IF p_patch ? 'assignee_employee_id' THEN
        IF NOT v_tudo AND NOT (v_resp IS NOT NULL AND public.is_employee_do_usuario_de(v_user, v_resp)) THEN
            RAISE EXCEPTION 'só quem criou a tarefa ou o proprietário/admin da organização troca o responsável'
                USING ERRCODE = '42501';
        END IF;
        IF v_resp IS NULL AND v_atual.space_id IS NULL AND v_atual.user_id IS DISTINCT FROM v_user THEN
            RAISE EXCEPTION 'só quem criou a tarefa pode deixá-la sem responsável e fora de espaço (ela vira a agenda pessoal de quem a criou)'
                USING ERRCODE = '42501';
        END IF;
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
REVOKE EXECUTE ON FUNCTION public.celular_tarefa_atualizar(TEXT, UUID, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_tarefa_atualizar(TEXT, UUID, JSONB) TO anon, authenticated;
