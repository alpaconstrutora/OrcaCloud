-- ==========================================================================
-- Portal do Fornecedor › Financeiro — três correções (pedido "corrigir",
-- 2026-09-17, sobre as dívidas anotadas em ac485d2b).
--
-- Plano: docs/planos/2026-09-17-portal-fornecedor-aba-financeiro.md (Pedido 2)
--
--   1. Reparcelar pedidos cujas parcelas no razão não batem com as condições
--      (PO-775868: Parcelado 3x, mas 1 parcela de 14.100 gerada quando era à
--      vista).
--   2. Títulos de NF-e passam a ter vínculo com o pedido e vencimento.
--   3. O fornecedor LOGADO deixa de ler a linha crua de `purchase_orders`
--      (com conta de pagamento, centro de custo, plano de contas, aprovação,
--      cadeia de alçada e share_token). Lê por uma view estreita e escreve por
--      RPC — o mesmo desenho que o link público já tem.
-- ==========================================================================

-- ══════════════════════════════════════════════════════════════════════════
-- 1. Reparcelar
-- ══════════════════════════════════════════════════════════════════════════
-- Critério estreito, de propósito: só pedido entregue/recebido cujas parcelas
-- no razão são TODAS pendentes (nada baixado) e cujo número de parcelas
-- difere das condições atuais. Refaz nos DOIS lugares — razão e JSON da obra
-- — porque o espelho (`financialSyncService`) reescreve o razão a partir do
-- JSON; corrigir só um dos dois seria desfeito na próxima conciliação.
-- Mesma aritmética de `financialService.syncOrderToFinance`: base =
-- entrega real ou prevista; vencimento = base + dias × (i+1); última parcela
-- absorve o resíduo de centavos; total = cotado quando houver, senão
-- referência (`utils/pedidoItemValor.ts`).
DO $R$
DECLARE
    r        RECORD;
    v_org    UUID;
    v_total  NUMERIC;
    v_n      INT;
    v_dias   INT;
    v_base   DATE;
    v_parc   NUMERIC;
    v_val    NUMERIC;
    v_venc   DATE;
    v_txid   UUID;
    v_novos  JSONB := '[]'::jsonb;
    v_desc   TEXT;
    v_nfe    TEXT;
    i        INT;
BEGIN
    FOR r IN
        SELECT po.id, po.number, po.project_id, po.supplier_id, po.payment_method,
               po.payment_term_type, po.payment_installments, po.payment_days,
               po.actual_delivery_date, po.delivery_date, po.items,
               po.bank_account, po.cost_center, po.chart_of_accounts,
               s.name AS supplier_name
        FROM public.purchase_orders po
        LEFT JOIN public.suppliers s ON s.id = po.supplier_id
        WHERE po.status IN ('Entregue', 'Recebido', 'Divergência')
          AND EXISTS (SELECT 1 FROM public.internal_transactions it WHERE it.purchase_order_id = po.id)
          AND NOT EXISTS (SELECT 1 FROM public.internal_transactions it
                          WHERE it.purchase_order_id = po.id AND it.status <> 'PENDING')
          AND (SELECT count(*) FROM public.internal_transactions it WHERE it.purchase_order_id = po.id)
              <> CASE WHEN po.payment_term_type = 'Parcelado'
                      THEN GREATEST(COALESCE(po.payment_installments, 1), 1) ELSE 1 END
    LOOP
        SELECT it.organization_id INTO v_org
          FROM public.internal_transactions it WHERE it.purchase_order_id = r.id LIMIT 1;

        v_n    := CASE WHEN r.payment_term_type = 'Parcelado'
                       THEN GREATEST(COALESCE(r.payment_installments, 1), 1) ELSE 1 END;
        v_dias := COALESCE(r.payment_days, 30);
        v_base := COALESCE(r.actual_delivery_date, r.delivery_date, CURRENT_DATE);
        SELECT COALESCE(SUM(COALESCE((it->>'quotedTotal')::numeric, (it->>'total')::numeric)), 0)
          INTO v_total
          FROM jsonb_array_elements(COALESCE(r.items, '[]'::jsonb)) it;
        v_parc := round(v_total / v_n, 2);

        -- nota que gerou a parcela antiga (para o texto de `notes` do JSON)
        SELECT substring(tx->>'notes' from 'NFe: (.*)$') INTO v_nfe
          FROM public.projects p, jsonb_array_elements(p.settings->'financialInfo'->'transactions') tx
         WHERE p.id = r.project_id AND tx->>'orderId' = r.id::text LIMIT 1;

        -- apaga as pendentes antigas, no razão e no JSON
        DELETE FROM public.internal_transactions WHERE purchase_order_id = r.id AND status = 'PENDING';
        UPDATE public.projects p
           SET settings = jsonb_set(
                   p.settings, '{financialInfo,transactions}',
                   COALESCE((SELECT jsonb_agg(tx) FROM jsonb_array_elements(p.settings->'financialInfo'->'transactions') tx
                             WHERE tx->>'orderId' IS DISTINCT FROM r.id::text), '[]'::jsonb))
         WHERE p.id = r.project_id AND p.settings->'financialInfo'->'transactions' IS NOT NULL;

        v_novos := '[]'::jsonb;
        FOR i IN 1..v_n LOOP
            v_val  := CASE WHEN i = v_n THEN round(v_total - v_parc * (v_n - 1), 2) ELSE v_parc END;
            v_venc := v_base + (v_dias * i);
            v_txid := gen_random_uuid();
            v_desc := 'Pagamento PO - Pedido ' || r.number
                      || CASE WHEN v_n > 1 THEN ' (' || i || '/' || v_n || ')' ELSE '' END;

            INSERT INTO public.internal_transactions
                (organization_id, source_system, reference_id, purchase_order_id, project_id,
                 transaction_date, due_date, amount, direction, description, category,
                 entity_name, party_type, party_name, supplier_id, status, business_status)
            VALUES
                (v_org, 'PURCHASE_ORDER', v_txid::text, r.id, r.project_id,
                 v_venc, v_venc, v_val, 'DEBIT', v_desc, 'Material',
                 r.supplier_name, 'SUPPLIER', r.supplier_name, r.supplier_id, 'PENDING', 'PREVISTO');

            v_novos := v_novos || jsonb_build_object(
                'id', v_txid, 'date', to_char(v_venc, 'YYYY-MM-DD') || 'T00:00:00.000Z',
                'type', 'EXPENSE', 'category', 'Material', 'description', v_desc,
                'value', v_val, 'status', 'PENDING',
                'supplier', r.supplier_name, 'supplierId', r.supplier_id, 'orderId', r.id,
                'bankAccount', r.bank_account, 'costCenter', r.cost_center, 'chartOfAccounts', r.chart_of_accounts,
                'notes', 'Reparcelado em ' || to_char(CURRENT_DATE, 'DD/MM/YYYY') || ' pelas condições do pedido. Método: '
                         || COALESCE(r.payment_method, 'Não inf.') || COALESCE('. NFe: ' || v_nfe, ''));
        END LOOP;

        UPDATE public.projects p
           SET settings = jsonb_set(p.settings, '{financialInfo,transactions}',
                   v_novos || COALESCE(p.settings->'financialInfo'->'transactions', '[]'::jsonb))
         WHERE p.id = r.project_id;

        RAISE NOTICE 'Reparcelado % em % parcela(s) de % (total %)', r.number, v_n, v_parc, v_total;
    END LOOP;
END;
$R$;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. Títulos de NF-e: vínculo com o pedido e vencimento
-- ══════════════════════════════════════════════════════════════════════════
-- `nfeService.approveAndLink` gravava o par de partidas sem `purchase_order_id`
-- (o pedido só ia para `nfe_invoices`) e sem `due_date` — título que nunca
-- vence. Backfill; o service passa a gravar os dois (mesma frente).
UPDATE public.internal_transactions it
   SET purchase_order_id = ni.purchase_order_id,
       due_date          = COALESCE(it.due_date, it.transaction_date),
       business_status   = COALESCE(it.business_status, 'PREVISTO'),
       supplier_id       = COALESCE(it.supplier_id, po.supplier_id),
       party_type        = COALESCE(it.party_type, 'SUPPLIER'),
       party_name        = COALESCE(it.party_name, s.name)
  FROM public.nfe_invoices ni
  JOIN public.purchase_orders po ON po.id = ni.purchase_order_id
  LEFT JOIN public.suppliers s ON s.id = po.supplier_id
 WHERE it.source_system = 'NFE'
   AND it.reference_id = ni.id::text
   AND it.purchase_order_id IS NULL;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. Fornecedor logado: view estreita + RPC de escrita
-- ══════════════════════════════════════════════════════════════════════════
-- RLS não restringe coluna. A policy `po_select_org_or_supplier` dava ao
-- fornecedor logado a LINHA inteira — e tirar o SELECT dele também derruba o
-- UPDATE (Postgres exige passar na policy de SELECT quando o UPDATE tem WHERE
-- ou RETURNING). Então: leitura pela view, escrita por RPC.

-- 3a. As colunas que o fornecedor NÃO vê — lista única, usada pela view (por
--     omissão), pelas RPCs de token e pela conferência no fim.
CREATE OR REPLACE FUNCTION public.purchase_order_colunas_internas()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT ARRAY['bank_account', 'cost_center', 'cost_center_id', 'chart_of_accounts',
                 'plano_de_contas_id', 'is_financial_approved',
                 'share_token', 'approval_status', 'approval_chain', 'approval_required_levels'];
$$;
REVOKE EXECUTE ON FUNCTION public.purchase_order_colunas_internas() FROM PUBLIC, anon, authenticated;

-- 3b. A view: as colunas que o fornecedor vê. `security_invoker = on` (trava
--     `viewSecurityGuard`: view que roda como dona ignora a RLS da tabela —
--     foi assim que 24 views vazaram em 2026-08-06). Sozinha ela NÃO devolve
--     nada ao fornecedor, porque a RLS de `purchase_orders` barra; quem lê
--     por ela é a RPC 3c, SECURITY DEFINER — mesmo desenho de
--     `purchase_order_financeiro_json` × `vw_payables`.
CREATE OR REPLACE VIEW public.purchase_orders_fornecedor
WITH (security_invoker = on) AS
    SELECT po.id, po.number, po.project_id, po.supplier_id, po.delivery_date, po.status,
           po.notes, po.items, po.created_at, po.updated_at, po.separation_date, po.shipped_date,
           po.actual_delivery_date, po.payment_method, po.payment_term_type, po.payment_days,
           po.payment_installments, po.delivery_method, po.delivery_location, po.received_at,
           po.receipt_photo_path, po.receipt_notes, po.discrepancy_report, po.status_updated_at,
           po.version, po.empresa_id, po.organization_id, po.notes_visible_to_supplier
    FROM public.purchase_orders po
    WHERE po.status <> 'Rascunho'
      AND public.purchase_order_is_supplier(po.id);

REVOKE ALL ON public.purchase_orders_fornecedor FROM anon;
REVOKE ALL ON public.purchase_orders_fornecedor FROM PUBLIC;
GRANT SELECT ON public.purchase_orders_fornecedor TO authenticated;

-- 3c. A leitura do fornecedor logado. Dentro da função o "invoker" da view é
--     a dona (postgres), que passa pela RLS da tabela; o recorte por
--     fornecedor continua sendo o da view (`purchase_order_is_supplier`, pelo
--     e-mail do JWT da sessão). `SETOF <view>`: o PostgREST aceita `select`,
--     filtros e `order` sobre o resultado, como numa tabela.
CREATE OR REPLACE FUNCTION public.pedidos_do_fornecedor()
RETURNS SETOF public.purchase_orders_fornecedor
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT * FROM public.purchase_orders_fornecedor;
$$;

REVOKE EXECUTE ON FUNCTION public.pedidos_do_fornecedor() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.pedidos_do_fornecedor() TO authenticated;

-- 3d. A policy de SELECT volta a ser só do comprador (membro da organização).
DROP POLICY IF EXISTS "po_select_org_or_supplier" ON public.purchase_orders;
DROP POLICY IF EXISTS "po_select_org" ON public.purchase_orders;
CREATE POLICY "po_select_org" ON public.purchase_orders
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.projects p
            JOIN public.organization_members om ON om.organization_id = p.organization_id
            WHERE p.id = purchase_orders.project_id
              AND om.email = (auth.jwt() ->> 'email')
        )
    );

-- 3e. Escrita do fornecedor logado — o mesmo que o token pode: status, datas
--     de logística e valor cotado dos itens. Nada mais. Datas só entram quando
--     informadas (o `updateOrder` do app também só toca o que recebe).
CREATE OR REPLACE FUNCTION public.purchase_order_update_as_supplier(
    p_order_id             UUID,
    p_status               TEXT    DEFAULT NULL,
    p_delivery_date        DATE    DEFAULT NULL,
    p_separation_date      DATE    DEFAULT NULL,
    p_shipped_date         DATE    DEFAULT NULL,
    p_actual_delivery_date DATE    DEFAULT NULL,
    p_quotes               JSONB   DEFAULT NULL,
    p_expected_version     INT     DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
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
$X$;

REVOKE EXECUTE ON FUNCTION public.purchase_order_update_as_supplier(UUID, TEXT, DATE, DATE, DATE, DATE, JSONB, INT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.purchase_order_update_as_supplier(UUID, TEXT, DATE, DATE, DATE, DATE, JSONB, INT) TO authenticated;

-- 3f. Foto de comprovante: a policy lia `purchase_orders` cru dentro do
--     EXISTS — sob a sessão do fornecedor, sem SELECT na tabela, o EXISTS
--     passaria a ser falso e a foto sumiria. Vai pela função DEFINER.
DROP POLICY IF EXISTS "receipts_select_supplier" ON storage.objects;
CREATE POLICY "receipts_select_supplier" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'receipts'
        AND (storage.foldername(objects.name))[1] ~ '^[0-9a-f-]{36}$'
        AND public.purchase_order_is_supplier(((storage.foldername(objects.name))[1])::uuid)
    );

-- 3g. As RPCs de token passam a usar a MESMA lista de colunas internas.
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
                (row_to_json(o)::jsonb - public.purchase_order_colunas_internas())
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

-- `supplier_portal_get_order_detail` NÃO é redefinida aqui: a
-- aplicar_20270921000028 (frente paralela, "Visível para o fornecedor")
-- partiu deste recorte e é a dona do corpo — redefinir aqui e reaplicar
-- desfaria o corte de `notes` e o `empreendimento_name` dela (aconteceu em
-- 2026-09-17, ao reaplicar esta migration depois daquela).

NOTIFY pgrst, 'reload schema';

-- ── CONFERÊNCIA ───────────────────────────────────────────────────────────
-- A view tem exatamente (colunas da tabela − internas)? Tem de devolver 0:
--   SELECT count(*) FROM information_schema.columns c
--    WHERE c.table_name = 'purchase_orders'
--      AND c.column_name <> ALL (public.purchase_order_colunas_internas())
--      AND c.column_name NOT IN (SELECT column_name FROM information_schema.columns
--                                WHERE table_name = 'purchase_orders_fornecedor');
-- Com sessão do fornecedor (MCC = agente-leitura):
--   GET /rest/v1/purchase_orders?select=id                 → [] (fornecedor puro)
--   GET /rest/v1/purchase_orders_fornecedor?select=id      → [] (a view sozinha respeita a RLS)
--   POST /rest/v1/rpc/pedidos_do_fornecedor?select=*       → pedidos, sem bank_account
--   POST /rest/v1/rpc/purchase_order_update_as_supplier → valid:true
