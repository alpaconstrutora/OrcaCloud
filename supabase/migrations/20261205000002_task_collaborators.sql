-- ============================================================
-- task_collaborators: vincula colaboradores (employees) a
-- uma tarefa além do responsável principal.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.task_collaborators (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (task_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_task_collaborators_task     ON public.task_collaborators(task_id);
CREATE INDEX IF NOT EXISTS idx_task_collaborators_employee ON public.task_collaborators(employee_id);

ALTER TABLE public.task_collaborators ENABLE ROW LEVEL SECURITY;

-- Quem pode ver a tarefa pode ver seus colaboradores
CREATE POLICY "task_collaborators_select" ON public.task_collaborators
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.tasks t
            WHERE t.id = task_id
              AND (
                t.user_id = auth.uid()
                OR public.is_task_space_member(t.space_id)
              )
        )
    );

-- Quem pode ver a tarefa pode gerenciar colaboradores
CREATE POLICY "task_collaborators_all" ON public.task_collaborators
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.tasks t
            WHERE t.id = task_id
              AND (
                t.user_id = auth.uid()
                OR public.is_task_space_member(t.space_id)
              )
        )
    );
