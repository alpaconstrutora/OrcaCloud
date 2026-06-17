-- migration: 20261205000001_add_property_purpose_and_types.sql
-- 1. Adiciona coluna purpose em commercial_properties
-- 2. Remove constraint de tipo fixo para suportar tipos customizados
-- 3. Cria tabela commercial_property_types com tipos padrão + customizados por org

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. COLUNA PURPOSE
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.commercial_properties
    ADD COLUMN IF NOT EXISTS purpose TEXT DEFAULT 'BOTH'
        CHECK (purpose IN ('SALE', 'RENTAL', 'BOTH'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. REMOVER CONSTRAINT DE TIPO FIXO (para suportar tipos customizados)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.commercial_properties
    DROP CONSTRAINT IF EXISTS commercial_properties_type_check;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TABELA commercial_property_types
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commercial_property_types (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    code            TEXT NOT NULL,
    label           TEXT NOT NULL,
    sort_order      INT NOT NULL DEFAULT 0,
    is_system       BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice único para tipos de sistema (sem org)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cpt_code_system
    ON public.commercial_property_types (code)
    WHERE organization_id IS NULL;

-- Índice único por org para tipos customizados
CREATE UNIQUE INDEX IF NOT EXISTS idx_cpt_code_org
    ON public.commercial_property_types (code, organization_id)
    WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cpt_org ON public.commercial_property_types (organization_id);

-- Tipos padrão do sistema (organization_id = NULL → visíveis para todas as orgs)
INSERT INTO public.commercial_property_types (code, label, sort_order, is_system)
VALUES
    ('APARTMENT', 'Apartamento',      1, true),
    ('HOUSE',     'Casa',             2, true),
    ('LAND',      'Terreno / Lote',   3, true),
    ('COMMERCIAL','Comercial',        4, true),
    ('BUILDING',  'Edifício (Master)',5, true)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.commercial_property_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_property_types" ON public.commercial_property_types;
CREATE POLICY "read_property_types" ON public.commercial_property_types
    FOR SELECT TO authenticated
    USING (
        organization_id IS NULL
        OR organization_id IN (
            SELECT om.organization_id FROM public.organization_members om
            WHERE om.email = auth.jwt()->>'email'
        )
    );

DROP POLICY IF EXISTS "manage_property_types" ON public.commercial_property_types;
CREATE POLICY "manage_property_types" ON public.commercial_property_types
    FOR ALL TO authenticated
    USING (
        is_system = false
        AND organization_id IN (
            SELECT om.organization_id FROM public.organization_members om
            WHERE om.email = auth.jwt()->>'email'
        )
    )
    WITH CHECK (
        is_system = false
        AND organization_id IN (
            SELECT om.organization_id FROM public.organization_members om
            WHERE om.email = auth.jwt()->>'email'
        )
    );
