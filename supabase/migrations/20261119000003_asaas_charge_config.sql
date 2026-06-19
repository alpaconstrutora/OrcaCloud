-- ============================================================
-- Configuração de multa/juros/desconto para cobranças Asaas
-- OrçaCloud SaaS · Migration 20261119000003
-- Idempotente (Regra de Ouro 10).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. asaas_charge_config — padrões por organização
--    fine_percent             → multa (% sobre o valor) após o vencimento
--    interest_percent_month   → juros (% ao mês) de mora
--    discount_percent / days  → desconto (% até N dias antes do venc.)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.asaas_charge_config (
  organization_id        UUID PRIMARY KEY,
  fine_percent           NUMERIC NOT NULL DEFAULT 2,    -- multa 2%
  interest_percent_month NUMERIC NOT NULL DEFAULT 1,    -- juros 1% a.m.
  discount_percent       NUMERIC NOT NULL DEFAULT 0,    -- sem desconto por padrão
  discount_days          INT     NOT NULL DEFAULT 0,    -- dias antes do venc.
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: cria config padrão para orgs que já têm cobranças (sem sobrescrever)
INSERT INTO public.asaas_charge_config (organization_id)
SELECT DISTINCT organization_id FROM public.client_charges
ON CONFLICT (organization_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 2. RLS — leitura/escrita por membros da org (dual-check email,
--    pois organization_members.user_id é NULL neste projeto).
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.asaas_charge_config ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='asaas_charge_config'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.asaas_charge_config', r.policyname);
  END LOOP;
END $$;

CREATE POLICY acc_select ON public.asaas_charge_config
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = asaas_charge_config.organization_id
        AND (
          (om.user_id IS NOT NULL AND om.user_id = auth.uid())
          OR (om.user_id IS NULL AND LOWER(om.email) = LOWER(auth.jwt() ->> 'email'))
        )
    )
  );

CREATE POLICY acc_insert ON public.asaas_charge_config
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = asaas_charge_config.organization_id
        AND (
          (om.user_id IS NOT NULL AND om.user_id = auth.uid())
          OR (om.user_id IS NULL AND LOWER(om.email) = LOWER(auth.jwt() ->> 'email'))
        )
    )
  );

CREATE POLICY acc_update ON public.asaas_charge_config
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = asaas_charge_config.organization_id
        AND (
          (om.user_id IS NOT NULL AND om.user_id = auth.uid())
          OR (om.user_id IS NULL AND LOWER(om.email) = LOWER(auth.jwt() ->> 'email'))
        )
    )
  );

-- ────────────────────────────────────────────────────────────
-- FIM: 20261119000003_asaas_charge_config.sql
-- ────────────────────────────────────────────────────────────
