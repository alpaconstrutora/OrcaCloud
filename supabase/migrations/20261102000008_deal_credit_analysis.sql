-- =============================================================================
-- Fase 2.1 — Análise de Crédito Manual
-- =============================================================================
-- Checklist documental + score interno + upload de PDF por deal imobiliário.
-- Ligado a commercial_deals (deal de compra/venda/locação).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.deal_credit_analysis (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    deal_id         UUID NOT NULL REFERENCES public.commercial_deals(id) ON DELETE CASCADE,

    -- Score calculado (0–100) com base no checklist
    score           INTEGER CHECK (score BETWEEN 0 AND 100),
    -- APROVADO | REPROVADO | PENDENTE | EM_ANALISE
    result          TEXT NOT NULL DEFAULT 'PENDENTE'
                        CHECK (result IN ('PENDENTE', 'EM_ANALISE', 'APROVADO', 'REPROVADO')),

    -- Checklist documental (JSONB: { rg: bool, cpf: bool, comprov_renda: bool, ... })
    checklist       JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Observações do analista
    notes           TEXT,

    -- PDF do laudo de crédito (Storage URL)
    report_pdf_url  TEXT,

    -- Quem analisou e quando
    analyzed_by     TEXT,
    analyzed_at     TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (deal_id)  -- uma análise por deal
);

CREATE INDEX IF NOT EXISTS idx_deal_credit_analysis_org  ON public.deal_credit_analysis(organization_id);
CREATE INDEX IF NOT EXISTS idx_deal_credit_analysis_deal ON public.deal_credit_analysis(deal_id);

CREATE OR REPLACE FUNCTION public.tg_deal_credit_analysis_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_deal_credit_updated_at ON public.deal_credit_analysis;
CREATE TRIGGER trg_deal_credit_updated_at
    BEFORE UPDATE ON public.deal_credit_analysis
    FOR EACH ROW EXECUTE FUNCTION public.tg_deal_credit_analysis_updated_at();

ALTER TABLE public.deal_credit_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY deal_credit_analysis_org ON public.deal_credit_analysis
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));
