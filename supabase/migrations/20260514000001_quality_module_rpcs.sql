-- ============================================================
-- Módulo: Qualidade & Entrega — RPCs (State Machine + Invariantes)
-- OrçaCloud SaaS · Migration 20260514000001
-- ============================================================
-- Todas as funções são SECURITY INVOKER: as RLS policies da migration
-- anterior se aplicam normalmente. A validação de tenant é feita
-- explicitamente dentro de cada função (invariante 9 do design).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- AUXILIAR: calcular DataQualityScore
-- Pesos: completeness 35 | evidenceDensity 30 | taxonomicConsistency 20
--        geoPresence 10 | signaturePresent 5   (total = 100)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.quality_calculate_score(
  p_condition_id    UUID,
  p_organization_id UUID,
  p_severity        TEXT,
  p_taxonomy        JSONB  -- taxonomy confirmada (pode ser null em DETECTED)
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_evidence_count    INTEGER;
  v_photo_count       INTEGER;
  v_geo_count         INTEGER;
  v_signature_count   INTEGER;
  v_min_evidence      INTEGER;
  v_completeness      FLOAT;
  v_evidence_density  FLOAT;
  v_taxonomic         FLOAT;
  v_geo_presence      BOOLEAN;
  v_signature_present BOOLEAN;
  v_score             INTEGER;
BEGIN
  -- contagens de evidence não-superseded
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE type = 'photo'),
    COUNT(*) FILTER (WHERE geo_ref IS NOT NULL AND type = 'photo'),
    COUNT(*) FILTER (WHERE type = 'signature')
  INTO v_evidence_count, v_photo_count, v_geo_count, v_signature_count
  FROM public.condition_evidence
  WHERE condition_id = p_condition_id
    AND organization_id = p_organization_id
    AND superseded = false;

  -- mínimo de evidências esperado por severidade
  v_min_evidence := CASE p_severity
    WHEN 'critica' THEN 3
    WHEN 'alta'    THEN 2
    ELSE 1
  END;

  -- completeness: tem photo + taxonomy com pathologyCode + responsibility não é avaliada aqui
  -- simplificado: photo presente (50%) + taxonomy completa (50%)
  v_completeness := (
    CASE WHEN v_photo_count > 0 THEN 0.5 ELSE 0.0 END +
    CASE WHEN p_taxonomy IS NOT NULL
              AND p_taxonomy->>'pathologyCode' IS NOT NULL THEN 0.5 ELSE 0.0 END
  );

  -- evidenceDensity: evidências vs mínimo esperado, cap em 1.0
  v_evidence_density := LEAST(v_evidence_count::FLOAT / v_min_evidence::FLOAT, 1.0);

  -- taxonomicConsistency: pathologyCode válido na taxonomia controlada
  v_taxonomic := CASE
    WHEN p_taxonomy IS NOT NULL AND p_taxonomy->>'pathologyCode' IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.condition_taxonomy_pathologies
      WHERE code = p_taxonomy->>'pathologyCode' AND active = true
    ) THEN 1.0
    ELSE 0.0
  END;

  v_geo_presence     := v_geo_count > 0;
  v_signature_present := v_signature_count > 0;

  -- score final (pesos: 35 + 30 + 20 + 10 + 5 = 100)
  v_score := ROUND(
    v_completeness      * 35 +
    v_evidence_density  * 30 +
    v_taxonomic         * 20 +
    CASE WHEN v_geo_presence     THEN 10 ELSE 0 END +
    CASE WHEN v_signature_present THEN 5  ELSE 0 END
  );

  RETURN jsonb_build_object(
    'value',                v_score,
    'completeness',         ROUND(v_completeness::NUMERIC, 3),
    'evidenceDensity',      ROUND(v_evidence_density::NUMERIC, 3),
    'taxonomicConsistency', v_taxonomic,
    'geoPresence',          v_geo_presence,
    'signaturePresent',     v_signature_present,
    'calculatedAt',         now()
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- AUXILIAR INTERNO: emitir domain event no audit log
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.quality_emit_event(
  p_organization_id   UUID,
  p_condition_id      UUID,
  p_event_type        TEXT,
  p_payload           JSONB,
  p_actor_id          UUID,
  p_aggregate_version INTEGER
) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.condition_events
    (organization_id, condition_id, event_type, payload, actor_id,
     occurred_at, aggregate_version)
  VALUES
    (p_organization_id, p_condition_id, p_event_type, p_payload,
     p_actor_id, now(), p_aggregate_version);
END;
$$;

-- ────────────────────────────────────────────────────────────
-- AUXILIAR INTERNO: guard de tenant + versão + estado
-- Retorna o registro travado. Lança exceção se falhar.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.quality_lock_condition(
  p_condition_id      UUID,
  p_organization_id   UUID,
  p_expected_version  INTEGER,
  p_allowed_states    TEXT[]
) RETURNS public.construction_conditions
LANGUAGE plpgsql AS $$
DECLARE
  v_rec public.construction_conditions;
BEGIN
  SELECT * INTO v_rec
  FROM public.construction_conditions
  WHERE id = p_condition_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  -- Nunca revelar existência para tenant errado
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UnauthorizedTenantAccess'
      USING ERRCODE = 'P0001';
  END IF;

  -- Optimistic locking
  IF v_rec.version != p_expected_version THEN
    RAISE EXCEPTION 'ConcurrencyConflict: expected version %, current version %',
      p_expected_version, v_rec.version
      USING ERRCODE = 'P0002';
  END IF;

  -- State guard
  IF NOT (v_rec.state = ANY(p_allowed_states)) THEN
    RAISE EXCEPTION 'InvalidTransition: state % is not in allowed states %',
      v_rec.state, p_allowed_states
      USING ERRCODE = 'P0003';
  END IF;

  RETURN v_rec;
END;
$$;

-- ════════════════════════════════════════════════════════════
-- RPC 1: detect_condition
-- DETECTED (novo aggregate)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.detect_condition(
  p_organization_id      UUID,
  p_asset_empreendimento UUID,
  p_asset_bloco          UUID DEFAULT NULL,
  p_asset_torre          UUID DEFAULT NULL,
  p_asset_unidade        UUID DEFAULT NULL,
  p_asset_ambiente       UUID DEFAULT NULL,
  p_asset_componente     UUID DEFAULT NULL,
  p_asset_floor_plan_ref JSONB DEFAULT NULL,
  p_provisional_taxonomy JSONB DEFAULT NULL,
  p_severity             TEXT DEFAULT 'baixa',
  p_origin               TEXT DEFAULT 'indeterminada',
  p_detected_by          JSONB DEFAULT NULL   -- ActorReference
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_id   UUID := gen_random_uuid();
  v_score JSONB;
BEGIN
  -- Validações de entrada
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'InvariantViolation: organization_id is required'
      USING ERRCODE = 'P0004';
  END IF;

  IF p_severity NOT IN ('baixa', 'media', 'alta', 'critica') THEN
    RAISE EXCEPTION 'InvariantViolation: invalid severity %', p_severity
      USING ERRCODE = 'P0004';
  END IF;

  IF p_origin NOT IN ('execucao', 'material', 'projeto', 'uso', 'manutencao', 'indeterminada') THEN
    RAISE EXCEPTION 'InvariantViolation: invalid origin %', p_origin
      USING ERRCODE = 'P0004';
  END IF;

  -- Verificar que o user pertence à organização
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND email = auth.jwt()->>'email'
  ) THEN
    RAISE EXCEPTION 'UnauthorizedTenantAccess'
      USING ERRCODE = 'P0001';
  END IF;

  -- Inserir aggregate
  INSERT INTO public.construction_conditions (
    id, organization_id,
    asset_empreendimento_id, asset_bloco_id, asset_torre_id,
    asset_unidade_id, asset_ambiente_id, asset_componente_id,
    asset_floor_plan_ref,
    provisional_taxonomy,
    state, severity, origin,
    detected_by, version
  ) VALUES (
    v_id, p_organization_id,
    p_asset_empreendimento, p_asset_bloco, p_asset_torre,
    p_asset_unidade, p_asset_ambiente, p_asset_componente,
    p_asset_floor_plan_ref,
    p_provisional_taxonomy,
    'DETECTED', p_severity, p_origin,
    p_detected_by, 1
  );

  -- Score inicial (sem evidence ainda)
  v_score := public.quality_calculate_score(v_id, p_organization_id, p_severity, NULL);

  UPDATE public.construction_conditions
  SET quality_score = v_score
  WHERE id = v_id;

  -- Domain event
  PERFORM public.quality_emit_event(
    p_organization_id, v_id, 'ConditionDetected',
    jsonb_build_object(
      'conditionId',          v_id,
      'assetEmpreendimento',  p_asset_empreendimento,
      'provisionalTaxonomy',  p_provisional_taxonomy,
      'severity',             p_severity,
      'origin',               p_origin,
      'detectedBy',           p_detected_by,
      'detectedAt',           now(),
      'qualityScore',         v_score
    ),
    (p_detected_by->>'actorId')::UUID, 1
  );

  RETURN jsonb_build_object(
    'conditionId', v_id,
    'version',     1,
    'qualityScore', v_score
  );
END;
$$;

-- ════════════════════════════════════════════════════════════
-- RPC 2: classify_condition
-- DETECTED | REOPENED → CLASSIFIED
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.classify_condition(
  p_condition_id    UUID,
  p_organization_id UUID,
  p_expected_version INTEGER,
  p_taxonomy        JSONB,   -- { systemCode, pathologyCode, normRef? }
  p_severity        TEXT,
  p_origin          TEXT,
  p_classified_by   JSONB    -- ActorReference
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_rec   public.construction_conditions;
  v_score JSONB;
  v_new_version INTEGER;
BEGIN
  v_rec := public.quality_lock_condition(
    p_condition_id, p_organization_id, p_expected_version,
    ARRAY['DETECTED', 'REOPENED']
  );

  -- Invariante: taxonomy completo (ambos obrigatórios)
  IF p_taxonomy->>'systemCode' IS NULL OR p_taxonomy->>'pathologyCode' IS NULL THEN
    RAISE EXCEPTION 'InvariantViolation: taxonomy must have systemCode and pathologyCode for CLASSIFIED'
      USING ERRCODE = 'P0004';
  END IF;

  -- Invariante: pathologyCode válido na taxonomia controlada
  IF NOT EXISTS (
    SELECT 1 FROM public.condition_taxonomy_pathologies
    WHERE code = p_taxonomy->>'pathologyCode' AND active = true
  ) THEN
    RAISE EXCEPTION 'InvariantViolation: pathologyCode % not found in controlled taxonomy',
      p_taxonomy->>'pathologyCode'
      USING ERRCODE = 'P0004';
  END IF;

  -- Invariante: systemCode coerente com pathologyCode
  IF NOT EXISTS (
    SELECT 1 FROM public.condition_taxonomy_pathologies p
    JOIN public.condition_taxonomy_systems s ON s.code = p.system_code
    WHERE p.code = p_taxonomy->>'pathologyCode'
      AND s.code = p_taxonomy->>'systemCode'
  ) THEN
    RAISE EXCEPTION 'InvariantViolation: systemCode % does not match pathologyCode %',
      p_taxonomy->>'systemCode', p_taxonomy->>'pathologyCode'
      USING ERRCODE = 'P0004';
  END IF;

  -- Invariante: ≥ 1 photo não-superseded
  IF (SELECT COUNT(*) FROM public.condition_evidence
      WHERE condition_id = p_condition_id
        AND organization_id = p_organization_id
        AND type = 'photo'
        AND superseded = false) < 1 THEN
    RAISE EXCEPTION 'InvariantViolation: at least 1 non-superseded photo is required to classify'
      USING ERRCODE = 'P0004';
  END IF;

  -- Se REOPENED: exigir evidence nova (adicionada após a reabertura)
  -- (verificação simplificada: ≥ 1 photo adicionada após updated_at da condição)
  IF v_rec.state = 'REOPENED' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.condition_evidence
      WHERE condition_id = p_condition_id
        AND organization_id = p_organization_id
        AND type = 'photo'
        AND superseded = false
        AND created_at > v_rec.updated_at - INTERVAL '1 minute'
    ) THEN
      RAISE EXCEPTION 'InvariantViolation: REOPENED→CLASSIFIED requires new evidence added after reopening'
        USING ERRCODE = 'P0004';
    END IF;
  END IF;

  v_new_version := v_rec.version + 1;
  v_score := public.quality_calculate_score(p_condition_id, p_organization_id, p_severity, p_taxonomy);

  UPDATE public.construction_conditions SET
    state            = 'CLASSIFIED',
    taxonomy         = p_taxonomy,
    severity         = p_severity,
    origin           = p_origin,
    quality_score    = v_score,
    version          = v_new_version
  WHERE id = p_condition_id AND organization_id = p_organization_id;

  PERFORM public.quality_emit_event(
    p_organization_id, p_condition_id, 'ConditionClassified',
    jsonb_build_object(
      'taxonomy',        p_taxonomy,
      'severity',        p_severity,
      'previousSeverity', v_rec.severity,
      'origin',          p_origin,
      'classifiedBy',    p_classified_by,
      'classifiedAt',    now(),
      'qualityScore',    v_score
    ),
    (p_classified_by->>'actorId')::UUID, v_new_version
  );

  RETURN jsonb_build_object('version', v_new_version, 'qualityScore', v_score);
END;
$$;

-- ════════════════════════════════════════════════════════════
-- RPC 3: assign_responsibility
-- Qualquer estado >= CLASSIFIED (sem mudança de estado)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.assign_responsibility(
  p_condition_id      UUID,
  p_organization_id   UUID,
  p_expected_version  INTEGER,
  p_responsible_party TEXT,
  p_justification     TEXT,
  p_related_norm      TEXT DEFAULT NULL,
  p_assigned_by       JSONB DEFAULT NULL  -- ActorReference
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_rec         public.construction_conditions;
  v_new_version INTEGER;
BEGIN
  v_rec := public.quality_lock_condition(
    p_condition_id, p_organization_id, p_expected_version,
    ARRAY['CLASSIFIED', 'ACTION_REQUIRED', 'IN_REPAIR', 'REPAIRED', 'REOPENED']
  );

  IF p_responsible_party NOT IN
    ('construtora', 'fornecedor', 'proprietario', 'uso_inadequado', 'indeterminado') THEN
    RAISE EXCEPTION 'InvariantViolation: invalid responsible_party %', p_responsible_party
      USING ERRCODE = 'P0004';
  END IF;

  -- Upsert (pode ser reatribuída antes de IN_REPAIR)
  INSERT INTO public.condition_responsibilities
    (organization_id, condition_id, responsible_party, justification, related_norm, assigned_by)
  VALUES
    (p_organization_id, p_condition_id, p_responsible_party,
     p_justification, p_related_norm, p_assigned_by)
  ON CONFLICT (condition_id) DO UPDATE SET
    responsible_party = EXCLUDED.responsible_party,
    justification     = EXCLUDED.justification,
    related_norm      = EXCLUDED.related_norm,
    assigned_by       = EXCLUDED.assigned_by,
    assigned_at       = now();

  v_new_version := v_rec.version + 1;

  UPDATE public.construction_conditions SET
    version = v_new_version
  WHERE id = p_condition_id AND organization_id = p_organization_id;

  PERFORM public.quality_emit_event(
    p_organization_id, p_condition_id, 'ResponsibilityAssigned',
    jsonb_build_object(
      'responsibleParty', p_responsible_party,
      'justification',    p_justification,
      'relatedNorm',      p_related_norm,
      'assignedBy',       p_assigned_by,
      'assignedAt',       now()
    ),
    (p_assigned_by->>'actorId')::UUID, v_new_version
  );

  RETURN jsonb_build_object('version', v_new_version);
END;
$$;

-- ════════════════════════════════════════════════════════════
-- RPC 4: request_action
-- CLASSIFIED → ACTION_REQUIRED
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.request_action(
  p_condition_id    UUID,
  p_organization_id UUID,
  p_expected_version INTEGER,
  p_description     TEXT,
  p_assigned_to     JSONB,   -- ActorReference
  p_sla_deadline    DATE,
  p_steps           JSONB DEFAULT '[]'::jsonb,
  p_estimated_cost  JSONB DEFAULT NULL,  -- { amount, currency }
  p_requested_by    JSONB DEFAULT NULL   -- ActorReference
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_rec         public.construction_conditions;
  v_plan_id     UUID := gen_random_uuid();
  v_new_version INTEGER;
BEGIN
  v_rec := public.quality_lock_condition(
    p_condition_id, p_organization_id, p_expected_version,
    ARRAY['CLASSIFIED']
  );

  -- Invariante: taxonomy completo é garantido por CLASSIFIED
  -- Invariante: severity alta/critica não pode ficar em CLASSIFIED — REQUEST_ACTION é obrigatório
  -- (essa invariante é de UX/validação; aqui apenas processamos o comando)

  IF p_sla_deadline <= CURRENT_DATE THEN
    RAISE EXCEPTION 'InvariantViolation: sla_deadline must be in the future'
      USING ERRCODE = 'P0004';
  END IF;

  INSERT INTO public.condition_action_plans
    (id, organization_id, condition_id, description, assigned_to,
     sla_deadline, estimated_cost, steps, is_current, created_by)
  VALUES
    (v_plan_id, p_organization_id, p_condition_id, p_description, p_assigned_to,
     p_sla_deadline, p_estimated_cost, p_steps, true, p_requested_by);

  v_new_version := v_rec.version + 1;

  UPDATE public.construction_conditions SET
    state   = 'ACTION_REQUIRED',
    version = v_new_version
  WHERE id = p_condition_id AND organization_id = p_organization_id;

  PERFORM public.quality_emit_event(
    p_organization_id, p_condition_id, 'ActionRequested',
    jsonb_build_object(
      'planId',       v_plan_id,
      'description',  p_description,
      'assignedTo',   p_assigned_to,
      'slaDeadline',  p_sla_deadline,
      'requestedBy',  p_requested_by,
      'requestedAt',  now()
    ),
    (p_requested_by->>'actorId')::UUID, v_new_version
  );

  RETURN jsonb_build_object('version', v_new_version, 'planId', v_plan_id);
END;
$$;

-- ════════════════════════════════════════════════════════════
-- RPC 5: start_repair
-- ACTION_REQUIRED → IN_REPAIR (requer responsibility prévia)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.start_repair(
  p_condition_id    UUID,
  p_organization_id UUID,
  p_expected_version INTEGER,
  p_started_by      JSONB   -- ActorReference
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_rec         public.construction_conditions;
  v_plan        public.condition_action_plans;
  v_new_version INTEGER;
BEGIN
  v_rec := public.quality_lock_condition(
    p_condition_id, p_organization_id, p_expected_version,
    ARRAY['ACTION_REQUIRED']
  );

  -- Invariante: responsibility obrigatória antes de IN_REPAIR
  IF NOT EXISTS (
    SELECT 1 FROM public.condition_responsibilities
    WHERE condition_id = p_condition_id
  ) THEN
    RAISE EXCEPTION 'InvariantViolation: responsibility must be assigned before starting repair'
      USING ERRCODE = 'P0004';
  END IF;

  -- Buscar plano corrente para o evento
  SELECT * INTO v_plan FROM public.condition_action_plans
  WHERE condition_id = p_condition_id AND is_current = true
  LIMIT 1;

  v_new_version := v_rec.version + 1;

  UPDATE public.construction_conditions SET
    state   = 'IN_REPAIR',
    version = v_new_version
  WHERE id = p_condition_id AND organization_id = p_organization_id;

  PERFORM public.quality_emit_event(
    p_organization_id, p_condition_id, 'RepairStarted',
    jsonb_build_object(
      'assignedTo',  v_plan.assigned_to,
      'slaDeadline', v_plan.sla_deadline,
      'startedBy',   p_started_by,
      'startedAt',   now()
    ),
    (p_started_by->>'actorId')::UUID, v_new_version
  );

  RETURN jsonb_build_object('version', v_new_version);
END;
$$;

-- ════════════════════════════════════════════════════════════
-- RPC 6: complete_repair_step
-- IN_REPAIR → (sem mudança de estado; REPAIRED quando todos concluídos)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.complete_repair_step(
  p_condition_id    UUID,
  p_organization_id UUID,
  p_expected_version INTEGER,
  p_step_id         UUID,
  p_evidence_ids    UUID[],
  p_completed_by    JSONB   -- ActorReference
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_rec         public.construction_conditions;
  v_plan        public.condition_action_plans;
  v_steps       JSONB;
  v_step        JSONB;
  v_step_idx    INTEGER;
  v_all_done    BOOLEAN;
  v_new_version INTEGER;
  v_new_state   TEXT;
BEGIN
  v_rec := public.quality_lock_condition(
    p_condition_id, p_organization_id, p_expected_version,
    ARRAY['IN_REPAIR']
  );

  -- Invariante: cada step precisa de ≥ 1 evidence
  IF array_length(p_evidence_ids, 1) IS NULL OR array_length(p_evidence_ids, 1) < 1 THEN
    RAISE EXCEPTION 'InvariantViolation: at least 1 evidence is required per completed step'
      USING ERRCODE = 'P0004';
  END IF;

  -- Buscar plano corrente
  SELECT * INTO v_plan FROM public.condition_action_plans
  WHERE condition_id = p_condition_id
    AND organization_id = p_organization_id
    AND is_current = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'InvariantViolation: no current action plan found'
      USING ERRCODE = 'P0004';
  END IF;

  -- Marcar o step como concluído no JSONB
  v_steps := v_plan.steps;
  v_step_idx := NULL;

  FOR i IN 0..(jsonb_array_length(v_steps) - 1) LOOP
    IF (v_steps->i)->>'id' = p_step_id::TEXT THEN
      v_step_idx := i;
      EXIT;
    END IF;
  END LOOP;

  IF v_step_idx IS NULL THEN
    RAISE EXCEPTION 'InvariantViolation: step % not found in action plan', p_step_id
      USING ERRCODE = 'P0004';
  END IF;

  -- Atualizar o step
  v_steps := jsonb_set(v_steps, ARRAY[v_step_idx::TEXT, 'completedAt'],
    to_jsonb(now()::TEXT));
  v_steps := jsonb_set(v_steps, ARRAY[v_step_idx::TEXT, 'completedBy'],
    p_completed_by);
  v_steps := jsonb_set(v_steps, ARRAY[v_step_idx::TEXT, 'evidenceIds'],
    to_jsonb(p_evidence_ids));

  UPDATE public.condition_action_plans
  SET steps = v_steps
  WHERE id = v_plan.id;

  -- Verificar se todos os steps têm completedAt
  v_all_done := NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_steps) s
    WHERE s->>'completedAt' IS NULL
  );

  v_new_state   := CASE WHEN v_all_done THEN 'REPAIRED' ELSE 'IN_REPAIR' END;
  v_new_version := v_rec.version + 1;

  UPDATE public.construction_conditions SET
    state   = v_new_state,
    version = v_new_version
  WHERE id = p_condition_id AND organization_id = p_organization_id;

  PERFORM public.quality_emit_event(
    p_organization_id, p_condition_id, 'ActionStepCompleted',
    jsonb_build_object(
      'stepId',      p_step_id,
      'evidenceIds', p_evidence_ids,
      'completedBy', p_completed_by,
      'completedAt', now()
    ),
    (p_completed_by->>'actorId')::UUID, v_new_version
  );

  IF v_all_done THEN
    PERFORM public.quality_emit_event(
      p_organization_id, p_condition_id, 'AllStepsCompleted',
      jsonb_build_object('completedBy', p_completed_by, 'completedAt', now()),
      (p_completed_by->>'actorId')::UUID, v_new_version
    );
  END IF;

  RETURN jsonb_build_object('version', v_new_version, 'allStepsCompleted', v_all_done);
END;
$$;

-- ════════════════════════════════════════════════════════════
-- RPC 7: validate_repair
-- REPAIRED → VALIDATED | REPAIRED (se rejeitado)
-- Também usado para CLASSIFIED → VALIDATED (severity baixa)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.validate_condition(
  p_condition_id    UUID,
  p_organization_id UUID,
  p_expected_version INTEGER,
  p_result          TEXT,   -- 'approved' | 'rejected' | 'requires_correction'
  p_notes           TEXT DEFAULT NULL,
  p_validated_by    JSONB DEFAULT NULL  -- ActorReference
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_rec         public.construction_conditions;
  v_val_id      UUID := gen_random_uuid();
  v_new_state   TEXT;
  v_new_version INTEGER;
BEGIN
  v_rec := public.quality_lock_condition(
    p_condition_id, p_organization_id, p_expected_version,
    ARRAY['REPAIRED', 'CLASSIFIED']
  );

  IF p_result NOT IN ('approved', 'rejected', 'requires_correction') THEN
    RAISE EXCEPTION 'InvariantViolation: invalid result %', p_result
      USING ERRCODE = 'P0004';
  END IF;

  -- severity baixa: CLASSIFIED → VALIDATED direto (sem repair)
  IF v_rec.state = 'CLASSIFIED' AND v_rec.severity != 'baixa' THEN
    RAISE EXCEPTION 'InvalidTransition: CLASSIFIED→VALIDATED only allowed for severity=baixa, got %',
      v_rec.severity
      USING ERRCODE = 'P0003';
  END IF;

  -- Estado resultante
  v_new_state := CASE p_result
    WHEN 'approved'             THEN 'VALIDATED'
    WHEN 'rejected'             THEN v_rec.state   -- permanece REPAIRED ou CLASSIFIED
    WHEN 'requires_correction'  THEN 'ACTION_REQUIRED'
    ELSE v_rec.state
  END;

  INSERT INTO public.condition_validations
    (id, organization_id, condition_id, result, notes, validated_by)
  VALUES
    (v_val_id, p_organization_id, p_condition_id, p_result, p_notes, p_validated_by);

  v_new_version := v_rec.version + 1;

  UPDATE public.construction_conditions SET
    state   = v_new_state,
    version = v_new_version
  WHERE id = p_condition_id AND organization_id = p_organization_id;

  PERFORM public.quality_emit_event(
    p_organization_id, p_condition_id, 'ConditionValidated',
    jsonb_build_object(
      'validationId',  v_val_id,
      'result',        p_result,
      'notes',         p_notes,
      'validatedBy',   p_validated_by,
      'validatedAt',   now(),
      'newState',      v_new_state
    ),
    (p_validated_by->>'actorId')::UUID, v_new_version
  );

  RETURN jsonb_build_object('version', v_new_version, 'newState', v_new_state);
END;
$$;

-- ════════════════════════════════════════════════════════════
-- RPC 8: contest_condition
-- REPAIRED | VALIDATED → CONTESTED
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.contest_condition(
  p_condition_id    UUID,
  p_organization_id UUID,
  p_expected_version INTEGER,
  p_basis           TEXT,
  p_sla_deadline    DATE,
  p_contested_by    JSONB   -- ActorReference
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_rec          public.construction_conditions;
  v_contest_id   UUID := gen_random_uuid();
  v_new_version  INTEGER;
BEGIN
  v_rec := public.quality_lock_condition(
    p_condition_id, p_organization_id, p_expected_version,
    ARRAY['REPAIRED', 'VALIDATED']
  );

  IF p_sla_deadline <= CURRENT_DATE THEN
    RAISE EXCEPTION 'InvariantViolation: sla_deadline must be in the future'
      USING ERRCODE = 'P0004';
  END IF;

  IF length(trim(p_basis)) < 10 THEN
    RAISE EXCEPTION 'InvariantViolation: basis must have at least 10 characters'
      USING ERRCODE = 'P0004';
  END IF;

  INSERT INTO public.condition_contestations
    (id, organization_id, condition_id, contested_by, basis, sla_deadline, state)
  VALUES
    (v_contest_id, p_organization_id, p_condition_id, p_contested_by, p_basis, p_sla_deadline, 'open');

  v_new_version := v_rec.version + 1;

  UPDATE public.construction_conditions SET
    state   = 'CONTESTED',
    version = v_new_version
  WHERE id = p_condition_id AND organization_id = p_organization_id;

  PERFORM public.quality_emit_event(
    p_organization_id, p_condition_id, 'ConditionContested',
    jsonb_build_object(
      'contestationId', v_contest_id,
      'contestedBy',    p_contested_by,
      'basis',          p_basis,
      'slaDeadline',    p_sla_deadline,
      'contestedAt',    now()
    ),
    (p_contested_by->>'actorId')::UUID, v_new_version
  );

  RETURN jsonb_build_object('version', v_new_version, 'contestationId', v_contest_id);
END;
$$;

-- ════════════════════════════════════════════════════════════
-- RPC 9: respond_to_contestation
-- CONTESTED → VALIDATED (repairAccepted=true) | ACTION_REQUIRED (repairAccepted=false)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.respond_to_contestation(
  p_condition_id    UUID,
  p_organization_id UUID,
  p_expected_version INTEGER,
  p_repair_accepted BOOLEAN,
  p_justification   TEXT,
  p_responded_by    JSONB   -- ActorReference
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_rec          public.construction_conditions;
  v_contest      public.condition_contestations;
  v_new_state    TEXT;
  v_new_version  INTEGER;
BEGIN
  v_rec := public.quality_lock_condition(
    p_condition_id, p_organization_id, p_expected_version,
    ARRAY['CONTESTED']
  );

  SELECT * INTO v_contest FROM public.condition_contestations
  WHERE condition_id = p_condition_id
    AND organization_id = p_organization_id
    AND state = 'open'
  ORDER BY contested_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'InvariantViolation: no open contestation found for this condition'
      USING ERRCODE = 'P0004';
  END IF;

  -- Semântica explícita (C3):
  -- repairAccepted = true  → reparo foi ok → contestação improcedente → VALIDATED
  -- repairAccepted = false → reparo insuficiente → contestação procedente → ACTION_REQUIRED
  v_new_state := CASE WHEN p_repair_accepted THEN 'VALIDATED' ELSE 'ACTION_REQUIRED' END;

  UPDATE public.condition_contestations SET
    state           = 'resolved',
    repair_accepted = p_repair_accepted,
    responded_by    = p_responded_by,
    responded_at    = now(),
    justification   = p_justification,
    resolved_at     = now()
  WHERE id = v_contest.id;

  v_new_version := v_rec.version + 1;

  UPDATE public.construction_conditions SET
    state   = v_new_state,
    version = v_new_version
  WHERE id = p_condition_id AND organization_id = p_organization_id;

  PERFORM public.quality_emit_event(
    p_organization_id, p_condition_id, 'ContestationResolved',
    jsonb_build_object(
      'contestationId', v_contest.id,
      'repairAccepted', p_repair_accepted,
      'justification',  p_justification,
      'resolvedBy',     p_responded_by,
      'resolvedAt',     now(),
      'nextState',      v_new_state
    ),
    (p_responded_by->>'actorId')::UUID, v_new_version
  );

  RETURN jsonb_build_object('version', v_new_version, 'newState', v_new_state);
END;
$$;

-- ════════════════════════════════════════════════════════════
-- RPC 10: escalate_condition
-- CONTESTED → ESCALATED (SLA vencido)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.escalate_condition(
  p_condition_id    UUID,
  p_organization_id UUID,
  p_expected_version INTEGER,
  p_escalated_by    JSONB   -- ActorReference (pode ser system)
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_rec         public.construction_conditions;
  v_contest     public.condition_contestations;
  v_new_version INTEGER;
BEGIN
  v_rec := public.quality_lock_condition(
    p_condition_id, p_organization_id, p_expected_version,
    ARRAY['CONTESTED']
  );

  SELECT * INTO v_contest FROM public.condition_contestations
  WHERE condition_id = p_condition_id
    AND organization_id = p_organization_id
    AND state = 'open'
  ORDER BY contested_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'InvariantViolation: no open contestation found'
      USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.condition_contestations SET
    state = 'escalated'
  WHERE id = v_contest.id;

  v_new_version := v_rec.version + 1;

  UPDATE public.construction_conditions SET
    state   = 'ESCALATED',
    version = v_new_version
  WHERE id = p_condition_id AND organization_id = p_organization_id;

  PERFORM public.quality_emit_event(
    p_organization_id, p_condition_id, 'ConditionEscalated',
    jsonb_build_object(
      'contestationId', v_contest.id,
      'escalatedBy',    p_escalated_by,
      'escalatedAt',    now()
    ),
    (p_escalated_by->>'actorId')::UUID, v_new_version
  );

  RETURN jsonb_build_object('version', v_new_version);
END;
$$;

-- ════════════════════════════════════════════════════════════
-- RPC 11: resolve_escalation
-- ESCALATED → CLOSED (requer externalDecision — C4)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.resolve_escalation(
  p_condition_id       UUID,
  p_organization_id    UUID,
  p_expected_version   INTEGER,
  p_external_decision  TEXT,   -- referência ao laudo/decisão judicial/acordo
  p_resolution         TEXT,   -- descrição da resolução
  p_closed_by          JSONB   -- ActorReference
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_rec         public.construction_conditions;
  v_new_version INTEGER;
BEGIN
  v_rec := public.quality_lock_condition(
    p_condition_id, p_organization_id, p_expected_version,
    ARRAY['ESCALATED']
  );

  -- Invariante C4: externalDecision obrigatório
  IF p_external_decision IS NULL OR length(trim(p_external_decision)) < 5 THEN
    RAISE EXCEPTION 'MissingExternalDecision: externalDecision is required to resolve an escalated condition'
      USING ERRCODE = 'P0004';
  END IF;

  v_new_version := v_rec.version + 1;

  UPDATE public.construction_conditions SET
    state   = 'CLOSED',
    version = v_new_version
  WHERE id = p_condition_id AND organization_id = p_organization_id;

  PERFORM public.quality_emit_event(
    p_organization_id, p_condition_id, 'EscalationResolved',
    jsonb_build_object(
      'externalDecision', p_external_decision,
      'resolution',       p_resolution,
      'closedBy',         p_closed_by,
      'closedAt',         now()
    ),
    (p_closed_by->>'actorId')::UUID, v_new_version
  );

  RETURN jsonb_build_object('version', v_new_version, 'newState', 'CLOSED');
END;
$$;

-- ════════════════════════════════════════════════════════════
-- RPC 12: close_condition
-- VALIDATED → CLOSED
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.close_condition(
  p_condition_id    UUID,
  p_organization_id UUID,
  p_expected_version INTEGER,
  p_warranty_expired BOOLEAN DEFAULT false,
  p_closed_by       JSONB DEFAULT NULL  -- ActorReference
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_rec         public.construction_conditions;
  v_new_version INTEGER;
BEGIN
  v_rec := public.quality_lock_condition(
    p_condition_id, p_organization_id, p_expected_version,
    ARRAY['VALIDATED']
  );

  -- Invariante: sem contestações abertas
  IF EXISTS (
    SELECT 1 FROM public.condition_contestations
    WHERE condition_id = p_condition_id
      AND state IN ('open', 'responded')
  ) THEN
    RAISE EXCEPTION 'InvariantViolation: cannot close condition with open contestations'
      USING ERRCODE = 'P0004';
  END IF;

  v_new_version := v_rec.version + 1;

  UPDATE public.construction_conditions SET
    state   = 'CLOSED',
    version = v_new_version
  WHERE id = p_condition_id AND organization_id = p_organization_id;

  PERFORM public.quality_emit_event(
    p_organization_id, p_condition_id, 'ConditionClosed',
    jsonb_build_object(
      'closedBy',             p_closed_by,
      'closedAt',             now(),
      'warrantyPeriodExpired', p_warranty_expired
    ),
    (p_closed_by->>'actorId')::UUID, v_new_version
  );

  RETURN jsonb_build_object('version', v_new_version, 'newState', 'CLOSED');
END;
$$;

-- ════════════════════════════════════════════════════════════
-- RPC 13: reopen_condition
-- VALIDATED → REOPENED (dentro do prazo de garantia — validado pelo app service)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reopen_condition(
  p_condition_id      UUID,
  p_organization_id   UUID,
  p_expected_version  INTEGER,
  p_reason            TEXT,
  p_warranty_expires_at DATE,  -- passado pelo application service após consultar Empreendimento
  p_reopened_by       JSONB    -- ActorReference
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_rec         public.construction_conditions;
  v_new_version INTEGER;
BEGIN
  v_rec := public.quality_lock_condition(
    p_condition_id, p_organization_id, p_expected_version,
    ARRAY['VALIDATED']
  );

  -- O application service valida o prazo antes de chamar este RPC.
  -- O RPC registra o warrantyExpiresAt no evento para rastreabilidade.
  IF p_warranty_expires_at < CURRENT_DATE THEN
    RAISE EXCEPTION 'WarrantyExpired: warranty expired on %, cannot reopen', p_warranty_expires_at
      USING ERRCODE = 'P0005';
  END IF;

  v_new_version := v_rec.version + 1;

  UPDATE public.construction_conditions SET
    state   = 'REOPENED',
    version = v_new_version
  WHERE id = p_condition_id AND organization_id = p_organization_id;

  PERFORM public.quality_emit_event(
    p_organization_id, p_condition_id, 'ConditionReopened',
    jsonb_build_object(
      'reason',            p_reason,
      'warrantyExpiresAt', p_warranty_expires_at,
      'reopenedBy',        p_reopened_by,
      'reopenedAt',        now()
    ),
    (p_reopened_by->>'actorId')::UUID, v_new_version
  );

  RETURN jsonb_build_object('version', v_new_version, 'newState', 'REOPENED');
END;
$$;

-- ════════════════════════════════════════════════════════════
-- RPC 14: revise_action_plan
-- IN_REPAIR | ACTION_REQUIRED (sem mudança de estado — C12)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.revise_action_plan(
  p_condition_id    UUID,
  p_organization_id UUID,
  p_expected_version INTEGER,
  p_description     TEXT,
  p_assigned_to     JSONB,
  p_sla_deadline    DATE,
  p_steps           JSONB DEFAULT '[]'::jsonb,
  p_estimated_cost  JSONB DEFAULT NULL,
  p_revision_reason TEXT DEFAULT NULL,
  p_revised_by      JSONB DEFAULT NULL  -- ActorReference
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_rec           public.construction_conditions;
  v_old_plan_id   UUID;
  v_new_plan_id   UUID := gen_random_uuid();
  v_new_version   INTEGER;
BEGIN
  v_rec := public.quality_lock_condition(
    p_condition_id, p_organization_id, p_expected_version,
    ARRAY['ACTION_REQUIRED', 'IN_REPAIR']
  );

  -- Buscar plano corrente para encadear
  SELECT id INTO v_old_plan_id FROM public.condition_action_plans
  WHERE condition_id = p_condition_id AND is_current = true
  LIMIT 1;

  -- Desativar plano anterior
  IF v_old_plan_id IS NOT NULL THEN
    UPDATE public.condition_action_plans
    SET is_current = false
    WHERE id = v_old_plan_id;
  END IF;

  -- Criar novo plano com referência ao anterior
  INSERT INTO public.condition_action_plans
    (id, organization_id, condition_id, description, assigned_to,
     sla_deadline, estimated_cost, steps, previous_plan_id, revision_reason,
     is_current, created_by)
  VALUES
    (v_new_plan_id, p_organization_id, p_condition_id, p_description, p_assigned_to,
     p_sla_deadline, p_estimated_cost, p_steps, v_old_plan_id, p_revision_reason,
     true, p_revised_by);

  v_new_version := v_rec.version + 1;

  UPDATE public.construction_conditions SET
    version = v_new_version
  WHERE id = p_condition_id AND organization_id = p_organization_id;

  PERFORM public.quality_emit_event(
    p_organization_id, p_condition_id, 'ActionPlanRevised',
    jsonb_build_object(
      'previousPlanId',  v_old_plan_id,
      'newPlanId',       v_new_plan_id,
      'revisionReason',  p_revision_reason,
      'revisedBy',       p_revised_by,
      'revisedAt',       now()
    ),
    (p_revised_by->>'actorId')::UUID, v_new_version
  );

  RETURN jsonb_build_object('version', v_new_version, 'newPlanId', v_new_plan_id);
END;
$$;

-- ════════════════════════════════════════════════════════════
-- RPC 15: supersede_evidence
-- Qualquer estado (invariante: delete físico proibido — C5)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.supersede_evidence(
  p_condition_id      UUID,
  p_organization_id   UUID,
  p_expected_version  INTEGER,
  p_evidence_id       UUID,
  p_new_evidence_id   UUID,
  p_reason            TEXT,
  p_superseded_by_actor JSONB  -- ActorReference
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_rec         public.construction_conditions;
  v_new_version INTEGER;
BEGIN
  v_rec := public.quality_lock_condition(
    p_condition_id, p_organization_id, p_expected_version,
    -- permitido em qualquer estado exceto CLOSED
    ARRAY['DETECTED','CLASSIFIED','ACTION_REQUIRED','IN_REPAIR',
          'REPAIRED','VALIDATED','CONTESTED','ESCALATED','REOPENED']
  );

  -- Verificar que a evidence existe e pertence à condição
  IF NOT EXISTS (
    SELECT 1 FROM public.condition_evidence
    WHERE id = p_evidence_id
      AND condition_id = p_condition_id
      AND organization_id = p_organization_id
      AND superseded = false
  ) THEN
    RAISE EXCEPTION 'InvariantViolation: evidence % not found or already superseded', p_evidence_id
      USING ERRCODE = 'P0004';
  END IF;

  -- Verificar que a nova evidence existe
  IF NOT EXISTS (
    SELECT 1 FROM public.condition_evidence
    WHERE id = p_new_evidence_id
      AND condition_id = p_condition_id
      AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'InvariantViolation: new evidence % not found', p_new_evidence_id
      USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.condition_evidence SET
    superseded    = true,
    superseded_by = p_new_evidence_id,
    superseded_at = now()
  WHERE id = p_evidence_id;

  v_new_version := v_rec.version + 1;

  UPDATE public.construction_conditions SET
    version = v_new_version
  WHERE id = p_condition_id AND organization_id = p_organization_id;

  PERFORM public.quality_emit_event(
    p_organization_id, p_condition_id, 'EvidenceSuperseded',
    jsonb_build_object(
      'oldEvidenceId',    p_evidence_id,
      'newEvidenceId',    p_new_evidence_id,
      'reason',           p_reason,
      'supersededBy',     p_superseded_by_actor,
      'supersededAt',     now()
    ),
    (p_superseded_by_actor->>'actorId')::UUID, v_new_version
  );

  RETURN jsonb_build_object('version', v_new_version);
END;
$$;

-- ════════════════════════════════════════════════════════════
-- RPC 16: link_conditions
-- Vínculo causal entre condições (C14)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.link_conditions(
  p_condition_id         UUID,
  p_organization_id      UUID,
  p_expected_version     INTEGER,
  p_related_condition_id UUID,
  p_link_type            TEXT,  -- 'suspected_cause'|'confirmed_cause'|'related_symptom'
  p_notes                TEXT DEFAULT NULL,
  p_linked_by            JSONB DEFAULT NULL  -- ActorReference
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_rec           public.construction_conditions;
  v_new_version   INTEGER;
  v_current_links JSONB;
  v_new_link      JSONB;
BEGIN
  v_rec := public.quality_lock_condition(
    p_condition_id, p_organization_id, p_expected_version,
    ARRAY['DETECTED','CLASSIFIED','ACTION_REQUIRED','IN_REPAIR',
          'REPAIRED','VALIDATED','CONTESTED','ESCALATED','REOPENED']
  );

  IF p_link_type NOT IN ('suspected_cause', 'confirmed_cause', 'related_symptom') THEN
    RAISE EXCEPTION 'InvariantViolation: invalid link_type %', p_link_type
      USING ERRCODE = 'P0004';
  END IF;

  -- confirmed_cause requer external_inspector (C14)
  IF p_link_type = 'confirmed_cause' AND
     (p_linked_by->>'actorType') != 'external_inspector' THEN
    RAISE EXCEPTION 'InvariantViolation: confirmed_cause requires actorType=external_inspector'
      USING ERRCODE = 'P0004';
  END IF;

  -- Invariante cross-tenant: related condition deve ser do mesmo org
  IF NOT EXISTS (
    SELECT 1 FROM public.construction_conditions
    WHERE id = p_related_condition_id
      AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'InvariantViolation: related condition not found in same organization'
      USING ERRCODE = 'P0004';
  END IF;

  v_new_link := jsonb_build_object(
    'conditionId', p_related_condition_id,
    'linkType',    p_link_type,
    'linkedAt',    now(),
    'linkedBy',    p_linked_by,
    'notes',       p_notes
  );

  v_current_links := COALESCE(v_rec.related_conditions, '[]'::jsonb);
  v_new_version   := v_rec.version + 1;

  UPDATE public.construction_conditions SET
    related_conditions = v_current_links || jsonb_build_array(v_new_link),
    version            = v_new_version
  WHERE id = p_condition_id AND organization_id = p_organization_id;

  PERFORM public.quality_emit_event(
    p_organization_id, p_condition_id, 'ConditionsLinked',
    jsonb_build_object(
      'relatedConditionId', p_related_condition_id,
      'linkType',           p_link_type,
      'notes',              p_notes,
      'linkedBy',           p_linked_by,
      'linkedAt',           now()
    ),
    (p_linked_by->>'actorId')::UUID, v_new_version
  );

  RETURN jsonb_build_object('version', v_new_version);
END;
$$;

-- ────────────────────────────────────────────────────────────
-- FIM DA MIGRATION
-- Próxima: 20260514000002_quality_module_typescript_types (arquivo .ts, não migration)
-- ────────────────────────────────────────────────────────────
