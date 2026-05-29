-- ============================================================
-- Módulo: Tarefas (agenda pessoal do usuário)
-- OrçaCloud SaaS - Migration
--
-- Escopo: to-do list por usuário, atravessa todos os módulos.
-- Cada tarefa pertence a UM usuário (user_id) dentro de UMA org (org_id).
-- Origem pode ser manual ou gerada por outros módulos (OE, AP, etc).
-- ============================================================

-- 1. TABELA PRINCIPAL
CREATE TABLE IF NOT EXISTS public.tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    title           TEXT NOT NULL,
    description     TEXT,

    due_date        TIMESTAMPTZ,
    priority        SMALLINT NOT NULL DEFAULT 2
                      CHECK (priority BETWEEN 1 AND 4),  -- 1=urgente, 2=alta, 3=normal, 4=baixa
    status          TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','done','snoozed')),
    snoozed_until   TIMESTAMPTZ,

    source_module   TEXT NOT NULL DEFAULT 'manual',  -- manual|operacional|financeiro|rh|compras|...
    source_ref      JSONB,                            -- {type, id, route}

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

-- 2. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_tasks_user_status_due
    ON public.tasks(user_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_org
    ON public.tasks(org_id);

-- Evita duplicar tarefa do mesmo registro de origem para o mesmo usuário enquanto estiver aberta.
-- Tarefas manuais são livres para duplicar.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_source_open
    ON public.tasks(user_id, source_module, (source_ref->>'type'), (source_ref->>'id'))
    WHERE status = 'open' AND source_module <> 'manual';

-- 3. updated_at automático
CREATE OR REPLACE FUNCTION public.tasks_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    IF NEW.status = 'done' AND OLD.status <> 'done' THEN
        NEW.completed_at := NOW();
    ELSIF NEW.status <> 'done' THEN
        NEW.completed_at := NULL;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tasks_touch ON public.tasks;
CREATE TRIGGER trg_tasks_touch
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.tasks_touch_updated_at();

-- 4. RLS — agenda pessoal: o usuário só vê/edita as próprias tarefas
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_select_own ON public.tasks;
CREATE POLICY tasks_select_own ON public.tasks
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS tasks_insert_own ON public.tasks;
CREATE POLICY tasks_insert_own ON public.tasks
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        AND public.is_org_member(org_id)
    );

DROP POLICY IF EXISTS tasks_update_own ON public.tasks;
CREATE POLICY tasks_update_own ON public.tasks
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS tasks_delete_own ON public.tasks;
CREATE POLICY tasks_delete_own ON public.tasks
    FOR DELETE USING (user_id = auth.uid());

-- 5. FUNÇÃO PÚBLICA PARA OUTROS MÓDULOS CRIAREM TAREFAS
-- Usada por triggers/edge functions de outros módulos (OE, AP, etc).
-- SECURITY DEFINER porque o módulo de origem pode estar inserindo tarefa
-- para um usuário diferente do que está logado (ex: cron job).
CREATE OR REPLACE FUNCTION public.create_task(
    p_user_id        UUID,
    p_org_id         UUID,
    p_title          TEXT,
    p_due            TIMESTAMPTZ DEFAULT NULL,
    p_source_module  TEXT DEFAULT 'manual',
    p_source_ref     JSONB DEFAULT NULL,
    p_priority       SMALLINT DEFAULT 2,
    p_description    TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id UUID;
BEGIN
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

REVOKE ALL ON FUNCTION public.create_task(UUID,UUID,TEXT,TIMESTAMPTZ,TEXT,JSONB,SMALLINT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_task(UUID,UUID,TEXT,TIMESTAMPTZ,TEXT,JSONB,SMALLINT,TEXT) TO authenticated;

COMMENT ON TABLE public.tasks IS 'Agenda pessoal do usuário. Cada tarefa pertence a 1 usuário em 1 org. NÃO confundir com work_orders.';
COMMENT ON FUNCTION public.create_task IS 'Helper para outros módulos criarem tarefa automática para um usuário. Idempotente via uq_tasks_source_open.';
