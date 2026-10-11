-- ============================================================================
-- Pós-Obra & Garantia: pendências decididas pelo usuário (Fase 4)
-- OrçaCloud SaaS · aplicar_20271011000700
-- Plano: docs/planos/2026-10-11-pos-obra-garantia-conexao-suprimentos.md (Fase 4)
--
--   PARTE 1 — cancel_warranty_visit / reschedule_warranty_visit
--   PARTE 2 — reopen_warranty_claim; close_warranty_claim aceita REABERTO
--   PARTE 3 — desvincular SC/contrato do chamado registra `ProcurementUnlinked`
--   PARTE 4 — "Fora de garantia" deixa de ser terminal no cron de SLA, e o cron
--             (SECURITY DEFINER) deixa de ser executável por `authenticated`
--             — só o pg_cron (postgres) o chama
--
-- Listas de estados: as de utils/warrantyLifecycle.ts, após `-- origem: <CONSTANTE>`
-- (o teste __tests__/warrantyLifecycleSql.test.ts compara com a ÚLTIMA migration
-- que define cada constante).
--
-- Aplicar com:  npx supabase db query --linked -f <este arquivo>
-- NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ────────────────────────────────────────────────────────────────────────────
-- PARTE 1 — visitas
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reschedule_warranty_visit(
  p_visit_id         UUID,
  p_claim_id         UUID,
  p_organization_id  UUID,
  p_expected_version INTEGER,
  p_scheduled_at     TIMESTAMPTZ,
  p_technician_name  TEXT,
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
  IF p_scheduled_at IS NULL THEN
    RAISE EXCEPTION 'Informe a nova data da visita.' USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.warranty_claim_visits SET
    status          = 'REAGENDADA',
    scheduled_at    = p_scheduled_at,
    technician_name = COALESCE(NULLIF(trim(p_technician_name), ''), technician_name)
  WHERE id = p_visit_id
    AND claim_id = p_claim_id
    AND organization_id = p_organization_id
    AND status IN ('AGENDADA', 'REAGENDADA');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Só é possível reagendar uma visita ainda pendente.' USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.warranty_claims SET version = v_version + 1
  WHERE id = p_claim_id AND organization_id = p_organization_id;

  INSERT INTO public.warranty_claim_events (
    organization_id, claim_id, event_type, payload, aggregate_version
  ) VALUES (
    p_organization_id, p_claim_id, 'VisitRescheduled',
    jsonb_build_object('visit_id', p_visit_id, 'scheduled_at', p_scheduled_at,
                       'technician_name', p_technician_name, 'actor', p_actor),
    v_version + 1
  );

  RETURN jsonb_build_object('id', p_claim_id, 'version', v_version + 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_warranty_visit(
  p_visit_id         UUID,
  p_claim_id         UUID,
  p_organization_id  UUID,
  p_expected_version INTEGER,
  p_reason           TEXT,
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
  v_new_state   TEXT;
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
  IF v_state = 'ENCERRADO' THEN
    RAISE EXCEPTION 'Chamado encerrado.' USING ERRCODE = 'P0004';
  END IF;
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento da visita.' USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.warranty_claim_visits SET status = 'CANCELADA'
  WHERE id = p_visit_id
    AND claim_id = p_claim_id
    AND organization_id = p_organization_id
    AND status IN ('AGENDADA', 'REAGENDADA');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Só é possível cancelar uma visita ainda pendente.' USING ERRCODE = 'P0004';
  END IF;

  -- Mesma regra de utils/warrantyLifecycle.ts → estadoAposCancelarVisita: se o
  -- chamado só estava "Visita agendada" por causa desta, volta ao que era.
  v_new_state := v_state;
  IF v_state = 'VISITA_AGENDADA' AND NOT EXISTS (
    SELECT 1 FROM public.warranty_claim_visits
     WHERE claim_id = p_claim_id AND organization_id = p_organization_id
       AND status IN ('AGENDADA', 'REAGENDADA')
  ) THEN
    v_new_state := CASE
      WHEN v_in_warranty IS TRUE  THEN 'EM_GARANTIA'
      WHEN v_in_warranty IS FALSE THEN 'FORA_GARANTIA'
      ELSE 'ABERTO'
    END;
  END IF;

  UPDATE public.warranty_claims SET
    state   = v_new_state,
    version = v_version + 1
  WHERE id = p_claim_id AND organization_id = p_organization_id;

  INSERT INTO public.warranty_claim_events (
    organization_id, claim_id, event_type, payload, aggregate_version
  ) VALUES (
    p_organization_id, p_claim_id, 'VisitCancelled',
    jsonb_build_object('visit_id', p_visit_id, 'reason', p_reason, 'state', v_new_state, 'actor', p_actor),
    v_version + 1
  );

  RETURN jsonb_build_object('id', p_claim_id, 'version', v_version + 1, 'new_state', v_new_state);
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- PARTE 2 — reabrir; encerrar aceita REABERTO
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reopen_warranty_claim(
  p_claim_id         UUID,
  p_organization_id  UUID,
  p_expected_version INTEGER,
  p_reason           TEXT,
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
  -- origem: ESTADOS_REABRIR
  IF v_state NOT IN ('CONCLUIDO', 'ENCERRADO') THEN
    RAISE EXCEPTION 'Só é possível reabrir um chamado concluído ou encerrado (este está em %).', v_state
      USING ERRCODE = 'P0004';
  END IF;
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Informe por que o chamado está sendo reaberto.' USING ERRCODE = 'P0004';
  END IF;

  -- custo_real e NPS ficam (são do atendimento anterior); closed_at volta a
  -- nulo — o chamado não está mais encerrado, e o KPI de custo conta por ele.
  UPDATE public.warranty_claims SET
    state     = 'REABERTO',
    closed_at = NULL,
    version   = v_version + 1
  WHERE id = p_claim_id AND organization_id = p_organization_id;

  INSERT INTO public.warranty_claim_events (
    organization_id, claim_id, event_type, payload, aggregate_version
  ) VALUES (
    p_organization_id, p_claim_id, 'ClaimReopened',
    jsonb_build_object('from', v_state, 'reason', p_reason, 'actor', p_actor),
    v_version + 1
  );

  RETURN jsonb_build_object('id', p_claim_id, 'version', v_version + 1);
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
  IF v_state NOT IN ('CONCLUIDO', 'EM_REPARO', 'FORA_GARANTIA', 'REABERTO') THEN
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
-- PARTE 3 — vínculo com Suprimentos: registra também o DESVÍNCULO
-- (reescrita de aplicar_20271011000600 — mesma assinatura de gatilho)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_log_warranty_procurement_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_version INT;
  v_tipo    TEXT := CASE TG_TABLE_NAME WHEN 'contracts' THEN 'contrato' ELSE 'solicitacao' END;
  v_actor   JSONB := jsonb_build_object('actorId', auth.uid(), 'actorType', 'user',
                                        'name', COALESCE(auth.jwt() ->> 'email', 'sistema'));
BEGIN
  -- Saiu de um chamado (desvinculado ou trocado de chamado): registra no antigo.
  IF TG_OP = 'UPDATE' AND OLD.warranty_claim_id IS NOT NULL
     AND NEW.warranty_claim_id IS DISTINCT FROM OLD.warranty_claim_id THEN
    SELECT version INTO v_version FROM public.warranty_claims WHERE id = OLD.warranty_claim_id;
    IF FOUND THEN
      INSERT INTO public.warranty_claim_events (
        organization_id, claim_id, event_type, payload, aggregate_version
      ) VALUES (
        OLD.organization_id, OLD.warranty_claim_id, 'ProcurementUnlinked',
        jsonb_build_object('tipo', v_tipo, 'id', NEW.id, 'number', NEW.number, 'title', NEW.title, 'actor', v_actor),
        COALESCE(v_version, 1)
      );
    END IF;
  END IF;

  -- Entrou num chamado.
  IF NEW.warranty_claim_id IS NOT NULL AND (
       TG_OP = 'INSERT' OR NEW.warranty_claim_id IS DISTINCT FROM OLD.warranty_claim_id
  ) THEN
    SELECT version INTO v_version FROM public.warranty_claims WHERE id = NEW.warranty_claim_id;
    INSERT INTO public.warranty_claim_events (
      organization_id, claim_id, event_type, payload, aggregate_version
    ) VALUES (
      NEW.organization_id, NEW.warranty_claim_id, 'ProcurementLinked',
      jsonb_build_object('tipo', v_tipo, 'id', NEW.id, 'number', NEW.number, 'title', NEW.title, 'actor', v_actor),
      COALESCE(v_version, 1)
    );
  END IF;
  RETURN NULL;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- PARTE 4 — SLA: "Fora de garantia" volta à fila; cron só para o cron
-- (reescrita da definição VIVA, 2026-10-11 — só a lista de estados muda)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_warranty_sla_sweep()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inseridos INT := 0;
BEGIN
  WITH estourados AS (
    SELECT c.id, c.organization_id, c.sla_deadline, c.severity, c.version,
           c.sistema_descricao, c.state,
           (CURRENT_DATE - c.sla_deadline) AS dias_atraso
      FROM public.warranty_claims c
     WHERE c.sla_deadline IS NOT NULL
       AND c.sla_deadline < CURRENT_DATE
       -- ESTADOS_TERMINAIS de utils/warrantyAnalytics.ts (desde 2026-10-11 só ENCERRADO)
       AND c.state NOT IN ('ENCERRADO')
       AND NOT EXISTS (
         SELECT 1
           FROM public.warranty_claim_events e
          WHERE e.claim_id   = c.id
            AND e.event_type = 'SlaBreached'
            AND e.payload->>'slaDeadline' = c.sla_deadline::TEXT
       )
  ), inseridos AS (
    INSERT INTO public.warranty_claim_events (
      organization_id, claim_id, event_type, payload, aggregate_version
    )
    SELECT
      x.organization_id, x.id, 'SlaBreached',
      jsonb_build_object(
        'slaDeadline', x.sla_deadline,
        'diasAtraso',  x.dias_atraso,
        'severity',    x.severity,
        'state',       x.state,
        'sistema',     x.sistema_descricao,
        'detectadoPor', 'fn_warranty_sla_sweep'
      ),
      x.version
      FROM estourados x
    RETURNING 1
  )
  SELECT count(*) INTO v_inseridos FROM inseridos;

  RETURN jsonb_build_object(
    'slaBreached', v_inseridos,
    'executadoEm', now()
  );
END;
$$;

-- REGRA #7, pergunta 2 — o sweep é SECURITY DEFINER e varre TODAS as
-- organizações; quem o chama é só o pg_cron (como postgres). `authenticated`
-- podia dispará-lo e gravar eventos em chamados de outros tenants.
REVOKE ALL ON FUNCTION public.fn_warranty_sla_sweep() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.reschedule_warranty_visit(uuid, uuid, uuid, integer, timestamptz, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_warranty_visit(uuid, uuid, uuid, integer, timestamptz, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_warranty_visit(uuid, uuid, uuid, integer, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_warranty_visit(uuid, uuid, uuid, integer, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.reopen_warranty_claim(uuid, uuid, integer, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_warranty_claim(uuid, uuid, integer, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.close_warranty_claim(uuid, uuid, integer, numeric, integer, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_warranty_claim(uuid, uuid, integer, numeric, integer, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_log_warranty_procurement_link() FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- Verificação (rodar DEPOIS, numa execução separada):
--   SELECT p.proname, p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND proname LIKE '%warranty%';
-- `fn_warranty_sla_sweep` só com postgres/service_role; as demais sem PUBLIC/anon.
-- ────────────────────────────────────────────────────────────────────────────
