-- ============================================================
-- Migration: 20270208000007_purchase_orders_enable_rls.sql
-- Parte 2/2 do fix do purchase_orders (ver project_rls_authenticated_layer_gap).
--
-- ⚠️ ORDEM OBRIGATÓRIA — APLICAR SOMENTE APÓS o deploy do código que roteia a
--    leitura de orders do Portal do Cliente (token) pela RPC fn_portal_get_orders
--    (clientPortalService.getOrdersByToken + ClientArea). Se aplicar ANTES do
--    deploy, o portal do cliente (token/anon) para de ler purchase_orders e o
--    progresso financeiro do cliente zera silenciosamente.
--
-- Estado corrigido: purchase_orders estava com RLS DESLIGADA (relrowsecurity=
-- false) → tabela 100% aberta (qualquer um, anon inclusive, lia/escrevia/apagava
-- PO de qualquer empresa). As 3 policies qual=true eram letra morta.
--
-- Consumidores mapeados (definem o multi-branch):
--   • Internos: membros da org do projeto da PO (maioria).
--   • Fornecedor logado (SupplierDashboard): lê E escreve (updateOrder) as
--     próprias POs — NÃO é membro da org. Branch por suppliers.email = jwt email.
--   • Cliente (Portal por token/anon): lê via RPC DEFINER (parte 1) — não hita
--     esta policy. Cliente autenticado (se existir) que leia PO direto vai
--     receber vazio → progresso subestimado (falha SEGURA, não vazamento);
--     validar em staging e, se necessário, adicionar branch de cliente depois.
--
-- Escopo de org por project_id→projects.organization_id→organization_members
-- (project_id sempre presente; organization_id da PO tinha nulos, já backfillados).
-- ============================================================

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated select on purchase_orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Allow authenticated insert on purchase_orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Allow authenticated delete on purchase_orders" ON public.purchase_orders;

-- SELECT: membro da org (via projeto) OU o próprio fornecedor da PO
CREATE POLICY "po_select_org_or_supplier" ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = purchase_orders.project_id
        AND om.email = auth.jwt() ->> 'email'
    )
    OR EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id = purchase_orders.supplier_id
        AND lower(s.email) = lower(auth.jwt() ->> 'email')
    )
  );

-- INSERT: só membro da org (comprador cria a PO; fornecedor não cria)
CREATE POLICY "po_insert_org" ON public.purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = purchase_orders.project_id
        AND om.email = auth.jwt() ->> 'email'
    )
  );

-- UPDATE: membro da org OU o próprio fornecedor (SupplierDashboard.updateOrder)
CREATE POLICY "po_update_org_or_supplier" ON public.purchase_orders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = purchase_orders.project_id
        AND om.email = auth.jwt() ->> 'email'
    )
    OR EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id = purchase_orders.supplier_id
        AND lower(s.email) = lower(auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = purchase_orders.project_id
        AND om.email = auth.jwt() ->> 'email'
    )
    OR EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id = purchase_orders.supplier_id
        AND lower(s.email) = lower(auth.jwt() ->> 'email')
    )
  );

-- DELETE: só membro da org
CREATE POLICY "po_delete_org" ON public.purchase_orders
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = purchase_orders.project_id
        AND om.email = auth.jwt() ->> 'email'
    )
  );
