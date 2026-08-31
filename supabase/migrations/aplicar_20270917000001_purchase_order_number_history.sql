-- "Regerar número" para Pedidos de Compra — mesmo padrão de
-- 20270913000000_contract_number_history.sql (Suprimentos > Contratos),
-- aplicado a `purchase_orders`. Ver
-- docs/planos/2026-08-30-regerar-numero-outros-modulos.md.
--
-- REGRA DE BLOQUEIO (decisão do usuário, 2026-08-30): qualquer status ≠
-- 'Rascunho' já trava (inclusive 'Cancelado') — é a partir de 'Enviado' que o
-- pedido dispara webhook/WhatsApp/e-mail para o fornecedor
-- (services/orderService.ts:updateOrder), então "saiu para fora" já em
-- 'Enviado'. Mais simples que a trava de Contratos porque aqui há um único
-- eixo de status, sem versões de documento/assinatura para checar.

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.purchase_order_number_history (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    UUID NOT NULL,   -- sem FK (anti-deadlock, mesmo motivo de contract_number_history)
    purchase_order_id  UUID NOT NULL,   -- sem FK
    old_number         TEXT,
    new_number         TEXT NOT NULL,
    changed_by         TEXT,
    changed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.purchase_order_number_history IS
    'Histórico de "Regerar número" de Pedidos de Compra. Ver docs/planos/2026-08-30-regerar-numero-outros-modulos.md.';

CREATE INDEX IF NOT EXISTS idx_purchase_order_number_history_order
    ON public.purchase_order_number_history(purchase_order_id, changed_at DESC);

ALTER TABLE public.purchase_order_number_history ENABLE ROW LEVEL SECURITY;

-- SELECT-only, de propósito: só a RPC SECURITY DEFINER abaixo escreve.
CREATE POLICY "purchase_order_number_history_select" ON public.purchase_order_number_history
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

REVOKE ALL ON public.purchase_order_number_history FROM PUBLIC;
REVOKE ALL ON public.purchase_order_number_history FROM anon;
GRANT SELECT ON public.purchase_order_number_history TO authenticated;

-- ═══ Motivo do bloqueio, pronto para a UI (NULL = pode regerar) ═══
CREATE OR REPLACE FUNCTION public.fn_purchase_order_number_lock_reason(p_order_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_order RECORD;
BEGIN
    SELECT o.id, o.organization_id, o.status
      INTO v_order
      FROM public.purchase_orders o
     WHERE o.id = p_order_id;

    IF NOT FOUND THEN
        RETURN 'Pedido não encontrado.';
    END IF;

    IF NOT public.is_org_member(v_order.organization_id) THEN
        RETURN 'Sem acesso a este pedido.';
    END IF;

    IF v_order.status <> 'Rascunho' THEN
        RETURN format('Pedido em "%s" — o número só pode ser regerado enquanto ele está em Rascunho.', v_order.status);
    END IF;

    RETURN NULL;
END;
$X$;

-- ═══ Regera de fato: revalida a trava, grava e registra o histórico ═══
CREATE OR REPLACE FUNCTION public.fn_regenerate_purchase_order_number(
    p_order_id UUID,
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

    -- Revalida na hora de gravar — a UI pode estar desatualizada em relação a
    -- outra aba que acabou de enviar o pedido.
    v_reason := public.fn_purchase_order_number_lock_reason(p_order_id);
    IF v_reason IS NOT NULL THEN
        RAISE EXCEPTION '%', v_reason USING ERRCODE = '42501';
    END IF;

    SELECT number, organization_id INTO v_old, v_org
      FROM public.purchase_orders WHERE id = p_order_id;

    UPDATE public.purchase_orders
       SET number = p_new_number, updated_at = NOW()
     WHERE id = p_order_id;

    INSERT INTO public.purchase_order_number_history
        (organization_id, purchase_order_id, old_number, new_number, changed_by)
    VALUES (v_org, p_order_id, v_old, p_new_number, auth.jwt() ->> 'email');

    RETURN p_new_number;
END;
$X$;

REVOKE ALL ON FUNCTION public.fn_purchase_order_number_lock_reason(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_purchase_order_number_lock_reason(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_purchase_order_number_lock_reason(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_regenerate_purchase_order_number(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_regenerate_purchase_order_number(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_regenerate_purchase_order_number(UUID, TEXT) TO authenticated;
