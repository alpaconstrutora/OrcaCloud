-- ============================================================
-- Migration: 20270208000013_rls_authenticated_supplychain_batch2a.sql
-- Projeto RLS camada AUTHENTICATED — LOTE 2a: tabelas do supply-chain que
-- derivam a org via order_id → purchase_orders (que já tem RLS multi-branch
-- desde a 20270208000007). Fecha cross-tenant (policies authenticated qual=true
-- "authenticated_*" → qualquer logado lia/escrevia recebimentos/divergências/
-- notificações de qualquer empresa).
--
-- Padrão: `order_id IN (SELECT id FROM public.purchase_orders)`. A subquery
-- aplica a RLS de purchase_orders → o usuário só enxerga POs da sua org OU as
-- do próprio fornecedor (branch de PO). Assim o escopo (org + fornecedor)
-- propaga de graça para recebimentos etc. purchase_receipt_items encadeia via
-- purchase_receipts (que por sua vez já filtra via order→PO).
--
-- Verificado: order_id sempre presente (notification_log 0 nulos); consumidores
-- internos (receiptService/matchService/discrepancyService); sem portal direto.
-- Sem companheiro de código, sem dependência de ordem (RLS puro).
-- ============================================================

DROP POLICY IF EXISTS "authenticated_receipts" ON public.purchase_receipts;
CREATE POLICY "purchase_receipts_via_order" ON public.purchase_receipts
  FOR ALL TO authenticated
  USING (order_id IN (SELECT id FROM public.purchase_orders))
  WITH CHECK (order_id IN (SELECT id FROM public.purchase_orders));

DROP POLICY IF EXISTS "authenticated_receipt_items" ON public.purchase_receipt_items;
CREATE POLICY "purchase_receipt_items_via_receipt" ON public.purchase_receipt_items
  FOR ALL TO authenticated
  USING (receipt_id IN (SELECT id FROM public.purchase_receipts))
  WITH CHECK (receipt_id IN (SELECT id FROM public.purchase_receipts));

DROP POLICY IF EXISTS "authenticated_discrepancies" ON public.purchase_discrepancies;
CREATE POLICY "purchase_discrepancies_via_order" ON public.purchase_discrepancies
  FOR ALL TO authenticated
  USING (order_id IN (SELECT id FROM public.purchase_orders))
  WITH CHECK (order_id IN (SELECT id FROM public.purchase_orders));

DROP POLICY IF EXISTS "authenticated_notification_log" ON public.notification_log;
CREATE POLICY "notification_log_via_order" ON public.notification_log
  FOR ALL TO authenticated
  USING (order_id IN (SELECT id FROM public.purchase_orders))
  WITH CHECK (order_id IN (SELECT id FROM public.purchase_orders));
