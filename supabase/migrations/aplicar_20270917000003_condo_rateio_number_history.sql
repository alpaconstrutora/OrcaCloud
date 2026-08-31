-- "Regerar número" para Rateio de Condomínio — mesmo padrão de
-- 20270913000000_contract_number_history.sql, aplicado a `condominio_rateios`.
-- Ver docs/planos/2026-08-30-regerar-numero-outros-modulos.md.
--
-- REGRA DE BLOQUEIO (decisão do usuário, 2026-08-30): `cobranca_gerada_em IS
-- NOT NULL` — as cotas já viraram recebíveis do condômino (boleto/PIX). Um
-- rateio FECHADO mas ainda sem cobrança gerada pode ter o número regerado.
-- (Não usamos `status = 'FECHADO'` como trava: o próprio código de
-- condominioRateioService.fechar() já trata o número como estável a partir do
-- fechamento, mas isso é o comportamento padrão do fluxo de criação — a ação
-- MANUAL de regerar é deliberadamente mais permissiva, igual ao raciocínio de
-- Contratos: a trava é sobre "já saiu para fora", não sobre "já existe".)

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.condo_rateio_number_history (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    UUID NOT NULL,   -- sem FK (anti-deadlock)
    rateio_id          UUID NOT NULL,   -- sem FK
    old_number         TEXT,
    new_number         TEXT NOT NULL,
    changed_by         TEXT,
    changed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.condo_rateio_number_history IS
    'Histórico de "Regerar número" de Rateios de Condomínio. Ver docs/planos/2026-08-30-regerar-numero-outros-modulos.md.';

CREATE INDEX IF NOT EXISTS idx_condo_rateio_number_history_rateio
    ON public.condo_rateio_number_history(rateio_id, changed_at DESC);

ALTER TABLE public.condo_rateio_number_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "condo_rateio_number_history_select" ON public.condo_rateio_number_history
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

REVOKE ALL ON public.condo_rateio_number_history FROM PUBLIC;
REVOKE ALL ON public.condo_rateio_number_history FROM anon;
GRANT SELECT ON public.condo_rateio_number_history TO authenticated;

-- ═══ Motivo do bloqueio ═══
CREATE OR REPLACE FUNCTION public.fn_condo_rateio_number_lock_reason(p_rateio_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_rateio RECORD;
BEGIN
    SELECT r.id, r.organization_id, r.number, r.cobranca_gerada_em
      INTO v_rateio
      FROM public.condominio_rateios r
     WHERE r.id = p_rateio_id;

    IF NOT FOUND THEN
        RETURN 'Rateio não encontrado.';
    END IF;

    IF NOT public.is_org_member(v_rateio.organization_id) THEN
        RETURN 'Sem acesso a este rateio.';
    END IF;

    IF v_rateio.number IS NULL THEN
        RETURN 'Este rateio ainda não tem número — feche o rateio primeiro.';
    END IF;

    IF v_rateio.cobranca_gerada_em IS NOT NULL THEN
        RETURN 'A cobrança deste rateio já foi gerada — o número não pode mais mudar.';
    END IF;

    RETURN NULL;
END;
$X$;

-- ═══ Regera de fato ═══
CREATE OR REPLACE FUNCTION public.fn_regenerate_condo_rateio_number(
    p_rateio_id UUID,
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

    v_reason := public.fn_condo_rateio_number_lock_reason(p_rateio_id);
    IF v_reason IS NOT NULL THEN
        RAISE EXCEPTION '%', v_reason USING ERRCODE = '42501';
    END IF;

    SELECT number, organization_id INTO v_old, v_org
      FROM public.condominio_rateios WHERE id = p_rateio_id;

    UPDATE public.condominio_rateios
       SET number = p_new_number, updated_at = NOW()
     WHERE id = p_rateio_id;

    INSERT INTO public.condo_rateio_number_history
        (organization_id, rateio_id, old_number, new_number, changed_by)
    VALUES (v_org, p_rateio_id, v_old, p_new_number, auth.jwt() ->> 'email');

    RETURN p_new_number;
END;
$X$;

REVOKE ALL ON FUNCTION public.fn_condo_rateio_number_lock_reason(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_condo_rateio_number_lock_reason(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_condo_rateio_number_lock_reason(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_regenerate_condo_rateio_number(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_regenerate_condo_rateio_number(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_regenerate_condo_rateio_number(UUID, TEXT) TO authenticated;
