-- Migration to add organization_id to clients and investors
-- Date: 2026-03-20

-- Add organization_id to clients
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'organization_id') THEN
        ALTER TABLE public.clients ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add organization_id to investors
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'investors' AND column_name = 'organization_id') THEN
        ALTER TABLE public.investors ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Update RLS policies to support organization filtering (optional but good practice)
-- Clients
DROP POLICY IF EXISTS "Allow authenticated users to read clients" ON public.clients;
CREATE POLICY "Allow authenticated users to read clients" ON public.clients
    FOR SELECT TO authenticated 
    USING (organization_id IS NULL OR organization_id IN (SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'));

-- Investors
DROP POLICY IF EXISTS "Allow authenticated users to read investors" ON public.investors;
CREATE POLICY "Allow authenticated users to read investors" ON public.investors
    FOR SELECT TO authenticated 
    USING (organization_id IS NULL OR organization_id IN (SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'));
