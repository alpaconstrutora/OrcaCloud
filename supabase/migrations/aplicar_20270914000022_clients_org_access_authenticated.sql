-- ==========================================================================
-- Fase 4 (complemento) — `clients_org_access` sai de PUBLIC
-- ==========================================================================
-- Plano: docs/planos/2026-08-28-organization-id-dono-explicito-e-compartilhamento.md
--
-- A 000021 fechou as policies de `clients` que estavam em PUBLIC, mas
-- `clients_org_access` (FOR ALL, criada antes) continuou com `polroles = {0}`.
--
-- Ela NÃO é explorável pelo `anon`: a expressão é
--   organization_id IN (SELECT organization_id FROM organization_members
--                        WHERE user_id = auth.uid())
-- e `auth.uid()` é nulo sem sessão, então a subconsulta não devolve nada.
-- Mesmo assim ela é recriada para `authenticated`: uma policy em PUBLIC numa
-- tabela de dados de cliente é achado permanente em qualquer auditoria de RLS,
-- e o critério do plano é que nenhuma dessas três tabelas tenha `polroles={0}`.
--
-- ⚠️ Ela usa `organization_members.user_id`, enquanto as policies novas usam
--    `is_org_member()`, que aceita `user_id` E e-mail legado E corretor. Como as
--    policies permissivas se somam (OR), manter esta não restringe ninguém —
--    ela só deixou de ser redundante com um risco cosmético junto.
--
-- ⚠️ APLICAR À MÃO — NUNCA `supabase db push`.
-- ==========================================================================

SET lock_timeout = '5s';

DROP POLICY IF EXISTS "clients_org_access" ON public.clients;

CREATE POLICY "clients_org_access"
ON public.clients FOR ALL TO authenticated
USING (
  organization_id IN (
    SELECT organization_members.organization_id
      FROM public.organization_members
     WHERE organization_members.user_id = auth.uid()
  )
);

NOTIFY pgrst, 'reload schema';

-- ── CONFERÊNCIA ────────────────────────────────────────────────────────────
-- Nenhuma policy das três tabelas em PUBLIC. Esperado: 0 linhas
-- SELECT c.relname, p.polname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
--  WHERE c.relname IN ('suppliers','clients','partner_workspaces')
--    AND p.polroles::text = '{0}';

-- ==========================================================================
-- FIM: aplicar_20270914000022_clients_org_access_authenticated.sql
-- ==========================================================================
