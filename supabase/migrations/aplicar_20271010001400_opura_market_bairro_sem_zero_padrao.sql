-- ============================================================================
-- aplicar_20271010001400_opura_market_bairro_sem_zero_padrao
-- ÒPURA Market — bairro novo não nasce com indicador "zero".
-- Plano: docs/planos/2026-10-10-opura-market-pendencias.md, achado do item 6.
--
-- APLICAR COM `npx supabase db query --linked -f` (nunca `db push`). Idempotente.
--
-- ─── Por quê ────────────────────────────────────────────────────────────────
-- Na prova de ponta a ponta (10/10/2026), um bairro criado pela gaveta "Cadastrar
-- praça" apareceu no DNA com "Bairro Score™ 0 / 100". As colunas de indicador do
-- MVP têm DEFAULT 0.0; a migration aplicar_20271007000130 anulou os VALORES dos
-- 4 bairros que existiam, mas não o padrão — todo bairro novo voltava a nascer
-- com zeros que parecem medidos. Esses números agora são calculados na leitura
-- (get_market_neighborhood_stats / _dinamica); as colunas ficam nulas.
--
-- Sem função nova; nada muda de RLS.
-- ============================================================================

ALTER TABLE public.opura_market_neighborhoods
    ALTER COLUMN bairro_score       DROP DEFAULT,
    ALTER COLUMN ticket_medio       DROP DEFAULT,
    ALTER COLUMN price_per_m2_medio DROP DEFAULT,
    ALTER COLUMN area_media         DROP DEFAULT,
    ALTER COLUMN potential_score    DROP DEFAULT,
    ALTER COLUMN competitors_count  DROP DEFAULT;

-- Bairro que tenha nascido com o zero do padrão depois de 07/10/2026.
UPDATE public.opura_market_neighborhoods
   SET bairro_score = NULL, potential_score = NULL, ticket_medio = NULL,
       price_per_m2_medio = NULL, area_media = NULL, competitors_count = NULL
 WHERE coalesce(bairro_score, 0) = 0 AND coalesce(potential_score, 0) = 0
   AND coalesce(ticket_medio, 0) = 0 AND coalesce(price_per_m2_medio, 0) = 0
   AND coalesce(area_media, 0) = 0 AND coalesce(competitors_count, 0) = 0
   AND (bairro_score IS NOT NULL OR potential_score IS NOT NULL OR ticket_medio IS NOT NULL
        OR price_per_m2_medio IS NOT NULL OR area_media IS NOT NULL OR competitors_count IS NOT NULL);
