-- ============================================================================
-- Portais do credor — Nº DO RECIBO DE PAGAMENTO nas parcelas (28/09/2026)
--
-- Plano: docs/planos/2026-09-28-contas-a-pagar-recibo-na-baixa.md (Fase 2, item 8)
--
-- O recibo de pagamento (aplicar_20270928000110) passa a aparecer para o credor:
--   · Portal do Fornecedor (parcelas de PEDIDO) — núcleo
--     `purchase_order_financeiro_json`, usado por supplier_portal_get_financials
--     (link), purchase_orders_financeiro (logado) e supplier_portal_get_order_detail;
--   · Portal do Parceiro (parcelas de CONTRATO/MEDIÇÃO) — núcleo
--     `partner_ws_financials`, usado por partner_portal_get_financials (link) e
--     partner_get_financials (app).
-- Mesmo padrão de fn_portal_receivables_payload (aplicar_20270926000120): só o
-- NÚCLEO muda, as cascas (onde mora a autorização) ficam intactas.
--
-- Os dois núcleos foram reescritos a partir dos ARQUIVOS vigentes
-- (aplicar_20270921000026 e aplicar_20270920000009 — conferido no banco que
-- são essas as versões vivas), acrescentando só `recibo_numero`. O download do
-- PDF é pelas Edge Functions supplier-/partner-portal-recibo-download.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ============================================================================

SET lock_timeout = '5s';

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
                'effective_status', x.effective_status,
                'recibo_numero',    x.recibo_numero
            ) ORDER BY x.numero)
            FROM (
                SELECT it.id, it.due_date, it.amount, it.payment_date, v.effective_status,
                       fr.receipt_number AS recibo_numero,
                       row_number() OVER (ORDER BY it.due_date NULLS LAST, it.created_at) AS numero,
                       count(*)     OVER ()                                                AS total_parcelas
                FROM public.internal_transactions it
                JOIN public.vw_payables v ON v.id = it.id
                -- Recibo de pagamento ATIVO (no máximo um por título: índice
                -- financial_receipts_ativo_por_titulo). Cancelado não aparece.
                LEFT JOIN public.financial_receipts fr
                       ON fr.transaction_id = it.id
                      AND fr.kind = 'PAGAMENTO'
                      AND fr.cancelled_at IS NULL
                WHERE it.purchase_order_id = p_order_id
            ) x
        ), '[]'::jsonb)
    );
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_order_financeiro_json(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.partner_ws_financials(p_ws uuid, p_contract_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_supplier UUID;
    v_contract_ids UUID[];
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
                'source_system', row.source_system, 'recibo_numero', row.recibo_numero
            ) ORDER BY row.transaction_date DESC)
            FROM (
                -- Um ramo só: toda parcela derivada de contrato carrega o id do
                -- contrato no PREFIXO do reference_id, inclusive a de medição
                -- ('<contract_id>:m<measurement_id>:p<n>').
                SELECT t.id, t.transaction_date, t.amount, t.direction, t.description, t.status, t.business_status, t.installment_type, t.source_system,
                       fr.receipt_number AS recibo_numero
                FROM public.internal_transactions t
                -- Recibo de pagamento ATIVO do título (no máximo um).
                LEFT JOIN public.financial_receipts fr
                       ON fr.transaction_id = t.id
                      AND fr.kind = 'PAGAMENTO'
                      AND fr.cancelled_at IS NULL
                WHERE t.source_system IN ('CONTRACT_AVISTA', 'CONTRACT_PARCELADO', 'CONTRACT_RECURRING', 'CONTRACT_MEASUREMENT')
                  AND EXISTS (SELECT 1 FROM unnest(v_contract_ids) cid WHERE t.reference_id LIKE cid::text || '%')
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
            -- `<> 'Cancelada'` nas DUAS somas: é o mesmo recorte de
            -- fn_contract_retention_ledger. Medição cancelada não retém nada.
            SELECT jsonb_build_object(
                'retained', COALESCE(SUM(m.retention_value), 0),
                'released', COALESCE((
                    SELECT SUM(r.amount) FROM public.contract_retention_releases r WHERE r.contract_id = ANY(v_contract_ids)
                ), 0),
                'balance', COALESCE(SUM(m.retention_value), 0) - COALESCE((
                    SELECT SUM(r.amount) FROM public.contract_retention_releases r WHERE r.contract_id = ANY(v_contract_ids)
                ), 0)
            )
            FROM public.contract_measurements m
            WHERE m.contract_id = ANY(v_contract_ids)
              AND m.status <> 'Cancelada'
        )
    );
END;
$function$;

-- REGRA #7: o PostgreSQL concede EXECUTE a PUBLIC por padrão e GRANT não revoga
-- esse default. O núcleo não deve ser chamável direto por ninguém — só pelas
-- duas cascas, que é onde a autorização mora.
REVOKE EXECUTE ON FUNCTION public.partner_ws_financials(uuid, uuid) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

RESET lock_timeout;
