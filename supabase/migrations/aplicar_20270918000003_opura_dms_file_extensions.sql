-- ============================================================
-- Migration: aplicar_20270918000003_opura_dms_file_extensions.sql
-- Catálogo de EXTENSÕES DE ARQUIVO do GED (ÒPURA Docs), por organização.
--
-- Antes disto a lista `pdf/docx/xlsx/dwg/jpg/png` estava fixa em 5 lugares do
-- código (executeUpload, EXTENSAO_OPTIONS do módulo, BatchUploadSheet,
-- DocumentBatchEditModal, MIME_BY_EXTENSION do documentService) e o ícone por
-- extensão era um `switch` de ícones lucide. Nenhuma organização conseguia
-- aceitar .rvt/.ifc/.dxf sem alterar código.
--
-- A tabela passa a ser a fonte da verdade de: extensões aceitas no upload,
-- opções do select "Extensão do arquivo", MIME gravado ao renomear a versão
-- ativa, e ícone exibido na coluna Documento.
--
-- Data do pedido: 2026-09-01
-- APLICAR COM: npx supabase db query --linked -f <este arquivo>
--              (NUNCA `supabase db push` — histórico de migrations furado)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.opura_dms_file_extensions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- minúsculo e sem ponto ('pdf', não '.PDF') — é comparado direto com o
  -- resultado de `nome.split('.').pop().toLowerCase()` no cliente.
  extension       TEXT NOT NULL CHECK (extension ~ '^[a-z0-9]{1,12}$'),
  label           TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  icon_path       TEXT,   -- path dentro do bucket opura-docs-icons (permite remover/substituir)
  icon_url        TEXT,   -- URL pública derivada do path (bucket é público)
  ativo           BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (organization_id, extension)
);

CREATE INDEX IF NOT EXISTS idx_opura_dms_file_extensions_org
  ON public.opura_dms_file_extensions(organization_id);

ALTER TABLE public.opura_dms_file_extensions ENABLE ROW LEVEL SECURITY;

-- RLS idêntica à de opura_dms_document_types (20270110000002), porém SEM
-- policy anon: as policies anon do módulo foram removidas em 20270208000001.
DROP POLICY IF EXISTS "file_extensions_select_org" ON public.opura_dms_file_extensions;
CREATE POLICY "file_extensions_select_org" ON public.opura_dms_file_extensions
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

DROP POLICY IF EXISTS "file_extensions_write_org" ON public.opura_dms_file_extensions;
CREATE POLICY "file_extensions_write_org" ON public.opura_dms_file_extensions
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

-- ─── SEED: as 6 extensões que estavam no código, para toda organização ───
-- MIMEs vindos de MIME_BY_EXTENSION (services/documentService.ts).
-- Idempotente: rodar de novo não duplica nem sobrescreve edição do usuário.
INSERT INTO public.opura_dms_file_extensions (organization_id, extension, label, mime_type)
SELECT o.id, e.extension, e.label, e.mime_type
FROM public.organizations o
CROSS JOIN (VALUES
  ('pdf',  'PDF',  'application/pdf'),
  ('docx', 'DOCX', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
  ('xlsx', 'XLSX', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  ('dwg',  'DWG',  'application/acad'),
  ('jpg',  'JPG',  'image/jpeg'),
  ('png',  'PNG',  'image/png')
) AS e(extension, label, mime_type)
ON CONFLICT (organization_id, extension) DO NOTHING;

-- ============================================================
-- BUCKET DOS ÍCONES — opura-docs-icons
-- Público porque `DocumentsTable` também serve o Portal do Parceiro (link
-- público, sem sessão) — mesmo racional de commercial-property-photos
-- (20270843000000). Path: {organization_id}/{uuid}-{nome}.ext
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'opura-docs-icons',
  'opura-docs-icons',
  true,
  1048576,   -- 1 MB por ícone
  ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Org members can upload opura docs icons" ON storage.objects;
CREATE POLICY "Org members can upload opura docs icons" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'opura-docs-icons'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

DROP POLICY IF EXISTS "Org members can update opura docs icons" ON storage.objects;
CREATE POLICY "Org members can update opura docs icons" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'opura-docs-icons'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

DROP POLICY IF EXISTS "Org members can delete opura docs icons" ON storage.objects;
CREATE POLICY "Org members can delete opura docs icons" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'opura-docs-icons'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

-- Leitura pública (bucket public=true já permite; a policy documenta a intenção).
DROP POLICY IF EXISTS "Public can read opura docs icons" ON storage.objects;
CREATE POLICY "Public can read opura docs icons" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'opura-docs-icons');
