-- Fecha TRUNCATE para authenticated e anon no schema public (15/11/2026).
-- Plano: docs/planos/2026-11-15-permissoes-todas-orgs-busca-truncate.md.
--
-- Medido em 15/11/2026: authenticated tinha TRUNCATE em 538 das 659 tabelas de public, anon em 387.
-- Causa: os default privileges do Supabase no schema public concedem `arwdDxtm` (o `D` é TRUNCATE) a
-- anon/authenticated em TODA tabela nova; o GRANT de cada migration soma, não substitui.
-- TRUNCATE ignora RLS e não dispara gatilho de linha (achado no módulo Riscos, aplicar_20271114641000).
-- A API (PostgREST) não expõe TRUNCATE, então não era explorável pelo app — fecha-se mesmo assim.
--
-- Quem usa TRUNCATE: só `fn_condominio_migracao_plano` (SECURITY INVOKER), e em tabelas TEMPORÁRIAS da
-- própria sessão (`_cm_*`) — o dono da tabela temporária trunca sem precisar de GRANT. Nada mais no
-- banco nem no app chama TRUNCATE com papel de usuário; Edge Functions usam service_role (intocado).
--
-- Ensaio em transação desfeita (15/11): restou 1 tabela com TRUNCATE para os dois papéis —
-- `spatial_ref_sys`, do PostGIS, dono supabase_admin (postgres não revoga o que supabase_admin concedeu;
-- tabela de sistema, sem dado do app). CRUD de authenticated intacto.
--
-- O padrão do schema também perde o TRUNCATE para tabela nova criada por postgres (as migrations).

REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon, authenticated;

-- Conferência: 1 | 1 (spatial_ref_sys) e o padrão do postgres sem `D` para anon/authenticated.
SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND has_table_privilege('authenticated', c.oid, 'truncate')) AS authenticated_com_truncate,
       (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND has_table_privilege('anon', c.oid, 'truncate')) AS anon_com_truncate;
