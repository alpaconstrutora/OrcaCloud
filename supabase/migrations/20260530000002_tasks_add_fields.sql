-- Adiciona campos: data início, responsável (employee) e obra (project)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS start_date         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assignee_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id          UUID REFERENCES public.projects(id)   ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_assignee  ON public.tasks(assignee_employee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project   ON public.tasks(project_id);
