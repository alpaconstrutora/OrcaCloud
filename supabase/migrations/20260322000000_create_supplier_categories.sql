-- Create supplier_categories table
CREATE TABLE IF NOT EXISTS public.supplier_categories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(name, organization_id)
);

-- Enable RLS
ALTER TABLE public.supplier_categories ENABLE ROW LEVEL SECURITY;

-- Drop policies if they already exist (idempotent)
DROP POLICY IF EXISTS "Allow authenticated users to read categories" ON public.supplier_categories;
DROP POLICY IF EXISTS "Allow authenticated users to manage categories" ON public.supplier_categories;

-- Policies for authenticated users
CREATE POLICY "Allow authenticated users to read categories" ON public.supplier_categories
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage categories" ON public.supplier_categories
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
