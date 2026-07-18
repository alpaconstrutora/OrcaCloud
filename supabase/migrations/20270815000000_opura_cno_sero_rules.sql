-- ============================================================
-- Migration: 20270815000000_opura_cno_sero_rules.sql
-- Description: Adiciona tabelas e colunas para cálculo exato de
-- Aferição Indireta do SERO (Receita Federal) ao módulo Opura CNO.
-- ============================================================

-- 1. Create Enums for SERO categorization
DO $$ BEGIN
  CREATE TYPE sero_category AS ENUM ('obra_nova', 'acrescimo', 'reforma', 'demolicao');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sero_destination AS ENUM (
    'residencial_unifamiliar', 
    'residencial_multifamiliar', 
    'comercial_salas_lojas', 
    'galpao_industrial', 
    'casa_popular', 
    'conjunto_habitacional_popular', 
    'edificio_garagens'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sero_type AS ENUM ('alvenaria', 'madeira', 'mista');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Update Main Record Table (opura_cno_registrations)
ALTER TABLE public.opura_cno_registrations
  ADD COLUMN IF NOT EXISTS sero_category sero_category,
  ADD COLUMN IF NOT EXISTS sero_destination sero_destination,
  ADD COLUMN IF NOT EXISTS sero_type sero_type,
  ADD COLUMN IF NOT EXISTS vau_value NUMERIC(15,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS used_pre_mixed_concrete BOOLEAN DEFAULT false;

-- 3. Create Areas Table
CREATE TABLE IF NOT EXISTS public.opura_cno_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    cno_registration_id UUID NOT NULL REFERENCES public.opura_cno_registrations(id) ON DELETE CASCADE,
    area_type VARCHAR(50) NOT NULL CHECK (area_type IN ('principal', 'complementar')),
    is_covered BOOLEAN DEFAULT true,
    total_area NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Create Pre-molded Reductions Table (Notas Fiscais de Pré-Moldados)
CREATE TABLE IF NOT EXISTS public.opura_cno_reductions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    cno_registration_id UUID NOT NULL REFERENCES public.opura_cno_registrations(id) ON DELETE CASCADE,
    nf_cnpj VARCHAR(18) NOT NULL,
    nf_number VARCHAR(50) NOT NULL,
    nf_serie VARCHAR(20),
    nf_date DATE NOT NULL,
    nf_value NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    percent_used NUMERIC(5,2) NOT NULL DEFAULT 100.00, -- Parcela da nota (ex: 100%)
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. RLS Policies
ALTER TABLE public.opura_cno_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opura_cno_reductions ENABLE ROW LEVEL SECURITY;

-- 5.1 Org Access (Authenticated)
DROP POLICY IF EXISTS "cno_areas_org_access" ON public.opura_cno_areas;
CREATE POLICY "cno_areas_org_access" ON public.opura_cno_areas
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "cno_reductions_org_access" ON public.opura_cno_reductions;
CREATE POLICY "cno_reductions_org_access" ON public.opura_cno_reductions
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

-- 5.2 Anon Access (for dev matching Regra 8)
DROP POLICY IF EXISTS "Allow anon all on opura_cno_areas" ON public.opura_cno_areas;
CREATE POLICY "Allow anon all on opura_cno_areas" 
    ON public.opura_cno_areas FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on opura_cno_reductions" ON public.opura_cno_reductions;
CREATE POLICY "Allow anon all on opura_cno_reductions" 
    ON public.opura_cno_reductions FOR ALL TO anon USING (true) WITH CHECK (true);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_cno_areas_cno_reg ON public.opura_cno_areas(cno_registration_id);
CREATE INDEX IF NOT EXISTS idx_cno_areas_org ON public.opura_cno_areas(organization_id);
CREATE INDEX IF NOT EXISTS idx_cno_reductions_cno_reg ON public.opura_cno_reductions(cno_registration_id);
CREATE INDEX IF NOT EXISTS idx_cno_reductions_org ON public.opura_cno_reductions(organization_id);

-- 7. Triggers for updated_at
DROP TRIGGER IF EXISTS trg_cno_areas_updated_at ON public.opura_cno_areas;
CREATE TRIGGER trg_cno_areas_updated_at
    BEFORE UPDATE ON public.opura_cno_areas
    FOR EACH ROW EXECUTE FUNCTION public.update_opura_cno_updated_at();

DROP TRIGGER IF EXISTS trg_cno_reductions_updated_at ON public.opura_cno_reductions;
CREATE TRIGGER trg_cno_reductions_updated_at
    BEFORE UPDATE ON public.opura_cno_reductions
    FOR EACH ROW EXECUTE FUNCTION public.update_opura_cno_updated_at();
