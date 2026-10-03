-- ============================================================================
-- Planta Inteligente — CA BÁSICO no contexto urbanístico do estudo (03/10/2026)
--
-- Pendências do Estudo de Massa (`docs/planos/2026-10-03-pendencias-estudo-de-massa.md`, item 4 — outorga onerosa).
-- A zona do Mapa Regulatório já tem `ca_basico` e `ca_maximo` (as duas tabelas); o estudo só guardava o máximo
-- (`coeficiente_max`). Entre o básico e o máximo a área computável depende de OUTORGA ONEROSA: com o básico guardado,
-- o estudo diz quantos m² estão sujeitos a ela. Lido da zona ou digitado à mão, como os demais campos.
--
-- Só uma coluna: nenhuma policy nem função nova (REGRA #7 não se aplica). Idempotente (ADD COLUMN IF NOT EXISTS).
-- Aplicar com `db query -f`, nunca `supabase db push` (ver CLAUDE.md).
-- ============================================================================
SET lock_timeout = '5s';

ALTER TABLE public.blueprint_study_urban_context
  ADD COLUMN IF NOT EXISTS coeficiente_basico numeric;

COMMENT ON COLUMN public.blueprint_study_urban_context.coeficiente_basico IS 'CA básico (sem outorga onerosa). Entre ele e coeficiente_max a área computável depende de outorga.';
