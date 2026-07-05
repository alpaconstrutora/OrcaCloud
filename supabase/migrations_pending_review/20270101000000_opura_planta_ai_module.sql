-- migration: 20270101000000_opura_planta_ai_module.sql
-- Módulo ÒPURA Planta AI: Gerador de Estudos Preliminares e Viabilidade Arquitetônica

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabela raiz: plant_studies
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plant_studies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Rascunho'
        CHECK (status IN ('Rascunho','Em análise','Cenários gerados','Cenário selecionado','Enviado para viabilidade','Arquivado')),
    city TEXT,
    state TEXT,
    neighborhood TEXT,
    address TEXT,
    responsible_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    selected_scenario_id UUID, -- Definido depois que o cenário é gerado
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS plant_studies_org_idx ON public.plant_studies (organization_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tabela: plant_terrains
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plant_terrains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL REFERENCES public.plant_studies(id) ON DELETE CASCADE,
    terrain_type TEXT DEFAULT 'Retangular',
    area NUMERIC NOT NULL,
    frontage NUMERIC NOT NULL,
    depth NUMERIC NOT NULL,
    frontage_orientation TEXT,
    is_corner BOOLEAN DEFAULT false,
    slope_type TEXT DEFAULT 'Plano',
    polygon_geometry JSONB, -- Opcional no MVP, pode ser gerado a partir de frente x profundidade
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT plant_terrains_study_unique UNIQUE (study_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tabela: plant_urban_rulesets
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plant_urban_rulesets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL REFERENCES public.plant_studies(id) ON DELETE CASCADE,
    city TEXT,
    state TEXT,
    zone_name TEXT,
    allowed_use TEXT DEFAULT 'Residencial',
    occupancy_rate NUMERIC, -- Taxa de ocupação (%)
    floor_area_ratio_basic NUMERIC, -- Coeficiente de aproveitamento básico
    floor_area_ratio_max NUMERIC, -- Coeficiente de aproveitamento máximo
    permeability_rate NUMERIC, -- Taxa de permeabilidade (%)
    front_setback NUMERIC, -- Recuo frontal (m)
    left_setback NUMERIC, -- Recuo lateral esquerdo (m)
    right_setback NUMERIC, -- Recuo lateral direito (m)
    rear_setback NUMERIC, -- Recuo de fundo (m)
    max_floors INTEGER,
    max_height NUMERIC,
    parking_rule_type TEXT,
    parking_spaces_per_unit NUMERIC,
    min_unit_area NUMERIC,
    law_reference TEXT,
    source_document TEXT,
    confidence_level TEXT DEFAULT 'Médio'
        CHECK (confidence_level IN ('Baixo','Médio','Alto','Validado por profissional','Validado na prefeitura')),
    validated_by UUID REFERENCES auth.users(id),
    validated_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT plant_urban_rulesets_study_unique UNIQUE (study_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Tabela: plant_briefings
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plant_briefings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL REFERENCES public.plant_studies(id) ON DELETE CASCADE,
    development_type TEXT DEFAULT 'Residencial Vertical',
    product_standard TEXT DEFAULT 'Médio'
        CHECK (product_standard IN ('Econômico','Médio','Alto','Premium')),
    main_objective TEXT DEFAULT 'Equilibrar resultado'
        CHECK (main_objective IN ('Maximizar VGV','Maximizar número de unidades','Maximizar área privativa','Maximizar liquidez','Reduzir custo','Equilibrar resultado')),
    allowed_typologies JSONB DEFAULT '["2 dormitórios"]'::jsonb,
    target_unit_area_min NUMERIC,
    target_unit_area_max NUMERIC,
    desired_units_per_floor INTEGER,
    desired_floors INTEGER,
    parking_per_unit NUMERIC,
    has_elevator TEXT DEFAULT 'automático conforme pavimentos',
    has_balcony TEXT DEFAULT 'sim',
    has_suite TEXT DEFAULT 'opcional',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT plant_briefings_study_unique UNIQUE (study_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Tabela: plant_scenarios
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plant_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL REFERENCES public.plant_studies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    scenario_type TEXT NOT NULL
        CHECK (scenario_type IN ('Conservador','Equilibrado','Máximo aproveitamento','Customizado')),
    status TEXT DEFAULT 'Gerado',
    generation_method TEXT DEFAULT 'Template Paramétrico',
    template_id TEXT,
    floors_count INTEGER,
    units_per_floor INTEGER,
    total_units INTEGER,
    total_built_area NUMERIC,
    total_private_area NUMERIC,
    total_common_area NUMERIC,
    total_sellable_area NUMERIC,
    total_parking_spaces INTEGER,
    occupancy_used NUMERIC,
    floor_area_ratio_used NUMERIC,
    efficiency_ratio NUMERIC,
    estimated_vgv NUMERIC,
    estimated_cost NUMERIC,
    urban_score NUMERIC,
    architectural_score NUMERIC,
    commercial_score NUMERIC,
    economic_score NUMERIC,
    construction_score NUMERIC,
    general_score NUMERIC,
    selected BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS plant_scenarios_study_idx ON public.plant_scenarios (study_id);

-- Alteração: Chave estrangeira na tabela study para o cenário selecionado
ALTER TABLE public.plant_studies DROP CONSTRAINT IF EXISTS plant_studies_selected_scenario_fk;
ALTER TABLE public.plant_studies
    ADD CONSTRAINT plant_studies_selected_scenario_fk
    FOREIGN KEY (selected_scenario_id) REFERENCES public.plant_scenarios(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Tabela: plant_floors
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plant_floors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id UUID NOT NULL REFERENCES public.plant_scenarios(id) ON DELETE CASCADE,
    floor_number INTEGER NOT NULL,
    floor_type TEXT DEFAULT 'Tipo',
    gross_area NUMERIC,
    private_area NUMERIC,
    common_area NUMERIC,
    circulation_area NUMERIC,
    geometry_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS plant_floors_scenario_idx ON public.plant_floors (scenario_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Tabela: plant_units
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plant_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    floor_id UUID NOT NULL REFERENCES public.plant_floors(id) ON DELETE CASCADE,
    unit_code TEXT,
    unit_type TEXT,
    bedrooms INTEGER,
    suites INTEGER,
    bathrooms INTEGER,
    parking_spaces INTEGER,
    private_area NUMERIC,
    gross_area NUMERIC,
    has_balcony BOOLEAN,
    has_suite BOOLEAN,
    geometry_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS plant_units_floor_idx ON public.plant_units (floor_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Tabela: plant_validations
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plant_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id UUID NOT NULL REFERENCES public.plant_scenarios(id) ON DELETE CASCADE,
    validation_type TEXT CHECK (validation_type IN ('Urbanístico','Arquitetônico','Comercial')),
    severity TEXT CHECK (severity IN ('Bloqueante','Alta','Média','Baixa','Informativa')),
    rule_code TEXT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    allowed_value TEXT,
    actual_value TEXT,
    affected_entity_type TEXT,
    affected_entity_id UUID,
    recommendation TEXT,
    status TEXT DEFAULT 'Ativo',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS plant_validations_scenario_idx ON public.plant_validations (scenario_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Triggers de updated_at
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at_plant_studies ON public.plant_studies;
CREATE TRIGGER set_updated_at_plant_studies BEFORE UPDATE ON public.plant_studies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_plant_terrains ON public.plant_terrains;
CREATE TRIGGER set_updated_at_plant_terrains BEFORE UPDATE ON public.plant_terrains FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_plant_urban_rulesets ON public.plant_urban_rulesets;
CREATE TRIGGER set_updated_at_plant_urban_rulesets BEFORE UPDATE ON public.plant_urban_rulesets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_plant_briefings ON public.plant_briefings;
CREATE TRIGGER set_updated_at_plant_briefings BEFORE UPDATE ON public.plant_briefings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_plant_scenarios ON public.plant_scenarios;
CREATE TRIGGER set_updated_at_plant_scenarios BEFORE UPDATE ON public.plant_scenarios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_plant_floors ON public.plant_floors;
CREATE TRIGGER set_updated_at_plant_floors BEFORE UPDATE ON public.plant_floors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_plant_units ON public.plant_units;
CREATE TRIGGER set_updated_at_plant_units BEFORE UPDATE ON public.plant_units FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. RLS (Row Level Security)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.plant_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plant_terrains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plant_urban_rulesets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plant_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plant_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plant_floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plant_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plant_validations ENABLE ROW LEVEL SECURITY;

-- 10.1 raiz: access por organização
DROP POLICY IF EXISTS "org_access_plant_studies" ON public.plant_studies;
CREATE POLICY "org_access_plant_studies" ON public.plant_studies
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email'))
    WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email'));

-- 10.2 filhos de plant_studies
DROP POLICY IF EXISTS "org_access_plant_terrains" ON public.plant_terrains;
CREATE POLICY "org_access_plant_terrains" ON public.plant_terrains FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.plant_studies s WHERE s.id = plant_terrains.study_id AND s.organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.plant_studies s WHERE s.id = plant_terrains.study_id AND s.organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email')));

DROP POLICY IF EXISTS "org_access_plant_urban_rulesets" ON public.plant_urban_rulesets;
CREATE POLICY "org_access_plant_urban_rulesets" ON public.plant_urban_rulesets FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.plant_studies s WHERE s.id = plant_urban_rulesets.study_id AND s.organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.plant_studies s WHERE s.id = plant_urban_rulesets.study_id AND s.organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email')));

DROP POLICY IF EXISTS "org_access_plant_briefings" ON public.plant_briefings;
CREATE POLICY "org_access_plant_briefings" ON public.plant_briefings FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.plant_studies s WHERE s.id = plant_briefings.study_id AND s.organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.plant_studies s WHERE s.id = plant_briefings.study_id AND s.organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email')));

DROP POLICY IF EXISTS "org_access_plant_scenarios" ON public.plant_scenarios;
CREATE POLICY "org_access_plant_scenarios" ON public.plant_scenarios FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.plant_studies s WHERE s.id = plant_scenarios.study_id AND s.organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.plant_studies s WHERE s.id = plant_scenarios.study_id AND s.organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email')));

-- 10.3 filhos de plant_scenarios
DROP POLICY IF EXISTS "org_access_plant_floors" ON public.plant_floors;
CREATE POLICY "org_access_plant_floors" ON public.plant_floors FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.plant_scenarios sc JOIN public.plant_studies s ON s.id = sc.study_id WHERE sc.id = plant_floors.scenario_id AND s.organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.plant_scenarios sc JOIN public.plant_studies s ON s.id = sc.study_id WHERE sc.id = plant_floors.scenario_id AND s.organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email')));

DROP POLICY IF EXISTS "org_access_plant_validations" ON public.plant_validations;
CREATE POLICY "org_access_plant_validations" ON public.plant_validations FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.plant_scenarios sc JOIN public.plant_studies s ON s.id = sc.study_id WHERE sc.id = plant_validations.scenario_id AND s.organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.plant_scenarios sc JOIN public.plant_studies s ON s.id = sc.study_id WHERE sc.id = plant_validations.scenario_id AND s.organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email')));

-- 10.4 filhos de plant_floors
DROP POLICY IF EXISTS "org_access_plant_units" ON public.plant_units;
CREATE POLICY "org_access_plant_units" ON public.plant_units FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.plant_floors f 
        JOIN public.plant_scenarios sc ON sc.id = f.scenario_id 
        JOIN public.plant_studies s ON s.id = sc.study_id 
        WHERE f.id = plant_units.floor_id 
        AND s.organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email')
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.plant_floors f 
        JOIN public.plant_scenarios sc ON sc.id = f.scenario_id 
        JOIN public.plant_studies s ON s.id = sc.study_id 
        WHERE f.id = plant_units.floor_id 
        AND s.organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email')
    ));

-- 10.5 Anon access for dev
DROP POLICY IF EXISTS "Allow anon all on plant_studies" ON public.plant_studies;
CREATE POLICY "Allow anon all on plant_studies" ON public.plant_studies FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on plant_terrains" ON public.plant_terrains;
CREATE POLICY "Allow anon all on plant_terrains" ON public.plant_terrains FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on plant_urban_rulesets" ON public.plant_urban_rulesets;
CREATE POLICY "Allow anon all on plant_urban_rulesets" ON public.plant_urban_rulesets FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on plant_briefings" ON public.plant_briefings;
CREATE POLICY "Allow anon all on plant_briefings" ON public.plant_briefings FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on plant_scenarios" ON public.plant_scenarios;
CREATE POLICY "Allow anon all on plant_scenarios" ON public.plant_scenarios FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on plant_floors" ON public.plant_floors;
CREATE POLICY "Allow anon all on plant_floors" ON public.plant_floors FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on plant_units" ON public.plant_units;
CREATE POLICY "Allow anon all on plant_units" ON public.plant_units FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on plant_validations" ON public.plant_validations;
CREATE POLICY "Allow anon all on plant_validations" ON public.plant_validations FOR ALL TO anon USING (true) WITH CHECK (true);
