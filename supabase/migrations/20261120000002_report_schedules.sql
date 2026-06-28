-- ============================================================
-- Agendamento de Relatórios Financeiros
-- OrçaCloud SaaS · Migration 20261120000001
-- Idempotente (Regra de Ouro 10).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.report_schedules (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  frequency        TEXT        NOT NULL CHECK (frequency IN ('DAILY','WEEKLY','MONTHLY')),
  day_of_week      INT         CHECK (day_of_week  BETWEEN 0 AND 6),   -- 0=domingo
  day_of_month     INT         CHECK (day_of_month BETWEEN 1 AND 31),
  hour             INT         NOT NULL DEFAULT 8 CHECK (hour BETWEEN 0 AND 23),
  recipients       TEXT[]      NOT NULL DEFAULT '{}',
  report_types     TEXT[]      NOT NULL DEFAULT '{ALERTS,SCORECARD,CASHFLOW}',
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  last_sent_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_schedules_org
  ON public.report_schedules (organization_id, is_active);

ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_schedules_org" ON public.report_schedules;
CREATE POLICY "report_schedules_org" ON public.report_schedules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = report_schedules.organization_id
        AND (
          (om.user_id IS NOT NULL AND om.user_id = auth.uid())
          OR (om.user_id IS NULL AND LOWER(om.email) = LOWER(auth.jwt() ->> 'email'))
        )
    )
  );

GRANT ALL ON public.report_schedules TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- Cron: disparar a cada hora (verifica internamente quem é due)
-- Registrar via Supabase Dashboard → Database → Cron Jobs:
--   Schedule: 0 * * * *
--   Command : SELECT net.http_post(
--               url := '<SUPABASE_URL>/functions/v1/financial-report-notifier',
--               headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
--               body := '{}'::jsonb
--             );
-- ─────────────────────────────────────────────────────────────

-- FIM: 20261120000001_report_schedules.sql
