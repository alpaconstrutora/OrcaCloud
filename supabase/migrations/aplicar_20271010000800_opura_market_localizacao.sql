-- ============================================================================
-- aplicar_20271010000800_opura_market_localizacao
-- ÒPURA Market — posição manual, duplicados quando a posição melhora, e a lista
-- de bairros citados nos anúncios que ainda não estão no cadastro da praça.
-- Plano: docs/planos/2026-10-10-opura-market-pendencias.md, item 2.
--
-- APLICAR COM `npx supabase db query --linked -f` (nunca `db push`). Idempotente.
--
-- ─── REGRA #7 ───────────────────────────────────────────────────────────────
-- 1. `get_market_bairros_sem_cadastro` é SECURITY INVOKER: cada um vê só os
--    nomes de bairro dos anúncios que a RLS já lhe libera. REVOKE de PUBLIC/anon.
-- 2. `fn_deduplicate_market_listing` continua sem SECURITY DEFINER (roda com a
--    RLS de quem grava, como antes).
-- ============================================================================

-- ── 1. 'manual': posição que um usuário marcou no mapa ──────────────────────
ALTER TABLE public.opura_market_listings DROP CONSTRAINT IF EXISTS opura_market_listings_geo_precision_chk;
ALTER TABLE public.opura_market_listings ADD CONSTRAINT opura_market_listings_geo_precision_chk
    CHECK (geo_precision IS NULL OR geo_precision = ANY (ARRAY['fonte','manual','endereco','rua','bairro','nao_encontrado']));

-- ── 2. Duplicados: também quando a posição MELHORA para uma exata ────────────
-- Até aqui o gatilho só rodava quando o anúncio ganhava a PRIMEIRA coordenada.
-- Com o modo 'relocalizar' e a posição manual, um anúncio que estava no ponto do
-- bairro pode passar a ter o ponto exato — e só então dá para saber se ele é o
-- mesmo imóvel de outro anúncio. 'manual' conta como posição exata.
CREATE OR REPLACE FUNCTION public.fn_deduplicate_market_listing()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_parent_id uuid;
BEGIN
    -- Só posição exata identifica o MESMO imóvel. Ponto de rua ou de bairro é
    -- dividido por imóveis diferentes (Fase 4: 54 vínculos errados por isso).
    IF NEW.geom IS NULL OR NEW.geo_precision IS NULL OR NEW.geo_precision NOT IN ('fonte', 'endereco', 'manual') THEN
        RETURN NEW;
    END IF;
    IF NEW.parent_listing_id IS NOT NULL THEN
        RETURN NEW;   -- já é filho
    END IF;
    -- Num UPDATE, só se a posição ANTERIOR não era exata (primeira coordenada ou melhora).
    IF TG_OP = 'UPDATE' AND OLD.geom IS NOT NULL AND OLD.geo_precision IN ('fonte', 'endereco', 'manual') THEN
        RETURN NEW;
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
      AND l.geo_precision IN ('fonte', 'endereco', 'manual')
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
-- O gatilho (BEFORE INSERT OR UPDATE OF geom) não muda: posição que melhora muda o geom.

-- ── 3. Bairros citados nos anúncios e ainda não cadastrados na praça ─────────
-- Medido em 10/10/2026: 134 anúncios "endereço não encontrado" estavam em 38
-- bairros que não existem no mapa aberto nem no cadastro (só 4 cadastrados).
-- Cadastrar o bairro com um ponto já posiciona os anúncios dele
-- (`fn_opura_market_vincular_bairro`); esta lista diz quais faltam.
CREATE OR REPLACE FUNCTION public.get_market_bairros_sem_cadastro(p_city_id uuid)
RETURNS TABLE (nome text, anuncios bigint, sem_posicao bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT min(trim(l.neighborhood_name_raw)) AS nome,
           count(*)                                                AS anuncios,
           count(*) FILTER (WHERE l.geom IS NULL)                  AS sem_posicao
    FROM public.opura_market_listings l
    WHERE l.city_id = p_city_id
      AND l.neighborhood_id IS NULL
      AND l.neighborhood_name_raw IS NOT NULL
      AND trim(l.neighborhood_name_raw) <> ''
      AND l.listing_status = 'active'
    GROUP BY lower(unaccent(trim(l.neighborhood_name_raw)))
    ORDER BY count(*) DESC, 1;
$$;

REVOKE ALL ON FUNCTION public.get_market_bairros_sem_cadastro(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_market_bairros_sem_cadastro(uuid) TO authenticated;
