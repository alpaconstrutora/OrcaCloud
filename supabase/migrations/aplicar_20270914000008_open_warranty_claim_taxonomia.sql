-- ============================================================================
-- open_warranty_claim: taxonomia controlada + origem provável
-- OrçaCloud SaaS · aplicar_20270914000008
-- Plano: docs/planos/2026-08-26-consolidar-qualidade-em-garantia.md
--
-- Depende de aplicar_20270914000007 (colunas `taxonomy`/`origin` e o seed da
-- taxonomia). Aplicar NESTA ORDEM.
--
-- A assinatura antiga é DROPADA antes, não substituída: `CREATE OR REPLACE`
-- com dois parâmetros a mais criaria uma SOBRECARGA, e duas funções de mesmo
-- nome deixam o PostgREST ambíguo ("could not choose the best candidate").
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.open_warranty_claim(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
);

CREATE OR REPLACE FUNCTION public.open_warranty_claim(
  p_organization_id    UUID,
  p_project_id         UUID,
  p_client_id          UUID,
  p_client_name        TEXT,
  p_unidade_ref        TEXT,
  p_sistema_descricao  TEXT,
  p_local_afetado      TEXT,
  p_descricao          TEXT,
  p_severity           TEXT,
  p_warranty_term_code TEXT,
  p_opened_by          JSONB,
  p_taxonomy           JSONB DEFAULT NULL,
  p_origin             TEXT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_severity NOT IN ('baixa', 'media', 'alta', 'critica') THEN
    RAISE EXCEPTION 'InvariantViolation: severidade inválida %', p_severity
      USING ERRCODE = 'P0004';
  END IF;

  IF p_origin IS NOT NULL AND p_origin NOT IN (
    'execucao', 'material', 'projeto', 'uso', 'manutencao', 'indeterminada'
  ) THEN
    RAISE EXCEPTION 'InvariantViolation: origem inválida %', p_origin
      USING ERRCODE = 'P0004';
  END IF;

  -- Taxonomia é OPCIONAL (um chamado pode nascer de um telefonema, sem
  -- classificação). Mas se vier, tem de bater com a taxonomia controlada —
  -- é isso que impede o vocabulário de virar texto livre de novo.
  IF p_taxonomy IS NOT NULL AND p_taxonomy->>'pathologyCode' IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.condition_taxonomy_pathologies p
      JOIN public.condition_taxonomy_systems s ON s.code = p.system_code
      WHERE p.code = p_taxonomy->>'pathologyCode'
        AND p.active = true
        AND (p_taxonomy->>'systemCode' IS NULL OR s.code = p_taxonomy->>'systemCode')
    ) THEN
      RAISE EXCEPTION 'InvariantViolation: patologia % não pertence à taxonomia controlada (sistema %)',
        p_taxonomy->>'pathologyCode', p_taxonomy->>'systemCode'
        USING ERRCODE = 'P0004';
    END IF;
  ELSIF p_taxonomy IS NOT NULL AND p_taxonomy->>'systemCode' IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.condition_taxonomy_systems
      WHERE code = p_taxonomy->>'systemCode' AND active = true
    ) THEN
      RAISE EXCEPTION 'InvariantViolation: sistema % não pertence à taxonomia controlada',
        p_taxonomy->>'systemCode'
        USING ERRCODE = 'P0004';
    END IF;
  END IF;

  INSERT INTO public.warranty_claims (
    organization_id, project_id, client_id, client_name, unidade_ref,
    sistema_descricao, local_afetado, descricao, severity,
    warranty_term_code, state, opened_by, version, taxonomy, origin
  ) VALUES (
    p_organization_id, p_project_id, p_client_id, p_client_name, p_unidade_ref,
    p_sistema_descricao, p_local_afetado, p_descricao, p_severity,
    p_warranty_term_code, 'ABERTO', p_opened_by, 1, p_taxonomy, p_origin
  ) RETURNING id INTO v_id;

  INSERT INTO public.warranty_claim_events (
    organization_id, claim_id, event_type, payload, aggregate_version
  ) VALUES (
    p_organization_id, v_id, 'ClaimOpened',
    jsonb_build_object(
      'state', 'ABERTO', 'severity', p_severity,
      'sistema', p_sistema_descricao, 'actor', p_opened_by,
      'taxonomy', p_taxonomy, 'origin', p_origin
    ), 1
  );

  RETURN jsonb_build_object('id', v_id, 'version', 1);
END;
$$;

-- RPC recriada = permissão recriada do zero (padrão do repo).
REVOKE ALL ON FUNCTION public.open_warranty_claim(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_warranty_claim(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT
) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Atualizar a classificação de um chamado já aberto (o modal de abertura não
-- é a única porta: chamado que entra por telefone é classificado depois).
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.classify_warranty_claim(
  p_claim_id         UUID,
  p_organization_id  UUID,
  p_expected_version INT,
  p_taxonomy         JSONB,
  p_origin           TEXT,
  p_actor            JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_version INT;
BEGIN
  SELECT version INTO v_version
  FROM public.warranty_claims
  WHERE id = p_claim_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NotFound: chamado % não encontrado', p_claim_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_version <> p_expected_version THEN
    RAISE EXCEPTION 'ConcurrencyConflict: versão esperada %, atual %',
      p_expected_version, v_version
      USING ERRCODE = 'P0003';
  END IF;

  IF p_origin IS NOT NULL AND p_origin NOT IN (
    'execucao', 'material', 'projeto', 'uso', 'manutencao', 'indeterminada'
  ) THEN
    RAISE EXCEPTION 'InvariantViolation: origem inválida %', p_origin
      USING ERRCODE = 'P0004';
  END IF;

  IF p_taxonomy IS NOT NULL AND p_taxonomy->>'pathologyCode' IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.condition_taxonomy_pathologies p
      JOIN public.condition_taxonomy_systems s ON s.code = p.system_code
      WHERE p.code = p_taxonomy->>'pathologyCode'
        AND p.active = true
        AND (p_taxonomy->>'systemCode' IS NULL OR s.code = p_taxonomy->>'systemCode')
    ) THEN
      RAISE EXCEPTION 'InvariantViolation: patologia % não pertence à taxonomia controlada (sistema %)',
        p_taxonomy->>'pathologyCode', p_taxonomy->>'systemCode'
        USING ERRCODE = 'P0004';
    END IF;
  END IF;

  UPDATE public.warranty_claims
     SET taxonomy = p_taxonomy,
         origin   = COALESCE(p_origin, origin),
         version  = version + 1
   WHERE id = p_claim_id AND organization_id = p_organization_id;

  INSERT INTO public.warranty_claim_events (
    organization_id, claim_id, event_type, payload, aggregate_version
  ) VALUES (
    p_organization_id, p_claim_id, 'ClaimClassified',
    jsonb_build_object('taxonomy', p_taxonomy, 'origin', p_origin, 'actor', p_actor),
    v_version + 1
  );

  RETURN jsonb_build_object('id', p_claim_id, 'version', v_version + 1);
END;
$$;

REVOKE ALL ON FUNCTION public.classify_warranty_claim(UUID, UUID, INT, JSONB, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.classify_warranty_claim(UUID, UUID, INT, JSONB, TEXT, JSONB) TO authenticated;

COMMIT;
