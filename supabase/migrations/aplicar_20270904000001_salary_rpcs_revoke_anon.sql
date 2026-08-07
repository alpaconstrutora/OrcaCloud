-- ============================================================================
-- Correção de aplicação: fechar as RPCs do Histórico Salarial para anon
-- Plano: docs/planos/2026-08-07-rh-colaborador-historico-salarial.md
--
-- A migration aplicar_20270904000000 fez REVOKE ALL ... FROM PUBLIC + GRANT
-- EXECUTE TO authenticated, achando que isso bastava. NÃO basta: no Supabase o
-- papel `anon` recebe grant PRÓPRIO por ALTER DEFAULT PRIVILEGES, que sobrevive
-- ao revoke de PUBLIC. Medido em 2026-08-07 com a chave anon:
--
--   POST /rpc/fn_sync_employee_current_salary  -> 42501 permission denied for
--        table employee_salary_history   (ou seja: EXECUTOU, e só parou na tabela)
--   POST /rpc/fn_register_salary_change        -> P0001 "Colaborador ... não
--        encontrado"                     (ou seja: EXECUTOU o corpo inteiro)
--
-- Não houve exposição de dado — as duas são SECURITY INVOKER e a RLS/grant de
-- employee_salary_history barrou —, mas a superfície não deve existir.
-- ============================================================================

REVOKE ALL ON FUNCTION public.fn_sync_employee_current_salary(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.fn_register_salary_change(
    UUID, DATE, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, NUMERIC, TEXT) FROM anon;

-- Reafirma o alvo certo (idempotente).
GRANT EXECUTE ON FUNCTION public.fn_sync_employee_current_salary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_register_salary_change(
    UUID, DATE, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, NUMERIC, TEXT) TO authenticated;

-- ============================================================================
-- Verificação (depois de aplicar), com a chave ANON:
--   POST /rest/v1/rpc/fn_sync_employee_current_salary
--        {"p_employee_id":"00000000-0000-0000-0000-000000000000"}
--   Esperado: 42501 "permission denied for function ..." — e NÃO mais o erro da
--   tabela, que provava que a função tinha rodado.
--
-- Em SQL:
--   SELECT proname, proacl FROM pg_proc
--    WHERE proname IN ('fn_register_salary_change','fn_sync_employee_current_salary');
--   proacl não pode conter uma entrada `anon=X/...`.
-- ============================================================================
