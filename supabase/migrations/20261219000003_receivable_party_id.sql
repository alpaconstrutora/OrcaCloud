-- ============================================================
-- Contas a Receber — vínculo real com clients (party_id)
-- OrçaCloud SaaS · Migration 20261219000003
-- Idempotente (Regra de Ouro 10).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Coluna party_id em internal_transactions
--    FK opcional para clients; ON DELETE SET NULL preserva o
--    lançamento financeiro mesmo se o cliente for removido.
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.internal_transactions
  ADD COLUMN IF NOT EXISTS party_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'internal_txs_party_id_fkey'
      AND table_name = 'internal_transactions'
  ) THEN
    ALTER TABLE public.internal_transactions
      ADD CONSTRAINT internal_txs_party_id_fkey
      FOREIGN KEY (party_id) REFERENCES public.clients (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_internal_txs_party_id
  ON public.internal_transactions (party_id)
  WHERE party_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. Backfill party_id casando party_name com clients.name
--    dentro da mesma organização (ou clientes globais).
-- ────────────────────────────────────────────────────────────

UPDATE public.internal_transactions it
SET party_id = c.id
FROM public.clients c
WHERE it.party_id   IS NULL
  AND it.party_name IS NOT NULL
  AND lower(trim(it.party_name)) = lower(trim(c.name))
  AND (c.organization_id = it.organization_id OR c.organization_id IS NULL);

-- ────────────────────────────────────────────────────────────
-- 3. Recriar vw_receivables incluindo party_id
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
  it.party_id,
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
-- FIM: 20261219000003_receivable_party_id.sql
-- ────────────────────────────────────────────────────────────
