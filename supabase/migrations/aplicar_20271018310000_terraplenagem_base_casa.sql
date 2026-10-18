-- ─────────────────────────────────────────────────────────────────────────────
-- TERRAPLENAGEM: o platô SOB A CASA (F25 da casa automática, 18/10/2026)
--
-- Decisão do usuário (16/10/2026): no terreno inclinado a casa assenta num
-- PLATÔ ÚNICO na cota que equilibra corte e aterro sob a projeção. O platô da
-- casa não é o envelope nem o lote inteiro: é a projeção dela com a margem.
--
--  - `base` ganha 'CASA' (o platô que a casa automática lançou);
--  - `anel_plato` guarda o anel do platô em uso, em mm do desenho
--    ([{x, y}, …]) — o da casa, e também o do envelope ou do lote quando a
--    base é essa (o orçamento recalcula os volumes a partir dele e da
--    topografia publicada no snapshot, sem refazer o envelope fora da tela).
--
-- Aditivo: uma coluna anulável e a CHECK alargada. Nenhuma premissa existente
-- muda (NULL = o anel continua sendo derivado da base, como antes). A coluna
-- herda as policies da tabela (org-scoped desde `aplicar_20270921000006`) —
-- não há policy nem função nova.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.blueprint_study_terraplenagem
  ADD COLUMN IF NOT EXISTS anel_plato JSONB;

COMMENT ON COLUMN public.blueprint_study_terraplenagem.anel_plato IS
  'O anel do platô em uso, mm do desenho ([{x, y}, …]); NULL = derivado da base (envelope ou lote). Na base CASA é o platô sob a casa (F25).';

ALTER TABLE public.blueprint_study_terraplenagem
  DROP CONSTRAINT IF EXISTS blueprint_study_terraplenagem_base_check;
ALTER TABLE public.blueprint_study_terraplenagem
  ADD CONSTRAINT blueprint_study_terraplenagem_base_check
  CHECK (base IN ('ENVELOPE', 'LOTE', 'CASA'));

-- O anel, quando vem, é uma lista de pelo menos 3 pontos.
ALTER TABLE public.blueprint_study_terraplenagem
  DROP CONSTRAINT IF EXISTS blueprint_study_terraplenagem_anel_chk;
ALTER TABLE public.blueprint_study_terraplenagem
  ADD CONSTRAINT blueprint_study_terraplenagem_anel_chk
  CHECK (anel_plato IS NULL OR (jsonb_typeof(anel_plato) = 'array' AND jsonb_array_length(anel_plato) >= 3));

COMMIT;
