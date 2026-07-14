-- Migration: Fase 6.1 — Classificação de Risco R1/R2/R3
-- Manual Interno §3 — PLANO_MODULO_CONTRATOS_GAPS.md
-- 8 fatores (0/1/2 cada). Soma 0-4 = R1; 5-9 = R2; 10+ = R3.

CREATE TABLE IF NOT EXISTS public.contract_risk_assessments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contract_id         UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    -- Fatores do Manual §3 — cada um 0 (baixo), 1 (médio) ou 2 (alto)
    factor_canteiro     SMALLINT NOT NULL DEFAULT 0 CHECK (factor_canteiro BETWEEN 0 AND 2),      -- presença no canteiro
    factor_equipe       SMALLINT NOT NULL DEFAULT 0 CHECK (factor_equipe BETWEEN 0 AND 2),         -- tamanho da equipe
    factor_sst          SMALLINT NOT NULL DEFAULT 0 CHECK (factor_sst BETWEEN 0 AND 2),            -- risco de SST
    factor_valor        SMALLINT NOT NULL DEFAULT 0 CHECK (factor_valor BETWEEN 0 AND 2),          -- valor do contrato
    factor_tecnica      SMALLINT NOT NULL DEFAULT 0 CHECK (factor_tecnica BETWEEN 0 AND 2),        -- responsabilidade técnica/ART
    factor_dados        SMALLINT NOT NULL DEFAULT 0 CHECK (factor_dados BETWEEN 0 AND 2),          -- acesso a dados/sistemas
    factor_continuidade SMALLINT NOT NULL DEFAULT 0 CHECK (factor_continuidade BETWEEN 0 AND 2),   -- recorrência/essencialidade
    factor_pf           SMALLINT NOT NULL DEFAULT 0 CHECK (factor_pf BETWEEN 0 AND 2),             -- pessoa física habitual/integrada
    score               SMALLINT GENERATED ALWAYS AS (
                            factor_canteiro + factor_equipe + factor_sst + factor_valor +
                            factor_tecnica + factor_dados + factor_continuidade + factor_pf
                        ) STORED,
    level               TEXT GENERATED ALWAYS AS (
                            CASE
                                WHEN (factor_canteiro + factor_equipe + factor_sst + factor_valor +
                                      factor_tecnica + factor_dados + factor_continuidade + factor_pf) >= 10 THEN 'R3'
                                WHEN (factor_canteiro + factor_equipe + factor_sst + factor_valor +
                                      factor_tecnica + factor_dados + factor_continuidade + factor_pf) >= 5 THEN 'R2'
                                ELSE 'R1'
                            END
                        ) STORED,
    assessed_by         TEXT,
    assessed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uma avaliação vigente por contrato (reavaliação = update, não novo registro)
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_risk_assessments_contract ON public.contract_risk_assessments (contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_risk_assessments_org ON public.contract_risk_assessments (organization_id);
CREATE INDEX IF NOT EXISTS idx_contract_risk_assessments_level ON public.contract_risk_assessments (organization_id, level);

ALTER TABLE public.contract_risk_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_contract_risk_assessments" ON public.contract_risk_assessments;
CREATE POLICY "org_access_contract_risk_assessments" ON public.contract_risk_assessments
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP TRIGGER IF EXISTS trg_contract_risk_assessments_updated_at ON public.contract_risk_assessments;
CREATE TRIGGER trg_contract_risk_assessments_updated_at
    BEFORE UPDATE ON public.contract_risk_assessments
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
