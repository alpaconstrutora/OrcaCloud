-- ==========================================================================
-- Fases 3 e 4 — `organization_id` NOT NULL e policies por dono + is_shared
-- ==========================================================================
-- Plano: docs/planos/2026-08-28-organization-id-dono-explicito-e-compartilhamento.md
-- Depende de: 000018 (is_shared), 000019 (dono), 000020 (renumeração) e do
-- DEPLOY do código da Fase 5 — que é o que faz o app parar de gravar nulo e
-- passar a ler por `is_shared`.
--
-- ⚠️ ORDEM. O plano original dizia 3 → 4 → 5. Está errado e foi corrigido:
--    • `SET NOT NULL` antes do código quebra a criação de fornecedor em "Todas
--      as organizações", que gravava nulo de propósito;
--    • trocar a policy antes do código faz o fornecedor compartilhado SUMIR das
--      outras organizações, porque o `.or(...is.null)` antigo não o encontra.
--    Por isso: código (deploy) → NOT NULL → policies.
--
-- SOBRE O RISCO DO PORTAL DO CLIENTE (registrado no plano)
-- As policies de UPDATE/DELETE de `clients` estavam em PUBLIC (`polroles={0}`),
-- alcançáveis pelo `anon`. A dúvida era se o portal público escrevia por esse
-- caminho. VERIFICADO no código: `ClientArea` roda com `portalToken` só a partir
-- de `App.tsx:139`, que passa `isPreview`; e `isAdmin = !isPreview && (...)`.
-- Os SEIS pontos que chamam `updateClientData` estão todos dentro de
-- `isAdmin && (...)`. Ou seja: no modo token não existe caminho de escrita em
-- `clients`. Fechar para `authenticated` não derruba o portal.
--
-- ⚠️ APLICAR À MÃO — NUNCA `supabase db push`.
-- ==========================================================================

SET lock_timeout = '5s';

-- ────────────────────────────────────────────────────────────
-- FASE 3 — o dono passa a ser obrigatório
--    Só é seguro porque as três tabelas já estão com 0 linhas sem dono
--    (000019). O `NOT NULL` é o que impede o acidente de VOLTAR: daqui em
--    diante é o banco recusando, não um script que alguém precisa lembrar.
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.suppliers          ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.clients            ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.partner_workspaces ALTER COLUMN organization_id SET NOT NULL;

-- ────────────────────────────────────────────────────────────
-- FASE 4 — policies: leitura por dono OU compartilhado; escrita só do dono
-- ────────────────────────────────────────────────────────────

-- suppliers ------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view suppliers of their organization"   ON public.suppliers;
DROP POLICY IF EXISTS "Users can manage suppliers of their organization" ON public.suppliers;

CREATE POLICY "Users can view suppliers of their organization"
ON public.suppliers FOR SELECT TO authenticated
USING (public.is_org_member(organization_id) OR is_shared);

CREATE POLICY "Users can manage suppliers of their organization"
ON public.suppliers FOR ALL TO authenticated
USING (public.is_org_member(organization_id))
WITH CHECK (public.is_org_member(organization_id));

-- clients --------------------------------------------------------------------
-- As três antigas estavam em PUBLIC (alcançáveis pelo anon) ou com a perna do
-- NULL. `clients_org_access` já era escopada por organização, mas via
-- `organization_members.user_id`, enquanto a de leitura ia por e-mail — as duas
-- convivem, e a de leitura abaixo unifica no helper `is_org_member`.
DROP POLICY IF EXISTS "Allow authenticated users to read clients"   ON public.clients;
DROP POLICY IF EXISTS "Members can update clients"                  ON public.clients;
DROP POLICY IF EXISTS "Members can delete clients"                  ON public.clients;
DROP POLICY IF EXISTS "Members can insert clients"                  ON public.clients;

CREATE POLICY "Allow authenticated users to read clients"
ON public.clients FOR SELECT TO authenticated
USING (public.is_org_member(organization_id) OR is_shared);

CREATE POLICY "Members can manage clients"
ON public.clients FOR ALL TO authenticated
USING (public.is_org_member(organization_id))
WITH CHECK (public.is_org_member(organization_id));

-- partner_workspaces ---------------------------------------------------------
DROP POLICY IF EXISTS "workspaces_select_internal" ON public.partner_workspaces;
DROP POLICY IF EXISTS "workspaces_manage_internal" ON public.partner_workspaces;

CREATE POLICY "workspaces_select_internal"
ON public.partner_workspaces FOR SELECT TO authenticated
USING (public.is_org_member(organization_id) OR is_shared);

CREATE POLICY "workspaces_manage_internal"
ON public.partner_workspaces FOR ALL TO authenticated
USING (public.is_org_member(organization_id))
WITH CHECK (public.is_org_member(organization_id));

NOTIFY pgrst, 'reload schema';

-- ==========================================================================
-- CONFERÊNCIA
-- ==========================================================================

-- 1. As três colunas são NOT NULL:
-- SELECT table_name, is_nullable FROM information_schema.columns
--  WHERE table_schema='public' AND column_name='organization_id'
--    AND table_name IN ('suppliers','clients','partner_workspaces');
-- Esperado: NO, NO, NO

-- 2. Nenhuma policy dessas tabelas depende de organização nula, nem está em
--    PUBLIC (`polroles = {0}`):
-- SELECT c.relname, p.polname, p.polroles::text AS roles,
--        pg_get_expr(p.polqual, p.polrelid) AS usando,
--        pg_get_expr(p.polwithcheck, p.polrelid) AS com_check
--   FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
--  WHERE c.relname IN ('suppliers','clients','partner_workspaces')
--  ORDER BY 1, 2;

-- 3. Ninguém perdeu visibilidade — os compartilhados seguem 119 / 7 / 1:
-- SELECT 'suppliers' t, count(*) FROM public.suppliers WHERE is_shared
-- UNION ALL SELECT 'clients', count(*) FROM public.clients WHERE is_shared
-- UNION ALL SELECT 'partner_workspaces', count(*) FROM public.partner_workspaces WHERE is_shared;

-- ==========================================================================
-- FIM: aplicar_20270914000021_org_not_null_e_policies_is_shared.sql
-- ==========================================================================
