-- ============================================================
-- Migration: 20270110000002_ged_document_types.sql
-- Tabela para Gestão de Tipos de Documento no ÓPURA Docs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.opura_dms_document_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (organization_id, name)
);

-- Indexação para busca rápida
CREATE INDEX IF NOT EXISTS idx_opura_dms_document_types_org ON public.opura_dms_document_types(organization_id);

-- Habilitar RLS
ALTER TABLE public.opura_dms_document_types ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DROP POLICY IF EXISTS "document_types_select_org" ON public.opura_dms_document_types;
CREATE POLICY "document_types_select_org" ON public.opura_dms_document_types
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

DROP POLICY IF EXISTS "document_types_write_org" ON public.opura_dms_document_types;
CREATE POLICY "document_types_write_org" ON public.opura_dms_document_types
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

-- Políticas Anon (Regra 8)
DROP POLICY IF EXISTS "Allow anon all on opura_dms_document_types" ON public.opura_dms_document_types;
CREATE POLICY "Allow anon all on opura_dms_document_types" ON public.opura_dms_document_types
  FOR ALL TO anon USING (true) WITH CHECK (true);
