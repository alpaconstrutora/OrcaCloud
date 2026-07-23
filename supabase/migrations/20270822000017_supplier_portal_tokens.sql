-- ==========================================================================
-- Migration: supplier_portal_tokens — acesso ao Portal do Fornecedor via
-- link (sem login), espelhando exatamente o padrão já usado no Portal do
-- Parceiro (20270120000000_partner_portal_tokens.sql). Toda leitura/escrita
-- pública passa por RPC SECURITY DEFINER que valida o token primeiro — nunca
-- select/update direto liberado para anon.
-- ==========================================================================

-- ── Tabela de tokens (1 link por fornecedor) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_portal_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    supplier_id  UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    token        TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
    expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
    last_used_at TIMESTAMPTZ,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (supplier_id)
);

ALTER TABLE public.supplier_portal_tokens ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS supplier_portal_tokens_token_idx
    ON public.supplier_portal_tokens (token) WHERE is_active = TRUE;

-- Sem policy de SELECT para anon: toda leitura via token passa pelas RPCs
-- SECURITY DEFINER abaixo, nunca por select direto na tabela.

CREATE OR REPLACE FUNCTION public.supplier_portal_can_manage_tokens(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.organization_id = p_org_id
          AND (
              om.user_id = auth.uid()
              OR lower(om.email) = lower(auth.jwt()->>'email')
          )
          AND om.role IN ('owner', 'admin')
    );
$$;

REVOKE EXECUTE ON FUNCTION public.supplier_portal_can_manage_tokens(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supplier_portal_can_manage_tokens(uuid) TO authenticated;

DROP POLICY IF EXISTS "supplier_portal_tokens_auth_all" ON public.supplier_portal_tokens;
CREATE POLICY "supplier_portal_tokens_auth_all" ON public.supplier_portal_tokens
    FOR ALL TO authenticated
    USING (public.supplier_portal_can_manage_tokens(org_id))
    WITH CHECK (public.supplier_portal_can_manage_tokens(org_id));

-- ==========================================================================
-- RPC: gerar/regenerar token (admin/owner autenticado da org)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.supplier_portal_generate_token(
    p_supplier_id UUID,
    p_org_id      UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_token TEXT := gen_random_uuid()::text;
BEGIN
    IF NOT public.supplier_portal_can_manage_tokens(p_org_id) THEN
        RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;

    -- Fornecedor global (organization_id NULL) também pode receber link,
    -- gerenciado por qualquer organização que o administre.
    IF NOT EXISTS (
        SELECT 1 FROM public.suppliers s
        WHERE s.id = p_supplier_id
          AND (s.organization_id = p_org_id OR s.organization_id IS NULL)
    ) THEN
        RAISE EXCEPTION 'supplier_not_found_for_org' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.supplier_portal_tokens (org_id, supplier_id, token)
    VALUES (p_org_id, p_supplier_id, v_token)
    ON CONFLICT (supplier_id) DO UPDATE
        SET org_id       = p_org_id,
            token        = v_token,
            expires_at   = NOW() + INTERVAL '90 days',
            is_active    = TRUE,
            last_used_at = NULL,
            created_at   = NOW();

    RETURN v_token;
END;
$X$;

REVOKE EXECUTE ON FUNCTION public.supplier_portal_generate_token(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supplier_portal_generate_token(UUID, UUID) TO authenticated;

-- ==========================================================================
-- RPC: revogar token (admin/owner autenticado)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.supplier_portal_revoke_token(p_supplier_id UUID, p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
BEGIN
    IF NOT public.supplier_portal_can_manage_tokens(p_org_id) THEN
        RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;

    UPDATE public.supplier_portal_tokens
    SET is_active = FALSE
    WHERE supplier_id = p_supplier_id AND org_id = p_org_id;
END;
$X$;

REVOKE EXECUTE ON FUNCTION public.supplier_portal_revoke_token(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supplier_portal_revoke_token(UUID, UUID) TO authenticated;

-- ==========================================================================
-- RPC: bootstrap dos dados do fornecedor via token (anon)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.supplier_portal_get_data(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok public.supplier_portal_tokens;
    v_sup RECORD;
BEGIN
    SELECT * INTO v_tok FROM public.supplier_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();

    IF NOT FOUND THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    SELECT s.* INTO v_sup FROM public.suppliers s WHERE s.id = v_tok.supplier_id;

    IF NOT FOUND THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    UPDATE public.supplier_portal_tokens SET last_used_at = NOW() WHERE id = v_tok.id;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'org_id', v_tok.org_id,
        'supplier', row_to_json(v_sup)
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.supplier_portal_get_data(TEXT) TO anon, authenticated;

-- Helper interno reaproveitado pelas RPCs abaixo: supplier_id se o token for válido, senão NULL
CREATE OR REPLACE FUNCTION public.supplier_portal_supplier_from_token(p_token TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT supplier_id FROM public.supplier_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
$$;

REVOKE EXECUTE ON FUNCTION public.supplier_portal_supplier_from_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supplier_portal_supplier_from_token(TEXT) TO anon, authenticated;

-- ==========================================================================
-- RPC: pedidos do fornecedor via token (leitura) — aba Pedidos
-- ==========================================================================
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
            SELECT jsonb_agg(row_to_json(o) ORDER BY o.created_at DESC)
            FROM public.purchase_orders o
            WHERE o.supplier_id = v_sup
        ), '[]'::jsonb)
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.supplier_portal_get_orders(TEXT) TO anon, authenticated;

-- ==========================================================================
-- RPC: detalhe de um pedido (pedido + notas fiscais vinculadas)
-- ==========================================================================
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
        'order', row_to_json(v_order),
        'invoices', COALESCE((
            SELECT jsonb_agg(row_to_json(i) ORDER BY i.created_at DESC)
            FROM public.invoices i
            WHERE i.order_id = p_order_id
        ), '[]'::jsonb)
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.supplier_portal_get_order_detail(TEXT, UUID) TO anon, authenticated;

-- ==========================================================================
-- RPC: atualizar logística do pedido (só os campos que a aba Pedidos edita
-- hoje — não abre updateOrder inteiro, para não reabrir edição de itens/
-- exclusão por essa via)
-- ==========================================================================
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

    UPDATE public.purchase_orders
    SET status               = COALESCE(p_status, status),
        delivery_date        = COALESCE(p_delivery_date, delivery_date),
        separation_date      = p_separation_date,
        shipped_date         = p_shipped_date,
        actual_delivery_date = p_actual_delivery_date,
        status_updated_at    = NOW(),
        updated_at           = NOW()
    WHERE id = p_order_id AND supplier_id = v_sup
    RETURNING * INTO v_row;

    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object('valid', TRUE, 'data', row_to_json(v_row));
END;
$X$;

GRANT EXECUTE ON FUNCTION public.supplier_portal_update_order_logistics(TEXT, UUID, TEXT, DATE, DATE, DATE, DATE) TO anon, authenticated;

-- ==========================================================================
-- RPC: propostas de negociação de um pedido — aba Lances (NegotiationHub)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.supplier_portal_get_negotiation_proposals(p_token TEXT, p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_sup UUID := public.supplier_portal_supplier_from_token(p_token);
BEGIN
    IF v_sup IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    IF NOT EXISTS (SELECT 1 FROM public.purchase_orders WHERE id = p_order_id AND supplier_id = v_sup) THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'data', COALESCE((
            SELECT jsonb_agg(row_to_json(n) ORDER BY n.created_at ASC)
            FROM public.purchase_order_negotiations n
            WHERE n.order_id = p_order_id
        ), '[]'::jsonb)
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.supplier_portal_get_negotiation_proposals(TEXT, UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.supplier_portal_create_negotiation_proposal(
    p_token   TEXT,
    p_order_id UUID,
    p_payload  JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_sup UUID := public.supplier_portal_supplier_from_token(p_token);
    v_supplier_email TEXT;
    v_row public.purchase_order_negotiations;
BEGIN
    IF v_sup IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    IF NOT EXISTS (SELECT 1 FROM public.purchase_orders WHERE id = p_order_id AND supplier_id = v_sup) THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    SELECT email INTO v_supplier_email FROM public.suppliers WHERE id = v_sup;

    INSERT INTO public.purchase_order_negotiations (
        order_id, sender_email, sender_role, delivery_date, items,
        payment_method, payment_term_type, payment_days, payment_installments, message, status
    ) VALUES (
        p_order_id,
        COALESCE(v_supplier_email, 'link-publico@portal-fornecedor'),
        'supplier',
        (p_payload->>'deliveryDate')::date,
        p_payload->'items',
        p_payload->>'paymentMethod',
        p_payload->>'paymentTermType',
        NULLIF(p_payload->>'paymentDays', '')::int,
        NULLIF(p_payload->>'paymentInstallments', '')::int,
        p_payload->>'message',
        'pending'
    )
    RETURNING * INTO v_row;

    UPDATE public.purchase_orders SET status = 'Em Negociação', updated_at = NOW() WHERE id = p_order_id;

    RETURN jsonb_build_object('valid', TRUE, 'data', row_to_json(v_row));
END;
$X$;

GRANT EXECUTE ON FUNCTION public.supplier_portal_create_negotiation_proposal(TEXT, UUID, JSONB) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.supplier_portal_accept_negotiation_proposal(
    p_token       TEXT,
    p_proposal_id UUID,
    p_order_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_sup UUID := public.supplier_portal_supplier_from_token(p_token);
    v_proposal public.purchase_order_negotiations;
BEGIN
    IF v_sup IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    IF NOT EXISTS (SELECT 1 FROM public.purchase_orders WHERE id = p_order_id AND supplier_id = v_sup) THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    SELECT * INTO v_proposal FROM public.purchase_order_negotiations
    WHERE id = p_proposal_id AND order_id = p_order_id;

    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    UPDATE public.purchase_order_negotiations SET status = 'accepted' WHERE id = p_proposal_id;

    UPDATE public.purchase_order_negotiations
    SET status = 'countered'
    WHERE order_id = p_order_id AND status = 'pending' AND id <> p_proposal_id;

    UPDATE public.purchase_orders
    SET status = 'Confirmado',
        delivery_date = v_proposal.delivery_date,
        items = v_proposal.items,
        payment_method = v_proposal.payment_method,
        payment_term_type = v_proposal.payment_term_type,
        payment_days = v_proposal.payment_days,
        payment_installments = v_proposal.payment_installments,
        updated_at = NOW()
    WHERE id = p_order_id;

    RETURN jsonb_build_object('valid', TRUE, 'data', row_to_json(v_proposal));
END;
$X$;

GRANT EXECUTE ON FUNCTION public.supplier_portal_accept_negotiation_proposal(TEXT, UUID, UUID) TO anon, authenticated;

-- ==========================================================================
-- RPC: cotações convidadas + resposta — aba Cotações
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.supplier_portal_get_quotations(p_token TEXT)
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
            SELECT jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC)
            FROM (
                SELECT qr.*, p.name AS project_name
                FROM public.quotation_requests qr
                LEFT JOIN public.projects p ON p.id = qr.project_id
                WHERE v_sup = ANY(qr.invited_supplier_ids)
            ) t
        ), '[]'::jsonb)
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.supplier_portal_get_quotations(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.supplier_portal_get_quotation_response(p_token TEXT, p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_sup UUID := public.supplier_portal_supplier_from_token(p_token);
    v_row RECORD;
BEGIN
    IF v_sup IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_row FROM public.quotation_responses
    WHERE request_id = p_request_id AND supplier_id = v_sup;

    RETURN jsonb_build_object('valid', TRUE, 'data', row_to_json(v_row));
END;
$X$;

GRANT EXECUTE ON FUNCTION public.supplier_portal_get_quotation_response(TEXT, UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.supplier_portal_submit_quotation_response(
    p_token      TEXT,
    p_request_id UUID,
    p_payload    JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_sup UUID := public.supplier_portal_supplier_from_token(p_token);
    v_existing public.quotation_responses;
    v_event JSONB;
    v_row public.quotation_responses;
BEGIN
    IF v_sup IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.quotation_requests
        WHERE id = p_request_id AND v_sup = ANY(invited_supplier_ids)
    ) THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    SELECT * INTO v_existing FROM public.quotation_responses
    WHERE request_id = p_request_id AND supplier_id = v_sup;

    v_event := jsonb_build_object(
        'timestamp', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'action', CASE WHEN v_existing.id IS NULL THEN 'Proposta' ELSE 'Edição' END,
        'author', 'Fornecedor',
        'changes', '{}'::jsonb,
        'notes', p_payload->>'notes'
    );

    INSERT INTO public.quotation_responses (
        id, request_id, supplier_id, items, delivery_date, delivery_method, delivery_location,
        payment_method, payment_term_type, payment_days, payment_installments,
        status, negotiation_status, negotiation_history, notes
    ) VALUES (
        COALESCE(v_existing.id, gen_random_uuid()),
        p_request_id, v_sup, p_payload->'items',
        NULLIF(p_payload->>'deliveryDate', '')::date,
        p_payload->>'deliveryMethod', p_payload->>'deliveryLocation',
        p_payload->>'paymentMethod', p_payload->>'paymentTermType',
        NULLIF(p_payload->>'paymentDays', '')::int,
        NULLIF(p_payload->>'paymentInstallments', '')::int,
        'Enviada', COALESCE(p_payload->>'negotiationStatus', 'Original'),
        COALESCE(v_existing.negotiation_history, '[]'::jsonb) || jsonb_build_array(v_event),
        p_payload->>'notes'
    )
    ON CONFLICT (id) DO UPDATE SET
        items = EXCLUDED.items,
        delivery_date = EXCLUDED.delivery_date,
        delivery_method = EXCLUDED.delivery_method,
        delivery_location = EXCLUDED.delivery_location,
        payment_method = EXCLUDED.payment_method,
        payment_term_type = EXCLUDED.payment_term_type,
        payment_days = EXCLUDED.payment_days,
        payment_installments = EXCLUDED.payment_installments,
        status = EXCLUDED.status,
        negotiation_status = EXCLUDED.negotiation_status,
        negotiation_history = EXCLUDED.negotiation_history,
        notes = EXCLUDED.notes,
        updated_at = NOW()
    RETURNING * INTO v_row;

    RETURN jsonb_build_object('valid', TRUE, 'data', row_to_json(v_row));
END;
$X$;

GRANT EXECUTE ON FUNCTION public.supplier_portal_submit_quotation_response(TEXT, UUID, JSONB) TO anon, authenticated;

-- ==========================================================================
-- RPC: contraproposta de cotação (comprador ↔ fornecedor) via token
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.supplier_portal_send_counter_proposal(
    p_token      TEXT,
    p_response_id UUID,
    p_counter_proposal JSONB,
    p_notes      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_sup UUID := public.supplier_portal_supplier_from_token(p_token);
    v_resp public.quotation_responses;
    v_event JSONB;
    v_row public.quotation_responses;
BEGIN
    IF v_sup IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_resp FROM public.quotation_responses WHERE id = p_response_id AND supplier_id = v_sup;
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    v_event := jsonb_build_object(
        'timestamp', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'action', 'Contraproposta enviada',
        'author', 'Fornecedor',
        'changes', '{}'::jsonb,
        'notes', p_notes
    );

    UPDATE public.quotation_responses SET
        items = COALESCE(p_counter_proposal->'items', items),
        delivery_date = COALESCE(NULLIF(p_counter_proposal->>'deliveryDate', '')::date, delivery_date),
        delivery_method = COALESCE(p_counter_proposal->>'deliveryMethod', delivery_method),
        delivery_location = COALESCE(p_counter_proposal->>'deliveryLocation', delivery_location),
        payment_method = COALESCE(p_counter_proposal->>'paymentMethod', payment_method),
        payment_term_type = COALESCE(p_counter_proposal->>'paymentTermType', payment_term_type),
        payment_days = COALESCE(NULLIF(p_counter_proposal->>'paymentDays', '')::int, payment_days),
        payment_installments = COALESCE(NULLIF(p_counter_proposal->>'paymentInstallments', '')::int, payment_installments),
        negotiation_status = 'Nova Proposta',
        negotiation_history = COALESCE(negotiation_history, '[]'::jsonb) || jsonb_build_array(v_event),
        notes = COALESCE(p_notes, notes),
        updated_at = NOW()
    WHERE id = p_response_id
    RETURNING * INTO v_row;

    RETURN jsonb_build_object('valid', TRUE, 'data', row_to_json(v_row));
END;
$X$;

GRANT EXECUTE ON FUNCTION public.supplier_portal_send_counter_proposal(TEXT, UUID, JSONB, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.supplier_portal_respond_counter_proposal(
    p_token       TEXT,
    p_response_id UUID,
    p_accept      BOOLEAN,
    p_notes       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_sup UUID := public.supplier_portal_supplier_from_token(p_token);
    v_resp public.quotation_responses;
    v_cp JSONB;
    v_event JSONB;
    v_row public.quotation_responses;
BEGIN
    IF v_sup IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_resp FROM public.quotation_responses WHERE id = p_response_id AND supplier_id = v_sup;
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    IF NOT p_accept THEN
        v_event := jsonb_build_object(
            'timestamp', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'action', 'Recusa de contraproposta', 'author', 'Fornecedor', 'changes', '{}'::jsonb, 'notes', p_notes
        );
        UPDATE public.quotation_responses SET
            negotiation_status = 'Recusada',
            negotiation_history = COALESCE(negotiation_history, '[]'::jsonb) || jsonb_build_array(v_event),
            updated_at = NOW()
        WHERE id = p_response_id
        RETURNING * INTO v_row;
        RETURN jsonb_build_object('valid', TRUE, 'data', row_to_json(v_row));
    END IF;

    v_cp := v_resp.counter_proposal;
    IF v_cp IS NULL THEN
        RETURN jsonb_build_object('valid', FALSE, 'error', 'no_counter_proposal');
    END IF;

    v_event := jsonb_build_object(
        'timestamp', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'action', 'Aceite de contraproposta', 'author', 'Fornecedor', 'changes', '{}'::jsonb, 'notes', p_notes
    );

    UPDATE public.quotation_responses SET
        items = COALESCE(v_cp->'items', items),
        delivery_date = COALESCE(NULLIF(v_cp->>'deliveryDate', '')::date, delivery_date),
        delivery_method = COALESCE(v_cp->>'deliveryMethod', delivery_method),
        delivery_location = COALESCE(v_cp->>'deliveryLocation', delivery_location),
        payment_method = COALESCE(v_cp->>'paymentMethod', payment_method),
        payment_term_type = COALESCE(v_cp->>'paymentTermType', payment_term_type),
        payment_days = COALESCE(NULLIF(v_cp->>'paymentDays', '')::int, payment_days),
        payment_installments = COALESCE(NULLIF(v_cp->>'paymentInstallments', '')::int, payment_installments),
        negotiation_status = 'Aceita',
        negotiation_history = COALESCE(negotiation_history, '[]'::jsonb) || jsonb_build_array(v_event),
        updated_at = NOW()
    WHERE id = p_response_id
    RETURNING * INTO v_row;

    RETURN jsonb_build_object('valid', TRUE, 'data', row_to_json(v_row));
END;
$X$;

GRANT EXECUTE ON FUNCTION public.supplier_portal_respond_counter_proposal(TEXT, UUID, BOOLEAN, TEXT) TO anon, authenticated;

-- ==========================================================================
-- RPC: notas fiscais do fornecedor via token — aba Docs
-- (upload/exclusão de arquivo em si passam por Edge Function com service
-- role; aqui só a leitura e a manutenção da linha em `invoices`)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.supplier_portal_get_invoices(p_token TEXT)
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
            SELECT jsonb_agg(row_to_json(i) ORDER BY i.created_at DESC)
            FROM public.invoices i
            WHERE i.supplier_id = v_sup
        ), '[]'::jsonb)
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.supplier_portal_get_invoices(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.supplier_portal_link_invoice_order(
    p_token      TEXT,
    p_invoice_id UUID,
    p_order_id   UUID
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

    UPDATE public.invoices SET order_id = p_order_id
    WHERE id = p_invoice_id AND supplier_id = v_sup;

    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object('valid', TRUE);
END;
$X$;

GRANT EXECUTE ON FUNCTION public.supplier_portal_link_invoice_order(TEXT, UUID, UUID) TO anon, authenticated;

-- Exclusão só remove a linha (confirmando que pertence ao fornecedor do
-- token); o arquivo no storage fica órfão — sem RLS de storage para anon
-- apagar, e sem Edge Function dedicada para isso nesta primeira versão.
CREATE OR REPLACE FUNCTION public.supplier_portal_delete_invoice(p_token TEXT, p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_sup UUID := public.supplier_portal_supplier_from_token(p_token);
BEGIN
    IF v_sup IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    DELETE FROM public.invoices WHERE id = p_invoice_id AND supplier_id = v_sup;

    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object('valid', TRUE);
END;
$X$;

GRANT EXECUTE ON FUNCTION public.supplier_portal_delete_invoice(TEXT, UUID) TO anon, authenticated;
