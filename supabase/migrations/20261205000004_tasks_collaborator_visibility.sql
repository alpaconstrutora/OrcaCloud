-- ============================================================
-- Permite que colaboradores (envolvidos) vejam as tarefas
-- em que foram adicionados via task_collaborators.
-- ============================================================

DROP POLICY IF EXISTS tasks_select_collaborator ON public.tasks;
CREATE POLICY tasks_select_collaborator ON public.tasks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.task_collaborators tc
            JOIN public.employees emp ON emp.id = tc.employee_id
            WHERE tc.task_id = tasks.id
              AND emp.email = (SELECT email FROM auth.users WHERE id = auth.uid())
        )
    );
