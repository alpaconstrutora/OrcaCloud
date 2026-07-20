-- migration: 20270819000006_empreendimento_types.sql
-- Gestão dinâmica de Tipos de Empreendimento (Configurações do Sistema).
-- Substitui o enum hardcoded (VERTICAL/HORIZONTAL/MISTO/COND_LOGISTICO/COND_INDUSTRIAL)
-- por catálogo gerenciável por organização — mesmo padrão de obra_types (20260612000008).
--
-- `motor_category` é o campo crítico: o motor de Áreas NBR 12721
-- (services/areaEngineService.ts → mapEmpreendimentoTipo) usa esse valor para
-- classificar o empreendimento em vertical/horizontal/mixed/commercial. Sem
-- essa coluna, um tipo novo cairia no default 'vertical' silenciosamente.
--
-- Os 5 tipos do sistema usam slug IGUAL ao valor antigo do enum (ex: 'VERTICAL')
-- de propósito — dados já gravados em empreendimentos.tipo continuam válidos
-- sem precisar de backfill.

CREATE TABLE IF NOT EXISTS public.empreendimento_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  motor_category  TEXT NOT NULL CHECK (motor_category IN ('vertical','horizontal','mixed','commercial')),
  color           TEXT NOT NULL DEFAULT 'gray',
  description     TEXT,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  active          BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT empreendimento_types_slug_org_unique UNIQUE (organization_id, slug)
);

-- Tipos do sistema (organization_id NULL = global) — slugs iguais ao enum antigo
INSERT INTO public.empreendimento_types (name, slug, motor_category, color, is_system, sort_order) VALUES
  ('Vertical',               'VERTICAL',        'vertical',   'blue',    true, 1),
  ('Horizontal',             'HORIZONTAL',      'horizontal', 'emerald', true, 2),
  ('Misto',                  'MISTO',           'mixed',      'purple',  true, 3),
  ('Condomínio Logístico',   'COND_LOGISTICO',  'commercial', 'amber',   true, 4),
  ('Condomínio Industrial',  'COND_INDUSTRIAL', 'commercial', 'orange',  true, 5)
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE public.empreendimento_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "empreendimento_types_read"   ON public.empreendimento_types;
DROP POLICY IF EXISTS "empreendimento_types_insert" ON public.empreendimento_types;
DROP POLICY IF EXISTS "empreendimento_types_update" ON public.empreendimento_types;
DROP POLICY IF EXISTS "empreendimento_types_delete" ON public.empreendimento_types;

-- Leitura: qualquer usuário autenticado vê os tipos do sistema (org null) e os da sua org.
-- Não depende de activeOrganizationId — "Todas as organizações" continua enxergando os globais.
CREATE POLICY "empreendimento_types_read" ON public.empreendimento_types
  FOR SELECT USING (
    organization_id IS NULL
    OR organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Escrita: apenas membros da organização dona do tipo (tipos do sistema são somente leitura)
CREATE POLICY "empreendimento_types_insert" ON public.empreendimento_types
  FOR INSERT WITH CHECK (
    is_system = false
    AND organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "empreendimento_types_update" ON public.empreendimento_types
  FOR UPDATE USING (
    is_system = false
    AND organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "empreendimento_types_delete" ON public.empreendimento_types
  FOR DELETE USING (
    is_system = false
    AND organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_empreendimento_types_org ON public.empreendimento_types(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_empreendimento_types_system ON public.empreendimento_types(is_system) WHERE is_system = true;

-- Dropar o CHECK constraint que restringia empreendimentos.tipo aos 5 valores hardcoded.
-- lock_timeout curto: ALTER TABLE pega AccessExclusiveLock e a tela de Empreendimentos
-- lê essa tabela o tempo todo — mesma defesa usada em 20270819000004 (ver o comentário lá
-- para o porquê de 800ms e não um valor maior).
SET lock_timeout = '800ms';
ALTER TABLE public.empreendimentos DROP CONSTRAINT IF EXISTS empreendimentos_tipo_check;
RESET lock_timeout;

-- FIM: 20270819000006_empreendimento_types.sql
