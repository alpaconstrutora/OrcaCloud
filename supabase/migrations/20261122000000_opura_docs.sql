-- ============================================================
-- Migration: 20261122000000_opura_docs.sql
-- MVP ÒPURA Docs: Gestão Documental integrada
-- ============================================================

-- ─── 1. TABELA PRINCIPAL DE DOCUMENTOS ───────────────────────

CREATE TABLE IF NOT EXISTS public.opura_documents (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  nome                      TEXT NOT NULL,
  descricao                 TEXT,
  categoria                 TEXT NOT NULL CHECK (categoria IN ('juridico', 'engenharia', 'compliance', 'financeiro', 'comercial')),
  tipo_documento            TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'vencido', 'alerta', 'arquivado', 'pendente_aprovacao')),
  data_emissao              DATE,
  data_validade             DATE,
  alerta_dias_antecedencia  INT NOT NULL DEFAULT 30,
  tags                      TEXT[] NOT NULL DEFAULT '{}'::text[],
  criado_por                TEXT NOT NULL DEFAULT COALESCE(auth.jwt() ->> 'email', 'system'),
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW(),

  -- Chaves Estrangeiras Opcionais (Vínculos Operacionais)
  project_id                UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  company_id                UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  contract_id               UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  supplier_id               UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  client_id                 UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  investor_id               UUID REFERENCES public.investors(id) ON DELETE SET NULL,
  active_version_id         UUID -- Adicionaremos a FK para opura_document_versions posteriormente
);

-- Indexação para buscas rápidas
CREATE INDEX IF NOT EXISTS idx_opura_docs_org_id ON public.opura_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_opura_docs_project_id ON public.opura_documents(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opura_docs_validade ON public.opura_documents(data_validade) WHERE data_validade IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opura_docs_categoria ON public.opura_documents(categoria);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION set_opura_documents_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS opura_documents_updated_at ON public.opura_documents;
CREATE TRIGGER opura_documents_updated_at
  BEFORE UPDATE ON public.opura_documents
  FOR EACH ROW EXECUTE FUNCTION set_opura_documents_updated_at();

-- Habilitar RLS
ALTER TABLE public.opura_documents ENABLE ROW LEVEL SECURITY;


-- ─── 2. TABELA DE VERSÕES DE ARQUIVOS ────────────────────────

CREATE TABLE IF NOT EXISTS public.opura_document_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES public.opura_documents(id) ON DELETE CASCADE,
  version_number  INT NOT NULL,
  storage_path    TEXT NOT NULL,
  tamanho         BIGINT NOT NULL,
  mime_type       TEXT NOT NULL,
  criado_por      TEXT NOT NULL DEFAULT COALESCE(auth.jwt() ->> 'email', 'system'),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexação
CREATE INDEX IF NOT EXISTS idx_opura_doc_vers_doc_id ON public.opura_document_versions(document_id);

-- Agora adicionamos a FK na tabela principal com segurança
ALTER TABLE public.opura_documents DROP CONSTRAINT IF EXISTS fk_active_version;
ALTER TABLE public.opura_documents 
  ADD CONSTRAINT fk_active_version FOREIGN KEY (active_version_id) REFERENCES public.opura_document_versions(id) ON DELETE SET NULL;

-- Habilitar RLS
ALTER TABLE public.opura_document_versions ENABLE ROW LEVEL SECURITY;


-- ─── 3. POLÍTICAS RLS (Tabelas) ──────────────────────────────

-- Seleção/Leitura: Todos os membros ativos da organização
DROP POLICY IF EXISTS "docs_select_org" ON public.opura_documents;
CREATE POLICY "docs_select_org" ON public.opura_documents
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

-- Escrita (Insert, Update, Delete): Qualquer membro ativo da org.
-- (O controle fino por papel/perfil Engenheiro/Financeiro será aplicado na UI no MVP).
DROP POLICY IF EXISTS "docs_write_org" ON public.opura_documents;
CREATE POLICY "docs_write_org" ON public.opura_documents
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

-- Versões do Documento: Herda do acesso do documento pai
DROP POLICY IF EXISTS "versions_select_org" ON public.opura_document_versions;
CREATE POLICY "versions_select_org" ON public.opura_document_versions
  FOR SELECT TO authenticated
  USING (
    document_id IN (
      SELECT id FROM public.opura_documents
    )
  );

DROP POLICY IF EXISTS "versions_write_org" ON public.opura_document_versions;
CREATE POLICY "versions_write_org" ON public.opura_document_versions
  FOR ALL TO authenticated
  USING (
    document_id IN (
      SELECT id FROM public.opura_documents
    )
  )
  WITH CHECK (
    document_id IN (
      SELECT id FROM public.opura_documents
    )
  );

-- REGRA 8: Políticas Anon para Ambiente de Desenvolvimento (Dev)
DROP POLICY IF EXISTS "Allow anon all on opura_documents" ON public.opura_documents;
CREATE POLICY "Allow anon all on opura_documents" ON public.opura_documents
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on opura_document_versions" ON public.opura_document_versions;
CREATE POLICY "Allow anon all on opura_document_versions" ON public.opura_document_versions
  FOR ALL TO anon USING (true) WITH CHECK (true);


-- ─── 4. CRIAÇÃO DO STORAGE BUCKET E SUAS POLÍTICAS RLS ────────

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('opura-docs', 'opura-docs', false, 52428800) -- Limite de 50 MB
ON CONFLICT (id) DO NOTHING;

-- RLS de Storage: Permite leitura para membros da Org associada ao caminho do arquivo
-- Formato no Storage: "org-uuid/document-uuid/version-id-filename.ext"
DROP POLICY IF EXISTS "storage_docs_select" ON storage.objects;
CREATE POLICY "storage_docs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'opura-docs'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

-- RLS de Storage: Permite inserção de arquivos
DROP POLICY IF EXISTS "storage_docs_insert" ON storage.objects;
CREATE POLICY "storage_docs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'opura-docs'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

-- RLS de Storage: Permite deleção de arquivos
DROP POLICY IF EXISTS "storage_docs_delete" ON storage.objects;
CREATE POLICY "storage_docs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'opura-docs'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

-- REGRA 8: Políticas Anon de Storage para Desenvolvimento
DROP POLICY IF EXISTS "Allow anon select on opura_docs_bucket" ON storage.objects;
CREATE POLICY "Allow anon select on opura_docs_bucket" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'opura-docs');

DROP POLICY IF EXISTS "Allow anon insert on opura_docs_bucket" ON storage.objects;
CREATE POLICY "Allow anon insert on opura_docs_bucket" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'opura-docs');

DROP POLICY IF EXISTS "Allow anon delete on opura_docs_bucket" ON storage.objects;
CREATE POLICY "Allow anon delete on opura_docs_bucket" ON storage.objects
  FOR DELETE TO anon USING (bucket_id = 'opura-docs');
