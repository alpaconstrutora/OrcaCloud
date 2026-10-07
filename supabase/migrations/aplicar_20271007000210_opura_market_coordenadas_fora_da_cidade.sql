-- ============================================================================
-- ÒPURA Market Intelligence — Fase 3 revisada (D7/D8), reparo complementar
-- Plano: docs/planos/2026-10-07-opura-market-intelligence.md
--
-- Achado ao conferir a localização em 07/10/2026: 22 anúncios do robô antigo
-- tinham a coordenada do BAIRRO geocodificada em OUTRA cidade — o robô
-- geocodificava "Bairro, Cambuí" no navegador sem conferir a cidade do
-- resultado. Campinas tem um bairro chamado Cambuí: "Novo Horizonte" (7),
-- "São Domingos" (6), "Anhumas" (3), "Jardim Primavera" (2) e "Capela" (1)
-- caíram lá; "Bela Vista" (2) caiu na Bahia e "Bom Sucesso" (1) no Paraná.
-- A migration aplicar_20271007000200 marcou esses pontos como
-- geo_precision = 'bairro' sem saber disso.
--
-- Critério (genérico, não uma caixa fixa de Cambuí): coordenada a mais de
-- 20 km do centro dos bairros cadastrados da própria cidade do anúncio. O ponto
-- antigo vai para a tabela de reversão (motivo 'fora_da_cidade') e o anúncio
-- volta para a fila de localização (geo_precision NULL), que agora exige a
-- cidade certa.
--
-- REGRA #7: sem policy e sem função.
-- ⚠️ APLICAR À MÃO: npx supabase db query --linked -f <este arquivo>. NUNCA db push.
-- ⚠️ Idempotente: só pega anúncio que ainda tem coordenada longe da cidade.
-- ============================================================================

SET lock_timeout = '5s';

WITH centro AS (
    SELECT n.city_id, ST_Centroid(ST_Collect(n.geom)) AS ponto
      FROM public.opura_market_neighborhoods n
     WHERE n.geom IS NOT NULL
     GROUP BY n.city_id
), longe AS (
    SELECT l.id, l.latitude, l.longitude, l.geom
      FROM public.opura_market_listings l
      JOIN centro c ON c.city_id = l.city_id
     WHERE l.geom IS NOT NULL
       AND ST_Distance(l.geom::geography, c.ponto::geography) > 20000
)
INSERT INTO public.opura_market_listings_reparo_20271007 (listing_id, motivo, latitude_antes, longitude_antes, geom_antes)
SELECT id, 'fora_da_cidade', latitude, longitude, geom FROM longe
ON CONFLICT (listing_id, motivo) DO NOTHING;

UPDATE public.opura_market_listings l
   SET latitude = NULL, longitude = NULL, geom = NULL, geo_precision = NULL
  FROM public.opura_market_listings_reparo_20271007 r
 WHERE r.listing_id = l.id
   AND r.motivo = 'fora_da_cidade'
   AND l.geom IS NOT DISTINCT FROM r.geom_antes;

RESET lock_timeout;
