-- ============================================================================
-- Portal do Parceiro — cada PARCELA diz de qual CONTRATO é (17/10/2026)
--
-- Plano: docs/planos/2026-10-17-parceiro-financeiro-visual-corretor.md (item 1)
--
-- A aba Financeiro do Portal do Parceiro passa a mostrar um card por contrato
-- (mesmo desenho das Comissões do Portal do Corretor). O payload de
-- `partner_ws_financials` trazia o contrato só nas medições; a parcela não
-- dizia de qual contrato era — o vínculo existia só no prefixo do
-- `reference_id` ('<contract_id>:…'), que não é devolvido.
--
-- Única mudança: `installments[].contract_id`. O EXISTS do filtro virou um
-- CROSS JOIN LATERAL com o MESMO predicado (mesmas linhas entram), que além de
-- filtrar devolve o `cid`. Nenhum outro campo, filtro ou ordem muda; as cascas
-- (partner_portal_get_financials / partner_get_financials), onde mora a
-- autorização, ficam intactas.
--
-- Reescrita a partir da versão VIVA (pg_get_functiondef em 17/10/2026 =
-- aplicar_20270928000120, conferido por diff).
--
-- ⚠️ Nasceu como aplicar_20271017500000_… e foi renomeada: o prefixo colidia com
--    20271017500000_comissao_corretor_titulo_e_portal.sql (outra frente, chegou antes).
--    JÁ APLICADA no banco em 17/10/2026 com o nome antigo — é idempotente
--    (CREATE OR REPLACE + REVOKE), reaplicar não estraga nada.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ============================================================================

SET lock_timeout = '5s';

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
                'source_system', row.source_system, 'recibo_numero', row.recibo_numero,
                'contract_id', row.contract_id
            ) ORDER BY row.transaction_date DESC)
            FROM (
                -- Um ramo só: toda parcela derivada de contrato carrega o id do
                -- contrato no PREFIXO do reference_id, inclusive a de medição
                -- ('<contract_id>:m<measurement_id>:p<n>').
                SELECT t.id, t.transaction_date, t.amount, t.direction, t.description, t.status, t.business_status, t.installment_type, t.source_system,
                       fr.receipt_number AS recibo_numero,
                       ct.cid AS contract_id
                FROM public.internal_transactions t
                -- Recibo de pagamento ATIVO do título (no máximo um).
                LEFT JOIN public.financial_receipts fr
                       ON fr.transaction_id = t.id
                      AND fr.kind = 'PAGAMENTO'
                      AND fr.cancelled_at IS NULL
                -- O contrato DONO da parcela é o prefixo do reference_id. O
                -- LATERAL faz o papel do antigo EXISTS (sem prefixo de contrato
                -- do fornecedor, a linha não entra) e devolve QUAL contrato é —
                -- LIMIT 1: o prefixo é um UUID inteiro, não há como casar dois.
                CROSS JOIN LATERAL (
                    SELECT cid FROM unnest(v_contract_ids) cid
                    WHERE t.reference_id LIKE cid::text || '%'
                    LIMIT 1
                ) ct
                WHERE t.source_system IN ('CONTRACT_AVISTA', 'CONTRACT_PARCELADO', 'CONTRACT_RECURRING', 'CONTRACT_MEASUREMENT')
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

-- REGRA #7: CREATE OR REPLACE preserva os privilégios, mas o REVOKE fica
-- explícito — o núcleo não é chamável direto por ninguém, só pelas cascas.
REVOKE EXECUTE ON FUNCTION public.partner_ws_financials(uuid, uuid) FROM PUBLIC, anon, authenticated;
