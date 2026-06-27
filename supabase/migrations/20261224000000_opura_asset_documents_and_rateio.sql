-- migration: 20261224000000_opura_asset_documents_and_rateio.sql

-- 1. Criação da Tabela de Documentos de Ativos
CREATE TABLE IF NOT EXISTS public.opura_asset_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    asset_id UUID NOT NULL REFERENCES public.opura_assets(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- seguro, licenciamento, termo_responsabilidade, outro
    name VARCHAR(255) NOT NULL,
    document_number VARCHAR(100),
    expiration_date DATE,
    file_url TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'ativo', -- ativo, vencido, suspenso
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Habilitação de RLS
ALTER TABLE public.opura_asset_documents ENABLE ROW LEVEL SECURITY;

-- 3. Criação de Políticas RLS para Acesso Corporativo (Authenticated Tenant - Regra 2)
DROP POLICY IF EXISTS "org_access_asset_documents" ON public.opura_asset_documents;
CREATE POLICY "org_access_asset_documents" ON public.opura_asset_documents
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT om.organization_id 
        FROM public.organization_members om 
        WHERE om.email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT om.organization_id 
        FROM public.organization_members om 
        WHERE om.email = auth.jwt()->>'email'
    ));

-- 4. Políticas de Desenvolvimento (Regra 8 — Políticas Anon)
DROP POLICY IF EXISTS "Allow anon all on asset_documents" ON public.opura_asset_documents;
CREATE POLICY "Allow anon all on asset_documents" ON public.opura_asset_documents FOR ALL TO anon USING (true) WITH CHECK (true);
