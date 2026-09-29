-- ============================================================================
-- Contas a Pagar — RECIBO DE PAGAMENTO numerado e guardado (28/09/2026)
--
-- Plano: docs/planos/2026-09-28-contas-a-pagar-recibo-na-baixa.md
--
-- Espelho do recibo de recebimento (aplicar_20270926000110 / 000120), com o
-- lado invertido: quem RECEBE é o credor, e é ele quem assina ("Recebi de
-- <organização> a importância de…"). Decisões do usuário (28/09/2026):
--   · recibo para o CREDOR assinar;
--   · numeração PRÓPRIA por organização, separada da de recebimento;
--   · todos os títulos a pagar, EXCETO Folha (LABOR: um título reúne vários
--     colaboradores, o recibo teria um signatário só).
--
-- Reaproveita sem mudar: o bucket financial-receipts e suas policies,
-- registrar_arquivo_recibo, a policy de SELECT e fn_cancelar_recibo_recebimento
-- (corpo genérico: cancela o recibo ativo do título, qualquer que seja o tipo).
-- NÃO toca em emitir_recibo_recebimento: ela grava sem `kind` e cai no default
-- 'RECEBIMENTO', e o contador dela (financial_receipt_counters) segue só dela.
--
--   financial_receipts.kind                  'RECEBIMENTO' | 'PAGAMENTO'
--   financial_receipts.payee_*               credor que recebe e assina (só PAGAMENTO)
--   financial_payment_receipt_counters       numeração de PAGAMENTO por organização
--   emitir_recibo_pagamento                  única porta de escrita; idempotente
--   trg_cancelar_recibo_pagamento_*          estorno/exclusão cancelam o recibo
--
-- Em PAGAMENTO, issuer_* é a ORGANIZAÇÃO (cabeçalho e logo do documento, que é
-- ela quem prepara) e payee_* é o credor (corpo e assinatura). payer_* fica nulo:
-- quem pagou é a própria emitente.
--
-- "Baixado" = status='CONCILIATED' OR business_status='PAGO' (vw_payables
-- mostra PAGO nas duas pernas).
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ============================================================================

SET lock_timeout = '5s';

-- ─── Tipo do recibo e credor ────────────────────────────────────────────────
ALTER TABLE public.financial_receipts
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'RECEBIMENTO',
    ADD COLUMN IF NOT EXISTS payee_name TEXT,
    ADD COLUMN IF NOT EXISTS payee_document TEXT;

ALTER TABLE public.financial_receipts
    DROP CONSTRAINT IF EXISTS financial_receipts_kind_check;
ALTER TABLE public.financial_receipts
    ADD CONSTRAINT financial_receipts_kind_check CHECK (kind IN ('RECEBIMENTO', 'PAGAMENTO'));

COMMENT ON COLUMN public.financial_receipts.kind IS
  'RECEBIMENTO (Contas a Receber: a organização recebeu) ou PAGAMENTO (Contas a Pagar: o credor recebeu da organização). Cada tipo tem numeração própria.';
COMMENT ON COLUMN public.financial_receipts.payee_name IS
  'Só PAGAMENTO: credor que recebeu e assina o recibo (congelado na emissão).';
COMMENT ON COLUMN public.financial_receipts.payee_document IS
  'Só PAGAMENTO: CPF/CNPJ do credor (congelado na emissão).';

-- Numeração única POR TIPO: o nº 1 de pagamento convive com o nº 1 de recebimento.
ALTER TABLE public.financial_receipts
    DROP CONSTRAINT IF EXISTS financial_receipts_numero_key;
ALTER TABLE public.financial_receipts
    ADD CONSTRAINT financial_receipts_numero_key UNIQUE (organization_id, kind, receipt_number);

COMMENT ON TABLE public.financial_receipts IS
  'Recibos emitidos na baixa de Contas a Receber (kind=RECEBIMENTO) e de Contas a Pagar '
  '(kind=PAGAMENTO). Conteúdo congelado na emissão; o PDF é montado a partir desta linha. '
  'Escrita só via RPC.';

-- ─── Contador de PAGAMENTO por organização ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.financial_payment_receipt_counters (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    last_number     INTEGER NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.financial_payment_receipt_counters IS
  'Último número de recibo de PAGAMENTO emitido por organização. Só a RPC '
  'emitir_recibo_pagamento lê e escreve.';

ALTER TABLE public.financial_payment_receipt_counters ENABLE ROW LEVEL SECURITY;
-- Sem policy e sem grant: ninguém além da função SECURITY DEFINER toca aqui.
REVOKE ALL ON public.financial_payment_receipt_counters FROM PUBLIC, anon, authenticated;

-- ─── RPC: emitir (ou devolver o ativo) ──────────────────────────────────────
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
    v_origem   TEXT;
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

    -- Nº do contrato de origem — mesmo recorte de emitir_recibo_recebimento:
    -- `<contract_id>:p<n>` ou `<contract_id>-p<vencimento>`; só consulta se o
    -- que sobrou for um UUID.
    v_origem := split_part(split_part(COALESCE(v_tx.reference_id, ''), ':', 1), '-p', 1);
    IF v_origem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT NULLIF(TRIM(c.number), '') INTO v_contrato
          FROM public.contracts c WHERE c.id = v_origem::uuid;
    END IF;

    INSERT INTO public.financial_receipts (
        organization_id, transaction_id, kind, receipt_number, amount, payment_date,
        payment_type, description, payee_name, payee_document,
        issuer_name, issuer_document, issuer_address, issued_by, contract_number
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
        auth.uid(), v_contrato
    )
    RETURNING * INTO v_rec;

    RETURN v_rec;
END;
$$;

COMMENT ON FUNCTION public.emitir_recibo_pagamento(UUID) IS
'Emite o recibo de pagamento (credor assina) de um título DEBIT baixado, ou devolve o recibo ativo. Folha (LABOR) é recusada. Ver aplicar_20270928000110.';

REVOKE EXECUTE ON FUNCTION public.emitir_recibo_pagamento(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.emitir_recibo_pagamento(UUID) TO authenticated;

-- ─── Estorno e exclusão cancelam o recibo ──────────────────────────────────
-- Mesma função das triggers de recebimento (cancela o recibo ativo do título).
DROP TRIGGER IF EXISTS trg_cancelar_recibo_pagamento_no_estorno ON public.internal_transactions;
CREATE TRIGGER trg_cancelar_recibo_pagamento_no_estorno
AFTER UPDATE ON public.internal_transactions
FOR EACH ROW
WHEN (
    OLD.direction = 'DEBIT'
    AND (OLD.status = 'CONCILIATED' OR OLD.business_status = 'PAGO')
    -- COALESCE: com NEW.status nulo, `NOT (NULL OR false)` é NULL e a trigger
    -- não dispararia — o título voltaria a aberto com o recibo ainda ativo.
    AND NOT (COALESCE(NEW.status, '') = 'CONCILIATED' OR COALESCE(NEW.business_status, '') = 'PAGO')
)
EXECUTE FUNCTION public.fn_cancelar_recibo_recebimento();

-- BEFORE DELETE: o FK (ON DELETE SET NULL) roda depois e zeraria o
-- transaction_id antes de uma trigger AFTER conseguir achar o recibo.
DROP TRIGGER IF EXISTS trg_cancelar_recibo_pagamento_na_exclusao ON public.internal_transactions;
CREATE TRIGGER trg_cancelar_recibo_pagamento_na_exclusao
BEFORE DELETE ON public.internal_transactions
FOR EACH ROW
WHEN (OLD.direction = 'DEBIT')
EXECUTE FUNCTION public.fn_cancelar_recibo_recebimento();

NOTIFY pgrst, 'reload schema';

RESET lock_timeout;
