-- Share token para acesso público a pedidos de compra (link WhatsApp)
ALTER TABLE public.purchase_orders
    ADD COLUMN IF NOT EXISTS share_token uuid DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_orders_share_token
    ON public.purchase_orders (share_token)
    WHERE share_token IS NOT NULL;

-- RPC pública para buscar pedido pelo token (SECURITY DEFINER ignora RLS)
CREATE OR REPLACE FUNCTION public.get_order_by_share_token(p_token uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT row_to_json(t) FROM (
        SELECT
            po.id,
            po.number,
            po.status,
            po.items,
            po.delivery_date,
            po.delivery_method,
            po.delivery_location,
            po.payment_method,
            po.payment_term_type,
            po.payment_days,
            po.payment_installments,
            po.notes,
            po.created_at,
            po.updated_at,
            po.share_token,
            s.name  AS supplier_name,
            s.email AS supplier_email,
            s.phone AS supplier_phone,
            p.name  AS project_name
        FROM public.purchase_orders po
        LEFT JOIN public.suppliers  s ON s.id = po.supplier_id
        LEFT JOIN public.projects   p ON p.id = po.project_id
        WHERE po.share_token = p_token
        LIMIT 1
    ) t;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_by_share_token(uuid) TO anon, authenticated;
