-- ============================================================================
-- Recibo de recebimento — Nº DO CONTRATO (27/09/2026)
--
-- Plano: docs/planos/2026-09-26-contas-receber-recibo-na-baixa.md (Fase 4)
--
-- Pedido: "trazer no recibo o numero do contrato". O recibo congela o conteúdo
-- na emissão (aplicar_20270926000110), então o número entra no SNAPSHOT
-- (`financial_receipts.contract_number`), não é lido na hora de desenhar.
--
-- `emitir_recibo_recebimento` reescrita a partir da definição VIGENTE
-- (conferida com pg_get_functiondef: idêntica ao arquivo 20270926000110). Única
-- mudança: resolve `contracts.number` pelo `reference_id` do título.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.financial_receipts
    ADD COLUMN IF NOT EXISTS contract_number TEXT;

COMMENT ON COLUMN public.financial_receipts.contract_number IS
  'Nº do contrato de origem (contracts.number), congelado na emissão. NULL = título sem contrato.';

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

    IF NOT (v_tx.status = 'CONCILIATED' OR v_tx.business_status = 'RECEBIDO') THEN
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
'Emite o recibo de um título CREDIT baixado, ou devolve o recibo ativo. Ver aplicar_20270926000110 e aplicar_20270927000120 (nº do contrato).';

REVOKE EXECUTE ON FUNCTION public.emitir_recibo_recebimento(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.emitir_recibo_recebimento(UUID) TO authenticated;

-- ─── Recibos já emitidos ────────────────────────────────────────────────────
-- Preenche o número nos recibos existentes (em 27/09/2026: o nº 4, real, e os
-- 1–3 de teste, cujos títulos já foram excluídos e ficam NULL).
UPDATE public.financial_receipts r
   SET contract_number = NULLIF(TRIM(c.number), '')
  FROM public.internal_transactions t
  JOIN public.contracts c
    ON c.id::text = split_part(split_part(COALESCE(t.reference_id, ''), ':', 1), '-p', 1)
 WHERE t.id = r.transaction_id
   AND r.contract_number IS NULL;

NOTIFY pgrst, 'reload schema';

RESET lock_timeout;
