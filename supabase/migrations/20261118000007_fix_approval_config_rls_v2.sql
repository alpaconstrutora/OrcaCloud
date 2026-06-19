-- ============================================================
-- Fix RLS v2: financial_approval_config — limpa todas as policies
-- OrçaCloud SaaS · Migration 20261118000007
--
-- Remove TODAS as policies existentes na tabela (independente do nome)
-- e cria uma única policy FOR ALL usando is_org_member, igual ao padrão
-- já adotado em financial_categories e outras tabelas do projeto.
-- ============================================================

-- Remove qualquer policy existente na tabela (por nome dinâmico)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'financial_approval_config'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.financial_approval_config',
      r.policyname
    );
  END LOOP;
END $$;

-- Garante RLS habilitado
ALTER TABLE public.financial_approval_config ENABLE ROW LEVEL SECURITY;

-- Uma policy FOR ALL com USING + WITH CHECK usando is_org_member
-- (mesmo padrão de financial_categories — comprovadamente funcional)
CREATE POLICY fac_org_member ON public.financial_approval_config
  FOR ALL TO authenticated
  USING     (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ────────────────────────────────────────────────────────────
-- FIM: 20261118000007_fix_approval_config_rls_v2.sql
-- ────────────────────────────────────────────────────────────
