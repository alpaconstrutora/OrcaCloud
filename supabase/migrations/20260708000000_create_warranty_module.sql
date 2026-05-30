-- ============================================================
-- Módulo: Pós-Obra & Garantia — WarrantyClaim Aggregate
-- OrçaCloud SaaS · Migration 20260708000000
-- Padrão: clone adaptado de 20260514000000_create_quality_module.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. TABELA DE PRAZOS DE GARANTIA — NBR 17170 / Código Civil
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.warranty_terms (
  code        TEXT PRIMARY KEY,
  descricao   TEXT NOT NULL,
  prazo_meses INT  NOT NULL CHECK (prazo_meses > 0),
  base_legal  TEXT,            -- ex: "NBR 17170:2022 item 4.3 / CC art. 618"
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.warranty_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warranty_terms_read"
  ON public.warranty_terms FOR SELECT TO authenticated USING (true);

-- Seed NBR 17170:2022 (principal norma de garantias da construção civil no Brasil)
INSERT INTO public.warranty_terms (code, descricao, prazo_meses, base_legal) VALUES
  ('ESTRUTURA',       'Estrutura e fundação',                               60, 'CC art. 618 / NBR 17170'),
  ('IMPERMEABILIZACAO','Impermeabilização de lajes, piscinas e reservatórios', 36, 'NBR 17170'),
  ('VEDACAO',         'Vedações verticais externas e internas',              24, 'NBR 17170'),
  ('REVESTIMENTO',    'Revestimentos de paredes, pisos e tetos',             24, 'NBR 17170'),
  ('COBERTURA',       'Telhado e cobertura',                                 24, 'NBR 17170'),
  ('INSTALACOES',     'Instalações hidrossanitárias, elétricas e gás',       24, 'NBR 17170'),
  ('EQUIPAMENTOS',    'Equipamentos e aparelhos industrializados',            12, 'NBR 17170 / garantia fabricante'),
  ('PINTURA',         'Pintura interna e externa',                           12, 'NBR 17170'),
  ('ACABAMENTO',      'Componentes de acabamento (louças, metais, portas)',   12, 'NBR 17170')
ON CONFLICT (code) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 2. AGGREGATE ROOT — warranty_claims
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.warranty_claims (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Contexto da obra e cliente
  project_id      UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  client_id       UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name     TEXT,               -- snapshot no momento da abertura
  unidade_ref     TEXT,               -- identificador da unidade/apartamento/área

  -- Sistema construtivo afetado
  warranty_term_code TEXT REFERENCES public.warranty_terms(code) ON DELETE RESTRICT,
  sistema_descricao  TEXT NOT NULL,   -- descrição livre do sistema afetado
  local_afetado      TEXT,            -- cômodo, fachada, etc.

  -- Detalhes da ocorrência
  descricao       TEXT NOT NULL,
  severity        TEXT NOT NULL DEFAULT 'media'
                  CHECK (severity IN ('baixa', 'media', 'alta', 'critica')),

  -- Estado do chamado
  state           TEXT NOT NULL DEFAULT 'ABERTO'
                  CHECK (state IN (
                    'ABERTO', 'TRIAGEM', 'EM_GARANTIA', 'FORA_GARANTIA',
                    'VISITA_AGENDADA', 'EM_REPARO', 'CONCLUIDO',
                    'CONTESTADO', 'REABERTO', 'ENCERRADO'
                  )),

  -- Cobertura de garantia (calculada na triagem)
  in_warranty           BOOLEAN,     -- NULL enquanto não triado
  warranty_expires_at   DATE,        -- data_entrega + prazo_meses (definida na triagem)
  fora_garantia_motivo  TEXT,        -- motivo quando in_warranty = false

  -- Responsabilidade (construtora, fornecedor, proprietário, uso indevido)
  responsible_party TEXT
    CHECK (responsible_party IN (
      'construtora', 'fornecedor', 'proprietario',
      'uso_inadequado', 'indeterminado'
    )),
  responsible_notes TEXT,

  -- Custos (preenchido ao concluir)
  custo_estimado  NUMERIC(15,2),
  custo_real      NUMERIC(15,2),

  -- Satisfação do cliente (NPS ao encerrar)
  nps_nota        INT CHECK (nps_nota BETWEEN 0 AND 10),
  nps_comentario  TEXT,

  -- Atores (ActorReference jsonb para manter snapshot)
  opened_by       JSONB NOT NULL,    -- { actorId, actorType, name }
  triaged_by      JSONB,
  closed_by       JSONB,

  -- SLA (definido na triagem, calculado por severity)
  sla_deadline    DATE,

  -- Controle de concorrência otimista
  version         INT NOT NULL DEFAULT 1,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warranty_claims_org
  ON public.warranty_claims(organization_id, state);

CREATE INDEX IF NOT EXISTS idx_warranty_claims_project
  ON public.warranty_claims(project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_warranty_claims_client
  ON public.warranty_claims(client_id)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_warranty_claims_sla
  ON public.warranty_claims(sla_deadline)
  WHERE state NOT IN ('ENCERRADO', 'FORA_GARANTIA');

-- ────────────────────────────────────────────────────────────
-- 3. VISITAS TÉCNICAS — warranty_claim_visits
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.warranty_claim_visits (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  claim_id        UUID NOT NULL REFERENCES public.warranty_claims(id) ON DELETE CASCADE,

  scheduled_at    TIMESTAMPTZ NOT NULL,
  realized_at     TIMESTAMPTZ,
  technician_name TEXT NOT NULL,
  technician_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  status          TEXT NOT NULL DEFAULT 'AGENDADA'
                  CHECK (status IN ('AGENDADA', 'REALIZADA', 'CANCELADA', 'REAGENDADA')),

  -- Relatório da visita (preenchido após realização)
  diagnostico     TEXT,
  parecer         TEXT,     -- 'EM_GARANTIA' | 'FORA_GARANTIA' | 'AGUARDANDO_LAUDO'
  acao_definida   TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warranty_visits_claim
  ON public.warranty_claim_visits(claim_id);

-- ────────────────────────────────────────────────────────────
-- 4. EVIDÊNCIAS — warranty_claim_evidence
-- (espelha condition_evidence; bucket próprio)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.warranty_claim_evidence (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  claim_id        UUID NOT NULL REFERENCES public.warranty_claims(id) ON DELETE RESTRICT,

  type            TEXT NOT NULL
                  CHECK (type IN ('photo', 'video', 'audio', 'document', 'signature')),
  url             TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      INT  NOT NULL CHECK (size_bytes > 0),

  captured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  captured_by     JSONB NOT NULL,    -- ActorReference snapshot

  -- Contexto: aonde foi anexado
  attached_to     TEXT NOT NULL DEFAULT 'claim'
                  CHECK (attached_to IN ('claim', 'visit', 'repair')),
  attached_to_ref UUID,

  superseded      BOOLEAN NOT NULL DEFAULT false,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warranty_evidence_claim
  ON public.warranty_claim_evidence(claim_id)
  WHERE superseded = false;

-- ────────────────────────────────────────────────────────────
-- 5. AUDIT LOG — warranty_claim_events (append-only)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.warranty_claim_events (
  event_id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   UUID NOT NULL,
  claim_id          UUID NOT NULL,
  event_type        TEXT NOT NULL,
  -- ex: 'ClaimOpened', 'ClaimTriaged', 'VisitScheduled', 'RepairStarted', 'ClaimClosed'
  payload           JSONB NOT NULL,
  actor_id          UUID,
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  aggregate_version INT  NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_warranty_events_claim
  ON public.warranty_claim_events(claim_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_warranty_events_org
  ON public.warranty_claim_events(organization_id, event_type, occurred_at DESC);

-- ────────────────────────────────────────────────────────────
-- 6. TRIGGER updated_at
-- ────────────────────────────────────────────────────────────

-- Reusar set_updated_at() que já existe (criada em 20260514000000)
DROP TRIGGER IF EXISTS set_warranty_claims_updated_at ON public.warranty_claims;
CREATE TRIGGER set_warranty_claims_updated_at
  BEFORE UPDATE ON public.warranty_claims
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 7. RLS
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.warranty_claims         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranty_claim_visits   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranty_claim_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranty_claim_events   ENABLE ROW LEVEL SECURITY;

-- warranty_claims
DROP POLICY IF EXISTS "warranty_claims_select" ON public.warranty_claims;
CREATE POLICY "warranty_claims_select"
  ON public.warranty_claims FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

DROP POLICY IF EXISTS "warranty_claims_insert" ON public.warranty_claims;
CREATE POLICY "warranty_claims_insert"
  ON public.warranty_claims FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

DROP POLICY IF EXISTS "warranty_claims_update" ON public.warranty_claims;
CREATE POLICY "warranty_claims_update"
  ON public.warranty_claims FOR UPDATE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

-- warranty_claim_visits
DROP POLICY IF EXISTS "warranty_visits_access" ON public.warranty_claim_visits;
CREATE POLICY "warranty_visits_access"
  ON public.warranty_claim_visits FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

-- warranty_claim_evidence
DROP POLICY IF EXISTS "warranty_evidence_select" ON public.warranty_claim_evidence;
CREATE POLICY "warranty_evidence_select"
  ON public.warranty_claim_evidence FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

DROP POLICY IF EXISTS "warranty_evidence_insert" ON public.warranty_claim_evidence;
CREATE POLICY "warranty_evidence_insert"
  ON public.warranty_claim_evidence FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

-- warranty_claim_events: SELECT + INSERT; UPDATE/DELETE bloqueados
DROP POLICY IF EXISTS "warranty_events_select" ON public.warranty_claim_events;
CREATE POLICY "warranty_events_select"
  ON public.warranty_claim_events FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

DROP POLICY IF EXISTS "warranty_events_insert" ON public.warranty_claim_events;
CREATE POLICY "warranty_events_insert"
  ON public.warranty_claim_events FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

-- ────────────────────────────────────────────────────────────
-- 8. RPCs — open_warranty_claim / triage_claim / schedule_visit
--           complete_repair / close_claim
-- Todos: SET search_path = public, pg_temp (corrige DB-C2 da auditoria)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.open_warranty_claim(
  p_organization_id UUID,
  p_project_id      UUID,
  p_client_id       UUID,
  p_client_name     TEXT,
  p_unidade_ref     TEXT,
  p_sistema_descricao TEXT,
  p_local_afetado   TEXT,
  p_descricao       TEXT,
  p_severity        TEXT,
  p_warranty_term_code TEXT,
  p_opened_by       JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.warranty_claims (
    organization_id, project_id, client_id, client_name, unidade_ref,
    sistema_descricao, local_afetado, descricao, severity,
    warranty_term_code, state, opened_by, version
  ) VALUES (
    p_organization_id, p_project_id, p_client_id, p_client_name, p_unidade_ref,
    p_sistema_descricao, p_local_afetado, p_descricao, p_severity,
    p_warranty_term_code, 'ABERTO', p_opened_by, 1
  ) RETURNING id INTO v_id;

  INSERT INTO public.warranty_claim_events (
    organization_id, claim_id, event_type, payload, aggregate_version
  ) VALUES (
    p_organization_id, v_id, 'ClaimOpened',
    jsonb_build_object(
      'state', 'ABERTO', 'severity', p_severity,
      'sistema', p_sistema_descricao, 'actor', p_opened_by
    ), 1
  );

  RETURN jsonb_build_object('id', v_id, 'version', 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.triage_warranty_claim(
  p_claim_id        UUID,
  p_organization_id UUID,
  p_expected_version INT,
  p_in_warranty     BOOLEAN,
  p_warranty_expires_at DATE,
  p_sla_deadline    DATE,
  p_fora_garantia_motivo TEXT,
  p_triaged_by      JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_version INT;
  v_new_state       TEXT;
BEGIN
  SELECT version INTO v_current_version
    FROM public.warranty_claims
   WHERE id = p_claim_id AND organization_id = p_organization_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chamado não encontrado';
  END IF;
  IF v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'CONCURRENCY_CONFLICT: versão % esperada, % encontrada',
      p_expected_version, v_current_version;
  END IF;

  v_new_state := CASE WHEN p_in_warranty THEN 'EM_GARANTIA' ELSE 'FORA_GARANTIA' END;

  UPDATE public.warranty_claims SET
    state                  = v_new_state,
    in_warranty            = p_in_warranty,
    warranty_expires_at    = p_warranty_expires_at,
    sla_deadline           = p_sla_deadline,
    fora_garantia_motivo   = p_fora_garantia_motivo,
    triaged_by             = p_triaged_by,
    version                = v_current_version + 1
  WHERE id = p_claim_id AND organization_id = p_organization_id;

  INSERT INTO public.warranty_claim_events (
    organization_id, claim_id, event_type, payload, aggregate_version
  ) VALUES (
    p_organization_id, p_claim_id, 'ClaimTriaged',
    jsonb_build_object(
      'state', v_new_state, 'in_warranty', p_in_warranty,
      'sla_deadline', p_sla_deadline, 'actor', p_triaged_by
    ), v_current_version + 1
  );

  RETURN jsonb_build_object('version', v_current_version + 1, 'new_state', v_new_state);
END;
$$;

CREATE OR REPLACE FUNCTION public.schedule_warranty_visit(
  p_claim_id          UUID,
  p_organization_id   UUID,
  p_expected_version  INT,
  p_scheduled_at      TIMESTAMPTZ,
  p_technician_name   TEXT,
  p_technician_id     UUID,
  p_actor             JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_version INT;
  v_visit_id        UUID;
BEGIN
  SELECT version INTO v_current_version
    FROM public.warranty_claims
   WHERE id = p_claim_id AND organization_id = p_organization_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Chamado não encontrado'; END IF;
  IF v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'CONCURRENCY_CONFLICT';
  END IF;

  INSERT INTO public.warranty_claim_visits (
    organization_id, claim_id, scheduled_at, technician_name, technician_id, status
  ) VALUES (
    p_organization_id, p_claim_id, p_scheduled_at, p_technician_name, p_technician_id, 'AGENDADA'
  ) RETURNING id INTO v_visit_id;

  UPDATE public.warranty_claims SET
    state   = 'VISITA_AGENDADA',
    version = v_current_version + 1
  WHERE id = p_claim_id AND organization_id = p_organization_id;

  INSERT INTO public.warranty_claim_events (
    organization_id, claim_id, event_type, payload, aggregate_version
  ) VALUES (
    p_organization_id, p_claim_id, 'VisitScheduled',
    jsonb_build_object('visit_id', v_visit_id, 'scheduled_at', p_scheduled_at, 'actor', p_actor),
    v_current_version + 1
  );

  RETURN jsonb_build_object('visit_id', v_visit_id, 'version', v_current_version + 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_warranty_claim(
  p_claim_id          UUID,
  p_organization_id   UUID,
  p_expected_version  INT,
  p_custo_real        NUMERIC,
  p_nps_nota          INT,
  p_nps_comentario    TEXT,
  p_closed_by         JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_version INT;
BEGIN
  SELECT version INTO v_current_version
    FROM public.warranty_claims
   WHERE id = p_claim_id AND organization_id = p_organization_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Chamado não encontrado'; END IF;
  IF v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'CONCURRENCY_CONFLICT';
  END IF;

  UPDATE public.warranty_claims SET
    state           = 'ENCERRADO',
    custo_real      = p_custo_real,
    nps_nota        = p_nps_nota,
    nps_comentario  = p_nps_comentario,
    closed_by       = p_closed_by,
    version         = v_current_version + 1
  WHERE id = p_claim_id AND organization_id = p_organization_id;

  INSERT INTO public.warranty_claim_events (
    organization_id, claim_id, event_type, payload, aggregate_version
  ) VALUES (
    p_organization_id, p_claim_id, 'ClaimClosed',
    jsonb_build_object(
      'custo_real', p_custo_real, 'nps_nota', p_nps_nota, 'actor', p_closed_by
    ), v_current_version + 1
  );

  RETURN jsonb_build_object('version', v_current_version + 1);
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 9. STORAGE BUCKET — warranty-evidence (privado)
-- ────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'warranty-evidence', 'warranty-evidence', false, 52428800,
  ARRAY[
    'image/jpeg','image/png','image/webp','image/heic',
    'video/mp4','video/quicktime',
    'audio/mpeg','audio/wav',
    'application/pdf','application/octet-stream'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Path: {organizationId}/warranty/{claimId}/{evidenceId}/{filename}
DROP POLICY IF EXISTS "warranty_evidence_upload" ON storage.objects;
CREATE POLICY "warranty_evidence_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'warranty-evidence'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::TEXT FROM public.organization_members
      WHERE email = auth.jwt()->>'email'
    )
  );

DROP POLICY IF EXISTS "warranty_evidence_read" ON storage.objects;
CREATE POLICY "warranty_evidence_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'warranty-evidence'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::TEXT FROM public.organization_members
      WHERE email = auth.jwt()->>'email'
    )
  );

-- ────────────────────────────────────────────────────────────
-- 10. POLICY ANON PARA DEV (Regra 8 das Regras de Ouro)
-- ────────────────────────────────────────────────────────────

CREATE POLICY "anon_warranty_claims_dev"
  ON public.warranty_claims FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_warranty_visits_dev"
  ON public.warranty_claim_visits FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_warranty_evidence_dev"
  ON public.warranty_claim_evidence FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_warranty_events_dev"
  ON public.warranty_claim_events FOR ALL TO anon USING (true) WITH CHECK (true);

-- FIM: 20260708000000_create_warranty_module.sql
