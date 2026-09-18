-- ==========================================================================
-- Pedido de compra › Dados Gerais: observações com visibilidade para o
-- fornecedor, e nome do empreendimento no portal.
--
-- Plano: docs/planos/2026-09-17-pedido-dados-gerais-empreendimento-notas.md
--
-- ── O que muda ─────────────────────────────────────────────────────────────
--
--   1. `purchase_orders.notes_visible_to_supplier` (boolean, default TRUE).
--      O comprador decide, por pedido, se as "Notas / Observações" aparecem
--      para o fornecedor. Default TRUE porque hoje elas SEMPRE aparecem no
--      portal — a coluna nasce sem mudar o que já está no ar; quem quiser
--      esconder desmarca.
--
--   2. `supplier_portal_get_order_detail` — corpo de aplicar_20270921000027
--      (frente portal-fornecedor-financeiro-correcoes, que recorta as colunas
--      internas por `purchase_order_colunas_internas()`) com duas diferenças:
--      `notes` sai do JSON quando a flag está em FALSE (o corte tem de ser aqui, no servidor — esconder só na tela deixaria o
--      texto no payload da RPC pública), e entra `empreendimento_name`,
--      resolvido pela obra do pedido (torre primeiro, depois vínculo direto —
--      a mesma ordem de `empreendimentoService.mapObrasToEmpreendimentos`),
--      porque a RLS de `empreendimentos` barra o fornecedor.
--
-- ⚠️ ORDEM: redefine a MESMA função que aplicar_20270921000027 (outra frente,
-- aberta em paralelo em 2026-09-17). Esta (000028) tem de ser aplicada DEPOIS
-- daquela — reaplicar a 000027 por cima desfaz o corte de `notes` e o
-- `empreendimento_name`. Quem mexer nesta função de novo parte deste corpo.
--
-- Idempotente. Aplicar com
--   npx supabase db query --linked -f supabase/migrations/aplicar_20270921000028_pedido_notas_visiveis_fornecedor.sql
-- ==========================================================================

SET lock_timeout = '5s';

ALTER TABLE public.purchase_orders
    ADD COLUMN IF NOT EXISTS notes_visible_to_supplier BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.purchase_orders.notes_visible_to_supplier IS
    'FALSE = as observações (notes) do pedido não são entregues ao fornecedor (portal por token e área logada).';

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
    IF NOT public.supplier_portal_pedido_do_fornecedor(p_order_id, v_sup) THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    SELECT * INTO v_order FROM public.purchase_orders WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'order', (row_to_json(v_order)::jsonb - public.purchase_order_colunas_internas())
                 || jsonb_build_object(
            'project_name', (SELECT p.name FROM public.projects p WHERE p.id = v_order.project_id),
            -- Torre primeiro (vínculo principal), depois o vínculo direto da obra.
            'empreendimento_name', COALESCE(
                (SELECT e.name FROM public.empreendimento_towers t
                   JOIN public.empreendimentos e ON e.id = t.empreendimento_id
                  WHERE t.project_id = v_order.project_id
                  ORDER BY t.name LIMIT 1),
                (SELECT e.name FROM public.empreendimentos e
                  WHERE e.project_id = v_order.project_id
                  ORDER BY e.name LIMIT 1)
            ),
            -- O comprador escolhe se as observações vão para o fornecedor.
            'notes', CASE WHEN COALESCE(v_order.notes_visible_to_supplier, TRUE) THEN v_order.notes ELSE NULL END,
            'comprador',    public.purchase_order_comprador_json(p_order_id),
            'financeiro',   public.purchase_order_financeiro_json(p_order_id)
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
