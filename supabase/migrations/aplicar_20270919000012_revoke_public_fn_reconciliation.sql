-- ==========================================================================
-- REVOKE PUBLIC/anon nas funções SQL da conciliação bancária e do fechamento
-- Date: 2026-09-05 · Plano: docs/planos/2026-09-05-conciliacao-bancaria-plano-execucao.md (item 1.7)
-- ==========================================================================
-- CONTEXTO
-- As oito funções abaixo nasceram antes da REGRA #7 (prefixo 20270918) e ficaram
-- com a ACL padrão do PostgreSQL: `=X/postgres` (PUBLIC) e `anon=X`. Medido em
-- produção em 05/09/2026. São SECURITY INVOKER, então a RLS as esvazia para o
-- anônimo — risco prático baixo — mas é exatamente o padrão que a auditoria de
-- 2026-09-01 mandou fechar, e `fn_close_period`/`fn_reopen_period` ESCREVEM.
--
-- Assinaturas conferidas em pg_proc antes de escrever (ver plano). dashboard e
-- consolidated já receberam o REVOKE em 20270919000011 ao serem recriadas;
-- repetir aqui é inofensivo e deixa o conjunto completo num só lugar.
--
-- Prova: SELECT p.oid::regprocedure, p.proacl FROM pg_proc p ... — não pode
-- restar `anon=X` nem `=X/` nas oito. `bash scripts/check-rls-postura.sh` também.
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`) — NUNCA `supabase db push`.
-- ==========================================================================

REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_dashboard(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconciliation_dashboard(uuid, date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_consolidated(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconciliation_consolidated(uuid, date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_divergences(uuid, date, integer, numeric, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconciliation_divergences(uuid, date, integer, numeric, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_anomalies(uuid, date, integer, integer, numeric, numeric, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconciliation_anomalies(uuid, date, integer, integer, numeric, numeric, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_period_is_closed(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_period_is_closed(uuid, date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_financial_close_checklist(uuid, integer, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_financial_close_checklist(uuid, integer, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_close_period(uuid, integer, integer, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_close_period(uuid, integer, integer, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_reopen_period(uuid, integer, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reopen_period(uuid, integer, integer) TO authenticated;

-- A trigger de período fechado é chamada pelo Postgres, não pelo cliente; não entra aqui.
