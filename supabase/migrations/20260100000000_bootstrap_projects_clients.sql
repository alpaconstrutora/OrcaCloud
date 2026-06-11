-- Bootstrap: cria tables projects e clients que existiam antes do histórico de migrations.
-- Necessário para que migrations 2024xxxx (que referenciam estas tabelas via FK) possam
-- executar em ambientes novos (db reset / CI). Todas as DDLs usam IF NOT EXISTS para
-- não quebrar o remote, onde estas tabelas já existem.
-- Colunas extras adicionadas por migrations posteriores usam ADD COLUMN IF NOT EXISTS
-- logo abaixo, agrupadas aqui para evitar dependência circular de ordem.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. projects
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    settings    JSONB DEFAULT '{}'::jsonb,
    budget      JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Colunas adicionadas por migrations posteriores (idempotentes)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS code        TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS tipo_obra   TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS regime_obra TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS empresa_id  UUID;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS investor_id UUID;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'projects' AND policyname = 'Allow authenticated all on projects'
  ) THEN
    CREATE POLICY "Allow authenticated all on projects" ON public.projects
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'projects' AND policyname = 'Allow anon all on projects'
  ) THEN
    CREATE POLICY "Allow anon all on projects" ON public.projects
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. clients
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    email           TEXT,
    phone           TEXT,
    document        TEXT,
    type            TEXT CHECK (type IN ('PF', 'PJ')),
    address         TEXT,
    neighborhood    TEXT,
    city            TEXT,
    state           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Colunas adicionadas por migrations posteriores (idempotentes)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS category        TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS client_documents JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS financial_info   JSONB;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS diary_entries    JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS schedule_info    JSONB;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS ai_insight       JSONB;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS visual_gallery   JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'clients' AND policyname = 'clients_org_access'
  ) THEN
    CREATE POLICY "clients_org_access" ON public.clients
      FOR ALL USING (
        organization_id IN (
          SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END;
$$;
