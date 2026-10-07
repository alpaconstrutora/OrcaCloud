-- ============================================================================
-- ÒPURA Market Intelligence — Fase 1: fechar os vazamentos entre organizações
-- Plano: docs/planos/2026-10-07-opura-market-intelligence.md (itens 1.1 a 1.3)
--
-- O que estava errado (medido no banco remoto em 07/10/2026):
--
--   1. get_terrain_radius_statistics era SECURITY DEFINER e não filtrava
--      organização. A RLS de opura_market_listings (global OU membro) ficava de
--      fora: os 357 anúncios privados da Alpa entravam na média e na contagem de
--      QUALQUER conta autenticada. O raio também era medido em graus
--      (p_radius_meters / 111000.0) — em Cambuí o círculo saía ~8 % mais largo no
--      sentido leste-oeste. Em 1 km as duas contas davam os mesmos 114 anúncios;
--      o vazamento era o defeito grave, o grau era distorção.
--
--   2. fn_deduplicate_market_listing (BEFORE INSERT) procurava o "pai" sem olhar
--      organization_id. Como a função NÃO é SECURITY DEFINER, ela já enxerga só o
--      que a RLS do usuário que importa libera — então o cruzamento acontecia com
--      anúncio GLOBAL (organization_id NULL) ou com usuário membro de duas
--      organizações. Nos dois casos o anúncio importado virava filho e sumia da
--      listagem (listListings filtra parent_listing_id IS NULL). A divisão da
--      tolerância de área também quebrava com area_private = 0.
--
--   3. Vínculos já gravados entre organizações diferentes: 0 em 07/10/2026
--      (só uma organização tem anúncios privados). O UPDATE abaixo fica como
--      reparo idempotente; hoje não altera linha nenhuma.
--
-- REGRA OBRIGATÓRIA #7
--   Pergunta 1 (perna do OR que libera sozinha): esta migration não cria policy.
--     A RPC passa a depender da policy vigente allow_select_market_listings
--     (20261124000001): "organization_id IS NULL OR membro da organização".
--     As duas pernas são intencionais — global é o mercado compartilhado.
--   Pergunta 2 (quem mais executa): a RPC vira SECURITY INVOKER — quem chama só
--     agrega o que já pode ler. Mesmo assim o REVOKE de PUBLIC e anon vem
--     explícito, porque CREATE OR REPLACE preserva a ACL e o default do Postgres
--     concede EXECUTE a PUBLIC. fn_deduplicate_market_listing é função de
--     gatilho (RETURNS trigger): o PostgREST não a expõe como RPC e ela roda
--     com o papel de quem faz o INSERT; não recebe REVOKE para não arriscar o
--     disparo do gatilho.
--
-- ⚠️ APLICAR À MÃO: npx supabase db query --linked -f <este arquivo>. NUNCA db push.
-- ⚠️ Idempotente: CREATE OR REPLACE, CREATE INDEX IF NOT EXISTS, UPDATE condicional.
-- ============================================================================

SET lock_timeout = '5s';

-- ── 1.1 Estatística de raio: respeita a RLS e mede em metros ────────────────
-- LANGUAGE sql (não plpgsql): sem variáveis OUT, então os nomes do RETURNS TABLE
-- não colidem com colunas (armadilha 42702 já vista três vezes neste schema).
-- Assinatura e colunas de retorno idênticas às anteriores: o service não muda.
CREATE OR REPLACE FUNCTION public.get_terrain_radius_statistics(
    p_latitude      numeric,
    p_longitude     numeric,
    p_radius_meters integer
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
      AND ST_DWithin(
            l.geom::geography,
            ST_SetSRID(ST_MakePoint(p_longitude::double precision, p_latitude::double precision), 4326)::geography,
            p_radius_meters
          );
$function$;

COMMENT ON FUNCTION public.get_terrain_radius_statistics(numeric, numeric, integer) IS
  'ÒPURA Market: estatísticas dos anúncios ativos e não duplicados num raio em METROS. SECURITY INVOKER: agrega só o que a RLS de opura_market_listings libera ao chamador (globais + os da própria organização).';

REVOKE EXECUTE ON FUNCTION public.get_terrain_radius_statistics(numeric, numeric, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_terrain_radius_statistics(numeric, numeric, integer) TO authenticated;

-- O índice GIST existente é sobre geometry; a busca em geography precisa do seu.
CREATE INDEX IF NOT EXISTS idx_opura_market_listings_geog
    ON public.opura_market_listings USING GIST ((geom::geography));

-- ── 1.2 Deduplicação: só dentro da mesma origem ─────────────────────────────
-- "Mesma origem" = mesma organização, ou os dois globais (IS NOT DISTINCT FROM).
-- Distância em metros (geography), tolerância de área protegida contra zero.
CREATE OR REPLACE FUNCTION public.fn_deduplicate_market_listing()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_parent_id uuid;
BEGIN
    IF NEW.geom IS NULL THEN
        RETURN NEW;   -- sem localização não há proximidade para comparar
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

COMMENT ON FUNCTION public.fn_deduplicate_market_listing() IS
  'ÒPURA Market: marca como filho (parent_listing_id) o anúncio novo que repete um existente da MESMA origem (mesma organização, ou ambos globais): até 30 m, mesmos dormitórios, área privativa até 2 % de diferença.';

-- ── 1.3 Reparo: desfaz vínculo entre organizações diferentes ────────────────
UPDATE public.opura_market_listings c
   SET parent_listing_id = NULL
  FROM public.opura_market_listings p
 WHERE p.id = c.parent_listing_id
   AND c.organization_id IS DISTINCT FROM p.organization_id;

RESET lock_timeout;
