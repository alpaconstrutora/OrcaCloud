-- ============================================================================
-- Pós-Obra & Garantia: ciclo de vida completo do chamado
-- OrçaCloud SaaS · aplicar_20271011000500
-- Plano: docs/planos/2026-10-11-pos-obra-garantia-conexao-suprimentos.md (Fase 0)
--
-- Até aqui nenhum chamado novo passava de "Em garantia": não existia RPC para
-- EM_REPARO / CONCLUIDO (o `complete_repair` prometido em 20260708000000:293
-- nunca foi escrito), a visita não tinha resultado e o encerramento era
-- inalcançável. Esta migration:
--
--   PARTE 1 — warranty_claims.closed_at (+ backfill pelo evento ClaimClosed)
--   PARTE 2 — RPCs novas: start_warranty_repair, complete_warranty_repair,
--             record_warranty_visit_result, set_warranty_responsibility
--   PARTE 3 — triage / schedule_visit / close reescritas a partir da definição
--             VIVA (pg_get_functiondef, 2026-10-11), agora com guarda de estado
--   PARTE 4 — REGRA #7: as RPCs do módulo estavam executáveis por PUBLIC e anon
--             (proacl `=X/` e `anon=X`). Revoga de todas.
--
-- As listas de estados de origem são as de utils/warrantyLifecycle.ts; cada
-- uma vem logo depois de um comentário `-- origem: <CONSTANTE>`, que é o que o
-- teste __tests__/warrantyLifecycleSql.test.ts compara.
--
-- Erro de estado = ERRCODE P0004 com frase para o usuário (a tela a exibe).
--
-- Aplicar com:  npx supabase db query --linked -f <este arquivo>
-- NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ────────────────────────────────────────────────────────────────────────────
-- PARTE 1 — closed_at
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.warranty_claims
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.warranty_claims.closed_at IS
  'Quando o chamado foi encerrado (close_warranty_claim). O KPI de custo do mês '
  'conta por esta data, não pela abertura.';

UPDATE public.warranty_claims c
   SET closed_at = COALESCE(
         (SELECT max(e.occurred_at) FROM public.warranty_claim_events e
           WHERE e.claim_id = c.id AND e.event_type = 'ClaimClosed'),
         c.updated_at)
 WHERE c.state = 'ENCERRADO' AND c.closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_warranty_claims_closed_at
  ON public.warranty_claims(organization_id, closed_at)
  WHERE closed_at IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- PARTE 2 — RPCs novas
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.start_warranty_repair(
  p_claim_id         UUID,
  p_organization_id  UUID,
  p_expected_version INTEGER,
  p_custo_estimado   NUMERIC,
  p_notes            TEXT,
  p_actor            JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_version     INT;
  v_state       TEXT;
  v_in_warranty BOOLEAN;
BEGIN
  SELECT version, state, in_warranty INTO v_version, v_state, v_in_warranty
    FROM public.warranty_claims
   WHERE id = p_claim_id AND organization_id = p_organization_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chamado não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_version <> p_expected_version THEN
    RAISE EXCEPTION 'CONCURRENCY_CONFLICT: versão % esperada, % encontrada',
      p_expected_version, v_version USING ERRCODE = 'P0003';
  END IF;
  IF v_in_warranty IS NULL THEN
    RAISE EXCEPTION 'Faça a triagem (em garantia ou fora de garantia) antes de iniciar o reparo.'
      USING ERRCODE = 'P0004';
  END IF;
  -- origem: ESTADOS_INICIAR_REPARO
  IF v_state NOT IN ('EM_GARANTIA', 'FORA_GARANTIA', 'VISITA_AGENDADA', 'REABERTO', 'CONTESTADO') THEN
    RAISE EXCEPTION 'Não é possível iniciar o reparo com o chamado em %.', v_state
      USING ERRCODE = 'P0004';
  END IF;
  IF p_custo_estimado IS NOT NULL AND p_custo_estimado < 0 THEN
    RAISE EXCEPTION 'O custo estimado não pode ser negativo.' USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.warranty_claims SET
    state          = 'EM_REPARO',
    custo_estimado = COALESCE(p_custo_estimado, custo_estimado),
    version        = v_version + 1
  WHERE id = p_claim_id AND organization_id = p_organization_id;

  INSERT INTO public.warranty_claim_events (
    organization_id, claim_id, event_type, payload, aggregate_version
  ) VALUES (
    p_organization_id, p_claim_id, 'RepairStarted',
    jsonb_build_object('from', v_state, 'custo_estimado', p_custo_estimado,
                       'notes', p_notes, 'actor', p_actor),
    v_version + 1
  );

  RETURN jsonb_build_object('id', p_claim_id, 'version', v_version + 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_warranty_repair(
  p_claim_id         UUID,
  p_organization_id  UUID,
  p_expected_version INTEGER,
  p_notes            TEXT,
  p_actor            JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_version INT;
  v_state   TEXT;
BEGIN
  SELECT version, state INTO v_version, v_state
    FROM public.warranty_claims
   WHERE id = p_claim_id AND organization_id = p_organization_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chamado não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_version <> p_expected_version THEN
    RAISE EXCEPTION 'CONCURRENCY_CONFLICT: versão % esperada, % encontrada',
      p_expected_version, v_version USING ERRCODE = 'P0003';
  END IF;
  -- origem: ESTADOS_CONCLUIR_REPARO
  IF v_state NOT IN ('EM_REPARO') THEN
    RAISE EXCEPTION 'Inicie o reparo antes de concluí-lo (o chamado está em %).', v_state
      USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.warranty_claims SET
    state   = 'CONCLUIDO',
    version = v_version + 1
  WHERE id = p_claim_id AND organization_id = p_organization_id;

  INSERT INTO public.warranty_claim_events (
    organization_id, claim_id, event_type, payload, aggregate_version
  ) VALUES (
    p_organization_id, p_claim_id, 'RepairCompleted',
    jsonb_build_object('notes', p_notes, 'actor', p_actor),
    v_version + 1
  );

  RETURN jsonb_build_object('id', p_claim_id, 'version', v_version + 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_warranty_visit_result(
  p_visit_id         UUID,
  p_claim_id         UUID,
  p_organization_id  UUID,
  p_expected_version INTEGER,
  p_realized_at      TIMESTAMPTZ,
  p_diagnostico      TEXT,
  p_parecer          TEXT,
  p_acao_definida    TEXT,
  p_actor            JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_version INT;
  v_state   TEXT;
BEGIN
  SELECT version, state INTO v_version, v_state
    FROM public.warranty_claims
   WHERE id = p_claim_id AND organization_id = p_organization_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chamado não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_version <> p_expected_version THEN
    RAISE EXCEPTION 'CONCURRENCY_CONFLICT: versão % esperada, % encontrada',
      p_expected_version, v_version USING ERRCODE = 'P0003';
  END IF;
  IF v_state = 'ENCERRADO' THEN
    RAISE EXCEPTION 'Chamado encerrado.' USING ERRCODE = 'P0004';
  END IF;
  IF p_parecer IS NOT NULL AND p_parecer NOT IN ('EM_GARANTIA', 'FORA_GARANTIA', 'AGUARDANDO_LAUDO') THEN
    RAISE EXCEPTION 'Parecer inválido: %.', p_parecer USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.warranty_claim_visits SET
    status        = 'REALIZADA',
    realized_at   = COALESCE(p_realized_at, now()),
    diagnostico   = p_diagnostico,
    parecer       = p_parecer,
    acao_definida = p_acao_definida
  WHERE id = p_visit_id
    AND claim_id = p_claim_id
    AND organization_id = p_organization_id
    AND status IN ('AGENDADA', 'REAGENDADA');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A visita não está agendada neste chamado (já foi registrada ou cancelada).'
      USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.warranty_claims SET version = v_version + 1
  WHERE id = p_claim_id AND organization_id = p_organization_id;

  INSERT INTO public.warranty_claim_events (
    organization_id, claim_id, event_type, payload, aggregate_version
  ) VALUES (
    p_organization_id, p_claim_id, 'VisitCompleted',
    jsonb_build_object('visit_id', p_visit_id, 'diagnostico', p_diagnostico,
                       'parecer', p_parecer, 'acao_definida', p_acao_definida,
                       'actor', p_actor),
    v_version + 1
  );

  RETURN jsonb_build_object('id', p_claim_id, 'version', v_version + 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_warranty_responsibility(
  p_claim_id         UUID,
  p_organization_id  UUID,
  p_expected_version INTEGER,
  p_party            TEXT,
  p_notes            TEXT,
  p_actor            JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_version INT;
  v_state   TEXT;
BEGIN
  SELECT version, state INTO v_version, v_state
    FROM public.warranty_claims
   WHERE id = p_claim_id AND organization_id = p_organization_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chamado não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_version <> p_expected_version THEN
    RAISE EXCEPTION 'CONCURRENCY_CONFLICT: versão % esperada, % encontrada',
      p_expected_version, v_version USING ERRCODE = 'P0003';
  END IF;
  IF v_state = 'ENCERRADO' THEN
    RAISE EXCEPTION 'Chamado encerrado.' USING ERRCODE = 'P0004';
  END IF;
  -- O CHECK da coluna já recusa valor fora da lista; a frase é para a tela.
  IF p_party IS NOT NULL AND p_party NOT IN
     ('construtora', 'fornecedor', 'proprietario', 'uso_inadequado', 'indeterminado') THEN
    RAISE EXCEPTION 'Responsável inválido: %.', p_party USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.warranty_claims SET
    responsible_party = p_party,
    responsible_notes = p_notes,
    version           = v_version + 1
  WHERE id = p_claim_id AND organization_id = p_organization_id;

  INSERT INTO public.warranty_claim_events (
    organization_id, claim_id, event_type, payload, aggregate_version
  ) VALUES (
    p_organization_id, p_claim_id, 'ResponsibilityAssigned',
    jsonb_build_object('party', p_party, 'notes', p_notes, 'actor', p_actor),
    v_version + 1
  );

  RETURN jsonb_build_object('id', p_claim_id, 'version', v_version + 1);
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- PARTE 3 — reescritas com guarda de estado (assinaturas iguais → REPLACE)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.triage_warranty_claim(
  p_claim_id uuid, p_organization_id uuid, p_expected_version integer,
  p_in_warranty boolean, p_warranty_expires_at date, p_sla_deadline date,
  p_fora_garantia_motivo text, p_triaged_by jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_version INT;
  v_state           TEXT;
  v_in_warranty     BOOLEAN;
  v_new_state       TEXT;
BEGIN
  SELECT version, state, in_warranty INTO v_current_version, v_state, v_in_warranty
    FROM public.warranty_claims
   WHERE id = p_claim_id AND organization_id = p_organization_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chamado não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'CONCURRENCY_CONFLICT: versão % esperada, % encontrada',
      p_expected_version, v_current_version USING ERRCODE = 'P0003';
  END IF;
  -- origem: ESTADOS_TRIAGEM
  IF v_state NOT IN ('ABERTO', 'TRIAGEM', 'REABERTO', 'VISITA_AGENDADA')
     OR (v_state = 'VISITA_AGENDADA' AND v_in_warranty IS NOT NULL) THEN
    RAISE EXCEPTION 'A triagem já foi feita para este chamado.' USING ERRCODE = 'P0004';
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
  p_claim_id uuid, p_organization_id uuid, p_expected_version integer,
  p_scheduled_at timestamp with time zone, p_technician_name text,
  p_technician_id uuid, p_actor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_version INT;
  v_state           TEXT;
  v_new_state       TEXT;
  v_visit_id        UUID;
BEGIN
  SELECT version, state INTO v_current_version, v_state
    FROM public.warranty_claims
   WHERE id = p_claim_id AND organization_id = p_organization_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chamado não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'CONCURRENCY_CONFLICT: versão % esperada, % encontrada',
      p_expected_version, v_current_version USING ERRCODE = 'P0003';
  END IF;
  -- origem: ESTADOS_AGENDAR_VISITA
  IF v_state NOT IN ('ABERTO', 'TRIAGEM', 'EM_GARANTIA', 'FORA_GARANTIA', 'VISITA_AGENDADA', 'EM_REPARO', 'CONCLUIDO', 'CONTESTADO', 'REABERTO') THEN
    RAISE EXCEPTION 'Não é possível agendar visita com o chamado em %.', v_state
      USING ERRCODE = 'P0004';
  END IF;
  IF p_scheduled_at IS NULL THEN
    RAISE EXCEPTION 'Informe a data da visita.' USING ERRCODE = 'P0004';
  END IF;

  -- Em reparo / concluído, a visita (vistoria, acompanhamento) não muda o estado.
  v_new_state := CASE
    -- origem: ESTADOS_QUE_VIRAM_VISITA
    WHEN v_state IN ('ABERTO', 'TRIAGEM', 'EM_GARANTIA', 'FORA_GARANTIA', 'REABERTO', 'CONTESTADO') THEN 'VISITA_AGENDADA'
    ELSE v_state
  END;

  INSERT INTO public.warranty_claim_visits (
    organization_id, claim_id, scheduled_at, technician_name, technician_id, status
  ) VALUES (
    p_organization_id, p_claim_id, p_scheduled_at, p_technician_name, p_technician_id, 'AGENDADA'
  ) RETURNING id INTO v_visit_id;

  UPDATE public.warranty_claims SET
    state   = v_new_state,
    version = v_current_version + 1
  WHERE id = p_claim_id AND organization_id = p_organization_id;

  INSERT INTO public.warranty_claim_events (
    organization_id, claim_id, event_type, payload, aggregate_version
  ) VALUES (
    p_organization_id, p_claim_id, 'VisitScheduled',
    jsonb_build_object('visit_id', v_visit_id, 'scheduled_at', p_scheduled_at,
                       'technician_name', p_technician_name, 'actor', p_actor),
    v_current_version + 1
  );

  RETURN jsonb_build_object('visit_id', v_visit_id, 'version', v_current_version + 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_warranty_claim(
  p_claim_id uuid, p_organization_id uuid, p_expected_version integer,
  p_custo_real numeric, p_nps_nota integer, p_nps_comentario text, p_closed_by jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_version INT;
  v_state           TEXT;
BEGIN
  SELECT version, state INTO v_current_version, v_state
    FROM public.warranty_claims
   WHERE id = p_claim_id AND organization_id = p_organization_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chamado não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'CONCURRENCY_CONFLICT' USING ERRCODE = 'P0003';
  END IF;
  -- origem: ESTADOS_ENCERRAR
  IF v_state NOT IN ('CONCLUIDO', 'EM_REPARO', 'FORA_GARANTIA') THEN
    RAISE EXCEPTION 'Conclua o reparo (ou marque como fora de garantia) antes de encerrar — o chamado está em %.', v_state
      USING ERRCODE = 'P0004';
  END IF;
  IF p_custo_real IS NOT NULL AND p_custo_real < 0 THEN
    RAISE EXCEPTION 'O custo real não pode ser negativo.' USING ERRCODE = 'P0004';
  END IF;
  IF p_nps_nota IS NOT NULL AND (p_nps_nota < 0 OR p_nps_nota > 10) THEN
    RAISE EXCEPTION 'A nota NPS vai de 0 a 10.' USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.warranty_claims SET
    state           = 'ENCERRADO',
    custo_real      = p_custo_real,
    nps_nota        = p_nps_nota,
    nps_comentario  = p_nps_comentario,
    closed_by       = p_closed_by,
    closed_at       = now(),
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

-- ────────────────────────────────────────────────────────────────────────────
-- PARTE 4 — REGRA #7: ninguém além de authenticated executa
-- ────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.start_warranty_repair(uuid, uuid, integer, numeric, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_warranty_repair(uuid, uuid, integer, numeric, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.complete_warranty_repair(uuid, uuid, integer, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_warranty_repair(uuid, uuid, integer, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.record_warranty_visit_result(uuid, uuid, uuid, integer, timestamptz, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_warranty_visit_result(uuid, uuid, uuid, integer, timestamptz, text, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.set_warranty_responsibility(uuid, uuid, integer, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_warranty_responsibility(uuid, uuid, integer, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.triage_warranty_claim(uuid, uuid, integer, boolean, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.triage_warranty_claim(uuid, uuid, integer, boolean, date, date, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.schedule_warranty_visit(uuid, uuid, integer, timestamptz, text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_warranty_visit(uuid, uuid, integer, timestamptz, text, uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.close_warranty_claim(uuid, uuid, integer, numeric, integer, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_warranty_claim(uuid, uuid, integer, numeric, integer, text, jsonb) TO authenticated;

-- classify e delete não mudam de corpo; só a permissão (estavam com anon=X).
REVOKE ALL ON FUNCTION public.classify_warranty_claim(uuid, uuid, integer, jsonb, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classify_warranty_claim(uuid, uuid, integer, jsonb, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_warranty_claim(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_warranty_claim(uuid, uuid) TO authenticated;

-- Mesma higiene nas auxiliares do módulo que estavam com anon=X (todas
-- SECURITY INVOKER — a RLS já barrava, mas a ACL não deve dizer o contrário).
-- As duas de gatilho não dependem de EXECUTE para disparar.
REVOKE ALL ON FUNCTION public.fn_warranty_claim_quality_score(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_warranty_claim_quality_score(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_warranty_claim_score_after() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_warranty_evidence_score_after() FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- Verificação (rodar DEPOIS, numa execução separada):
--
--   SELECT p.oid::regprocedure, p.proacl FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND proname LIKE '%warranty%';
--
-- Nenhuma linha pode ter `=X/` (PUBLIC) nem `anon=X`.
-- ────────────────────────────────────────────────────────────────────────────
