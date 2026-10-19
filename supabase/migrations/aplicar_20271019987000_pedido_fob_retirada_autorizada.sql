-- ══════════════════════════════════════════════════════════════════════════
-- Pedido FOB: o fornecedor não mexe na logística + quem pode retirar / quem retirou
-- Plano: docs/planos/2026-10-19-forma-entrega-cif-fob.md
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (NUNCA db push)
-- ══════════════════════════════════════════════════════════════════════════
--
-- 1. No FOB a logística é toda do comprador (pedido do usuário em 2026-10-19).
--    A tela já não oferecia ao fornecedor "Editar Logística", mas as duas RPCs
--    de escrita do portal ainda aceitavam status/datas de logística. Agora
--    recusam com reason 'fob'. O UPDATE direto na tabela já está fechado para
--    o fornecedor desde aplicar_20270921000027 (sem SELECT ele não passa no
--    UPDATE com WHERE), então as RPCs eram o único caminho.
--
-- 2. Colaboradores (RH › Colaboradores) autorizados a retirar o pedido — vários
--    por pedido — e quem de fato retirou. O fornecedor vê NOME e CPF dos
--    autorizados (para conferir no balcão), por RPC própria; nada mais do
--    cadastro do RH.

-- ── 0. FOB pelo texto gravado (mesma regra de `ehFob` em utils/formaEntrega.ts)
CREATE OR REPLACE FUNCTION public.fn_pedido_eh_fob(p_forma_entrega text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT upper(btrim(coalesce(p_forma_entrega, ''))) LIKE 'FOB%';
$$;
REVOKE EXECUTE ON FUNCTION public.fn_pedido_eh_fob(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_pedido_eh_fob(text) TO authenticated;

-- ── 1. Quem retirou ───────────────────────────────────────────────────────
ALTER TABLE public.purchase_orders
    ADD COLUMN IF NOT EXISTS retirado_por_employee_id uuid
        REFERENCES public.employees(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.purchase_orders.retirado_por_employee_id IS
    'FOB: colaborador que retirou a mercadoria no fornecedor. Gravado pelo comprador junto com status Entregue (= "Retirado").';

-- Coluna interna: o fornecedor não recebe o uuid do colaborador nas RPCs/view.
CREATE OR REPLACE FUNCTION public.purchase_order_colunas_internas()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT ARRAY['bank_account', 'cost_center', 'cost_center_id', 'chart_of_accounts',
                 'plano_de_contas_id', 'is_financial_approved',
                 'share_token', 'approval_status', 'approval_chain', 'approval_required_levels',
                 'retirado_por_employee_id'];
$$;

-- ── 2. Autorizados a retirar ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_order_retirada_autorizados (
    purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    employee_id       uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid DEFAULT auth.uid(),
    PRIMARY KEY (purchase_order_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_po_retirada_autorizados_employee
    ON public.purchase_order_retirada_autorizados (employee_id);

ALTER TABLE public.purchase_order_retirada_autorizados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.purchase_order_retirada_autorizados FROM anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.purchase_order_retirada_autorizados TO authenticated;

-- Acesso = enxergar o pedido. A subconsulta passa pela RLS de purchase_orders
-- (`po_select_org`: membro da organização da obra) — então segue exatamente
-- quem é comprador, e o fornecedor (que não lê purchase_orders) fica de fora.
-- Pergunta 1 da REGRA #7: não há OR; cada condição é necessária.
DROP POLICY IF EXISTS po_retirada_autorizados_select ON public.purchase_order_retirada_autorizados;
CREATE POLICY po_retirada_autorizados_select ON public.purchase_order_retirada_autorizados
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_id));

-- Gravar: enxergar o pedido E enxergar o colaborador (RLS de employees).
DROP POLICY IF EXISTS po_retirada_autorizados_insert ON public.purchase_order_retirada_autorizados;
CREATE POLICY po_retirada_autorizados_insert ON public.purchase_order_retirada_autorizados
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_id)
        AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id)
    );

DROP POLICY IF EXISTS po_retirada_autorizados_delete ON public.purchase_order_retirada_autorizados;
CREATE POLICY po_retirada_autorizados_delete ON public.purchase_order_retirada_autorizados
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_id));

-- ── 3. O fornecedor lê os autorizados: NOME e CPF, só de pedido FOB dele ──
-- Token (link do portal) ou sessão do fornecedor. Comprador chamando recebe [].
CREATE OR REPLACE FUNCTION public.purchase_order_retirada_autorizados_fornecedor(
    p_order_id uuid,
    p_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sup uuid;
    v_ok  boolean := false;
BEGIN
    IF p_token IS NOT NULL THEN
        v_sup := public.supplier_portal_supplier_from_token(p_token);
        v_ok  := v_sup IS NOT NULL AND public.supplier_portal_pedido_do_fornecedor(p_order_id, v_sup);
    ELSIF auth.uid() IS NOT NULL THEN
        v_ok  := public.purchase_order_is_supplier(p_order_id);
    END IF;
    IF NOT coalesce(v_ok, false) THEN
        RETURN '[]'::jsonb;
    END IF;

    RETURN coalesce((
        SELECT jsonb_agg(jsonb_build_object('nome', e.name, 'cpf', e.cpf) ORDER BY e.name)
        FROM public.purchase_order_retirada_autorizados a
        JOIN public.employees e        ON e.id  = a.employee_id
        JOIN public.purchase_orders po ON po.id = a.purchase_order_id
        WHERE a.purchase_order_id = p_order_id
          AND public.fn_pedido_eh_fob(po.delivery_method)
    ), '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.purchase_order_retirada_autorizados_fornecedor(uuid, text) FROM PUBLIC;
-- anon: o portal por link não tem sessão; a autorização é o token, conferido acima.
GRANT  EXECUTE ON FUNCTION public.purchase_order_retirada_autorizados_fornecedor(uuid, text) TO anon, authenticated;

-- ── 4. Escrita do fornecedor LOGADO: FOB recusa logística ─────────────────
CREATE OR REPLACE FUNCTION public.purchase_order_update_as_supplier(p_order_id uuid, p_status text DEFAULT NULL::text, p_delivery_date date DEFAULT NULL::date, p_separation_date date DEFAULT NULL::date, p_shipped_date date DEFAULT NULL::date, p_actual_delivery_date date DEFAULT NULL::date, p_quotes jsonb DEFAULT NULL::jsonb, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_row public.purchase_orders;
BEGIN
    IF NOT public.purchase_order_is_supplier(p_order_id) THEN
        RETURN '{"valid":false,"reason":"forbidden"}'::jsonb;
    END IF;

    SELECT * INTO v_row FROM public.purchase_orders WHERE id = p_order_id;
    IF NOT FOUND OR v_row.status = 'Rascunho' THEN RETURN '{"valid":false}'::jsonb; END IF;

    IF p_expected_version IS NOT NULL AND COALESCE(v_row.version, 0) <> p_expected_version THEN
        RETURN '{"valid":false,"reason":"conflict"}'::jsonb;
    END IF;

    -- FOB (2026-10-19): a logística é do comprador. O fornecedor continua
    -- aceitando/negociando o pedido e cotando, mas não move etapa logística
    -- nem mexe em data de previsão/separação/saída/entrega.
    IF public.fn_pedido_eh_fob(v_row.delivery_method) AND (
           (p_status IS NOT NULL AND p_status <> v_row.status
                AND p_status IN ('Separação', 'Em Trânsito', 'Entregue', 'Recebido', 'Divergência'))
        OR p_delivery_date IS NOT NULL OR p_separation_date IS NOT NULL
        OR p_shipped_date IS NOT NULL OR p_actual_delivery_date IS NOT NULL
    ) THEN
        RETURN '{"valid":false,"reason":"fob"}'::jsonb;
    END IF;

    -- Cotação só enquanto o pedido está em jogo (mesma regra do token).
    IF p_quotes IS NOT NULL AND v_row.status IN ('Entregue', 'Recebido', 'Divergência', 'Cancelado') THEN
        RETURN '{"valid":false,"reason":"status"}'::jsonb;
    END IF;

    UPDATE public.purchase_orders
    SET status               = COALESCE(p_status, status),
        status_updated_at    = CASE WHEN p_status IS NOT NULL AND p_status <> status THEN NOW() ELSE status_updated_at END,
        delivery_date        = COALESCE(p_delivery_date, delivery_date),
        separation_date      = COALESCE(p_separation_date, separation_date),
        shipped_date         = COALESCE(p_shipped_date, shipped_date),
        actual_delivery_date = COALESCE(p_actual_delivery_date, actual_delivery_date),
        items                = CASE WHEN p_quotes IS NOT NULL
                                    THEN public.fn_pedido_itens_aplicar_cotado(items, p_quotes) ELSE items END,
        version              = COALESCE(version, 0) + 1,
        updated_at           = NOW()
    WHERE id = p_order_id
    RETURNING * INTO v_row;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'data',  row_to_json(v_row)::jsonb - public.purchase_order_colunas_internas()
    );
END;
$function$;
-- ACL de antes (conferida em 19/10): postgres, authenticated, service_role — sem PUBLIC/anon.
REVOKE EXECUTE ON FUNCTION public.purchase_order_update_as_supplier(uuid, text, date, date, date, date, jsonb, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.purchase_order_update_as_supplier(uuid, text, date, date, date, date, jsonb, integer) TO authenticated;

-- ── 5. Escrita do fornecedor POR LINK (token): FOB recusa logística ───────
-- Também deixa de devolver as colunas internas do comprador (devolvia a linha
-- inteira — conta, centro de custo, plano de contas, cadeia de aprovação).
CREATE OR REPLACE FUNCTION public.supplier_portal_update_order_logistics(p_token text, p_order_id uuid, p_status text, p_delivery_date date, p_separation_date date, p_shipped_date date, p_actual_delivery_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_sup UUID := public.supplier_portal_supplier_from_token(p_token);
    v_row public.purchase_orders;
BEGIN
    IF v_sup IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    IF NOT public.supplier_portal_pedido_do_fornecedor(p_order_id, v_sup) THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    SELECT * INTO v_row FROM public.purchase_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    -- FOB (2026-10-19): ver purchase_order_update_as_supplier.
    IF public.fn_pedido_eh_fob(v_row.delivery_method) AND (
           (p_status IS NOT NULL AND p_status <> v_row.status
                AND p_status IN ('Separação', 'Em Trânsito', 'Entregue', 'Recebido', 'Divergência'))
        OR p_delivery_date IS NOT NULL OR p_separation_date IS NOT NULL
        OR p_shipped_date IS NOT NULL OR p_actual_delivery_date IS NOT NULL
    ) THEN
        RETURN '{"valid":false,"reason":"fob"}'::jsonb;
    END IF;

    UPDATE public.purchase_orders
    SET status               = COALESCE(p_status, status),
        delivery_date        = COALESCE(p_delivery_date, delivery_date),
        separation_date      = p_separation_date,
        shipped_date         = p_shipped_date,
        actual_delivery_date = p_actual_delivery_date,
        status_updated_at    = NOW(),
        updated_at           = NOW()
    WHERE id = p_order_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object('valid', TRUE, 'data', row_to_json(v_row)::jsonb - public.purchase_order_colunas_internas());
END;
$function$;
-- ACL de antes (conferida em 19/10): anon + authenticated — é o portal por link,
-- a autorização é o token. Mantida; só o default PUBLIC sai.
REVOKE EXECUTE ON FUNCTION public.supplier_portal_update_order_logistics(text, uuid, text, date, date, date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.supplier_portal_update_order_logistics(text, uuid, text, date, date, date, date) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
