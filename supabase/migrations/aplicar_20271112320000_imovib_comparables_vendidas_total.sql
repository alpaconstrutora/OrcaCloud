-- ==========================================================================
-- Imovib: comparável não pode ter mais vendidas que o total
-- ==========================================================================
-- Plano: docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, item 7.1
-- (pendência da revisão da Fase 7: só a tela barrava; gravação direta passava).
-- Conferido antes de aplicar, em 12/11/2026: nenhuma linha viola a regra.
--
-- REGRA #7
--   P1 (esta perna do OR libera sozinha?): nenhuma policy criada nem alterada.
--   P2 (quem mais executa?): nenhuma função criada nem alterada.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter: ALTER TABLE public.imovib_market_comparables DROP CONSTRAINT imovib_market_comparables_vendidas_total_check;

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.imovib_market_comparables DROP CONSTRAINT IF EXISTS imovib_market_comparables_vendidas_total_check;
ALTER TABLE public.imovib_market_comparables ADD CONSTRAINT imovib_market_comparables_vendidas_total_check
    CHECK (sold_units IS NULL OR total_units IS NULL OR sold_units <= total_units);

COMMIT;
