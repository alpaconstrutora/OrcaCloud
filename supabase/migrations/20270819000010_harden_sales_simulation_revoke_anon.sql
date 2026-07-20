-- ==========================================================================
-- Hardening: fn_validate_sales_simulation e fn_sales_simulation_checks
-- eram executáveis via anon apesar do GRANT ser só para `authenticated`.
-- Date: 2026-07-20
-- ==========================================================================
-- Achado testando com a anon key (mesmo padrão de
-- feedback_rpc_revoke_public_default.md): neste projeto, `GRANT ... TO
-- authenticated` sozinho NÃO bloqueia `anon` — é preciso REVOKE explícito
-- de PUBLIC *e* de anon.
--
-- `fn_validate_sales_simulation` nunca teve nenhum REVOKE desde sua criação
-- original (20270717000000) — estava anon-executável desde o início, ainda
-- que a intenção documentada fosse "só authenticated". A checagem interna
-- `is_org_member` ainda protegia o dado real (retorna falso para anon,
-- RAISE EXCEPTION antes de expor qualquer regra do plano), mas a chamada em
-- si não deveria nem ser possível para o role anon.
--
-- `fn_sales_simulation_checks` (criada agora em 20270819000009) já tinha
-- `REVOKE ALL ... FROM PUBLIC`, mas isso sozinho também não bastou — mesmo
-- comportamento. Reforça com REVOKE explícito de anon nas duas.
--
-- Só REVOKE/GRANT (sem alterar corpo de função nem tabela) — aplicar tudo de
-- uma vez no SQL Editor. NUNCA `supabase db push`.
-- ==========================================================================

REVOKE ALL ON FUNCTION public.fn_validate_sales_simulation(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_validate_sales_simulation(UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_validate_sales_simulation(UUID, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_sales_simulation_checks(public.sales_plans, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_sales_simulation_checks(public.sales_plans, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_sales_simulation_checks(public.sales_plans, JSONB) TO authenticated;
