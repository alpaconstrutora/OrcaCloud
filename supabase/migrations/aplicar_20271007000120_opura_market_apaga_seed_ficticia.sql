-- ============================================================================
-- ÒPURA Market Intelligence — Fase 2, item 2.5 (decisão D1 de 07/10/2026: apagar)
-- Plano: docs/planos/2026-10-07-opura-market-intelligence.md
--
-- A migration 20261124000000 semeou 6 anúncios FICTÍCIOS de Cambuí (ZAP, OLX,
-- VivaReal, organization_id NULL, capturados em 12/06/2026) "para testar a RPC
-- de busca espacial", e a 20261124000002 semeou 18 linhas de histórico
-- inventado de 2025-12 a 2026-05. Desde então eles apareciam no mapa como
-- anúncios "Global", entravam na média do raio de toda organização e
-- desenhavam o gráfico "Evolução do Preço Ofertado".
--
-- Medido antes (07/10/2026): 6 anúncios — que eram TODOS os anúncios globais —,
-- 0 anúncios filhos deles, 0 concorrentes monitorados apontando para eles,
-- 18 linhas de histórico (todo o histórico existente).
--
-- O recorte é estreito de propósito: só o que a seed criou. Anúncio global
-- importado de verdade no futuro não casa com esta combinação de fonte + data.
--
-- REGRA #7: sem policy e sem função.
-- ⚠️ APLICAR À MÃO: npx supabase db query --linked -f <este arquivo>. NUNCA db push.
-- ⚠️ Idempotente: DELETE condicional; na segunda execução apaga 0 linhas.
-- ============================================================================

SET lock_timeout = '5s';

DELETE FROM public.opura_market_listings
 WHERE organization_id IS NULL
   AND source IN ('ZAP', 'OLX', 'VivaReal')
   AND captured_at::date = DATE '2026-06-12';

DELETE FROM public.opura_market_neighborhood_history
 WHERE recorded_date < DATE '2026-06-01';

RESET lock_timeout;
