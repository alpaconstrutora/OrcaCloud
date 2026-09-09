-- Portal do Parceiro › Financeiro — dois defeitos achados abrindo a tela real
-- em 09/09/2026. Plano:
-- docs/planos/2026-09-09-partner-financeiro-defeitos-retencao-e-titulo-de-medicao.md
--
-- Mexe só no NÚCLEO `partner_ws_financials`. As duas cascas
-- (`partner_get_financials` no app, `partner_portal_get_financials` no link)
-- chamam este corpo — um conserto atende os dois modos. NÃO reescrever as
-- cascas aqui: foi copiando corpo entre gêmeas que a leitura de Documentos
-- regrediu em 20270913 (ver 20270919000026).
--
-- DEFEITO 1 — retenção com dois cálculos.
--   `fn_contract_retention_ledger` exclui medição 'Cancelada'; este agregado
--   não excluía. Com uma medição cancelada o parceiro via, no portal dele,
--   retenção MAIOR que a real — e maior que a que `releaseRetention` aceita
--   liberar, porque aquele valida contra o ledger.
--
-- DEFEITO 2 — título gerado por medição nunca aparecia.
--   O ramo de medição procurava `reference_id IN (<ids de medição>)`, igualdade
--   exata. Existe UNIQUE (organization_id, reference_id, entry_type) em
--   internal_transactions, então esse formato só comportaria UMA parcela por
--   medição — uma medição de R$ 1,00 num contrato de 24 parcelas gera 24
--   linhas. O ramo era impossível de satisfazer, não apenas inativo.
--   O produtor (`financialService.syncMeasurementToFinance`) passa a gravar
--   `source_system='CONTRACT_MEASUREMENT'` com
--   `reference_id = '<contract_id>:m<measurement_id>:p<n>'` — mesma convenção
--   composta que `contractService` já usa para as séries de contrato. Assim a
--   linha casa pelo ramo de CONTRATO (LIKE contract_id || '%'), que já existe,
--   e `split(':')[0]` no Extrato continua devolvendo o contrato.
--   Por isso aqui: some 'CONTRACT_MEASUREMENT' à lista do primeiro ramo e
--   remova o segundo.

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
                'source_system', row.source_system
            ) ORDER BY row.transaction_date DESC)
            FROM (
                -- Um ramo só: toda parcela derivada de contrato carrega o id do
                -- contrato no PREFIXO do reference_id, inclusive a de medição
                -- ('<contract_id>:m<measurement_id>:p<n>').
                SELECT t.id, t.transaction_date, t.amount, t.direction, t.description, t.status, t.business_status, t.installment_type, t.source_system
                FROM public.internal_transactions t
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
