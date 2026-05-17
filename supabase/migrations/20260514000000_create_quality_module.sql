-- ============================================================
-- Módulo: Qualidade & Entrega — ConstructionCondition Aggregate
-- OrçaCloud SaaS · Migration 20260514000000
-- Versão do design: v0.2
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. TAXONOMIA CONTROLADA (lookup tables — sem seed; seed via painel admin)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.condition_taxonomy_systems (
  code       TEXT PRIMARY KEY,                     -- ex: "HID"
  name       TEXT NOT NULL,                        -- ex: "Hidráulico"
  norm_ref   TEXT,                                 -- ex: "NBR 5626, NBR 8160"
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.condition_taxonomy_pathologies (
  code        TEXT PRIMARY KEY,                    -- ex: "HID.VAZ"
  name        TEXT NOT NULL,                       -- ex: "Vazamento"
  system_code TEXT NOT NULL
              REFERENCES public.condition_taxonomy_systems(code) ON DELETE RESTRICT,
  definition  TEXT,
  norm_ref    TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pathologies_system
  ON public.condition_taxonomy_pathologies(system_code);

-- ────────────────────────────────────────────────────────────
-- 2. AGGREGATE ROOT — construction_conditions
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.construction_conditions (
  -- tenant isolation (primeiro campo — índice composto primário)
  organization_id       UUID NOT NULL
                        REFERENCES public.organizations(id) ON DELETE CASCADE,
  id                    UUID NOT NULL DEFAULT gen_random_uuid(),

  -- localização do ativo (AssetReference)
  asset_empreendimento_id UUID NOT NULL,
  asset_bloco_id          UUID,
  asset_torre_id          UUID,
  asset_unidade_id        UUID,
  asset_ambiente_id       UUID,
  asset_componente_id     UUID,
  asset_floor_plan_ref    JSONB,
  -- { planVersionId: UUID, xPct: float 0-1, yPct: float 0-1 }

  -- taxonomia dual (C10)
  provisional_taxonomy  JSONB,
  -- { systemCode: text, pathologyCode?: text, normRef?: text }
  -- preenchida em DETECTED, pode ter pathologyCode nulo
  taxonomy              JSONB,
  -- { systemCode: text, pathologyCode: text, normRef?: text }
  -- confirmada em CLASSIFIED, ambos obrigatórios e validados

  -- estado e classificação
  state    TEXT NOT NULL DEFAULT 'DETECTED'
           CHECK (state IN (
             'DETECTED', 'CLASSIFIED', 'ACTION_REQUIRED',
             'IN_REPAIR', 'REPAIRED', 'VALIDATED',
             'CONTESTED', 'ESCALATED', 'REOPENED', 'CLOSED'
           )),
  severity TEXT NOT NULL
           CHECK (severity IN ('baixa', 'media', 'alta', 'critica')),
  origin   TEXT NOT NULL
           CHECK (origin IN (
             'execucao', 'material', 'projeto',
             'uso', 'manutencao', 'indeterminada'
           )),

  -- qualidade do registro (calculado — nunca editado diretamente)
  quality_score JSONB,
  -- {
  --   value: int 0-100,
  --   completeness: float,      peso 35
  --   evidenceDensity: float,   peso 30
  --   taxonomicConsistency: float, peso 20
  --   geoPresence: bool,        peso 10
  --   signaturePresent: bool,   peso 5
  --   calculatedAt: timestamp
  -- }

  -- detecção (imutável após criação)
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  detected_by JSONB NOT NULL,
  -- ActorReference: { actorId, actorType, name, roleAtTime? }
  -- actorType: 'user' | 'client' | 'external_inspector' | 'system'

  -- condições causalmente relacionadas
  related_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- RelatedCondition[]: [{ conditionId, linkType, linkedAt, linkedBy, notes? }]
  -- linkType: 'suspected_cause' | 'confirmed_cause' | 'related_symptom'

  -- controle de concorrência otimista
  version    INTEGER NOT NULL DEFAULT 1,

  -- timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (id)
);

-- Índice composto principal (tenant + id — usado em todos os comandos)
CREATE UNIQUE INDEX IF NOT EXISTS idx_conditions_org_id
  ON public.construction_conditions(organization_id, id);

-- Índices de consulta frequente
CREATE INDEX IF NOT EXISTS idx_conditions_state
  ON public.construction_conditions(organization_id, state);

CREATE INDEX IF NOT EXISTS idx_conditions_asset
  ON public.construction_conditions(organization_id, asset_empreendimento_id);

CREATE INDEX IF NOT EXISTS idx_conditions_severity
  ON public.construction_conditions(organization_id, severity)
  WHERE state NOT IN ('CLOSED', 'VALIDATED');

-- ────────────────────────────────────────────────────────────
-- 3. EVIDÊNCIAS — condition_evidence
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.condition_evidence (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL
                  REFERENCES public.organizations(id) ON DELETE CASCADE,
  condition_id    UUID NOT NULL
                  REFERENCES public.construction_conditions(id) ON DELETE RESTRICT,

  type         TEXT NOT NULL
               CHECK (type IN ('photo', 'video', 'audio', 'document', 'signature')),
  url          TEXT NOT NULL,        -- path no object storage (nunca blob)
  mime_type    TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL CHECK (size_bytes > 0),
  geo_ref      JSONB,
  -- { latitude?, longitude?, accuracy?, capturedAt }

  captured_at  TIMESTAMPTZ NOT NULL, -- timestamp do dispositivo, imutável
  captured_by  JSONB NOT NULL,       -- ActorReference snapshot
  checksum     TEXT NOT NULL,        -- SHA-256

  -- supersession (nunca delete físico)
  superseded    BOOLEAN NOT NULL DEFAULT false,
  superseded_by UUID REFERENCES public.condition_evidence(id) ON DELETE RESTRICT,
  superseded_at TIMESTAMPTZ,

  -- contexto de uso: onde essa evidence foi anexada
  -- 'condition' | 'step' | 'validation' | 'contestation' | 'escalation'
  attached_to      TEXT NOT NULL DEFAULT 'condition',
  attached_to_ref  UUID,  -- id do step, validation, contestation etc.

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evidence_condition
  ON public.condition_evidence(condition_id)
  WHERE superseded = false;

CREATE INDEX IF NOT EXISTS idx_evidence_org_condition
  ON public.condition_evidence(organization_id, condition_id);

-- ────────────────────────────────────────────────────────────
-- 4. PLANOS DE AÇÃO — condition_action_plans
--    Imutável após criação; revisões criam novo registro com previousPlanId
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.condition_action_plans (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL
                  REFERENCES public.organizations(id) ON DELETE CASCADE,
  condition_id    UUID NOT NULL
                  REFERENCES public.construction_conditions(id) ON DELETE RESTRICT,

  description     TEXT NOT NULL,
  assigned_to     JSONB NOT NULL,    -- ActorReference snapshot
  sla_deadline    DATE NOT NULL,
  estimated_cost  JSONB,             -- { amount: decimal, currency: 'BRL' }
  steps           JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- ActionStep[]: [{ id, description, completedAt?, completedBy?, evidenceIds[] }]

  -- cadeia de revisões
  previous_plan_id UUID REFERENCES public.condition_action_plans(id) ON DELETE RESTRICT,
  revision_reason  TEXT,             -- obrigatório se previous_plan_id não nulo

  -- apenas o plano corrente tem is_current = true
  is_current BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by JSONB NOT NULL          -- ActorReference snapshot
);

CREATE INDEX IF NOT EXISTS idx_action_plans_condition
  ON public.condition_action_plans(condition_id)
  WHERE is_current = true;

-- Garante no máximo 1 plano corrente por condição
CREATE UNIQUE INDEX IF NOT EXISTS idx_action_plans_one_current
  ON public.condition_action_plans(condition_id)
  WHERE is_current = true;

-- ────────────────────────────────────────────────────────────
-- 5. ATRIBUIÇÃO DE RESPONSABILIDADE — condition_responsibilities
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.condition_responsibilities (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL
                  REFERENCES public.organizations(id) ON DELETE CASCADE,
  condition_id    UUID NOT NULL
                  REFERENCES public.construction_conditions(id) ON DELETE RESTRICT,

  responsible_party TEXT NOT NULL
                    CHECK (responsible_party IN (
                      'construtora', 'fornecedor', 'proprietario',
                      'uso_inadequado', 'indeterminado'
                    )),
  justification   TEXT NOT NULL,
  related_norm    TEXT,              -- ex: "NBR 15575-2:2013 seção 11.2"

  assigned_by  JSONB NOT NULL,       -- ActorReference snapshot
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (condition_id)              -- uma responsabilidade por condição
);

-- ────────────────────────────────────────────────────────────
-- 6. VALIDAÇÕES — condition_validations
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.condition_validations (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL
                  REFERENCES public.organizations(id) ON DELETE CASCADE,
  condition_id    UUID NOT NULL
                  REFERENCES public.construction_conditions(id) ON DELETE RESTRICT,

  result       TEXT NOT NULL
               CHECK (result IN ('approved', 'rejected', 'requires_correction')),
  notes        TEXT,
  validated_by JSONB NOT NULL,       -- ActorReference snapshot
  validated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  -- evidências da validação referenciadas via condition_evidence.attached_to='validation'
);

CREATE INDEX IF NOT EXISTS idx_validations_condition
  ON public.condition_validations(condition_id);

-- ────────────────────────────────────────────────────────────
-- 7. CONTESTAÇÕES — condition_contestations
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.condition_contestations (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL
                  REFERENCES public.organizations(id) ON DELETE CASCADE,
  condition_id    UUID NOT NULL
                  REFERENCES public.construction_conditions(id) ON DELETE RESTRICT,

  -- abertura
  contested_by  JSONB NOT NULL,      -- ActorReference snapshot
  contested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  basis         TEXT NOT NULL,       -- fundamentação técnica ou jurídica
  sla_deadline  DATE NOT NULL,

  -- ciclo de vida
  state TEXT NOT NULL DEFAULT 'open'
        CHECK (state IN ('open', 'responded', 'resolved', 'escalated')),

  -- resposta (C3: semântica explícita)
  repair_accepted BOOLEAN,           -- true = reparo OK (contestação improcedente)
                                     -- false = reparo insuficiente (contestação procedente)
  responded_by  JSONB,               -- ActorReference snapshot
  responded_at  TIMESTAMPTZ,
  justification TEXT,
  resolved_at   TIMESTAMPTZ
  -- evidências via condition_evidence.attached_to='contestation'
);

CREATE INDEX IF NOT EXISTS idx_contestations_condition
  ON public.condition_contestations(condition_id);

CREATE INDEX IF NOT EXISTS idx_contestations_sla
  ON public.condition_contestations(sla_deadline)
  WHERE state = 'open';              -- usado pelo SLA enforcement

-- ────────────────────────────────────────────────────────────
-- 8. AUDIT LOG — condition_events (append-only, nunca update/delete)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.condition_events (
  event_id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   UUID NOT NULL,   -- sem FK para sobreviver a deleções de org (arquivo)
  condition_id      UUID NOT NULL,
  event_type        TEXT NOT NULL,
  -- ex: 'ConditionDetected', 'ConditionClassified', 'RepairStarted' ...
  payload           JSONB NOT NULL,  -- estado relevante no momento — não referências mutáveis
  actor_id          UUID,            -- para queries por ator
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  aggregate_version INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_condition
  ON public.condition_events(condition_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_org_type
  ON public.condition_events(organization_id, event_type, occurred_at DESC);

-- ────────────────────────────────────────────────────────────
-- 9. TRIGGER — updated_at automático
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_conditions_updated_at ON public.construction_conditions;
CREATE TRIGGER set_conditions_updated_at
  BEFORE UPDATE ON public.construction_conditions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 10. RLS — Row Level Security
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.condition_taxonomy_systems     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condition_taxonomy_pathologies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.construction_conditions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condition_evidence             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condition_action_plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condition_responsibilities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condition_validations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condition_contestations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condition_events               ENABLE ROW LEVEL SECURITY;

-- Taxonomia: leitura pública para todos os autenticados (dado de referência)
CREATE POLICY "Taxonomy readable by authenticated"
  ON public.condition_taxonomy_systems FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Taxonomy readable by authenticated"
  ON public.condition_taxonomy_pathologies FOR SELECT TO authenticated
  USING (true);

-- Macro: helper de isolamento de tenant
-- (inline subquery — mesmo padrão usado no resto do projeto)

-- construction_conditions
DROP POLICY IF EXISTS "Org members can view conditions" ON public.construction_conditions;
CREATE POLICY "Org members can view conditions"
  ON public.construction_conditions FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

-- Insert só via RPC (detect_condition) — mas precisamos de INSERT policy
-- para o RPC funcionar com SECURITY DEFINER se necessário.
-- Usando SECURITY INVOKER nos RPCs, a policy de INSERT é necessária.
DROP POLICY IF EXISTS "Org members can insert conditions" ON public.construction_conditions;
CREATE POLICY "Org members can insert conditions"
  ON public.construction_conditions FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

-- UPDATE via RPC — a RPC valida tenant antes de qualquer mudança
DROP POLICY IF EXISTS "Org members can update conditions" ON public.construction_conditions;
CREATE POLICY "Org members can update conditions"
  ON public.construction_conditions FOR UPDATE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

-- Nunca DELETE direto — condições são imutáveis após fechamento
-- (sem política de DELETE = bloqueado por padrão)

-- condition_evidence
DROP POLICY IF EXISTS "Org members can manage evidence" ON public.condition_evidence;
CREATE POLICY "Org members can manage evidence"
  ON public.condition_evidence FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

CREATE POLICY "Org members can insert evidence"
  ON public.condition_evidence FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

-- UPDATE apenas para supersession (superseded, superseded_by, superseded_at)
-- DELETE bloqueado (sem policy)
CREATE POLICY "Org members can supersede evidence"
  ON public.condition_evidence FOR UPDATE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

-- condition_action_plans
DROP POLICY IF EXISTS "Org members can view action plans" ON public.condition_action_plans;
CREATE POLICY "Org members can view action plans"
  ON public.condition_action_plans FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

-- condition_responsibilities
DROP POLICY IF EXISTS "Org members can manage responsibilities" ON public.condition_responsibilities;
CREATE POLICY "Org members can manage responsibilities"
  ON public.condition_responsibilities FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

-- condition_validations
DROP POLICY IF EXISTS "Org members can manage validations" ON public.condition_validations;
CREATE POLICY "Org members can manage validations"
  ON public.condition_validations FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

-- condition_contestations
DROP POLICY IF EXISTS "Org members can manage contestations" ON public.condition_contestations;
CREATE POLICY "Org members can manage contestations"
  ON public.condition_contestations FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

-- condition_events — audit log: INSERT permitido, UPDATE e DELETE bloqueados
DROP POLICY IF EXISTS "Org members can view events" ON public.condition_events;
CREATE POLICY "Org members can view events"
  ON public.condition_events FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

CREATE POLICY "Org members can insert events"
  ON public.condition_events FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

-- UPDATE e DELETE em condition_events: sem policy = bloqueado por padrão (append-only garantido)

-- ────────────────────────────────────────────────────────────
-- 11. STORAGE — bucket de evidências (privado, isolado por tenant)
-- ────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'condition-evidence',
  'condition-evidence',
  false,                       -- privado: URLs assinadas, não públicas
  52428800,                    -- 50MB por arquivo
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'video/mp4', 'video/quicktime',
    'audio/mpeg', 'audio/wav', 'audio/m4a',
    'application/pdf',
    'application/octet-stream' -- signatures
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Path pattern: {organizationId}/evidence/{conditionId}/{evidenceId}/{filename}
-- A policy verifica o prefixo para garantir isolamento de tenant

CREATE POLICY "Org members can upload evidence"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'condition-evidence'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::TEXT FROM public.organization_members
      WHERE email = auth.jwt()->>'email'
    )
  );

CREATE POLICY "Org members can read evidence"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'condition-evidence'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::TEXT FROM public.organization_members
      WHERE email = auth.jwt()->>'email'
    )
  );

-- DELETE bloqueado — evidências são imutáveis no storage também
-- (sem policy de DELETE para condition-evidence)

-- ────────────────────────────────────────────────────────────
-- FIM DA MIGRATION
-- Próxima: 20260514000001_quality_module_rpcs.sql
-- ────────────────────────────────────────────────────────────
