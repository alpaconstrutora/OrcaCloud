-- ============================================================
-- Migration: 20261125000002_opura_market_city_configs
-- Módulo: ÒPURA Market Intelligence
-- Configurações e Regras Customizadas de Vocação por Cidade/Organização
-- ============================================================

-- 1. Criação da Tabela de Configurações por Cidade/Organização
CREATE TABLE IF NOT EXISTS public.opura_market_city_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    city_id UUID NOT NULL REFERENCES public.opura_market_cities(id) ON DELETE CASCADE,
    rules JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_opura_market_city_configs UNIQUE (organization_id, city_id)
);

-- 2. Índices para Busca Otimizada
CREATE INDEX IF NOT EXISTS idx_opura_market_city_configs_org_city ON public.opura_market_city_configs(organization_id, city_id);

-- 3. Habilitação de RLS - Row Level Security (Segurança de Linha)
ALTER TABLE public.opura_market_city_configs ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS para usuários autenticados (Isolamento Multi-tenant estrito)
DROP POLICY IF EXISTS "org_access_city_configs" ON public.opura_market_city_configs;
CREATE POLICY "org_access_city_configs" ON public.opura_market_city_configs
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

-- 5. Políticas de Desenvolvimento Local para Anon (role anon)
DROP POLICY IF EXISTS "Allow anon select on city_configs" ON public.opura_market_city_configs;
CREATE POLICY "Allow anon select on city_configs" ON public.opura_market_city_configs
    FOR ALL TO anon 
    USING (true) 
    WITH CHECK (true);
