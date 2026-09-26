-- ============================================================================
-- Contas a Receber — RECIBO DE RECEBIMENTO numerado e guardado (26/09/2026)
--
-- Plano: docs/planos/2026-09-26-contas-receber-recibo-na-baixa.md
--
-- Até aqui o recibo era só um PDF montado no navegador
-- (`exportService.generateReceiptPDF` → `doc.save()`): nada no banco, "número"
-- = começo do UUID, e reimprimir gerava outro documento. Agora:
--
--   financial_receipts          uma linha por emissão, com o conteúdo CONGELADO
--                               (valor, data, forma, pagador, emitente). O PDF
--                               é montado a partir daqui, então reimprimir sai
--                               idêntico mesmo que o título ou o cliente mudem.
--   financial_receipt_counters  numeração sequencial POR ORGANIZAÇÃO.
--   emitir_recibo_recebimento   única porta de escrita. Idempotente: se o título
--                               já tem recibo ativo, devolve o mesmo (duplo
--                               clique e reimpressão não gastam número).
--   registrar_arquivo_recibo    grava o caminho do PDF no Storage, uma vez só.
--   trg_cancelar_recibo_*       estorno da baixa (ou exclusão do título) cancela
--                               o recibo ativo. Nova baixa → número novo; o
--                               cancelado fica no histórico.
--   bucket financial-receipts   privado, 1ª pasta = organization_id, sem UPDATE
--                               nem DELETE: arquivo emitido é imutável.
--
-- "Baixado" = status='CONCILIATED' OR business_status='RECEBIDO'. As duas
-- pernas existem de verdade: em 26/09/2026 havia 24 títulos CREDIT
-- PREVISTO/CONCILIATED (conciliados pelo extrato sem mudar o status de
-- negócio), que a tela já mostra como recebidos (effective_status).
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ============================================================================

SET lock_timeout = '5s';

-- ─── Contador por organização ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.financial_receipt_counters (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    last_number     INTEGER NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.financial_receipt_counters IS
  'Último número de recibo de recebimento emitido por organização. Só a RPC '
  'emitir_recibo_recebimento lê e escreve.';

ALTER TABLE public.financial_receipt_counters ENABLE ROW LEVEL SECURITY;
-- Sem policy e sem grant: ninguém além das funções SECURITY DEFINER toca aqui.
REVOKE ALL ON public.financial_receipt_counters FROM PUBLIC, anon, authenticated;

-- ─── Recibos ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.financial_receipts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- SET NULL, não RESTRICT: excluir um título (ressincronização de contrato,
    -- limpeza) não pode passar a falhar por causa do recibo. O recibo fica no
    -- histórico, cancelado pela trigger de exclusão abaixo.
    transaction_id   UUID REFERENCES public.internal_transactions(id) ON DELETE SET NULL,
    receipt_number   INTEGER NOT NULL,
    amount           NUMERIC(15,2) NOT NULL,
    payment_date     DATE NOT NULL,
    payment_type     TEXT,
    description      TEXT,
    payer_name       TEXT,
    payer_document   TEXT,
    issuer_name      TEXT,
    issuer_document  TEXT,
    issuer_address   TEXT,
    file_path        TEXT,
    issued_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    issued_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancelled_at     TIMESTAMPTZ,
    cancel_reason    TEXT,

    CONSTRAINT financial_receipts_numero_key UNIQUE (organization_id, receipt_number)
);

-- No máximo UM recibo ativo por título.
CREATE UNIQUE INDEX IF NOT EXISTS financial_receipts_ativo_por_titulo
    ON public.financial_receipts (transaction_id)
    WHERE cancelled_at IS NULL;

COMMENT ON TABLE public.financial_receipts IS
  'Recibos de recebimento emitidos na baixa de Contas a Receber. Conteúdo congelado '
  'na emissão; o PDF é montado a partir desta linha. Escrita só via RPC.';

ALTER TABLE public.financial_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "financial_receipts_select_org" ON public.financial_receipts;
CREATE POLICY "financial_receipts_select_org"
    ON public.financial_receipts
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

REVOKE ALL ON public.financial_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.financial_receipts TO authenticated;

-- ─── RPC: emitir (ou devolver o ativo) ──────────────────────────────────────
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

    INSERT INTO public.financial_receipts (
        organization_id, transaction_id, receipt_number, amount, payment_date,
        payment_type, description, payer_name, payer_document,
        issuer_name, issuer_document, issuer_address, issued_by
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
        auth.uid()
    )
    RETURNING * INTO v_rec;

    RETURN v_rec;
END;
$$;

COMMENT ON FUNCTION public.emitir_recibo_recebimento(UUID) IS
'Emite o recibo de um título CREDIT baixado, ou devolve o recibo ativo. Ver aplicar_20270926000110.';

REVOKE EXECUTE ON FUNCTION public.emitir_recibo_recebimento(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.emitir_recibo_recebimento(UUID) TO authenticated;

-- ─── RPC: registrar o PDF guardado ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_arquivo_recibo(p_receipt_id UUID, p_file_path TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID;
BEGIN
    SELECT organization_id INTO v_org FROM public.financial_receipts WHERE id = p_receipt_id;

    IF v_org IS NULL OR NOT public.is_org_member(v_org) THEN
        RAISE EXCEPTION 'Recibo não encontrado.' USING ERRCODE = 'P0002';
    END IF;

    IF p_file_path IS NULL OR LEFT(p_file_path, 37) <> v_org::text || '/' THEN
        RAISE EXCEPTION 'Caminho do arquivo fora da pasta da organização.' USING ERRCODE = '22023';
    END IF;

    -- Uma vez só: o arquivo emitido não é trocado.
    UPDATE public.financial_receipts
       SET file_path = p_file_path
     WHERE id = p_receipt_id AND file_path IS NULL;
END;
$$;

COMMENT ON FUNCTION public.registrar_arquivo_recibo(UUID, TEXT) IS
'Grava o caminho do PDF do recibo no bucket financial-receipts (uma vez). Ver aplicar_20270926000110.';

REVOKE EXECUTE ON FUNCTION public.registrar_arquivo_recibo(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_arquivo_recibo(UUID, TEXT) TO authenticated;

-- ─── Trigger: estorno / exclusão cancelam o recibo ativo ────────────────────
-- Na trigger, e não no `estornar()` da tela, pelo mesmo motivo da 20270909000002:
-- vários caminhos desfazem baixa (Contas a Receber, conciliação, boleto), e a
-- correção certa é no ponto por onde todos passam.
CREATE OR REPLACE FUNCTION public.fn_cancelar_recibo_recebimento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.financial_receipts
       SET cancelled_at  = NOW(),
           cancel_reason = CASE WHEN TG_OP = 'DELETE' THEN 'titulo_excluido' ELSE 'estorno' END
     WHERE transaction_id = OLD.id
       AND cancelled_at IS NULL;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_cancelar_recibo_recebimento() IS
'Cancela o recibo ativo quando o título deixa de estar baixado ou é excluído. Ver aplicar_20270926000110.';

REVOKE EXECUTE ON FUNCTION public.fn_cancelar_recibo_recebimento() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cancelar_recibo_no_estorno ON public.internal_transactions;
CREATE TRIGGER trg_cancelar_recibo_no_estorno
AFTER UPDATE ON public.internal_transactions
FOR EACH ROW
WHEN (
    OLD.direction = 'CREDIT'
    AND (OLD.status = 'CONCILIATED' OR OLD.business_status = 'RECEBIDO')
    AND NOT (NEW.status = 'CONCILIATED' OR NEW.business_status = 'RECEBIDO')
)
EXECUTE FUNCTION public.fn_cancelar_recibo_recebimento();

-- BEFORE DELETE: o FK (ON DELETE SET NULL) roda depois e zeraria o
-- transaction_id antes de uma trigger AFTER conseguir achar o recibo.
DROP TRIGGER IF EXISTS trg_cancelar_recibo_na_exclusao ON public.internal_transactions;
CREATE TRIGGER trg_cancelar_recibo_na_exclusao
BEFORE DELETE ON public.internal_transactions
FOR EACH ROW
WHEN (OLD.direction = 'CREDIT')
EXECUTE FUNCTION public.fn_cancelar_recibo_recebimento();

-- ─── Bucket privado ─────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('financial-receipts', 'financial-receipts', false, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- 1ª pasta = organization_id. O CASE protege o cast: sem ele, um objeto de outro
-- bucket com pasta que não é UUID poderia derrubar a avaliação da policy.
DROP POLICY IF EXISTS "financial_receipts_storage_select" ON storage.objects;
CREATE POLICY "financial_receipts_storage_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'financial-receipts'
        AND CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
                 THEN public.is_org_member(((storage.foldername(name))[1])::uuid)
                 ELSE false END
    );

DROP POLICY IF EXISTS "financial_receipts_storage_insert" ON storage.objects;
CREATE POLICY "financial_receipts_storage_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'financial-receipts'
        AND CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
                 THEN public.is_org_member(((storage.foldername(name))[1])::uuid)
                 ELSE false END
    );

NOTIFY pgrst, 'reload schema';

RESET lock_timeout;

-- ── Conferência ──────────────────────────────────────────────────────────────
-- SELECT proname, proacl FROM pg_proc
--  WHERE proname IN ('emitir_recibo_recebimento','registrar_arquivo_recibo','fn_cancelar_recibo_recebimento');
-- SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_cancelar_recibo%';
-- SELECT id, public FROM storage.buckets WHERE id = 'financial-receipts';
