-- ═════════════════════════════════════════════════════════════════════════════
-- vw_receivables — fechar para `anon` e passar a respeitar a RLS de quem consulta
-- ═════════════════════════════════════════════════════════════════════════════
-- Descoberto em 2026-08-06, logo depois de derrubar TEMP_BYPASS_ALL_INTERNAL_TXS
-- (ver aplicar_20270903000000). Fechar a tabela base NÃO fechou esta porta:
--
--   GET /rest/v1/vw_receivables  (só com a chave publicável, sem sessão)
--   → Content-Range: 0-120/121, com organization_id, amount, description e
--     party_name — nome de cliente, valor e contrato de parcelas a receber.
--
-- Enquanto isso, `vw_payables` respondia `42501 permission denied`. A diferença
-- é que a irmã recebeu tratamento em `20270840000001_vw_payables_revoke_anon.sql`
-- e esta ficou para trás — nenhuma migration deste repositório dá
-- `security_invoker` ou `REVOKE` a `vw_receivables`.
--
-- SÃO DOIS DEFEITOS, e cada linha abaixo conserta um:
--   1. `anon` tem GRANT SELECT (default do Supabase)      → REVOKE nominal.
--   2. a view roda como o DONO, não como quem consulta,   → security_invoker.
--      então passa por cima da RLS de internal_transactions.
--      Sem isto, um usuário autenticado de OUTRA organização também vê tudo —
--      o REVOKE sozinho fecharia o anônimo e deixaria o cross-tenant aberto.
--
-- ⚠️ `REVOKE FROM PUBLIC` não basta: o Supabase mantém
-- `ALTER DEFAULT PRIVILEGES ... GRANT ... TO anon, authenticated` no schema
-- public, então `anon` é concedido diretamente. O REVOKE tem de ser NOMINAL.
--
-- ⚠️ NÃO recria a view. `ALTER VIEW ... SET (security_invoker = on)` altera só
-- a opção, sem DROP/CREATE — que é onde se perde a definição por acidente
-- (o alerta de parte4_vw_payables_property.sql).
--
-- IMPACTO: os dois únicos leitores são `receivableService.ts:17` e
-- `rentalsDashboardService.ts:162`, ambos do app interno, com usuário
-- autenticado membro da organização — cobertos pela policy
-- "Manage internal_transactions as member". Nenhum portal, token ou fluxo
-- público lê esta view.

SET lock_timeout = '5s';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = 'vw_receivables' AND c.relkind = 'v'
    ) THEN
        RAISE EXCEPTION 'ABORTADO: a view public.vw_receivables nao existe.';
    END IF;

    -- Com security_invoker ligado, a view passa a depender da policy da tabela
    -- base. Se ela não existir, Contas a Receber fica vazio para todo mundo.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename  = 'internal_transactions'
           AND policyname = 'Manage internal_transactions as member'
    ) THEN
        RAISE EXCEPTION
            'ABORTADO: sem a policy de membro em internal_transactions, ligar security_invoker esvaziaria Contas a Receber.';
    END IF;
END $$;

ALTER VIEW public.vw_receivables SET (security_invoker = on);

REVOKE ALL ON public.vw_receivables FROM anon;
REVOKE ALL ON public.vw_receivables FROM PUBLIC;
GRANT SELECT ON public.vw_receivables TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — conferir o efeito, não o arquivo
-- ═════════════════════════════════════════════════════════════════════════════
-- 1) security_invoker ligado:
--      SELECT c.relname, c.reloptions FROM pg_class c
--        JOIN pg_namespace n ON n.oid = c.relnamespace
--       WHERE n.nspname='public' AND c.relname='vw_receivables';
--    Esperado: reloptions contém {security_invoker=on}
--
-- 2) anon perdeu o grant:
--      SELECT grantee, privilege_type FROM information_schema.role_table_grants
--       WHERE table_name='vw_receivables';
--    Esperado: só `authenticated` com SELECT.
--
-- 3) A prova que importa, fora do SQL Editor:
--      curl -s "$URL/rest/v1/vw_receivables?select=id&limit=1" -H "apikey: $ANON"
--    Esperado: `42501 permission denied` (era 121 linhas).
--
-- 4) Regressão COM sessão: Contas a Receber lista, e o painel Resultados de
--    Locações continua mostrando inadimplência e próximos vencimentos
--    (rentalsDashboardService). Se esvaziarem, o usuário não é membro da org
--    dos lançamentos — que passou a ser exigido, e é o comportamento correto.
