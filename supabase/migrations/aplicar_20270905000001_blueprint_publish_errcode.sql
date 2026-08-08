-- ============================================================================
-- Planta Inteligente — conflito de revisão parava de responder
-- Plano: docs/planos/2026-08-08-e0-fundacao-blueprint.md
-- Corrige: aplicar_20270905000000_blueprint_kernel_foundation.sql
--
-- ACHADO PELO TESTE DE INTEGRAÇÃO (__tests__/blueprintE0.integration.test.ts).
--
-- `fn_blueprint_publish_snapshot` levantava a recusa de revisão desatualizada
-- com ERRCODE 'serialization_failure' (40001). Parecia o código semanticamente
-- certo — é um conflito de concorrência — mas 40001 é exatamente o SQLSTATE que
-- o PostgREST considera RETENTÁVEL: ele reexecuta a transação sozinho, em laço.
--
-- Como a condição não se resolve com repetição (a revisão enviada continua
-- velha em toda tentativa), o cliente ficava pendurado até o AbortController de
-- lib/supabase.ts cortar em 20 s. O usuário veria "carregando" e depois falha de
-- rede, em vez de "recarregue o desenho".
--
-- 'restrict_violation' (23001) descreve a mesma coisa — operação recusada por
-- violar uma restrição — e está na classe 23, que o PostgREST mapeia para
-- 409 Conflict sem retentar.
--
-- ⚠️ APLICAR À MÃO pelo SQL Editor. Só substitui a função; não toca em tabela,
--    dado ou policy. CREATE OR REPLACE é idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_blueprint_publish_snapshot(
    p_branch_id      UUID,
    p_base_revision  INTEGER,
    p_hash           TEXT,
    p_kernel_version TEXT,
    p_payload        JSONB,
    p_notes          TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_study_id     UUID;
    v_org_id       UUID;
    v_current_rev  INTEGER;
    v_next_rev     INTEGER;
    v_snapshot_id  UUID;
    v_existing     UUID;
    v_item         JSONB;
    v_idx          INTEGER;
BEGIN
    SELECT b.study_id, b.organization_id, b.base_revision
      INTO v_study_id, v_org_id, v_current_rev
      FROM public.blueprint_branches b
     WHERE b.id = p_branch_id
       FOR UPDATE;

    IF v_study_id IS NULL THEN
        RAISE EXCEPTION 'blueprint: ramo % não encontrado', p_branch_id
          USING ERRCODE = 'no_data_found';
    END IF;

    SELECT s.id INTO v_existing
      FROM public.blueprint_snapshots s
     WHERE s.branch_id = p_branch_id
       AND s.revision  = v_current_rev
       AND s.hash      = p_hash;

    IF v_existing IS NOT NULL THEN
        RETURN v_existing;
    END IF;

    -- 'restrict_violation' e NÃO 'serialization_failure': ver cabeçalho.
    -- Repetir esta chamada nunca vai resolver, então ela não pode sinalizar
    -- "retentável" para a camada de transporte.
    IF p_base_revision IS DISTINCT FROM v_current_rev THEN
        RAISE EXCEPTION
          'blueprint: revisão desatualizada (enviou %, ramo está em %)',
          p_base_revision, v_current_rev
          USING ERRCODE = 'restrict_violation';
    END IF;

    v_next_rev := v_current_rev + 1;

    INSERT INTO public.blueprint_snapshots (
        study_id, branch_id, organization_id, revision,
        hash, kernel_version, payload, notes, published_by
    ) VALUES (
        v_study_id, p_branch_id, v_org_id, v_next_rev,
        p_hash, p_kernel_version, p_payload, p_notes, auth.uid()
    )
    RETURNING id INTO v_snapshot_id;

    FOR v_item, v_idx IN
        SELECT value, ord - 1 FROM jsonb_array_elements(COALESCE(p_payload->'walls','[]'::jsonb))
          WITH ORDINALITY AS t(value, ord)
    LOOP
        INSERT INTO public.blueprint_objects
            (snapshot_id, organization_id, object_type, object_index, level_index, props, length_mm)
        VALUES (
            v_snapshot_id, v_org_id, 'WALL', v_idx, (v_item->>'level')::INTEGER, v_item,
            ROUND(sqrt(
                power((v_item->'b'->>'x')::NUMERIC - (v_item->'a'->>'x')::NUMERIC, 2) +
                power((v_item->'b'->>'y')::NUMERIC - (v_item->'a'->>'y')::NUMERIC, 2)
            ))::INTEGER
        );
    END LOOP;

    FOR v_item, v_idx IN
        SELECT value, ord - 1 FROM jsonb_array_elements(COALESCE(p_payload->'openings','[]'::jsonb))
          WITH ORDINALITY AS t(value, ord)
    LOOP
        INSERT INTO public.blueprint_objects
            (snapshot_id, organization_id, object_type, object_index, props)
        VALUES (v_snapshot_id, v_org_id, 'OPENING', v_idx, v_item);
    END LOOP;

    FOR v_item, v_idx IN
        SELECT value, ord - 1 FROM jsonb_array_elements(COALESCE(p_payload->'boundaries','[]'::jsonb))
          WITH ORDINALITY AS t(value, ord)
    LOOP
        INSERT INTO public.blueprint_objects
            (snapshot_id, organization_id, object_type, object_index, level_index, props)
        VALUES (v_snapshot_id, v_org_id, 'BOUNDARY', v_idx, (v_item->>'level')::INTEGER, v_item);
    END LOOP;

    FOR v_item, v_idx IN
        SELECT value, ord - 1 FROM jsonb_array_elements(COALESCE(p_payload->'spaces','[]'::jsonb))
          WITH ORDINALITY AS t(value, ord)
    LOOP
        INSERT INTO public.blueprint_objects
            (snapshot_id, organization_id, object_type, object_index, level_index, props, area_mm2)
        VALUES (
            v_snapshot_id, v_org_id, 'SPACE', v_idx, (v_item->>'level')::INTEGER, v_item,
            (v_item->>'areaMm2')::BIGINT
        );
    END LOOP;

    UPDATE public.blueprint_branches
       SET base_revision        = v_next_rev,
           parent_snapshot_id   = v_snapshot_id,
           draft_payload        = NULL,
           draft_hash           = NULL,
           draft_kernel_version = NULL,
           draft_saved_at       = NULL
     WHERE id = p_branch_id;

    UPDATE public.blueprint_studies
       SET status = 'PUBLICADO'
     WHERE id = v_study_id AND status <> 'ARQUIVADO';

    INSERT INTO public.blueprint_audit_events
        (organization_id, study_id, actor, action, target_type, target_id, metadata)
    VALUES (
        v_org_id, v_study_id, auth.uid(), 'SNAPSHOT_PUBLICADO', 'SNAPSHOT', v_snapshot_id,
        jsonb_build_object(
            'revision', v_next_rev, 'hash', p_hash, 'kernel_version', p_kernel_version
        )
    );

    RETURN v_snapshot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_blueprint_publish_snapshot(UUID, INTEGER, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_blueprint_publish_snapshot(UUID, INTEGER, TEXT, TEXT, JSONB, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_blueprint_publish_snapshot(UUID, INTEGER, TEXT, TEXT, JSONB, TEXT) TO authenticated;
