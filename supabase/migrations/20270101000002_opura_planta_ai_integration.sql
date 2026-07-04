-- Integração Planta AI -> Imovib e Comercial

ALTER TABLE public.commercial_properties ADD COLUMN IF NOT EXISTS planta_ai_study_id UUID REFERENCES public.plant_studies(id) ON DELETE SET NULL;
ALTER TABLE public.imovib_studies ADD COLUMN IF NOT EXISTS planta_ai_study_id UUID REFERENCES public.plant_studies(id) ON DELETE SET NULL;

-- Atualizar restrição de status do imóvel para aceitar 'STUDY'
DO $$
BEGIN
    ALTER TABLE public.commercial_properties DROP CONSTRAINT IF EXISTS commercial_properties_status_check;
    ALTER TABLE public.commercial_properties ADD CONSTRAINT commercial_properties_status_check 
        CHECK (status IN ('AVAILABLE', 'SOLD', 'RENTED', 'RESERVED', 'MAINTENANCE', 'EXCHANGED', 'STUDY'));
EXCEPTION 
    WHEN others THEN NULL; 
END $$;
