-- ============================================================================
-- Planta Inteligente — projeto executivo HIDROSSANITÁRIO, E3.3 (29/09/2026,
-- roadmap `docs/planos/2026-09-28-hidrossanitario-roadmap.md`):
--   1. `blueprint_study_hidro` — as PREMISSAS de água, pressão e esgoto por
--      estudo (uma linha por estudo, JSONB parcial completado com o padrão na
--      leitura — o mesmo desenho de `blueprint_study_eletrica`). Até aqui elas
--      viviam no navegador (localStorage): o mesmo estudo calculava diferente
--      em outra máquina, e a emissão amarra o hash DELAS.
--   2. `blueprint_study_projeto_executivo.disciplina` passa a aceitar
--      HIDROSSANITARIA — a mesma tabela de emissão da topografia e da elétrica.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ⚠️ Idempotente: CREATE … IF NOT EXISTS, DROP/ADD CONSTRAINT, DROP/CREATE
--    POLICY e TRIGGER. Não toca em linha EMITIDA (o CHECK só ALARGA).
-- ============================================================================

SET lock_timeout = '5s';

-- 1. Premissas hidrossanitárias ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.blueprint_study_hidro (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL,
    organization_id UUID NOT NULL,
    -- `HipotesesHidro`, parcial: { agua: HipotesesDeAgua, pressao:
    -- HipotesesDePressao, esgoto: HipotesesDeEsgoto }.
    hipoteses       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_study_hidro_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE,
    CONSTRAINT blueprint_study_hidro_study_key UNIQUE (study_id)
);

COMMENT ON TABLE public.blueprint_study_hidro IS
  'Premissas hidrossanitárias de um estudo de Planta Inteligente (NBR 5626 / 8160): '
  'velocidade máxima, DN mínimo, cota do ramal, pressões mínima e máxima, perdas no '
  'aquecedor e no hidrômetro, caimentos, DN do TQ e da ventilação. Fora do payload do desenho.';

DROP TRIGGER IF EXISTS trg_blueprint_hidro_updated ON public.blueprint_study_hidro;
CREATE TRIGGER trg_blueprint_hidro_updated
    BEFORE UPDATE ON public.blueprint_study_hidro
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_study_hidro ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_study_hidro_org" ON public.blueprint_study_hidro;
CREATE POLICY "blueprint_study_hidro_org"
    ON public.blueprint_study_hidro
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_study_hidro FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_study_hidro TO authenticated;

-- 2. A disciplina HIDROSSANITARIA na emissão executiva ───────────────────────

ALTER TABLE public.blueprint_study_projeto_executivo
    DROP CONSTRAINT IF EXISTS blueprint_projeto_executivo_disciplina_chk;
ALTER TABLE public.blueprint_study_projeto_executivo
    ADD CONSTRAINT blueprint_projeto_executivo_disciplina_chk
    CHECK (disciplina IN ('TERRAPLENAGEM', 'ELETRICA', 'HIDROSSANITARIA'));

COMMENT ON COLUMN public.blueprint_study_projeto_executivo.disciplina IS
  'Qual projeto executivo a linha emite: TERRAPLENAGEM (topografia, drenagem, contenção), ELETRICA (NBR 5410) ou HIDROSSANITARIA (NBR 5626 / 8160). Um rascunho por estudo POR disciplina.';

RESET lock_timeout;
