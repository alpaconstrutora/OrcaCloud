-- Fix Case-Sensitivity in RLS Policies
-- Date: 2026-03-12

-- 1. Redefine is_org_member to be case-insensitive
CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid) 
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.organization_members 
    WHERE organization_id = org_id 
    AND LOWER(email) = LOWER(auth.jwt()->>'email')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update Organizations Policies
DROP POLICY IF EXISTS "Users can view their own organization" ON organizations;
CREATE POLICY "Users can view their own organization" 
  ON organizations FOR SELECT TO authenticated 
  USING (public.is_org_member(id));

-- 3. Update Organization Members Policies
DROP POLICY IF EXISTS "Users can view own membership" ON organization_members;
CREATE POLICY "Users can view own membership"
  ON organization_members FOR SELECT TO authenticated
  USING (LOWER(email) = LOWER(auth.jwt()->>'email'));

DROP POLICY IF EXISTS "Members can view coworkers" ON organization_members;
CREATE POLICY "Members can view coworkers"
  ON organization_members FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Owners and admins can manage members" ON organization_members;
CREATE POLICY "Owners and admins can manage members"
  ON organization_members FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM organization_members m
    WHERE m.organization_id = organization_members.organization_id
    AND LOWER(m.email) = LOWER(auth.jwt()->>'email')
    AND m.role IN ('owner', 'admin')
  ));

-- 4. Re-apply Commercial Property Policy (Just to be sure it's fresh)
DROP POLICY IF EXISTS "Enable access to organization members" ON commercial_properties;
CREATE POLICY "Enable access to organization members" ON commercial_properties
    FOR ALL TO authenticated 
    USING (public.is_org_member(organization_id) OR LOWER(auth.jwt()->>'email') = LOWER('admin@admin.com'))
    WITH CHECK (public.is_org_member(organization_id) OR LOWER(auth.jwt()->>'email') = LOWER('admin@admin.com'));
