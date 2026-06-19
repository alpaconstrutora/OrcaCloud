-- ============================================================
-- Cobrança ao cliente (Fase 6) — boletos/PIX via Asaas
-- OrçaCloud SaaS · Migration 20261119000002
-- Idempotente (Regra de Ouro 10).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. client_charges — cobranças emitidas para clientes
--    Liga um recebível (internal_transactions CREDIT) à cobrança
--    gerada no provedor externo (Asaas).
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_charges (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL,
  transaction_id    UUID,            -- recebível em internal_transactions (opcional)
  client_id         UUID,            -- cliente em clients (opcional)
  provider          TEXT NOT NULL DEFAULT 'asaas',
  asaas_customer_id TEXT,
  asaas_payment_id  TEXT,
  billing_type      TEXT NOT NULL DEFAULT 'BOLETO',  -- BOLETO | PIX | CREDIT_CARD | UNDEFINED
  value             NUMERIC NOT NULL,
  due_date          DATE,
  status            TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING|RECEIVED|CONFIRMED|OVERDUE|REFUNDED|CANCELLED
  invoice_url       TEXT,            -- página de pagamento (fatura)
  bank_slip_url     TEXT,            -- PDF do boleto
  pix_payload       TEXT,            -- copia-e-cola do PIX
  description       TEXT,
  party_name        TEXT,
  party_email       TEXT,
  error_message     TEXT,
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_charges_payment
  ON public.client_charges (asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_charges_org
  ON public.client_charges (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_client_charges_tx
  ON public.client_charges (transaction_id)
  WHERE transaction_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. Cache do asaas_customer_id no cliente (evita recriar)
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT;

-- ────────────────────────────────────────────────────────────
-- 3. RLS — leitura por membros da org (dual-check email fallback,
--    pois organization_members.user_id é NULL neste projeto).
--    INSERT/UPDATE são feitos pela Edge Function (service_role),
--    que ignora RLS.
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.client_charges ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='client_charges'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.client_charges', r.policyname);
  END LOOP;
END $$;

CREATE POLICY client_charges_select ON public.client_charges
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = client_charges.organization_id
        AND (
          (om.user_id IS NOT NULL AND om.user_id = auth.uid())
          OR
          (om.user_id IS NULL AND LOWER(om.email) = LOWER(auth.jwt() ->> 'email'))
        )
    )
  );

CREATE POLICY client_charges_delete ON public.client_charges
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = client_charges.organization_id
        AND (
          (om.user_id IS NOT NULL AND om.user_id = auth.uid())
          OR
          (om.user_id IS NULL AND LOWER(om.email) = LOWER(auth.jwt() ->> 'email'))
        )
    )
  );

-- ────────────────────────────────────────────────────────────
-- FIM: 20261119000002_client_charges.sql
-- ────────────────────────────────────────────────────────────
