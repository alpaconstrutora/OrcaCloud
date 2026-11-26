-- ─────────────────────────────────────────────────────────────────────────────
-- TERRAPLENAGEM: o balanço de massa e o talude SUAVE do platô (25/11/2026)
--
-- Pedido: o reel da Hektar com o painel do platô — "Mass balance: Cut / Cut &
-- Fill / Fill" e "Side slope: Smooth / Straight". Escopo escolhido pelo usuário:
-- "Painel + os dois". Plano: docs/planos/2026-11-25-planta-plato-desenhado-3d.md.
--
--  - `modo_do_balanco`: CORTE (só rebaixa o que está acima da cota), ATERRO (só
--    enche o que está abaixo) ou CORTE_E_ATERRO (nivela). NULL = CORTE_E_ATERRO,
--    o de sempre;
--  - `forma_do_talude`: RETO (1:h, o de sempre) ou SUAVE (curva por largura em
--    planta). NULL = RETO;
--  - `largura_do_talude_suave_m`: a largura do talude SUAVE, em m (> 0). NULL =
--    o padrão do app (5 m).
--
-- Aditivo: três colunas anuláveis com CHECK. Nenhuma premissa existente muda
-- (NULL = o comportamento de hoje). As colunas herdam as policies da tabela
-- (org-scoped desde `aplicar_20270921000006`) — não há policy nem função nova.
--
-- O app recua sem estas colunas (42703) — ler e gravar não quebram se o deploy
-- chegar antes da migration; só o modo e a forma não ficam guardados.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.blueprint_study_terraplenagem
  ADD COLUMN IF NOT EXISTS modo_do_balanco TEXT,
  ADD COLUMN IF NOT EXISTS forma_do_talude TEXT,
  ADD COLUMN IF NOT EXISTS largura_do_talude_suave_m NUMERIC;

ALTER TABLE public.blueprint_study_terraplenagem
  DROP CONSTRAINT IF EXISTS blueprint_study_terraplenagem_modo_do_balanco_chk;
ALTER TABLE public.blueprint_study_terraplenagem
  ADD CONSTRAINT blueprint_study_terraplenagem_modo_do_balanco_chk
  CHECK (modo_do_balanco IS NULL OR modo_do_balanco IN ('CORTE', 'CORTE_E_ATERRO', 'ATERRO'));

ALTER TABLE public.blueprint_study_terraplenagem
  DROP CONSTRAINT IF EXISTS blueprint_study_terraplenagem_forma_do_talude_chk;
ALTER TABLE public.blueprint_study_terraplenagem
  ADD CONSTRAINT blueprint_study_terraplenagem_forma_do_talude_chk
  CHECK (forma_do_talude IS NULL OR forma_do_talude IN ('RETO', 'SUAVE'));

ALTER TABLE public.blueprint_study_terraplenagem
  DROP CONSTRAINT IF EXISTS blueprint_study_terraplenagem_largura_suave_chk;
ALTER TABLE public.blueprint_study_terraplenagem
  ADD CONSTRAINT blueprint_study_terraplenagem_largura_suave_chk
  CHECK (largura_do_talude_suave_m IS NULL OR (largura_do_talude_suave_m > 0 AND largura_do_talude_suave_m <= 200));

COMMENT ON COLUMN public.blueprint_study_terraplenagem.modo_do_balanco IS
  'Balanço de massa do platô: CORTE (só rebaixa), ATERRO (só enche) ou CORTE_E_ATERRO (nivela). NULL = CORTE_E_ATERRO.';
COMMENT ON COLUMN public.blueprint_study_terraplenagem.forma_do_talude IS
  'Forma do talude: RETO (1:h) ou SUAVE (curva por largura em planta). NULL = RETO.';
COMMENT ON COLUMN public.blueprint_study_terraplenagem.largura_do_talude_suave_m IS
  'Largura em planta do talude SUAVE, em m. NULL = o padrão do app (5 m).';

COMMIT;
