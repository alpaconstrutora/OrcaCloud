-- ══════════════════════════════════════════════════════════════════════════════
-- Edição de condição: campo description + RPC update_condition_draft
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.construction_conditions
  ADD COLUMN IF NOT EXISTS description TEXT;

-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_condition_draft(
  p_condition_id      UUID,
  p_organization_id   UUID,
  p_expected_version  INT,
  p_asset_unidade     TEXT    DEFAULT NULL,
  p_asset_ambiente    TEXT    DEFAULT NULL,
  p_severity          TEXT    DEFAULT NULL,
  p_origin            TEXT    DEFAULT NULL,
  p_description       TEXT    DEFAULT NULL,
  p_updated_by        JSONB   DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_cond  construction_conditions;
  v_score JSONB;
BEGIN
  -- Lock + tenant + version + state guard
  v_cond := public.quality_lock_condition(
    p_condition_id, p_organization_id, p_expected_version,
    ARRAY['DETECTED','CLASSIFIED','ACTION_REQUIRED','REOPENED']
  );

  IF p_severity IS NOT NULL AND p_severity NOT IN ('baixa','media','alta','critica') THEN
    RAISE EXCEPTION 'InvariantViolation: invalid severity %', p_severity
      USING ERRCODE = 'P0004';
  END IF;

  IF p_origin IS NOT NULL AND p_origin NOT IN
      ('execucao','material','projeto','uso','manutencao','indeterminada') THEN
    RAISE EXCEPTION 'InvariantViolation: invalid origin %', p_origin
      USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.construction_conditions SET
    asset_unidade_id = COALESCE(p_asset_unidade,  asset_unidade_id),
    asset_ambiente_id= COALESCE(p_asset_ambiente, asset_ambiente_id),
    severity         = COALESCE(p_severity,        severity),
    origin           = COALESCE(p_origin,          origin),
    description      = COALESCE(p_description,     description),
    version          = version + 1,
    updated_at       = now()
  WHERE id = p_condition_id
    AND organization_id = p_organization_id;

  SELECT * INTO v_cond FROM public.construction_conditions
  WHERE id = p_condition_id AND organization_id = p_organization_id;

  v_score := public.quality_calculate_score(
    p_condition_id, p_organization_id, v_cond.severity, v_cond.taxonomy
  );

  UPDATE public.construction_conditions
  SET quality_score = v_score
  WHERE id = p_condition_id;

  PERFORM public.quality_emit_event(
    p_organization_id, p_condition_id, 'ConditionUpdated',
    jsonb_build_object(
      'updatedFields', jsonb_strip_nulls(jsonb_build_object(
        'assetUnidade', p_asset_unidade,
        'assetAmbiente', p_asset_ambiente,
        'severity', p_severity,
        'origin', p_origin,
        'description', p_description
      )),
      'updatedBy', p_updated_by
    ),
    (p_updated_by->>'actorId')::UUID, v_cond.version
  );

  RETURN jsonb_build_object('conditionId', p_condition_id, 'version', v_cond.version);
END;
$$;
