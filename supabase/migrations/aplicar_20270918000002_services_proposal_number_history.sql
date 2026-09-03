-- "Regerar número" para Proposta do CRM de Serviços
-- (services_proposals.proposal_number). Mesmo padrão de
-- 20270913000000_contract_number_history.sql. Ver docs/planos/ (rodada 2026-08-31).
--
-- REGRA DE BLOQUEIO (decisão do usuário, 2026-08-31): status <> 'draft' —
-- qualquer coisa depois de Rascunho (sent/accepted/rejected/expired) trava.
-- Uma vez enviada ao cliente, o número já está na cópia dele.

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.services_proposal_number_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,   -- sem FK (anti-deadlock)
    proposal_id     UUID NOT NULL,   -- sem FK
    old_number      TEXT,
    new_number      TEXT NOT NULL,
    changed_by      TEXT,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.services_proposal_number_history IS
    'Histórico de "Regerar número" de Propostas do CRM de Serviços. Ver docs/planos/.';

CREATE INDEX IF NOT EXISTS idx_services_proposal_number_history_proposal
    ON public.services_proposal_number_history(proposal_id, changed_at DESC);

ALTER TABLE public.services_proposal_number_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "services_proposal_number_history_select" ON public.services_proposal_number_history
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

REVOKE ALL ON public.services_proposal_number_history FROM PUBLIC;
REVOKE ALL ON public.services_proposal_number_history FROM anon;
GRANT SELECT ON public.services_proposal_number_history TO authenticated;

-- ═══ Motivo do bloqueio ═══
CREATE OR REPLACE FUNCTION public.fn_services_proposal_number_lock_reason(p_proposal_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_proposal RECORD;
BEGIN
    SELECT p.id, p.organization_id, p.status
      INTO v_proposal
      FROM public.services_proposals p
     WHERE p.id = p_proposal_id;

    IF NOT FOUND THEN
        RETURN 'Proposta não encontrada.';
    END IF;

    IF NOT public.is_org_member(v_proposal.organization_id) THEN
        RETURN 'Sem acesso a esta proposta.';
    END IF;

    IF v_proposal.status <> 'draft' THEN
        RETURN format('Proposta em "%s" — o número só pode ser regerado enquanto ela está em Rascunho.', v_proposal.status);
    END IF;

    RETURN NULL;
END;
$X$;

-- ═══ Regera de fato ═══
CREATE OR REPLACE FUNCTION public.fn_regenerate_services_proposal_number(
    p_proposal_id UUID,
    p_new_number TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_reason TEXT;
    v_old TEXT;
    v_org UUID;
BEGIN
    IF COALESCE(p_new_number, '') = '' THEN
        RAISE EXCEPTION 'Número novo não informado.' USING ERRCODE = '22023';
    END IF;

    v_reason := public.fn_services_proposal_number_lock_reason(p_proposal_id);
    IF v_reason IS NOT NULL THEN
        RAISE EXCEPTION '%', v_reason USING ERRCODE = '42501';
    END IF;

    SELECT proposal_number, organization_id INTO v_old, v_org
      FROM public.services_proposals WHERE id = p_proposal_id;

    UPDATE public.services_proposals
       SET proposal_number = p_new_number, updated_at = NOW()
     WHERE id = p_proposal_id;

    INSERT INTO public.services_proposal_number_history
        (organization_id, proposal_id, old_number, new_number, changed_by)
    VALUES (v_org, p_proposal_id, v_old, p_new_number, auth.jwt() ->> 'email');

    RETURN p_new_number;
END;
$X$;

REVOKE ALL ON FUNCTION public.fn_services_proposal_number_lock_reason(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_services_proposal_number_lock_reason(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_services_proposal_number_lock_reason(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_regenerate_services_proposal_number(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_regenerate_services_proposal_number(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_regenerate_services_proposal_number(UUID, TEXT) TO authenticated;
