-- ==========================================================================
-- Portal do Fornecedor: pedido em RASCUNHO não existe para o fornecedor.
--
-- Plano: docs/planos/2026-09-07-pedido-abas-portal-fornecedor.md
--
-- ── O que estava errado ───────────────────────────────────────────────────
--
-- O caminho do APP já escondia rascunho do fornecedor há tempos —
-- `orderService.listOrders` faz `.neq('status', 'Rascunho')` quando quem lê é
-- fornecedor. O caminho do TOKEN nunca teve essa regra: as RPCs filtravam só
-- por `supplier_id`, então o link público listava pedidos que o comprador ainda
-- estava redigindo e não tinha enviado a ninguém.
--
-- Visto na tela em 2026-09-07, ao percorrer o portal: `PC-008-008-0001`,
-- status RASCUNHO, aparecia na lista "Meus pedidos" do fornecedor MCC.
--
-- Não é regressão desta frente — é anterior, e ficou visível porque foi a
-- primeira vez que alguém abriu o portal com dado real e olhou linha a linha.
--
-- ── A regra ───────────────────────────────────────────────────────────────
--
-- Rascunho é documento interno do comprador. Para o fornecedor ele não deve
-- listar, não deve abrir e não deve aceitar ação — por isso a trava vai numa
-- função só, usada por todas as RPCs que resolvem "este pedido é deste
-- fornecedor?", e não num `AND` repetido em cada uma (repetir é como a regra
-- some numa RPC nova).
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.supplier_portal_pedido_do_fornecedor(
    p_order_id    UUID,
    p_supplier_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.purchase_orders po
        WHERE po.id = p_order_id
          AND po.supplier_id = p_supplier_id
          AND po.status <> 'Rascunho'
    );
$$;

REVOKE EXECUTE ON FUNCTION public.supplier_portal_pedido_do_fornecedor(UUID, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.supplier_portal_pedido_do_fornecedor(UUID, UUID) TO authenticated;
-- Só as RPCs de portal (SECURITY DEFINER, dono postgres) a chamam; o link
-- público nunca a executa diretamente, então `anon` não precisa de EXECUTE.

-- ── Lista ─────────────────────────────────────────────────────────────────
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
              AND o.status <> 'Rascunho'
        ), '[]'::jsonb)
    );
END;
$X$;

REVOKE EXECUTE ON FUNCTION public.supplier_portal_get_orders(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.supplier_portal_get_orders(TEXT) TO anon, authenticated;

-- ── Detalhe ───────────────────────────────────────────────────────────────
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
    -- Sem esta linha, tirar o rascunho só da lista seria cosmético: bastaria o
    -- id do pedido para abri-lo assim mesmo.
    IF NOT public.supplier_portal_pedido_do_fornecedor(p_order_id, v_sup) THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    SELECT * INTO v_order FROM public.purchase_orders WHERE id = p_order_id;

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

-- ── Ação sobre o pedido: logística ────────────────────────────────────────
-- Confirmar/despachar um pedido que o comprador ainda não enviou é a ação mais
-- danosa da lista — mudaria o status de um documento em redação.
CREATE OR REPLACE FUNCTION public.supplier_portal_update_order_logistics(
    p_token                 TEXT,
    p_order_id              UUID,
    p_status                TEXT,
    p_delivery_date         DATE,
    p_separation_date       DATE,
    p_shipped_date          DATE,
    p_actual_delivery_date  DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_sup UUID := public.supplier_portal_supplier_from_token(p_token);
    v_row public.purchase_orders;
BEGIN
    IF v_sup IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    IF NOT public.supplier_portal_pedido_do_fornecedor(p_order_id, v_sup) THEN
        RETURN '{"valid":false}'::jsonb;
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

    RETURN jsonb_build_object('valid', TRUE, 'data', row_to_json(v_row));
END;
$X$;

REVOKE EXECUTE ON FUNCTION public.supplier_portal_update_order_logistics(TEXT, UUID, TEXT, DATE, DATE, DATE, DATE) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.supplier_portal_update_order_logistics(TEXT, UUID, TEXT, DATE, DATE, DATE, DATE) TO anon, authenticated;

-- ── As quatro RPCs das abas novas (frente atual) ──────────────────────────
-- Passam a usar a mesma trava, para não nascerem com a regra que as antigas
-- acabaram de ganhar.

CREATE OR REPLACE FUNCTION public.supplier_portal_get_order_receipts(
    p_token    TEXT,
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_sup UUID := public.supplier_portal_supplier_from_token(p_token);
BEGIN
    IF v_sup IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    IF NOT public.supplier_portal_pedido_do_fornecedor(p_order_id, v_sup) THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'receipts', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id',          r.id,
                    'order_id',    r.order_id,
                    'received_at', r.received_at,
                    'status',      r.status,
                    'notes',       r.notes,
                    'photo_path',  r.photo_path,
                    'version',     r.version,
                    'created_at',  r.created_at,
                    'items', COALESCE((
                        SELECT jsonb_agg(row_to_json(i) ORDER BY i.created_at)
                        FROM public.purchase_receipt_items i
                        WHERE i.receipt_id = r.id
                    ), '[]'::jsonb)
                ) ORDER BY r.received_at DESC
            )
            FROM public.purchase_receipts r
            WHERE r.order_id = p_order_id
        ), '[]'::jsonb),
        'discrepancies', COALESCE((
            SELECT jsonb_agg(row_to_json(d) ORDER BY d.created_at)
            FROM public.purchase_discrepancies d
            WHERE d.order_id = p_order_id
        ), '[]'::jsonb)
    );
END;
$X$;

REVOKE EXECUTE ON FUNCTION public.supplier_portal_get_order_receipts(TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.supplier_portal_get_order_receipts(TEXT, UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.supplier_portal_get_order_notifications(
    p_token    TEXT,
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_sup UUID := public.supplier_portal_supplier_from_token(p_token);
BEGIN
    IF v_sup IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    IF NOT public.supplier_portal_pedido_do_fornecedor(p_order_id, v_sup) THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'data', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id',         n.id,
                    'order_id',   n.order_id,
                    'channel',    n.channel,
                    'recipient',  n.recipient,
                    'subject',    n.subject,
                    'status',     n.status,
                    'created_at', n.created_at
                ) ORDER BY n.created_at DESC
            )
            FROM public.notification_log n
            WHERE n.order_id = p_order_id
        ), '[]'::jsonb)
    );
END;
$X$;

REVOKE EXECUTE ON FUNCTION public.supplier_portal_get_order_notifications(TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.supplier_portal_get_order_notifications(TEXT, UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.supplier_portal_get_order_messages(
    p_token    TEXT,
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_sup UUID := public.supplier_portal_supplier_from_token(p_token);
BEGIN
    IF v_sup IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    IF NOT public.supplier_portal_pedido_do_fornecedor(p_order_id, v_sup) THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'data', COALESCE((
            SELECT jsonb_agg(row_to_json(c) ORDER BY c.created_at)
            FROM public.order_chats c
            WHERE c.order_id = p_order_id
        ), '[]'::jsonb)
    );
END;
$X$;

REVOKE EXECUTE ON FUNCTION public.supplier_portal_get_order_messages(TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.supplier_portal_get_order_messages(TEXT, UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.supplier_portal_send_order_message(
    p_token    TEXT,
    p_order_id UUID,
    p_message  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_sup UUID := public.supplier_portal_supplier_from_token(p_token);
    v_nome TEXT;
    v_row  public.order_chats;
BEGIN
    IF v_sup IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    IF p_message IS NULL OR btrim(p_message) = '' THEN
        RETURN '{"valid":false,"error":"mensagem_vazia"}'::jsonb;
    END IF;
    IF NOT public.supplier_portal_pedido_do_fornecedor(p_order_id, v_sup) THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    SELECT COALESCE(s.name, 'Fornecedor') INTO v_nome
    FROM public.suppliers s WHERE s.id = v_sup;

    INSERT INTO public.order_chats (order_id, sender_email, sender_name, sender_role, message, is_system)
    VALUES (
        p_order_id,
        COALESCE((SELECT s.email FROM public.suppliers s WHERE s.id = v_sup), ''),
        v_nome,
        'supplier',
        btrim(p_message),
        FALSE
    )
    RETURNING * INTO v_row;

    RETURN jsonb_build_object('valid', TRUE, 'data', row_to_json(v_row));
END;
$X$;

REVOKE EXECUTE ON FUNCTION public.supplier_portal_send_order_message(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.supplier_portal_send_order_message(TEXT, UUID, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.supplier_portal_respond_discrepancy(
    p_token          TEXT,
    p_discrepancy_id UUID,
    p_response       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_sup UUID := public.supplier_portal_supplier_from_token(p_token);
    v_row public.purchase_discrepancies;
BEGIN
    IF v_sup IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    IF p_response IS NULL OR btrim(p_response) = '' THEN
        RETURN '{"valid":false,"error":"resposta_vazia"}'::jsonb;
    END IF;

    SELECT d.* INTO v_row
    FROM public.purchase_discrepancies d
    WHERE d.id = p_discrepancy_id
      AND public.supplier_portal_pedido_do_fornecedor(d.order_id, v_sup);

    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;
    IF v_row.status <> 'Pendente' THEN
        RETURN '{"valid":false,"error":"ja_resolvida"}'::jsonb;
    END IF;

    UPDATE public.purchase_discrepancies
    SET supplier_response     = p_response,
        supplier_responded_at = NOW()
    WHERE id = p_discrepancy_id
    RETURNING * INTO v_row;

    RETURN jsonb_build_object('valid', TRUE, 'data', row_to_json(v_row));
END;
$X$;

REVOKE EXECUTE ON FUNCTION public.supplier_portal_respond_discrepancy(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.supplier_portal_respond_discrepancy(TEXT, UUID, TEXT) TO anon, authenticated;

-- ⚠️ NÃO alteradas aqui: as três RPCs de negociação
-- (`supplier_portal_get_negotiation_proposals`, `..._create_...`,
-- `..._accept_...`). Um pedido em rascunho não chega a estar "Em Negociação",
-- e o fornecedor só alcança o id pela lista/detalhe, que agora barram. Mexer
-- nelas seria alterar um fluxo que este passeio não exercitou.
