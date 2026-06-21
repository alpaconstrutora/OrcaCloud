-- ============================================================
-- Fechamento Financeiro Mensal + Bloqueio de Período
-- OrçaCloud SaaS · Migration 20261220000003
-- Idempotente (Regra de Ouro 10).
--
-- • financial_period_locks  — registro de meses fechados/reabertos
-- • fn_period_is_closed      — guard reutilizável (mês de uma data fechado?)
-- • fn_financial_close_checklist — assistente de fechamento (pendências do mês)
-- • fn_close_period / fn_reopen_period — fechar/reabrir capturando auth.uid()
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Tabela de bloqueios de período
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.financial_period_locks (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_year      INT         NOT NULL CHECK (period_year  BETWEEN 2000 AND 2100),
  period_month     INT         NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  is_closed        BOOLEAN     NOT NULL DEFAULT true,
  checklist        JSONB,
  notes            TEXT,
  closed_at        TIMESTAMPTZ,
  closed_by        UUID,
  reopened_at      TIMESTAMPTZ,
  reopened_by      UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_period_locks_org
  ON public.financial_period_locks (organization_id, period_year, period_month);

ALTER TABLE public.financial_period_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "period_locks_org" ON public.financial_period_locks;
CREATE POLICY "period_locks_org" ON public.financial_period_locks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = financial_period_locks.organization_id
        AND (
          (om.user_id IS NOT NULL AND om.user_id = auth.uid())
          OR (om.user_id IS NULL AND LOWER(om.email) = LOWER(auth.jwt() ->> 'email'))
        )
    )
  );

GRANT ALL ON public.financial_period_locks TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2. Guard reutilizável: o mês de uma data está fechado?
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_period_is_closed(
  p_organization_id uuid,
  p_date            date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.financial_period_locks l
    WHERE l.organization_id = p_organization_id
      AND l.period_year  = EXTRACT(YEAR  FROM p_date)::int
      AND l.period_month = EXTRACT(MONTH FROM p_date)::int
      AND l.is_closed = true
  );
$fn$;

GRANT EXECUTE ON FUNCTION public.fn_period_is_closed(uuid, date) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. Assistente de fechamento — pendências do mês
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_financial_close_checklist(
  p_organization_id uuid,
  p_year            int,
  p_month           int
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $fn$
WITH bounds AS (
  SELECT make_date(p_year, p_month, 1)                       AS d_from,
         (make_date(p_year, p_month, 1) + INTERVAL '1 month - 1 day')::date AS d_to
),
bank AS (
  SELECT bt.status, bt.category, bt.direction, bt.amount, bt.description_normalized
  FROM public.bank_transactions bt, bounds b
  WHERE bt.organization_id = p_organization_id
    AND bt.transaction_date BETWEEN b.d_from AND b.d_to
),
internal_pending AS (
  SELECT it.id
  FROM public.internal_transactions it, bounds b
  WHERE it.organization_id = p_organization_id
    AND it.status = 'PENDING'
    AND COALESCE(it.due_date, it.transaction_date) BETWEEN b.d_from AND b.d_to
    AND NOT EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = it.id)
)
SELECT jsonb_build_object(
  'year',  p_year,
  'month', p_month,
  'pending_bank_count',     (SELECT COUNT(*) FROM bank WHERE status IN ('IMPORTED','NORMALIZED','RULE_APPLIED')),
  'unclassified_count',     (SELECT COUNT(*) FROM bank WHERE status IN ('IMPORTED','NORMALIZED','RULE_APPLIED') AND category IS NULL),
  'fees_uncategorized_count', (SELECT COUNT(*) FROM bank
                                WHERE status IN ('IMPORTED','NORMALIZED','RULE_APPLIED')
                                  AND category IS NULL AND direction = 'DEBIT'
                                  AND description_normalized ~ '(TARIFA|TAXA|CESTA|MANUTENCAO|PACOTE|IOF|ANUIDADE)'),
  'internal_pending_count', (SELECT COUNT(*) FROM internal_pending),
  'total_entradas',         (SELECT COALESCE(SUM(amount) FILTER (WHERE direction = 'CREDIT'), 0) FROM bank),
  'total_saidas',           (SELECT COALESCE(SUM(amount) FILTER (WHERE direction = 'DEBIT'), 0) FROM bank),
  'is_closed',              public.fn_period_is_closed(p_organization_id, (SELECT d_from FROM bounds))
);
$fn$;

GRANT EXECUTE ON FUNCTION public.fn_financial_close_checklist(uuid, int, int) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. Fechar / reabrir período (captura auth.uid() no servidor)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_close_period(
  p_organization_id uuid,
  p_year            int,
  p_month           int,
  p_notes           text DEFAULT NULL
)
RETURNS public.financial_period_locks
LANGUAGE plpgsql
SECURITY INVOKER
AS $fn$
DECLARE
  v_row public.financial_period_locks;
BEGIN
  INSERT INTO public.financial_period_locks AS l
    (organization_id, period_year, period_month, is_closed, checklist, notes, closed_at, closed_by)
  VALUES
    (p_organization_id, p_year, p_month, true,
     public.fn_financial_close_checklist(p_organization_id, p_year, p_month),
     p_notes, now(), auth.uid())
  ON CONFLICT (organization_id, period_year, period_month) DO UPDATE
    SET is_closed   = true,
        checklist   = public.fn_financial_close_checklist(p_organization_id, p_year, p_month),
        notes       = COALESCE(EXCLUDED.notes, l.notes),
        closed_at   = now(),
        closed_by   = auth.uid(),
        reopened_at = NULL,
        reopened_by = NULL,
        updated_at  = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.fn_close_period(uuid, int, int, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_reopen_period(
  p_organization_id uuid,
  p_year            int,
  p_month           int
)
RETURNS public.financial_period_locks
LANGUAGE plpgsql
SECURITY INVOKER
AS $fn$
DECLARE
  v_row public.financial_period_locks;
BEGIN
  UPDATE public.financial_period_locks
    SET is_closed   = false,
        reopened_at = now(),
        reopened_by = auth.uid(),
        updated_at  = now()
  WHERE organization_id = p_organization_id
    AND period_year  = p_year
    AND period_month = p_month
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.fn_reopen_period(uuid, int, int) TO authenticated;

-- FIM: 20261220000003_financial_period_close.sql
