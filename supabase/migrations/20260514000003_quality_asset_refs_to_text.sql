-- ══════════════════════════════════════════════════════════════════════════════
-- asset_unidade_id and asset_ambiente_id: UUID → TEXT
-- These are external references with no FK target in the system; users identify
-- them by names like "Apto 101" or "Banheiro suíte", not UUIDs.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.construction_conditions
  ALTER COLUMN asset_unidade_id  TYPE TEXT USING asset_unidade_id::TEXT,
  ALTER COLUMN asset_ambiente_id TYPE TEXT USING asset_ambiente_id::TEXT;

-- Recreate detect_condition with corrected parameter types
CREATE OR REPLACE FUNCTION public.detect_condition(
  p_organization_id      UUID,
  p_asset_empreendimento UUID,
  p_asset_bloco          UUID    DEFAULT NULL,
  p_asset_torre          UUID    DEFAULT NULL,
  p_asset_unidade        TEXT    DEFAULT NULL,
  p_asset_ambiente       TEXT    DEFAULT NULL,
  p_asset_componente     UUID    DEFAULT NULL,
  p_asset_floor_plan_ref JSONB   DEFAULT NULL,
  p_provisional_taxonomy JSONB   DEFAULT NULL,
  p_severity             TEXT    DEFAULT 'baixa',
  p_origin               TEXT    DEFAULT 'indeterminada',
  p_detected_by          JSONB   DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_id    UUID := gen_random_uuid();
  v_score JSONB;
BEGIN
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

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND email = auth.jwt()->>'email'
  ) THEN
    RAISE EXCEPTION 'UnauthorizedTenantAccess'
      USING ERRCODE = 'P0001';
  END IF;

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

  v_score := public.quality_calculate_score(v_id, p_organization_id, p_severity, NULL);

  UPDATE public.construction_conditions
  SET quality_score = v_score
  WHERE id = v_id;

  PERFORM public.quality_emit_event(
    p_organization_id, v_id, 'ConditionDetected',
    jsonb_build_object(
      'conditionId',         v_id,
      'assetEmpreendimento', p_asset_empreendimento,
      'assetUnidade',        p_asset_unidade,
      'assetAmbiente',       p_asset_ambiente,
      'provisionalTaxonomy', p_provisional_taxonomy,
      'severity',            p_severity,
      'origin',              p_origin,
      'detectedBy',          p_detected_by,
      'detectedAt',          now(),
      'qualityScore',        v_score
    ),
    (p_detected_by->>'actorId')::UUID, 1
  );

  RETURN jsonb_build_object('conditionId', v_id, 'qualityScore', v_score);
END;
$$;
