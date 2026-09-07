-- ==========================================================================
-- Pedido de compra: o nome da OBRA chega ao fornecedor nas duas visões.
--
-- Plano: docs/planos/2026-09-07-pedido-abas-portal-fornecedor.md
--
-- ── O que estava errado ───────────────────────────────────────────────────
--
-- A RLS de `projects` libera SELECT para membro da organização
-- (`is_org_member`) ou para o dono (`auth.uid() = user_id`). O fornecedor não é
-- nem um nem outro — corretamente, porque o projeto carrega orçamento,
-- configurações e a EAP inteira, que não são assunto dele. Só que o nome da
-- obra É: é o destino da entrega, e o comprador já o manda por WhatsApp.
--
-- O efeito, nas duas portas de entrada do fornecedor:
--
--   • LOGADO no app: `orderService.listOrders` lê `projects` direto, não
--     recebe nada, e todo pedido fica com obra `'-'`; o detalhe fazia um
--     `loadProject` próprio e mostrava "Obra Desconhecida".
--   • LINK PÚBLICO: pior — nenhuma das RPCs devolvia `project_name`, embora o
--     `mapOrderRow` do portal já leia esse campo e a lista de pedidos já tenha
--     coluna "Obra". Resultado: "—" na lista e vazio no cabeçalho do detalhe.
--
-- ── Por que uma função, e não uma policy nova em `projects` ───────────────
--
-- Uma policy que deixasse o fornecedor ler as obras onde ele tem pedido
-- entregaria a LINHA inteira — `settings`, `budget`, classificação. RLS não
-- restringe coluna. A função devolve o nome e nada mais.
-- ==========================================================================

-- ── Fornecedor (ou comprador) LOGADO: nomes de obra em lote ───────────────
-- Em lote porque a lista de pedidos precisa de todos de uma vez; uma chamada
-- por linha seria N+1 numa tela que já lista dezenas de pedidos.
CREATE OR REPLACE FUNCTION public.purchase_orders_project_names(p_order_ids UUID[])
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        jsonb_object_agg(po.id::text, p.name),
        '{}'::jsonb
    )
    FROM public.purchase_orders po
    JOIN public.projects p ON p.id = po.project_id
    WHERE po.id = ANY(p_order_ids)
      -- Cada perna sozinha basta para liberar a linha, e cada uma é recortada
      -- pelo pedido em questão (REGRA #7, pergunta 1).
      AND (
          public.purchase_order_is_buyer(po.id)
          OR public.purchase_order_is_supplier(po.id)
      );
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_orders_project_names(UUID[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.purchase_orders_project_names(UUID[]) TO authenticated;

-- ── Link público: `project_name` junto do pedido ──────────────────────────
-- As duas RPCs devolviam `row_to_json(o)` puro. Passam a acrescentar só o nome
-- da obra ao mesmo objeto — o front já lê `item.project_name`
-- (`mapOrderRow`, supplierPortalTokenService), então nada muda do outro lado.

CREATE OR REPLACE FUNCTION public.supplier_portal_get_orders(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_sup UUID := public.supplier_portal_supplier_from_token(p_token);
BEGIN
    IF v_sup IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'data', COALESCE((
            SELECT jsonb_agg(
                row_to_json(o)::jsonb || jsonb_build_object(
                    'project_name', (SELECT p.name FROM public.projects p WHERE p.id = o.project_id)
                )
                ORDER BY o.created_at DESC
            )
            FROM public.purchase_orders o
            WHERE o.supplier_id = v_sup
        ), '[]'::jsonb)
    );
END;
$X$;

REVOKE EXECUTE ON FUNCTION public.supplier_portal_get_orders(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.supplier_portal_get_orders(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.supplier_portal_get_order_detail(p_token TEXT, p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_sup UUID := public.supplier_portal_supplier_from_token(p_token);
    v_order RECORD;
BEGIN
    IF v_sup IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_order FROM public.purchase_orders
    WHERE id = p_order_id AND supplier_id = v_sup;

    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'order', row_to_json(v_order)::jsonb || jsonb_build_object(
            'project_name', (SELECT p.name FROM public.projects p WHERE p.id = v_order.project_id)
        ),
        'invoices', COALESCE((
            SELECT jsonb_agg(row_to_json(i) ORDER BY i.created_at DESC)
            FROM public.invoices i
            WHERE i.order_id = p_order_id
        ), '[]'::jsonb)
    );
END;
$X$;

REVOKE EXECUTE ON FUNCTION public.supplier_portal_get_order_detail(TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.supplier_portal_get_order_detail(TEXT, UUID) TO anon, authenticated;
