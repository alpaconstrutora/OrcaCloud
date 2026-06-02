-- ============================================================
-- Denormaliza organization_id em projects e purchase_orders
-- OrçaCloud SaaS · Migration 20260710000001
-- Objetivo: resolver tenant sem JOIN via companies em BI/RLS,
--   eliminando os três caminhos inconsistentes identificados.
--
-- Antes:
--   projects       → settings->>'organizationId' (JSONB) + empresa_id→companies.org_id
--   purchase_orders → empresa_id→companies.org_id
--
-- Depois:
--   ambas as tabelas têm organization_id direto (FK organizations.id)
--   empresa_id continua como filtro de empresa dentro do grupo
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Adicionar coluna organization_id (nullable — backfill depois)
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- ────────────────────────────────────────────────────────────
-- 2. Backfill projects
--    Passo 1: via empresa_id (caminho mais preciso)
--    Passo 2: fallback via settings->>'organizationId' (JSONB legado)
-- ────────────────────────────────────────────────────────────

UPDATE public.projects p
SET organization_id = c.org_id
FROM public.companies c
WHERE c.id = p.empresa_id
  AND p.organization_id IS NULL;

UPDATE public.projects p
SET organization_id = (p.settings->>'organizationId')::uuid
WHERE p.organization_id IS NULL
  AND (p.settings->>'organizationId') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = (p.settings->>'organizationId')::uuid
  );

-- ────────────────────────────────────────────────────────────
-- 3. Backfill purchase_orders
--    Passo 1: via empresa_id
--    Passo 2: fallback via project (para pedidos sem empresa mas com projeto)
-- ────────────────────────────────────────────────────────────

UPDATE public.purchase_orders po
SET organization_id = c.org_id
FROM public.companies c
WHERE c.id = po.empresa_id
  AND po.organization_id IS NULL;

UPDATE public.purchase_orders po
SET organization_id = p.organization_id
FROM public.projects p
WHERE po.project_id = p.id
  AND po.organization_id IS NULL
  AND p.organization_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 4. Trigger: mantém organization_id em sincronia com empresa_id
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_org_from_empresa()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.empresa_id IS NOT NULL THEN
    SELECT org_id INTO NEW.organization_id
    FROM public.companies
    WHERE id = NEW.empresa_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_sync_org ON public.projects;
CREATE TRIGGER projects_sync_org
  BEFORE INSERT OR UPDATE OF empresa_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.sync_org_from_empresa();

DROP TRIGGER IF EXISTS purchase_orders_sync_org ON public.purchase_orders;
CREATE TRIGGER purchase_orders_sync_org
  BEFORE INSERT OR UPDATE OF empresa_id ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_org_from_empresa();

-- ────────────────────────────────────────────────────────────
-- 5. Índices
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_projects_organization_id
  ON public.projects (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_organization_id
  ON public.purchase_orders (organization_id)
  WHERE organization_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 6. Atualizar RLS de projects
--    Usa organization_id direto; JSONB como fallback para registros
--    ainda sem org (garante zero downtime na transição).
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "projects_org_access" ON public.projects;

CREATE POLICY "projects_org_access"
  ON public.projects FOR ALL TO authenticated
  USING (
    public.is_org_member(organization_id)
    OR (
      organization_id IS NULL
      AND public.is_org_member((settings->>'organizationId')::uuid)
    )
  )
  WITH CHECK (
    public.is_org_member(organization_id)
    OR (
      organization_id IS NULL
      AND public.is_org_member((settings->>'organizationId')::uuid)
    )
  );

-- ────────────────────────────────────────────────────────────
-- FIM: 20260710000001_denormalize_org_id_projects_orders.sql
-- ────────────────────────────────────────────────────────────
