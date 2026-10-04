-- ============================================================================
-- Planta Inteligente — CLIMATIZAÇÃO, E1.1 (04/10/2026, roadmap
-- `docs/planos/2026-10-04-climatizacao-benchmark-altoqi-e-roadmap.md`):
--   o tipo de esquadria do catálogo ganha o VIDRO — fator solar, U do conjunto
--   e proteção solar — para que "J1" aplicada em dez janelas leve o vidro junto,
--   como já leva largura, altura e item. Mesma forma de `Opening.vidro` no
--   kernel (0.91.0): `{ fatorSolar, uWm2K, protecao, fatorSombreamento }`,
--   JSONB porque o vocabulário é do kernel e um campo novo não pode exigir
--   migration. `NULL` = tipo sem vidro declarado (todo o acervo de hoje).
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ⚠️ Idempotente: ADD COLUMN IF NOT EXISTS.
-- ============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.blueprint_opening_types
    ADD COLUMN IF NOT EXISTS vidro JSONB NULL;

COMMENT ON COLUMN public.blueprint_opening_types.vidro IS
  'Vidro e proteção solar do tipo (kernel 0.91.0): { fatorSolar, uWm2K, protecao, fatorSombreamento }. NULL = não declarado.';

RESET lock_timeout;
