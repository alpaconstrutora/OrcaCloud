-- ============================================================
-- Aprendizado de Aliases de Fornecedor (Central Inteligente · Fase 3)
-- OrçaCloud SaaS · Migration 20261220000008
-- Idempotente (Regra de Ouro 10).
--
-- Aprende a associação "texto do extrato" → contraparte cadastrada.
-- Ex.: ao confirmar PIX CONCRETO ALFA = Concreto Alfa Ltda, o token
-- "CONCRETO ALFA" passa a reconhecer o fornecedor nos próximos matches.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reconciliation_aliases (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  alias_token      TEXT        NOT NULL,           -- frase normalizada do extrato
  party_type       TEXT        NOT NULL CHECK (party_type IN ('SUPPLIER','CLIENT')),
  party_id         UUID        NOT NULL,
  party_name       TEXT,
  hit_count        INT         NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, alias_token, party_id)
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_aliases_org
  ON public.reconciliation_aliases (organization_id);

ALTER TABLE public.reconciliation_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reconciliation_aliases_org" ON public.reconciliation_aliases;
CREATE POLICY "reconciliation_aliases_org" ON public.reconciliation_aliases
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = reconciliation_aliases.organization_id
        AND (
          (om.user_id IS NOT NULL AND om.user_id = auth.uid())
          OR (om.user_id IS NULL AND LOWER(om.email) = LOWER(auth.jwt() ->> 'email'))
        )
    )
  );

GRANT ALL ON public.reconciliation_aliases TO authenticated;

-- FIM: 20261220000008_reconciliation_aliases.sql
