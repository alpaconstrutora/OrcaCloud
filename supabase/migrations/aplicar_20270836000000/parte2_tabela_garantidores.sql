-- ═════════════════════════════════════════════════════════════════════════════
-- Garantias Locatícias F1 — PARTE 2 de 5: `contract_guarantors`
-- ═════════════════════════════════════════════════════════════════════════════
-- ⚠️ Rodar SOZINHA, depois da parte 1.
--
-- Uma tabela por parte de propósito: cada CREATE TABLE com FK para
-- `organizations` pega SHARE ROW EXCLUSIVE nela. Três CREATE TABLEs juntos
-- seguram esse lock pelo tempo dos três — que foi o que abriu a janela do
-- deadlock. Isolado, o lock dura milissegundos.

SET lock_timeout = '5s';

-- Pode haver MAIS DE UM fiador dentro da mesma modalidade FIANCA — isso não é
-- cumulação de modalidades (art. 43), é pluralidade de garantidores da mesma.
-- Por isso é tabela filha, não coluna.
CREATE TABLE IF NOT EXISTS public.contract_guarantors (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    guarantee_id           UUID NOT NULL REFERENCES public.contract_guarantees(id) ON DELETE CASCADE,
    person_type            TEXT NOT NULL DEFAULT 'PF' CHECK (person_type IN ('PF', 'PJ')),
    name                   TEXT NOT NULL,
    document               TEXT,
    email                  TEXT,
    phone                  TEXT,
    address                TEXT,

    -- Outorga conjugal — CC arts. 1.647 a 1.649. Salvo separação absoluta, a
    -- fiança prestada sem consentimento do cônjuge é anulável. A aplicação
    -- ALERTA; não bloqueia, porque o regime pode dispensar.
    marital_status         TEXT,
    marital_regime         TEXT,
    spouse_name            TEXT,
    spouse_document        TEXT,
    spouse_consent         BOOLEAN NOT NULL DEFAULT false,

    monthly_income         DECIMAL(15,2),
    net_worth              DECIMAL(15,2),
    income_commitment_pct  NUMERIC,
    properties_offered     TEXT,
    analysis_result        TEXT CHECK (analysis_result IS NULL OR analysis_result IN
                                       ('PENDENTE', 'APROVADO', 'REPROVADO')),
    analysis_notes         TEXT,
    documents_valid_until  DATE,
    signed                 BOOLEAN NOT NULL DEFAULT false,

    -- Caução em bem: o titular do bem também é um "garantidor" nesta tabela.
    asset_description      TEXT,
    asset_value            DECIMAL(15,2),
    asset_valuation_date   DATE,
    asset_registration     TEXT,
    asset_encumbrances     TEXT,

    notes                  TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_guarantors_guarantee ON public.contract_guarantors (guarantee_id);
CREATE INDEX IF NOT EXISTS idx_contract_guarantors_org       ON public.contract_guarantors (organization_id);

ALTER TABLE public.contract_guarantors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_contract_guarantors" ON public.contract_guarantors;
CREATE POLICY "org_access_contract_guarantors" ON public.contract_guarantors
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP TRIGGER IF EXISTS trg_contract_guarantors_updated_at ON public.contract_guarantors;
CREATE TRIGGER trg_contract_guarantors_updated_at
    BEFORE UPDATE ON public.contract_guarantors
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
