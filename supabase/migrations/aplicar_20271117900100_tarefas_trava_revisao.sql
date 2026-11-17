-- ==========================================================================
-- Tarefas: trava do create_task — correções da revisão independente (17/11)
-- Date: 2026-11-17
-- Plano: docs/planos/2026-11-17-rotinas-itens-de-fora.md (Revisão independente)
-- Prova: scripts/teste-tarefas-create-task-trava.sql
-- Base:  aplicar_20271117900000_tarefas_create_task_trava.sql
-- ==========================================================================
-- O QUE MUDA
-- 1. create_task — a pessoa pode ser também o login de um colaborador que QUEM CRIA enxerga: de uma
--    organização dele, ou disponibilizado para uma delas (a mesma regra da RLS de employees). A
--    ordem de execução escolhe o responsável nessa lista inteira; com a regra anterior (só
--    colaborador da org da TAREFA) um colaborador de outra org do usuário era recusado — e o
--    `.catch(() => {})` da tela engolia o erro. Quem é de fora de todas as orgs do usuário segue
--    recusado.
-- 2. Gatilho trg_tasks_troca_de_org — passa a olhar também responsável, espaço, pasta, obra e
--    tarefa-mãe: numa tarefa de organização da qual o usuário não é (mais) membro, esses campos
--    ficam como estão. Antes, um ex-membro punha um colaborador da org como responsável da tarefa
--    antiga dele e ela aparecia para esse colaborador e os gestores de lá. Conteúdo e andamento
--    seguem editáveis (concluir a própria tarefa antiga). Continua disparando depois de
--    trg_tasks_responsavel_so_conteudo (ordem alfabética).
-- 3. task_collaborators (Envolvidos) — inserir/alterar exige, além de poder gerir os envolvidos da
--    tarefa, que a tarefa seja de uma organização do usuário e que o colaborador seja um que ele
--    enxerga (o EXISTS em employees roda com a RLS de quem grava). Antes, quem criou a tarefa
--    punha como envolvido um colaborador de qualquer organização, e ele passava a vê-la.
-- Dados em 17/11: 2 envolvidos, nenhum fora da org da tarefa.
--
-- ROLLBACK
--   1. create_task: o corpo de aplicar_20271117900000 (ramo de colaborador só da org da tarefa).
--   2. _tasks_org_so_das_minhas e o gatilho: os de aplicar_20271117900000 (só org_id).
--   3. ALTER POLICY task_collaborators_insert ON public.task_collaborators
--        WITH CHECK (pode_gerir_envolvidos_da_tarefa(task_id));
--      ALTER POLICY task_collaborators_update ON public.task_collaborators
--        USING (pode_gerir_envolvidos_da_tarefa(task_id)) WITH CHECK (pode_gerir_envolvidos_da_tarefa(task_id));
-- ==========================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.create_task(
    p_user_id       UUID,
    p_org_id        UUID,
    p_title         TEXT,
    p_due           TIMESTAMPTZ DEFAULT NULL,
    p_source_module TEXT        DEFAULT 'manual',
    p_source_ref    JSONB       DEFAULT NULL,
    p_priority      SMALLINT    DEFAULT 2,
    p_description   TEXT        DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_id  UUID;
BEGIN
    -- Sem usuário na requisição = chamada interna (pg_cron como postgres, service_role).
    -- Todo chamador da API tem usuário: anon e PUBLIC não executam esta função.
    IF v_uid IS NOT NULL THEN
        IF p_org_id IS NULL
           OR NOT EXISTS (SELECT 1 FROM public.minhas_orgs_membro() o WHERE o = p_org_id) THEN
            RAISE EXCEPTION 'sem acesso à organização da tarefa: só quem é membro dela cria tarefa nela'
                USING ERRCODE = '42501';
        END IF;

        IF p_user_id IS DISTINCT FROM v_uid AND NOT (
               -- membro da organização da tarefa (por user_id; linha de convite sem user_id, pelo
               -- e-mail — como is_org_member)
               EXISTS (SELECT 1 FROM public.organization_members m
                        WHERE m.organization_id = p_org_id
                          AND (m.user_id = p_user_id
                               OR (m.user_id IS NULL
                                   AND lower(m.email) = (SELECT lower(u.email) FROM auth.users u WHERE u.id = p_user_id))))
               -- login de um colaborador que quem cria enxerga: de uma org dele, ou disponibilizado
               -- para uma delas (mesma regra da RLS de employees)
            OR EXISTS (SELECT 1 FROM public.employees e
                        WHERE e.user_id = p_user_id
                          AND (e.org_id IN (SELECT public.minhas_orgs_membro())
                               OR EXISTS (SELECT 1 FROM public.employee_org_shares s
                                           WHERE s.employee_id = e.id
                                             AND s.target_org_id IN (SELECT public.minhas_orgs_membro()))))
        ) THEN
            RAISE EXCEPTION 'a tarefa só vai para a agenda de um membro da organização dela ou de um colaborador que você enxerga (de uma organização sua, ou disponibilizado para uma delas)'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    INSERT INTO public.tasks (
        user_id, org_id, title, description, due_date,
        source_module, source_ref, priority
    ) VALUES (
        p_user_id, p_org_id, p_title, p_description, p_due,
        p_source_module, p_source_ref, p_priority
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;

    RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_task(UUID, UUID, TEXT, TIMESTAMPTZ, TEXT, JSONB, SMALLINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_task(UUID, UUID, TEXT, TIMESTAMPTZ, TEXT, JSONB, SMALLINT, TEXT) TO authenticated, service_role;

-- Tarefa só se move ou se abre para os outros dentro das organizações do usuário.
-- Sem usuário (rotinas), não confere.
CREATE OR REPLACE FUNCTION public._tasks_org_so_das_minhas()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_minha BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;
    v_minha := EXISTS (SELECT 1 FROM public.minhas_orgs_membro() o WHERE o = NEW.org_id);

    IF NEW.org_id IS DISTINCT FROM OLD.org_id AND NOT v_minha THEN
        RAISE EXCEPTION 'a organização da tarefa só muda para uma organização de que você é membro'
            USING ERRCODE = '42501';
    END IF;

    -- Tarefa que segue numa org que não é do usuário (ex-membro com tarefa antiga de lá): o que a
    -- mostra para outras pessoas fica como está.
    IF NOT v_minha
       AND (   NEW.assignee_employee_id IS DISTINCT FROM OLD.assignee_employee_id
            OR NEW.space_id             IS DISTINCT FROM OLD.space_id
            OR NEW.folder_id            IS DISTINCT FROM OLD.folder_id
            OR NEW.project_id           IS DISTINCT FROM OLD.project_id
            OR NEW.parent_task_id       IS DISTINCT FROM OLD.parent_task_id) THEN
        RAISE EXCEPTION 'esta tarefa é de uma organização da qual você não é membro: responsável, espaço, pasta, obra e tarefa-mãe ficam como estão (o conteúdo e o andamento continuam editáveis)'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public._tasks_org_so_das_minhas() FROM PUBLIC, anon, authenticated;

-- O nome decide a ordem (gatilhos BEFORE disparam em ordem alfabética): este vem DEPOIS de
-- trg_tasks_responsavel_so_conteudo, que dá ao responsável a mensagem mais útil.
DROP TRIGGER IF EXISTS trg_tasks_troca_de_org ON public.tasks;
CREATE TRIGGER trg_tasks_troca_de_org
    BEFORE UPDATE OF org_id, assignee_employee_id, space_id, folder_id, project_id, parent_task_id
    ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public._tasks_org_so_das_minhas();

-- Envolvidos: tarefa de uma org do usuário, colaborador que ele enxerga (RLS de employees).
ALTER POLICY task_collaborators_insert ON public.task_collaborators
    WITH CHECK (
        public.pode_gerir_envolvidos_da_tarefa(task_id)
        AND EXISTS (SELECT 1 FROM public.tasks t
                     WHERE t.id = task_id AND t.org_id IN (SELECT public.minhas_orgs_membro()))
        AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id)
    );
ALTER POLICY task_collaborators_update ON public.task_collaborators
    USING (public.pode_gerir_envolvidos_da_tarefa(task_id))
    WITH CHECK (
        public.pode_gerir_envolvidos_da_tarefa(task_id)
        AND EXISTS (SELECT 1 FROM public.tasks t
                     WHERE t.id = task_id AND t.org_id IN (SELECT public.minhas_orgs_membro()))
        AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id)
    );

COMMIT;
