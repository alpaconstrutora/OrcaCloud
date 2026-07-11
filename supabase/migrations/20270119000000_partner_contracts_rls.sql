-- ============================================================
-- Migration: 20270119000000_partner_contracts_rls.sql
-- Conecta Suprimentos > Contratos ao Portal do Parceiro
--
-- A aba "Contratos" do Portal do Parceiro (PartnerPortal.tsx) já
-- consulta a tabela public.contracts filtrando por supplier_id, mas
-- a tabela só tinha policy de leitura para membros da organização
-- (is_org_member). Um parceiro externo autenticado (role authenticated,
-- não organization_member) caía fora de toda policy e via a lista
-- sempre vazia, silenciosamente. Esta migration adiciona uma policy
-- adicional (permissiva, somativa via OR) restrita ao próprio
-- fornecedor do parceiro, no mesmo padrão já usado para
-- opura_documents/storage.objects em 20261219000000.
-- ============================================================

DROP POLICY IF EXISTS "contracts_select_partner" ON public.contracts;
CREATE POLICY "contracts_select_partner" ON public.contracts
  FOR SELECT TO authenticated
  USING (
    supplier_id IN (
      SELECT pw.supplier_id FROM public.partner_workspaces pw
      JOIN public.partner_users pu ON pu.partner_workspace_id = pw.id
      WHERE pu.email = auth.jwt() ->> 'email' AND pu.is_active = TRUE AND pw.is_active = TRUE
    )
  );
