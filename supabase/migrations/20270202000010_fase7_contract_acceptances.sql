-- Migration: Fase 7.1 — Recebimento Provisório/Definitivo & Dossiê
-- Contrato Matriz Cl.21, Cl.33, Manual Interno §18 — PLANO_MODULO_CONTRATOS_GAPS.md

CREATE TABLE IF NOT EXISTS public.contract_acceptances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contract_id     UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN ('PROVISORIO', 'DEFINITIVO')),
    issued_at       DATE NOT NULL DEFAULT CURRENT_DATE,
    pending_items   JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{description, deadline, responsible}]
    term_url        TEXT,                                -- termo assinado (GED)
    issued_by       TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Um termo definitivo por contrato (o provisório pode ser reemitido se houver pendências corrigidas)
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_acceptances_definitivo
    ON public.contract_acceptances (contract_id) WHERE kind = 'DEFINITIVO';
CREATE INDEX IF NOT EXISTS idx_contract_acceptances_contract ON public.contract_acceptances (contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_acceptances_org      ON public.contract_acceptances (organization_id);

ALTER TABLE public.contract_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_contract_acceptances" ON public.contract_acceptances;
CREATE POLICY "org_access_contract_acceptances" ON public.contract_acceptances
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));
