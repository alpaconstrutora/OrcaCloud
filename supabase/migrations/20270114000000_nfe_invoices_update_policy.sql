-- ============================================================
-- Fiscal & Custos — Policy de UPDATE faltante em nfe_invoices
--
-- A tabela nfe_invoices tinha RLS habilitado só com policy de SELECT
-- (nfe_invoices_select, migration 20260519000001). Sem policy de
-- UPDATE, qualquer .update() feito pelo client (nfeService.ts:
-- approveNfeInvoice, linkTransactionToInvoice, createOrderFromNfe)
-- é silenciosamente bloqueado pelo Postgres (0 linhas afetadas), e o
-- .select().single() encadeado falha com
-- "Cannot coerce the result to a single JSON object".
-- ============================================================

CREATE POLICY nfe_invoices_update ON public.nfe_invoices FOR UPDATE
  USING (fiscal_member_of(organization_id))
  WITH CHECK (fiscal_member_of(organization_id));
