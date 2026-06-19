-- ============================================================
-- Planejamento Fase 1: Quadro de Restrições + Last Planner / PPC
-- OrçaCloud SaaS · Migration 20261118000005
-- Tabelas: schedule_constraints, weekly_commitments
-- RPC:     fn_ppc(organization_id, project_id)
-- Idempotente.
-- ============================================================

-- ── schedule_constraints ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schedule_constraints (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id       UUID        NOT NULL REFERENCES public.projects(id)      ON DELETE CASCADE,
    schedule_item_id TEXT        NOT NULL,          -- ID do item no schedule (armazenado em JSONB)
    category         TEXT        NOT NULL CHECK (category IN ('projeto','material','contrato','equipe','equipamento','aprovacao')),
    description      TEXT        NOT NULL,
    status           TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open','removed')),
    responsible      TEXT,
    due_date         DATE,
    removed_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_constraints_project
    ON public.schedule_constraints (organization_id, project_id, status);

-- RLS
ALTER TABLE public.schedule_constraints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sc_select ON public.schedule_constraints;
CREATE POLICY sc_select ON public.schedule_constraints
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members
            WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS sc_insert ON public.schedule_constraints;
CREATE POLICY sc_insert ON public.schedule_constraints
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM public.organization_members
            WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS sc_update ON public.schedule_constraints;
CREATE POLICY sc_update ON public.schedule_constraints
    FOR UPDATE USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members
            WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS sc_delete ON public.schedule_constraints;
CREATE POLICY sc_delete ON public.schedule_constraints
    FOR DELETE USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members
            WHERE user_id = auth.uid()
        )
    );

-- auto-updated_at
CREATE OR REPLACE FUNCTION public.trg_set_updated_at_schedule_constraints()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_sc_updated_at ON public.schedule_constraints;
CREATE TRIGGER trg_sc_updated_at
    BEFORE UPDATE ON public.schedule_constraints
    FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at_schedule_constraints();


-- ── weekly_commitments ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.weekly_commitments (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id       UUID        NOT NULL REFERENCES public.projects(id)      ON DELETE CASCADE,
    schedule_item_id TEXT        NOT NULL,          -- ID do item no schedule
    week_start       DATE        NOT NULL,          -- segunda-feira ISO
    planned_qty      NUMERIC,                       -- meta planejada (opcional)
    done_qty         NUMERIC,                       -- realizado (opcional)
    is_complete      BOOLEAN,                       -- TRUE = PPC cumprida
    failure_reason   TEXT,                          -- motivo de não-cumprimento
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, schedule_item_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_commitments_project
    ON public.weekly_commitments (organization_id, project_id, week_start DESC);

ALTER TABLE public.weekly_commitments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wc_select ON public.weekly_commitments;
CREATE POLICY wc_select ON public.weekly_commitments
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members
            WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS wc_insert ON public.weekly_commitments;
CREATE POLICY wc_insert ON public.weekly_commitments
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM public.organization_members
            WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS wc_update ON public.weekly_commitments;
CREATE POLICY wc_update ON public.weekly_commitments
    FOR UPDATE USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members
            WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS wc_delete ON public.weekly_commitments;
CREATE POLICY wc_delete ON public.weekly_commitments
    FOR DELETE USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members
            WHERE user_id = auth.uid()
        )
    );

CREATE OR REPLACE FUNCTION public.trg_set_updated_at_weekly_commitments()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_wc_updated_at ON public.weekly_commitments;
CREATE TRIGGER trg_wc_updated_at
    BEFORE UPDATE ON public.weekly_commitments
    FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at_weekly_commitments();


-- ── fn_ppc ────────────────────────────────────────────────────
-- Calcula PPC (Percentual de Programas Concluídos) por semana.
-- PPC = (comprometimentos is_complete=TRUE) / (total is_complete IS NOT NULL)

DROP FUNCTION IF EXISTS public.fn_ppc(uuid, uuid);

CREATE OR REPLACE FUNCTION public.fn_ppc(
    p_organization_id UUID,
    p_project_id      UUID
)
RETURNS TABLE (
    week_start       DATE,
    planned_count    BIGINT,
    completed_count  BIGINT,
    ppc              NUMERIC    -- 0–100 ou NULL se sem dados
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT
        week_start,
        COUNT(*)                                        AS planned_count,
        COUNT(*) FILTER (WHERE is_complete = TRUE)     AS completed_count,
        CASE
            WHEN COUNT(*) FILTER (WHERE is_complete IS NOT NULL) = 0 THEN NULL
            ELSE ROUND(
                100.0 * COUNT(*) FILTER (WHERE is_complete = TRUE)
                /  NULLIF(COUNT(*) FILTER (WHERE is_complete IS NOT NULL), 0),
                1
            )
        END                                             AS ppc
    FROM public.weekly_commitments
    WHERE organization_id = p_organization_id
      AND project_id       = p_project_id
    GROUP BY week_start
    ORDER BY week_start DESC;
$$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20261118000005_schedule_constraints_last_planner.sql
-- ────────────────────────────────────────────────────────────
