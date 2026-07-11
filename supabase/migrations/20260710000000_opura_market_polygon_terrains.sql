-- ============================================================
-- Migration: 20260710000000_opura_market_polygon_terrains
-- Módulo: ÒPURA Market Intelligence
-- Suporte ao desenho de polígono de lote e cálculo de área PostGIS
-- ============================================================

-- 1. Adicionar coluna espacial de polígono na tabela de estudos de terrenos
ALTER TABLE public.opura_market_terrain_studies 
ADD COLUMN IF NOT EXISTS polygon_geom geometry(Polygon, 4326);

-- 2. Criar índice espacial GIST para a nova coluna
CREATE INDEX IF NOT EXISTS idx_opura_market_terrain_studies_polygon_geom 
ON public.opura_market_terrain_studies USING GIST (polygon_geom);

-- 3. Função SQL para calcular a área geodésica exata em m² a partir de GeoJSON
CREATE OR REPLACE FUNCTION public.calculate_polygon_area(p_polygon_geojson JSONB)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_geom geometry;
    v_area NUMERIC;
BEGIN
    -- Converte o geojson para geometria PostGIS
    v_geom := ST_GeomFromGeoJSON(p_polygon_geojson);
    
    -- Define o SRID do PostGIS como 4326 se não estiver definido
    IF ST_SRID(v_geom) = 0 THEN
        v_geom := ST_SetSRID(v_geom, 4326);
    END IF;
    
    -- Calcula a área geodésica exata do polígono usando geography (metros quadrados)
    v_area := ST_Area(v_geom::geography);
    
    RETURN ROUND(v_area::NUMERIC, 2);
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Erro ao calcular a área do polígono: %', SQLERRM;
        RETURN 0.0;
END;
$$;

-- 4. Permissões de execução para roles autenticadas e anon de desenvolvimento
GRANT EXECUTE ON FUNCTION public.calculate_polygon_area(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_polygon_area(JSONB) TO anon;
