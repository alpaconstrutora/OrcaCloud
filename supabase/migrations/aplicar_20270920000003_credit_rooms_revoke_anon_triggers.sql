-- ==========================================================================
-- Portal de Crédito · Credit Room — REVOKE de anon nas funções de trigger
-- Date: 2026-09-07
-- Corrige: aplicar_20270920000001_credit_rooms.sql
-- Plano: docs/planos/2026-09-07-portal-credito-credit-room.md
-- ==========================================================================
-- O DEFEITO
-- A ...000001 escreveu, para as duas funções de TRIGGER:
--
--     REVOKE ALL ON FUNCTION public.fn_credit_room_numerar() FROM PUBLIC;
--
-- e para as cinco funções de ACESSO:
--
--     REVOKE ALL ON FUNCTION public.is_credit_room_member(uuid) FROM PUBLIC, anon;
--
-- Só as cinco ficaram certas. Conferido no banco logo depois de aplicar:
--
--     fn_credit_room_numerar           → anon=X/postgres   ← anon executa
--     fn_credit_room_version_imutavel  → anon=X/postgres   ← anon executa
--     is_credit_room_member (e as 4)   → sem anon          ← correto
--
-- É a Pergunta 2 da REGRA OBRIGATÓRIA #7, no seu segundo andar: o
-- `ALTER DEFAULT PRIVILEGES` do Supabase concede EXECUTE a `anon` em toda
-- função nova, como um grant EXPLÍCITO. `REVOKE ... FROM PUBLIC` remove o
-- grant de PUBLIC e não toca no de `anon` — os dois são entradas diferentes
-- na ACL. Só `FROM PUBLIC, anon` fecha os dois.
--
-- POR QUE O MÓDULO DÍVIDA NÃO TEM O PROBLEMA (e por que isso engana)
-- `fn_debt_touch` e `fn_debt_allocations_soma_100` foram escritas com o mesmo
-- `FROM PUBLIC` incompleto, e mesmo assim hoje aparecem sem `anon`. Não é que
-- o padrão delas seja melhor — é que a varredura
-- `aplicar_20270916000001_revoke_anon_rpcs_internas.sql` passou depois e
-- limpou. Copiar o padrão daquele arquivo, como foi feito, herdava o defeito
-- sem herdar a limpeza.
--
-- O RISCO REAL É BAIXO, E MESMO ASSIM SE CORRIGE
-- Função que devolve `trigger` não é chamável pelo PostgREST (ele recusa esse
-- tipo de retorno), e as duas são SECURITY INVOKER — executariam com os
-- privilégios de quem chama, não com os do dono. Ou seja: não há vazamento
-- conhecido aqui. Corrige-se porque a postura alvo do projeto é `anon` sem
-- EXECUTE, e porque "o risco é baixo" foi exatamente o raciocínio que deixou
-- passar os quatro achados críticos da auditoria de 01/09.
--
-- ⚠️ Migration NOVA em vez de editar a ...000001: aquela já rodou no banco, e
--    reescrever texto de migration aplicada cria dúvida sobre o que o banco
--    realmente tem (mesma razão do CORTE em __tests__/segurancaMigrations).
--
-- ⚠️ APLICAR À MÃO — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = 'fn_credit_room_numerar') THEN
        RAISE EXCEPTION 'ABORTADO: fn_credit_room_numerar nao existe (rode aplicar_20270920000001 antes).';
    END IF;
END $$;

REVOKE ALL ON FUNCTION public.fn_credit_room_numerar() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_credit_room_version_imutavel() FROM PUBLIC, anon;

-- As duas rodam como TRIGGER, disparadas pelo próprio INSERT/UPDATE da tabela.
-- O executor de trigger não passa pela ACL da função, então revogar de todos os
-- papéis da aplicação não afeta o funcionamento — só fecha a chamada direta.

-- ==========================================================================
-- Conferência
-- ==========================================================================
-- SELECT proname, proacl::text FROM pg_proc
--  WHERE proname IN ('fn_credit_room_numerar', 'fn_credit_room_version_imutavel');
--    -> esperado: nenhuma das duas com `anon=X` nem com `=X/` inicial (PUBLIC)
--
-- E o comportamento continua: inserir um credit_room ainda numera (CR-00001),
-- e UPDATE numa versão congelada ainda é recusado.
-- ==========================================================================
-- FIM: aplicar_20270920000003_credit_rooms_revoke_anon_triggers.sql
-- ==========================================================================
