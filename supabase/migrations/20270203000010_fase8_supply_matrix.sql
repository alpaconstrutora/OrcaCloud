-- Migration: Fase 8.1 — Matriz de Fornecimento & Interfaces
-- Contrato Matriz Anexos I/II, Cl.11 — PLANO_MODULO_CONTRATOS_GAPS.md
-- Substitui a granularidade agregada de labor_value/materials_value por uma
-- matriz item-a-item de quem fornece/transporta/guarda/instala, e a matriz
-- de interfaces (liberação de frente, projeto, material crítico, inspeção...).

CREATE TABLE IF NOT EXISTS public.contract_supply_matrix (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contract_id     UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    item            TEXT NOT NULL,             -- Materiais incorporados, Consumíveis, Ferramentas, EPIs...
    supplies        TEXT,                      -- quem fornece: ALPA | CONTRATADO
    transports      TEXT,
    stores          TEXT,
    installs        TEXT,
    admissible_loss TEXT,                      -- perda admissível / observação
    notes           TEXT,
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contract_interfaces (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contract_id         UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    interface_event     TEXT NOT NULL,          -- Liberação de frente, Projeto/revisão, Material crítico...
    primary_responsible TEXT,
    support             TEXT,
    deadline_trigger    TEXT,                   -- prazo/gatilho (texto livre, ex.: "D-5 antes da mobilização")
    evidence            TEXT,                   -- evidência esperada
    sort_order          SMALLINT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_supply_matrix_contract ON public.contract_supply_matrix (contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_supply_matrix_org      ON public.contract_supply_matrix (organization_id);
CREATE INDEX IF NOT EXISTS idx_contract_interfaces_contract    ON public.contract_interfaces (contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_interfaces_org         ON public.contract_interfaces (organization_id);

ALTER TABLE public.contract_supply_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_interfaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_contract_supply_matrix" ON public.contract_supply_matrix;
CREATE POLICY "org_access_contract_supply_matrix" ON public.contract_supply_matrix
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "org_access_contract_interfaces" ON public.contract_interfaces;
CREATE POLICY "org_access_contract_interfaces" ON public.contract_interfaces
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP TRIGGER IF EXISTS trg_contract_supply_matrix_updated_at ON public.contract_supply_matrix;
CREATE TRIGGER trg_contract_supply_matrix_updated_at
    BEFORE UPDATE ON public.contract_supply_matrix
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_contract_interfaces_updated_at ON public.contract_interfaces;
CREATE TRIGGER trg_contract_interfaces_updated_at
    BEFORE UPDATE ON public.contract_interfaces
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
