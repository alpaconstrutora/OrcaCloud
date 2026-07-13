-- Migration: Fase 5.3 — Penalidades & Limite de Responsabilidade
-- Contrato Matriz CP-09/CP-10/Cl.23/Cl.31 — PLANO_MODULO_CONTRATOS_GAPS.md

ALTER TABLE public.contracts
    ADD COLUMN IF NOT EXISTS liability_cap          DECIMAL(15,2),  -- limite geral de responsabilidade
    ADD COLUMN IF NOT EXISTS penalty_daily_rate      DECIMAL(6,4),  -- % ao dia (mora)
    ADD COLUMN IF NOT EXISTS penalty_moratoria_cap   DECIMAL(6,4),  -- teto da mora (% da base)
    ADD COLUMN IF NOT EXISTS penalty_material_rate   DECIMAL(6,4);  -- % inadimplemento material

CREATE TABLE IF NOT EXISTS public.contract_penalties (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contract_id              UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    kind                     TEXT NOT NULL CHECK (kind IN ('MORATORIA', 'COMPENSATORIA', 'SST', 'OUTRA')),
    reason                   TEXT NOT NULL,
    base_value               DECIMAL(15,2),
    amount                   DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
    status                   TEXT NOT NULL DEFAULT 'NOTIFICADA'
                             CHECK (status IN ('NOTIFICADA', 'EM_CURA', 'APLICADA', 'CANCELADA')),
    cure_deadline            DATE,                     -- prazo de cura (3 dias úteis padrão — Cl.31.1)
    applied_at               DATE,
    compensated_measurement_id UUID REFERENCES public.contract_measurements(id) ON DELETE SET NULL,
    notes                    TEXT,
    created_by               TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_penalties_contract ON public.contract_penalties (contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_penalties_org      ON public.contract_penalties (organization_id);
CREATE INDEX IF NOT EXISTS idx_contract_penalties_status   ON public.contract_penalties (contract_id, status);

ALTER TABLE public.contract_penalties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_contract_penalties" ON public.contract_penalties;
CREATE POLICY "org_access_contract_penalties" ON public.contract_penalties
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP TRIGGER IF EXISTS trg_contract_penalties_updated_at ON public.contract_penalties;
CREATE TRIGGER trg_contract_penalties_updated_at
    BEFORE UPDATE ON public.contract_penalties
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
