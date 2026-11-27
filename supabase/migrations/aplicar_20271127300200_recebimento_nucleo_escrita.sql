-- aplicar_20271127300200_recebimento_nucleo_escrita.sql
--
-- Recebimento mobile, Fase 2 (docs/planos/2026-11-27-recebimento-mobile.md).
-- Prova: scripts/teste-recebimento-nucleo.sql.
--
-- Uma regra, dois chamadores: a Edge `pedido-recebimento` (service role) grava o
-- recebimento do app logado (JWT) e do link `/celular` (token) por ESTES núcleos,
-- com o ator explícito — mesmo desenho de `_diary_upsert_core(p_ator, …)`.
-- A regra de negócio (saldo, parcial, divergências) é calculada pela Edge com
-- lib/recebimento.ts; aqui se autoriza, trava o pedido, confere a versão e grava
-- TUDO numa transação (antes, o navegador gravava o recebimento e só depois
-- conferia a versão do pedido — num conflito, ficava recebimento órfão).
--
-- Autorização (todas as orgs de que o ator é membro — regra do usuário de 27/11):
--   org do pedido = coalesce(purchase_orders.organization_id, org da obra);
--   o ator tem de poder pedir nela (`fn_pode_criar_pedido_de`, que já exige ser
--   membro) e não pode ser o próprio fornecedor (mesma regra do botão Receber).
--
-- Status que recebem (decisão do usuário de 27/11): CIF em "Em Trânsito" ou
-- "Entregue"; FOB só "Entregue" (= retirado). O núcleo reconfere com o pedido
-- travado — a Edge já conferiu, mas o status pode ter mudado no meio.
--
-- Também (achado de 27/11): o fornecedor podia mudar o status de pedido já
-- conferido — inclusive marcar "Recebido" ele mesmo ou voltar para "Em
-- Trânsito". Com o recebimento CIF em "Em Trânsito", o "Entregue" atrasado do
-- fornecedor desfaria a conferência. As duas RPCs do fornecedor passam a recusar
-- ('recebido') e a do token passa a subir a versão (a do login já subia).
--
-- ⚠️ Aplicar à mão, da pasta de uma frente LIGADA ao projeto. Depois da 300100.

-- ── Org do pedido ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._pedido_org(p_order UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT coalesce(po.organization_id, public._celular_org_do_projeto(p.organization_id, p.settings))
      FROM public.purchase_orders po
      LEFT JOIN public.projects p ON p.id = po.project_id
     WHERE po.id = p_order
$$;

-- ── Autoriza o ator num pedido; devolve a org do pedido ──────────────────────
CREATE OR REPLACE FUNCTION public._recebimento_autoriza_de(p_user UUID, p_order UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org   UUID;
    v_email TEXT;
    v_forn  TEXT;
BEGIN
    IF p_user IS NULL OR p_order IS NULL THEN
        RAISE EXCEPTION 'pedido não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;
    v_org := public._pedido_org(p_order);
    IF v_org IS NULL OR public.fn_pode_criar_pedido_de(p_user, v_org) IS NOT TRUE THEN
        RAISE EXCEPTION 'pedido não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;
    SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = p_user;
    SELECT lower(s.email) INTO v_forn
      FROM public.purchase_orders po JOIN public.suppliers s ON s.id = po.supplier_id
     WHERE po.id = p_order;
    IF v_email IS NOT NULL AND v_email = v_forn THEN
        RAISE EXCEPTION 'O fornecedor não confere o próprio pedido.' USING ERRCODE = '42501';
    END IF;
    RETURN v_org;
END;
$$;

-- ── Status que recebem (espelho de podeReceber, lib/recebimento.ts) ──────────
CREATE OR REPLACE FUNCTION public._recebimento_status_recebe(p_status TEXT, p_delivery_method TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE WHEN public.fn_pedido_eh_fob(p_delivery_method)
                THEN p_status = 'Entregue'
                ELSE p_status IN ('Em Trânsito', 'Entregue') END
$$;

-- ── Grava uma conferência ────────────────────────────────────────────────────
-- p_itens: [{order_item_index, order_item_code, description, unit, quantity_ordered, quantity_received, issue, notes}]
-- p_divergencias: [{order_item_code, description, unit, issue, quantity, notes}]
-- Devolve {ja_existia, receipt_id, status, status_pedido, versao}.
CREATE OR REPLACE FUNCTION public._recebimento_registrar_core(
    p_ator UUID, p_order UUID, p_receipt UUID, p_versao INTEGER,
    p_status TEXT, p_status_pedido TEXT, p_notas TEXT, p_photo_path TEXT,
    p_itens JSONB, p_divergencias JSONB, p_relatorio JSONB, p_origem TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_po   public.purchase_orders;
    v_rec  public.purchase_receipts;
BEGIN
    PERFORM public._recebimento_autoriza_de(p_ator, p_order);

    IF p_receipt IS NULL THEN
        RAISE EXCEPTION 'conferência sem identificador' USING ERRCODE = '22023';
    END IF;
    IF p_status NOT IN ('Recebido', 'Divergência', 'Parcial')
       OR p_status_pedido IS DISTINCT FROM (CASE WHEN p_status = 'Parcial' THEN 'Entregue' ELSE p_status END) THEN
        RAISE EXCEPTION 'status da conferência inválido' USING ERRCODE = '22023';
    END IF;
    IF p_origem NOT IN ('APP', 'LINK') THEN
        RAISE EXCEPTION 'origem inválida' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array' OR jsonb_array_length(p_itens) = 0
       OR jsonb_typeof(coalesce(p_divergencias, '[]'::jsonb)) <> 'array' THEN
        RAISE EXCEPTION 'conferência sem itens' USING ERRCODE = '22023';
    END IF;
    IF p_photo_path IS NOT NULL AND p_photo_path !~ ('^' || p_order::text || '/[^/]+$') THEN
        RAISE EXCEPTION 'foto fora da pasta do pedido' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_order FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'pedido não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;

    -- Reenvio da MESMA conferência (rede caiu depois de gravar): devolve o que
    -- já existe, ANTES de conferir a versão (que a 1ª gravação já subiu).
    SELECT * INTO v_rec FROM public.purchase_receipts WHERE id = p_receipt;
    IF FOUND THEN
        IF v_rec.order_id <> p_order THEN
            RAISE EXCEPTION 'conferência de outro pedido' USING ERRCODE = '22023';
        END IF;
        RETURN jsonb_build_object('ja_existia', true, 'receipt_id', v_rec.id, 'status', v_rec.status,
                                  'status_pedido', v_po.status, 'versao', coalesce(v_po.version, 0));
    END IF;

    IF coalesce(v_po.version, 0) <> coalesce(p_versao, -1) THEN
        RAISE EXCEPTION 'CONFLICT: Este pedido foi alterado por outra pessoa. Recarregue e tente de novo.' USING ERRCODE = '40001';
    END IF;
    IF NOT public._recebimento_status_recebe(v_po.status, v_po.delivery_method) THEN
        RAISE EXCEPTION 'Este pedido não pode ser conferido no status "%".', v_po.status USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.purchase_receipts (id, order_id, status, notes, photo_path, received_by, origem)
    VALUES (p_receipt, p_order, p_status, nullif(btrim(coalesce(p_notas, '')), ''), p_photo_path, p_ator, p_origem);

    INSERT INTO public.purchase_receipt_items
           (receipt_id, order_item_index, order_item_code, description, unit, quantity_ordered, quantity_received, issue, notes)
    SELECT p_receipt, (i ->> 'order_item_index')::int, i ->> 'order_item_code', i ->> 'description', i ->> 'unit',
           (i ->> 'quantity_ordered')::numeric, (i ->> 'quantity_received')::numeric,
           nullif(i ->> 'issue', ''), nullif(i ->> 'notes', '')
      FROM jsonb_array_elements(p_itens) i;

    INSERT INTO public.purchase_discrepancies
           (order_id, receipt_id, order_item_code, description, unit, issue, quantity, notes, status)
    SELECT p_order, p_receipt, d ->> 'order_item_code', d ->> 'description', d ->> 'unit',
           d ->> 'issue', (d ->> 'quantity')::numeric, nullif(d ->> 'notes', ''), 'Pendente'
      FROM jsonb_array_elements(coalesce(p_divergencias, '[]'::jsonb)) d;

    UPDATE public.purchase_orders
       SET status               = p_status_pedido,
           status_updated_at    = now(),
           received_at          = coalesce(received_at, now()),
           actual_delivery_date = coalesce(actual_delivery_date, current_date),
           receipt_notes        = nullif(btrim(coalesce(p_notas, '')), ''),
           receipt_photo_path   = coalesce(p_photo_path, receipt_photo_path),
           discrepancy_report   = coalesce(p_relatorio, discrepancy_report),
           version              = coalesce(p_versao, 0) + 1,
           updated_at           = now()
     WHERE id = p_order;

    RETURN jsonb_build_object('ja_existia', false, 'receipt_id', p_receipt, 'status', p_status,
                              'status_pedido', p_status_pedido, 'versao', coalesce(p_versao, 0) + 1);
END;
$$;

-- ── Registra a retirada (FOB) ────────────────────────────────────────────────
-- Devolve {ja_existia, status_pedido, versao}.
CREATE OR REPLACE FUNCTION public._pedido_retirada_core(
    p_ator UUID, p_order UUID, p_versao INTEGER, p_data DATE, p_employee UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org UUID;
    v_po  public.purchase_orders;
BEGIN
    v_org := public._recebimento_autoriza_de(p_ator, p_order);
    IF p_data IS NULL OR p_employee IS NULL THEN
        RAISE EXCEPTION 'informe quem retirou e a data' USING ERRCODE = '22023';
    END IF;
    IF p_data > current_date + 1 THEN
        RAISE EXCEPTION 'a data da retirada não pode ser futura' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_order FOR UPDATE;
    IF NOT public.fn_pedido_eh_fob(v_po.delivery_method) THEN
        RAISE EXCEPTION 'Só pedido FOB tem retirada.' USING ERRCODE = '22023';
    END IF;
    IF v_po.status = 'Entregue' AND v_po.retirado_por_employee_id = p_employee
       AND v_po.actual_delivery_date::date = p_data THEN
        RETURN jsonb_build_object('ja_existia', true, 'status_pedido', v_po.status, 'versao', coalesce(v_po.version, 0));
    END IF;
    IF coalesce(v_po.version, 0) <> coalesce(p_versao, -1) THEN
        RAISE EXCEPTION 'CONFLICT: Este pedido foi alterado por outra pessoa. Recarregue e tente de novo.' USING ERRCODE = '40001';
    END IF;
    -- Mesma regra de situacaoDaRetirada (utils/formaEntrega.ts).
    IF v_po.status NOT IN ('Enviado', 'Confirmado', 'Separação', 'Em Trânsito') THEN
        RAISE EXCEPTION 'Este pedido não pode ser retirado no status "%".', v_po.status USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.employees e
         WHERE e.id = p_employee AND e.status = 'ATIVO'
           AND (e.org_id = v_org
                OR EXISTS (SELECT 1 FROM public.employee_org_shares s WHERE s.employee_id = e.id AND s.target_org_id = v_org))
    ) THEN
        RAISE EXCEPTION 'Colaborador não encontrado nesta organização.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.purchase_orders
       SET status                   = 'Entregue',
           status_updated_at        = now(),
           actual_delivery_date     = p_data,
           retirado_por_employee_id = p_employee,
           version                  = coalesce(p_versao, 0) + 1,
           updated_at               = now()
     WHERE id = p_order;

    RETURN jsonb_build_object('ja_existia', false, 'status_pedido', 'Entregue', 'versao', coalesce(p_versao, 0) + 1);
END;
$$;

-- ── Arquivos do pedido que podem ser assinados (link) ────────────────────────
CREATE OR REPLACE FUNCTION public._recebimento_paths_permitidos(p_order UUID, p_paths TEXT[])
RETURNS TABLE (path TEXT, bucket TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT DISTINCT x.path, x.bucket
      FROM (SELECT r.photo_path AS path, 'receipts'::text AS bucket
              FROM public.purchase_receipts r WHERE r.order_id = p_order AND r.photo_path IS NOT NULL
            UNION ALL
            SELECT d.file_path, 'purchase-order-documents'
              FROM public.purchase_order_documents d WHERE d.order_id = p_order) x
     WHERE x.path = ANY (coalesce(p_paths, '{}'::text[]))
$$;

-- ── Fornecedor não mexe em pedido conferido (as duas RPCs do fornecedor) ─────
-- Copiadas das definições VIVAS (27/11); muda só o bloco marcado.
CREATE OR REPLACE FUNCTION public.purchase_order_update_as_supplier(p_order_id uuid, p_status text DEFAULT NULL::text, p_delivery_date date DEFAULT NULL::date, p_separation_date date DEFAULT NULL::date, p_shipped_date date DEFAULT NULL::date, p_actual_delivery_date date DEFAULT NULL::date, p_quotes jsonb DEFAULT NULL::jsonb, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    -- FOB (2026-10-19): a logística é do comprador. O fornecedor continua
    -- aceitando/negociando o pedido e cotando, mas não move etapa logística
    -- nem mexe em data de previsão/separação/saída/entrega.
    IF public.fn_pedido_eh_fob(v_row.delivery_method) AND (
           (p_status IS NOT NULL AND p_status <> v_row.status
                AND p_status IN ('Separação', 'Em Trânsito', 'Entregue', 'Recebido', 'Divergência'))
        OR p_delivery_date IS NOT NULL OR p_separation_date IS NOT NULL
        OR p_shipped_date IS NOT NULL OR p_actual_delivery_date IS NOT NULL
    ) THEN
        RETURN '{"valid":false,"reason":"fob"}'::jsonb;
    END IF;

    -- ▼ 27/11/2026 (recebimento mobile): conferência é do comprador. Depois de
    -- conferido (ou com conferência parcial), o fornecedor não muda o status; e
    -- "Recebido"/"Divergência" nunca vêm do fornecedor.
    IF p_status IS NOT NULL AND p_status <> v_row.status AND (
           v_row.status IN ('Recebido', 'Divergência', 'Cancelado')
        OR p_status IN ('Recebido', 'Divergência')
        OR EXISTS (SELECT 1 FROM public.purchase_receipts r WHERE r.order_id = p_order_id)
    ) THEN
        RETURN '{"valid":false,"reason":"recebido"}'::jsonb;
    END IF;
    -- ▲

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
$function$;

CREATE OR REPLACE FUNCTION public.supplier_portal_update_order_logistics(p_token text, p_order_id uuid, p_status text, p_delivery_date date, p_separation_date date, p_shipped_date date, p_actual_delivery_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    -- FOB (2026-10-19): ver purchase_order_update_as_supplier.
    IF public.fn_pedido_eh_fob(v_row.delivery_method) AND (
           (p_status IS NOT NULL AND p_status <> v_row.status
                AND p_status IN ('Separação', 'Em Trânsito', 'Entregue', 'Recebido', 'Divergência'))
        OR p_delivery_date IS NOT NULL OR p_separation_date IS NOT NULL
        OR p_shipped_date IS NOT NULL OR p_actual_delivery_date IS NOT NULL
    ) THEN
        RETURN '{"valid":false,"reason":"fob"}'::jsonb;
    END IF;

    -- ▼ 27/11/2026: ver purchase_order_update_as_supplier.
    IF p_status IS NOT NULL AND p_status <> v_row.status AND (
           v_row.status IN ('Recebido', 'Divergência', 'Cancelado')
        OR p_status IN ('Recebido', 'Divergência')
        OR EXISTS (SELECT 1 FROM public.purchase_receipts r WHERE r.order_id = p_order_id)
    ) THEN
        RETURN '{"valid":false,"reason":"recebido"}'::jsonb;
    END IF;
    -- ▲

    UPDATE public.purchase_orders
    SET status               = COALESCE(p_status, status),
        delivery_date        = COALESCE(p_delivery_date, delivery_date),
        separation_date      = p_separation_date,
        shipped_date         = p_shipped_date,
        actual_delivery_date = p_actual_delivery_date,
        status_updated_at    = NOW(),
        -- ▼ 27/11/2026: sobe a versão como a RPC do login — a conferência do
        -- comprador confere a versão e não pode passar por cima desta mudança.
        version              = COALESCE(version, 0) + 1,
        -- ▲
        updated_at           = NOW()
    WHERE id = p_order_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object('valid', TRUE, 'data', row_to_json(v_row)::jsonb - public.purchase_order_colunas_internas());
END;
$function$;

-- ── ACL (REGRA #7) ───────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public._pedido_org(UUID)                                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._recebimento_autoriza_de(UUID, UUID)                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._recebimento_status_recebe(TEXT, TEXT)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._recebimento_registrar_core(UUID, UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._pedido_retirada_core(UUID, UUID, INTEGER, DATE, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._recebimento_paths_permitidos(UUID, TEXT[])         FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._pedido_org(UUID)                                   TO service_role;
GRANT  EXECUTE ON FUNCTION public._recebimento_autoriza_de(UUID, UUID)                TO service_role;
GRANT  EXECUTE ON FUNCTION public._recebimento_registrar_core(UUID, UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT) TO service_role;
GRANT  EXECUTE ON FUNCTION public._pedido_retirada_core(UUID, UUID, INTEGER, DATE, UUID) TO service_role;
GRANT  EXECUTE ON FUNCTION public._recebimento_paths_permitidos(UUID, TEXT[])         TO service_role;
-- As RPCs do fornecedor: CREATE OR REPLACE mantém a ACL; reafirmada (SECURITY DEFINER recriada repete o REVOKE).
REVOKE EXECUTE ON FUNCTION public.purchase_order_update_as_supplier(uuid, text, date, date, date, date, jsonb, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.purchase_order_update_as_supplier(uuid, text, date, date, date, date, jsonb, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.supplier_portal_update_order_logistics(text, uuid, text, date, date, date, date) FROM PUBLIC;
