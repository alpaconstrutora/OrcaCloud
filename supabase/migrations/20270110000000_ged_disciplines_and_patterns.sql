-- ============================================================
-- Migration: 20270110000000_ged_disciplines_and_patterns.sql
-- Gestão de Nomenclatura e Disciplinas no ÓPURA Docs
-- ============================================================

-- ─── 1. TABELA DE CADASTRO DE DISCIPLINAS ────────────────────
CREATE TABLE IF NOT EXISTS public.opura_dms_disciplines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (organization_id, code)
);

-- Indexação para busca rápida
CREATE INDEX IF NOT EXISTS idx_opura_dms_disciplines_org ON public.opura_dms_disciplines(organization_id);

-- Habilitar RLS
ALTER TABLE public.opura_dms_disciplines ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DROP POLICY IF EXISTS "disciplines_select_org" ON public.opura_dms_disciplines;
CREATE POLICY "disciplines_select_org" ON public.opura_dms_disciplines
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

DROP POLICY IF EXISTS "disciplines_write_org" ON public.opura_dms_disciplines;
CREATE POLICY "disciplines_write_org" ON public.opura_dms_disciplines
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
DROP POLICY IF EXISTS "Allow anon all on opura_dms_disciplines" ON public.opura_dms_disciplines;
CREATE POLICY "Allow anon all on opura_dms_disciplines" ON public.opura_dms_disciplines
  FOR ALL TO anon USING (true) WITH CHECK (true);


-- ─── 2. TABELA DE PADRÕES DE NOMENCLATURA ───────────────────
CREATE TABLE IF NOT EXISTS public.opura_dms_naming_patterns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  mask            TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (organization_id, name)
);

-- Indexação para busca rápida
CREATE INDEX IF NOT EXISTS idx_opura_dms_naming_patterns_org ON public.opura_dms_naming_patterns(organization_id);

-- Habilitar RLS
ALTER TABLE public.opura_dms_naming_patterns ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DROP POLICY IF EXISTS "naming_patterns_select_org" ON public.opura_dms_naming_patterns;
CREATE POLICY "naming_patterns_select_org" ON public.opura_dms_naming_patterns
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

DROP POLICY IF EXISTS "naming_patterns_write_org" ON public.opura_dms_naming_patterns;
CREATE POLICY "naming_patterns_write_org" ON public.opura_dms_naming_patterns
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
DROP POLICY IF EXISTS "Allow anon all on opura_dms_naming_patterns" ON public.opura_dms_naming_patterns;
CREATE POLICY "Allow anon all on opura_dms_naming_patterns" ON public.opura_dms_naming_patterns
  FOR ALL TO anon USING (true) WITH CHECK (true);
