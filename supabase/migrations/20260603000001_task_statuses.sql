-- ============================================================
-- Módulo: Status Customizáveis de Tarefas
-- OrçaCloud SaaS - Migration
-- ============================================================

-- 1. TABELA DE STATUS
CREATE TABLE IF NOT EXISTS public.task_statuses (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#94a3b8',
    position   SMALLINT NOT NULL DEFAULT 0,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_done    BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_task_statuses_org ON public.task_statuses(org_id, position);

-- 2. SEED: status padrão para todas as orgs existentes
INSERT INTO public.task_statuses (org_id, name, color, position, is_default, is_done)
SELECT id, 'Pendente', '#94a3b8', 0, true, false FROM public.organizations
ON CONFLICT (org_id, name) DO NOTHING;

INSERT INTO public.task_statuses (org_id, name, color, position, is_default, is_done)
SELECT id, 'Em Andamento', '#3b82f6', 1, false, false FROM public.organizations
ON CONFLICT (org_id, name) DO NOTHING;

INSERT INTO public.task_statuses (org_id, name, color, position, is_default, is_done)
SELECT id, 'Concluído', '#10b981', 2, false, true FROM public.organizations
ON CONFLICT (org_id, name) DO NOTHING;

-- 3. COLUNA status_id em tasks
ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS status_id UUID REFERENCES public.task_statuses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_status_id ON public.tasks(status_id);

-- 4. MIGRA tarefas existentes para o novo status_id
UPDATE public.tasks t
SET status_id = (
    SELECT ts.id FROM public.task_statuses ts
    WHERE ts.org_id = t.org_id
      AND CASE
            WHEN t.status = 'done' THEN ts.is_done = true
            ELSE ts.is_default = true
          END
    ORDER BY ts.position
    LIMIT 1
)
WHERE t.status_id IS NULL;

-- 5. RLS
ALTER TABLE public.task_statuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_statuses_select ON public.task_statuses;
CREATE POLICY task_statuses_select ON public.task_statuses
    FOR SELECT USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS task_statuses_insert ON public.task_statuses;
CREATE POLICY task_statuses_insert ON public.task_statuses
    FOR INSERT WITH CHECK (public.is_org_member(org_id));

DROP POLICY IF EXISTS task_statuses_update ON public.task_statuses;
CREATE POLICY task_statuses_update ON public.task_statuses
    FOR UPDATE USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS task_statuses_delete ON public.task_statuses;
CREATE POLICY task_statuses_delete ON public.task_statuses
    FOR DELETE USING (public.is_org_member(org_id));

-- 6. TRIGGER: seed automático ao criar nova org
CREATE OR REPLACE FUNCTION public.seed_task_statuses_for_org()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.task_statuses (org_id, name, color, position, is_default, is_done)
    VALUES
        (NEW.id, 'Pendente',     '#94a3b8', 0, true,  false),
        (NEW.id, 'Em Andamento', '#3b82f6', 1, false, false),
        (NEW.id, 'Concluído',    '#10b981', 2, false, true)
    ON CONFLICT (org_id, name) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_task_statuses ON public.organizations;
CREATE TRIGGER trg_seed_task_statuses
    AFTER INSERT ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.seed_task_statuses_for_org();
