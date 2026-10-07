-- ============================================================================
-- ÒPURA Market Intelligence — Fase 3 revisada (D7), item 3.3R
-- Plano: docs/planos/2026-10-07-opura-market-intelligence.md
--
-- As duas coisas que a Fase 2 encontrou, no DADO já gravado:
--
--   1. Bairro coringa. O robô antigo jogava no "Centro" todo bairro que não
--      casava com os 4 cadastrados: 296 de 325 anúncios não duplicados estavam
--      no Centro. Agora o nome original fica em `neighborhood_name_raw` e o
--      anúncio do robô cujo bairro de origem não é Centro PERDE o bairro.
--
--   2. Localização. O robô geocodificava pelo NOME do bairro (o portal nunca
--      informou a rua): os 140 anúncios dele com coordenada caem em poucos
--      pontos. Agora isso fica dito em `geo_precision = 'bairro'`.
--      A importação de planilha, até a Fase 2, SORTEAVA um ponto quando o
--      endereço não era achado. Medido em 07/10/2026: os 13 endereços das 76
--      linhas aparecem com vários pontos cada (Tiradentes: 16 linhas, 9 pontos;
--      "Praça" e "Rosa" caíram a 30 km). Nenhuma dessas coordenadas é confiável:
--      todas viram NULL, e o modo 'localizar' da function opura-market-import
--      geocodifica de novo pela rua.
--
-- Tudo o que é alterado fica antes em `opura_market_listings_reparo_20271007`.
-- ⚠️ NÃO apagar essa tabela: é o único caminho de volta.
--
-- O gatilho de duplicados passa a rodar também quando um anúncio GANHA
-- coordenada (UPDATE OF geom), porque a geocodificação agora pode acontecer
-- depois da gravação. Base: o corpo de aplicar_20271007000100 (Fase 1).
--
-- REGRA #7
--   Pergunta 1: sem policy nova. A tabela de reversão tem RLS ligada e NENHUMA
--     policy: só postgres/service_role a leem.
--   Pergunta 2: fn_deduplicate_market_listing é função de gatilho, não RPC
--     (mesma justificativa da Fase 1 para não receber REVOKE).
--
-- ⚠️ APLICAR À MÃO: npx supabase db query --linked -f <este arquivo>. NUNCA db push.
-- ⚠️ Idempotente: ADD COLUMN IF NOT EXISTS, constraint condicional, INSERT … ON
--    CONFLICT DO NOTHING, UPDATEs condicionais, CREATE OR REPLACE.
-- ============================================================================

SET lock_timeout = '5s';

-- ── Colunas ─────────────────────────────────────────────────────────────────
ALTER TABLE public.opura_market_listings
    ADD COLUMN IF NOT EXISTS neighborhood_name_raw text,
    ADD COLUMN IF NOT EXISTS geo_precision text;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'opura_market_listings_geo_precision_chk') THEN
        ALTER TABLE public.opura_market_listings
            ADD CONSTRAINT opura_market_listings_geo_precision_chk
            CHECK (geo_precision IS NULL OR geo_precision IN ('fonte', 'endereco', 'bairro', 'nao_encontrado'));
    END IF;
END $$;

COMMENT ON COLUMN public.opura_market_listings.neighborhood_name_raw IS
  'Nome do bairro como veio da origem (feed, planilha, robô). neighborhood_id só é preenchido quando o nome casa EXATO com um bairro cadastrado — nunca por coringa.';
COMMENT ON COLUMN public.opura_market_listings.geo_precision IS
  'De onde veio a coordenada: fonte (o feed informou), endereco (geocodificada pela rua), bairro (só o bairro era conhecido), nao_encontrado. NULL sem coordenada = pendente de geocodificação.';

-- ── Tabela de reversão ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.opura_market_listings_reparo_20271007 (
    listing_id            uuid NOT NULL,
    motivo                text NOT NULL,
    neighborhood_id_antes uuid,
    latitude_antes        numeric,
    longitude_antes       numeric,
    geom_antes            geometry(Point, 4326),
    gravado_em            timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (listing_id, motivo)
);
ALTER TABLE public.opura_market_listings_reparo_20271007 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.opura_market_listings_reparo_20271007 FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.opura_market_listings_reparo_20271007 IS
  'Reversão do reparo de 07/10/2026 (aplicar_20271007000200): bairro "Centro" coringa e coordenadas sorteadas da planilha. NÃO apagar.';

-- ── 1. Bairro: nome original e fim do coringa ───────────────────────────────
UPDATE public.opura_market_listings
   SET neighborhood_name_raw = NULLIF(trim(split_part(address, ',', 1)), '')
 WHERE source = 'Conexão 381'
   AND neighborhood_name_raw IS NULL;

INSERT INTO public.opura_market_listings_reparo_20271007 (listing_id, motivo, neighborhood_id_antes)
SELECT l.id, 'centro_coringa', l.neighborhood_id
  FROM public.opura_market_listings l
  JOIN public.opura_market_neighborhoods n ON n.id = l.neighborhood_id
 WHERE l.source = 'Conexão 381'
   AND lower(trim(n.name)) = 'centro'
   AND lower(trim(coalesce(l.neighborhood_name_raw, ''))) <> 'centro'
ON CONFLICT (listing_id, motivo) DO NOTHING;

UPDATE public.opura_market_listings l
   SET neighborhood_id = NULL
  FROM public.opura_market_listings_reparo_20271007 r
 WHERE r.listing_id = l.id
   AND r.motivo = 'centro_coringa'
   AND l.neighborhood_id IS NOT NULL;

-- ── 2. Precisão do que o robô geocodificou pelo nome do bairro ──────────────
UPDATE public.opura_market_listings
   SET geo_precision = 'bairro'
 WHERE source = 'Conexão 381'
   AND geom IS NOT NULL
   AND geo_precision IS NULL;

-- ── 3. Coordenadas sorteadas da planilha ────────────────────────────────────
INSERT INTO public.opura_market_listings_reparo_20271007 (listing_id, motivo, latitude_antes, longitude_antes, geom_antes)
SELECT id, 'coordenada_sorteada', latitude, longitude, geom
  FROM public.opura_market_listings
 WHERE source = 'Planilha Importada'
   AND geom IS NOT NULL
   AND geo_precision IS NULL
ON CONFLICT (listing_id, motivo) DO NOTHING;

UPDATE public.opura_market_listings l
   SET latitude = NULL, longitude = NULL, geom = NULL, geo_precision = NULL
  FROM public.opura_market_listings_reparo_20271007 r
 WHERE r.listing_id = l.id
   AND r.motivo = 'coordenada_sorteada'
   AND l.geom IS NOT DISTINCT FROM r.geom_antes;

-- ── 4. Gatilho de duplicados também quando o anúncio ganha coordenada ───────
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

DROP TRIGGER IF EXISTS trg_deduplicate_market_listing ON public.opura_market_listings;
CREATE TRIGGER trg_deduplicate_market_listing
    BEFORE INSERT OR UPDATE OF geom ON public.opura_market_listings
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_deduplicate_market_listing();

RESET lock_timeout;
