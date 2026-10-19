-- ============================================================================
-- aplicar_20271019900000_opura_market_media_por_tipo
-- ÒPURA Market — as médias de preço passam a respeitar o tipo de imóvel.
-- Plano: docs/planos/2026-10-19-opura-market-media-por-tipo.md, item 1.
--
-- APLICAR COM `npx supabase db query --linked -f` (nunca `db push`). Idempotente.
--
-- O DEFEITO: as quatro RPCs abaixo faziam AVG(price_per_m2) sobre todos os
-- anúncios. Terreno (R$ 385/m², 6.209 m² de área média em Cambuí) entrava na
-- mesma média de casa e apartamento (R$ 6–7,7 mil/m²). No raio de 2 km do
-- Centro: R$ 4.218/m² com terreno, R$ 4.947/m² sem. Essa média é o preço do VGV
-- no estudo de vocação, e a do bairro alimenta o DNA, a cor do mapa e o Score.
--
-- A MUDANÇA: cada uma ganha `p_tipos text[] DEFAULT NULL`. NULL = todos os
-- tipos, como antes — o front publicado chama sem o argumento e continua
-- funcionando entre esta migration e o deploy. Quem decide o recorte é a tela
-- (padrão: tudo menos Terreno, em utils/opuraMarketTipos.ts).
--
-- A assinatura antiga é DROPada: com as duas no banco, a chamada com os
-- argumentos antigos ficaria ambígua para o PostgREST.
--
-- ─── REGRA #7 ───────────────────────────────────────────────────────────────
-- Continuam SECURITY INVOKER (contam só o que a RLS libera a quem chama),
-- LANGUAGE sql, STABLE. REVOKE de PUBLIC/anon + GRANT a authenticated em cada.
-- ============================================================================

BEGIN;

-- ─── 1. Estatística do raio (estudo de vocação) ─────────────────────────────
DROP FUNCTION IF EXISTS public.get_terrain_radius_statistics(numeric, numeric, integer);

CREATE OR REPLACE FUNCTION public.get_terrain_radius_statistics(
    p_latitude      numeric,
    p_longitude     numeric,
    p_radius_meters integer,
    p_tipos         text[] DEFAULT NULL
)
RETURNS TABLE (
    total_listings   integer,
    price_per_m2_avg numeric,
    ticket_avg       numeric,
    area_avg         numeric,
    bedrooms_avg     numeric,
    suites_avg       numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
    SELECT
        COUNT(l.id)::integer,
        COALESCE(ROUND(AVG(l.price_per_m2), 2), 0.0),
        COALESCE(ROUND(AVG(l.price), 2), 0.0),
        COALESCE(ROUND(AVG(l.area_private), 2), 0.0),
        COALESCE(ROUND(AVG(l.bedrooms), 1), 0.0),
        COALESCE(ROUND(AVG(l.suites), 1), 0.0)
    FROM public.opura_market_listings l
    WHERE l.listing_status = 'active'
      AND l.parent_listing_id IS NULL
      AND l.geom IS NOT NULL
      AND (p_tipos IS NULL OR l.property_type = ANY (p_tipos))
      AND ST_DWithin(
            l.geom::geography,
            ST_SetSRID(ST_MakePoint(p_longitude::double precision, p_latitude::double precision), 4326)::geography,
            p_radius_meters
          );
$function$;

COMMENT ON FUNCTION public.get_terrain_radius_statistics(numeric, numeric, integer, text[]) IS
  'Médias dos anúncios ativos no raio, só dos tipos em p_tipos (NULL = todos). SECURITY INVOKER. Plano 2026-10-19-opura-market-media-por-tipo.';

REVOKE EXECUTE ON FUNCTION public.get_terrain_radius_statistics(numeric, numeric, integer, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_terrain_radius_statistics(numeric, numeric, integer, text[]) TO authenticated;

-- ─── 2. DNA do bairro (painel e cor do mapa) ────────────────────────────────
DROP FUNCTION IF EXISTS public.get_market_neighborhood_stats(uuid);

CREATE OR REPLACE FUNCTION public.get_market_neighborhood_stats(
    p_city_id uuid,
    p_tipos   text[] DEFAULT NULL
)
RETURNS TABLE (
    neighborhood_id  uuid,
    total            integer,
    price_per_m2_avg numeric,
    ticket_avg       numeric,
    area_avg         numeric,
    tipologia        text
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
       AND (p_tipos IS NULL OR l.property_type = ANY (p_tipos))
     GROUP BY l.neighborhood_id;
$function$;

COMMENT ON FUNCTION public.get_market_neighborhood_stats(uuid, text[]) IS
  'DNA do bairro: médias dos anúncios ativos vinculados, só dos tipos em p_tipos (NULL = todos). SECURITY INVOKER.';

REVOKE EXECUTE ON FUNCTION public.get_market_neighborhood_stats(uuid, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_market_neighborhood_stats(uuid, text[]) TO authenticated;

-- ─── 3. Dinâmica do bairro (Saturação e Score) ──────────────────────────────
-- O início do histórico de feed é da cidade, não do tipo: fica sem recorte.
DROP FUNCTION IF EXISTS public.get_market_neighborhood_dinamica(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_market_neighborhood_dinamica(
    p_city_id uuid,
    p_meses   integer DEFAULT 6,
    p_tipos   text[]  DEFAULT NULL
)
RETURNS TABLE (
    neighborhood_id   uuid,
    ativos            bigint,
    saidas            bigint,
    preco_m2_atual    numeric,
    preco_m2_inicio   numeric,
    inicio_historico  timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
    WITH janela AS (
        SELECT now() - make_interval(months => greatest(coalesce(p_meses, 6), 1)) AS desde
    ),
    historico AS (
        SELECT min(h.captured_at) AS inicio
        FROM public.opura_market_listings h
        WHERE h.city_id = p_city_id AND h.feed_id IS NOT NULL
    )
    SELECT l.neighborhood_id,
           count(*) FILTER (WHERE l.listing_status = 'active'),
           count(*) FILTER (WHERE l.removed_at IS NOT NULL AND l.removed_at >= j.desde),
           avg(l.price_per_m2) FILTER (WHERE l.listing_status = 'active' AND l.price_per_m2 > 0),
           avg(l.price_per_m2) FILTER (WHERE l.price_per_m2 > 0
                                         AND l.captured_at >= j.desde
                                         AND l.captured_at <  j.desde + interval '1 month'),
           (SELECT inicio FROM historico)
    FROM public.opura_market_listings l
    CROSS JOIN janela j
    WHERE l.city_id = p_city_id
      AND l.neighborhood_id IS NOT NULL
      AND l.parent_listing_id IS NULL
      AND (p_tipos IS NULL OR l.property_type = ANY (p_tipos))
    GROUP BY l.neighborhood_id;
$function$;

COMMENT ON FUNCTION public.get_market_neighborhood_dinamica(uuid, integer, text[]) IS
  'Dinâmica por bairro (ativos, saídas, preço atual e no início da janela), só dos tipos em p_tipos (NULL = todos). SECURITY INVOKER.';

REVOKE EXECUTE ON FUNCTION public.get_market_neighborhood_dinamica(uuid, integer, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_market_neighborhood_dinamica(uuid, integer, text[]) TO authenticated;

-- ─── 4. Série mensal do bairro (gráfico de evolução) ────────────────────────
DROP FUNCTION IF EXISTS public.get_market_neighborhood_series(uuid);

CREATE OR REPLACE FUNCTION public.get_market_neighborhood_series(
    p_neighborhood_id uuid,
    p_tipos           text[] DEFAULT NULL
)
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
       AND (p_tipos IS NULL OR l.property_type = ANY (p_tipos))
     GROUP BY 1
     ORDER BY 1;
$function$;

COMMENT ON FUNCTION public.get_market_neighborhood_series(uuid, text[]) IS
  'Preço por m² ofertado mês a mês no bairro, só dos tipos em p_tipos (NULL = todos). SECURITY INVOKER.';

REVOKE EXECUTE ON FUNCTION public.get_market_neighborhood_series(uuid, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_market_neighborhood_series(uuid, text[]) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
