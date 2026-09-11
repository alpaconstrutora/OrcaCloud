-- ============================================================================
-- Planta Inteligente — topografia fase 7: pré-dimensionamento e rastreabilidade.
--
-- 1. `blueprint_study_terraplenagem` ganha as HIPÓTESES do pré-dimensionamento:
--    `hidraulica` (C, T, tc, IDF, Manning, lâmina) e `estrutura` (tipo de muro,
--    solo, sobrecarga, tensão admissível, concreto, embutimento, armadura).
--    JSON parcial: o que não está gravado cai no padrão do código.
--    A área contribuinte por linha de drenagem vai dentro de `drenagem[i]`
--    (`areaContribuinteM2`), sem coluna.
--
-- 2. `blueprint_snapshot_topografia`: QUAL versão de topografia estava em uso
--    quando a versão do estudo foi publicada. A topografia é dado do mundo e
--    fica FORA do payload canônico (o hash do desenho não pode mudar com ela);
--    este vínculo é o metadado que dá a rastreabilidade sem tocar no hash.
--    Imutável (só UPDATE bloqueado); some com o snapshot; se a versão de
--    topografia for apagada, ficam a versão, a fonte e o hash gravados aqui.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.blueprint_study_terraplenagem
    ADD COLUMN IF NOT EXISTS hidraulica JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS estrutura  JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.blueprint_study_terraplenagem.hidraulica IS
  'Hipóteses do pré-dimensionamento hidráulico (Método Racional + Manning): {coeficienteDeEscoamento, tempoDeRetornoAnos, tempoDeConcentracaoMin, idf{k,a,b,c}, intensidadeMmH, manningN, laminaMax}. Parcial; o resto é padrão.';
COMMENT ON COLUMN public.blueprint_study_terraplenagem.estrutura IS
  'Hipóteses do pré-dimensionamento do muro de arrimo (Rankine): {tipo AUTO|GRAVIDADE|FLEXAO, pesoDoSoloKNm3, anguloDeAtritoGraus, sobrecargaKNm2, tensaoAdmissivelKPa, pesoDoConcretoKNm3, pesoDoCiclopicoKNm3, embutimentoM, taxaDeArmaduraKgM3}. Parcial.';

CREATE TABLE IF NOT EXISTS public.blueprint_snapshot_topografia (
    snapshot_id     UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    study_id        UUID NOT NULL,
    -- SET NULL: apagar a versão de topografia não apaga o registro de que ela
    -- foi usada — versão, fonte e hash ficam abaixo.
    topografia_id   UUID REFERENCES public.blueprint_study_topografia(id) ON DELETE SET NULL,
    versao          INTEGER NOT NULL,
    fonte_codigo    TEXT NOT NULL,
    hash_resultado  TEXT NOT NULL,
    -- Sem FK para auth.users (deadlock em auth.users — ver aplicar_20270905000003).
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_snapshot_topografia_snapshot_fk
      FOREIGN KEY (snapshot_id, organization_id)
      REFERENCES public.blueprint_snapshots(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_blueprint_snapshot_topografia_study
    ON public.blueprint_snapshot_topografia(study_id);

COMMENT ON TABLE public.blueprint_snapshot_topografia IS
  'Versão de topografia em uso quando a versão do estudo foi publicada. Metadado fora do hash do desenho; imutável.';

DROP TRIGGER IF EXISTS trg_blueprint_snapshot_topografia_immutable ON public.blueprint_snapshot_topografia;
CREATE TRIGGER trg_blueprint_snapshot_topografia_immutable
    BEFORE UPDATE ON public.blueprint_snapshot_topografia
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_block_mutation();

ALTER TABLE public.blueprint_snapshot_topografia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_snapshot_topografia_read" ON public.blueprint_snapshot_topografia;
CREATE POLICY "blueprint_snapshot_topografia_read" ON public.blueprint_snapshot_topografia
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_snapshot_topografia_insert" ON public.blueprint_snapshot_topografia;
CREATE POLICY "blueprint_snapshot_topografia_insert" ON public.blueprint_snapshot_topografia
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id));

-- Privilégios padrão do Supabase dão ALL a anon/authenticated: tira tudo e
-- devolve só o que a tabela precisa (lição de aplicar_20270921000005).
REVOKE ALL ON public.blueprint_snapshot_topografia FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.blueprint_snapshot_topografia TO authenticated;

RESET lock_timeout;
