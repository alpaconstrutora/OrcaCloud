-- Fix RLS policies for investors table
-- Removes the open USING(true) policies and scopes access to organization members
-- Date: 2026-06-04

-- Drop old permissive policies
DROP POLICY IF EXISTS "Allow authenticated users to read investors" ON public.investors;
DROP POLICY IF EXISTS "Allow authenticated users to manage investors" ON public.investors;

-- SELECT: any member of the org can read its investors
CREATE POLICY "Members can read their org investors" ON public.investors
    FOR SELECT TO authenticated
    USING (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE email = auth.jwt()->>'email'
        )
    );

-- INSERT: only owners and admins can create investors
CREATE POLICY "Admins can create investors" ON public.investors
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE email = auth.jwt()->>'email'
              AND role IN ('owner', 'admin')
        )
    );

-- UPDATE: only owners and admins of the same org can update
CREATE POLICY "Admins can update their org investors" ON public.investors
    FOR UPDATE TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE email = auth.jwt()->>'email'
              AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE email = auth.jwt()->>'email'
              AND role IN ('owner', 'admin')
        )
    );

-- DELETE: only owners can delete investors
CREATE POLICY "Owners can delete their org investors" ON public.investors
    FOR DELETE TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE email = auth.jwt()->>'email'
              AND role = 'owner'
        )
    );
