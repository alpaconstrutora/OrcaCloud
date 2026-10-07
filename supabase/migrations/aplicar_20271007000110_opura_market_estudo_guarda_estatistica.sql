-- ============================================================================
-- ÒPURA Market Intelligence — Fase 2, item 2.2
-- Plano: docs/planos/2026-10-07-opura-market-intelligence.md
--
-- O estudo de terreno passa a guardar as estatísticas REAIS do raio no momento
-- da análise (saída de get_terrain_radius_statistics, em camelCase como o
-- service a devolve). Até aqui o estudo não as guardava, e reabrir um estudo
-- montava números inventados na tela (total = VGV ÷ 400 mil, área 80 m²…).
--
-- Estudo salvo antes desta migration fica com radius_stats NULL, e a tela diz
-- "Estatísticas não guardadas". Em 07/10/2026 não havia nenhum estudo salvo.
--
-- REGRA #7: sem policy e sem função nova. A coluna herda a RLS vigente de
-- opura_market_terrain_studies (org_access_terrain_studies, por organização).
--
-- ⚠️ APLICAR À MÃO: npx supabase db query --linked -f <este arquivo>. NUNCA db push.
-- ⚠️ Idempotente: ADD COLUMN IF NOT EXISTS.
-- ============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.opura_market_terrain_studies
    ADD COLUMN IF NOT EXISTS radius_stats jsonb;

COMMENT ON COLUMN public.opura_market_terrain_studies.radius_stats IS
  'Estatísticas do raio medidas na análise: {totalListings, pricePerM2Avg, ticketAvg, areaAvg, bedroomsAvg, suitesAvg}. NULL = estudo salvo antes de 07/10/2026.';

RESET lock_timeout;
