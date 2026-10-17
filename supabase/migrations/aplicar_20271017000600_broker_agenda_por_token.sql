-- ============================================================
-- Portal do Corretor — Agenda com dado real (eventos do gestor + inscrição)
-- Plano: docs/planos/2026-10-17-portal-corretor-pendencias.md (F4)
-- Decisão do usuário (17/10/2026, P4): o gestor cria os eventos (plantão, visita
-- à obra, lançamento…); o corretor vê e se inscreve ou cancela.
--
-- Gestor: grava em broker_portal_events direto (RLS existente: membro da
-- organização). broker_portal_event_registrations estava com RLS e NENHUMA
-- política — o gestor ganha SELECT nas inscrições dos eventos da organização.
--
-- Corretor (link): RPCs presas ao token. "Lotado" é CALCULADO (inscrições
-- confirmadas/presentes ≥ max_capacity), não um status gravado que alguém
-- precisaria lembrar de atualizar. Inscrever trava a linha do evento
-- (FOR UPDATE) para duas inscrições simultâneas não passarem da lotação.
--
-- REGRA #7: REVOKE de PUBLIC; EXECUTE só anon + authenticated; autorização
-- (token) DENTRO. Núcleo `fn_broker_portal_corretor_do_token` vem de
-- aplicar_20271017000500.
-- ============================================================

SET lock_timeout = '5s';

-- ── 0. Resumo de um evento para o corretor ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_broker_evento_resumo(p_evento public.broker_portal_events, p_email TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT to_jsonb(p_evento) || jsonb_build_object(
        'inscritos', (SELECT COUNT(*) FROM public.broker_portal_event_registrations r
                       WHERE r.event_id = p_evento.id AND r.status IN ('CONFIRMADA', 'PRESENTE')),
        'minha_inscricao', (SELECT r.status FROM public.broker_portal_event_registrations r
                             WHERE r.event_id = p_evento.id AND lower(r.broker_email) = p_email)
    );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_broker_evento_resumo(public.broker_portal_events, TEXT) FROM PUBLIC, anon, authenticated;

-- ── 1. Eventos da organização (próximos e dos últimos 60 dias) ──────────────
CREATE OR REPLACE FUNCTION public.fn_broker_portal_eventos(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org UUID; v_email TEXT;
BEGIN
    SELECT c.org_id, c.email INTO v_org, v_email FROM public.fn_broker_portal_corretor_do_token(p_token) c;
    IF v_org IS NULL OR v_email IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object('valid', TRUE, 'eventos', COALESCE((
        SELECT jsonb_agg(public.fn_broker_evento_resumo(e, v_email) ORDER BY e.date)
        FROM public.broker_portal_events e
        WHERE e.organization_id = v_org
          AND COALESCE(e.end_date, e.date) >= NOW() - INTERVAL '60 days'
    ), '[]'::jsonb));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_broker_portal_eventos(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_broker_portal_eventos(TEXT) TO anon, authenticated;

-- ── 2. Inscrever (respeita status, data e lotação) ──────────────────────────
CREATE OR REPLACE FUNCTION public.fn_broker_portal_evento_inscrever(p_token TEXT, p_evento_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org UUID; v_email TEXT; v_ev public.broker_portal_events; v_inscritos INT;
BEGIN
    SELECT c.org_id, c.email INTO v_org, v_email FROM public.fn_broker_portal_corretor_do_token(p_token) c;
    IF v_org IS NULL OR v_email IS NULL THEN RAISE EXCEPTION 'Link inválido ou expirado' USING ERRCODE = '42501'; END IF;

    SELECT * INTO v_ev FROM public.broker_portal_events
     WHERE id = p_evento_id AND organization_id = v_org
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Evento não encontrado' USING ERRCODE = '42501'; END IF;
    IF v_ev.status IN ('CANCELADO', 'ENCERRADO') THEN RAISE EXCEPTION 'Este evento não aceita inscrições' USING ERRCODE = '22023'; END IF;
    IF COALESCE(v_ev.end_date, v_ev.date) < NOW() THEN RAISE EXCEPTION 'Este evento já aconteceu' USING ERRCODE = '22023'; END IF;

    IF v_ev.max_capacity IS NOT NULL THEN
        SELECT COUNT(*) INTO v_inscritos FROM public.broker_portal_event_registrations
         WHERE event_id = p_evento_id AND status IN ('CONFIRMADA', 'PRESENTE') AND lower(broker_email) <> v_email;
        IF v_inscritos >= v_ev.max_capacity THEN RAISE EXCEPTION 'Evento lotado' USING ERRCODE = '22023'; END IF;
    END IF;

    INSERT INTO public.broker_portal_event_registrations (event_id, broker_email, status)
    VALUES (p_evento_id, v_email, 'CONFIRMADA')
    ON CONFLICT (event_id, broker_email) DO UPDATE SET status = 'CONFIRMADA';

    RETURN public.fn_broker_evento_resumo(v_ev, v_email);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_broker_portal_evento_inscrever(TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_broker_portal_evento_inscrever(TEXT, UUID) TO anon, authenticated;

-- ── 3. Cancelar a própria inscrição ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_broker_portal_evento_cancelar(p_token TEXT, p_evento_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org UUID; v_email TEXT; v_ev public.broker_portal_events;
BEGIN
    SELECT c.org_id, c.email INTO v_org, v_email FROM public.fn_broker_portal_corretor_do_token(p_token) c;
    IF v_org IS NULL OR v_email IS NULL THEN RAISE EXCEPTION 'Link inválido ou expirado' USING ERRCODE = '42501'; END IF;

    SELECT * INTO v_ev FROM public.broker_portal_events WHERE id = p_evento_id AND organization_id = v_org;
    IF NOT FOUND THEN RAISE EXCEPTION 'Evento não encontrado' USING ERRCODE = '42501'; END IF;

    UPDATE public.broker_portal_event_registrations SET status = 'CANCELADA'
     WHERE event_id = p_evento_id AND lower(broker_email) = v_email AND status = 'CONFIRMADA';

    RETURN public.fn_broker_evento_resumo(v_ev, v_email);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_broker_portal_evento_cancelar(TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_broker_portal_evento_cancelar(TEXT, UUID) TO anon, authenticated;

-- ── 4. Gestor lê as inscrições dos eventos da organização ───────────────────
DROP POLICY IF EXISTS broker_event_registrations_select ON public.broker_portal_event_registrations;
CREATE POLICY broker_event_registrations_select ON public.broker_portal_event_registrations
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.broker_portal_events e
         WHERE e.id = broker_portal_event_registrations.event_id
           AND (public.is_org_member(e.organization_id) OR public.is_superadmin())
    ));
