-- Fix: fiscal_auth_org_id() and fiscal_member_of() used user_id = auth.uid()
-- but organization_members identifies users by email (user_id is nullable).

CREATE OR REPLACE FUNCTION fiscal_auth_org_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE email = auth.jwt() ->> 'email'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION fiscal_member_of(p_org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE email = auth.jwt() ->> 'email'
      AND organization_id = p_org_id
  )
$$;
