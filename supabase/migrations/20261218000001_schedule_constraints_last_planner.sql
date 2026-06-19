-- ============================================================
-- Fase 1 Planejamento: Restrições + Last Planner / PPC
-- OrçaCloud SaaS · Migration 20261218000001
-- Idempotente.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. schedule_constraints — bloqueios atrelados a atividades
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schedule_constraints (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id       UUID        NOT NULL REFERENCES public.projects(id)      ON DELETE CASCADE,
  schedule_item_id TEXT        NOT NULL,   -- id do item em settings.schedule.itemSchedules
  category         TEXT        NOT NULL,   -- projeto|material|contrato|equipe|equipamento|aprovacao
  description      TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'open',  -- open|removed
  responsible      TEXT,
  due_date         DATE,
  removed_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sched_constraints_org_proj
  ON public.schedule_constraints (organization_id, project_id);

CREATE INDEX IF NOT EXISTS idx_sched_constraints_item
  ON public.schedule_constraints (project_id, schedule_item_id);

-- ─────────────────────────────────────────────────────────────
-- 2. weekly_commitments — Last Planner / PPC
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.weekly_commitments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id       UUID        NOT NULL REFERENCES public.projects(id)      ON DELETE CASCADE,
  schedule_item_id TEXT        NOT NULL,
  week_start       DATE        NOT NULL,   -- segunda-feira da semana
  planned_qty      NUMERIC,
  done_qty         NUMERIC,
  is_complete      BOOLEAN,
  failure_reason   TEXT,                   -- motivo de não cumprimento
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, schedule_item_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_commit_org_proj
  ON public.weekly_commitments (organization_id, project_id);

CREATE INDEX IF NOT EXISTS idx_weekly_commit_week
  ON public.weekly_commitments (project_id, week_start);

-- ─────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────

-- schedule_constraints
ALTER TABLE public.schedule_constraints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members manage schedule_constraints" ON public.schedule_constraints;
CREATE POLICY "org members manage schedule_constraints"
  ON public.schedule_constraints
  FOR ALL
  USING  (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- weekly_commitments
ALTER TABLE public.weekly_commitments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members manage weekly_commitments" ON public.weekly_commitments;
CREATE POLICY "org members manage weekly_commitments"
  ON public.weekly_commitments
  FOR ALL
  USING  (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ─────────────────────────────────────────────────────────────
-- 4. updated_at automático
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_sched_constraints_updated_at ON public.schedule_constraints;
CREATE TRIGGER trg_sched_constraints_updated_at
  BEFORE UPDATE ON public.schedule_constraints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_weekly_commit_updated_at ON public.weekly_commitments;
CREATE TRIGGER trg_weekly_commit_updated_at
  BEFORE UPDATE ON public.weekly_commitments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 5. fn_ppc — PPC semanal e acumulado de um projeto
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_ppc(uuid, uuid);
CREATE OR REPLACE FUNCTION public.fn_ppc(
  p_organization_id UUID,
  p_project_id      UUID
)
RETURNS TABLE (
  week_start        DATE,
  planned_count     BIGINT,
  completed_count   BIGINT,
  ppc               NUMERIC
)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT
    week_start,
    COUNT(*)                                    AS planned_count,
    COUNT(*) FILTER (WHERE is_complete = TRUE)  AS completed_count,
    CASE WHEN COUNT(*) = 0 THEN NULL
         ELSE ROUND(
           COUNT(*) FILTER (WHERE is_complete = TRUE)::NUMERIC
           / COUNT(*) * 100, 1
         )
    END AS ppc
  FROM public.weekly_commitments
  WHERE organization_id = p_organization_id
    AND project_id      = p_project_id
    AND is_complete IS NOT NULL
  GROUP BY week_start
  ORDER BY week_start;
$$;

-- ─────────────────────────────────────────────────────────────
-- FIM: 20261218000001_schedule_constraints_last_planner.sql
-- ─────────────────────────────────────────────────────────────
