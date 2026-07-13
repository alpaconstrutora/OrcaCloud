-- ============================================================
-- CRÍTICO: remove policies de RLS abertas (USING true) em projects
-- OrçaCloud SaaS · Migration 20270131000000
--
-- Achado: a tabela public.projects tinha 3 policies simultâneas:
--   1. "Allow anon all on projects"          — role anon,          USING (true)
--   2. "Allow authenticated all on projects" — role authenticated, USING (true)
--   3. "projects_org_access"                 — role authenticated, filtra por
--      organização (is_org_member) — a policy correta.
--
-- No Postgres, policies permissivas do mesmo comando são combinadas com OR.
-- Como as policies (1) e (2) sempre retornam true, elas anulavam a restrição
-- de (3): qualquer usuário autenticado (e, pior, qualquer requisição com a
-- chave anon, que é pública no bundle do frontend) conseguia ler/escrever a
-- tabela projects inteira, de qualquer organização — vazamento cross-tenant
-- ativo, independente do que a UI expõe.
--
-- A migration 20260706000006_fix_projects_rls.sql já tinha a intenção de
-- remover essas duas policies (DROP POLICY IF EXISTS ...), mas elas
-- continuavam ativas no banco remoto no momento desta migration — não se
-- sabe se 20260706000006 nunca chegou a ser aplicada ou se algo as recriou
-- depois. Esta migration é idempotente (DROP POLICY IF EXISTS) e pode ser
-- reaplicada com segurança.
--
-- Após esta migration, o único caminho de acesso a projects para usuários
-- autenticados passa a ser projects_org_access (organização) — mais as
-- policies legadas "Users can select/insert/update/delete their own
-- projects" (auth.uid() = user_id), que continuam ativas e não representam
-- vazamento cross-tenant (cada usuário só vê os projetos onde é o dono
-- direto, adicionalmente ao acesso por organização).
-- ============================================================

DROP POLICY IF EXISTS "Allow anon all on projects" ON public.projects;
DROP POLICY IF EXISTS "Allow authenticated all on projects" ON public.projects;

-- ────────────────────────────────────────────────────────────
-- Backfill pontual: 1 projeto ("Galeria - Expansão") tem organization_id
-- nativo NULL mas settings->>'organizationId' aponta para uma organização
-- real e existente. Sem isso, ele ficaria invisível para a organização
-- dona assim que o fallback via JSONB for eventualmente removido.
--
-- Os demais 11 projetos com organization_id NULL (2x "Gestão Comercial"
-- órfã, "Casa de Formação", "Casa de Oração", "Chácara" etc.) apontam para
-- uma organização que não existe mais no banco (ou não têm organização
-- nenhuma no JSONB) — ficam corretamente inacessíveis sob a policy
-- projects_org_access e não são tocados aqui. Decisão de limpeza (excluir
-- ou reatribuir) fica para revisão manual futura, fora do escopo desta
-- migration de segurança.
-- ────────────────────────────────────────────────────────────

UPDATE public.projects
SET organization_id = (settings->>'organizationId')::uuid
WHERE organization_id IS NULL
  AND (settings->>'organizationId') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = (settings->>'organizationId')::uuid
  );

-- ────────────────────────────────────────────────────────────
-- FIM: 20270131000000_fix_projects_open_rls_policies.sql
-- ────────────────────────────────────────────────────────────
