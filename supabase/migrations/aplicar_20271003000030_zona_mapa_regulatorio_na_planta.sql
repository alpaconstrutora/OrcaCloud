-- ============================================================================
-- Zona do Mapa Regulatório na Planta Inteligente — o que faltava (03/10/2026)
--
-- Plano `docs/planos/2026-10-03-zona-mapa-regulatorio-na-planta.md` (comparação Planta × Mapa Regulatório):
--
--  1. As duas tabelas de zona (`regulatory_map_zones`, o catálogo por cidade; `empreendimento_regulatory_zones`, a
--     cópia do empreendimento) ganham os campos que a Planta já sabe ler e que só existiam digitados à mão no estudo:
--     testada mínima, área mínima do lote, insolação mínima, afastamento progressivo, recuo de frente escalonado.
--     TEXT, como as demais colunas da zona (quem digita lê a lei; a conversão é de `utils/regulatoryValue.ts`).
--  2. O contexto urbanístico do estudo (`blueprint_study_urban_context`) guarda o CA MÍNIMO e a ÁREA MÍNIMA DA UNIDADE
--     lidos da zona (antes ignorados pela Planta).
--
-- Só colunas: nenhuma policy nem função nova (REGRA #7 não se aplica). Idempotente (ADD COLUMN IF NOT EXISTS).
-- Aplicar com `db query -f`, nunca `supabase db push` (ver CLAUDE.md).
-- ============================================================================
SET lock_timeout = '5s';

ALTER TABLE public.regulatory_map_zones
  ADD COLUMN IF NOT EXISTS testada_minima text,
  ADD COLUMN IF NOT EXISTS area_minima_lote text,
  ADD COLUMN IF NOT EXISTS insolacao_minima text,
  ADD COLUMN IF NOT EXISTS afastamento_progressivo text,
  ADD COLUMN IF NOT EXISTS recuo_frente_escalonado text;

ALTER TABLE public.empreendimento_regulatory_zones
  ADD COLUMN IF NOT EXISTS testada_minima text,
  ADD COLUMN IF NOT EXISTS area_minima_lote text,
  ADD COLUMN IF NOT EXISTS insolacao_minima text,
  ADD COLUMN IF NOT EXISTS afastamento_progressivo text,
  ADD COLUMN IF NOT EXISTS recuo_frente_escalonado text;

ALTER TABLE public.blueprint_study_urban_context
  ADD COLUMN IF NOT EXISTS coeficiente_minimo numeric,
  ADD COLUMN IF NOT EXISTS area_minima_unidade_m2 numeric;

COMMENT ON COLUMN public.regulatory_map_zones.afastamento_progressivo IS 'Ex.: "acima de 6 m: (H − 6)/10" — lido por lerAfastamentoProgressivo (Planta Inteligente).';
COMMENT ON COLUMN public.regulatory_map_zones.recuo_frente_escalonado IS 'Ex.: "5 m a partir do 3º pavimento" — lido por lerRecuoEscalonado (Planta Inteligente).';
COMMENT ON COLUMN public.blueprint_study_urban_context.coeficiente_minimo IS 'CA mínimo da zona: abaixo dele, o lote é subutilizado.';
COMMENT ON COLUMN public.blueprint_study_urban_context.area_minima_unidade_m2 IS 'Área mínima da unidade da zona, m² — conferida contra as tipologias do produto.';
