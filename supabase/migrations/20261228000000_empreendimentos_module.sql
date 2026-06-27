-- migration: 20261228000000_empreendimentos_module.sql
-- Módulo Empreendimentos (Incorporação): cadastro oficial do empreendimento como
-- entidade central que possui 1..N obras (projects). Hierarquia:
--   empreendimentos → empreendimento_towers (= obra) → empreendimento_units (pavimento = floor)
--   + empreendimento_common_areas (área comum / lazer)
-- Vínculo vivo com Imovib via empreendimentos.imovib_study_id (re-sync sob demanda).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabela raiz: empreendimentos
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.empreendimentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    status TEXT NOT NULL DEFAULT 'PLANEJAMENTO'
        CHECK (status IN ('PLANEJAMENTO','LANCAMENTO','EM_OBRAS','ENTREGUE','ENCERRADO')),

    -- Vínculo vivo com o estudo de viabilidade (Imovib)
    imovib_study_id UUID REFERENCES public.imovib_studies(id) ON DELETE SET NULL,
    last_synced_at TIMESTAMP WITH TIME ZONE,

    -- SPE (Sociedade de Propósito Específico)
    spe_razao_social TEXT,
    spe_cnpj TEXT,
    spe_nome_fantasia TEXT,

    -- Terreno
    terreno_street TEXT,
    terreno_number TEXT,
    terreno_complement TEXT,
    terreno_neighborhood TEXT,
    terreno_city TEXT,
    terreno_state TEXT,
    terreno_zip_code TEXT,
    terreno_area NUMERIC,
    terreno_frente NUMERIC,
    terreno_fundos NUMERIC,
    terreno_lateral_direita NUMERIC,
    terreno_lateral_esquerda NUMERIC,

    -- Comercial / incorporação
    vgv_total NUMERIC,
    developer_name TEXT,
    manager TEXT,
    launch_date DATE,
    expected_delivery_date DATE,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS empreendimentos_org_idx ON public.empreendimentos (organization_id);
CREATE INDEX IF NOT EXISTS empreendimentos_study_idx ON public.empreendimentos (imovib_study_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Torres / Blocos (= obra). project_id liga à obra (projects).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.empreendimento_towers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empreendimento_id UUID NOT NULL REFERENCES public.empreendimentos(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    imovib_block_id UUID, -- proveniência do estudo (sem FK, evita cascade)
    name TEXT NOT NULL,
    floors_count INTEGER,
    units_per_floor INTEGER,
    construction_cost_sqm NUMERIC,
    sales_price_sqm NUMERIC,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS empr_towers_empr_idx ON public.empreendimento_towers (empreendimento_id);
CREATE INDEX IF NOT EXISTS empr_towers_project_idx ON public.empreendimento_towers (project_id);
CREATE UNIQUE INDEX IF NOT EXISTS empr_towers_block_uidx
    ON public.empreendimento_towers (empreendimento_id, imovib_block_id)
    WHERE imovib_block_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Unidades (pavimento = floor)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.empreendimento_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tower_id UUID NOT NULL REFERENCES public.empreendimento_towers(id) ON DELETE CASCADE,
    imovib_unit_id UUID,     -- proveniência da tipologia (sem FK)
    imovib_instance_id UUID, -- proveniência da instância (sem FK)
    name TEXT NOT NULL,
    floor INTEGER,
    typology TEXT,
    private_area NUMERIC,
    common_area NUMERIC,
    total_area NUMERIC,
    bedrooms INTEGER,
    bathrooms INTEGER,
    parking_spaces INTEGER,
    position_type TEXT CHECK (position_type IN ('FRENTE','LATERAL','FUNDOS')),
    sun_orientation TEXT CHECK (sun_orientation IN ('NORTE','SUL','LESTE','OESTE')),
    price NUMERIC,
    status TEXT NOT NULL DEFAULT 'DISPONIVEL'
        CHECK (status IN ('DISPONIVEL','RESERVADO','PERMUTADO','VENDIDO')),
    is_vendavel BOOLEAN NOT NULL DEFAULT true,
    commercial_property_id UUID REFERENCES public.commercial_properties(id) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS empr_units_tower_idx ON public.empreendimento_units (tower_id);
CREATE UNIQUE INDEX IF NOT EXISTS empr_units_instance_uidx
    ON public.empreendimento_units (tower_id, imovib_instance_id)
    WHERE imovib_instance_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Áreas comuns / lazer
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.empreendimento_common_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empreendimento_id UUID NOT NULL REFERENCES public.empreendimentos(id) ON DELETE CASCADE,
    tower_id UUID REFERENCES public.empreendimento_towers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'COMUM'
        CHECK (category IN ('LAZER','COMUM','TECNICA','CIRCULACAO','GARAGEM','OUTRO')),
    area NUMERIC,
    floor INTEGER,
    description TEXT,
    is_vendavel BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS empr_common_areas_empr_idx ON public.empreendimento_common_areas (empreendimento_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Triggers de updated_at (função update_updated_at_column() já existe)
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at_empreendimentos ON public.empreendimentos;
CREATE TRIGGER set_updated_at_empreendimentos BEFORE UPDATE ON public.empreendimentos
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_empr_towers ON public.empreendimento_towers;
CREATE TRIGGER set_updated_at_empr_towers BEFORE UPDATE ON public.empreendimento_towers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_empr_units ON public.empreendimento_units;
CREATE TRIGGER set_updated_at_empr_units BEFORE UPDATE ON public.empreendimento_units
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_empr_common_areas ON public.empreendimento_common_areas;
CREATE TRIGGER set_updated_at_empr_common_areas BEFORE UPDATE ON public.empreendimento_common_areas
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.empreendimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empreendimento_towers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empreendimento_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empreendimento_common_areas ENABLE ROW LEVEL SECURITY;

-- 6.1 Raiz: acesso por organização
DROP POLICY IF EXISTS "org_access_empreendimentos" ON public.empreendimentos;
CREATE POLICY "org_access_empreendimentos" ON public.empreendimentos
    FOR ALL TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Allow anon all on empreendimentos" ON public.empreendimentos;
CREATE POLICY "Allow anon all on empreendimentos" ON public.empreendimentos
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- 6.2 Torres: EXISTS join ao empreendimento
DROP POLICY IF EXISTS "org_access_empr_towers" ON public.empreendimento_towers;
CREATE POLICY "org_access_empr_towers" ON public.empreendimento_towers
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.empreendimentos e
            WHERE e.id = empreendimento_towers.empreendimento_id
            AND e.organization_id IN (
                SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
            )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.empreendimentos e
            WHERE e.id = empreendimento_towers.empreendimento_id
            AND e.organization_id IN (
                SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Allow anon all on empr_towers" ON public.empreendimento_towers;
CREATE POLICY "Allow anon all on empr_towers" ON public.empreendimento_towers
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- 6.3 Unidades: EXISTS join (tower → empreendimento), dois hops
DROP POLICY IF EXISTS "org_access_empr_units" ON public.empreendimento_units;
CREATE POLICY "org_access_empr_units" ON public.empreendimento_units
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.empreendimento_towers t
            JOIN public.empreendimentos e ON e.id = t.empreendimento_id
            WHERE t.id = empreendimento_units.tower_id
            AND e.organization_id IN (
                SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
            )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.empreendimento_towers t
            JOIN public.empreendimentos e ON e.id = t.empreendimento_id
            WHERE t.id = empreendimento_units.tower_id
            AND e.organization_id IN (
                SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Allow anon all on empr_units" ON public.empreendimento_units;
CREATE POLICY "Allow anon all on empr_units" ON public.empreendimento_units
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- 6.4 Áreas comuns: EXISTS join ao empreendimento
DROP POLICY IF EXISTS "org_access_empr_common_areas" ON public.empreendimento_common_areas;
CREATE POLICY "org_access_empr_common_areas" ON public.empreendimento_common_areas
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.empreendimentos e
            WHERE e.id = empreendimento_common_areas.empreendimento_id
            AND e.organization_id IN (
                SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
            )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.empreendimentos e
            WHERE e.id = empreendimento_common_areas.empreendimento_id
            AND e.organization_id IN (
                SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Allow anon all on empr_common_areas" ON public.empreendimento_common_areas;
CREATE POLICY "Allow anon all on empr_common_areas" ON public.empreendimento_common_areas
    FOR ALL TO anon USING (true) WITH CHECK (true);
