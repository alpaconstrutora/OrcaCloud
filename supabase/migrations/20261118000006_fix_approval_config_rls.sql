-- ============================================================
-- Fix RLS: financial_approval_config INSERT 403
-- OrçaCloud SaaS · Migration 20261118000006
--
-- A policy original usava apenas USING sem WITH CHECK.
-- Para INSERT o PostgreSQL exige WITH CHECK explícito;
-- sem ele, o INSERT sempre retorna 403.
-- Substituímos por políticas separadas por operação.
-- ============================================================

-- Remove a policy única que cobria ALL sem WITH CHECK
DROP POLICY IF EXISTS "financial_approval_config_org_member" ON public.financial_approval_config;

-- SELECT
CREATE POLICY fac_select ON public.financial_approval_config
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = financial_approval_config.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- INSERT
CREATE POLICY fac_insert ON public.financial_approval_config
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = financial_approval_config.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- UPDATE
CREATE POLICY fac_update ON public.financial_approval_config
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = financial_approval_config.organization_id
        AND om.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = financial_approval_config.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- DELETE
CREATE POLICY fac_delete ON public.financial_approval_config
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = financial_approval_config.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- FIM: 20261118000006_fix_approval_config_rls.sql
-- ────────────────────────────────────────────────────────────
