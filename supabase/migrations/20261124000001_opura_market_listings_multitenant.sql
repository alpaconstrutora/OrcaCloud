-- Adiciona a coluna organization_id (nullable) à tabela opura_market_listings para suporte a multi-tenancy
ALTER TABLE public.opura_market_listings 
ADD COLUMN IF NOT EXISTS organization_id UUID;

-- 1. Políticas RLS para SELECT (visualizar dados globais ou da própria organização)
DROP POLICY IF EXISTS "allow_select_market_listings" ON public.opura_market_listings;
CREATE POLICY "allow_select_market_listings" ON public.opura_market_listings
    FOR SELECT TO authenticated
    USING (
        organization_id IS NULL 
        OR organization_id IN (
            SELECT om.organization_id 
            FROM public.organization_members om 
            WHERE om.email = auth.jwt()->>'email'
        )
    );

-- 2. Políticas RLS para INSERT (inserir anúncios associados à própria organização)
DROP POLICY IF EXISTS "allow_insert_market_listings" ON public.opura_market_listings;
CREATE POLICY "allow_insert_market_listings" ON public.opura_market_listings
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id IN (
            SELECT om.organization_id 
            FROM public.organization_members om 
            WHERE om.email = auth.jwt()->>'email'
        )
    );

-- 3. Políticas RLS para UPDATE (atualizar anúncios associados à própria organização)
DROP POLICY IF EXISTS "allow_update_market_listings" ON public.opura_market_listings;
CREATE POLICY "allow_update_market_listings" ON public.opura_market_listings
    FOR UPDATE TO authenticated
    USING (
        organization_id IN (
            SELECT om.organization_id 
            FROM public.organization_members om 
            WHERE om.email = auth.jwt()->>'email'
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT om.organization_id 
            FROM public.organization_members om 
            WHERE om.email = auth.jwt()->>'email'
        )
    );

-- 4. Políticas RLS para DELETE (deletar anúncios associados à própria organização)
DROP POLICY IF EXISTS "allow_delete_market_listings" ON public.opura_market_listings;
CREATE POLICY "allow_delete_market_listings" ON public.opura_market_listings
    FOR DELETE TO authenticated
    USING (
        organization_id IN (
            SELECT om.organization_id 
            FROM public.organization_members om 
            WHERE om.email = auth.jwt()->>'email'
        )
    );

-- 5. Atualizar Política de Desenvolvimento local para anon (role anon)
DROP POLICY IF EXISTS "Allow anon select on listings" ON public.opura_market_listings;
CREATE POLICY "Allow anon select on listings" ON public.opura_market_listings 
    FOR ALL TO anon 
    USING (true) 
    WITH CHECK (true);
