-- Migration: Fase 6.4 — Matriz Documental & Condicionantes de Pagamento
-- Contrato Matriz Anexo V, Manual Interno §14 — PLANO_MODULO_CONTRATOS_GAPS.md
-- Estende o release_requirements (booleano) já existente para uma matriz por
-- documento, alimentando o gate de pagamento (createMeasurement).

CREATE TABLE IF NOT EXISTS public.contract_document_requirements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contract_id     UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    document        TEXT NOT NULL,             -- CND, FGTS, ART/RRT, PGR/PCMSO/ASO, Apólice, NF...
    phase           TEXT NOT NULL              -- fase em que o documento é exigido (Anexo V)
        CHECK (phase IN ('ANTES_INICIO', 'MENSAL', 'ENCERRAMENTO')),
    applicable      BOOLEAN NOT NULL DEFAULT true,
    last_valid_until DATE,                     -- validade do documento mais recente enviado
    document_url    TEXT,
    blocks_payment  BOOLEAN NOT NULL DEFAULT true,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_document_requirements_contract ON public.contract_document_requirements (contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_document_requirements_org      ON public.contract_document_requirements (organization_id);

ALTER TABLE public.contract_document_requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_contract_document_requirements" ON public.contract_document_requirements;
CREATE POLICY "org_access_contract_document_requirements" ON public.contract_document_requirements
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP TRIGGER IF EXISTS trg_contract_document_requirements_updated_at ON public.contract_document_requirements;
CREATE TRIGGER trg_contract_document_requirements_updated_at
    BEFORE UPDATE ON public.contract_document_requirements
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- Consolida o que bloqueia a próxima medição: documentos MENSAL vencidos +
-- release_requirements já existente na tabela contracts. Usado pelo gate de
-- pagamento (createMeasurement) e pelo card "Matriz Documental" na UI.
CREATE OR REPLACE FUNCTION public.fn_contract_document_gate(p_contract_id UUID)
RETURNS TABLE (
    document        TEXT,
    phase           TEXT,
    last_valid_until DATE,
    is_expired      BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT d.document, d.phase, d.last_valid_until,
           (d.applicable AND d.blocks_payment AND d.phase = 'MENSAL'
            AND (d.last_valid_until IS NULL OR d.last_valid_until < CURRENT_DATE)) AS is_expired
    FROM public.contract_document_requirements d
    WHERE d.contract_id = p_contract_id
      AND d.applicable
      AND d.blocks_payment
    ORDER BY d.phase, d.document;
$$;

GRANT EXECUTE ON FUNCTION public.fn_contract_document_gate(uuid) TO authenticated;
