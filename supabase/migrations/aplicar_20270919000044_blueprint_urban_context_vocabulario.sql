-- Planta Inteligente · E3.1 (19/09/2026): VOCABULÁRIO COMPLEMENTAR da zona no
-- contexto urbanístico do estudo — testada mínima, área mínima do lote,
-- vagas por unidade, insolação mínima e afastamento progressivo por altura.
--
-- Vive em `blueprint_study_urban_context` (a cópia "em vigor" no estudo), e
-- não nas tabelas de zona (`empreendimento_regulatory_zones`,
-- `regulatory_map_zones`), porque os catálogos de hoje não têm estes campos:
-- o estudo os digita à mão lendo a lei, e quando o catálogo os ganhar a
-- leitura (`lerZona`) já os aceita como texto.
--
-- Idempotente (ADD COLUMN IF NOT EXISTS). Aplicar com `db query -f`, nunca
-- `db push` (histórico furado — ver CLAUDE.md).
ALTER TABLE public.blueprint_study_urban_context
  ADD COLUMN IF NOT EXISTS testada_minima_mm integer,
  ADD COLUMN IF NOT EXISTS area_minima_lote_m2 numeric,
  ADD COLUMN IF NOT EXISTS vagas_por_unidade numeric,
  ADD COLUMN IF NOT EXISTS insolacao_minima_h numeric,
  ADD COLUMN IF NOT EXISTS afastamento_progressivo_a_partir_m numeric,
  ADD COLUMN IF NOT EXISTS afastamento_progressivo_formula text;

COMMENT ON COLUMN public.blueprint_study_urban_context.testada_minima_mm IS 'Testada mínima do lote (mm), lida da lei ou digitada — E3.1';
COMMENT ON COLUMN public.blueprint_study_urban_context.area_minima_lote_m2 IS 'Área mínima do lote (m²) — E3.1';
COMMENT ON COLUMN public.blueprint_study_urban_context.vagas_por_unidade IS 'Vagas exigidas por unidade — alimenta o lançamento de vagas (E2.5)';
COMMENT ON COLUMN public.blueprint_study_urban_context.insolacao_minima_h IS 'Horas de insolação mínima nos dormitórios (solstício de inverno)';
COMMENT ON COLUMN public.blueprint_study_urban_context.afastamento_progressivo_a_partir_m IS 'Altura (m) a partir da qual vale a fórmula do afastamento progressivo';
COMMENT ON COLUMN public.blueprint_study_urban_context.afastamento_progressivo_formula IS 'Fórmula em h (metros) do afastamento lateral/fundos acima do limiar — motor de fórmulas E1.3';
