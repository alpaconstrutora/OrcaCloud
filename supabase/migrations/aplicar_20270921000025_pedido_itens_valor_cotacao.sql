-- ==========================================================================
-- Pedido de compra › itens: valor COTADO ao lado do valor de REFERÊNCIA.
--
-- Plano: docs/planos/2026-09-17-pedido-itens-valor-cotacao.md
--
-- ── O modelo ──────────────────────────────────────────────────────────────
--
-- `purchase_orders.items` é JSONB. Cada item tinha um par só —
-- `unitPrice`/`total` — que misturava o preço do orçamento, o digitado no
-- avulso e o cotado pelo fornecedor vencedor do mapa de cotação. Agora são
-- dois pares dentro do mesmo JSON (nenhuma coluna nova):
--
--   · referência — `unitPrice`/`total`          (o que o comprador previa)
--   · cotado     — `quotedUnitPrice`/`quotedTotal` (o que o fornecedor cobra;
--                  ausente ou null = ainda sem cotação; 0 é cotação válida)
--
-- Regra única, no TS (`utils/pedidoItemValor.ts`) e aqui: o valor que VALE é
-- o cotado quando houver, senão a referência. As duas implementações têm de
-- concordar — mudou uma, muda a outra.
--
-- ── O que esta migration faz ──────────────────────────────────────────────
--
--   1. `fn_pedido_itens_aplicar_cotado(items, cotados)` — aplica cotações
--      sobre o JSON existente SEM substituir o array (preserva descrição,
--      referência, `avulso`...). Casa por índice+code; quando o índice não
--      bate, pelo primeiro item ainda não cotado com o mesmo code. `code`
--      pode se repetir (mesmo insumo do orçamento e como avulso); o índice é
--      o desempate. Espelho de `aplicarCotadoNosItens` (TS).
--   2. `supplier_portal_update_item_quotes` — RPC do portal por token: o
--      fornecedor informa o cotado. Não toca em status nem em qualquer outra
--      coluna; respeita a versão otimista do pedido.
--   3. `supplier_portal_accept_negotiation_proposal` — redefinida: aceitar
--      uma proposta passa a mexer SÓ no cotado (era `items = proposta.items`,
--      que trocava o array inteiro e apagava a referência).
--   4. `fn_create_stock_entry_from_receipt` — custo de entrada em estoque usa
--      o cotado quando houver.
--   5. `fn_approval_action_queue` — valor do pedido na fila de aprovação usa
--      o cotado quando houver (senão a fila mostraria a referência enquanto
--      `submitForApproval` manda o efetivo). `fn_approval_pending_summary` só
--      delega para esta, então não precisa mudar.
--
-- Idempotente: só CREATE OR REPLACE + REVOKE/GRANT. Aplicar com
--   npx supabase db query --linked -f supabase/migrations/aplicar_20270921000025_pedido_itens_valor_cotacao.sql
-- ==========================================================================

SET lock_timeout = '5s';

-- ── 1. Aplicar cotações sobre os itens (SQL puro, sem efeito colateral) ───
--
-- p_cotados: [{ "index": 2, "code": "A", "quotedUnitPrice": 5, "quotedTotal": 20 }, ...]
--   · `index` é opcional; quando presente e o code bate, ganha de qualquer outra linha.
--   · elemento SEM a chave `quotedUnitPrice` (proposta de negociação gravada
--     antes desta migration) usa `unitPrice`/`total` dele como cotado — senão
--     aceitar uma proposta antiga zeraria a cotação do pedido.
--   · `quotedUnitPrice: null` explícito LIMPA a cotação daquele item.
CREATE OR REPLACE FUNCTION public.fn_pedido_itens_aplicar_cotado(
    p_items   JSONB,
    p_cotados JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    v_items   JSONB := COALESCE(p_items, '[]'::jsonb);
    v_cotado  JSONB;
    v_alvo    INT;
    v_idx     INT;
    v_usados  INT[] := ARRAY[]::INT[];
    v_n       INT;
    v_unit    JSONB;
    v_total   JSONB;
BEGIN
    IF jsonb_typeof(v_items) <> 'array' THEN RETURN v_items; END IF;
    v_n := jsonb_array_length(v_items);

    FOR v_cotado IN SELECT * FROM jsonb_array_elements(COALESCE(p_cotados, '[]'::jsonb)) LOOP
        v_alvo := NULL;

        -- índice + code
        v_idx := (v_cotado->>'index')::INT;
        IF v_idx IS NOT NULL AND v_idx >= 0 AND v_idx < v_n
           AND (v_items->v_idx->>'code') IS NOT DISTINCT FROM (v_cotado->>'code')
           AND NOT (v_idx = ANY(v_usados)) THEN
            v_alvo := v_idx;
        ELSE
            -- primeiro item com o mesmo code ainda não cotado nesta passada
            SELECT (ord - 1)::INT INTO v_alvo
            FROM jsonb_array_elements(v_items) WITH ORDINALITY it(item, ord)
            WHERE (it.item->>'code') IS NOT DISTINCT FROM (v_cotado->>'code')
              AND NOT ((ord - 1)::INT = ANY(v_usados))
            ORDER BY ord
            LIMIT 1;
        END IF;

        IF v_alvo IS NULL THEN CONTINUE; END IF;
        v_usados := v_usados || v_alvo;

        -- chave presente (mesmo null) = valor cotado; ausente = proposta legada
        v_unit  := CASE WHEN v_cotado ? 'quotedUnitPrice' THEN COALESCE(v_cotado->'quotedUnitPrice', 'null'::jsonb)
                        ELSE COALESCE(v_cotado->'unitPrice', 'null'::jsonb) END;
        v_total := CASE WHEN v_cotado ? 'quotedTotal' THEN COALESCE(v_cotado->'quotedTotal', 'null'::jsonb)
                        ELSE COALESCE(v_cotado->'total', 'null'::jsonb) END;

        v_items := jsonb_set(
            v_items,
            ARRAY[v_alvo::text],
            (v_items->v_alvo) || jsonb_build_object('quotedUnitPrice', v_unit, 'quotedTotal', v_total),
            false
        );
    END LOOP;

    RETURN v_items;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_pedido_itens_aplicar_cotado(JSONB, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_pedido_itens_aplicar_cotado(JSONB, JSONB) TO authenticated;

-- ── 2. Portal por token: o fornecedor informa o valor cotado ──────────────
--
-- Só os dois campos cotados mudam. Status, datas, condição de pagamento e a
-- referência ficam como estão — o fornecedor não tem porta para isso aqui.
-- Janela: qualquer status exceto Entregue/Recebido/Divergência/Cancelado
-- (rascunho já é barrado por `supplier_portal_pedido_do_fornecedor`).
-- `p_expected_version`: versão otimista do pedido (NULL = não conferir).
CREATE OR REPLACE FUNCTION public.supplier_portal_update_item_quotes(
    p_token            TEXT,
    p_order_id         UUID,
    p_quotes           JSONB,
    p_expected_version INT DEFAULT NULL
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

    SELECT * INTO v_row FROM public.purchase_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    IF v_row.status IN ('Entregue', 'Recebido', 'Divergência', 'Cancelado') THEN
        RETURN '{"valid":false,"reason":"status"}'::jsonb;
    END IF;

    IF p_expected_version IS NOT NULL AND COALESCE(v_row.version, 0) <> p_expected_version THEN
        RETURN '{"valid":false,"reason":"conflict"}'::jsonb;
    END IF;

    UPDATE public.purchase_orders
    SET items      = public.fn_pedido_itens_aplicar_cotado(items, p_quotes),
        version    = COALESCE(version, 0) + 1,
        updated_at = NOW()
    WHERE id = p_order_id
    RETURNING * INTO v_row;

    RETURN jsonb_build_object('valid', TRUE, 'data', row_to_json(v_row));
END;
$X$;

REVOKE EXECUTE ON FUNCTION public.supplier_portal_update_item_quotes(TEXT, UUID, JSONB, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.supplier_portal_update_item_quotes(TEXT, UUID, JSONB, INT) TO anon, authenticated;

-- ── 3. Aceite de proposta pelo portal: só o cotado muda ───────────────────
--
-- Corpo de 20270822000017 com três diferenças: a guarda passa a ser
-- `supplier_portal_pedido_do_fornecedor` (que também barra rascunho, como
-- as demais RPCs desde a 033); `items` recebe a proposta APLICADA sobre os
-- itens atuais em vez de substituí-los; e `version` sobe, para o próximo
-- `updateOrder` do comprador enxergar a mudança.
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
    v_cotados  JSONB;
BEGIN
    IF v_sup IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    IF NOT public.supplier_portal_pedido_do_fornecedor(p_order_id, v_sup) THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    SELECT * INTO v_proposal FROM public.purchase_order_negotiations
    WHERE id = p_proposal_id AND order_id = p_order_id;

    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    UPDATE public.purchase_order_negotiations SET status = 'accepted' WHERE id = p_proposal_id;

    UPDATE public.purchase_order_negotiations
    SET status = 'countered'
    WHERE order_id = p_order_id AND status = 'pending' AND id <> p_proposal_id;

    -- Cada item da proposta carrega a posição, para casar com o item certo
    -- mesmo quando o code se repete. Proposta antiga (sem `quotedUnitPrice`)
    -- é tratada pela própria fn_pedido_itens_aplicar_cotado.
    SELECT COALESCE(jsonb_agg(p.item || jsonb_build_object('index', p.ord - 1) ORDER BY p.ord), '[]'::jsonb)
    INTO v_cotados
    FROM jsonb_array_elements(COALESCE(v_proposal.items, '[]'::jsonb)) WITH ORDINALITY p(item, ord);

    UPDATE public.purchase_orders
    SET status = 'Confirmado',
        delivery_date = v_proposal.delivery_date,
        items = public.fn_pedido_itens_aplicar_cotado(items, v_cotados),
        payment_method = v_proposal.payment_method,
        payment_term_type = v_proposal.payment_term_type,
        payment_days = v_proposal.payment_days,
        payment_installments = v_proposal.payment_installments,
        version = COALESCE(version, 0) + 1,
        status_updated_at = NOW(),
        updated_at = NOW()
    WHERE id = p_order_id;

    RETURN jsonb_build_object('valid', TRUE, 'data', row_to_json(v_proposal));
END;
$X$;

REVOKE EXECUTE ON FUNCTION public.supplier_portal_accept_negotiation_proposal(TEXT, UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.supplier_portal_accept_negotiation_proposal(TEXT, UUID, UUID) TO anon, authenticated;

-- ── 4. Custo de entrada em estoque: cotado quando houver ──────────────────
-- Corpo de 20261130000001; muda só o SELECT do preço unitário.
CREATE OR REPLACE FUNCTION public.fn_create_stock_entry_from_receipt(
    p_receipt_id   UUID,
    p_warehouse_id UUID
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    r_org    UUID;
    r_item   RECORD;
    v_cost   NUMERIC;
BEGIN
    -- busca org do almoxarifado
    SELECT organization_id INTO r_org FROM public.warehouses WHERE id = p_warehouse_id;

    -- para cada item do recibo, insere um movimento de entrada
    FOR r_item IN
        SELECT
            pri.order_item_code   AS input_code,
            pri.description       AS input_description,
            pri.unit              AS input_unit,
            pri.quantity_received AS quantity
        FROM public.purchase_receipt_items pri
        WHERE pri.receipt_id = p_receipt_id
          AND pri.quantity_received > 0
    LOOP
        -- preço unitário do PO correspondente (best-effort): o cotado pelo
        -- fornecedor quando houver, senão o de referência
        SELECT
            CASE
                WHEN po.items IS NOT NULL
                THEN (
                    SELECT COALESCE((item->>'quotedUnitPrice')::NUMERIC, (item->>'unitPrice')::NUMERIC)
                    FROM jsonb_array_elements(po.items::jsonb) AS item
                    WHERE item->>'code' = r_item.input_code
                    LIMIT 1
                )
                ELSE NULL
            END
        INTO v_cost
        FROM public.purchase_receipts pr
        JOIN public.purchase_orders po ON po.id = pr.order_id
        WHERE pr.id = p_receipt_id
        LIMIT 1;

        INSERT INTO public.stock_movements
            (organization_id, warehouse_id, input_code, input_description, input_unit,
             type, quantity, unit_cost, receipt_id, moved_at)
        VALUES
            (r_org, p_warehouse_id,
             r_item.input_code, r_item.input_description, r_item.input_unit,
             'in', r_item.quantity, v_cost, p_receipt_id, CURRENT_DATE);
    END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_create_stock_entry_from_receipt(UUID, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_create_stock_entry_from_receipt(UUID, UUID) TO authenticated;

-- ── 5. Fila de aprovação: valor do pedido = Σ efetivo ─────────────────────
-- Corpo de aplicar_20270919000029 inteiro (CREATE OR REPLACE substitui tudo);
-- muda só o SUM do ramo de COMPRAS.
CREATE OR REPLACE FUNCTION public.fn_approval_action_queue(
  p_organization_id UUID
)
RETURNS TABLE (
  entity                   TEXT,
  id                       UUID,
  title                    TEXT,
  party_name               TEXT,
  project_name             TEXT,
  amount                   NUMERIC,
  due_date                 DATE,
  approval_status          TEXT,
  approval_chain           JSONB,
  approval_required_levels INT
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

  RETURN QUERY
  -- TRANSAÇÕES (saídas)
  SELECT
    'transaction'::text,
    t.id,
    COALESCE(NULLIF(t.description, ''), '(sem descrição)'),
    t.party_name,
    p.name,
    t.amount,
    t.due_date::date,
    COALESCE(t.approval_status, 'RASCUNHO'),
    COALESCE(t.approval_chain, '[]'::jsonb),
    COALESCE(t.approval_required_levels, 1)
  FROM public.internal_transactions t
  LEFT JOIN public.projects p ON p.id = t.project_id
  WHERE t.organization_id = ANY(v_targets)
    AND t.direction = 'DEBIT'
    AND COALESCE(t.approval_status, 'RASCUNHO') IN ('RASCUNHO', 'PENDENTE')
    AND EXISTS (
      SELECT 1 FROM public.financial_approval_config c
      WHERE c.organization_id = t.organization_id AND c.is_active
        AND t.amount >= c.faixa_min AND (c.faixa_max IS NULL OR t.amount < c.faixa_max)
    )

  UNION ALL

  -- CONTRATOS
  SELECT
    'contract'::text,
    k.id,
    COALESCE(NULLIF(k.title, ''), 'Contrato ' || COALESCE(k.number, '')),
    COALESCE(s.name, cl.name),
    p.name,
    k.current_value,
    NULL::date,
    COALESCE(k.approval_status, 'RASCUNHO'),
    COALESCE(k.approval_chain, '[]'::jsonb),
    COALESCE(k.approval_required_levels, 1)
  FROM public.contracts k
  LEFT JOIN public.projects  p  ON p.id  = k.project_id
  LEFT JOIN public.suppliers s  ON s.id  = k.supplier_id
  LEFT JOIN public.clients   cl ON cl.id = k.client_id
  WHERE k.organization_id = ANY(v_targets)
    AND COALESCE(k.approval_status, 'RASCUNHO') IN ('RASCUNHO', 'PENDENTE')
    AND EXISTS (
      SELECT 1 FROM public.financial_approval_config c
      WHERE c.organization_id = k.organization_id AND c.is_active
        AND k.current_value >= c.faixa_min AND (c.faixa_max IS NULL OR k.current_value < c.faixa_max)
    )

  UNION ALL

  -- COMPRAS (purchase_orders) — valor = Σ items[] (cotado quando houver, senão
  -- referência — mesma regra de utils/pedidoItemValor.ts); escopo via empresa→org
  SELECT
    'purchase_order'::text,
    po.id,
    'Pedido ' || COALESCE(po.number, ''),
    s.name,
    p.name,
    po_total.v,
    NULL::date,
    COALESCE(po.approval_status, 'RASCUNHO'),
    COALESCE(po.approval_chain, '[]'::jsonb),
    COALESCE(po.approval_required_levels, 1)
  FROM public.purchase_orders po
  JOIN public.companies cmp ON cmp.id = po.empresa_id
  LEFT JOIN public.projects  p ON p.id = po.project_id
  LEFT JOIN public.suppliers s ON s.id = po.supplier_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(COALESCE((it->>'quotedTotal')::numeric, (it->>'total')::numeric)), 0) AS v
    FROM jsonb_array_elements(COALESCE(po.items, '[]'::jsonb)) it
  ) po_total
  WHERE cmp.org_id = ANY(v_targets)
    AND COALESCE(po.approval_status, 'RASCUNHO') IN ('RASCUNHO', 'PENDENTE')
    AND EXISTS (
      SELECT 1 FROM public.financial_approval_config c
      WHERE c.organization_id = cmp.org_id AND c.is_active
        AND po_total.v >= c.faixa_min AND (c.faixa_max IS NULL OR po_total.v < c.faixa_max)
    )

  UNION ALL
  -- PLANTA PUBLICADA (blueprint_snapshots)
  --
  -- ⚠️ A condicao aqui e DIFERENTE das tres acima, de proposito. Elas exigem que
  -- o item caia numa faixa de `financial_approval_config` -- porque sao sobre
  -- DINHEIRO, e a faixa e que diz se aquele valor precisa de aprovacao. Uma
  -- revisao de planta nao tem valor: `submit` e chamado com `amount: 0`, como o
  -- proprio approvalService manda fazer para entidade nao monetaria.
  --
  -- Entao o criterio e outro: esta na fila o que ALGUEM ENVIOU. Copiar a
  -- condicao de faixa traria toda revisao publicada para a fila (ou nenhuma,
  -- conforme a organizacao tenha ou nao uma faixa comecando em zero) -- e uma
  -- fila que enche sozinha e uma fila que ninguem olha.
  SELECT
    'blueprint_snapshot'::text,
    bs.id,
    COALESCE(NULLIF(st.name, ''), '(planta sem nome)') || ' - revisao ' || bs.revision::text,
    NULL::text,
    p.name,
    0::numeric,
    NULL::date,
    COALESCE(bs.approval_status, 'RASCUNHO'),
    COALESCE(bs.approval_chain, '[]'::jsonb),
    COALESCE(bs.approval_required_levels, 1)
  FROM public.blueprint_snapshots bs
  JOIN public.blueprint_studies st ON st.id = bs.study_id
  LEFT JOIN public.projects p ON p.id = st.project_id
  WHERE bs.organization_id = ANY(v_targets)
    AND bs.approval_status = 'PENDENTE'

  -- ⚠️ O ORDER BY e do CONJUNTO, e por isso vem depois do ultimo ramo. Ele
  -- estava no fim do terceiro ramo, e emendar o quarto abaixo dele o deixaria
  -- ordenando so uma parte -- que o Postgres recusa, e com razao.
  ORDER BY due_date NULLS LAST, amount DESC;

END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_approval_action_queue(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_approval_action_queue(uuid) TO authenticated;
