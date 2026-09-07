-- ==========================================================================
-- Pedido de compra: abas Financeiro, Recebimento e Comunicação no Portal do
-- Fornecedor — as duas visões (fornecedor LOGADO e link público por token).
--
-- Plano: docs/planos/2026-09-07-pedido-abas-portal-fornecedor.md
--
-- ── O que estava errado ───────────────────────────────────────────────────
--
-- 1. `order_chats` tinha RLS ligada e ZERO policies. Com RLS ligada e nenhuma
--    policy, `authenticated` lê 0 linhas e todo INSERT é rejeitado: o chat do
--    pedido nunca funcionou para NINGUÉM (tabela com 0 linhas), nem para o
--    comprador. O componente engolia o erro no load, então o defeito era mudo.
--
-- 2. `purchase_receipts`, `purchase_receipt_items`, `purchase_discrepancies` e
--    `notification_log` tinham UMA policy `FOR ALL` com a expressão
--    `<fk> IN (SELECT id FROM <tabela pai>)`. Essa expressão delega à RLS da
--    tabela pai — e a de `purchase_orders` (`po_select_org_or_supplier`) inclui
--    o FORNECEDOR, casado por e-mail. Resultado: o fornecedor logado não só LIA
--    como ESCREVIA comprovante, item de comprovante, divergência e log de
--    notificação dos pedidos dele. `FOR ALL` num predicado pensado para leitura
--    é o padrão que produziu isso: leitura e escrita compartilhavam a condição.
--
-- 3. Nenhuma das 19 RPCs `supplier_portal_*` tocava essas tabelas, então pelo
--    link público as três abas não tinham caminho de dados nenhum — apareciam
--    e ficavam vazias.
--
-- ── O que esta migration faz ──────────────────────────────────────────────
--
--   • duas funções de autorização (comprador × fornecedor de um pedido);
--   • separa LEITURA de ESCRITA nas quatro tabelas: o fornecedor lê, só o
--     comprador escreve;
--   • dá a `order_chats` as policies que faltavam, e uma coluna `sender_role`
--     para a UI saber de que lado desenhar a mensagem;
--   • `purchase_discrepancies` ganha a resposta do fornecedor — quem RESOLVE
--     (status) continua sendo o comprador;
--   • cinco RPCs de token + uma RPC para o fornecedor logado.
--
-- REGRA #7: toda função nova leva `REVOKE EXECUTE ... FROM PUBLIC` na mesma
-- migration. O `GRANT ... TO anon` das RPCs de portal é INTENCIONAL e não é
-- furo: o link público roda com a chave anon, e a autorização mora DENTRO da
-- função (`supplier_portal_supplier_from_token` valida token, validade e
-- vínculo antes de qualquer linha sair). É o mesmo desenho das 19 RPCs de
-- portal já existentes (20270822000017_supplier_portal_tokens.sql).
-- ==========================================================================

-- ==========================================================================
-- 1. Funções de autorização — "sou o comprador" × "sou o fornecedor"
-- ==========================================================================

-- Espelha EXATAMENTE a perna de comprador de `po_select_org_or_supplier`
-- (projects × organization_members por e-mail do JWT). Deliberadamente NÃO
-- acrescenta `purchase_orders.organization_id`: seria ampliar o acesso do
-- comprador de carona numa migration que existe para restringir o do
-- fornecedor. Pedido sem `project_id` continua sem comprador, como já era.
CREATE OR REPLACE FUNCTION public.purchase_order_is_buyer(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.purchase_orders po
        JOIN public.projects p             ON p.id = po.project_id
        JOIN public.organization_members om ON om.organization_id = p.organization_id
        WHERE po.id = p_order_id
          AND lower(om.email) = lower(auth.jwt()->>'email')
    );
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_order_is_buyer(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.purchase_order_is_buyer(UUID) TO authenticated;

-- Espelha a perna de fornecedor da mesma policy. Sozinha ela BASTA para
-- liberar a linha (REGRA #7, pergunta 1) e é o que se quer: o vínculo é
-- `suppliers.email` = e-mail do JWT, recortado pelo pedido em questão — não é
-- um booleano solto do tipo `is_shared`.
CREATE OR REPLACE FUNCTION public.purchase_order_is_supplier(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.purchase_orders po
        JOIN public.suppliers s ON s.id = po.supplier_id
        WHERE po.id = p_order_id
          AND s.email IS NOT NULL
          AND lower(s.email) = lower(auth.jwt()->>'email')
    );
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_order_is_supplier(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.purchase_order_is_supplier(UUID) TO authenticated;

-- ==========================================================================
-- 2. Colunas novas
-- ==========================================================================

-- Sem `sender_role` a UI só tem `sender_email` para decidir de que lado
-- desenhar a mensagem — e o fornecedor que entra por link público pode nem ter
-- e-mail cadastrado. O papel é gravado por quem insere e conferido pela policy.
ALTER TABLE public.order_chats
    ADD COLUMN IF NOT EXISTS sender_role TEXT NOT NULL DEFAULT 'buyer';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'order_chats_sender_role_check'
    ) THEN
        ALTER TABLE public.order_chats
            ADD CONSTRAINT order_chats_sender_role_check
            CHECK (sender_role IN ('buyer', 'supplier', 'system'));
    END IF;
END $$;

-- Resposta do fornecedor a uma divergência. O `status`
-- (Pendente/Resolvida/Aceita/Devolvida) NÃO se mexe aqui: quem resolve é o
-- comprador. Se o fornecedor pudesse mudar o status, ele fecharia a própria
-- divergência.
ALTER TABLE public.purchase_discrepancies
    ADD COLUMN IF NOT EXISTS supplier_response     TEXT,
    ADD COLUMN IF NOT EXISTS supplier_responded_at TIMESTAMPTZ;

-- ==========================================================================
-- 3. RLS — leitura separada de escrita nas quatro tabelas
-- ==========================================================================

-- ── purchase_receipts ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "purchase_receipts_via_order" ON public.purchase_receipts;

CREATE POLICY "purchase_receipts_select" ON public.purchase_receipts
    FOR SELECT TO authenticated
    USING (
        public.purchase_order_is_buyer(order_id)
        OR public.purchase_order_is_supplier(order_id)
    );

CREATE POLICY "purchase_receipts_insert" ON public.purchase_receipts
    FOR INSERT TO authenticated
    WITH CHECK (public.purchase_order_is_buyer(order_id));

CREATE POLICY "purchase_receipts_update" ON public.purchase_receipts
    FOR UPDATE TO authenticated
    USING (public.purchase_order_is_buyer(order_id))
    WITH CHECK (public.purchase_order_is_buyer(order_id));

CREATE POLICY "purchase_receipts_delete" ON public.purchase_receipts
    FOR DELETE TO authenticated
    USING (public.purchase_order_is_buyer(order_id));

-- ── purchase_receipt_items ────────────────────────────────────────────────
-- A policy antiga era `receipt_id IN (SELECT id FROM purchase_receipts)`, que
-- delega à RLS do pai. Com o fornecedor agora enxergando o comprovante, essa
-- expressão passaria a deixá-lo ESCREVER item. Por isso a escrita não delega:
-- confere o comprador do pedido dono do comprovante.
DROP POLICY IF EXISTS "purchase_receipt_items_via_receipt" ON public.purchase_receipt_items;

CREATE POLICY "purchase_receipt_items_select" ON public.purchase_receipt_items
    FOR SELECT TO authenticated
    USING (receipt_id IN (SELECT r.id FROM public.purchase_receipts r));

CREATE POLICY "purchase_receipt_items_write" ON public.purchase_receipt_items
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.purchase_receipts r
            WHERE r.id = purchase_receipt_items.receipt_id
              AND public.purchase_order_is_buyer(r.order_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.purchase_receipts r
            WHERE r.id = purchase_receipt_items.receipt_id
              AND public.purchase_order_is_buyer(r.order_id)
        )
    );

-- ── purchase_discrepancies ────────────────────────────────────────────────
DROP POLICY IF EXISTS "purchase_discrepancies_via_order" ON public.purchase_discrepancies;

CREATE POLICY "purchase_discrepancies_select" ON public.purchase_discrepancies
    FOR SELECT TO authenticated
    USING (
        public.purchase_order_is_buyer(order_id)
        OR public.purchase_order_is_supplier(order_id)
    );

-- Escrita direta é só do comprador. A resposta do fornecedor entra pela RPC
-- `discrepancy_supplier_respond`, que grava DUAS colunas e mais nada — RLS não
-- restringe coluna, então a única forma de deixar o fornecedor responder sem
-- deixá-lo mexer em `status` é passar por função.
CREATE POLICY "purchase_discrepancies_write" ON public.purchase_discrepancies
    FOR ALL TO authenticated
    USING (public.purchase_order_is_buyer(order_id))
    WITH CHECK (public.purchase_order_is_buyer(order_id));

-- ── notification_log ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notification_log_via_order" ON public.notification_log;

CREATE POLICY "notification_log_select" ON public.notification_log
    FOR SELECT TO authenticated
    USING (
        public.purchase_order_is_buyer(order_id)
        OR public.purchase_order_is_supplier(order_id)
    );

CREATE POLICY "notification_log_write" ON public.notification_log
    FOR ALL TO authenticated
    USING (public.purchase_order_is_buyer(order_id))
    WITH CHECK (public.purchase_order_is_buyer(order_id));

-- ── order_chats: as policies que NUNCA existiram ──────────────────────────
DROP POLICY IF EXISTS "order_chats_select" ON public.order_chats;
DROP POLICY IF EXISTS "order_chats_insert" ON public.order_chats;

CREATE POLICY "order_chats_select" ON public.order_chats
    FOR SELECT TO authenticated
    USING (
        public.purchase_order_is_buyer(order_id)
        OR public.purchase_order_is_supplier(order_id)
    );

-- Cada perna do OR amarra o papel gravado a quem está gravando: fornecedor não
-- consegue inserir mensagem assinada como 'buyer', e vice-versa.
CREATE POLICY "order_chats_insert" ON public.order_chats
    FOR INSERT TO authenticated
    WITH CHECK (
        (public.purchase_order_is_buyer(order_id)    AND sender_role IN ('buyer', 'system'))
        OR (public.purchase_order_is_supplier(order_id) AND sender_role = 'supplier')
    );

-- Sem UPDATE e sem DELETE, de propósito: mensagem enviada não se edita nem se
-- apaga — é registro de conversa entre duas partes.

-- ── storage: foto do comprovante para o fornecedor LOGADO ─────────────────
-- As policies do bucket `receipts` são todas org-member (via
-- purchase_orders.organization_id), então o fornecedor logado não consegue
-- assinar a URL da foto. O link público não passa por aqui: usa a Edge
-- Function `supplier-portal-download`, que valida o token com service role.
DROP POLICY IF EXISTS "receipts_select_supplier" ON storage.objects;

CREATE POLICY "receipts_select_supplier" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'receipts'
        AND EXISTS (
            SELECT 1
            FROM public.purchase_orders po
            JOIN public.suppliers s ON s.id = po.supplier_id
            WHERE po.id::text = (storage.foldername(objects.name))[1]
              AND s.email IS NOT NULL
              AND lower(s.email) = lower(auth.jwt()->>'email')
        )
    );

-- ==========================================================================
-- 4. RPC do fornecedor LOGADO — responder divergência
-- ==========================================================================
-- Existe porque o fornecedor logado não tem token, e porque RLS não restringe
-- COLUNA: deixá-lo dar UPDATE em `purchase_discrepancies` abriria `status`
-- junto. A função grava só a resposta.
CREATE OR REPLACE FUNCTION public.discrepancy_supplier_respond(
    p_discrepancy_id UUID,
    p_response       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_row public.purchase_discrepancies;
BEGIN
    IF p_response IS NULL OR btrim(p_response) = '' THEN
        RETURN '{"valid":false,"error":"resposta_vazia"}'::jsonb;
    END IF;

    SELECT * INTO v_row FROM public.purchase_discrepancies WHERE id = p_discrepancy_id;
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    IF NOT public.purchase_order_is_supplier(v_row.order_id) THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    -- Divergência já resolvida pelo comprador não recebe resposta nova.
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

REVOKE EXECUTE ON FUNCTION public.discrepancy_supplier_respond(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.discrepancy_supplier_respond(UUID, TEXT) TO authenticated;

-- ==========================================================================
-- 5. RPCs de token — aba Recebimento
-- ==========================================================================
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

    -- O pedido tem de ser DESTE fornecedor: sem esta checagem o token viraria
    -- uma chave para o recebimento de qualquer pedido do sistema.
    IF NOT EXISTS (
        SELECT 1 FROM public.purchase_orders
        WHERE id = p_order_id AND supplier_id = v_sup
    ) THEN
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
    JOIN public.purchase_orders po ON po.id = d.order_id
    WHERE d.id = p_discrepancy_id AND po.supplier_id = v_sup;

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

-- ==========================================================================
-- 6. RPCs de token — aba Comunicação
-- ==========================================================================

-- `error`, `body` e `metadata` NÃO saem: são mensagem técnica interna (stack de
-- SMTP, payload de webhook). O fornecedor vê o que foi enviado a ele e se
-- chegou.
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

    IF NOT EXISTS (
        SELECT 1 FROM public.purchase_orders
        WHERE id = p_order_id AND supplier_id = v_sup
    ) THEN
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

    IF NOT EXISTS (
        SELECT 1 FROM public.purchase_orders
        WHERE id = p_order_id AND supplier_id = v_sup
    ) THEN
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

    IF NOT EXISTS (
        SELECT 1 FROM public.purchase_orders
        WHERE id = p_order_id AND supplier_id = v_sup
    ) THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    -- Identidade vem do TOKEN, nunca do corpo da chamada: quem abre o link não
    -- escolhe de quem a mensagem é.
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
