-- aplicar_20271125913700_portal_tokens_so_gestor_grava.sql
--
-- Links do Portal do Cliente (client_portal_tokens) e do Portal do Colaborador
-- (portal_tokens): gravar direto pela API só owner/admin da organização.
-- Pedido 25/11/2026 (sessão 9f7567f5-eb4c-4754-b44f-4c4b4ce8c3c1): resposta "sim"
-- a "leitura continuaria liberada para quem já vê a tela; criar, alterar ou
-- apagar link de portal ficaria só para owner e admin".
-- Prova: scripts/teste-portal-tokens-so-gestor-grava.sql.
--
-- Antes: uma policy ALL por tabela, `org_id IN (SELECT minhas_orgs_membro())`
-- (aplicar_20271112710000) — QUALQUER membro da org lia, desativava e APAGAVA
-- o link de portal de qualquer cliente/colaborador pela API (provado 25/11 num
-- BEGIN…ROLLBACK: membro rebaixado a viewer apagou os 7 links da org). O
-- visitante do portal (anon) já era recusado (sem GRANT) e continua.
--
-- Depois:
--   SELECT  → membro da org (igual a antes: a lista de clientes e a tela do RH leem).
--   INSERT / UPDATE / DELETE → owner/admin da org (minhas_orgs_gestor), a mesma
--   regra que client_portal_generate_token / portal_generate_token já aplicam
--   (is_org_manager). UPDATE confere a org antiga (USING) e a nova (WITH CHECK).
--
-- Quem grava hoje: só as telas (revogar = UPDATE is_active=false) e funções
-- SECURITY DEFINER (gerar, validar, tocar last_used_at), que não passam por RLS.
-- Conferido 25/11: nenhuma função INVOKER grava nessas tabelas; sem gatilhos.
--
-- Forma de conjunto (`IN (SELECT minhas_orgs_*())`), não is_org_manager(org_id)
-- por linha — ver #382.
--
-- Aplicar com `npx supabase db query --linked -f` — nunca `db push`.
--
-- Rollback (volta à policy única de membro):
--   DROP POLICY IF EXISTS client_portal_tokens_select ON public.client_portal_tokens;
--   DROP POLICY IF EXISTS client_portal_tokens_insert_gestor ON public.client_portal_tokens;
--   DROP POLICY IF EXISTS client_portal_tokens_update_gestor ON public.client_portal_tokens;
--   DROP POLICY IF EXISTS client_portal_tokens_delete_gestor ON public.client_portal_tokens;
--   CREATE POLICY client_portal_tokens_org_access ON public.client_portal_tokens
--       USING (COALESCE(org_id IN (SELECT public.minhas_orgs_membro()), false));
--   (idem para portal_tokens / portal_tokens_org_access)

-- ── Portal do Cliente ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS client_portal_tokens_org_access   ON public.client_portal_tokens;
DROP POLICY IF EXISTS client_portal_tokens_select        ON public.client_portal_tokens;
DROP POLICY IF EXISTS client_portal_tokens_insert_gestor ON public.client_portal_tokens;
DROP POLICY IF EXISTS client_portal_tokens_update_gestor ON public.client_portal_tokens;
DROP POLICY IF EXISTS client_portal_tokens_delete_gestor ON public.client_portal_tokens;

CREATE POLICY client_portal_tokens_select ON public.client_portal_tokens
    FOR SELECT TO authenticated
    USING (org_id IN (SELECT public.minhas_orgs_membro()));

CREATE POLICY client_portal_tokens_insert_gestor ON public.client_portal_tokens
    FOR INSERT TO authenticated
    WITH CHECK (org_id IN (SELECT public.minhas_orgs_gestor()));

CREATE POLICY client_portal_tokens_update_gestor ON public.client_portal_tokens
    FOR UPDATE TO authenticated
    USING      (org_id IN (SELECT public.minhas_orgs_gestor()))
    WITH CHECK (org_id IN (SELECT public.minhas_orgs_gestor()));

CREATE POLICY client_portal_tokens_delete_gestor ON public.client_portal_tokens
    FOR DELETE TO authenticated
    USING (org_id IN (SELECT public.minhas_orgs_gestor()));

-- ── Portal do Colaborador (RH) ──────────────────────────────────────────────
DROP POLICY IF EXISTS portal_tokens_org_access   ON public.portal_tokens;
DROP POLICY IF EXISTS portal_tokens_select        ON public.portal_tokens;
DROP POLICY IF EXISTS portal_tokens_insert_gestor ON public.portal_tokens;
DROP POLICY IF EXISTS portal_tokens_update_gestor ON public.portal_tokens;
DROP POLICY IF EXISTS portal_tokens_delete_gestor ON public.portal_tokens;

CREATE POLICY portal_tokens_select ON public.portal_tokens
    FOR SELECT TO authenticated
    USING (org_id IN (SELECT public.minhas_orgs_membro()));

CREATE POLICY portal_tokens_insert_gestor ON public.portal_tokens
    FOR INSERT TO authenticated
    WITH CHECK (org_id IN (SELECT public.minhas_orgs_gestor()));

CREATE POLICY portal_tokens_update_gestor ON public.portal_tokens
    FOR UPDATE TO authenticated
    USING      (org_id IN (SELECT public.minhas_orgs_gestor()))
    WITH CHECK (org_id IN (SELECT public.minhas_orgs_gestor()));

CREATE POLICY portal_tokens_delete_gestor ON public.portal_tokens
    FOR DELETE TO authenticated
    USING (org_id IN (SELECT public.minhas_orgs_gestor()));
