-- ============================================================
-- Modulo: Areas NBR 12721 / Fix de tolerancia de validacao
-- Motivo: coeficientes/fracoes sao gravados com round(..., 12).
--   O erro de arredondamento acumulado com N unidades (~N*0,5e-12)
--   ultrapassa 1e-12 a partir de 3 unidades, disparando falso-positivo
--   em QII_VAL_006 / FRAC_VAL_002. Afrouxa a tolerancia para 1e-9.
-- Redefine validate_area_version por completo (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_area_version(p_area_version_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_errors JSONB := '[]'::jsonb;
    v_warnings JSONB := '[]'::jsonb;
    v_version RECORD;
    v_count INTEGER;
    v_sum NUMERIC;
BEGIN
    SELECT av.*, ap.organization_id
      INTO v_version
      FROM public.area_versions av
      JOIN public.area_projects ap ON ap.id = av.area_project_id
     WHERE av.id = p_area_version_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'failed',
            'blocking_errors', jsonb_build_array(jsonb_build_object('code','VERSION_NOT_FOUND','message','Versao de areas nao encontrada')),
            'warnings', '[]'::jsonb
        );
    END IF;

    IF v_version.normative_reference IS NULL OR length(trim(v_version.normative_reference)) = 0 THEN
        v_errors := public.area_jsonb_append(v_errors, jsonb_build_object('code','MOTOR_002','message','Norma-base ausente'));
    END IF;

    IF v_version.rounding_profile IS NULL THEN
        v_errors := public.area_jsonb_append(v_errors, jsonb_build_object('code','MOTOR_003','message','Perfil de arredondamento ausente'));
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM public.area_version_floors
     WHERE area_version_id = p_area_version_id
       AND is_template = true
       AND is_materialized = true;
    IF v_count > 0 THEN
        v_errors := public.area_jsonb_append(v_errors, jsonb_build_object('code','MAT_VAL_002','message','Pavimento nao pode ser template e materializado ao mesmo tempo','count',v_count));
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM public.area_version_units
     WHERE area_version_id = p_area_version_id
       AND is_template = true
       AND is_materialized = true;
    IF v_count > 0 THEN
        v_errors := public.area_jsonb_append(v_errors, jsonb_build_object('code','MAT_VAL_002','message','Unidade nao pode ser template e materializada ao mesmo tempo','count',v_count));
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM public.area_version_spaces
     WHERE area_version_id = p_area_version_id
       AND is_template = true
       AND is_materialized = true;
    IF v_count > 0 THEN
        v_errors := public.area_jsonb_append(v_errors, jsonb_build_object('code','MAT_VAL_002','message','Espaco nao pode ser template e materializado ao mesmo tempo','count',v_count));
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM public.area_version_spaces
     WHERE area_version_id = p_area_version_id
       AND is_materialized = true
       AND is_template = false
       AND real_area_m2_raw <= 0;
    IF v_count > 0 THEN
        v_errors := public.area_jsonb_append(v_errors, jsonb_build_object('code','MOTOR_006','message','Ambiente com area real menor ou igual a zero','count',v_count));
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM public.area_version_spaces
     WHERE area_version_id = p_area_version_id
       AND is_materialized = true
       AND is_template = false
       AND coverage_class <> 'covered_standard'
       AND coefficient_value IS NULL;
    IF v_count > 0 THEN
        v_errors := public.area_jsonb_append(v_errors, jsonb_build_object('code','MOTOR_007','message','Area nao padrao sem coeficiente','count',v_count));
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM public.area_version_spaces
     WHERE area_version_id = p_area_version_id
       AND is_materialized = true
       AND is_template = false
       AND use_class = 'common'
       AND common_division_class = 'not_applicable';
    IF v_count > 0 THEN
        v_errors := public.area_jsonb_append(v_errors, jsonb_build_object('code','MOTOR_012','message','Area comum sem tipo de divisao','count',v_count));
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM public.area_version_spaces
     WHERE area_version_id = p_area_version_id
       AND is_materialized = true
       AND is_template = false
       AND use_class = 'private'
       AND ownership_accounting_mode IN ('direct_unit','autonomous_unit')
       AND unit_id IS NULL;
    IF v_count > 0 THEN
        v_errors := public.area_jsonb_append(v_errors, jsonb_build_object('code','MOTOR_011','message','Area privativa sem unidade','count',v_count));
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM public.area_version_spaces
     WHERE area_version_id = p_area_version_id
       AND is_materialized = true
       AND is_template = false
       AND ownership_accounting_mode = 'linked_accessory'
       AND unit_id IS NOT NULL;
    IF v_count > 0 THEN
        v_errors := public.area_jsonb_append(v_errors, jsonb_build_object('code','ACC_VAL_001','message','Acessorio vinculado nao pode ter unit_id preenchido','count',v_count));
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM public.area_version_spaces s
     WHERE s.area_version_id = p_area_version_id
       AND s.is_materialized = true
       AND s.is_template = false
       AND s.ownership_accounting_mode = 'linked_accessory'
       AND NOT EXISTS (
            SELECT 1
              FROM public.area_version_unit_accessory_links l
             WHERE l.area_version_id = s.area_version_id
               AND l.accessory_space_id = s.id
       );
    IF v_count > 0 THEN
        v_errors := public.area_jsonb_append(v_errors, jsonb_build_object('code','ACC_VAL_003','message','Acessorio vinculado sem vinculo contabil','count',v_count));
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM public.area_version_spaces s
      JOIN public.area_version_unit_accessory_links l
        ON l.area_version_id = s.area_version_id
       AND l.accessory_space_id = s.id
     WHERE s.area_version_id = p_area_version_id
       AND s.unit_id IS NOT NULL;
    IF v_count > 0 THEN
        v_errors := public.area_jsonb_append(v_errors, jsonb_build_object('code','ACC_VAL_003','message','Espaco acessorio contado por unit_id e por vinculo','count',v_count));
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM public.area_version_spaces s
     WHERE s.area_version_id = p_area_version_id
       AND s.is_materialized = true
       AND s.is_template = false
       AND s.use_class = 'common'
       AND s.common_division_class = 'proportional'
       AND NOT EXISTS (
            SELECT 1
              FROM public.area_version_common_distribution_scopes ds
             WHERE ds.area_version_id = s.area_version_id
               AND ds.common_space_id = s.id
       );
    IF v_count > 0 THEN
        v_errors := public.area_jsonb_append(v_errors, jsonb_build_object('code','COM_PROP_VAL_001','message','Area comum proporcional sem escopo de distribuicao','count',v_count));
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM public.area_version_common_distribution_scopes
     WHERE area_version_id = p_area_version_id
       AND distribution_scope = 'block'
       AND block_id IS NULL;
    IF v_count > 0 THEN
        v_errors := public.area_jsonb_append(v_errors, jsonb_build_object('code','COM_PROP_VAL_002','message','Escopo por bloco sem block_id','count',v_count));
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM public.area_version_units
     WHERE area_version_id = p_area_version_id
       AND is_materialized = true
       AND is_template = false
       AND is_active = true
       AND is_autonomous = true
       AND (code IS NULL OR length(trim(code)) = 0);
    IF v_count > 0 THEN
        v_errors := public.area_jsonb_append(v_errors, jsonb_build_object('code','QII_VAL_001','message','Unidade sem codigo','count',v_count));
    END IF;

    SELECT COALESCE(SUM(qii_31_proportionality_coefficient_raw), 0)
      INTO v_sum
      FROM public.area_version_quadro_ii_rows
     WHERE area_version_id = p_area_version_id;
    IF v_sum <> 0 AND abs(v_sum - 1) > 0.000000001 THEN
        v_errors := public.area_jsonb_append(v_errors, jsonb_build_object('code','QII_VAL_006','message','Soma dos coeficientes diferente de 1','sum',v_sum));
    END IF;

    SELECT COALESCE(SUM(fraction_decimal_raw), 0)
      INTO v_sum
      FROM public.area_version_fraction_ideals
     WHERE area_version_id = p_area_version_id;
    IF v_sum <> 0 AND abs(v_sum - 1) > 0.000000001 THEN
        v_errors := public.area_jsonb_append(v_errors, jsonb_build_object('code','FRAC_VAL_002','message','Soma das fracoes decimais diferente de 1','sum',v_sum));
    END IF;

    RETURN jsonb_build_object(
        'status', CASE WHEN jsonb_array_length(v_errors) = 0 THEN 'success' ELSE 'failed' END,
        'blocking_errors', v_errors,
        'warnings', v_warnings
    );
END;
$$;
