-- ============================================================================
-- Planta Inteligente — ESQUADRIA CONFIGURÁVEL no CATÁLOGO (11/10/2026, pendência
-- da F8 do plano `docs/planos/2026-10-11-planta-recursos-video-synaps.md`):
--   o tipo de esquadria da organização ganha as FOLHAS e a BANDEIRA, para que
--   "J1 — 3 folhas fixa/abrir/correr + bandeira basculante" aplicada em dez
--   janelas leve as folhas junto, como já leva medidas, item e vidro. Mesma forma
--   de `Opening.configuracao` no kernel (0.98.0):
--   `{ folhas: [{ mecanismo, larguraPct }], bandeira?: { alturaMm, mecanismo } }`.
--   JSONB pela razão do `vidro`: o vocabulário é do kernel, e um mecanismo novo
--   não pode exigir migration. `NULL` = tipo com o desenho padrão (todo o acervo).
--
-- Só ADD COLUMN: nenhuma policy nem função nova (REGRA #7 não se aplica); a RLS
-- da tabela (por organização) cobre a coluna.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ⚠️ Idempotente: ADD COLUMN IF NOT EXISTS.
-- ============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.blueprint_opening_types
    ADD COLUMN IF NOT EXISTS configuracao JSONB NULL;

COMMENT ON COLUMN public.blueprint_opening_types.configuracao IS
  'Folhas e bandeira do tipo (kernel 0.98.0): { folhas: [{ mecanismo, larguraPct }], bandeira?: { alturaMm, mecanismo } }. NULL = desenho padrão.';

RESET lock_timeout;
