-- ============================================================
-- OrçaCloud — Módulo Fiscal & Custos
-- Migration 004: Políticas RLS do bucket fiscal-documents
--
-- Estrutura de path: {organization_id}/{ano}/{arquivo.xml}
-- O primeiro segmento do path é o organization_id do usuário.
-- ============================================================

-- Upload: usuário autenticado membro da organização
CREATE POLICY "fiscal_docs_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'fiscal-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text
    FROM public.organization_members
    WHERE user_id = auth.uid()
  )
);

-- Leitura: usuário autenticado membro da organização
CREATE POLICY "fiscal_docs_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'fiscal-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text
    FROM public.organization_members
    WHERE user_id = auth.uid()
  )
);

-- Exclusão: usuário autenticado membro da organização
CREATE POLICY "fiscal_docs_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'fiscal-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text
    FROM public.organization_members
    WHERE user_id = auth.uid()
  )
);
