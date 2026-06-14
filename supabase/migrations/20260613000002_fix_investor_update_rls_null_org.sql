-- Fix all investor RLS policies to use user_id = auth.uid() (correct pattern for this project).
-- Previous policies used email = auth.jwt()->>'email' which doesn't match all users.
-- Also allows USING on null org_id rows so legacy investors can be migrated on save.

DROP POLICY IF EXISTS "Members can read their org investors"    ON public.investors;
DROP POLICY IF EXISTS "Admins can create investors"            ON public.investors;
DROP POLICY IF EXISTS "Admins can update their org investors"  ON public.investors;
DROP POLICY IF EXISTS "Owners can delete their org investors"  ON public.investors;
-- names from original migration (20260210000000)
DROP POLICY IF EXISTS "Allow authenticated users to read investors"   ON public.investors;
DROP POLICY IF EXISTS "Allow authenticated users to manage investors" ON public.investors;

CREATE POLICY "investors_select" ON public.investors
  FOR SELECT TO authenticated USING (
    organization_id IS NULL
    OR organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "investors_insert" ON public.investors
  FOR INSERT TO authenticated WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "investors_update" ON public.investors
  FOR UPDATE TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "investors_delete" ON public.investors
  FOR DELETE TO authenticated USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );
