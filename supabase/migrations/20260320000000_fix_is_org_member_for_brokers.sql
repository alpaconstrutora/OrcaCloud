-- ==========================================================================
-- Migration: Fix is_org_member for Brokers
-- Date: 2026-03-20
-- Description: Updates the is_org_member function to allow Brokers to access
--              their organizations and linked properties/deals.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid) 
RETURNS boolean AS $$
BEGIN
  -- 1. Check if user is in organization_members
  IF EXISTS (
    SELECT 1 
    FROM public.organization_members 
    WHERE organization_id = org_id 
    AND LOWER(email) = LOWER(auth.jwt()->>'email')
  ) THEN
    RETURN TRUE;
  END IF;

  -- 2. Check if user is an active Broker linked to this organization
  IF EXISTS (
    SELECT 1
    FROM public.broker_profiles
    WHERE organization_id = org_id
    AND LOWER(email) = LOWER(auth.jwt()->>'email')
    AND is_active = true
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-apply policies to ensure they use the updated function logic
-- (In Supabase, policies using a function automatically adapt when the function is updated, 
-- but explicit re-application is safer during migrations)

DROP POLICY IF EXISTS "Users can view their own organization" ON public.organizations;
CREATE POLICY "Users can view their own organization" 
  ON public.organizations FOR SELECT TO authenticated 
  USING (public.is_org_member(id));

DROP POLICY IF EXISTS "Enable access to organization members" ON public.commercial_properties;
CREATE POLICY "Enable access to organization members" ON public.commercial_properties
    FOR ALL TO authenticated 
    USING (public.is_org_member(organization_id) OR LOWER(auth.jwt()->>'email') = LOWER('admin@admin.com'))
    WITH CHECK (public.is_org_member(organization_id) OR LOWER(auth.jwt()->>'email') = LOWER('admin@admin.com'));

DROP POLICY IF EXISTS "Enable access to organization members" ON public.commercial_deals;
CREATE POLICY "Enable access to organization members" ON public.commercial_deals
    FOR ALL TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.commercial_properties p 
            WHERE p.id = commercial_deals.property_id 
            AND (public.is_org_member(p.organization_id) OR LOWER(auth.jwt()->>'email') = LOWER('admin@admin.com'))
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.commercial_properties p 
            WHERE p.id = commercial_deals.property_id 
            AND (public.is_org_member(p.organization_id) OR LOWER(auth.jwt()->>'email') = LOWER('admin@admin.com'))
        )
    );
