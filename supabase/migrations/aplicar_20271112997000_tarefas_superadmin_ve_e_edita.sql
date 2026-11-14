-- aplicar_20271112997000_tarefas_superadmin_ve_e_edita.sql
--
-- Superadmin (public.superadmins: desenvolvedor@ e altair.rosa@) vê e edita QUALQUER
-- tarefa, inclusive as de fora de espaço ("agenda pessoal") de outra pessoa.
-- Plano: docs/planos/2026-11-11-link-celular-tarefas-diario.md (Ajustes — superadmin).
-- Prova: scripts/teste-tarefas-superadmin.sql.
--
-- Causa (2026-11-12): o desktop logado como desenvolvedor@ mostrava 4 tarefas do Iago e o
-- celular do Iago, 6. A regra "superadmin tem acesso a tudo" (aplicar_20271024950000) foi
-- cumprida pondo o superadmin como owner de todo ESPAÇO de tarefas; tarefa sem espaço só
-- é vista por dono, responsável e envolvidos — o superadmin ficava de fora.
-- Decisão do usuário (2026-11-12): "Ver e editar todas". Apagar NÃO muda.
--
--   • tasks_select_superadmin / tasks_update_superadmin: `(SELECT public.is_superadmin())`
--     — avaliado uma vez por consulta (initplan), não por linha.
--   • _tasks_responsavel_so_conteudo: superadmin fora da trava "o responsável só altera
--     conteúdo" (sem isso não trocaria responsável nem espaço de tarefa alheia). Corpo
--     copiado do ARQUIVO aplicar_20271111995000, só com a perna nova.
--   • pode_gerir_envolvidos_da_tarefa: superadmin gere os envolvidos de qualquer tarefa.
--     Corpo copiado do ARQUIVO aplicar_20271112800000, só com a perna nova.
--
-- Idempotente. Aplicar com `npx supabase db query --linked -f` — nunca `db push`.

DROP POLICY IF EXISTS tasks_select_superadmin ON public.tasks;
CREATE POLICY tasks_select_superadmin ON public.tasks
    FOR SELECT
    USING ((SELECT public.is_superadmin()));

DROP POLICY IF EXISTS tasks_update_superadmin ON public.tasks;
CREATE POLICY tasks_update_superadmin ON public.tasks
    FOR UPDATE
    USING      ((SELECT public.is_superadmin()))
    WITH CHECK ((SELECT public.is_superadmin()));

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
