-- ============================================================
-- Contas a Receber — colunas de negócio no razão + view + RPC
-- OrçaCloud SaaS · Migration 20261118000002
-- Idempotente (Regra de Ouro 10).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Colunas de negócio em internal_transactions
--    Separam o ciclo de vida de negócio (AR/AP) do status de
--    conciliação bancária que já existe na tabela.
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.internal_transactions
  ADD COLUMN IF NOT EXISTS due_date        DATE,
  ADD COLUMN IF NOT EXISTS business_status TEXT,
  ADD COLUMN IF NOT EXISTS party_name      TEXT,
  ADD COLUMN IF NOT EXISTS party_type      TEXT;

-- Índice para queries de AR/AP por vencimento
CREATE INDEX IF NOT EXISTS idx_internal_txs_due_date
  ON public.internal_transactions (organization_id, direction, due_date)
  WHERE due_date IS NOT NULL;

-- Índice para filtrar por business_status
CREATE INDEX IF NOT EXISTS idx_internal_txs_business_status
  ON public.internal_transactions (organization_id, business_status)
  WHERE business_status IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. Backfill due_date a partir dos installments no JSONB
--    reference_id da transação = id do installment no JSONB
-- ────────────────────────────────────────────────────────────

UPDATE public.internal_transactions it
SET due_date = (sub.due)::date
FROM (
  SELECT
    (inst->>'id')      AS ref,
    (inst->>'dueDate') AS due
  FROM public.projects p
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(p.settings->'financialInfo'->'installments') = 'array'
      THEN p.settings->'financialInfo'->'installments'
      ELSE '[]'::jsonb
    END
  ) AS inst
  WHERE inst->>'dueDate' IS NOT NULL
    AND inst->>'id'      IS NOT NULL
) sub
WHERE it.reference_id = sub.ref
  AND it.direction    = 'CREDIT'
  AND it.due_date     IS NULL;

-- ────────────────────────────────────────────────────────────
-- 3. Backfill party_name/party_type (clientName do JSONB)
-- ────────────────────────────────────────────────────────────

UPDATE public.internal_transactions it
SET
  party_name = sub.client_name,
  party_type = 'CLIENT'
FROM (
  SELECT
    (inst->>'id')         AS ref,
    (inst->>'clientName') AS client_name
  FROM public.projects p
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(p.settings->'financialInfo'->'installments') = 'array'
      THEN p.settings->'financialInfo'->'installments'
      ELSE '[]'::jsonb
    END
  ) AS inst
  WHERE inst->>'clientName' IS NOT NULL
    AND inst->>'id'         IS NOT NULL
) sub
WHERE it.reference_id = sub.ref
  AND it.direction    = 'CREDIT'
  AND it.party_name   IS NULL;

-- ────────────────────────────────────────────────────────────
-- 4. Backfill business_status a partir do status de conciliação
-- ────────────────────────────────────────────────────────────

UPDATE public.internal_transactions
SET business_status = CASE
  WHEN status = 'CONCILIATED' AND direction = 'CREDIT' THEN 'RECEBIDO'
  WHEN status = 'CONCILIATED' AND direction = 'DEBIT'  THEN 'PAGO'
  WHEN status = 'CANCELLED'                            THEN 'CANCELADO'
  ELSE 'PREVISTO'
END
WHERE business_status IS NULL;

-- ────────────────────────────────────────────────────────────
-- 5. View vw_receivables — AR com effective_status computado
--    effective_status = VENCIDO quando pendente + due_date vencida
-- ────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.vw_receivables;

CREATE VIEW public.vw_receivables AS
SELECT
  it.id,
  it.organization_id,
  it.source_system,
  it.reference_id,
  it.transaction_date,
  it.due_date,
  it.amount,
  it.direction,
  it.description,
  it.category,
  it.status,
  it.business_status,
  it.party_name,
  it.party_type,
  it.project_id,
  it.cost_center_id,
  it.created_at,
  it.updated_at,
  -- status efetivo: VENCIDO é computado dinamicamente para não exigir cron
  CASE
    WHEN it.business_status IN ('PREVISTO','EMITIDO','ENVIADO')
      AND it.due_date IS NOT NULL
      AND it.due_date < CURRENT_DATE
    THEN 'VENCIDO'
    ELSE COALESCE(it.business_status, 'PREVISTO')
  END AS effective_status,
  p.name AS project_name
FROM public.internal_transactions it
LEFT JOIN public.projects p ON p.id = it.project_id
WHERE it.direction = 'CREDIT'
  AND it.status    <> 'CANCELLED';

-- ────────────────────────────────────────────────────────────
-- 6. fn_inadimplencia — faixas de aging de AR
-- ────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_inadimplencia(uuid);

CREATE OR REPLACE FUNCTION public.fn_inadimplencia(
  p_organization_id UUID
)
RETURNS TABLE (
  faixa TEXT,
  count BIGINT,
  valor NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH vencidos AS (
    SELECT
      amount,
      (CURRENT_DATE - due_date) AS dias_atraso
    FROM public.internal_transactions
    WHERE organization_id = p_organization_id
      AND direction       = 'CREDIT'
      AND status          = 'PENDING'
      AND business_status NOT IN ('RECEBIDO','CANCELADO','RENEGOCIADO')
      AND due_date        < CURRENT_DATE
  )
  SELECT 'A vencer'       AS faixa, 0::BIGINT AS count, 0::NUMERIC AS valor WHERE FALSE
  UNION ALL
  SELECT '1–30 dias',  COUNT(*), COALESCE(SUM(amount),0) FROM vencidos WHERE dias_atraso BETWEEN 1  AND 30
  UNION ALL
  SELECT '31–60 dias', COUNT(*), COALESCE(SUM(amount),0) FROM vencidos WHERE dias_atraso BETWEEN 31 AND 60
  UNION ALL
  SELECT '61–90 dias', COUNT(*), COALESCE(SUM(amount),0) FROM vencidos WHERE dias_atraso BETWEEN 61 AND 90
  UNION ALL
  SELECT 'Acima de 90', COUNT(*), COALESCE(SUM(amount),0) FROM vencidos WHERE dias_atraso > 90
  ORDER BY faixa;
$$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20261118000002_receivables_columns.sql
-- ────────────────────────────────────────────────────────────
