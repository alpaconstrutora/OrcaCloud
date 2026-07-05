-- Criar tabela de categorias de clientes
CREATE TABLE IF NOT EXISTS public.client_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índices e RLS
CREATE INDEX IF NOT EXISTS idx_client_categories_org ON public.client_categories(organization_id);

ALTER TABLE public.client_categories ENABLE ROW LEVEL SECURITY;

-- Política de Acesso por Organização
DROP POLICY IF EXISTS "client_categories_org_access" ON public.client_categories;
CREATE POLICY "client_categories_org_access" ON public.client_categories
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- Política Anon (para desenvolvimento)
DROP POLICY IF EXISTS "Allow anon all on client_categories" ON public.client_categories;
CREATE POLICY "Allow anon all on client_categories" ON public.client_categories
  FOR ALL TO anon USING (true) WITH CHECK (true);
