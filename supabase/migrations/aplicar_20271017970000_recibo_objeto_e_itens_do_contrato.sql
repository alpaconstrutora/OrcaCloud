-- ============================================================================
-- Recibo — OBJETO e ITENS do contrato no snapshot (17/10/2026)
--
-- Plano: docs/planos/2026-10-17-recibo-contrato-objeto-itens.md
--
-- Pedido: "Recibo emitido referente a um contrato deve trazer o campo Título /
-- Objeto (aba resumo) para identificar do que se trata o recibo, e também trazer
-- os itens do contrato (aba itens do contrato)".
--
-- O recibo congela o conteúdo na emissão (aplicar_20270926000110): objeto e itens
-- entram no SNAPSHOT (`financial_receipts.contract_title` / `contract_items`), não
-- são lidos na hora de desenhar — reimprimir devolve o mesmo documento.
--
-- Peças:
--   · recibo_contrato_do_titulo(reference_id) — o recorte do `reference_id` que
--     estava DUPLICADO nas duas RPCs (`<contract_id>:p<n>` ou
--     `<contract_id>-p<vencimento>`, lib/receivableRef.ts) + número, título e itens
--     do contrato, num jsonb. jsonb e não RETURNS TABLE: ambiguidade de nome em
--     plpgsql já mordeu três vezes neste projeto.
--   · emitir_recibo_pagamento / emitir_recibo_recebimento — reescritas a partir dos
--     ARQUIVOS vigentes (aplicar_20270928000110 / aplicar_20270928000111; conferidos
--     idênticos ao pg_get_functiondef em 17/10/2026). Única mudança: o bloco do
--     contrato usa o helper e o INSERT grava também contract_title/contract_items.
--   · Backfill dos recibos já emitidos com contrato (decisão do usuário: "completar
--     e regerar"). Não toca contract_number (congelado — o 000001 de pagamento
--     guarda CTS-010-036-0001, número anterior à renumeração), valor, número nem
--     file_path. Os PDFs são regerados no Storage à parte.
--     REVERSÃO: UPDATE public.financial_receipts
--                  SET contract_title = NULL, contract_items = NULL;
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.financial_receipts
    ADD COLUMN IF NOT EXISTS contract_title TEXT,
    ADD COLUMN IF NOT EXISTS contract_items JSONB;

COMMENT ON COLUMN public.financial_receipts.contract_title IS
  'Título / Objeto do contrato de origem (contracts.title), congelado na emissão. NULL = título sem contrato.';
COMMENT ON COLUMN public.financial_receipts.contract_items IS
  'Itens do contrato de origem congelados na emissão: [{description, unit, quantity, unit_price, total_price}] na ordem da aba Itens (created_at). NULL = sem contrato ou contrato sem itens.';

-- ─── Helper: contrato de origem do título ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recibo_contrato_do_titulo(p_reference_id TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    WITH origem AS (
        SELECT split_part(split_part(COALESCE(p_reference_id, ''), ':', 1), '-p', 1) AS id
    )
    SELECT jsonb_build_object(
        'number', NULLIF(TRIM(c.number), ''),
        'title',  NULLIF(TRIM(c.title), ''),
        'items',  (SELECT jsonb_agg(jsonb_build_object(
                        'description', i.description,
                        'unit',        i.unit,
                        'quantity',    i.quantity,
                        'unit_price',  i.unit_price,
                        'total_price', i.total_price
                    ) ORDER BY i.created_at, i.id)
                     FROM public.contract_items i
                    WHERE i.contract_id = c.id)
    )
      FROM origem o
      -- CASE: o cast só roda para UUID válido (a ordem de avaliação do JOIN não é garantida).
      JOIN public.contracts c
        ON c.id = CASE WHEN o.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                       THEN o.id::uuid END;
$$;

COMMENT ON FUNCTION public.recibo_contrato_do_titulo(TEXT) IS
'Número, título e itens do contrato de origem de um título (pelo reference_id composto), para o snapshot do recibo. Interna: só as RPCs emitir_recibo_* (SECURITY DEFINER) chamam. Ver aplicar_20271017970000.';

-- Interna: lê contrato de qualquer organização pelo id — não pode ser chamável de fora.
REVOKE EXECUTE ON FUNCTION public.recibo_contrato_do_titulo(TEXT) FROM PUBLIC, anon, authenticated;

-- ─── RPC: recibo de PAGAMENTO ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.emitir_recibo_pagamento(p_transaction_id UUID)
RETURNS public.financial_receipts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tx       public.internal_transactions%ROWTYPE;
    v_rec      public.financial_receipts%ROWTYPE;
    v_numero   INTEGER;
    v_credor   TEXT;
    v_doc      TEXT;
    v_org      public.organizations%ROWTYPE;
    v_contrato JSONB;
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

    IF v_tx.direction IS DISTINCT FROM 'DEBIT' THEN
        RAISE EXCEPTION 'Recibo de pagamento só é emitido para títulos a pagar.' USING ERRCODE = '22023';
    END IF;

    IF v_tx.source_system = 'LABOR' THEN
        RAISE EXCEPTION 'Título de folha reúne vários colaboradores: não há um credor único para assinar o recibo.' USING ERRCODE = '22023';
    END IF;

    -- COALESCE obrigatório: 222 títulos DEBIT em aberto tinham business_status
    -- NULL em 28/09/2026. Sem ele, `NOT (false OR NULL)` é NULL, o IF não entra
    -- e o recibo sairia para título NÃO pago (pego no teste transacional).
    IF NOT (COALESCE(v_tx.status, '') = 'CONCILIATED' OR COALESCE(v_tx.business_status, '') = 'PAGO') THEN
        RAISE EXCEPTION 'O título ainda não foi baixado.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_rec FROM public.financial_receipts
     WHERE transaction_id = p_transaction_id AND cancelled_at IS NULL;
    IF FOUND THEN
        RETURN v_rec;
    END IF;

    INSERT INTO public.financial_payment_receipt_counters AS c (organization_id, last_number)
    VALUES (v_tx.organization_id, 1)
    ON CONFLICT (organization_id) DO UPDATE SET last_number = c.last_number + 1
    RETURNING c.last_number INTO v_numero;

    -- Credor: o CADASTRO primeiro (supplier_id → suppliers), depois o texto do
    -- título. Em boleto, party_name é o bloco de OCR da linha do beneficiário —
    -- o cadastro é a versão curada do mesmo nome.
    IF v_tx.supplier_id IS NOT NULL THEN
        SELECT NULLIF(TRIM(s.name), ''), NULLIF(TRIM(s.document), '')
          INTO v_credor, v_doc
          FROM public.suppliers s WHERE s.id = v_tx.supplier_id;
    END IF;

    SELECT * INTO v_org FROM public.organizations WHERE id = v_tx.organization_id;

    -- Contrato de origem (nº, objeto e itens) — aplicar_20271017970000.
    v_contrato := public.recibo_contrato_do_titulo(v_tx.reference_id);

    INSERT INTO public.financial_receipts (
        organization_id, transaction_id, kind, receipt_number, amount, payment_date,
        payment_type, description, payee_name, payee_document,
        issuer_name, issuer_document, issuer_address, issued_by, contract_number,
        contract_title, contract_items
    ) VALUES (
        v_tx.organization_id, v_tx.id, 'PAGAMENTO', v_numero, v_tx.amount,
        COALESCE(v_tx.payment_date, v_tx.transaction_date, CURRENT_DATE),
        v_tx.payment_type, v_tx.description,
        COALESCE(v_credor, NULLIF(TRIM(v_tx.party_name), ''), NULLIF(TRIM(v_tx.entity_name), '')), v_doc,
        v_org.name, NULLIF(TRIM(v_org.cnpj), ''),
        NULLIF(CONCAT_WS(' – ',
            NULLIF(CONCAT_WS(', ', NULLIF(v_org.address->>'street', ''), NULLIF(v_org.address->>'number', '')), ''),
            NULLIF(v_org.address->>'neighborhood', ''),
            NULLIF(CONCAT_WS('/', NULLIF(v_org.address->>'city', ''), NULLIF(v_org.address->>'state', '')), ''),
            CASE WHEN NULLIF(v_org.address->>'zipCode', '') IS NOT NULL
                 THEN 'CEP ' || (v_org.address->>'zipCode') END
        ), ''),
        auth.uid(), v_contrato->>'number',
        v_contrato->>'title', NULLIF(v_contrato->'items', 'null'::jsonb)
    )
    RETURNING * INTO v_rec;

    RETURN v_rec;
END;
$$;

COMMENT ON FUNCTION public.emitir_recibo_pagamento(UUID) IS
'Emite o recibo de pagamento (credor assina) de um título DEBIT baixado, ou devolve o recibo ativo. Folha (LABOR) é recusada. Ver aplicar_20270928000110 e aplicar_20271017970000 (objeto e itens do contrato).';

REVOKE EXECUTE ON FUNCTION public.emitir_recibo_pagamento(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.emitir_recibo_pagamento(UUID) TO authenticated;

-- ─── RPC: recibo de RECEBIMENTO ──────────────────────────────────────────────
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
    v_contrato JSONB;
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

    -- Contrato de origem (nº, objeto e itens) — aplicar_20271017970000.
    v_contrato := public.recibo_contrato_do_titulo(v_tx.reference_id);

    INSERT INTO public.financial_receipts (
        organization_id, transaction_id, receipt_number, amount, payment_date,
        payment_type, description, payer_name, payer_document,
        issuer_name, issuer_document, issuer_address, issued_by, contract_number,
        contract_title, contract_items
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
        auth.uid(), v_contrato->>'number',
        v_contrato->>'title', NULLIF(v_contrato->'items', 'null'::jsonb)
    )
    RETURNING * INTO v_rec;

    RETURN v_rec;
END;
$$;

COMMENT ON FUNCTION public.emitir_recibo_recebimento(UUID) IS
'Emite o recibo de um título CREDIT baixado, ou devolve o recibo ativo. Ver aplicar_20270926000110, aplicar_20270927000120 (nº do contrato), aplicar_20270928000111 (COALESCE na checagem de baixa) e aplicar_20271017970000 (objeto e itens do contrato).';

REVOKE EXECUTE ON FUNCTION public.emitir_recibo_recebimento(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.emitir_recibo_recebimento(UUID) TO authenticated;

-- ─── Backfill: recibos já emitidos com contrato ─────────────────────────────
-- Só preenche o que está NULL (reaplicar não muda nada). contract_number fica como foi
-- congelado.
UPDATE public.financial_receipts r
   SET contract_title = x.dados->>'title',
       contract_items = NULLIF(x.dados->'items', 'null'::jsonb)
  FROM (
      SELECT r2.id, public.recibo_contrato_do_titulo(t.reference_id) AS dados
        FROM public.financial_receipts r2
        JOIN public.internal_transactions t ON t.id = r2.transaction_id
       WHERE r2.contract_number IS NOT NULL
         AND r2.contract_title IS NULL
         AND r2.contract_items IS NULL
  ) x
 WHERE r.id = x.id
   AND x.dados IS NOT NULL;

NOTIFY pgrst, 'reload schema';

RESET lock_timeout;
