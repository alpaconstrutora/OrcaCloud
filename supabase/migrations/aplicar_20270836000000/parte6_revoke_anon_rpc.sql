-- ═════════════════════════════════════════════════════════════════════════════
-- Garantias Locatícias F1 — PARTE 6 de 6: fechar EXECUTE da RPC para `anon`
-- ═════════════════════════════════════════════════════════════════════════════
-- ⚠️ Rodar depois da parte 5. Não pega lock em tabela — não deadlocka.
--
-- ── Por que esta parte existe ────────────────────────────────────────────────
-- A parte 5 já tinha `REVOKE ALL ON FUNCTION ... FROM PUBLIC` — e MESMO ASSIM
-- a sondagem via PostgREST com a chave anon respondeu HTTP 200 (executou),
-- enquanto uma função comprovadamente fechada (`fn_unit_cost_basis`) responde
-- 401.
--
-- Causa: o Supabase mantém `ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON
-- FUNCTIONS TO anon, authenticated` no schema `public`. Isso é um GRANT
-- NOMINAL ao role `anon` — não é o grant implícito de PUBLIC. Revogar de
-- PUBLIC não mexe num grant nominal; é preciso revogar de `anon` pelo nome.
--
-- Ou seja: a regra do projeto ("RPC nova = REVOKE PUBLIC") é NECESSÁRIA mas
-- não é SUFICIENTE em cima do default do Supabase. Confira sempre por
-- sondagem, não pelo texto da migration.
--
-- ── Havia vazamento? Não, mas o buraco era real ──────────────────────────────
-- A função recorta por `organization_members` a partir de `auth.uid()` /
-- `auth.jwt()->>'email'`, que são NULOS para anon — então o array de orgs vem
-- vazio e o retorno é `[]`. Nenhum dado de garantia foi exposto. O que estava
-- aberto era a SUPERFÍCIE: função executável sem autenticação é alvo de sondagem
-- e de custo (a RPC varre contracts/guarantees em 7 UNIONs a cada chamada).

SET lock_timeout = '5s';

-- REVOKE nominal de `anon` — é este que fecha de fato.
REVOKE ALL ON FUNCTION public.fn_rental_guarantee_alerts(uuid) FROM anon;
-- Mantido por completude: fecha o grant implícito de PUBLIC.
REVOKE ALL ON FUNCTION public.fn_rental_guarantee_alerts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_rental_guarantee_alerts(uuid) TO authenticated;

-- ── Conferência ──────────────────────────────────────────────────────────────
-- Deve listar SOMENTE `authenticated`. Se `anon` aparecer, o REVOKE não pegou.
SELECT p.proname,
       COALESCE(
         (SELECT string_agg(DISTINCT a.grantee, ', ')
          FROM aclexplode(p.proacl) x
          JOIN pg_roles r ON r.oid = x.grantee
          CROSS JOIN LATERAL (SELECT r.rolname AS grantee) a
          WHERE x.privilege_type = 'EXECUTE'),
         '(sem ACL explícita — herda default do schema)'
       ) AS quem_executa
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'fn_rental_guarantee_alerts';
