-- ============================================================================
-- ÒPURA Market Intelligence — Fase 4 (tirar Cambuí do código, cadastro de praça,
-- DNA do bairro) + correção de duplicados por ponto aproximado
-- Plano: docs/planos/2026-10-07-opura-market-intelligence.md, itens 4.1, 4.4, 4.5
--
-- 1. PRECISÃO "rua" E DUPLICADOS SÓ COM POSIÇÃO PRECISA (defeito da Fase 3)
--    Medido em 07/10/2026: os 52 anúncios marcados geo_precision = 'endereco'
--    não têm número no endereço — a posição é a da RUA, não a do imóvel. E o
--    gatilho de duplicados (30 m + mesmos quartos + área ±2 %) juntou imóveis
--    diferentes que dividem o mesmo ponto aproximado: dos 60 vínculos de
--    duplicado, 54 eram pares no MESMO ponto (42 de rua, 12 de bairro), 22 com
--    preço diferente; os outros 6 vinham da época das coordenadas sorteadas.
--    Agora:
--      • 'endereco' = o número foi achado; 'rua' = só a rua (nova);
--      • os 52 'endereco' viram 'rua';
--      • o gatilho só compara posições precisas ('fonte' ou 'endereco');
--      • os 60 vínculos apoiados em ponto aproximado são desfeitos
--        (reversão: motivo 'duplicado_por_ponto_aproximado').
--
-- 2. COORDENADAS LEGÍVEIS (4.1). O PostgREST devolve geometry como WKB
--    hexadecimal e a tela nunca lia o geom dos bairros: desenhava os 4 bairros
--    de Cambuí por coordenadas escritas no código, POR NOME. Agora:
--      • opura_market_neighborhoods.centroid_lat/centroid_lng (geradas do geom);
--      • opura_market_cities.center_lat/center_lng (onde o mapa abre); Cambuí
--        recebe o centro dos seus bairros.
--
-- 3. CADASTRO DE PRAÇA (4.4, decisão D4). Cidades e bairros são GLOBAIS (sem
--    organization_id, lidos por todos). Quem pode criar e editar é o
--    SUPERADMINISTRADOR da plataforma (public.is_superadmin(), tabela
--    public.superadmins) — administrador de organização não, porque mexeria
--    nos dados de todas as organizações. Sem DELETE (bairro tem anúncios).
--
-- 4. VÍNCULO AUTOMÁTICO DE BAIRRO. Ao criar ou renomear um bairro (ou mudar o
--    ponto), os anúncios da cidade SEM bairro cujo nome de origem casa EXATO
--    (sem acento e caixa) passam a apontar para ele; e os que estavam sem
--    coordenada ganham o ponto do bairro como posição APROXIMADA
--    (geo_precision = 'bairro'). Função SECURITY DEFINER: anúncio é por
--    organização, e o vínculo por nome vale para todas.
--
-- 5. DNA DO BAIRRO NA LEITURA (4.5, decisão D6). Duas funções SECURITY INVOKER:
--    get_market_neighborhood_stats(city) e get_market_neighborhood_series(bairro).
--    Agregam só o que a RLS libera a quem chama (globais + própria organização)
--    — sem cron e sem gravar na tabela de bairros, que é global.
--
-- REGRA #7
--   Pergunta 1: as policies novas (INSERT/UPDATE de cidades e bairros) têm uma
--     única perna: is_superadmin(). Nenhum OR.
--   Pergunta 2: fn_opura_market_vincular_bairro é SECURITY DEFINER e função de
--     GATILHO: REVOKE de PUBLIC, anon e authenticated (o privilégio só é
--     conferido ao criar o gatilho). As duas RPCs são SECURITY INVOKER, com
--     REVOKE de PUBLIC/anon e GRANT a authenticated.
--
-- ⚠️ APLICAR À MÃO: npx supabase db query --linked -f <este arquivo>. NUNCA db push.
-- ⚠️ Idempotente: IF NOT EXISTS, constraint recriada, CREATE OR REPLACE,
--    DROP POLICY/TRIGGER IF EXISTS, UPDATEs condicionais.
-- ============================================================================

SET lock_timeout = '5s';

-- ── 1. Precisão "rua" e duplicados só com posição precisa ───────────────────
ALTER TABLE public.opura_market_listings DROP CONSTRAINT IF EXISTS opura_market_listings_geo_precision_chk;
ALTER TABLE public.opura_market_listings
    ADD CONSTRAINT opura_market_listings_geo_precision_chk
    CHECK (geo_precision IS NULL OR geo_precision IN ('fonte', 'endereco', 'rua', 'bairro', 'nao_encontrado'));

COMMENT ON COLUMN public.opura_market_listings.geo_precision IS
  'De onde veio a coordenada: fonte (o feed informou), endereco (rua + NÚMERO achados), rua (só a rua), bairro (só o bairro), nao_encontrado. NULL sem coordenada = pendente. Só fonte/endereco servem para detectar duplicado.';

UPDATE public.opura_market_listings
   SET geo_precision = 'rua'
 WHERE geo_precision = 'endereco'
   AND address !~ '[0-9]';

ALTER TABLE public.opura_market_listings_reparo_20271007
    ADD COLUMN IF NOT EXISTS parent_listing_id_antes uuid;

INSERT INTO public.opura_market_listings_reparo_20271007 (listing_id, motivo, parent_listing_id_antes)
SELECT c.id, 'duplicado_por_ponto_aproximado', c.parent_listing_id
  FROM public.opura_market_listings c
  LEFT JOIN public.opura_market_listings p ON p.id = c.parent_listing_id
 WHERE c.parent_listing_id IS NOT NULL
   AND (c.geo_precision IS NULL OR c.geo_precision NOT IN ('fonte', 'endereco')
        OR p.geo_precision IS NULL OR p.geo_precision NOT IN ('fonte', 'endereco'))
ON CONFLICT (listing_id, motivo) DO NOTHING;

UPDATE public.opura_market_listings l
   SET parent_listing_id = NULL
  FROM public.opura_market_listings_reparo_20271007 r
 WHERE r.listing_id = l.id
   AND r.motivo = 'duplicado_por_ponto_aproximado'
   AND l.parent_listing_id IS NOT DISTINCT FROM r.parent_listing_id_antes;

CREATE OR REPLACE FUNCTION public.fn_deduplicate_market_listing()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_parent_id uuid;
BEGIN
    -- Só posição precisa identifica o MESMO imóvel. Ponto de rua ou de bairro é
    -- dividido por imóveis diferentes (Fase 4: 54 vínculos errados por isso).
    IF NEW.geom IS NULL OR NEW.geo_precision IS NULL OR NEW.geo_precision NOT IN ('fonte', 'endereco') THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND (OLD.geom IS NOT NULL OR NEW.parent_listing_id IS NOT NULL) THEN
        RETURN NEW;   -- só quando GANHA a primeira coordenada, e se ainda não é filho
    END IF;

    SELECT l.id INTO v_parent_id
    FROM public.opura_market_listings l
    WHERE l.city_id = NEW.city_id
      AND l.organization_id IS NOT DISTINCT FROM NEW.organization_id
      AND l.listing_status = 'active'
      AND l.bedrooms = NEW.bedrooms
      AND l.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND l.parent_listing_id IS NULL
      AND l.geom IS NOT NULL
      AND l.geo_precision IN ('fonte', 'endereco')
      AND ST_DWithin(l.geom::geography, NEW.geom::geography, 30)
      AND (
            (NEW.area_private IS NOT NULL AND l.area_private IS NOT NULL
             AND ABS(l.area_private - NEW.area_private) / NULLIF(GREATEST(l.area_private, NEW.area_private), 0) <= 0.02)
         OR (NEW.area_private IS NULL AND l.area_private IS NULL)
         OR (NEW.area_private = 0 AND l.area_private = 0)
      )
    LIMIT 1;

    IF v_parent_id IS NOT NULL THEN
        NEW.parent_listing_id := v_parent_id;
    END IF;

    RETURN NEW;
END;
$function$;

-- Mesmo gatilho de antes (INSERT ou UPDATE OF geom); a precisão é lida no corpo.
DROP TRIGGER IF EXISTS trg_deduplicate_market_listing ON public.opura_market_listings;
CREATE TRIGGER trg_deduplicate_market_listing
    BEFORE INSERT OR UPDATE OF geom ON public.opura_market_listings
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_deduplicate_market_listing();

-- ── 2. Coordenadas legíveis ─────────────────────────────────────────────────
ALTER TABLE public.opura_market_neighborhoods
    ADD COLUMN IF NOT EXISTS centroid_lat double precision GENERATED ALWAYS AS (ST_Y(ST_Centroid(geom))) STORED,
    ADD COLUMN IF NOT EXISTS centroid_lng double precision GENERATED ALWAYS AS (ST_X(ST_Centroid(geom))) STORED;

ALTER TABLE public.opura_market_cities
    ADD COLUMN IF NOT EXISTS center_lat double precision,
    ADD COLUMN IF NOT EXISTS center_lng double precision;

COMMENT ON COLUMN public.opura_market_cities.center_lat IS 'Onde o mapa abre quando a cidade é escolhida. Marcado no cadastro de praça.';

UPDATE public.opura_market_cities c
   SET center_lat = x.lat, center_lng = x.lng
  FROM (
        SELECT n.city_id, ST_Y(ST_Centroid(ST_Collect(n.geom))) AS lat, ST_X(ST_Centroid(ST_Collect(n.geom))) AS lng
          FROM public.opura_market_neighborhoods n
         WHERE n.geom IS NOT NULL
         GROUP BY n.city_id
       ) x
 WHERE x.city_id = c.id
   AND c.center_lat IS NULL;

-- ── 3. Cadastro de praça: só o superadministrador da plataforma ─────────────
DROP POLICY IF EXISTS "market_cities_insert_superadmin" ON public.opura_market_cities;
CREATE POLICY "market_cities_insert_superadmin" ON public.opura_market_cities
    FOR INSERT TO authenticated WITH CHECK (public.is_superadmin());
DROP POLICY IF EXISTS "market_cities_update_superadmin" ON public.opura_market_cities;
CREATE POLICY "market_cities_update_superadmin" ON public.opura_market_cities
    FOR UPDATE TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS "market_neighborhoods_insert_superadmin" ON public.opura_market_neighborhoods;
CREATE POLICY "market_neighborhoods_insert_superadmin" ON public.opura_market_neighborhoods
    FOR INSERT TO authenticated WITH CHECK (public.is_superadmin());
DROP POLICY IF EXISTS "market_neighborhoods_update_superadmin" ON public.opura_market_neighborhoods;
CREATE POLICY "market_neighborhoods_update_superadmin" ON public.opura_market_neighborhoods
    FOR UPDATE TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- ── 4. Vínculo automático de bairro ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_opura_market_vincular_bairro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    UPDATE public.opura_market_listings l
       SET neighborhood_id = NEW.id
     WHERE l.city_id = NEW.city_id
       AND l.neighborhood_id IS NULL
       AND l.neighborhood_name_raw IS NOT NULL
       AND lower(unaccent(trim(l.neighborhood_name_raw))) = lower(unaccent(trim(NEW.name)));

    IF NEW.geom IS NOT NULL THEN
        UPDATE public.opura_market_listings l
           SET latitude = ST_Y(ST_Centroid(NEW.geom)),
               longitude = ST_X(ST_Centroid(NEW.geom)),
               geom = ST_SetSRID(ST_Centroid(NEW.geom), 4326),
               geo_precision = 'bairro'
         WHERE l.neighborhood_id = NEW.id
           AND l.geom IS NULL
           AND (l.geo_precision IS NULL OR l.geo_precision = 'nao_encontrado');
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_opura_market_vincular_bairro() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_opura_market_vincular_bairro ON public.opura_market_neighborhoods;
CREATE TRIGGER trg_opura_market_vincular_bairro
    AFTER INSERT OR UPDATE OF name, geom ON public.opura_market_neighborhoods
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_opura_market_vincular_bairro();

-- ── 5. DNA do bairro na leitura ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_market_neighborhood_stats(p_city_id uuid)
RETURNS TABLE (
    neighborhood_id   uuid,
    total             integer,
    price_per_m2_avg  numeric,
    ticket_avg        numeric,
    area_avg          numeric,
    tipologia         text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
    SELECT l.neighborhood_id,
           COUNT(*)::integer,
           ROUND(AVG(l.price_per_m2), 2),
           ROUND(AVG(l.price), 2),
           ROUND(AVG(l.area_private), 2),
           mode() WITHIN GROUP (ORDER BY l.property_type || CASE WHEN l.bedrooms > 0 THEN ' ' || l.bedrooms || ' dorm.' ELSE '' END)
      FROM public.opura_market_listings l
     WHERE l.city_id = p_city_id
       AND l.neighborhood_id IS NOT NULL
       AND l.listing_status = 'active'
       AND l.parent_listing_id IS NULL
     GROUP BY l.neighborhood_id;
$function$;

COMMENT ON FUNCTION public.get_market_neighborhood_stats(uuid) IS
  'ÒPURA Market: DNA do bairro calculado na leitura, por bairro da cidade. SECURITY INVOKER: só agrega o que a RLS libera a quem chama.';
REVOKE EXECUTE ON FUNCTION public.get_market_neighborhood_stats(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_market_neighborhood_stats(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_market_neighborhood_series(p_neighborhood_id uuid)
RETURNS TABLE (
    mes              date,
    price_per_m2_avg numeric,
    total            integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
    SELECT date_trunc('month', l.captured_at)::date,
           ROUND(AVG(l.price_per_m2), 2),
           COUNT(*)::integer
      FROM public.opura_market_listings l
     WHERE l.neighborhood_id = p_neighborhood_id
       AND l.parent_listing_id IS NULL
       AND l.price_per_m2 IS NOT NULL
     GROUP BY 1
     ORDER BY 1;
$function$;

COMMENT ON FUNCTION public.get_market_neighborhood_series(uuid) IS
  'ÒPURA Market: preço por m² ofertado no bairro, mês a mês pela data de captura. SECURITY INVOKER.';
REVOKE EXECUTE ON FUNCTION public.get_market_neighborhood_series(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_market_neighborhood_series(uuid) TO authenticated;

RESET lock_timeout;
