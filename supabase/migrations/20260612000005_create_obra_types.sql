-- Gestão dinâmica de tipos de obra
-- Substitui o enum hardcoded por tabela gerenciável por organização

CREATE TABLE IF NOT EXISTS public.obra_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  color           TEXT NOT NULL DEFAULT 'gray',
  description     TEXT,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  active          BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT obra_types_slug_org_unique UNIQUE (organization_id, slug)
);

-- Tipos do sistema (organization_id NULL = global)
INSERT INTO public.obra_types (name, slug, color, is_system, sort_order) VALUES
  ('Residencial Multifamiliar (Prédio)', 'residencial_multifamiliar', 'blue',    true, 1),
  ('Casa Residencial',                   'casa',                      'emerald', true, 2),
  ('Loja Comercial',                     'loja',                      'orange',  true, 3),
  ('Sala Comercial / Escritório',        'sala',                      'purple',  true, 4),
  ('Galpão Industrial / Logístico',      'galpao',                    'amber',   true, 5),
  ('Reforma / Manutenção',               'reforma',                   'rose',    true, 6),
  ('Outro',                              'outro',                     'gray',    true, 7)
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE public.obra_types ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário autenticado pode ver tipos do sistema (org null) e os da sua org
CREATE POLICY "obra_types_read" ON public.obra_types
  FOR SELECT USING (
    organization_id IS NULL
    OR organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Escrita: apenas membros da organização dona do tipo
CREATE POLICY "obra_types_insert" ON public.obra_types
  FOR INSERT WITH CHECK (
    is_system = false
    AND organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "obra_types_update" ON public.obra_types
  FOR UPDATE USING (
    is_system = false
    AND organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "obra_types_delete" ON public.obra_types
  FOR DELETE USING (
    is_system = false
    AND organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Dropar o CHECK constraint que restringia tipo_obra aos 7 valores hardcoded
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_tipo_obra_check;

CREATE INDEX IF NOT EXISTS idx_obra_types_org ON public.obra_types(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_obra_types_system ON public.obra_types(is_system) WHERE is_system = true;
