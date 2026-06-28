-- migration: 20260627000001_fix_investors_insert_rls_dual_check.sql
-- Fix INSERT/UPDATE RLS to use dual-check (user_id OR email) so members whose
-- organization_members.user_id is NULL can still insert/update investors.

DROP POLICY IF EXISTS "investors_insert" ON public.investors;
DROP POLICY IF EXISTS "investors_update" ON public.investors;

CREATE POLICY "investors_insert" ON public.investors
  FOR INSERT TO authenticated WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE role IN ('owner', 'admin')
        AND (user_id = auth.uid() OR email = auth.jwt()->>'email')
    )
  );

CREATE POLICY "investors_update" ON public.investors
  FOR UPDATE TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE role IN ('owner', 'admin')
        AND (user_id = auth.uid() OR email = auth.jwt()->>'email')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE role IN ('owner', 'admin')
        AND (user_id = auth.uid() OR email = auth.jwt()->>'email')
    )
  );
