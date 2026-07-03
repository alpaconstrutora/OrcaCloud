-- ============================================================
-- Modulo: Areas NBR 12721 / F4 — write-back para Empreendimentos
-- Motivo: fechar o ciclo comercial<->legal. O importador (F1) materializa
--   1 unidade do motor por EmpreendimentoUnit, mas nao ha rastro de qual
--   area_version_unit veio de qual empreendimento_unit. Sem isso o write-back
--   da fracao ideal calculada nao teria como casar as linhas com seguranca.
-- ============================================================

-- Rastreabilidade: qual empreendimento_unit originou esta area_version_unit.
-- Nullable — unidades criadas manualmente no editor (fora de um import) ficam null.
ALTER TABLE public.area_version_units
    ADD COLUMN IF NOT EXISTS source_empreendimento_unit_id UUID REFERENCES public.empreendimento_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_area_version_units_source_empreendimento
    ON public.area_version_units(source_empreendimento_unit_id)
    WHERE source_empreendimento_unit_id IS NOT NULL;

-- Campos de escrita reversa no cadastro comercial. Nunca sobrescreve private_area/
-- common_area (dados de origem do empreendimento) — sao campos NOVOS, so-leitura
-- para o usuario do Comercial, alimentados exclusivamente pelo motor de areas.
ALTER TABLE public.empreendimento_units
    ADD COLUMN IF NOT EXISTS fracao_ideal_decimal NUMERIC(18,12),
    ADD COLUMN IF NOT EXISTS fracao_ideal_thousandths NUMERIC(18,8),
    ADD COLUMN IF NOT EXISTS area_real_total_m2 NUMERIC(18,6),
    ADD COLUMN IF NOT EXISTS area_engine_version_id UUID REFERENCES public.area_versions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS area_engine_synced_at TIMESTAMPTZ;
