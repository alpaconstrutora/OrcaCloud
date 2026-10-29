-- ============================================================
-- BI Executivo — fn_bi_executive / fn_bi_trend sem EXECUTE para anon
-- OrçaCloud SaaS · Migration 20271030100000
--
-- As duas funções tinham a ACL padrão do PostgreSQL ({=X/postgres, anon=X, …}):
-- PUBLIC e anon executavam. Não vazava dado — são de INVOKER e, sem sessão,
-- auth.uid() é NULL e a lista de organizações do usuário sai vazia —, mas a
-- REGRA #7 do CLAUDE.md pede o REVOKE em toda função, e a única chamada legítima
-- é o biService do front, com sessão (authenticated). Anotado no fechamento do
-- plano docs/planos/2026-10-28-dashboard-rh-numeros-e-paineis.md; o usuário
-- pediu "Corrigir" em 29/10/2026.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.fn_bi_executive(uuid, date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_bi_executive(uuid, date, date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_bi_trend(uuid, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_bi_trend(uuid, integer) TO authenticated;
