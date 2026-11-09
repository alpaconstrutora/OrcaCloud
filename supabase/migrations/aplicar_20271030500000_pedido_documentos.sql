-- ==========================================================================
-- Pedido de compra › Recebimento › Documentos — anexos do pedido (nota fiscal,
-- recibo, comprovante, boleto, outros), enviados pelo comprador E pelo
-- fornecedor.
--
-- Plano: docs/planos/2026-11-09-pedido-compra-documentos.md
--
-- O anexo só GUARDA o arquivo. Uma NF enviada aqui não vira `invoices`, nem
-- `nfe_invoices`, nem título a pagar — decisão do usuário (09/11/2026), e o
-- motivo de a seção "Documentos Fiscais" ter saído do pedido em 21/08: dois
-- cadastros do mesmo dado.
--
-- Três portas, como as outras abas do pedido:
--   • comprador logado      → RLS (purchase_order_is_buyer)
--   • fornecedor logado     → RLS (purchase_order_is_supplier)
--   • fornecedor pelo LINK  → RPC de leitura abaixo + Edge Function
--                             supplier-portal-upload (envio e exclusão), que
--                             valida o token com service role.
--
-- REGRA #7
--   P1: toda perna de policy amarra o LADO a quem é: o comprador não grava linha
--       "do fornecedor" e vice-versa; leitura e escrita não compartilham
--       predicado (lição de aplicar_20270919000031).
--   P2: a RPC nova leva REVOKE FROM PUBLIC; o GRANT a anon é intencional (link
--       público), com a autorização DENTRO da função.
-- ==========================================================================

SET lock_timeout = '10s';

-- ─── Tabela ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_order_documents (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id         UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    categoria        TEXT NOT NULL DEFAULT 'OUTRO'
                     CHECK (categoria IN ('NOTA_FISCAL', 'RECIBO', 'COMPROVANTE', 'BOLETO', 'OUTRO')),
    descricao        TEXT,
    file_path        TEXT NOT NULL UNIQUE,
    file_name        TEXT NOT NULL,
    mime_type        TEXT,
    size_bytes       BIGINT,
    -- Quem enviou: decide quem pode excluir. Gravado por quem insere e
    -- conferido pela policy (não é informativo só).
    enviado_por_lado TEXT NOT NULL CHECK (enviado_por_lado IN ('COMPRADOR', 'FORNECEDOR')),
    -- Nome para exibir. Pela sessão, o gatilho grava o e-mail do JWT (o cliente
    -- não escolhe); pelo link, a Edge Function grava o nome do fornecedor.
    enviado_por      TEXT,
    uploaded_by      UUID,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_documents_order
    ON public.purchase_order_documents (order_id, created_at DESC);

ALTER TABLE public.purchase_order_documents ENABLE ROW LEVEL SECURITY;

-- Pela sessão, `uploaded_by` e `enviado_por` vêm do JWT, não do corpo do
-- INSERT. Pela service role (link do fornecedor), auth.uid() é nulo e vale o
-- que a Edge Function mandou.
CREATE OR REPLACE FUNCTION public.fn_purchase_order_documents_autor()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NOT NULL THEN
        NEW.uploaded_by := auth.uid();
        NEW.enviado_por := COALESCE(
            (SELECT NULLIF(trim(p.name), '') FROM public.profiles p WHERE p.id = auth.uid()),
            auth.jwt()->>'email'
        );
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_purchase_order_documents_autor() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_purchase_order_documents_autor ON public.purchase_order_documents;
CREATE TRIGGER trg_purchase_order_documents_autor
BEFORE INSERT ON public.purchase_order_documents
FOR EACH ROW EXECUTE FUNCTION public.fn_purchase_order_documents_autor();

-- ─── RLS ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "purchase_order_documents_select" ON public.purchase_order_documents;
CREATE POLICY "purchase_order_documents_select" ON public.purchase_order_documents
    FOR SELECT TO authenticated
    USING (
        public.purchase_order_is_buyer(order_id)
        OR public.purchase_order_is_supplier(order_id)
    );

DROP POLICY IF EXISTS "purchase_order_documents_insert" ON public.purchase_order_documents;
CREATE POLICY "purchase_order_documents_insert" ON public.purchase_order_documents
    FOR INSERT TO authenticated
    WITH CHECK (
        (enviado_por_lado = 'COMPRADOR'  AND public.purchase_order_is_buyer(order_id))
        OR (enviado_por_lado = 'FORNECEDOR' AND public.purchase_order_is_supplier(order_id))
    );

-- Cada lado exclui só o que o PRÓPRIO lado enviou. Sem UPDATE: corrigir é
-- excluir e enviar de novo.
DROP POLICY IF EXISTS "purchase_order_documents_delete" ON public.purchase_order_documents;
CREATE POLICY "purchase_order_documents_delete" ON public.purchase_order_documents
    FOR DELETE TO authenticated
    USING (
        (enviado_por_lado = 'COMPRADOR'  AND public.purchase_order_is_buyer(order_id))
        OR (enviado_por_lado = 'FORNECEDOR' AND public.purchase_order_is_supplier(order_id))
    );

-- ─── Bucket privado ─────────────────────────────────────────────────────────
-- Sem `allowed_mime_types`: XML de NF chega com tipo vazio ou variado conforme
-- o navegador. A extensão é conferida no cliente e na Edge Function.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('purchase-order-documents', 'purchase-order-documents', false, 10485760)
ON CONFLICT (id) DO NOTHING;

-- 1ª pasta = id do pedido. O CASE protege o cast.
DROP POLICY IF EXISTS "purchase_order_documents_storage_select" ON storage.objects;
CREATE POLICY "purchase_order_documents_storage_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'purchase-order-documents'
        AND CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
                 THEN public.purchase_order_is_buyer(((storage.foldername(name))[1])::uuid)
                   OR public.purchase_order_is_supplier(((storage.foldername(name))[1])::uuid)
                 ELSE false END
    );

DROP POLICY IF EXISTS "purchase_order_documents_storage_insert" ON storage.objects;
CREATE POLICY "purchase_order_documents_storage_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'purchase-order-documents'
        AND CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
                 THEN public.purchase_order_is_buyer(((storage.foldername(name))[1])::uuid)
                   OR public.purchase_order_is_supplier(((storage.foldername(name))[1])::uuid)
                 ELSE false END
    );

-- O arquivo só sai depois da LINHA (cuja policy confere o lado): enquanto uma
-- linha aponta para o objeto, ninguém o apaga pelo storage. Sem esta trava o
-- fornecedor apagaria o arquivo do comprador direto no bucket.
DROP POLICY IF EXISTS "purchase_order_documents_storage_delete" ON storage.objects;
CREATE POLICY "purchase_order_documents_storage_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'purchase-order-documents'
        AND NOT EXISTS (
            SELECT 1 FROM public.purchase_order_documents d WHERE d.file_path = objects.name
        )
        AND CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
                 THEN public.purchase_order_is_buyer(((storage.foldername(name))[1])::uuid)
                   OR public.purchase_order_is_supplier(((storage.foldername(name))[1])::uuid)
                 ELSE false END
    );

-- ─── Leitura pelo link do fornecedor ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.supplier_portal_get_order_documents(p_token TEXT, p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_sup UUID := public.supplier_portal_supplier_from_token(p_token);
BEGIN
    IF v_sup IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    IF NOT public.supplier_portal_pedido_do_fornecedor(p_order_id, v_sup) THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;
    RETURN jsonb_build_object(
        'valid', TRUE,
        'documents', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id',               d.id,
                    'order_id',         d.order_id,
                    'categoria',        d.categoria,
                    'descricao',        d.descricao,
                    'file_path',        d.file_path,
                    'file_name',        d.file_name,
                    'mime_type',        d.mime_type,
                    'size_bytes',       d.size_bytes,
                    'enviado_por_lado', d.enviado_por_lado,
                    'enviado_por',      d.enviado_por,
                    'created_at',       d.created_at
                ) ORDER BY d.created_at DESC
            )
            FROM public.purchase_order_documents d
            WHERE d.order_id = p_order_id
        ), '[]'::jsonb)
    );
END;
$X$;

REVOKE EXECUTE ON FUNCTION public.supplier_portal_get_order_documents(TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.supplier_portal_get_order_documents(TEXT, UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

RESET lock_timeout;

-- ── Conferência ──────────────────────────────────────────────────────────────
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'purchase_order_documents';
-- SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND policyname LIKE 'purchase_order_documents%';
-- SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'purchase-order-documents';
-- SELECT has_function_privilege('anon', 'public.supplier_portal_get_order_documents(text,uuid)', 'EXECUTE');
-- SELECT has_function_privilege('anon', 'public.fn_purchase_order_documents_autor()', 'EXECUTE');
