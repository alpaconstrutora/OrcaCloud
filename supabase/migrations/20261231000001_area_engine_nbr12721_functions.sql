-- ============================================================
-- Modulo: Areas NBR 12721 / Funcoes MVP v1.2.1
-- Funcoes iniciais: validate_area_version e calculate_area_version
-- ============================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ------------------------------------------------------------
-- Helper: adiciona issue em array jsonb
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.area_jsonb_append(p_array JSONB, p_value JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT COALESCE(p_array, '[]'::jsonb) || jsonb_build_array(p_value);
$$;

-- ------------------------------------------------------------
-- Validacao estrutural e de resultados
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- Calculo completo dos Quadros I, II, IV-B e fracoes ideais
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_area_version(p_area_version_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_validation JSONB;
    v_error_count INTEGER;
    v_version RECORD;
    v_payload JSONB;
    v_payload_hash TEXT;
BEGIN
    SELECT av.*
      INTO v_version
      FROM public.area_versions av
     WHERE av.id = p_area_version_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status','failed','blocking_errors',jsonb_build_array(jsonb_build_object('code','VERSION_NOT_FOUND','message','Versao de areas nao encontrada')));
    END IF;

    IF v_version.status IN ('locked','superseded','cancelled') THEN
        RETURN jsonb_build_object('status','failed','blocking_errors',jsonb_build_array(jsonb_build_object('code','MOTOR_001','message','Versao nao pode ser recalculada neste status','status',v_version.status)));
    END IF;

    v_validation := public.validate_area_version(p_area_version_id);
    v_error_count := jsonb_array_length(COALESCE(v_validation->'blocking_errors','[]'::jsonb));
    IF v_error_count > 0 THEN
        RETURN jsonb_build_object('status','failed','blocking_errors',v_validation->'blocking_errors','warnings',v_validation->'warnings');
    END IF;

    DELETE FROM public.area_version_quadro_ivb_rows WHERE area_version_id = p_area_version_id;
    DELETE FROM public.area_version_fraction_ideals WHERE area_version_id = p_area_version_id;
    DELETE FROM public.area_version_quadro_ii_rows WHERE area_version_id = p_area_version_id;
    DELETE FROM public.area_version_quadro_i_rows WHERE area_version_id = p_area_version_id;

    UPDATE public.area_version_spaces
       SET equivalent_area_m2_raw = round(real_area_m2_raw * COALESCE(coefficient_value, 1), 6),
           coefficient_value = COALESCE(coefficient_value, 1),
           updated_at = NOW()
     WHERE area_version_id = p_area_version_id
       AND is_materialized = true
       AND is_template = false;

    INSERT INTO public.area_version_quadro_i_rows (
        area_version_id, block_id, floor_id, row_order, floor_label,
        qi_02_private_covered_standard_raw,
        qi_03_private_nonstandard_or_uncovered_raw,
        qi_04_private_equivalent_raw,
        qi_05_private_real_total_raw,
        qi_06_private_equivalent_total_raw,
        qi_07_common_nonprop_covered_standard_raw,
        qi_08_common_nonprop_nonstandard_or_uncovered_raw,
        qi_09_common_nonprop_equivalent_raw,
        qi_10_common_nonprop_real_total_raw,
        qi_11_common_nonprop_equivalent_total_raw,
        qi_12_common_prop_covered_standard_raw,
        qi_13_common_prop_nonstandard_or_uncovered_raw,
        qi_14_common_prop_equivalent_raw,
        qi_15_common_prop_real_total_raw,
        qi_16_common_prop_equivalent_total_raw,
        qi_17_floor_real_total_raw,
        qi_18_floor_equivalent_total_raw
    )
    WITH per_floor AS (
        SELECT
            f.area_version_id,
            f.block_id,
            f.id AS floor_id,
            f.sort_order AS row_order,
            COALESCE(f.materialized_label, f.name) AS floor_label,
            COALESCE(SUM(s.real_area_m2_raw) FILTER (WHERE s.use_class = 'private' AND s.coverage_class = 'covered_standard'), 0) AS qi_02,
            COALESCE(SUM(s.real_area_m2_raw) FILTER (WHERE s.use_class = 'private' AND s.coverage_class IN ('covered_different','uncovered')), 0) AS qi_03,
            COALESCE(SUM(s.equivalent_area_m2_raw) FILTER (WHERE s.use_class = 'private' AND s.coverage_class IN ('covered_different','uncovered')), 0) AS qi_04,
            COALESCE(SUM(s.real_area_m2_raw) FILTER (WHERE s.use_class = 'common' AND s.common_division_class = 'non_proportional' AND s.coverage_class = 'covered_standard'), 0) AS qi_07,
            COALESCE(SUM(s.real_area_m2_raw) FILTER (WHERE s.use_class = 'common' AND s.common_division_class = 'non_proportional' AND s.coverage_class IN ('covered_different','uncovered')), 0) AS qi_08,
            COALESCE(SUM(s.equivalent_area_m2_raw) FILTER (WHERE s.use_class = 'common' AND s.common_division_class = 'non_proportional' AND s.coverage_class IN ('covered_different','uncovered')), 0) AS qi_09,
            COALESCE(SUM(s.real_area_m2_raw) FILTER (WHERE s.use_class = 'common' AND s.common_division_class = 'proportional' AND s.coverage_class = 'covered_standard'), 0) AS qi_12,
            COALESCE(SUM(s.real_area_m2_raw) FILTER (WHERE s.use_class = 'common' AND s.common_division_class = 'proportional' AND s.coverage_class IN ('covered_different','uncovered')), 0) AS qi_13,
            COALESCE(SUM(s.equivalent_area_m2_raw) FILTER (WHERE s.use_class = 'common' AND s.common_division_class = 'proportional' AND s.coverage_class IN ('covered_different','uncovered')), 0) AS qi_14
        FROM public.area_version_floors f
        LEFT JOIN public.area_version_spaces s
          ON s.area_version_id = f.area_version_id
         AND s.floor_id = f.id
         AND s.is_materialized = true
         AND s.is_template = false
        WHERE f.area_version_id = p_area_version_id
          AND f.is_materialized = true
          AND f.is_template = false
        GROUP BY f.area_version_id, f.block_id, f.id, f.sort_order, f.materialized_label, f.name
    )
    SELECT
        area_version_id, block_id, floor_id, row_order, floor_label,
        round(qi_02, 6),
        round(qi_03, 6),
        round(qi_04, 6),
        round(qi_02 + qi_03, 6),
        round(qi_02 + qi_04, 6),
        round(qi_07, 6),
        round(qi_08, 6),
        round(qi_09, 6),
        round(qi_07 + qi_08, 6),
        round(qi_07 + qi_09, 6),
        round(qi_12, 6),
        round(qi_13, 6),
        round(qi_14, 6),
        round(qi_12 + qi_13, 6),
        round(qi_12 + qi_14, 6),
        round(qi_02 + qi_03 + qi_07 + qi_08 + qi_12 + qi_13, 6),
        round(qi_02 + qi_04 + qi_07 + qi_09 + qi_12 + qi_14, 6)
    FROM per_floor;

    INSERT INTO public.area_version_quadro_ii_rows (
        area_version_id, unit_id, row_order, unit_label,
        qii_20_private_covered_standard_raw,
        qii_21_private_nonstandard_or_uncovered_raw,
        qii_22_private_equivalent_raw,
        qii_23_private_real_total_raw,
        qii_24_private_equivalent_total_raw,
        qii_25_common_nonprop_covered_standard_raw,
        qii_26_common_nonprop_nonstandard_or_uncovered_raw,
        qii_27_common_nonprop_equivalent_raw,
        qii_28_common_nonprop_real_total_raw,
        qii_29_common_nonprop_equivalent_total_raw,
        qii_30_nonprop_equivalent_total_raw,
        qii_31_proportionality_coefficient_raw,
        qii_32_common_prop_covered_standard_raw,
        qii_33_common_prop_nonstandard_or_uncovered_raw,
        qii_34_common_prop_equivalent_raw,
        qii_35_common_prop_real_total_raw,
        qii_36_common_prop_equivalent_total_raw,
        qii_37_unit_real_total_raw,
        qii_38_unit_equivalent_total_raw
    )
    WITH units AS (
        SELECT *
          FROM public.area_version_units
         WHERE area_version_id = p_area_version_id
           AND is_materialized = true
           AND is_template = false
           AND is_active = true
           AND is_autonomous = true
    ), private_spaces AS (
        SELECT
            u.id AS unit_id,
            s.coverage_class,
            s.real_area_m2_raw,
            s.equivalent_area_m2_raw
        FROM units u
        JOIN public.area_version_spaces s
          ON s.area_version_id = u.area_version_id
         AND s.unit_id = u.id
         AND s.use_class = 'private'
         AND s.ownership_accounting_mode IN ('direct_unit','autonomous_unit')
         AND s.is_materialized = true
         AND s.is_template = false

        UNION ALL

        SELECT
            l.parent_unit_id AS unit_id,
            s.coverage_class,
            s.real_area_m2_raw,
            s.equivalent_area_m2_raw
        FROM public.area_version_unit_accessory_links l
        JOIN public.area_version_spaces s
          ON s.area_version_id = l.area_version_id
         AND s.id = l.accessory_space_id
         AND s.use_class = 'private'
         AND s.ownership_accounting_mode = 'linked_accessory'
         AND s.is_materialized = true
         AND s.is_template = false
        WHERE l.area_version_id = p_area_version_id
          AND l.affects_coefficient = true
    ), private_areas AS (
        SELECT
            u.id AS unit_id,
            COALESCE(SUM(ps.real_area_m2_raw) FILTER (WHERE ps.coverage_class = 'covered_standard'), 0) AS q20,
            COALESCE(SUM(ps.real_area_m2_raw) FILTER (WHERE ps.coverage_class IN ('covered_different','uncovered')), 0) AS q21,
            COALESCE(SUM(ps.equivalent_area_m2_raw) FILTER (WHERE ps.coverage_class IN ('covered_different','uncovered')), 0) AS q22
        FROM units u
        LEFT JOIN private_spaces ps ON ps.unit_id = u.id
        GROUP BY u.id
    ), nonprop AS (
        SELECT
            u.id AS unit_id,
            COALESCE(SUM(CASE WHEN cs.coverage_class = 'covered_standard' THEN COALESCE(a.allocated_real_area_m2_raw, cs.real_area_m2_raw * a.percentage) ELSE 0 END), 0) AS q25,
            COALESCE(SUM(CASE WHEN cs.coverage_class IN ('covered_different','uncovered') THEN COALESCE(a.allocated_real_area_m2_raw, cs.real_area_m2_raw * a.percentage) ELSE 0 END), 0) AS q26,
            COALESCE(SUM(CASE WHEN cs.coverage_class IN ('covered_different','uncovered') THEN COALESCE(a.allocated_equivalent_area_m2_raw, a.allocated_real_area_m2_raw * cs.coefficient_value, cs.equivalent_area_m2_raw * a.percentage) ELSE 0 END), 0) AS q27
        FROM units u
        LEFT JOIN public.area_version_common_allocations a
          ON a.area_version_id = u.area_version_id
         AND a.target_unit_id = u.id
        LEFT JOIN public.area_version_spaces cs
          ON cs.area_version_id = a.area_version_id
         AND cs.id = a.common_space_id
        GROUP BY u.id
    ), base AS (
        SELECT
            u.area_version_id,
            u.id AS unit_id,
            u.block_id,
            u.code,
            u.materialized_index,
            u.code AS unit_label,
            COALESCE(p.q20, 0) AS q20,
            COALESCE(p.q21, 0) AS q21,
            COALESCE(p.q22, 0) AS q22,
            COALESCE(p.q20, 0) + COALESCE(p.q21, 0) AS q23,
            COALESCE(p.q20, 0) + COALESCE(p.q22, 0) AS q24,
            COALESCE(n.q25, 0) AS q25,
            COALESCE(n.q26, 0) AS q26,
            COALESCE(n.q27, 0) AS q27,
            COALESCE(n.q25, 0) + COALESCE(n.q26, 0) AS q28,
            COALESCE(n.q25, 0) + COALESCE(n.q27, 0) AS q29,
            COALESCE(p.q20, 0) + COALESCE(p.q22, 0) + COALESCE(n.q25, 0) + COALESCE(n.q27, 0) AS q30
        FROM units u
        LEFT JOIN private_areas p ON p.unit_id = u.id
        LEFT JOIN nonprop n ON n.unit_id = u.id
    ), global_den AS (
        SELECT COALESCE(NULLIF(SUM(q30), 0), 1) AS denominator FROM base
    ), block_den AS (
        SELECT block_id, COALESCE(NULLIF(SUM(q30), 0), 1) AS denominator
          FROM base
         GROUP BY block_id
    ), prop_alloc AS (
        SELECT
            b.unit_id,
            COALESCE(SUM(
                CASE
                    WHEN ds.distribution_scope = 'global' AND cs.coverage_class = 'covered_standard'
                        THEN cs.real_area_m2_raw * (b.q30 / gd.denominator)
                    WHEN ds.distribution_scope = 'block' AND cs.coverage_class = 'covered_standard' AND b.block_id = ds.block_id
                        THEN cs.real_area_m2_raw * (b.q30 / bd.denominator)
                    ELSE 0
                END
            ), 0) AS q32,
            COALESCE(SUM(
                CASE
                    WHEN ds.distribution_scope = 'global' AND cs.coverage_class IN ('covered_different','uncovered')
                        THEN cs.real_area_m2_raw * (b.q30 / gd.denominator)
                    WHEN ds.distribution_scope = 'block' AND cs.coverage_class IN ('covered_different','uncovered') AND b.block_id = ds.block_id
                        THEN cs.real_area_m2_raw * (b.q30 / bd.denominator)
                    ELSE 0
                END
            ), 0) AS q33,
            COALESCE(SUM(
                CASE
                    WHEN ds.distribution_scope = 'global' AND cs.coverage_class IN ('covered_different','uncovered')
                        THEN cs.equivalent_area_m2_raw * (b.q30 / gd.denominator)
                    WHEN ds.distribution_scope = 'block' AND cs.coverage_class IN ('covered_different','uncovered') AND b.block_id = ds.block_id
                        THEN cs.equivalent_area_m2_raw * (b.q30 / bd.denominator)
                    ELSE 0
                END
            ), 0) AS q34
        FROM base b
        CROSS JOIN global_den gd
        LEFT JOIN block_den bd ON bd.block_id = b.block_id
        LEFT JOIN public.area_version_common_distribution_scopes ds
          ON ds.area_version_id = b.area_version_id
         AND (ds.distribution_scope = 'global' OR ds.block_id = b.block_id)
        LEFT JOIN public.area_version_spaces cs
          ON cs.area_version_id = ds.area_version_id
         AND cs.id = ds.common_space_id
         AND cs.use_class = 'common'
         AND cs.common_division_class = 'proportional'
         AND cs.is_materialized = true
         AND cs.is_template = false
        GROUP BY b.unit_id
    ), total_den AS (
        SELECT COALESCE(NULLIF(SUM(q30), 0), 1) AS denominator FROM base
    )
    SELECT
        b.area_version_id,
        b.unit_id,
        (ROW_NUMBER() OVER (ORDER BY b.code))::integer,
        b.unit_label,
        round(b.q20, 6),
        round(b.q21, 6),
        round(b.q22, 6),
        round(b.q23, 6),
        round(b.q24, 6),
        round(b.q25, 6),
        round(b.q26, 6),
        round(b.q27, 6),
        round(b.q28, 6),
        round(b.q29, 6),
        round(b.q30, 6),
        round(b.q30 / td.denominator, 12),
        round(COALESCE(pa.q32, 0), 6),
        round(COALESCE(pa.q33, 0), 6),
        round(COALESCE(pa.q34, 0), 6),
        round(COALESCE(pa.q32, 0) + COALESCE(pa.q33, 0), 6),
        round(COALESCE(pa.q32, 0) + COALESCE(pa.q34, 0), 6),
        round(b.q23 + b.q28 + COALESCE(pa.q32, 0) + COALESCE(pa.q33, 0), 6),
        round(b.q30 + COALESCE(pa.q32, 0) + COALESCE(pa.q34, 0), 6)
    FROM base b
    CROSS JOIN total_den td
    LEFT JOIN prop_alloc pa ON pa.unit_id = b.unit_id;

    INSERT INTO public.area_version_fraction_ideals (
        area_version_id, unit_id, source_coefficient,
        fraction_decimal_raw, fraction_percent_raw, fraction_thousandths_raw,
        derivation_method
    )
    SELECT
        area_version_id,
        unit_id,
        qii_31_proportionality_coefficient_raw,
        qii_31_proportionality_coefficient_raw,
        round(qii_31_proportionality_coefficient_raw * 100, 10),
        round(qii_31_proportionality_coefficient_raw * 1000, 8),
        'derived_from_coefficient'::public.area_fraction_derivation_method
    FROM public.area_version_quadro_ii_rows
    WHERE area_version_id = p_area_version_id;

    INSERT INTO public.area_version_quadro_ivb_rows (
        area_version_id, unit_id, row_order, unit_label,
        qivb_b_private_main_area_raw,
        qivb_c_private_accessory_area_raw,
        qivb_d_private_total_area_raw,
        qivb_e_common_area_raw,
        qivb_f_real_total_area_raw,
        qivb_g_proportionality_coefficient_raw,
        fraction_decimal_raw,
        fraction_percent_raw,
        fraction_thousandths_raw
    )
    WITH direct_private AS (
        SELECT
            u.id AS unit_id,
            COALESCE(SUM(s.real_area_m2_raw) FILTER (WHERE s.private_nature = 'main'), 0) AS main_area,
            COALESCE(SUM(s.real_area_m2_raw) FILTER (WHERE s.private_nature = 'accessory'), 0) AS accessory_area
        FROM public.area_version_units u
        LEFT JOIN public.area_version_spaces s
          ON s.area_version_id = u.area_version_id
         AND s.unit_id = u.id
         AND s.use_class = 'private'
         AND s.ownership_accounting_mode IN ('direct_unit','autonomous_unit')
         AND s.is_materialized = true
         AND s.is_template = false
        WHERE u.area_version_id = p_area_version_id
          AND u.is_materialized = true
          AND u.is_template = false
          AND u.is_active = true
          AND u.is_autonomous = true
        GROUP BY u.id
    ), linked_accessories AS (
        SELECT
            l.parent_unit_id AS unit_id,
            COALESCE(SUM(s.real_area_m2_raw), 0) AS linked_area
        FROM public.area_version_unit_accessory_links l
        JOIN public.area_version_spaces s
          ON s.area_version_id = l.area_version_id
         AND s.id = l.accessory_space_id
         AND s.ownership_accounting_mode = 'linked_accessory'
        WHERE l.area_version_id = p_area_version_id
          AND l.affects_private_area = true
        GROUP BY l.parent_unit_id
    )
    SELECT
        q.area_version_id,
        q.unit_id,
        q.row_order,
        q.unit_label,
        round(COALESCE(dp.main_area, 0), 6),
        round(COALESCE(dp.accessory_area, 0) + COALESCE(la.linked_area, 0), 6),
        round(COALESCE(dp.main_area, 0) + COALESCE(dp.accessory_area, 0) + COALESCE(la.linked_area, 0), 6),
        round(q.qii_28_common_nonprop_real_total_raw + q.qii_35_common_prop_real_total_raw, 6),
        round(COALESCE(dp.main_area, 0) + COALESCE(dp.accessory_area, 0) + COALESCE(la.linked_area, 0) + q.qii_28_common_nonprop_real_total_raw + q.qii_35_common_prop_real_total_raw, 6),
        q.qii_31_proportionality_coefficient_raw,
        f.fraction_decimal_raw,
        f.fraction_percent_raw,
        f.fraction_thousandths_raw
    FROM public.area_version_quadro_ii_rows q
    LEFT JOIN direct_private dp ON dp.unit_id = q.unit_id
    LEFT JOIN linked_accessories la ON la.unit_id = q.unit_id
    JOIN public.area_version_fraction_ideals f
      ON f.area_version_id = q.area_version_id
     AND f.unit_id = q.unit_id
    WHERE q.area_version_id = p_area_version_id;

    v_payload := jsonb_build_object(
        'normative_reference', v_version.normative_reference,
        'normative_valid_from', v_version.normative_valid_from,
        'calculation_engine_version', v_version.calculation_engine_version,
        'rounding_profile', v_version.rounding_profile,
        'blocks', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('code', code, 'name', name, 'sort_order', sort_order) ORDER BY sort_order, name)
            FROM public.area_version_blocks WHERE area_version_id = p_area_version_id
        ), '[]'::jsonb),
        'floors', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('block_code', b.code, 'block_name', b.name, 'code', f.code, 'name', f.name, 'sort_order', f.sort_order, 'label', f.materialized_label) ORDER BY b.sort_order, b.name, f.sort_order, f.name)
            FROM public.area_version_floors f
            JOIN public.area_version_blocks b ON b.area_version_id = f.area_version_id AND b.id = f.block_id
            WHERE f.area_version_id = p_area_version_id AND f.is_materialized = true AND f.is_template = false
        ), '[]'::jsonb),
        'units', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('code', u.code, 'type', u.unit_type, 'block_code', b.code, 'block_name', b.name, 'typology', u.typology_code) ORDER BY b.sort_order, b.name, u.code)
            FROM public.area_version_units u
            JOIN public.area_version_blocks b ON b.area_version_id = u.area_version_id AND b.id = u.block_id
            WHERE u.area_version_id = p_area_version_id AND u.is_materialized = true AND u.is_template = false
        ), '[]'::jsonb),
        'spaces', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('code', code, 'name', name, 'use', use_class, 'nature', private_nature, 'coverage', coverage_class, 'division', common_division_class, 'area', real_area_m2_raw, 'coef', coefficient_value, 'eq', equivalent_area_m2_raw) ORDER BY code, name)
            FROM public.area_version_spaces WHERE area_version_id = p_area_version_id AND is_materialized = true AND is_template = false
        ), '[]'::jsonb),
        'quadro_i', COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'id' - 'area_version_id' - 'block_id' - 'floor_id' - 'created_at' ORDER BY row_order) FROM public.area_version_quadro_i_rows r WHERE area_version_id = p_area_version_id), '[]'::jsonb),
        'quadro_ii', COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'id' - 'area_version_id' - 'unit_id' - 'created_at' ORDER BY row_order) FROM public.area_version_quadro_ii_rows r WHERE area_version_id = p_area_version_id), '[]'::jsonb),
        'quadro_ivb', COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'id' - 'area_version_id' - 'unit_id' - 'created_at' ORDER BY row_order) FROM public.area_version_quadro_ivb_rows r WHERE area_version_id = p_area_version_id), '[]'::jsonb),
        'fractions', COALESCE((SELECT jsonb_agg((to_jsonb(f) - 'id' - 'area_version_id' - 'unit_id' - 'created_at' - 'updated_at' - 'created_by' - 'updated_by') || jsonb_build_object('unit_code', u.code) ORDER BY u.code) FROM public.area_version_fraction_ideals f JOIN public.area_version_units u ON u.area_version_id = f.area_version_id AND u.id = f.unit_id WHERE f.area_version_id = p_area_version_id), '[]'::jsonb)
    );

    v_payload_hash := encode(digest(v_payload::text, 'sha256'), 'hex');

    UPDATE public.area_versions
       SET status = 'calculated',
           version_payload_hash = v_payload_hash,
           canonical_payload_json = v_payload,
           updated_at = NOW()
     WHERE id = p_area_version_id;

    INSERT INTO public.area_version_audit_logs (
        area_version_id, entity_type, entity_id, action, new_value, reason, performed_by
    ) VALUES (
        p_area_version_id,
        'area_versions',
        p_area_version_id,
        'calculate',
        jsonb_build_object('version_payload_hash', v_payload_hash),
        'calculate_area_version',
        auth.uid()
    );

    v_validation := public.validate_area_version(p_area_version_id);

    RETURN jsonb_build_object(
        'status', CASE WHEN jsonb_array_length(COALESCE(v_validation->'blocking_errors','[]'::jsonb)) = 0 THEN 'success' ELSE 'failed' END,
        'version_id', p_area_version_id,
        'version_payload_hash', v_payload_hash,
        'blocking_errors', COALESCE(v_validation->'blocking_errors','[]'::jsonb),
        'warnings', COALESCE(v_validation->'warnings','[]'::jsonb)
    );
END;
$$;






