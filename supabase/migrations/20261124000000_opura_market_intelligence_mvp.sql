-- Habilita a extensão PostGIS para georreferenciamento e operações espaciais
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Tabelas Globais (Dados Compartilhados do Mercado)

-- Cidades Monitoradas
CREATE TABLE IF NOT EXISTS public.opura_market_cities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    state VARCHAR(2) NOT NULL,
    country VARCHAR(100) NOT NULL DEFAULT 'Brasil',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_city_state UNIQUE (name, state)
);

-- Bairros Monitorados (DNA do Bairro)
CREATE TABLE IF NOT EXISTS public.opura_market_neighborhoods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id UUID NOT NULL REFERENCES public.opura_market_cities(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    
    -- Dados Consolidados (DNA do Bairro - Calculado periodicamente)
    bairro_score NUMERIC(5,2) DEFAULT 0.0,
    ticket_medio NUMERIC(15,2) DEFAULT 0.0,
    price_per_m2_medio NUMERIC(15,2) DEFAULT 0.0,
    area_media NUMERIC(10,2) DEFAULT 0.0,
    dominant_typology VARCHAR(100),
    predominant_standard VARCHAR(50), -- Econômico, Médio, Médio-Alto, Alto Padrão, Luxo
    saturation_level VARCHAR(50), -- Escassez, Saudável, Atenção, Saturado
    potential_score NUMERIC(5,2) DEFAULT 0.0,
    competitors_count INT DEFAULT 0,
    
    -- Representação Geográfica (Polígono ou Limites do Bairro)
    geom geometry(Geometry, 4326),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_neighborhood_city UNIQUE (city_id, name)
);

-- Anúncios/Imóveis Individuais (Capturas do Scraper)
CREATE TABLE IF NOT EXISTS public.opura_market_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id UUID NOT NULL REFERENCES public.opura_market_cities(id),
    neighborhood_id UUID REFERENCES public.opura_market_neighborhoods(id),
    source VARCHAR(100) NOT NULL, -- Ex: 'ZAP', 'OLX', 'Parceiro_X'
    source_url TEXT,
    property_type VARCHAR(100) NOT NULL, -- Ex: 'Apartamento', 'Casa', 'Terreno'
    
    -- Dados Físicos
    address TEXT,
    zip_code VARCHAR(20),
    area_private NUMERIC(10,2),
    area_total NUMERIC(10,2),
    bedrooms INT DEFAULT 0,
    suites INT DEFAULT 0,
    bathrooms INT DEFAULT 0,
    parking_spaces INT DEFAULT 0,
    
    -- Dados Financeiros
    price NUMERIC(15,2) NOT NULL,
    price_per_m2 NUMERIC(15,2) GENERATED ALWAYS AS (
        CASE WHEN area_private > 0 THEN price / area_private ELSE NULL END
    ) STORED,
    condo_fee NUMERIC(12,2),
    iptu NUMERIC(12,2),
    
    -- Georreferenciamento (Coordenadas Espaciais)
    geom geometry(Point, 4326),
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    
    -- Metadados
    description TEXT,
    construction_standard VARCHAR(50), -- IA classificado: Econômico, Médio, Luxo, etc.
    listing_status VARCHAR(50) DEFAULT 'active', -- active, inactive, sold
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Empreendimentos Mapeados (Lançamentos de Incorporadoras)
CREATE TABLE IF NOT EXISTS public.opura_market_developments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id UUID NOT NULL REFERENCES public.opura_market_cities(id),
    neighborhood_id UUID REFERENCES public.opura_market_neighborhoods(id),
    name VARCHAR(255) NOT NULL,
    developer VARCHAR(255) NOT NULL, -- Incorporadora/Construtora
    address TEXT,
    units_total INT DEFAULT 0,
    area_average NUMERIC(10,2),
    ticket_average NUMERIC(15,2),
    price_per_m2_average NUMERIC(15,2),
    construction_standard VARCHAR(50),
    launch_date DATE,
    status VARCHAR(50) DEFAULT 'lancamento', -- lancamento, construcao, pronto
    geom geometry(Point, 4326),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabelas Privadas (Dados de Análise das Organizações - RLS Ativo)

-- Estudos de Terrenos do Usuário (Nível 4 - O que construir aqui?)
CREATE TABLE IF NOT EXISTS public.opura_market_terrain_studies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL, -- Amarrado à Regra 1 e RLS
    name VARCHAR(255) NOT NULL,
    address TEXT,
    
    -- Parâmetros do Terreno
    terrain_area NUMERIC(10,2) NOT NULL,
    coefficients_zone JSONB, -- Zoneamento selecionado (ex: Coeficiente de Aproveitamento)
    
    -- Raio de Análise Selecionado pelo usuário
    analysis_radius_meters INT DEFAULT 1000, -- 500, 1000, 3000, 5000
    
    -- Localização
    geom geometry(Point, 4326) NOT NULL,
    latitude NUMERIC(10, 8) NOT NULL,
    longitude NUMERIC(11, 8) NOT NULL,
    
    -- Resultados IA e Recomendações
    recommended_product_mix JSONB, -- Ex: {"tipologias": [{"tipo": "2D", "area": 65, "mix": 60}], "ticket_sugerido": 450000}
    recommended_standard VARCHAR(50),
    estimated_vgv NUMERIC(15,2),
    estimated_absorption_velocity NUMERIC(5,2), -- % de vendas ao mês
    risk_score NUMERIC(5,2),
    
    created_by VARCHAR(255) NOT NULL, -- E-mail do criador
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ocorrências de monitoramento de concorrência
CREATE TABLE IF NOT EXISTS public.opura_market_monitored_competitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    study_id UUID NOT NULL REFERENCES public.opura_market_terrain_studies(id) ON DELETE CASCADE,
    development_id UUID REFERENCES public.opura_market_developments(id),
    listing_id UUID REFERENCES public.opura_market_listings(id),
    custom_name VARCHAR(255),
    custom_price NUMERIC(15,2),
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Índices (Crítico para PostGIS Performance)
CREATE INDEX IF NOT EXISTS idx_opura_market_listings_geom ON public.opura_market_listings USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_opura_market_developments_geom ON public.opura_market_developments USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_opura_market_terrain_studies_geom ON public.opura_market_terrain_studies USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_opura_market_neighborhoods_geom ON public.opura_market_neighborhoods USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_opura_market_listings_city_neighborhood ON public.opura_market_listings (city_id, neighborhood_id);
CREATE INDEX IF NOT EXISTS idx_opura_market_listings_standard ON public.opura_market_listings (construction_standard);

-- 4. RLS - Row Level Security (Regra 2)

ALTER TABLE public.opura_market_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opura_market_neighborhoods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opura_market_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opura_market_developments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opura_market_terrain_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opura_market_monitored_competitors ENABLE ROW LEVEL SECURITY;

-- Políticas para Dados de Mercado Globais (Leitura livre para usuários logados)
DROP POLICY IF EXISTS "allow_select_market_cities" ON public.opura_market_cities;
CREATE POLICY "allow_select_market_cities" ON public.opura_market_cities
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "allow_select_market_neighborhoods" ON public.opura_market_neighborhoods;
CREATE POLICY "allow_select_market_neighborhoods" ON public.opura_market_neighborhoods
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "allow_select_market_listings" ON public.opura_market_listings;
CREATE POLICY "allow_select_market_listings" ON public.opura_market_listings
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "allow_select_market_developments" ON public.opura_market_developments;
CREATE POLICY "allow_select_market_developments" ON public.opura_market_developments
    FOR SELECT TO authenticated USING (true);

-- Políticas RLS para Dados Privados de Organizações (Isolamento Multi-tenant estrito)
DROP POLICY IF EXISTS "org_access_terrain_studies" ON public.opura_market_terrain_studies;
CREATE POLICY "org_access_terrain_studies" ON public.opura_market_terrain_studies
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

DROP POLICY IF EXISTS "org_access_monitored_competitors" ON public.opura_market_monitored_competitors;
CREATE POLICY "org_access_monitored_competitors" ON public.opura_market_monitored_competitors
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

-- 5. Políticas de Desenvolvimento (Regra 8 — Políticas Anon)
DROP POLICY IF EXISTS "Allow anon select on cities" ON public.opura_market_cities;
CREATE POLICY "Allow anon select on cities" ON public.opura_market_cities FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon select on neighborhoods" ON public.opura_market_neighborhoods;
CREATE POLICY "Allow anon select on neighborhoods" ON public.opura_market_neighborhoods FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon select on listings" ON public.opura_market_listings;
CREATE POLICY "Allow anon select on listings" ON public.opura_market_listings FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon select on developments" ON public.opura_market_developments;
CREATE POLICY "Allow anon select on developments" ON public.opura_market_developments FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon select on terrain_studies" ON public.opura_market_terrain_studies;
CREATE POLICY "Allow anon select on terrain_studies" ON public.opura_market_terrain_studies FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon select on monitored_competitors" ON public.opura_market_monitored_competitors;
CREATE POLICY "Allow anon select on monitored_competitors" ON public.opura_market_monitored_competitors FOR ALL TO anon USING (true) WITH CHECK (true);

-- 6. Função SQL para Busca Espacial de Raio (Nível 3 e Nível 4)
CREATE OR REPLACE FUNCTION public.get_terrain_radius_statistics(
    p_latitude NUMERIC,
    p_longitude NUMERIC,
    p_radius_meters INT
)
RETURNS TABLE (
    total_listings INT,
    price_per_m2_avg NUMERIC,
    ticket_avg NUMERIC,
    area_avg NUMERIC,
    bedrooms_avg NUMERIC,
    suites_avg NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_point geometry;
BEGIN
    -- Converte as coordenadas do parâmetro para um ponto PostGIS (SRID 4326)
    v_point := ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326);
    
    RETURN QUERY
    SELECT 
        COALESCE(COUNT(id)::INT, 0) as total_listings,
        COALESCE(ROUND(AVG(price_per_m2), 2), 0.0) as price_per_m2_avg,
        COALESCE(ROUND(AVG(price), 2), 0.0) as ticket_avg,
        COALESCE(ROUND(AVG(area_private), 2), 0.0) as area_avg,
        COALESCE(ROUND(AVG(bedrooms), 1), 0.0) as bedrooms_avg,
        COALESCE(ROUND(AVG(suites), 1), 0.0) as suites_avg
    FROM 
        public.opura_market_listings
    WHERE 
        ST_DWithin(geom::geography, v_point::geography, p_radius_meters)
        AND listing_status = 'active';
END;
$$;

-- Seed de Dados do Piloto (Cambuí - MG)

-- 1. Inserir Cidade
INSERT INTO public.opura_market_cities (name, state, country, is_active)
VALUES ('Cambuí', 'MG', 'Brasil', true)
ON CONFLICT (name, state) DO NOTHING;

-- 2. Inserir Bairros de Cambuí
DO $$
DECLARE
    v_city_id UUID;
    v_centro_id UUID;
    v_colinas_id UUID;
    v_santo_antonio_id UUID;
    v_por_do_sol_id UUID;
BEGIN
    SELECT id INTO v_city_id FROM public.opura_market_cities WHERE name = 'Cambuí' AND state = 'MG';
    
    IF v_city_id IS NOT NULL THEN
        -- Centro
        INSERT INTO public.opura_market_neighborhoods (city_id, name, bairro_score, ticket_medio, price_per_m2_medio, area_media, dominant_typology, predominant_standard, saturation_level, potential_score, competitors_count, geom)
        VALUES (v_city_id, 'Centro', 85.00, 315000.00, 4200.00, 75.00, 'Residencial Vertical', 'Médio-Alto', 'Saudável', 78.00, 5, ST_SetSRID(ST_MakePoint(-46.0580, -22.6120), 4326))
        ON CONFLICT (city_id, name) DO NOTHING;
        
        -- Jardim das Colinas
        INSERT INTO public.opura_market_neighborhoods (city_id, name, bairro_score, ticket_medio, price_per_m2_medio, area_media, dominant_typology, predominant_standard, saturation_level, potential_score, competitors_count, geom)
        VALUES (v_city_id, 'Jardim das Colinas', 92.00, 864000.00, 4800.00, 180.00, 'Residencial Horizontal', 'Alto Padrão', 'Escassez', 90.00, 3, ST_SetSRID(ST_MakePoint(-46.0510, -22.6070), 4326))
        ON CONFLICT (city_id, name) DO NOTHING;
        
        -- Vila Santo Antônio
        INSERT INTO public.opura_market_neighborhoods (city_id, name, bairro_score, ticket_medio, price_per_m2_medio, area_media, dominant_typology, predominant_standard, saturation_level, potential_score, competitors_count, geom)
        VALUES (v_city_id, 'Vila Santo Antônio', 64.00, 174000.00, 2900.00, 60.00, 'Residencial Horizontal', 'Econômico', 'Saturado', 55.00, 8, ST_SetSRID(ST_MakePoint(-46.0650, -22.6190), 4326))
        ON CONFLICT (city_id, name) DO NOTHING;
        
        -- Jardim Pôr do Sol
        INSERT INTO public.opura_market_neighborhoods (city_id, name, bairro_score, ticket_medio, price_per_m2_medio, area_media, dominant_typology, predominant_standard, saturation_level, potential_score, competitors_count, geom)
        VALUES (v_city_id, 'Jardim Pôr do Sol', 76.00, 324000.00, 3600.00, 90.00, 'Residencial Vertical', 'Médio', 'Atenção', 72.00, 4, ST_SetSRID(ST_MakePoint(-46.0500, -22.6150), 4326))
        ON CONFLICT (city_id, name) DO NOTHING;

        -- Buscar ids dos bairros inseridos
        SELECT id INTO v_centro_id FROM public.opura_market_neighborhoods WHERE city_id = v_city_id AND name = 'Centro';
        SELECT id INTO v_colinas_id FROM public.opura_market_neighborhoods WHERE city_id = v_city_id AND name = 'Jardim das Colinas';
        SELECT id INTO v_santo_antonio_id FROM public.opura_market_neighborhoods WHERE city_id = v_city_id AND name = 'Vila Santo Antônio';

        -- 3. Inserir Anúncios Fictícios para testar a RPC de busca espacial
        IF NOT EXISTS (SELECT 1 FROM public.opura_market_listings WHERE city_id = v_city_id) THEN
            -- Centro
            INSERT INTO public.opura_market_listings (city_id, neighborhood_id, source, property_type, area_private, price, bedrooms, suites, bathrooms, construction_standard, latitude, longitude, geom, listing_status)
            VALUES 
            (v_city_id, v_centro_id, 'ZAP', 'Apartamento', 70.00, 310000.00, 2, 1, 2, 'Médio', -22.6122, -46.0575, ST_SetSRID(ST_MakePoint(-46.0575, -22.6122), 4326), 'active'),
            (v_city_id, v_centro_id, 'ZAP', 'Apartamento', 85.00, 390000.00, 3, 1, 2, 'Médio-Alto', -22.6130, -46.0590, ST_SetSRID(ST_MakePoint(-46.0590, -22.6130), 4326), 'active'),
            (v_city_id, v_centro_id, 'VivaReal', 'Apartamento', 110.00, 520000.00, 3, 2, 3, 'Alto Padrão', -22.6110, -46.0560, ST_SetSRID(ST_MakePoint(-46.0560, -22.6110), 4326), 'active');
            
            -- Jardim das Colinas
            INSERT INTO public.opura_market_listings (city_id, neighborhood_id, source, property_type, area_private, price, bedrooms, suites, bathrooms, construction_standard, latitude, longitude, geom, listing_status)
            VALUES 
            (v_city_id, v_colinas_id, 'OLX', 'Casa', 160.00, 780000.00, 3, 2, 3, 'Alto Padrão', -22.6065, -46.0515, ST_SetSRID(ST_MakePoint(-46.0515, -22.6065), 4326), 'active'),
            (v_city_id, v_colinas_id, 'ZAP', 'Casa', 220.00, 1050000.00, 4, 3, 5, 'Luxo', -22.6075, -46.0505, ST_SetSRID(ST_MakePoint(-46.0505, -22.6075), 4326), 'active');
            
            -- Vila Santo Antônio
            INSERT INTO public.opura_market_listings (city_id, neighborhood_id, source, property_type, area_private, price, bedrooms, suites, bathrooms, construction_standard, latitude, longitude, geom, listing_status)
            VALUES 
            (v_city_id, v_santo_antonio_id, 'OLX', 'Casa', 55.00, 165000.00, 2, 0, 1, 'Econômico', -22.6195, -46.0645, ST_SetSRID(ST_MakePoint(-46.0645, -22.6195), 4326), 'active');
        END IF;
    END IF;
END $$;
