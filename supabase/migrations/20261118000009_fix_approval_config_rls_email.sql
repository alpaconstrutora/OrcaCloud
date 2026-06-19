-- ============================================================
-- Fix RLS v4: financial_approval_config — fallback por email
-- OrçaCloud SaaS · Migration 20261118000009
--
-- organization_members tem user_id = NULL em todos os registros.
-- A política anterior usava WHERE user_id = auth.uid() que nunca bate.
-- Correto: mesmo fallback do is_org_member:
--   user_id = auth.uid()  OU  email = auth.jwt()->>'email'
-- ============================================================

-- Remove as policies v3
DROP POLICY IF EXISTS fac_v3_select ON public.financial_approval_config;
DROP POLICY IF EXISTS fac_v3_insert ON public.financial_approval_config;
DROP POLICY IF EXISTS fac_v3_update ON public.financial_approval_config;
DROP POLICY IF EXISTS fac_v3_delete ON public.financial_approval_config;

-- Subquery helper (inline, sem função externa)
-- Retorna TRUE se o usuário logado é membro da org pelo uid OU email
-- (espelha exatamente a lógica de is_org_member)

CREATE POLICY fac_v4_select ON public.financial_approval_config
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = financial_approval_config.organization_id
        AND (
          (om.user_id IS NOT NULL AND om.user_id = auth.uid())
          OR
          (om.user_id IS NULL AND LOWER(om.email) = LOWER(auth.jwt() ->> 'email'))
        )
    )
  );

CREATE POLICY fac_v4_insert ON public.financial_approval_config
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = financial_approval_config.organization_id
        AND (
          (om.user_id IS NOT NULL AND om.user_id = auth.uid())
          OR
          (om.user_id IS NULL AND LOWER(om.email) = LOWER(auth.jwt() ->> 'email'))
        )
    )
  );

CREATE POLICY fac_v4_update ON public.financial_approval_config
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = financial_approval_config.organization_id
        AND (
          (om.user_id IS NOT NULL AND om.user_id = auth.uid())
          OR
          (om.user_id IS NULL AND LOWER(om.email) = LOWER(auth.jwt() ->> 'email'))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = financial_approval_config.organization_id
        AND (
          (om.user_id IS NOT NULL AND om.user_id = auth.uid())
          OR
          (om.user_id IS NULL AND LOWER(om.email) = LOWER(auth.jwt() ->> 'email'))
        )
    )
  );

CREATE POLICY fac_v4_delete ON public.financial_approval_config
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = financial_approval_config.organization_id
        AND (
          (om.user_id IS NOT NULL AND om.user_id = auth.uid())
          OR
          (om.user_id IS NULL AND LOWER(om.email) = LOWER(auth.jwt() ->> 'email'))
        )
    )
  );

-- Verificação
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'financial_approval_config'
ORDER BY cmd;

-- ────────────────────────────────────────────────────────────
-- FIM: 20261118000009_fix_approval_config_rls_email.sql
-- ────────────────────────────────────────────────────────────
