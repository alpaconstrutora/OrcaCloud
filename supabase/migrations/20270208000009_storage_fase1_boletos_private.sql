-- ============================================================
-- Migration: 20270208000009_storage_fase1_boletos_private.sql
-- Fase 1 do PLANO_STORAGE_PRIVATIZACAO.md — privatiza `boletos` (PDFs de
-- boleto de Contas a Pagar, extraídos por OCR; 659 objetos — o maior bucket).
--
-- ⚠️ ORDEM: aplicar APÓS o deploy do código (boletoService.getDocumentoUrl
--    virou async/signed URL + BoletoFormModal resolve em estado). Se aplicar
--    antes, o preview do boleto no modal para de carregar.
--
-- Exposição anterior:
--   • public=true → 659 PDFs de boleto legíveis por qualquer um com o path.
--   • Policy "boletos_storage_all" (role PUBLIC, cmd ALL) → pior: qualquer um
--     (anon inclusive) podia LER/ESCREVER/APAGAR via API, mesmo com bucket
--     privado. REMOVIDA e substituída por org-scoped.
--
-- Path = "{organization_id}/{ano}/{ts}_{arquivo}" → foldername[1] = org.
-- Companheiro de código: boletoService.ts (getDocumentoUrl async signed),
-- components/BoletoFormModal.tsx (documentoUrl em estado). boletoService já
-- persistia o PATH (documento_path), sem URL persistida para quebrar.
--
-- Nota: este é o bucket de boletos de PAGAR (OCR interno), não os boletos
-- Asaas emitidos ao cliente (client_charges) — aquele fluxo não usa este bucket.
-- ============================================================

DROP POLICY IF EXISTS "boletos_storage_all" ON storage.objects;

CREATE POLICY "boletos_select_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'boletos'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

CREATE POLICY "boletos_insert_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'boletos'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

CREATE POLICY "boletos_update_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'boletos'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

CREATE POLICY "boletos_delete_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'boletos'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

UPDATE storage.buckets SET public = false WHERE id = 'boletos';
