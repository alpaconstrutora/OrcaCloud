-- Security fix: enable RLS on purchase_order_negotiations
-- Tabela criada em 20260216000006 sem RLS; contém emails, preços e mensagens por tenant.
-- Política: acesso liberado a membros da org dona do pedido pai.

ALTER TABLE public.purchase_order_negotiations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "negotiations_org_member_access"
ON public.purchase_order_negotiations
FOR ALL
USING (
    order_id IN (
        SELECT id
        FROM public.purchase_orders
        WHERE organization_id IN (
            SELECT organization_id
            FROM public.organization_members
            WHERE user_id = auth.uid()
        )
    )
)
WITH CHECK (
    order_id IN (
        SELECT id
        FROM public.purchase_orders
        WHERE organization_id IN (
            SELECT organization_id
            FROM public.organization_members
            WHERE user_id = auth.uid()
        )
    )
);
