-- ============================================================
-- Migration: 20270102000000_ged_advanced_features.sql
-- Adiciona suporte a máscaras de nomenclatura, disciplinas, marcações e status de QR Code público
-- ============================================================

-- ─── 1. ALTERAR TABELA DE PASTAS VIRTUAIS ──────────────────────

ALTER TABLE public.opura_folders
  ADD COLUMN IF NOT EXISTS naming_mask TEXT,
  ADD COLUMN IF NOT EXISTS disciplines TEXT[];


-- ─── 2. CRIAR TABELA DE MARCAÇÕES DE DOCUMENTO ────────────────

CREATE TABLE IF NOT EXISTS public.opura_document_markups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL,
  version_id      UUID NOT NULL,
  user_email      TEXT NOT NULL,
  markup_data     JSONB NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.opura_document_markups
  DROP CONSTRAINT IF EXISTS fk_markup_document;
ALTER TABLE public.opura_document_markups
  ADD CONSTRAINT fk_markup_document
  FOREIGN KEY (document_id) REFERENCES public.opura_documents(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.opura_document_markups
  VALIDATE CONSTRAINT fk_markup_document;

ALTER TABLE public.opura_document_markups
  DROP CONSTRAINT IF EXISTS fk_markup_version;
ALTER TABLE public.opura_document_markups
  ADD CONSTRAINT fk_markup_version
  FOREIGN KEY (version_id) REFERENCES public.opura_document_versions(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.opura_document_markups
  VALIDATE CONSTRAINT fk_markup_version;

-- Indexação para busca rápida por documento e versão
CREATE INDEX IF NOT EXISTS idx_opura_doc_markups_doc ON public.opura_document_markups(document_id);
CREATE INDEX IF NOT EXISTS idx_opura_doc_markups_ver ON public.opura_document_markups(version_id);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION set_opura_document_markups_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opura_document_markups_updated_at ON public.opura_document_markups;
CREATE TRIGGER opura_document_markups_updated_at
  BEFORE UPDATE ON public.opura_document_markups
  FOR EACH ROW EXECUTE FUNCTION set_opura_document_markups_updated_at();


-- ─── 3. POLÍTICAS RLS (Marcações) ──────────────────────────────

ALTER TABLE public.opura_document_markups ENABLE ROW LEVEL SECURITY;

-- Seleção/Leitura: Todos os membros ativos da organização do documento pai
DROP POLICY IF EXISTS "markups_select_org" ON public.opura_document_markups;
CREATE POLICY "markups_select_org" ON public.opura_document_markups
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opura_documents d
      WHERE d.id = opura_document_markups.document_id
      AND d.organization_id IN (
        SELECT organization_id FROM public.organization_members
        WHERE email = auth.jwt() ->> 'email'
      )
    )
  );

-- Escrita (Insert, Update, Delete): Qualquer membro ativo da org. do documento
DROP POLICY IF EXISTS "markups_write_org" ON public.opura_document_markups;
CREATE POLICY "markups_write_org" ON public.opura_document_markups
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opura_documents d
      WHERE d.id = opura_document_markups.document_id
      AND d.organization_id IN (
        SELECT organization_id FROM public.organization_members
        WHERE email = auth.jwt() ->> 'email'
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.opura_documents d
      WHERE d.id = opura_document_markups.document_id
      AND d.organization_id IN (
        SELECT organization_id FROM public.organization_members
        WHERE email = auth.jwt() ->> 'email'
      )
    )
  );

-- Acesso anônimo/desenvolvimento (Opcional - Regra 8)
DROP POLICY IF EXISTS "Allow anon all on opura_document_markups" ON public.opura_document_markups;
CREATE POLICY "Allow anon all on opura_document_markups" ON public.opura_document_markups
  FOR ALL TO anon USING (true) WITH CHECK (true);


-- ─── 4. RPC PÚBLICA PARA VALIDAÇÃO DE PLANTAS (QR Code) ─────────

CREATE OR REPLACE FUNCTION public.fn_get_document_status_public(doc_id UUID)
RETURNS TABLE (
  document_name TEXT,
  category TEXT,
  active_version_id UUID,
  active_version_number INT,
  active_version_created_at TIMESTAMPTZ,
  active_version_storage_path TEXT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.nome,
    d.categoria,
    d.active_version_id,
    v.version_number,
    v.created_at,
    v.storage_path,
    d.status
  FROM public.opura_documents d
  LEFT JOIN public.opura_document_versions v ON d.active_version_id = v.id
  WHERE d.id = doc_id;
END;
$$;

-- Permitir acesso público/anônimo e autenticado a esta RPC específica
GRANT EXECUTE ON FUNCTION public.fn_get_document_status_public(UUID) TO anon, authenticated;
