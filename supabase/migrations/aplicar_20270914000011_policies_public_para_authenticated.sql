-- ============================================================================
-- companies / nfe_invoices: policies de `public` para `authenticated`
-- OrçaCloud SaaS · aplicar_20270914000011
-- Plano: docs/planos/2026-08-26-consolidar-qualidade-em-garantia.md
--
-- O ACHADO
--   Ao conferir `pg_policies` durante a caçada às exclusões silenciosas
--   (2026-08-26), apareceu que as 5 policies destas duas tabelas usam
--   `TO {public}` — e `public` inclui o papel `anon`. Todo o resto do sistema
--   usa `TO authenticated`.
--
-- NÃO É INCIDENTE — MEDIDO, NÃO SUPOSTO
--   Bati na API com a chave pública e SEM login (papel `anon`):
--     companies      → HTTP 200, 0 linhas
--     nfe_invoices   → HTTP 200, 0 linhas
--   Porque o USING é `org_id IN (SELECT ... WHERE email = auth.jwt()->>'email')`
--   e, para `anon`, `auth.jwt()` é nulo: a subconsulta é vazia e nada casa.
--   A policy se protege sozinha.
--
-- ENTÃO POR QUE MEXER
--   Porque a proteção está apoiada SÓ no USING. Qualquer policy futura nessas
--   tabelas com um USING mais permissivo passaria a valer para `anon` também, e
--   ninguém vai lembrar de conferir o `TO`. Some-se a isso a inconsistência com
--   a convenção do repo e com o rollout de drop-anon já em andamento.
--
-- RISCO DE QUEBRAR ALGUM PORTAL PÚBLICO: nenhum.
--   Se algum fluxo anônimo dependesse destas policies, ele JÁ estaria quebrado —
--   `anon` não recebe linha nenhuma por elas hoje. Portal público lê por RPC
--   SECURITY DEFINER, que não passa por policy.
--
-- APLICAÇÃO: SQL direto no editor. NUNCA `supabase db push`.
--   ⚠️ Não deixe trecho selecionado no editor — ele roda só a seleção.
-- ============================================================================

BEGIN;

-- `ALTER POLICY` não aceita `IF EXISTS`, e falha se a policy não existir. O
-- laço confere antes, então a migration é idempotente e não quebra se alguma
-- já tiver sido ajustada à mão.
--
-- A lista é EXPLÍCITA de propósito. Seria mais curto varrer toda policy
-- `public` destas tabelas, mas aí um dia alguém cria uma policy de portal
-- deliberadamente anônima e esta migration a desliga sem querer.
DO $$
DECLARE
  alvo   RECORD;
  mexeu  INT := 0;
BEGIN
  FOR alvo IN
    SELECT * FROM (VALUES
      ('companies',    'companies_select'),
      ('companies',    'companies_insert_admin'),
      ('companies',    'companies_update_admin'),
      ('nfe_invoices', 'nfe_invoices_select'),
      ('nfe_invoices', 'nfe_invoices_update')
    ) AS t(tabela, policy)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename  = alvo.tabela
         AND policyname = alvo.policy
         AND 'public' = ANY(roles)
    ) THEN
      EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', alvo.policy, alvo.tabela);
      mexeu := mexeu + 1;
      RAISE NOTICE 'ajustada: %.%', alvo.tabela, alvo.policy;
    ELSE
      RAISE NOTICE 'ja estava ok (ou nao existe): %.%', alvo.tabela, alvo.policy;
    END IF;
  END LOOP;

  RAISE NOTICE 'policies ajustadas nesta execucao: %', mexeu;
END $$;

COMMIT;

-- ############################################################################
-- CONFERÊNCIA
--
-- 1) As 5 devem aparecer com roles = {authenticated}.
-- 2) A segunda consulta procura QUALQUER policy ainda em `public` nessas duas
--    tabelas — se vier linha, é policy que eu não enumerei; avalie caso a caso
--    antes de mexer (pode ser portal anônimo legítimo).
-- ############################################################################

SELECT tablename, policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('companies', 'nfe_invoices')
 ORDER BY tablename, cmd;

SELECT tablename, policyname, cmd, roles AS ainda_em_public
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('companies', 'nfe_invoices')
   AND 'public' = ANY(roles);
