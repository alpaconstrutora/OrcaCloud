-- ============================================================
-- Portal do Corretor — REVOKE de PUBLIC nas RPCs do link + políticas de leads
-- Plano: docs/planos/2026-10-17-portal-corretor-pendencias.md (F1, item 1.1)
-- Pedido (17/10/2026): "corrigir os 3 itens" (item 1: RPCs com EXECUTE para PUBLIC)
--
-- REGRA #7, pergunta 2 — "quem mais pode executar esta função?": três RPCs do
-- link do corretor ainda tinham EXECUTE para PUBLIC (`=X` no proacl), o default
-- do PostgreSQL que GRANT não revoga. Ficam só com anon (link) e authenticated
-- (login por e-mail, que reaproveita a casca do link) — a autorização de verdade
-- é o token, conferido dentro de cada função (SECURITY DEFINER).
--
-- REGRA #7, pergunta 1 — "esta perna do OR sozinha basta?": em
-- broker_portal_leads a perna `broker_email = (auth.jwt() ->> 'email')` sozinha
-- deixava QUALQUER conta autenticada do SaaS gravar (e ler/alterar) lead em
-- qualquer organização, bastando pôr o próprio e-mail. A tabela estava vazia e
-- nenhum código a usava; o corretor passa a gravar só pelas RPCs do token (F3),
-- então as políticas ficam com o membro da organização e o superadmin.
-- ============================================================

SET lock_timeout = '5s';

-- ── 1. RPCs do link sem PUBLIC ──────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.fn_broker_portal_get_units(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_broker_portal_get_commissions(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.broker_portal_get_data(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_broker_portal_get_units(TEXT) TO anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_broker_portal_get_commissions(TEXT) TO anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.broker_portal_get_data(TEXT) TO anon, authenticated;

-- ── 2. broker_portal_leads sem a perna do e-mail ────────────────────────────
DROP POLICY IF EXISTS broker_leads_insert ON public.broker_portal_leads;
DROP POLICY IF EXISTS broker_leads_select ON public.broker_portal_leads;
DROP POLICY IF EXISTS broker_leads_update ON public.broker_portal_leads;

CREATE POLICY broker_leads_select ON public.broker_portal_leads
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id) OR public.is_superadmin());

CREATE POLICY broker_leads_insert ON public.broker_portal_leads
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id) OR public.is_superadmin());

CREATE POLICY broker_leads_update ON public.broker_portal_leads
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id) OR public.is_superadmin())
    WITH CHECK (public.is_org_member(organization_id) OR public.is_superadmin());
