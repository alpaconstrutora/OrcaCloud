-- ============================================================
-- Migration: 20270208000005_storage_fase1_receipts_private.sql
-- Fase 1 (piloto com dado real) do PLANO_STORAGE_PRIVATIZACAO.md —
-- privatiza o bucket `receipts` (fotos de comprovante de recebimento de
-- ordem de compra; 2 objetos no remoto).
--
-- Estado anterior (exposição):
--   • public=true → fotos legíveis por qualquer um com o path.
--   • "Public Receipt Access" (role public, SELECT) → mesmo privado, deixaria
--     qualquer um ler via API. REMOVIDA.
--   • "Authenticated Receipt Upload/Update/Delete" só checavam bucket_id (SEM
--     escopo de org) → qualquer usuário logado escrevia/apagava comprovante de
--     QUALQUER empresa. SUBSTITUÍDAS por org-scoped.
--
-- Escopo de organização: o path é "{orderId}/receipt_{ts}_{arquivo}", então
-- foldername[1] = orderId. Como purchase_orders NÃO é org-scoped na RLS
-- (policies qual=true — dívida separada, fora deste escopo), a checagem de org
-- é feita por JOIN explícito purchase_orders → organization_members do membro.
--
-- Companheiro de código (mesma tarefa, já aplicado no working tree):
--   • receiptService.createReceipt já persiste o PATH (photo_path) — sem mudança.
--   • SupplyChainOrderDetails.tsx: leitura trocada de storageService.getPublicUrl
--     para signed URL (15min) resolvida em estado (receiptPhotoUrls).
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE.
-- ============================================================

DROP POLICY IF EXISTS "Public Receipt Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Receipt Upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Receipt Update" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Receipt Delete" ON storage.objects;

CREATE POLICY "receipts_select_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.organization_members om ON om.organization_id = po.organization_id
      WHERE po.id::text = (storage.foldername(name))[1]
        AND om.email = auth.jwt() ->> 'email'
    )
  );

CREATE POLICY "receipts_insert_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.organization_members om ON om.organization_id = po.organization_id
      WHERE po.id::text = (storage.foldername(name))[1]
        AND om.email = auth.jwt() ->> 'email'
    )
  );

CREATE POLICY "receipts_update_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.organization_members om ON om.organization_id = po.organization_id
      WHERE po.id::text = (storage.foldername(name))[1]
        AND om.email = auth.jwt() ->> 'email'
    )
  );

CREATE POLICY "receipts_delete_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.organization_members om ON om.organization_id = po.organization_id
      WHERE po.id::text = (storage.foldername(name))[1]
        AND om.email = auth.jwt() ->> 'email'
    )
  );

UPDATE storage.buckets SET public = false WHERE id = 'receipts';
