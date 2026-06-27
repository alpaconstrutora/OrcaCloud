-- ============================================================
-- Migration: 20261227000000_opura_docs_virtual_folders.sql
-- Adiciona suporte a pastas virtuais e hierárquicas no ÒPURA Docs
-- ============================================================

-- ─── 1. CRIAR TABELA DE PASTAS VIRTUAIS ──────────────────────

CREATE TABLE IF NOT EXISTS public.opura_folders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  parent_id       UUID REFERENCES public.opura_folders(id) ON DELETE CASCADE,
  categoria       TEXT NOT NULL CHECK (categoria IN ('juridico', 'engenharia', 'compliance', 'financeiro', 'comercial')),
  created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexação para buscas hierárquicas e filtros rápidos
CREATE INDEX IF NOT EXISTS idx_opura_folders_org ON public.opura_folders(organization_id);
CREATE INDEX IF NOT EXISTS idx_opura_folders_project ON public.opura_folders(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opura_folders_parent ON public.opura_folders(parent_id) WHERE parent_id IS NOT NULL;

-- Trigger para atualizar updated_at automaticamente (idempotente)
CREATE OR REPLACE FUNCTION set_opura_folders_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opura_folders_updated_at ON public.opura_folders;
CREATE TRIGGER opura_folders_updated_at
  BEFORE UPDATE ON public.opura_folders
  FOR EACH ROW EXECUTE FUNCTION set_opura_folders_updated_at();

-- Habilitar RLS
ALTER TABLE public.opura_folders ENABLE ROW LEVEL SECURITY;


-- ─── 2. VINCULAR DOCUMENTOS ÀS PASTAS VIRTUAIS ──────────────

ALTER TABLE public.opura_documents 
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.opura_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_opura_docs_folder ON public.opura_documents(folder_id) WHERE folder_id IS NOT NULL;


-- ─── 3. POLÍTICAS RLS (Pastas) ───────────────────────────────

-- Seleção/Leitura: Todos os membros ativos da organização
DROP POLICY IF EXISTS "folders_select_org" ON public.opura_folders;
CREATE POLICY "folders_select_org" ON public.opura_folders
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

-- Escrita (Insert, Update, Delete): Qualquer membro ativo da org.
DROP POLICY IF EXISTS "folders_write_org" ON public.opura_folders;
CREATE POLICY "folders_write_org" ON public.opura_folders
  FOR ALL TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

-- REGRA 8: Políticas Anon para Ambiente de Desenvolvimento (Dev)
DROP POLICY IF EXISTS "Allow anon all on opura_folders" ON public.opura_folders;
CREATE POLICY "Allow anon all on opura_folders" ON public.opura_folders
  FOR ALL TO anon USING (true) WITH CHECK (true);
