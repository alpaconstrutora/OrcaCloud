-- Migration: Fase 7.2 — Responsabilidade Técnica (ART/RRT/TRT)
-- Contrato Matriz Cl.10, CP-01, Anexo E — PLANO_MODULO_CONTRATOS_GAPS.md

CREATE TABLE IF NOT EXISTS public.contract_technical_responsibilities (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contract_id       UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    professional_name TEXT NOT NULL,
    council           TEXT CHECK (council IN ('CREA', 'CAU', 'CRT')),
    council_number    TEXT,
    art_type          TEXT NOT NULL CHECK (art_type IN ('ART', 'RRT', 'TRT')),
    art_number        TEXT,
    valid_from        DATE,
    valid_until       DATE,
    status            TEXT NOT NULL DEFAULT 'VALIDA' CHECK (status IN ('VALIDA', 'SUSPENSA', 'CANCELADA', 'BAIXADA')),
    document_url      TEXT,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_technical_resp_contract ON public.contract_technical_responsibilities (contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_technical_resp_org      ON public.contract_technical_responsibilities (organization_id);

ALTER TABLE public.contract_technical_responsibilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_contract_technical_responsibilities" ON public.contract_technical_responsibilities;
CREATE POLICY "org_access_contract_technical_responsibilities" ON public.contract_technical_responsibilities
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP TRIGGER IF EXISTS trg_contract_technical_resp_updated_at ON public.contract_technical_responsibilities;
CREATE TRIGGER trg_contract_technical_resp_updated_at
    BEFORE UPDATE ON public.contract_technical_responsibilities
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ART/RRT/TRT inválida ou vencida suspende o trecho (Cl.10.2) — usado no gate
-- de pagamento do createMeasurement, no mesmo espírito do fn_contract_document_gate.
CREATE OR REPLACE FUNCTION public.fn_contract_technical_gate(p_contract_id UUID)
RETURNS TABLE (
    professional_name TEXT,
    art_type          TEXT,
    art_number        TEXT,
    status            TEXT,
    valid_until       DATE,
    is_blocking       BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT t.professional_name, t.art_type, t.art_number, t.status, t.valid_until,
           (t.status <> 'VALIDA' OR (t.valid_until IS NOT NULL AND t.valid_until < CURRENT_DATE)) AS is_blocking
    FROM public.contract_technical_responsibilities t
    WHERE t.contract_id = p_contract_id
    ORDER BY t.professional_name;
$$;

GRANT EXECUTE ON FUNCTION public.fn_contract_technical_gate(uuid) TO authenticated;
