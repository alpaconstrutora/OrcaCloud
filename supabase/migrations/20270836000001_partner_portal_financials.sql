-- ==========================================================================
-- Migration: aba Financeiro do Portal do Parceiro.
--
-- O portal já expõe a aba Contratos (contracts/contract_items/contract_
-- addendums/contract_measurements — 20270119000000 e 20270125000000), mas o
-- fornecedor não enxerga nenhuma parcela a pagar nem retenção/liberação, e não
-- consegue anexar a nota fiscal de uma medição pelo portal. Hoje isso circula
-- fora do sistema. Esta migration cobre os dois modos de acesso do portal
-- (link público por token / login autenticado via partner_users), no mesmo
-- molde já usado por contratos.
-- ==========================================================================

-- ==========================================================================
-- 1) RLS (modo autenticado) — mesmo predicado das policies de contrato
-- ==========================================================================

DROP POLICY IF EXISTS "internal_transactions_select_partner" ON public.internal_transactions;
CREATE POLICY "internal_transactions_select_partner" ON public.internal_transactions
  FOR SELECT TO authenticated
  USING (
    source_system LIKE 'CONTRACT_%'
    AND contract_id IN (
      SELECT c.id FROM public.contracts c
      WHERE c.supplier_id IN (
        SELECT pw.supplier_id FROM public.partner_workspaces pw
        JOIN public.partner_users pu ON pu.partner_workspace_id = pw.id
        WHERE pu.email = auth.jwt() ->> 'email' AND pu.is_active = TRUE AND pw.is_active = TRUE
      )
    )
  );

DROP POLICY IF EXISTS "contract_retention_releases_select_partner" ON public.contract_retention_releases;
CREATE POLICY "contract_retention_releases_select_partner" ON public.contract_retention_releases
  FOR SELECT TO authenticated
  USING (
    contract_id IN (
      SELECT c.id FROM public.contracts c
      WHERE c.supplier_id IN (
        SELECT pw.supplier_id FROM public.partner_workspaces pw
        JOIN public.partner_users pu ON pu.partner_workspace_id = pw.id
        WHERE pu.email = auth.jwt() ->> 'email' AND pu.is_active = TRUE AND pw.is_active = TRUE
      )
    )
  );

-- ==========================================================================
-- 2) RPC de leitura — modo token (mesmo molde de partner_portal_get_contract_detail)
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.partner_portal_get_financials(p_token TEXT, p_contract_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_ws UUID := public.partner_portal_workspace_from_token(p_token);
    v_supplier UUID;
    v_contract_ids UUID[];
    v_measurement_ids UUID[];
BEGIN
    IF v_ws IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT supplier_id INTO v_supplier FROM public.partner_workspaces WHERE id = v_ws;

    -- Contratos do fornecedor deste workspace, restritos a Suprimentos (pagável)
    -- e, se um contrato específico foi pedido, confirma que é dele.
    SELECT array_agg(c.id) INTO v_contract_ids
    FROM public.contracts c
    WHERE c.supplier_id = v_supplier
      AND (c.domain = 'SUPRIMENTOS' OR c.domain IS NULL)
      AND (p_contract_id IS NULL OR c.id = p_contract_id);

    IF p_contract_id IS NOT NULL AND (v_contract_ids IS NULL OR NOT (p_contract_id = ANY(v_contract_ids))) THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    IF v_contract_ids IS NULL THEN
        RETURN jsonb_build_object('valid', TRUE, 'contracts', '[]'::jsonb, 'installments', '[]'::jsonb, 'measurements', '[]'::jsonb, 'retention', jsonb_build_object('retained', 0, 'released', 0, 'balance', 0));
    END IF;

    SELECT array_agg(m.id) INTO v_measurement_ids
    FROM public.contract_measurements m
    WHERE m.contract_id = ANY(v_contract_ids);

    RETURN jsonb_build_object(
        'valid', TRUE,
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
                -- Parcelas à vista/parceladas/recorrentes: reference_id = contract_id (+ sufixo de parcela)
                SELECT t.id, t.transaction_date, t.amount, t.direction, t.description, t.status, t.business_status, t.installment_type, t.source_system
                FROM public.internal_transactions t
                WHERE t.source_system IN ('CONTRACT_AVISTA', 'CONTRACT_PARCELADO', 'CONTRACT_RECURRING')
                  AND EXISTS (SELECT 1 FROM unnest(v_contract_ids) cid WHERE t.reference_id LIKE cid::text || '%')
                UNION ALL
                -- Medições: reference_id = measurement_id
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

REVOKE ALL ON FUNCTION public.partner_portal_get_financials(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_portal_get_financials(TEXT, UUID) TO anon, authenticated;

-- ==========================================================================
-- 3) RPC de escrita — NF da medição, nos dois modos (p_token OU sessão autenticada)
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.partner_portal_set_measurement_invoice(p_token TEXT, p_measurement_id UUID, p_url TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_ws UUID;
    v_supplier UUID;
    v_measurement_status TEXT;
    v_contract_supplier UUID;
BEGIN
    IF p_token IS NOT NULL THEN
        v_ws := public.partner_portal_workspace_from_token(p_token);
    ELSE
        SELECT pw.id INTO v_ws
        FROM public.partner_workspaces pw
        JOIN public.partner_users pu ON pu.partner_workspace_id = pw.id
        WHERE pu.email = auth.jwt() ->> 'email' AND pu.is_active = TRUE AND pw.is_active = TRUE
        LIMIT 1;
    END IF;

    IF v_ws IS NULL THEN RETURN jsonb_build_object('valid', FALSE, 'error', 'Sessão inválida.'); END IF;

    SELECT supplier_id INTO v_supplier FROM public.partner_workspaces WHERE id = v_ws;

    SELECT c.supplier_id, m.status INTO v_contract_supplier, v_measurement_status
    FROM public.contract_measurements m
    JOIN public.contracts c ON c.id = m.contract_id
    WHERE m.id = p_measurement_id;

    IF v_contract_supplier IS NULL OR v_contract_supplier <> v_supplier THEN
        RETURN jsonb_build_object('valid', FALSE, 'error', 'Medição não encontrada para este parceiro.');
    END IF;

    IF v_measurement_status = 'Cancelada' THEN
        RETURN jsonb_build_object('valid', FALSE, 'error', 'Medição cancelada não aceita nota fiscal.');
    END IF;

    UPDATE public.contract_measurements SET invoice_url = p_url WHERE id = p_measurement_id;

    RETURN jsonb_build_object('valid', TRUE);
END;
$X$;

REVOKE ALL ON FUNCTION public.partner_portal_set_measurement_invoice(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_portal_set_measurement_invoice(TEXT, UUID, TEXT) TO anon, authenticated;
