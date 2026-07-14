-- Migration: Fase 7.3 — Avaliação de Desempenho do Prestador
-- Manual Interno §17 — PLANO_MODULO_CONTRATOS_GAPS.md
-- Pesos do Manual: qualidade 25%, prazo 20%, SST 20%, documentação 15%,
-- comunicação 10%, comercial 10%. Nota agregada volta para o Fornecedor.

CREATE TABLE IF NOT EXISTS public.contract_evaluations (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contract_id           UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    supplier_id           UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    period                TEXT,                     -- ex.: '2026-07' (mês de referência)
    score_quality         NUMERIC(3,1) NOT NULL CHECK (score_quality BETWEEN 0 AND 5),
    score_deadline        NUMERIC(3,1) NOT NULL CHECK (score_deadline BETWEEN 0 AND 5),
    score_sst             NUMERIC(3,1) NOT NULL CHECK (score_sst BETWEEN 0 AND 5),
    score_compliance      NUMERIC(3,1) NOT NULL CHECK (score_compliance BETWEEN 0 AND 5),
    score_communication   NUMERIC(3,1) NOT NULL CHECK (score_communication BETWEEN 0 AND 5),
    score_commercial      NUMERIC(3,1) NOT NULL CHECK (score_commercial BETWEEN 0 AND 5),
    weighted              NUMERIC(4,2) GENERATED ALWAYS AS (
                              score_quality * 0.25 + score_deadline * 0.20 + score_sst * 0.20 +
                              score_compliance * 0.15 + score_communication * 0.10 + score_commercial * 0.10
                          ) STORED,
    critical_occurrence   BOOLEAN NOT NULL DEFAULT false,  -- ocorrência crítica isolada (Manual §17.1)
    evaluated_by          TEXT,
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_evaluations_contract ON public.contract_evaluations (contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_evaluations_supplier ON public.contract_evaluations (supplier_id);
CREATE INDEX IF NOT EXISTS idx_contract_evaluations_org      ON public.contract_evaluations (organization_id);

ALTER TABLE public.contract_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_contract_evaluations" ON public.contract_evaluations;
CREATE POLICY "org_access_contract_evaluations" ON public.contract_evaluations
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

-- Nota média + sinalização de bloqueio (Manual §17.1: nota < 2 ou ocorrência
-- crítica pode bloquear novas contratações) — consumido pelo cadastro do Fornecedor.
CREATE OR REPLACE FUNCTION public.fn_supplier_performance(p_supplier_id UUID)
RETURNS TABLE (
    evaluation_count   BIGINT,
    average_weighted   NUMERIC,
    has_critical       BOOLEAN,
    should_block       BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT
        COUNT(*),
        ROUND(AVG(weighted), 2),
        BOOL_OR(critical_occurrence),
        (AVG(weighted) < 2 OR BOOL_OR(critical_occurrence))
    FROM public.contract_evaluations
    WHERE supplier_id = p_supplier_id;
$$;

GRANT EXECUTE ON FUNCTION public.fn_supplier_performance(uuid) TO authenticated;
