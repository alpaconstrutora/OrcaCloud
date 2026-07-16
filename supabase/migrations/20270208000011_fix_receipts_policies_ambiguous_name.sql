-- ============================================================
-- Migration: 20270208000011_fix_receipts_policies_ambiguous_name.sql
-- CORREÇÃO das policies de `receipts` criadas em 20270208000005.
--
-- Bug: dentro do EXISTS, `(storage.foldername(name))[1]` — o `name` não
-- qualificado ligava-se a `organization_members.name` (a única coluna `name`
-- no escopo do subquery), não a `storage.objects.name`. Resultado:
-- `po.id::text = (storage.foldername(om.name))[1]` NUNCA era verdadeiro →
-- as 4 policies de receipts jamais casavam → membros da org ficavam SEM
-- acesso (leitura/escrita) às fotos de comprovante desde a 005. (Não deu erro
-- 42702 na 005 porque só uma tabela do subquery tinha `name`; ficou o bind
-- silencioso e errado. O invoices, com suppliers.name + om.name, expôs o
-- problema como erro de ambiguidade.)
--
-- Correção: qualificar `storage.objects.name` (correlaciona à linha da policy).
-- Path = "{orderId}/receipt_{ts}_{arquivo}" → foldername[1] = orderId.
-- Idempotente: DROP + CREATE.
-- ============================================================

DROP POLICY IF EXISTS "receipts_select_org" ON storage.objects;
DROP POLICY IF EXISTS "receipts_insert_org" ON storage.objects;
DROP POLICY IF EXISTS "receipts_update_org" ON storage.objects;
DROP POLICY IF EXISTS "receipts_delete_org" ON storage.objects;

CREATE POLICY "receipts_select_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND EXISTS (
      SELECT 1 FROM public.purchase_orders po
      JOIN public.organization_members om ON om.organization_id = po.organization_id
      WHERE po.id::text = (storage.foldername(storage.objects.name))[1]
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
      WHERE po.id::text = (storage.foldername(storage.objects.name))[1]
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
      WHERE po.id::text = (storage.foldername(storage.objects.name))[1]
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
      WHERE po.id::text = (storage.foldername(storage.objects.name))[1]
        AND om.email = auth.jwt() ->> 'email'
    )
  );
