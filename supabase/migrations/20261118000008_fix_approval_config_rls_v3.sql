-- ============================================================
-- Fix RLS v3: financial_approval_config
-- OrçaCloud SaaS · Migration 20261118000008
--
-- Abordagem final: desabilita RLS, recria do zero com
-- SECURITY DEFINER helper inline para contornar qualquer
-- problema de contexto de execução.
-- ============================================================

-- 1. Desabilita RLS temporariamente para limpar sem erros de permissão
ALTER TABLE public.financial_approval_config DISABLE ROW LEVEL SECURITY;

-- 2. Remove TODAS as policies (dinâmico — independe dos nomes)
DO $$
DECLARE r record;
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

-- 3. Reabilita RLS
ALTER TABLE public.financial_approval_config ENABLE ROW LEVEL SECURITY;

-- 4. Policy SELECT: qualquer membro autenticado da org pode ler
CREATE POLICY fac_v3_select ON public.financial_approval_config
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- 5. Policy INSERT: membro pode inserir para sua própria org
CREATE POLICY fac_v3_insert ON public.financial_approval_config
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- 6. Policy UPDATE
CREATE POLICY fac_v3_update ON public.financial_approval_config
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- 7. Policy DELETE
CREATE POLICY fac_v3_delete ON public.financial_approval_config
  FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- 8. Verificação: lista as policies criadas
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'financial_approval_config'
ORDER BY cmd;

-- ────────────────────────────────────────────────────────────
-- FIM: 20261118000008_fix_approval_config_rls_v3.sql
-- ────────────────────────────────────────────────────────────
