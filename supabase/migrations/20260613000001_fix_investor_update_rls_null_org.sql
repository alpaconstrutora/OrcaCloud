-- Fix UPDATE RLS for investors with legacy null organization_id
-- Previously, NULL IN (SELECT ...) = false in SQL, blocking all updates on legacy rows.
-- Now the USING clause also allows rows with null org_id (so they can be migrated by admins),
-- while WITH CHECK still enforces that the saved row has a valid org_id.

DROP POLICY IF EXISTS "Admins can update their org investors" ON public.investors;

CREATE POLICY "Admins can update their org investors" ON public.investors
    FOR UPDATE TO authenticated
    USING (
        -- Allow updating legacy rows with null org_id (so the frontend can set org_id on save)
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE email = auth.jwt()->>'email'
              AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        -- After update, org_id must belong to an org where user is admin/owner
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE email = auth.jwt()->>'email'
              AND role IN ('owner', 'admin')
        )
    );
