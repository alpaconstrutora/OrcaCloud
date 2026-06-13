-- Mapa Regulatório por estudo de viabilidade
CREATE TABLE IF NOT EXISTS public.imovib_regulatory_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL REFERENCES public.imovib_studies(id) ON DELETE CASCADE,
    macroarea TEXT,
    zona TEXT,
    ca_minimo TEXT,
    ca_basico TEXT,
    ca_maximo TEXT,
    taxa_ocupacao_maxima TEXT,
    taxa_permeabilidade_minima TEXT,
    gabarito_altura_maxima TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.imovib_regulatory_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_regulatory_zones" ON public.imovib_regulatory_zones;
CREATE POLICY "select_regulatory_zones" ON public.imovib_regulatory_zones FOR SELECT
    USING (study_id IN (
        SELECT id FROM public.imovib_studies WHERE organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email'
        )
    ));

DROP POLICY IF EXISTS "insert_regulatory_zones" ON public.imovib_regulatory_zones;
CREATE POLICY "insert_regulatory_zones" ON public.imovib_regulatory_zones FOR INSERT
    WITH CHECK (study_id IN (
        SELECT id FROM public.imovib_studies WHERE organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email'
        )
    ));

DROP POLICY IF EXISTS "update_regulatory_zones" ON public.imovib_regulatory_zones;
CREATE POLICY "update_regulatory_zones" ON public.imovib_regulatory_zones FOR UPDATE
    USING (study_id IN (
        SELECT id FROM public.imovib_studies WHERE organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email'
        )
    ));

DROP POLICY IF EXISTS "delete_regulatory_zones" ON public.imovib_regulatory_zones;
CREATE POLICY "delete_regulatory_zones" ON public.imovib_regulatory_zones FOR DELETE
    USING (study_id IN (
        SELECT id FROM public.imovib_studies WHERE organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email'
        )
    ));

CREATE INDEX IF NOT EXISTS idx_imovib_regulatory_zones_study ON public.imovib_regulatory_zones(study_id);

DROP TRIGGER IF EXISTS set_imovib_regulatory_zones_updated_at ON public.imovib_regulatory_zones;
CREATE TRIGGER set_imovib_regulatory_zones_updated_at
    BEFORE UPDATE ON public.imovib_regulatory_zones
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
