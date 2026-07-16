-- ============================================================
-- Migration: 20270208000010_storage_fase1_invoices_private.sql
-- Fase 1 (última) do PLANO_STORAGE_PRIVATIZACAO.md — privatiza `invoices`
-- (NF do fornecedor anexada em Contas a Pagar; 15 objetos).
--
-- ⚠️ ORDEM: aplicar APÓS o deploy do código (invoiceService.getInvoiceUrl virou
--    async/signed + openInvoice; 4 anchors em ContasPagarManager/InvoiceManager/
--    SupplyChainOrderDetails viraram onClick). Se aplicar antes, "Ver documento"
--    para de abrir.
--
-- Exposição anterior (a pior de todas): 6 policies redundantes, TODAS abertas
-- (role public/anon), incluindo "Acesso total storage invoices" (public, ALL) →
-- qualquer um lia/escrevia/apagava qualquer NF. Nenhuma era org-scoped.
-- Verificado que NÃO há upload anon real de invoice (InvoiceManager e
-- SupplyChainOrderDetails são autenticados; nenhuma edge/token sobe invoice) →
-- as policies anon eram cruft; substituídas por multi-branch autenticado.
--
-- Path = "{supplier_id}/{ts}_{arquivo}" → foldername[1] = supplier_id.
-- Multi-branch (mesmo padrão do purchase_orders):
--   • Interno: membro da org do fornecedor (suppliers.organization_id).
--   • Fornecedor logado (InvoiceManager no SupplierDashboard): sobe/vê/limpa as
--     próprias NFs — não é membro da org. Branch por suppliers.email = jwt email.
-- invoiceService persiste o PATH (file_path), sem URL persistida para quebrar.
-- ============================================================

DROP POLICY IF EXISTS "Acesso total storage invoices" ON storage.objects;
DROP POLICY IF EXISTS "Exclusao publica invoices" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads to invoices" ON storage.objects;
DROP POLICY IF EXISTS "Upload publico invoices" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read of invoices" ON storage.objects;
DROP POLICY IF EXISTS "Leitura publica invoices" ON storage.objects;

-- Predicado reutilizado: membro da org do fornecedor OU o próprio fornecedor.
-- (foldername[1] = supplier_id)
CREATE POLICY "invoices_select_org_or_supplier" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (
      EXISTS (
        SELECT 1 FROM public.suppliers s
        JOIN public.organization_members om ON om.organization_id = s.organization_id
        WHERE s.id::text = (storage.foldername(name))[1]
          AND om.email = auth.jwt() ->> 'email'
      )
      OR EXISTS (
        SELECT 1 FROM public.suppliers s
        WHERE s.id::text = (storage.foldername(name))[1]
          AND lower(s.email) = lower(auth.jwt() ->> 'email')
      )
    )
  );

CREATE POLICY "invoices_insert_org_or_supplier" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoices'
    AND (
      EXISTS (
        SELECT 1 FROM public.suppliers s
        JOIN public.organization_members om ON om.organization_id = s.organization_id
        WHERE s.id::text = (storage.foldername(name))[1]
          AND om.email = auth.jwt() ->> 'email'
      )
      OR EXISTS (
        SELECT 1 FROM public.suppliers s
        WHERE s.id::text = (storage.foldername(name))[1]
          AND lower(s.email) = lower(auth.jwt() ->> 'email')
      )
    )
  );

CREATE POLICY "invoices_update_org_or_supplier" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (
      EXISTS (
        SELECT 1 FROM public.suppliers s
        JOIN public.organization_members om ON om.organization_id = s.organization_id
        WHERE s.id::text = (storage.foldername(name))[1]
          AND om.email = auth.jwt() ->> 'email'
      )
      OR EXISTS (
        SELECT 1 FROM public.suppliers s
        WHERE s.id::text = (storage.foldername(name))[1]
          AND lower(s.email) = lower(auth.jwt() ->> 'email')
      )
    )
  );

-- DELETE: org OU fornecedor (invoiceService faz cleanup do arquivo se o insert
-- no banco falhar, rodando como o próprio uploader).
CREATE POLICY "invoices_delete_org_or_supplier" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (
      EXISTS (
        SELECT 1 FROM public.suppliers s
        JOIN public.organization_members om ON om.organization_id = s.organization_id
        WHERE s.id::text = (storage.foldername(name))[1]
          AND om.email = auth.jwt() ->> 'email'
      )
      OR EXISTS (
        SELECT 1 FROM public.suppliers s
        WHERE s.id::text = (storage.foldername(name))[1]
          AND lower(s.email) = lower(auth.jwt() ->> 'email')
      )
    )
  );

UPDATE storage.buckets SET public = false WHERE id = 'invoices';
