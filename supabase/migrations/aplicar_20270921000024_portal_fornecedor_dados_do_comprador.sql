-- ==========================================================================
-- Portal do Fornecedor: o pedido diz QUEM está comprando.
--
-- Pedido do usuário (2026-09-17): "no portal do fornecedor (visão do
-- fornecedor), alguns dados precisam chegar ao fornecedor na aba Dados Gerais:
-- nome da empresa, CNPJ, inscrição estadual, inscrição municipal, endereço".
--
-- ── O que faltava ─────────────────────────────────────────────────────────
--
-- A aba Dados Gerais do portal mostrava número, obra, entrega e pagamento —
-- e nada sobre a empresa compradora. O fornecedor precisa desses dados para
-- emitir a nota fiscal contra o CNPJ certo, e a RLS de `companies` (membro da
-- organização) não deixa o fornecedor lê-la direto, por nenhuma das duas
-- portas — link público ou sessão logada. Nem deve: a linha de `companies`
-- tem 60+ colunas de governança (limites de alçada, e-mails internos, regime
-- tributário) que não são assunto dele. RLS não restringe coluna; a função
-- restringe — mesmo desenho de `purchase_orders_project_names`.
--
-- ── De onde vem a empresa ─────────────────────────────────────────────────
--
-- `purchase_orders.empresa_id` é a compradora. Metade dos pedidos (10 de 20 em
-- 2026-09-17) não tem a coluna preenchida, mas TODOS recuperam pela obra
-- (`projects.empresa_id`) — daí o COALESCE, na ordem: o que o pedido diz
-- vence o que a obra diz, porque existem pedidos cuja empresa é diferente da
-- empresa da obra (PO-544808: pedido 8f4369f2…, obra 432d809c…).
-- ==========================================================================

-- ── O recorte, num lugar só ───────────────────────────────────────────────
-- Sem GRANT a ninguém: só as duas RPCs abaixo (SECURITY DEFINER, dono
-- postgres) a chamam. Quem decide se o chamador PODE ver é cada RPC; esta
-- função só sabe montar o JSON, e por isso não pode ser exposta.
CREATE OR REPLACE FUNCTION public.purchase_order_comprador_json(p_order_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'razao_social',         c.razao_social,
        'nome_fantasia',        c.nome_fantasia,
        'cnpj',                 c.cnpj,
        'inscricao_estadual',   c.inscricao_estadual,
        'inscricao_municipal',  c.inscricao_municipal,
        'endereco_fiscal',      c.endereco_fiscal,
        'endereco_operacional', c.endereco_operacional
    )
    FROM public.purchase_orders po
    LEFT JOIN public.projects p ON p.id = po.project_id
    JOIN public.companies c ON c.id = COALESCE(po.empresa_id, p.empresa_id)
    WHERE po.id = p_order_id;
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_order_comprador_json(UUID) FROM PUBLIC, anon, authenticated;

-- ── Fornecedor (ou comprador) LOGADO ──────────────────────────────────────
-- Mesmas duas pernas de `purchase_orders_project_names`: cada uma sozinha
-- basta para liberar, e cada uma é recortada pelo pedido em questão
-- (REGRA #7, pergunta 1). Fora delas, NULL — não um JSON vazio, para o front
-- não confundir "sem permissão" com "empresa sem cadastro".
CREATE OR REPLACE FUNCTION public.purchase_order_comprador(p_order_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE
        WHEN public.purchase_order_is_buyer(p_order_id)
          OR public.purchase_order_is_supplier(p_order_id)
        THEN public.purchase_order_comprador_json(p_order_id)
        ELSE NULL
    END;
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_order_comprador(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.purchase_order_comprador(UUID) TO authenticated;

-- ── Link público: `comprador` junto do pedido ─────────────────────────────
-- Só no detalhe — a lista não mostra empresa. O front lê `item.comprador`
-- (`mapOrderRow`, supplierPortalTokenService).
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
            'project_name', (SELECT p.name FROM public.projects p WHERE p.id = v_order.project_id),
            'comprador',    public.purchase_order_comprador_json(p_order_id)
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
