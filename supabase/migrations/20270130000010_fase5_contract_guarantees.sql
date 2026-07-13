-- Migration: Fase 5.1 — Seguros & Garantias do contrato
-- Contrato Matriz CP-08/CP-10/Cl.24/Anexo VIII — PLANO_MODULO_CONTRATOS_GAPS.md

CREATE TABLE IF NOT EXISTS public.contract_guarantees (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contract_id      UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    kind             TEXT NOT NULL CHECK (kind IN (
                        'RC_GERAL', 'RC_PROFISSIONAL', 'SEGURO_GARANTIA', 'FIANCA',
                        'CAUCAO', 'EQUIPAMENTOS', 'AMBIENTAL', 'GARANTIA_ADIANTAMENTO'
                     )),
    insurer          TEXT,               -- seguradora / instituição garantidora
    policy_number    TEXT,               -- nº da apólice / instrumento
    coverage_limit   DECIMAL(15,2),
    premium          DECIMAL(15,2),
    valid_from       DATE,
    valid_until      DATE,
    document_url     TEXT,               -- GED: apólice + comprovante de prêmio
    status           TEXT NOT NULL DEFAULT 'VIGENTE'
                     CHECK (status IN ('VIGENTE', 'VENCIDA', 'CANCELADA', 'SUBSTITUIDA')),
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_guarantees_contract ON public.contract_guarantees (contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_guarantees_org      ON public.contract_guarantees (organization_id);
CREATE INDEX IF NOT EXISTS idx_contract_guarantees_expiring ON public.contract_guarantees (valid_until) WHERE status = 'VIGENTE';

ALTER TABLE public.contract_guarantees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_contract_guarantees" ON public.contract_guarantees;
CREATE POLICY "org_access_contract_guarantees" ON public.contract_guarantees
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

-- fn_set_updated_at já existe (ver 20261130000001_almoxarifado_phase1.sql)
DROP TRIGGER IF EXISTS trg_contract_guarantees_updated_at ON public.contract_guarantees;
CREATE TRIGGER trg_contract_guarantees_updated_at
    BEFORE UPDATE ON public.contract_guarantees
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- RPC de apoio ao KPI "Apólices vencendo em N dias" do ContractsDashboard,
-- seguindo o mesmo padrão de checagem de organização das demais fn_* do módulo.
CREATE OR REPLACE FUNCTION public.fn_contract_guarantees_expiring(
    p_organization_id UUID,
    p_days            INT DEFAULT 30
)
RETURNS TABLE (
    guarantee_id   UUID,
    contract_id    UUID,
    contract_title TEXT,
    kind           TEXT,
    insurer        TEXT,
    valid_until    DATE,
    days_remaining INT
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

  RETURN QUERY
  SELECT g.id, g.contract_id, c.title, g.kind, g.insurer, g.valid_until,
         (g.valid_until - CURRENT_DATE)::INT
  FROM public.contract_guarantees g
  JOIN public.contracts c ON c.id = g.contract_id
  WHERE g.organization_id = ANY(v_targets)
    AND g.status = 'VIGENTE'
    AND g.valid_until IS NOT NULL
    AND g.valid_until <= CURRENT_DATE + p_days
  ORDER BY g.valid_until ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_contract_guarantees_expiring(uuid, int) TO authenticated;
