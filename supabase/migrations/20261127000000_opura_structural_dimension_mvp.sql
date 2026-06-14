-- migration: 20261127000000_opura_structural_dimension_mvp.sql

-- ============================================================
-- Módulo: ÒPURA Dimensionamento Estrutural
-- Tabelas para gestão de projetos, elementos estruturais e histórico de revisões
-- Conforme ABNT NBR 6118:2023
-- ============================================================

-- 1. Criação das Tabelas (Regra 10 — Idempotentes)

CREATE TABLE IF NOT EXISTS public.opura_structural_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    nome VARCHAR(255) NOT NULL,
    responsavel_tecnico VARCHAR(255) NOT NULL,
    numero_art VARCHAR(100),
    caa VARCHAR(10) NOT NULL CHECK (caa IN ('I', 'II', 'III', 'IV')),
    norma VARCHAR(100) NOT NULL DEFAULT 'ABNT NBR 6118:2023',
    status VARCHAR(50) NOT NULL DEFAULT 'EM_ANDAMENTO' CHECK (status IN ('EM_ANDAMENTO', 'VERIFICADO', 'EMITIDO', 'REVISADO')),
    revisao_atual INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.opura_structural_dimension_elements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES public.opura_structural_projects(id) ON DELETE CASCADE,
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('VIGA', 'PILAR', 'LAJE', 'SAPATA', 'VIGA_BALDRAME')),
    pavimento VARCHAR(100) NOT NULL,
    tag VARCHAR(50) NOT NULL,
    geometria JSONB NOT NULL,
    cargas JSONB NOT NULL,
    resultado_calculo JSONB,
    status_verificacao VARCHAR(50) NOT NULL DEFAULT 'NAO_CALCULADO' CHECK (status_verificacao IN ('OK', 'ATENCAO', 'REPROVADO', 'NAO_CALCULADO')),
    structural_element_id UUID REFERENCES public.structural_elements(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.opura_structural_calculation_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES public.opura_structural_projects(id) ON DELETE CASCADE,
    revisao INT NOT NULL,
    elemento_tag VARCHAR(50) NOT NULL,
    tipo_elemento VARCHAR(50) NOT NULL,
    geometria_calculada JSONB NOT NULL,
    cargas_calculadas JSONB NOT NULL,
    resultado_verificacao JSONB NOT NULL,
    armadura_calculada JSONB NOT NULL,
    calculado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    calculado_por VARCHAR(255) NOT NULL
);

-- Triggers de update do timestamp

CREATE OR REPLACE FUNCTION public.set_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_opura_structural_projects_updated_at ON public.opura_structural_projects;
CREATE TRIGGER tr_opura_structural_projects_updated_at
    BEFORE UPDATE ON public.opura_structural_projects
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();

DROP TRIGGER IF EXISTS tr_opura_structural_dimension_elements_updated_at ON public.opura_structural_dimension_elements;
CREATE TRIGGER tr_opura_structural_dimension_elements_updated_at
    BEFORE UPDATE ON public.opura_structural_dimension_elements
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();

-- 2. Habilitação de RLS (Row Level Security - Regra 2)

ALTER TABLE public.opura_structural_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opura_structural_dimension_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opura_structural_calculation_revisions ENABLE ROW LEVEL SECURITY;

-- 3. Criação de Políticas RLS para Acesso Corporativo (Authenticated Tenant - Regra 2)

DROP POLICY IF EXISTS "org_access_structural_projects" ON public.opura_structural_projects;
CREATE POLICY "org_access_structural_projects" ON public.opura_structural_projects
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

DROP POLICY IF EXISTS "org_access_structural_dimension_elements" ON public.opura_structural_dimension_elements;
CREATE POLICY "org_access_structural_dimension_elements" ON public.opura_structural_dimension_elements
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

DROP POLICY IF EXISTS "org_access_structural_calculation_revisions" ON public.opura_structural_calculation_revisions;
CREATE POLICY "org_access_structural_calculation_revisions" ON public.opura_structural_calculation_revisions
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

DROP POLICY IF EXISTS "Allow anon all on structural_projects" ON public.opura_structural_projects;
CREATE POLICY "Allow anon all on structural_projects" ON public.opura_structural_projects FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on structural_dimension_elements" ON public.opura_structural_dimension_elements;
CREATE POLICY "Allow anon all on structural_dimension_elements" ON public.opura_structural_dimension_elements FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on structural_calculation_revisions" ON public.opura_structural_calculation_revisions;
CREATE POLICY "Allow anon all on structural_calculation_revisions" ON public.opura_structural_calculation_revisions FOR ALL TO anon USING (true) WITH CHECK (true);
