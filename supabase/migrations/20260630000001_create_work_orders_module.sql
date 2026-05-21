-- ============================================================
-- Módulo: Controle Operacional — Work Orders (Ordens de Execução)
-- OrçaCloud SaaS — Sprint 1
-- ============================================================
-- Convenções do projeto:
--   org_id      → public.organizations(id)
--   project_id  → public.projects(id)  [org via settings->>'organizationId']
--   team_id     → public.labor_teams(id)
--   employee_id → public.employees(id)
--   RLS via     → public.is_org_member(org_id)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. CHECKLIST TEMPLATES
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.oe_checklist_templates (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  service_type TEXT,
  active       BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oe_checklist_templates_org ON public.oe_checklist_templates(org_id);

CREATE TABLE IF NOT EXISTS public.oe_checklist_items (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    UUID    NOT NULL REFERENCES public.oe_checklist_templates(id) ON DELETE CASCADE,
  description    TEXT    NOT NULL,
  required       BOOLEAN NOT NULL DEFAULT true,
  requires_photo BOOLEAN NOT NULL DEFAULT false,
  gate           TEXT    NOT NULL DEFAULT 'free' CHECK (gate IN ('pre_start', 'pre_completion', 'free')),
  sort_order     INT     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_oe_checklist_items_template ON public.oe_checklist_items(template_id);

-- ────────────────────────────────────────────────────────────
-- 2. PROJECT-LEVEL OPERATIONAL CONFIG (gate configurability)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_ops_config (
  project_id  UUID        PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  gate_config JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- 3. WORK ORDERS — Ordens de Execução (entidade central)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.work_orders (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id            UUID        NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,

  code                  TEXT,
  title                 TEXT        NOT NULL,
  description           TEXT,
  phase                 TEXT,
  type                  TEXT        NOT NULL DEFAULT 'own' CHECK (type IN ('own', 'subcontracted')),
  budget_item_ref       JSONB,

  status                TEXT        NOT NULL DEFAULT 'planned' CHECK (status IN (
    'planned','released','in_progress',
    'pending_inspection','approved','rejected',
    'measured','closed','blocked'
  )),
  status_before_block   TEXT        CHECK (status_before_block IN (
    'planned','released','in_progress',
    'pending_inspection','approved','rejected','measured'
  )),
  priority              TEXT        NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','high','critical')),

  team_id               UUID        REFERENCES public.labor_teams(id) ON DELETE SET NULL,
  responsible_id        UUID        REFERENCES public.employees(id) ON DELETE SET NULL,

  planned_start_date    DATE,
  planned_end_date      DATE,
  actual_start_date     DATE,
  actual_end_date       DATE,
  baseline_start        DATE,
  baseline_end          DATE,

  measurement_unit      TEXT,
  planned_quantity      NUMERIC(12,3),
  executed_quantity     NUMERIC(12,3)  NOT NULL DEFAULT 0,
  completion_pct        NUMERIC(5,2)   NOT NULL DEFAULT 0 CHECK (completion_pct BETWEEN 0 AND 100),

  planned_productivity  NUMERIC(10,3),
  actual_productivity   NUMERIC(10,3),

  planned_cost          NUMERIC(14,2),
  actual_labor_cost     NUMERIC(14,2)  NOT NULL DEFAULT 0,
  actual_material_cost  NUMERIC(14,2)  NOT NULL DEFAULT 0,
  actual_total_cost     NUMERIC(14,2)  NOT NULL DEFAULT 0,

  predecessor_id        UUID        REFERENCES public.work_orders(id) ON DELETE SET NULL,
  checklist_template_id UUID        REFERENCES public.oe_checklist_templates(id) ON DELETE SET NULL,
  replanning_count      INT         NOT NULL DEFAULT 0,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_orders_org         ON public.work_orders(org_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_project     ON public.work_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_proj_status ON public.work_orders(project_id, status);
CREATE INDEX IF NOT EXISTS idx_work_orders_team        ON public.work_orders(team_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_responsible ON public.work_orders(responsible_id);

-- ────────────────────────────────────────────────────────────
-- 4. STATUS HISTORY
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.work_order_status_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id   UUID        NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status      TEXT        NOT NULL,
  changed_by_id   UUID        REFERENCES public.employees(id) ON DELETE SET NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wo_status_log_wo ON public.work_order_status_log(work_order_id);

-- ────────────────────────────────────────────────────────────
-- 5. WORK LOGS — Apontamentos
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.work_logs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id     UUID        NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  log_date          DATE        NOT NULL,
  team_id           UUID        REFERENCES public.labor_teams(id) ON DELETE SET NULL,
  hours_worked      NUMERIC(6,2),
  quantity_executed NUMERIC(12,3),
  calculated_cost   NUMERIC(14,2),
  notes             TEXT,
  logged_by_id      UUID        REFERENCES public.employees(id) ON DELETE SET NULL,
  synced_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_logs_wo_date ON public.work_logs(work_order_id, log_date);
CREATE INDEX IF NOT EXISTS idx_work_logs_team    ON public.work_logs(team_id);

-- ────────────────────────────────────────────────────────────
-- 6. EVIDENCE FILES
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.evidence_files (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id  UUID        NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  file_type      TEXT        NOT NULL DEFAULT 'photo' CHECK (file_type IN ('photo','document')),
  file_url       TEXT        NOT NULL,
  thumbnail_url  TEXT,
  gate           TEXT        NOT NULL DEFAULT 'execution' CHECK (gate IN ('pre_start','execution','pre_completion','free')),
  latitude       NUMERIC(10,7),
  longitude      NUMERIC(10,7),
  captured_at    TIMESTAMPTZ,
  description    TEXT,
  uploaded_by_id UUID        REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_files_wo   ON public.evidence_files(work_order_id);
CREATE INDEX IF NOT EXISTS idx_evidence_files_gate ON public.evidence_files(work_order_id, gate);

-- ────────────────────────────────────────────────────────────
-- 7. CHECKLIST RESPONSES
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.oe_checklist_responses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id   UUID        NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  item_id         UUID        NOT NULL REFERENCES public.oe_checklist_items(id) ON DELETE CASCADE,
  completed       BOOLEAN     NOT NULL DEFAULT false,
  evidence_id     UUID        REFERENCES public.evidence_files(id) ON DELETE SET NULL,
  notes           TEXT,
  completed_by_id UUID        REFERENCES public.employees(id) ON DELETE SET NULL,
  completed_at    TIMESTAMPTZ,
  UNIQUE(work_order_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_checklist_resp_wo ON public.oe_checklist_responses(work_order_id);

-- ────────────────────────────────────────────────────────────
-- 8. NON-CONFORMANCES
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.non_conformances (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id          UUID        NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  description            TEXT        NOT NULL,
  severity               TEXT        NOT NULL DEFAULT 'moderate' CHECK (severity IN ('minor','moderate','major')),
  status                 TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_treatment','closed')),
  responsible_id         UUID        REFERENCES public.employees(id) ON DELETE SET NULL,
  due_date               DATE,
  corrective_action      TEXT,
  resolution_evidence_id UUID        REFERENCES public.evidence_files(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_nc_work_order ON public.non_conformances(work_order_id);
CREATE INDEX IF NOT EXISTS idx_nc_status     ON public.non_conformances(work_order_id, status);

-- ────────────────────────────────────────────────────────────
-- 9. WORK ORDER VALIDATIONS
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.work_order_validations (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id  UUID        NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  type           TEXT        NOT NULL CHECK (type IN ('start_release','inspection','completion_approval')),
  status         TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved_by_id UUID        REFERENCES public.employees(id) ON DELETE SET NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wo_validations_wo ON public.work_order_validations(work_order_id);

-- ────────────────────────────────────────────────────────────
-- 10. SITE DIARY
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.site_diary (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  org_id          UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  diary_date      DATE        NOT NULL,
  weather         TEXT        CHECK (weather IN ('sunny','cloudy','rain','heavy_rain')),
  field_condition TEXT        NOT NULL DEFAULT 'normal' CHECK (field_condition IN ('normal','compromised','halted')),
  workers_present INT         NOT NULL DEFAULT 0,
  general_notes   TEXT,
  auto_generated  BOOLEAN     NOT NULL DEFAULT true,
  reviewed_by_id  UUID        REFERENCES public.employees(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  snapshot        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, diary_date)
);

CREATE INDEX IF NOT EXISTS idx_site_diary_project_date ON public.site_diary(project_id, diary_date);

-- ────────────────────────────────────────────────────────────
-- 11. ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.oe_checklist_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oe_checklist_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_ops_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_status_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_files          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oe_checklist_responses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.non_conformances        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_validations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_diary              ENABLE ROW LEVEL SECURITY;

-- Padrão idempotente: DO block com IF NOT EXISTS check (igual ao notification_log.sql)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='oe_checklist_templates' AND policyname='oe_checklist_templates_access') THEN
    CREATE POLICY "oe_checklist_templates_access" ON public.oe_checklist_templates
      FOR ALL USING (public.is_org_member(org_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='oe_checklist_items' AND policyname='oe_checklist_items_access') THEN
    CREATE POLICY "oe_checklist_items_access" ON public.oe_checklist_items
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.oe_checklist_templates t
          WHERE t.id = template_id AND public.is_org_member(t.org_id)
        )
      );
  END IF;
END $$;

-- project_ops_config: org via settings JSONB (projects não tem coluna org_id direta)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_ops_config' AND policyname='project_ops_config_access') THEN
    CREATE POLICY "project_ops_config_access" ON public.project_ops_config
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.projects p
          WHERE p.id = project_id
            AND public.is_org_member((p.settings->>'organizationId')::uuid)
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='work_orders' AND policyname='work_orders_access') THEN
    CREATE POLICY "work_orders_access" ON public.work_orders
      FOR ALL USING (public.is_org_member(org_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='work_order_status_log' AND policyname='wo_status_log_access') THEN
    CREATE POLICY "wo_status_log_access" ON public.work_order_status_log
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.work_orders wo
          WHERE wo.id = work_order_id AND public.is_org_member(wo.org_id)
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='work_logs' AND policyname='work_logs_access') THEN
    CREATE POLICY "work_logs_access" ON public.work_logs
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.work_orders wo
          WHERE wo.id = work_order_id AND public.is_org_member(wo.org_id)
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='evidence_files' AND policyname='evidence_files_access') THEN
    CREATE POLICY "evidence_files_access" ON public.evidence_files
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.work_orders wo
          WHERE wo.id = work_order_id AND public.is_org_member(wo.org_id)
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='oe_checklist_responses' AND policyname='checklist_responses_access') THEN
    CREATE POLICY "checklist_responses_access" ON public.oe_checklist_responses
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.work_orders wo
          WHERE wo.id = work_order_id AND public.is_org_member(wo.org_id)
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='non_conformances' AND policyname='non_conformances_access') THEN
    CREATE POLICY "non_conformances_access" ON public.non_conformances
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.work_orders wo
          WHERE wo.id = work_order_id AND public.is_org_member(wo.org_id)
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='work_order_validations' AND policyname='wo_validations_access') THEN
    CREATE POLICY "wo_validations_access" ON public.work_order_validations
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.work_orders wo
          WHERE wo.id = work_order_id AND public.is_org_member(wo.org_id)
        )
      );
  END IF;
END $$;

-- site_diary: org_id direto (coluna adicionada para evitar JOIN em settings JSONB)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='site_diary' AND policyname='site_diary_access') THEN
    CREATE POLICY "site_diary_access" ON public.site_diary
      FOR ALL USING (public.is_org_member(org_id));
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 12. TRIGGERS — updated_at automático
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_ops_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_work_orders_updated_at ON public.work_orders;
CREATE TRIGGER trg_work_orders_updated_at
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_ops_updated_at();

DROP TRIGGER IF EXISTS trg_project_ops_config_updated_at ON public.project_ops_config;
CREATE TRIGGER trg_project_ops_config_updated_at
  BEFORE UPDATE ON public.project_ops_config
  FOR EACH ROW EXECUTE FUNCTION public.update_ops_updated_at();

-- ────────────────────────────────────────────────────────────
-- 13. FUNCTION: geração de código OE (OE-0001)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_work_order_code(p_project_id UUID)
RETURNS TEXT AS $$
DECLARE
  next_num INT;
BEGIN
  SELECT COALESCE(MAX(
    CAST(REGEXP_REPLACE(code, '[^0-9]', '', 'g') AS INT)
  ), 0) + 1
  INTO next_num
  FROM public.work_orders
  WHERE project_id = p_project_id AND code IS NOT NULL;

  RETURN 'OE-' || LPAD(next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────
-- 14. VIEW: custo médio/hora por equipe
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.vw_team_hourly_cost AS
SELECT
  lt.id                           AS team_id,
  lt.org_id,
  lt.name                         AS team_name,
  COUNT(tm.employee_id)           AS member_count,
  COALESCE(AVG(e.hourly_cost), 0) AS avg_hourly_cost,
  COALESCE(SUM(e.hourly_cost), 0) AS total_hourly_cost
FROM public.labor_teams lt
LEFT JOIN public.team_members tm ON tm.team_id = lt.id
LEFT JOIN public.employees e ON e.id = tm.employee_id AND e.status = 'ATIVO'
GROUP BY lt.id, lt.org_id, lt.name;

-- ────────────────────────────────────────────────────────────
-- 15. VIEW: comparativo orçado x realizado por obra
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.vw_project_cost_comparison AS
SELECT
  wo.project_id,
  wo.phase,
  COUNT(wo.id)                                        AS work_order_count,
  COALESCE(SUM(wo.planned_cost), 0)                   AS total_planned_cost,
  COALESCE(SUM(wo.actual_total_cost), 0)              AS total_actual_cost,
  COALESCE(SUM(wo.actual_total_cost), 0)
    - COALESCE(SUM(wo.planned_cost), 0)               AS cost_deviation,
  CASE
    WHEN SUM(wo.planned_cost) > 0 THEN
      SUM(wo.completion_pct * COALESCE(wo.planned_cost, 0))
      / NULLIF(SUM(wo.planned_cost), 0)
    ELSE AVG(wo.completion_pct)
  END                                                 AS weighted_completion_pct,
  COUNT(wo.id) FILTER (WHERE wo.status = 'blocked')   AS blocked_count,
  COUNT(wo.id) FILTER (
    WHERE wo.planned_end_date < CURRENT_DATE
      AND wo.status NOT IN ('measured','closed')
  )                                                   AS overdue_count
FROM public.work_orders wo
GROUP BY wo.project_id, wo.phase;
