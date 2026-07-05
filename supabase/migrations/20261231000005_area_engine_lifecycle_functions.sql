-- ============================================================
-- Lifecycle do motor de areas NBR 12721 MVP
-- Aprovacao, lock, hash documental e supersedencia
-- ============================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.approve_area_version(
    p_area_version_id UUID,
    p_approval_type public.area_approval_type,
    p_comments TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_version public.area_versions%ROWTYPE;
    v_now TIMESTAMPTZ := NOW();
    v_approval_hash TEXT;
    v_next_status public.area_version_status;
BEGIN
    SELECT * INTO v_version
      FROM public.area_versions
     WHERE id = p_area_version_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status','failed','blocking_errors',jsonb_build_array(jsonb_build_object('code','VERSION_NOT_FOUND','message','Versao de areas nao encontrada')));
    END IF;

    IF v_version.status IN ('locked','superseded','cancelled') THEN
        RETURN jsonb_build_object('status','failed','blocking_errors',jsonb_build_array(jsonb_build_object('code','APPROVAL_001','message','Versao nao pode receber aprovacao neste status','version_status',v_version.status)));
    END IF;

    IF v_version.version_payload_hash IS NULL OR v_version.canonical_payload_json IS NULL THEN
        RETURN jsonb_build_object('status','failed','blocking_errors',jsonb_build_array(jsonb_build_object('code','APPROVAL_002','message','Versao precisa estar calculada antes da aprovacao')));
    END IF;

    IF p_approval_type = 'technical' AND v_version.status NOT IN ('calculated','pending_technical_approval','technically_approved','pending_legal_approval','legally_approved') THEN
        RETURN jsonb_build_object('status','failed','blocking_errors',jsonb_build_array(jsonb_build_object('code','APPROVAL_003','message','Aprovacao tecnica exige versao calculada')));
    END IF;

    IF p_approval_type = 'legal' AND NOT EXISTS (
        SELECT 1
          FROM public.area_version_approvals
         WHERE area_version_id = p_area_version_id
           AND approval_type = 'technical'
           AND status = 'approved'
    ) THEN
        RETURN jsonb_build_object('status','failed','blocking_errors',jsonb_build_array(jsonb_build_object('code','APPROVAL_004','message','Aprovacao juridica exige aprovacao tecnica previa')));
    END IF;

    v_approval_hash := encode(digest(jsonb_build_object(
        'area_version_id', p_area_version_id,
        'approval_type', p_approval_type,
        'version_payload_hash', v_version.version_payload_hash,
        'reviewed_by', auth.uid(),
        'reviewed_at', v_now,
        'comments', p_comments
    )::text, 'sha256'), 'hex');

    INSERT INTO public.area_version_approvals (
        area_version_id,
        approval_type,
        status,
        requested_by,
        requested_at,
        reviewed_by,
        reviewed_at,
        comments,
        approval_hash
    ) VALUES (
        p_area_version_id,
        p_approval_type,
        'approved',
        auth.uid(),
        v_now,
        auth.uid(),
        v_now,
        p_comments,
        v_approval_hash
    )
    ON CONFLICT (area_version_id, approval_type)
    DO UPDATE SET
        status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = v_now,
        comments = EXCLUDED.comments,
        approval_hash = EXCLUDED.approval_hash,
        updated_at = v_now;

    v_next_status := v_version.status;
    IF p_approval_type = 'technical' THEN
        v_next_status := 'technically_approved';
    ELSIF p_approval_type = 'legal' THEN
        v_next_status := 'legally_approved';
    END IF;

    UPDATE public.area_versions
       SET status = v_next_status,
           updated_at = v_now
     WHERE id = p_area_version_id;

    INSERT INTO public.area_version_audit_logs (
        area_version_id, entity_type, entity_id, action, new_value, reason, performed_by
    ) VALUES (
        p_area_version_id,
        'area_version_approvals',
        p_area_version_id,
        'approve',
        jsonb_build_object('approval_type', p_approval_type, 'approval_hash', v_approval_hash, 'version_status', v_next_status),
        'approve_area_version',
        auth.uid()
    );

    RETURN jsonb_build_object(
        'status','success',
        'version_id',p_area_version_id,
        'approval_type',p_approval_type,
        'approval_hash',v_approval_hash,
        'version_status',v_next_status
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_area_version(p_area_version_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_version public.area_versions%ROWTYPE;
    v_validation JSONB;
    v_error_count INTEGER;
    v_locked_at TIMESTAMPTZ := NOW();
    v_identity_payload JSONB;
    v_identity_hash TEXT;
BEGIN
    SELECT * INTO v_version
      FROM public.area_versions
     WHERE id = p_area_version_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status','failed','blocking_errors',jsonb_build_array(jsonb_build_object('code','VERSION_NOT_FOUND','message','Versao de areas nao encontrada')));
    END IF;

    IF v_version.status IN ('locked','superseded','cancelled') THEN
        RETURN jsonb_build_object('status','failed','blocking_errors',jsonb_build_array(jsonb_build_object('code','LOCK_001','message','Versao nao pode ser bloqueada neste status','version_status',v_version.status)));
    END IF;

    IF v_version.status <> 'legally_approved' THEN
        RETURN jsonb_build_object('status','failed','blocking_errors',jsonb_build_array(jsonb_build_object('code','LOCK_002','message','Lock exige aprovacao juridica concluida','version_status',v_version.status)));
    END IF;

    IF v_version.version_payload_hash IS NULL OR v_version.canonical_payload_json IS NULL THEN
        RETURN jsonb_build_object('status','failed','blocking_errors',jsonb_build_array(jsonb_build_object('code','LOCK_003','message','Lock exige payload calculado')));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.area_version_approvals
         WHERE area_version_id = p_area_version_id
           AND approval_type = 'technical'
           AND status = 'approved'
           AND approval_hash IS NOT NULL
    ) THEN
        RETURN jsonb_build_object('status','failed','blocking_errors',jsonb_build_array(jsonb_build_object('code','LOCK_004','message','Lock exige aprovacao tecnica aprovada')));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.area_version_approvals
         WHERE area_version_id = p_area_version_id
           AND approval_type = 'legal'
           AND status = 'approved'
           AND approval_hash IS NOT NULL
    ) THEN
        RETURN jsonb_build_object('status','failed','blocking_errors',jsonb_build_array(jsonb_build_object('code','LOCK_005','message','Lock exige aprovacao juridica aprovada')));
    END IF;

    v_validation := public.validate_area_version(p_area_version_id);
    v_error_count := jsonb_array_length(COALESCE(v_validation->'blocking_errors','[]'::jsonb));
    IF v_error_count > 0 THEN
        RETURN jsonb_build_object('status','failed','blocking_errors',v_validation->'blocking_errors','warnings',v_validation->'warnings');
    END IF;

    v_identity_payload := jsonb_build_object(
        'area_version_id', p_area_version_id,
        'calculation_engine_version', v_version.calculation_engine_version,
        'normative_reference', v_version.normative_reference,
        'normative_valid_from', v_version.normative_valid_from,
        'version_payload_hash', v_version.version_payload_hash,
        'locked_at', v_locked_at,
        'approvals', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'approval_type', approval_type,
                'status', status,
                'reviewed_by', reviewed_by,
                'reviewed_at', reviewed_at,
                'approval_hash', approval_hash
            ) ORDER BY approval_type)
            FROM public.area_version_approvals
            WHERE area_version_id = p_area_version_id
              AND status = 'approved'
        ), '[]'::jsonb)
    );

    v_identity_hash := encode(digest(v_identity_payload::text, 'sha256'), 'hex');

    UPDATE public.area_versions
       SET status = 'locked',
           locked_at = v_locked_at,
           version_identity_hash = v_identity_hash,
           updated_at = v_locked_at
     WHERE id = p_area_version_id;

    INSERT INTO public.area_version_audit_logs (
        area_version_id, entity_type, entity_id, action, new_value, reason, performed_by
    ) VALUES (
        p_area_version_id,
        'area_versions',
        p_area_version_id,
        'lock',
        jsonb_build_object('version_identity_hash', v_identity_hash, 'locked_at', v_locked_at),
        'lock_area_version',
        auth.uid()
    );

    RETURN jsonb_build_object(
        'status','success',
        'version_id',p_area_version_id,
        'version_status','locked',
        'version_payload_hash',v_version.version_payload_hash,
        'version_identity_hash',v_identity_hash,
        'locked_at',v_locked_at
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.supersede_area_version(
    p_area_version_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_version public.area_versions%ROWTYPE;
BEGIN
    SELECT * INTO v_version
      FROM public.area_versions
     WHERE id = p_area_version_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status','failed','blocking_errors',jsonb_build_array(jsonb_build_object('code','VERSION_NOT_FOUND','message','Versao de areas nao encontrada')));
    END IF;

    IF v_version.status <> 'locked' THEN
        RETURN jsonb_build_object('status','failed','blocking_errors',jsonb_build_array(jsonb_build_object('code','SUPERSEDE_001','message','Somente versao locked pode ser superseded','version_status',v_version.status)));
    END IF;

    UPDATE public.area_versions
       SET status = 'superseded',
           updated_at = NOW()
     WHERE id = p_area_version_id;

    INSERT INTO public.area_version_audit_logs (
        area_version_id, entity_type, entity_id, action, old_value, new_value, reason, performed_by
    ) VALUES (
        p_area_version_id,
        'area_versions',
        p_area_version_id,
        'update',
        jsonb_build_object('status', v_version.status),
        jsonb_build_object('status', 'superseded'),
        COALESCE(p_reason, 'supersede_area_version'),
        auth.uid()
    );

    RETURN jsonb_build_object('status','success','version_id',p_area_version_id,'version_status','superseded');
END;
$$;
