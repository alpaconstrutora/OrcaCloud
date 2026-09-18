-- ==========================================================================
-- Portal do Fornecedor: aba "Financeiro" — condições do pedido + parcelas reais.
--
-- Plano: docs/planos/2026-09-17-portal-fornecedor-aba-financeiro.md
-- Pedido (2026-09-17): "criar nos portais (visao do app e do fornecedor) aba
-- financeiro e conectar com suprimentos < pedidos < aba financeiro".
--
-- ── O que faltava ─────────────────────────────────────────────────────────
--
-- O fornecedor não tinha onde ver o que a construtora lhe deve e quando vence.
-- As condições estão em `purchase_orders` (forma, à vista/parcelado, dias,
-- nº de parcelas — o que o comprador define em Suprimentos › Pedidos ›
-- Financeiro) e as parcelas reais em `internal_transactions` (DEBIT), lidas
-- por `vw_payables`. O fornecedor não passa em NENHUMA policy de
-- `internal_transactions` (nem logado, nem anon) — e nem deve: a linha carrega
-- centro de custo, plano de contas, aprovação. RLS não restringe coluna; a
-- função restringe. Mesmo desenho de `purchase_order_comprador_json`
-- (aplicar_20270921000024): helper sem GRANT + casca de token + casca do logado.
--
-- ── O vínculo título→pedido estava quebrado ───────────────────────────────
--
-- `internal_transactions.purchase_order_id` existe desde 20261221000001 e
-- NUNCA foi gravado por service nenhum. Medido em 2026-09-17: 0 linhas
-- `source_system='PURCHASE_ORDER'`; as 12 parcelas de pedido existentes estão
-- como `PROJECT`, sem `supplier_id`, sem `party_name` — porque
-- `financialSyncService.syncFinancialData` faz upsert de TODAS as transações
-- do JSON da obra com `source_system='PROJECT'` e conflito em
-- (organization_id, reference_id, entry_type), caindo em cima da linha que
-- `syncOrderToFinance` tinha gravado (mesmo `reference_id` = id do tx do JSON).
--
-- Por isso o backfill principal casa pelo JSON da obra (`tx.orderId` ↔
-- `tx.id = reference_id`) — é o único vínculo que sobreviveu — e o helper
-- filtra SÓ por `purchase_order_id`, nunca por `source_system`. E por isso
-- `reference_id` NÃO vira composto: o upsert do espelho criaria uma segunda
-- linha (título duplicado). Os services passam a gravar `purchase_order_id`
-- (financialService / financialSyncService, mesma frente).
--
-- ── Medição (rodar antes e depois) ────────────────────────────────────────
--
--   SELECT count(*) FILTER (WHERE purchase_order_id IS NOT NULL) com_po,
--          count(*) FILTER (WHERE purchase_order_id IS NULL)     sem_po
--   FROM public.internal_transactions
--   WHERE source_system = 'PURCHASE_ORDER' OR description LIKE 'Pagamento PO - Pedido %';
--   -- 2026-09-17 antes: com_po 0, sem_po 12. Esperado depois: 10 / 2
--   -- (PO-955605 e PO-829254 são de pedidos apagados; ficam como estão).
-- ==========================================================================

-- ── 1. Backfill, passada A: pelo JSON da obra ─────────────────────────────
-- Também preenche fornecedor e origem: assim as parcelas passam a mostrar o
-- credor no Contas a Pagar (a nota de 20270840000000 dizia "fornecedor não é
-- backfillável" — era, pelo pedido).
UPDATE public.internal_transactions it
SET purchase_order_id = po.id,
    supplier_id       = COALESCE(it.supplier_id, po.supplier_id),
    party_type        = COALESCE(it.party_type, 'SUPPLIER'),
    party_name        = COALESCE(it.party_name, s.name),
    entity_name       = COALESCE(it.entity_name, s.name),
    source_system     = 'PURCHASE_ORDER'
FROM public.projects p
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.settings->'financialInfo'->'transactions', '[]'::jsonb)) tx
JOIN public.purchase_orders po ON (tx->>'orderId') ~ '^[0-9a-f-]{36}$' AND po.id = (tx->>'orderId')::uuid
LEFT JOIN public.suppliers s ON s.id = po.supplier_id
WHERE it.purchase_order_id IS NULL
  AND it.project_id = p.id
  AND it.reference_id = tx->>'id';

-- ── 2. Backfill, passada B: órfãs, pela descrição ─────────────────────────
-- Linhas cujo tx sumiu do JSON (re-sync limpa o JSON, não o razão). Casa por
-- número do pedido + obra — NÃO por supplier_id, que é NULL nessas linhas —
-- e só quando o casamento é único.
WITH cand AS (
    SELECT it.id AS tx_id, po.id AS po_id, po.supplier_id, s.name AS supplier_name,
           count(*) OVER (PARTITION BY it.id) AS n
    FROM public.internal_transactions it
    JOIN public.purchase_orders po
      ON po.number = substring(it.description from 'Pedido (\S+)')
     AND po.project_id = it.project_id
    LEFT JOIN public.suppliers s ON s.id = po.supplier_id
    WHERE it.purchase_order_id IS NULL
      AND it.description LIKE 'Pagamento PO - Pedido %'
)
UPDATE public.internal_transactions it
SET purchase_order_id = c.po_id,
    supplier_id       = COALESCE(it.supplier_id, c.supplier_id),
    party_type        = COALESCE(it.party_type, 'SUPPLIER'),
    party_name        = COALESCE(it.party_name, c.supplier_name),
    entity_name       = COALESCE(it.entity_name, c.supplier_name),
    source_system     = 'PURCHASE_ORDER'
FROM cand c
WHERE c.tx_id = it.id AND c.n = 1;

-- ── 3. O recorte, num lugar só (sem GRANT a ninguém) ──────────────────────
-- `vw_payables` é a ÚNICA dona da regra de `effective_status` (PAGO/VENCIDO/
-- …) e do recorte (DEBIT, não CANCELLED, não CONTRA) — daí o JOIN pela view
-- em vez de copiar o CASE (a própria aplicar_20270914000014 registra que o
-- repo já esteve desatualizado em relação à view viva). A view é
-- security_invoker; dentro desta função SECURITY DEFINER (dono postgres) ela
-- lê sem RLS, que é o que se quer. Função SQL não registra dependência da
-- view: um DROP VIEW não avisa — o teste de fumaça da frente cobre isso.
CREATE OR REPLACE FUNCTION public.purchase_order_financeiro_json(p_order_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'condicoes', (
            SELECT jsonb_build_object(
                'payment_method',       po.payment_method,
                'payment_term_type',    po.payment_term_type,
                'payment_days',         po.payment_days,
                'payment_installments', po.payment_installments,
                'notes',                po.notes
            )
            FROM public.purchase_orders po WHERE po.id = p_order_id
        ),
        'parcelas', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id',               x.id,
                'numero',           x.numero,
                'total_parcelas',   x.total_parcelas,
                'due_date',         x.due_date,
                'amount',           x.amount,
                'payment_date',     x.payment_date,
                'effective_status', x.effective_status
            ) ORDER BY x.numero)
            FROM (
                SELECT it.id, it.due_date, it.amount, it.payment_date, v.effective_status,
                       row_number() OVER (ORDER BY it.due_date NULLS LAST, it.created_at) AS numero,
                       count(*)     OVER ()                                                AS total_parcelas
                FROM public.internal_transactions it
                JOIN public.vw_payables v ON v.id = it.id
                WHERE it.purchase_order_id = p_order_id
            ) x
        ), '[]'::jsonb)
    );
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_order_financeiro_json(UUID) FROM PUBLIC, anon, authenticated;

-- ── 4. Casca do link público ──────────────────────────────────────────────
-- Todos os pedidos do fornecedor (não rascunho — `supplier_portal_pedido_do_
-- fornecedor` é a trava única), cada um com seu financeiro. A aba do portal
-- lista parcelas de TODOS os pedidos de uma vez; uma RPC por pedido seria N+1.
CREATE OR REPLACE FUNCTION public.supplier_portal_get_financials(p_token TEXT)
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
                jsonb_build_object(
                    'order_id',     o.id,
                    'number',       o.number,
                    'status',       o.status,
                    'project_name', (SELECT p.name FROM public.projects p WHERE p.id = o.project_id),
                    'total',        (SELECT COALESCE(SUM((i->>'total')::numeric), 0)
                                     FROM jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) i),
                    'financeiro',   public.purchase_order_financeiro_json(o.id)
                )
                ORDER BY o.created_at DESC
            )
            FROM public.purchase_orders o
            WHERE o.supplier_id = v_sup
              AND public.supplier_portal_pedido_do_fornecedor(o.id, v_sup)
        ), '[]'::jsonb)
    );
END;
$X$;

REVOKE EXECUTE ON FUNCTION public.supplier_portal_get_financials(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.supplier_portal_get_financials(TEXT) TO anon, authenticated;

-- ── 5. Casca do logado (comprador ou fornecedor), em lote ─────────────────
-- Mesmas duas pernas de `purchase_orders_project_names`: cada uma sozinha
-- basta para liberar e é recortada pelo pedido em questão (REGRA #7, p. 1).
CREATE OR REPLACE FUNCTION public.purchase_orders_financeiro(p_order_ids UUID[])
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        jsonb_object_agg(po.id::text, public.purchase_order_financeiro_json(po.id)),
        '{}'::jsonb
    )
    FROM public.purchase_orders po
    WHERE po.id = ANY(p_order_ids)
      AND (
          public.purchase_order_is_buyer(po.id)
          OR public.purchase_order_is_supplier(po.id)
      );
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_orders_financeiro(UUID[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.purchase_orders_financeiro(UUID[]) TO authenticated;

-- ── 6. Recorte contábil nas RPCs de token ─────────────────────────────────
-- `row_to_json(purchase_orders)` inteiro entregava ao fornecedor a conta de
-- pagamento, centro de custo, plano de contas e a aprovação financeira do
-- comprador — dimensões internas que a UI nunca mostrou, mas que iam no JSON.
-- Decisão do usuário (2026-09-17): esconder. Nenhum componente do portal lê
-- esses campos. O detalhe ganha `financeiro` (uma chamada, não duas).

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
                (row_to_json(o)::jsonb
                    - 'bank_account' - 'cost_center' - 'cost_center_id'
                    - 'chart_of_accounts' - 'plano_de_contas_id' - 'is_financial_approved')
                || jsonb_build_object(
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
        'order', (row_to_json(v_order)::jsonb
                    - 'bank_account' - 'cost_center' - 'cost_center_id'
                    - 'chart_of_accounts' - 'plano_de_contas_id' - 'is_financial_approved')
                 || jsonb_build_object(
            'project_name', (SELECT p.name FROM public.projects p WHERE p.id = v_order.project_id),
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

-- ── 7. A aba nova aparece para quem já configurou abas ────────────────────
-- `supplierPortalTabs` é allow-list: lista salva sem 'financeiro' esconderia a
-- aba. Decisão do usuário: ligar para todos; quem quiser esconde em
-- "Configurar abas". Fornecedor sem a chave já vê todas.
UPDATE public.suppliers
SET settings = jsonb_set(settings, '{supplierPortalTabs}',
                         (settings->'supplierPortalTabs') || '["financeiro"]'::jsonb)
WHERE settings ? 'supplierPortalTabs'
  AND jsonb_typeof(settings->'supplierPortalTabs') = 'array'
  AND NOT (settings->'supplierPortalTabs') ? 'financeiro';

NOTIFY pgrst, 'reload schema';

-- ── CONFERÊNCIA ───────────────────────────────────────────────────────────
--   SELECT proname, proacl FROM pg_proc
--    WHERE proname IN ('purchase_order_financeiro_json','supplier_portal_get_financials',
--                      'purchase_orders_financeiro');
--   -- helper: sem "=X/" e sem anon/authenticated; token: anon+authenticated; logado: authenticated
--   SELECT (supplier_portal_get_orders('<token>')->'data'->0) ? 'bank_account';   -- false
