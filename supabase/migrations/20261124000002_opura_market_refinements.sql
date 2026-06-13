-- Migração SQL: Fase 4 Refinamentos de Deduplicação e Histórico de Preços do ÒPURA Market Intelligence

-- 1. Adicionar coluna parent_listing_id para marcar duplicatas
ALTER TABLE public.opura_market_listings 
ADD COLUMN IF NOT EXISTS parent_listing_id UUID REFERENCES public.opura_market_listings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_opura_market_listings_parent ON public.opura_market_listings(parent_listing_id);

-- 2. Recriar RPC get_terrain_radius_statistics filtrando duplicados (parent_listing_id IS NULL)
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
        ST_DWithin(geom, v_point, p_radius_meters / 111000.0) -- graus para metros
        AND listing_status = 'active'
        AND parent_listing_id IS NULL; -- Filtra duplicatas
END;
$$;

-- 3. Criar a tabela de histórico de bairros
CREATE TABLE IF NOT EXISTS public.opura_market_neighborhood_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    neighborhood_id UUID NOT NULL REFERENCES public.opura_market_neighborhoods(id) ON DELETE CASCADE,
    recorded_date DATE NOT NULL,
    price_per_m2_medio NUMERIC(15,2) NOT NULL,
    ticket_medio NUMERIC(15,2) NOT NULL,
    competitors_count INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_neighborhood_date UNIQUE (neighborhood_id, recorded_date)
);

CREATE INDEX IF NOT EXISTS idx_market_neigh_history_neigh_date ON public.opura_market_neighborhood_history(neighborhood_id, recorded_date);

-- Habilitar RLS para o histórico
ALTER TABLE public.opura_market_neighborhood_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_select_market_neighborhood_history" ON public.opura_market_neighborhood_history;
CREATE POLICY "allow_select_market_neighborhood_history" ON public.opura_market_neighborhood_history
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow anon select on neighborhood_history" ON public.opura_market_neighborhood_history;
CREATE POLICY "Allow anon select on neighborhood_history" ON public.opura_market_neighborhood_history
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4. Função trigger para deduplicação automática
CREATE OR REPLACE FUNCTION public.fn_deduplicate_market_listing()
RETURNS TRIGGER AS $$
DECLARE
    v_parent_id UUID;
BEGIN
    -- Procura por uma listagem ativa na mesma cidade
    -- que esteja a menos de 30 metros de distância (0.00027 graus),
    -- com o mesmo número de dormitórios e variação de área privativa de até 2%
    SELECT id INTO v_parent_id
    FROM public.opura_market_listings
    WHERE 
        city_id = NEW.city_id
        AND listing_status = 'active'
        AND bedrooms = NEW.bedrooms
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
        AND ST_DWithin(geom, NEW.geom, 0.00027)
        AND (
            (NEW.area_private IS NOT NULL AND area_private IS NOT NULL AND ABS(area_private - NEW.area_private) / area_private <= 0.02)
            OR (NEW.area_private IS NULL AND area_private IS NULL)
        )
        AND parent_listing_id IS NULL -- Ignora outras duplicatas
    LIMIT 1;

    IF v_parent_id IS NOT NULL THEN
        NEW.parent_listing_id := v_parent_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deduplicate_market_listing ON public.opura_market_listings;
CREATE TRIGGER trg_deduplicate_market_listing
    BEFORE INSERT ON public.opura_market_listings
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_deduplicate_market_listing();

-- 5. Semeadura de histórico fictício de 6 meses para Cambuí
-- Centro
INSERT INTO public.opura_market_neighborhood_history (neighborhood_id, recorded_date, price_per_m2_medio, ticket_medio, competitors_count)
SELECT id, '2025-12-01'::DATE, 3700.00, 390000.00, 5 FROM public.opura_market_neighborhoods WHERE name = 'Centro' ON CONFLICT DO NOTHING;
INSERT INTO public.opura_market_neighborhood_history (neighborhood_id, recorded_date, price_per_m2_medio, ticket_medio, competitors_count)
SELECT id, '2026-01-01'::DATE, 3750.00, 395000.00, 6 FROM public.opura_market_neighborhoods WHERE name = 'Centro' ON CONFLICT DO NOTHING;
INSERT INTO public.opura_market_neighborhood_history (neighborhood_id, recorded_date, price_per_m2_medio, ticket_medio, competitors_count)
SELECT id, '2026-02-01'::DATE, 3800.00, 400000.00, 6 FROM public.opura_market_neighborhoods WHERE name = 'Centro' ON CONFLICT DO NOTHING;
INSERT INTO public.opura_market_neighborhood_history (neighborhood_id, recorded_date, price_per_m2_medio, ticket_medio, competitors_count)
SELECT id, '2026-03-01'::DATE, 3820.00, 410000.00, 7 FROM public.opura_market_neighborhoods WHERE name = 'Centro' ON CONFLICT DO NOTHING;
INSERT INTO public.opura_market_neighborhood_history (neighborhood_id, recorded_date, price_per_m2_medio, ticket_medio, competitors_count)
SELECT id, '2026-04-01'::DATE, 3870.00, 415000.00, 7 FROM public.opura_market_neighborhoods WHERE name = 'Centro' ON CONFLICT DO NOTHING;
INSERT INTO public.opura_market_neighborhood_history (neighborhood_id, recorded_date, price_per_m2_medio, ticket_medio, competitors_count)
SELECT id, '2026-05-01'::DATE, 3950.00, 420000.00, 8 FROM public.opura_market_neighborhoods WHERE name = 'Centro' ON CONFLICT DO NOTHING;

-- Jardim das Colinas
INSERT INTO public.opura_market_neighborhood_history (neighborhood_id, recorded_date, price_per_m2_medio, ticket_medio, competitors_count)
SELECT id, '2025-12-01'::DATE, 4800.00, 520000.00, 2 FROM public.opura_market_neighborhoods WHERE name = 'Jardim das Colinas' ON CONFLICT DO NOTHING;
INSERT INTO public.opura_market_neighborhood_history (neighborhood_id, recorded_date, price_per_m2_medio, ticket_medio, competitors_count)
SELECT id, '2026-01-01'::DATE, 4900.00, 530000.00, 2 FROM public.opura_market_neighborhoods WHERE name = 'Jardim das Colinas' ON CONFLICT DO NOTHING;
INSERT INTO public.opura_market_neighborhood_history (neighborhood_id, recorded_date, price_per_m2_medio, ticket_medio, competitors_count)
SELECT id, '2026-02-01'::DATE, 4950.00, 535000.00, 3 FROM public.opura_market_neighborhoods WHERE name = 'Jardim das Colinas' ON CONFLICT DO NOTHING;
INSERT INTO public.opura_market_neighborhood_history (neighborhood_id, recorded_date, price_per_m2_medio, ticket_medio, competitors_count)
SELECT id, '2026-03-01'::DATE, 5000.00, 550000.00, 3 FROM public.opura_market_neighborhoods WHERE name = 'Jardim das Colinas' ON CONFLICT DO NOTHING;
INSERT INTO public.opura_market_neighborhood_history (neighborhood_id, recorded_date, price_per_m2_medio, ticket_medio, competitors_count)
SELECT id, '2026-04-01'::DATE, 5100.00, 560000.00, 4 FROM public.opura_market_neighborhoods WHERE name = 'Jardim das Colinas' ON CONFLICT DO NOTHING;
INSERT INTO public.opura_market_neighborhood_history (neighborhood_id, recorded_date, price_per_m2_medio, ticket_medio, competitors_count)
SELECT id, '2026-05-01'::DATE, 5150.00, 570000.00, 4 FROM public.opura_market_neighborhoods WHERE name = 'Jardim das Colinas' ON CONFLICT DO NOTHING;

-- Vila Santo Antônio
INSERT INTO public.opura_market_neighborhood_history (neighborhood_id, recorded_date, price_per_m2_medio, ticket_medio, competitors_count)
SELECT id, '2025-12-01'::DATE, 2900.00, 280000.00, 1 FROM public.opura_market_neighborhoods WHERE name = 'Vila Santo Antônio' ON CONFLICT DO NOTHING;
INSERT INTO public.opura_market_neighborhood_history (neighborhood_id, recorded_date, price_per_m2_medio, ticket_medio, competitors_count)
SELECT id, '2026-01-01'::DATE, 2920.00, 285000.00, 1 FROM public.opura_market_neighborhoods WHERE name = 'Vila Santo Antônio' ON CONFLICT DO NOTHING;
INSERT INTO public.opura_market_neighborhood_history (neighborhood_id, recorded_date, price_per_m2_medio, ticket_medio, competitors_count)
SELECT id, '2026-02-01'::DATE, 2950.00, 290000.00, 1 FROM public.opura_market_neighborhoods WHERE name = 'Vila Santo Antônio' ON CONFLICT DO NOTHING;
INSERT INTO public.opura_market_neighborhood_history (neighborhood_id, recorded_date, price_per_m2_medio, ticket_medio, competitors_count)
SELECT id, '2026-03-01'::DATE, 2980.00, 295000.00, 2 FROM public.opura_market_neighborhoods WHERE name = 'Vila Santo Antônio' ON CONFLICT DO NOTHING;
INSERT INTO public.opura_market_neighborhood_history (neighborhood_id, recorded_date, price_per_m2_medio, ticket_medio, competitors_count)
SELECT id, '2026-04-01'::DATE, 3050.00, 310000.00, 2 FROM public.opura_market_neighborhoods WHERE name = 'Vila Santo Antônio' ON CONFLICT DO NOTHING;
INSERT INTO public.opura_market_neighborhood_history (neighborhood_id, recorded_date, price_per_m2_medio, ticket_medio, competitors_count)
SELECT id, '2026-05-01'::DATE, 3100.00, 315000.00, 2 FROM public.opura_market_neighborhoods WHERE name = 'Vila Santo Antônio' ON CONFLICT DO NOTHING;
