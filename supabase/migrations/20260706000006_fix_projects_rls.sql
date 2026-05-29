-- Migration: Fecha RLS aberta da tabela projects + remove policy anon
-- Date: 2026-07-06
-- Problema: projects tinha USING (true) para todos os autenticados,
--   expondo projetos de todos os tenants. A tabela usa settings->>'organizationId'
--   como identificador de tenant (sem coluna org direta).
-- Solução: substituir por policy que filtra via is_org_member().

-- Remove policies abertas
DROP POLICY IF EXISTS "Allow authenticated all on projects" ON public.projects;
DROP POLICY IF EXISTS "Allow anon all on projects"          ON public.projects;

-- Acesso para membros da organização (via JSONB settings->>'organizationId')
CREATE POLICY "projects_org_access"
  ON public.projects FOR ALL TO authenticated
  USING (
    public.is_org_member((settings->>'organizationId')::uuid)
    OR (settings->>'organizationId') IS NULL  -- projetos sem org ficam acessíveis ao dono
  )
  WITH CHECK (
    public.is_org_member((settings->>'organizationId')::uuid)
    OR (settings->>'organizationId') IS NULL
  );

-- Nota: para remoção total do ramo "IS NULL", adicionar a coluna organization_id
-- nativa à tabela projects e migrar os dados do JSONB. Isso é um refactor maior.
