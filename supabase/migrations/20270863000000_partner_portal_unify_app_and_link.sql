-- ==========================================================================
-- Portal do Parceiro: a visão pelo APP passa a ser a MESMA consulta da visão
-- pelo LINK público.
--
-- Antes só a aba Documentos estava unificada (partner_get_shared_document_tree
-- espelhando partner_portal_get_shared_documents). As outras abas liam por
-- caminhos diferentes em cada modo:
--
--   aba            | link (token)                      | app (autenticado)
--   ---------------|-----------------------------------|---------------------------
--   Contratos      | partner_portal_get_contracts      | select('*') cru sob RLS
--   Financeiro     | partner_portal_get_financials     | listFinancials sob RLS
--   Solicitações   | partner_portal_get_requests       | tabela sob RLS
--   Conversas      | partner_portal_get_conversations  | tabela sob RLS
--
-- Duas implementações do mesmo dado divergem — é o que aconteceu. A correção
-- NÃO é criar gêmeas (isso só duplica o problema): o corpo de cada consulta
-- vira UMA função `partner_ws_*(p_ws)`, e os dois modos viram cascas finas que
-- só diferem em COMO autorizam:
--
--   token  -> partner_portal_workspace_from_token(p_token)  -> partner_ws_*
--   app    -> partner_can_access_workspace(p_ws)            -> partner_ws_*
--
-- Assim a paridade é estrutural: não tem como um modo mudar sem o outro.
-- As funções `partner_ws_*` NÃO recebem grant de anon/authenticated — só são
-- alcançáveis pelas cascas (que são SECURITY DEFINER e rodam como o dono).
--
-- Escopo: LEITURA. As escritas (criar solicitação, enviar mensagem) continuam
-- separadas de propósito — pelo link o autor é 'link-publico@portal-parceiro'
-- e a mensagem é EXTERNAL; pelo app o autor é o usuário de verdade. Unificar
-- isso apagaria a autoria, que é o oposto do que se quer.
-- ==========================================================================

-- ─── 1. AUTORIZAÇÃO DO MODO APP ────────────────────────────────────────────
-- Mesmo dialeto de 20270124000000: workspace GLOBAL tem organization_id NULL,
-- e `NULL IN (...)` nunca é verdadeiro (foi o bug 42501 de 20270862000000).
CREATE OR REPLACE FUNCTION public.partner_can_access_workspace(p_ws UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $X$
    SELECT p_ws IS NOT NULL AND (
        -- usuário do próprio parceiro
        EXISTS (
            SELECT 1 FROM public.partner_users pu
            JOIN public.partner_workspaces pw ON pw.id = pu.partner_workspace_id
            WHERE pu.partner_workspace_id = p_ws
              AND pu.email = auth.jwt() ->> 'email'
              AND pu.is_active = TRUE
              AND pw.is_active = TRUE
        )
        -- ou membro interno da organização do workspace (manutenção/preview)
        OR EXISTS (
            SELECT 1 FROM public.partner_workspaces pw
            WHERE pw.id = p_ws
              AND (pw.organization_id IS NULL OR public.is_org_member(pw.organization_id))
        )
    );
$X$;

REVOKE ALL ON FUNCTION public.partner_can_access_workspace(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_can_access_workspace(UUID) TO authenticated;

-- ─── 2. IMPLEMENTAÇÃO ÚNICA POR CONJUNTO DE DADOS ──────────────────────────
-- Corpo idêntico ao que as RPCs de token já executavam; só o `v_ws` derivado
-- do token virou parâmetro. Devolvem o payload SEM o envelope 'valid' — quem
-- põe o envelope é a casca, porque só ela sabe se a sessão é válida.

CREATE OR REPLACE FUNCTION public.partner_ws_contracts(p_ws UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_supplier UUID;
BEGIN
    SELECT supplier_id INTO v_supplier FROM public.partner_workspaces WHERE id = p_ws;

    RETURN jsonb_build_object('data', COALESCE((
        SELECT jsonb_agg(row_to_json(c) ORDER BY c.created_at DESC)
        FROM public.contracts c
        WHERE c.supplier_id = v_supplier
    ), '[]'::jsonb));
END;
$X$;

CREATE OR REPLACE FUNCTION public.partner_ws_requests(p_ws UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $X$
BEGIN
    RETURN jsonb_build_object('data', COALESCE((
        SELECT jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC)
        FROM public.partner_requests r
        WHERE r.partner_workspace_id = p_ws
    ), '[]'::jsonb));
END;
$X$;

-- VOLATILE de propósito: cria o canal "Geral" na primeira leitura (regra que
-- já existia nos DOIS modos — 20270123000000 no link, listConversations no
-- app). Marcar STABLE com INSERT dentro é a armadilha que já mordeu no módulo
-- de treinamentos.
CREATE OR REPLACE FUNCTION public.partner_ws_conversations(p_ws UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM public.partner_conversations WHERE partner_workspace_id = p_ws;

    IF v_count = 0 THEN
        INSERT INTO public.partner_conversations (partner_workspace_id, name)
        VALUES (p_ws, 'Geral');
    END IF;

    RETURN jsonb_build_object('data', COALESCE((
        SELECT jsonb_agg(row_to_json(c) ORDER BY c.created_at ASC)
        FROM public.partner_conversations c
        WHERE c.partner_workspace_id = p_ws
    ), '[]'::jsonb));
END;
$X$;

-- NULL = conversa não pertence ao workspace (a casca traduz para valid:false).
CREATE OR REPLACE FUNCTION public.partner_ws_messages(p_ws UUID, p_conversation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $X$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.partner_conversations
        WHERE id = p_conversation_id AND partner_workspace_id = p_ws
    ) THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object('data', COALESCE((
        SELECT jsonb_agg(row_to_json(m) ORDER BY m.created_at ASC)
        FROM public.partner_messages m
        WHERE m.conversation_id = p_conversation_id
    ), '[]'::jsonb));
END;
$X$;

-- NULL = contrato pedido não é deste parceiro.
CREATE OR REPLACE FUNCTION public.partner_ws_financials(p_ws UUID, p_contract_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_supplier UUID;
    v_contract_ids UUID[];
    v_measurement_ids UUID[];
BEGIN
    SELECT supplier_id INTO v_supplier FROM public.partner_workspaces WHERE id = p_ws;

    -- Contratos do fornecedor deste workspace, restritos a Suprimentos (pagável)
    -- e, se um contrato específico foi pedido, confirma que é dele.
    SELECT array_agg(c.id) INTO v_contract_ids
    FROM public.contracts c
    WHERE c.supplier_id = v_supplier
      AND (c.domain = 'SUPRIMENTOS' OR c.domain IS NULL)
      AND (p_contract_id IS NULL OR c.id = p_contract_id);

    IF p_contract_id IS NOT NULL AND (v_contract_ids IS NULL OR NOT (p_contract_id = ANY(v_contract_ids))) THEN
        RETURN NULL;
    END IF;

    IF v_contract_ids IS NULL THEN
        RETURN jsonb_build_object(
            'contracts', '[]'::jsonb, 'installments', '[]'::jsonb, 'measurements', '[]'::jsonb,
            'retention', jsonb_build_object('retained', 0, 'released', 0, 'balance', 0)
        );
    END IF;

    SELECT array_agg(m.id) INTO v_measurement_ids
    FROM public.contract_measurements m
    WHERE m.contract_id = ANY(v_contract_ids);

    RETURN jsonb_build_object(
        'contracts', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', c.id, 'number', c.number, 'title', c.title,
                'current_value', c.current_value, 'retention_rate', c.retention_rate, 'status', c.status
            ))
            FROM public.contracts c WHERE c.id = ANY(v_contract_ids)
        ), '[]'::jsonb),
        'installments', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', row.id, 'transaction_date', row.transaction_date, 'amount', row.amount,
                'direction', row.direction, 'description', row.description, 'status', row.status,
                'business_status', row.business_status, 'installment_type', row.installment_type,
                'source_system', row.source_system
            ) ORDER BY row.transaction_date DESC)
            FROM (
                SELECT t.id, t.transaction_date, t.amount, t.direction, t.description, t.status, t.business_status, t.installment_type, t.source_system
                FROM public.internal_transactions t
                WHERE t.source_system IN ('CONTRACT_AVISTA', 'CONTRACT_PARCELADO', 'CONTRACT_RECURRING')
                  AND EXISTS (SELECT 1 FROM unnest(v_contract_ids) cid WHERE t.reference_id LIKE cid::text || '%')
                UNION ALL
                SELECT t.id, t.transaction_date, t.amount, t.direction, t.description, t.status, t.business_status, t.installment_type, t.source_system
                FROM public.internal_transactions t
                WHERE t.source_system = 'CONTRACT_MEASUREMENT'
                  AND t.reference_id IN (SELECT unnest(v_measurement_ids)::text)
            ) row
        ), '[]'::jsonb),
        'measurements', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', m.id, 'contract_id', m.contract_id, 'number', m.number,
                'period_start', m.period_start, 'period_end', m.period_end, 'status', m.status,
                'total_value', m.total_value, 'retention_value', m.retention_value, 'net_value', m.net_value,
                'invoice_url', m.invoice_url
            ) ORDER BY m.number DESC)
            FROM public.contract_measurements m WHERE m.contract_id = ANY(v_contract_ids)
        ), '[]'::jsonb),
        'retention', (
            SELECT jsonb_build_object(
                'retained', COALESCE(SUM(m.retention_value), 0),
                'released', COALESCE((
                    SELECT SUM(r.amount) FROM public.contract_retention_releases r WHERE r.contract_id = ANY(v_contract_ids)
                ), 0),
                'balance', COALESCE(SUM(m.retention_value), 0) - COALESCE((
                    SELECT SUM(r.amount) FROM public.contract_retention_releases r WHERE r.contract_id = ANY(v_contract_ids)
                ), 0)
            )
            FROM public.contract_measurements m WHERE m.contract_id = ANY(v_contract_ids)
        )
    );
END;
$X$;

-- Núcleo não é chamável direto por ninguém: só pelas cascas, que rodam como o
-- dono da função. Sem isso, qualquer sessão passaria um workspace_id arbitrário.
REVOKE ALL ON FUNCTION public.partner_ws_contracts(UUID)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_ws_requests(UUID)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_ws_conversations(UUID)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_ws_messages(UUID, UUID)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_ws_financials(UUID, UUID)     FROM PUBLIC, anon, authenticated;

-- ─── 3. CASCA DO LINK PÚBLICO (mesmas assinaturas e saídas de antes) ───────
CREATE OR REPLACE FUNCTION public.partner_portal_get_contracts(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $X$
DECLARE v_ws UUID := public.partner_portal_workspace_from_token(p_token);
BEGIN
    IF v_ws IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    RETURN jsonb_build_object('valid', TRUE) || public.partner_ws_contracts(v_ws);
END;
$X$;

CREATE OR REPLACE FUNCTION public.partner_portal_get_requests(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $X$
DECLARE v_ws UUID := public.partner_portal_workspace_from_token(p_token);
BEGIN
    IF v_ws IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    RETURN jsonb_build_object('valid', TRUE) || public.partner_ws_requests(v_ws);
END;
$X$;

CREATE OR REPLACE FUNCTION public.partner_portal_get_conversations(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $X$
DECLARE v_ws UUID := public.partner_portal_workspace_from_token(p_token);
BEGIN
    IF v_ws IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    RETURN jsonb_build_object('valid', TRUE) || public.partner_ws_conversations(v_ws);
END;
$X$;

CREATE OR REPLACE FUNCTION public.partner_portal_get_messages(p_token TEXT, p_conversation_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $X$
DECLARE
    v_ws UUID := public.partner_portal_workspace_from_token(p_token);
    v_payload JSONB;
BEGIN
    IF v_ws IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    v_payload := public.partner_ws_messages(v_ws, p_conversation_id);
    IF v_payload IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    RETURN jsonb_build_object('valid', TRUE) || v_payload;
END;
$X$;

CREATE OR REPLACE FUNCTION public.partner_portal_get_financials(p_token TEXT, p_contract_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $X$
DECLARE
    v_ws UUID := public.partner_portal_workspace_from_token(p_token);
    v_payload JSONB;
BEGIN
    IF v_ws IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    v_payload := public.partner_ws_financials(v_ws, p_contract_id);
    IF v_payload IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    RETURN jsonb_build_object('valid', TRUE) || v_payload;
END;
$X$;

GRANT EXECUTE ON FUNCTION public.partner_portal_get_contracts(TEXT)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_portal_get_requests(TEXT)              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_portal_get_conversations(TEXT)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_portal_get_messages(TEXT, UUID)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_portal_get_financials(TEXT, UUID)      TO anon, authenticated;

-- ─── 4. CASCA DO APP (mesma implementação, autorização por sessão) ─────────
CREATE OR REPLACE FUNCTION public.partner_get_contracts(p_workspace_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $X$
BEGIN
    IF NOT public.partner_can_access_workspace(p_workspace_id) THEN RETURN '{"valid":false}'::jsonb; END IF;
    RETURN jsonb_build_object('valid', TRUE) || public.partner_ws_contracts(p_workspace_id);
END;
$X$;

CREATE OR REPLACE FUNCTION public.partner_get_requests(p_workspace_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $X$
BEGIN
    IF NOT public.partner_can_access_workspace(p_workspace_id) THEN RETURN '{"valid":false}'::jsonb; END IF;
    RETURN jsonb_build_object('valid', TRUE) || public.partner_ws_requests(p_workspace_id);
END;
$X$;

CREATE OR REPLACE FUNCTION public.partner_get_conversations(p_workspace_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $X$
BEGIN
    IF NOT public.partner_can_access_workspace(p_workspace_id) THEN RETURN '{"valid":false}'::jsonb; END IF;
    RETURN jsonb_build_object('valid', TRUE) || public.partner_ws_conversations(p_workspace_id);
END;
$X$;

CREATE OR REPLACE FUNCTION public.partner_get_messages(p_workspace_id UUID, p_conversation_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $X$
DECLARE v_payload JSONB;
BEGIN
    IF NOT public.partner_can_access_workspace(p_workspace_id) THEN RETURN '{"valid":false}'::jsonb; END IF;
    v_payload := public.partner_ws_messages(p_workspace_id, p_conversation_id);
    IF v_payload IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    RETURN jsonb_build_object('valid', TRUE) || v_payload;
END;
$X$;

CREATE OR REPLACE FUNCTION public.partner_get_financials(p_workspace_id UUID, p_contract_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $X$
DECLARE v_payload JSONB;
BEGIN
    IF NOT public.partner_can_access_workspace(p_workspace_id) THEN RETURN '{"valid":false}'::jsonb; END IF;
    v_payload := public.partner_ws_financials(p_workspace_id, p_contract_id);
    IF v_payload IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    RETURN jsonb_build_object('valid', TRUE) || v_payload;
END;
$X$;

REVOKE ALL ON FUNCTION public.partner_get_contracts(UUID)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.partner_get_requests(UUID)            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.partner_get_conversations(UUID)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.partner_get_messages(UUID, UUID)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.partner_get_financials(UUID, UUID)    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.partner_get_contracts(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_get_requests(UUID)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_get_conversations(UUID)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_get_messages(UUID, UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_get_financials(UUID, UUID) TO authenticated;
