-- ==========================================================================
-- Gestão de Dívidas · Fechar as RPCs para anon
-- Date: 2026-08-29
-- Altera: grants das funções fn_debt_*
-- Plano: docs/planos/2026-08-29-gestao-dividas-financiamentos.md
-- ==========================================================================
-- CONTEXTO — defeito meu, achado na conferência de 29/08.
--
-- As migrations ...000001 e ...000004 fizeram, para cada função nova:
--     REVOKE ALL ON FUNCTION ... FROM PUBLIC;
--     GRANT EXECUTE ON FUNCTION ... TO authenticated;
--
-- E mesmo assim `has_function_privilege('anon', oid, 'EXECUTE')` continuava
-- `true`. Motivo: o Supabase mantém
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS
--       TO anon, authenticated, service_role;
-- ou seja, toda função nova nasce com grant **explícito** para `anon`.
-- `REVOKE ... FROM PUBLIC` não remove grant explícito de um papel nomeado.
--
-- É exatamente a mesma armadilha que a ...000001 já documentava para TABELAS
-- ("revogar de PUBLIC sozinho não fecha") — e que eu não apliquei às FUNÇÕES.
--
-- O QUE ISSO EXPUNHA, medido e não suposto (29/08, com `SET LOCAL ROLE anon`):
--   · `debt_contracts`             -> permission denied for table
--   · `debt_installments`          -> permission denied for table
--   · `vw_debt_open_installments`  -> permission denied for view
--   · `vw_debt_by_target`          -> permission denied for view
--   · `vw_fpa_cashflow_projection` -> permission denied for view
-- Nenhum dado vazou: as tabelas e views estavam corretamente revogadas, e a
-- função morria com 42501 ao tocá-las. O que sobrava era uma RPC **chamável**
-- por anon que respondia erro de permissão em vez de não existir — superfície
-- desnecessária, e violação da regra da casa "RPC nova = REVOKE de anon".
--
-- ⚠️ ESCOPO: só as funções deste módulo. A varredura mostrou que
-- `fn_dre_summary`, `fn_dre_spe_summary`, `fn_opura_pivot` e
-- `fn_contract_guarantees_expiring` têm o MESMO grant a anon, de antes deste
-- trabalho. Não mexo nelas aqui sem decisão do usuário: algumas RPCs do sistema
-- são SECURITY DEFINER e chamadas pelos portais públicos justamente como anon,
-- e revogar em lote sem separar as duas famílias derrubaria portal.
--
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

DO $$
DECLARE
    r RECORD;
    n INT := 0;
BEGIN
    -- Varre por nome em vez de listar assinatura a assinatura: assinatura
    -- copiada à mão é onde o REVOKE erra de alvo e passa despercebido.
    FOR r IN
        SELECT p.oid::regprocedure AS assinatura
          FROM pg_proc p
          JOIN pg_namespace ns ON ns.oid = p.pronamespace
         WHERE ns.nspname = 'public'
           AND p.proname LIKE 'fn_debt\_%'
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon;', r.assinatura);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC;', r.assinatura);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated;', r.assinatura);
        n := n + 1;
    END LOOP;

    IF n = 0 THEN
        RAISE EXCEPTION 'ABORTADO: nenhuma funcao fn_debt_* encontrada (rode aplicar_20270915000004 antes).';
    END IF;

    RAISE NOTICE '>>> % funcao(oes) fn_debt_* fechadas para anon.', n;
END $$;

-- ==========================================================================
-- Conferência
-- ==========================================================================
-- a. Nenhuma função do módulo executável por anon:
-- SELECT p.proname,
--        has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_pode,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ok
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND p.proname LIKE 'fn_debt\_%'
--  ORDER BY 1;
--    -> esperado: anon_pode = f e auth_ok = t em TODAS
--
-- b. O app continua funcionando (a RPC responde para authenticated):
-- SELECT * FROM public.fn_debt_position(NULL, CURRENT_DATE);
--    -> esperado: 1 linha
--
-- c. As tabelas/views seguem fechadas (não era isso que estava furado, mas é
--    o que de fato protege o dado):
-- BEGIN; SET LOCAL ROLE anon;
--   SELECT COUNT(*) FROM public.debt_contracts;   -- 42501
-- ROLLBACK;
-- ==========================================================================
-- FIM: aplicar_20270915000006_debt_revoke_anon_functions.sql
-- ==========================================================================
