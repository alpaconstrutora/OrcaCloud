-- migration: 20260627000000_opura_asset_brands_and_reservation_resp.sql

-- 1. Criação da tabela de marcas
CREATE TABLE IF NOT EXISTS public.opura_asset_brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índice único insensível a maiúsculas/minúsculas para marcas dentro da mesma organização
CREATE UNIQUE INDEX IF NOT EXISTS opura_asset_brands_org_name_idx 
    ON public.opura_asset_brands (organization_id, lower(name));

-- 2. Adição da coluna de responsável na tabela de reservas
ALTER TABLE public.opura_asset_reservations 
    ADD COLUMN IF NOT EXISTS responsible_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

-- 3. Habilitação de RLS na tabela de marcas
ALTER TABLE public.opura_asset_brands ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso para marcas
DROP POLICY IF EXISTS "org_access_brands" ON public.opura_asset_brands;
CREATE POLICY "org_access_brands" ON public.opura_asset_brands
    FOR ALL
    TO authenticated
    USING (
        organization_id IN (
            SELECT org_id FROM public.organization_members
            WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT org_id FROM public.organization_members
            WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Allow anon all on brands" ON public.opura_asset_brands;
CREATE POLICY "Allow anon all on brands" ON public.opura_asset_brands 
    FOR ALL 
    TO anon 
    USING (true) 
    WITH CHECK (true);
