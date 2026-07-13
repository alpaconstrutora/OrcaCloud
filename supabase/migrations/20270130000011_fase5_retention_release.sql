-- Migration: Fase 5.2 — Retenção faseada / liberação do contrato
-- Contrato Matriz CP-08/Cl.18 — PLANO_MODULO_CONTRATOS_GAPS.md
-- retention_rate e retention_value (na medição) já existem; aqui só o
-- desenho da liberação (limite acumulado + % por marco + carência).

ALTER TABLE public.contracts
    ADD COLUMN IF NOT EXISTS retention_cap                DECIMAL(15,2),
    ADD COLUMN IF NOT EXISTS retention_release_provisional INT NOT NULL DEFAULT 50
        CHECK (retention_release_provisional BETWEEN 0 AND 100),
    ADD COLUMN IF NOT EXISTS retention_release_definitive  INT NOT NULL DEFAULT 50
        CHECK (retention_release_definitive BETWEEN 0 AND 100),
    ADD COLUMN IF NOT EXISTS retention_definitive_days     INT NOT NULL DEFAULT 90;

-- Registro de liberação de retenção — cada linha é um evento de liberação
-- (provisório ou definitivo), lançado manualmente ou pelo recebimento (Fase 7).
CREATE TABLE IF NOT EXISTS public.contract_retention_releases (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contract_id      UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    kind             TEXT NOT NULL CHECK (kind IN ('PROVISORIO', 'DEFINITIVO', 'MANUAL')),
    amount           DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    released_at      DATE NOT NULL DEFAULT CURRENT_DATE,
    released_by      TEXT,
    notes            TEXT,
    internal_transaction_id UUID REFERENCES public.internal_transactions(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_retention_releases_contract ON public.contract_retention_releases (contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_retention_releases_org      ON public.contract_retention_releases (organization_id);

ALTER TABLE public.contract_retention_releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_contract_retention_releases" ON public.contract_retention_releases;
CREATE POLICY "org_access_contract_retention_releases" ON public.contract_retention_releases
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

-- Ledger consolidado: retido (soma das medições) vs liberado vs saldo — usado
-- pelo card "Retenção" na aba Financeiro do ContractDetailView.
CREATE OR REPLACE FUNCTION public.fn_contract_retention_ledger(p_contract_id UUID)
RETURNS TABLE (
    total_retained   DECIMAL,
    total_released   DECIMAL,
    balance          DECIMAL,
    retention_cap    DECIMAL
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT
        COALESCE((SELECT SUM(m.retention_value) FROM public.contract_measurements m
                  WHERE m.contract_id = p_contract_id AND m.status <> 'Cancelada'), 0) AS total_retained,
        COALESCE((SELECT SUM(r.amount) FROM public.contract_retention_releases r
                  WHERE r.contract_id = p_contract_id), 0) AS total_released,
        COALESCE((SELECT SUM(m.retention_value) FROM public.contract_measurements m
                  WHERE m.contract_id = p_contract_id AND m.status <> 'Cancelada'), 0)
          - COALESCE((SELECT SUM(r.amount) FROM public.contract_retention_releases r
                  WHERE r.contract_id = p_contract_id), 0) AS balance,
        (SELECT c.retention_cap FROM public.contracts c WHERE c.id = p_contract_id) AS retention_cap;
$$;

GRANT EXECUTE ON FUNCTION public.fn_contract_retention_ledger(uuid) TO authenticated;
