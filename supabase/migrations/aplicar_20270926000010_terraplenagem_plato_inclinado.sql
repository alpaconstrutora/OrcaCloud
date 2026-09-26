-- ─────────────────────────────────────────────────────────────────────────────
-- PLATÔ INCLINADO (fase C1, 26/09/2026)
--
-- O platô da terraplenagem deixa de ser um plano horizontal numa cota só e
-- ganha caimento em duas direções: longitudinal (ao longo de um azimute de
-- desenho) e transversal. A cota informada continua sendo a do centro do platô;
-- o plano gira em torno dele.
--
-- Tudo aditivo: três colunas anuláveis. NULL ou zero = o platô horizontal de
-- sempre, então nenhuma premissa existente muda de resultado. As colunas herdam
-- as policies da tabela (org-scoped desde `aplicar_20270921000006`) — não há
-- policy nem função nova.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.blueprint_study_terraplenagem
  ADD COLUMN IF NOT EXISTS inclinacao_long_pct   NUMERIC(6, 3),
  ADD COLUMN IF NOT EXISTS inclinacao_transv_pct NUMERIC(6, 3),
  ADD COLUMN IF NOT EXISTS inclinacao_azimute_deg NUMERIC(6, 2);

COMMENT ON COLUMN public.blueprint_study_terraplenagem.inclinacao_long_pct IS
  'Caimento do platô ao longo do azimute, em %. NULL/0 = horizontal. Positivo sobe no sentido do azimute.';
COMMENT ON COLUMN public.blueprint_study_terraplenagem.inclinacao_transv_pct IS
  'Caimento a 90° do azimute (para a direita de quem olha no azimute), em %. NULL/0 = sem caimento transversal.';
COMMENT ON COLUMN public.blueprint_study_terraplenagem.inclinacao_azimute_deg IS
  'Direção longitudinal em graus de DESENHO (0 = +Y, horário). NULL = 0.';

-- Caimento acima de 20% não é platô, é talude: a trava evita um zero a mais.
ALTER TABLE public.blueprint_study_terraplenagem
  DROP CONSTRAINT IF EXISTS blueprint_study_terraplenagem_inclinacao_chk;
ALTER TABLE public.blueprint_study_terraplenagem
  ADD CONSTRAINT blueprint_study_terraplenagem_inclinacao_chk
  CHECK (
    (inclinacao_long_pct IS NULL OR abs(inclinacao_long_pct) <= 20)
    AND (inclinacao_transv_pct IS NULL OR abs(inclinacao_transv_pct) <= 20)
    AND (inclinacao_azimute_deg IS NULL OR (inclinacao_azimute_deg >= 0 AND inclinacao_azimute_deg < 360))
  );

COMMIT;
