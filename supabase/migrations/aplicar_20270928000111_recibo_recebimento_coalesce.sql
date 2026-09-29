-- ============================================================================
-- Recibo de recebimento — checagem de "baixado" à prova de NULL (28/09/2026)
--
-- Plano: docs/planos/2026-09-28-contas-a-pagar-recibo-na-baixa.md
--
-- O teste transacional do recibo de PAGAMENTO (aplicar_20270928000110) mostrou
-- que `NOT (status = 'CONCILIATED' OR business_status = 'X')` vira NULL quando
-- business_status é NULL — o IF não entra e a RPC emite recibo para título
-- NÃO baixado. Em 28/09/2026 havia 222 títulos DEBIT abertos assim e nenhum
-- CREDIT, então Contas a Receber tinha o defeito sem exposição. Corrigido a
-- pedido do usuário ("1. Sim").
--
-- Duas peças, as duas reescritas a partir dos ARQUIVOS (não de
-- pg_get_functiondef, que corrompe acentuação no Windows):
--   · emitir_recibo_recebimento — texto de aplicar_20270927000120, só a linha
--     da checagem muda;
--   · trg_cancelar_recibo_no_estorno — mesmo defeito do lado NEW: estorno que
--     deixasse business_status NULL não cancelava o recibo.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ============================================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.emitir_recibo_recebimento(p_transaction_id UUID)
RETURNS public.financial_receipts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tx      public.internal_transactions%ROWTYPE;
    v_rec     public.financial_receipts%ROWTYPE;
    v_numero  INTEGER;
    v_pagador TEXT;
    v_doc     TEXT;
    v_org     public.organizations%ROWTYPE;
    v_origem  TEXT;
    v_contrato TEXT;
BEGIN
    -- FOR UPDATE: duas emissões simultâneas do mesmo título serializam aqui, e a
    -- segunda encontra o recibo da primeira.
    SELECT * INTO v_tx FROM public.internal_transactions
     WHERE id = p_transaction_id
     FOR UPDATE;

    IF NOT FOUND OR NOT public.is_org_member(v_tx.organization_id) THEN
        -- Mesma mensagem para "não existe" e "não é seu": não revela existência.
        RAISE EXCEPTION 'Título não encontrado.' USING ERRCODE = 'P0002';
    END IF;

    IF v_tx.direction IS DISTINCT FROM 'CREDIT' THEN
        RAISE EXCEPTION 'Recibo só é emitido para títulos a receber.' USING ERRCODE = '22023';
    END IF;

    -- COALESCE (28/09/2026): com business_status NULL, `NOT (false OR NULL)` é
    -- NULL, o IF não entrava e o recibo saía para título NÃO recebido.
    IF NOT (COALESCE(v_tx.status, '') = 'CONCILIATED' OR COALESCE(v_tx.business_status, '') = 'RECEBIDO') THEN
        RAISE EXCEPTION 'O título ainda não foi baixado.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_rec FROM public.financial_receipts
     WHERE transaction_id = p_transaction_id AND cancelled_at IS NULL;
    IF FOUND THEN
        RETURN v_rec;
    END IF;

    INSERT INTO public.financial_receipt_counters AS c (organization_id, last_number)
    VALUES (v_tx.organization_id, 1)
    ON CONFLICT (organization_id) DO UPDATE SET last_number = c.last_number + 1
    RETURNING c.last_number INTO v_numero;

    IF v_tx.party_id IS NOT NULL THEN
        SELECT NULLIF(TRIM(name), ''), NULLIF(TRIM(document), '')
          INTO v_pagador, v_doc
          FROM public.clients WHERE id = v_tx.party_id;
    END IF;

    SELECT * INTO v_org FROM public.organizations WHERE id = v_tx.organization_id;

    -- Nº do contrato de origem. `reference_id` é COMPOSTO — `<contract_id>:p<n>`
    -- ou `<contract_id>-p<vencimento>` (lib/receivableRef.ts): corta no que vier
    -- primeiro e só consulta se o que sobrou for um UUID.
    v_origem := split_part(split_part(COALESCE(v_tx.reference_id, ''), ':', 1), '-p', 1);
    IF v_origem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT NULLIF(TRIM(c.number), '') INTO v_contrato
          FROM public.contracts c WHERE c.id = v_origem::uuid;
    END IF;

    INSERT INTO public.financial_receipts (
        organization_id, transaction_id, receipt_number, amount, payment_date,
        payment_type, description, payer_name, payer_document,
        issuer_name, issuer_document, issuer_address, issued_by, contract_number
    ) VALUES (
        v_tx.organization_id, v_tx.id, v_numero, v_tx.amount,
        COALESCE(v_tx.payment_date, v_tx.transaction_date, CURRENT_DATE),
        v_tx.payment_type, v_tx.description,
        COALESCE(v_pagador, NULLIF(TRIM(v_tx.party_name), '')), v_doc,
        v_org.name, NULLIF(TRIM(v_org.cnpj), ''),
        NULLIF(CONCAT_WS(' – ',
            NULLIF(CONCAT_WS(', ', NULLIF(v_org.address->>'street', ''), NULLIF(v_org.address->>'number', '')), ''),
            NULLIF(v_org.address->>'neighborhood', ''),
            NULLIF(CONCAT_WS('/', NULLIF(v_org.address->>'city', ''), NULLIF(v_org.address->>'state', '')), ''),
            CASE WHEN NULLIF(v_org.address->>'zipCode', '') IS NOT NULL
                 THEN 'CEP ' || (v_org.address->>'zipCode') END
        ), ''),
        auth.uid(), v_contrato
    )
    RETURNING * INTO v_rec;

    RETURN v_rec;
END;
$$;

COMMENT ON FUNCTION public.emitir_recibo_recebimento(UUID) IS
'Emite o recibo de um título CREDIT baixado, ou devolve o recibo ativo. Ver aplicar_20270926000110, aplicar_20270927000120 (nº do contrato) e aplicar_20270928000111 (COALESCE na checagem de baixa).';

REVOKE EXECUTE ON FUNCTION public.emitir_recibo_recebimento(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.emitir_recibo_recebimento(UUID) TO authenticated;

DROP TRIGGER IF EXISTS trg_cancelar_recibo_no_estorno ON public.internal_transactions;
CREATE TRIGGER trg_cancelar_recibo_no_estorno
AFTER UPDATE ON public.internal_transactions
FOR EACH ROW
WHEN (
    OLD.direction = 'CREDIT'
    AND (OLD.status = 'CONCILIATED' OR OLD.business_status = 'RECEBIDO')
    AND NOT (COALESCE(NEW.status, '') = 'CONCILIATED' OR COALESCE(NEW.business_status, '') = 'RECEBIDO')
)
EXECUTE FUNCTION public.fn_cancelar_recibo_recebimento();

NOTIFY pgrst, 'reload schema';

RESET lock_timeout;
