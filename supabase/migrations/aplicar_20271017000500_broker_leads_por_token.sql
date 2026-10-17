-- ============================================================
-- Portal do Corretor — Leads com dado real (funil do próprio corretor)
-- Plano: docs/planos/2026-10-17-portal-corretor-pendencias.md (F3)
-- Decisão do usuário (17/10/2026, P4): os leads são do corretor (cria, edita,
-- move de etapa, registra contatos); o gestor vê todos da organização, só leitura.
--
-- Pelo link não há sessão: tudo passa por RPC com o token, presa ao e-mail do
-- corretor do token e à organização dele — lead de outro corretor não é lido nem
-- alterado (o UPDATE filtra pelos dois e recusa se não achar).
--
-- Vocabulário = CHECKs da tabela (origem, etapa, tipo de interação); valor fora
-- dele volta como erro 23514 e o front avisa.
--
-- O gestor lê `broker_portal_leads` pela RLS (membro da organização, apertada em
-- aplicar_20271017000300). `broker_portal_lead_interactions` estava com RLS e
-- NENHUMA política (ninguém lia); ganha SELECT para membro da organização do lead.
--
-- REGRA #7: núcleo sem EXECUTE para ninguém; RPCs do token com REVOKE de PUBLIC
-- e EXECUTE só para anon + authenticated; autorização (token) DENTRO de cada uma.
-- ============================================================

SET lock_timeout = '5s';

-- ── 0. Núcleo: quem é o corretor deste token ────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_broker_portal_corretor_do_token(p_token TEXT, OUT org_id UUID, OUT email TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    SELECT t.org_id, lower(bp.email)
      INTO org_id, email
      FROM public.broker_portal_tokens t
      JOIN public.broker_profiles bp ON bp.id = t.broker_id
     WHERE t.token = p_token AND t.is_active = TRUE AND t.expires_at > NOW();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_broker_portal_corretor_do_token(TEXT) FROM PUBLIC, anon, authenticated;

-- ── 1. Listar os meus leads (com as interações) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_broker_portal_leads(p_token TEXT)
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

    RETURN jsonb_build_object('valid', TRUE, 'leads', COALESCE((
        SELECT jsonb_agg(to_jsonb(l) || jsonb_build_object('interacoes', COALESCE((
                    SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC)
                    FROM public.broker_portal_lead_interactions i WHERE i.lead_id = l.id), '[]'::jsonb))
               ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC)
        FROM public.broker_portal_leads l
        WHERE l.organization_id = v_org AND lower(l.broker_email) = v_email
    ), '[]'::jsonb));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_broker_portal_leads(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_broker_portal_leads(TEXT) TO anon, authenticated;

-- ── 2. Salvar lead (novo ou existente do próprio corretor) ──────────────────
CREATE OR REPLACE FUNCTION public.fn_broker_portal_lead_salvar(p_token TEXT, p_lead JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org UUID; v_email TEXT;
    v_id UUID := NULLIF(p_lead->>'id', '')::uuid;
    v_nome TEXT := btrim(COALESCE(p_lead->>'name', ''));
    v_row public.broker_portal_leads;
BEGIN
    SELECT c.org_id, c.email INTO v_org, v_email FROM public.fn_broker_portal_corretor_do_token(p_token) c;
    IF v_org IS NULL OR v_email IS NULL THEN RAISE EXCEPTION 'Link inválido ou expirado' USING ERRCODE = '42501'; END IF;
    IF v_nome = '' THEN RAISE EXCEPTION 'Informe o nome do lead' USING ERRCODE = '22023'; END IF;

    IF v_id IS NULL THEN
        INSERT INTO public.broker_portal_leads (organization_id, broker_email, name, email, phone, cpf, income, origin, stage, interest, notes)
        VALUES (v_org, v_email, v_nome,
                NULLIF(btrim(p_lead->>'email'), ''), NULLIF(btrim(p_lead->>'phone'), ''), NULLIF(btrim(p_lead->>'cpf'), ''),
                NULLIF(p_lead->>'income', '')::numeric,
                COALESCE(NULLIF(p_lead->>'origin', ''), 'DIRETO'), 'LEAD',
                NULLIF(btrim(p_lead->>'interest'), ''), NULLIF(btrim(p_lead->>'notes'), ''))
        RETURNING * INTO v_row;
        INSERT INTO public.broker_portal_lead_interactions (lead_id, type, description, created_by)
        VALUES (v_row.id, 'NOTE', 'Lead cadastrado', v_email);
    ELSE
        UPDATE public.broker_portal_leads
           SET name = v_nome,
               email = NULLIF(btrim(p_lead->>'email'), ''),
               phone = NULLIF(btrim(p_lead->>'phone'), ''),
               cpf = NULLIF(btrim(p_lead->>'cpf'), ''),
               income = NULLIF(p_lead->>'income', '')::numeric,
               origin = COALESCE(NULLIF(p_lead->>'origin', ''), origin),
               interest = NULLIF(btrim(p_lead->>'interest'), ''),
               notes = NULLIF(btrim(p_lead->>'notes'), ''),
               updated_at = NOW()
         WHERE id = v_id AND organization_id = v_org AND lower(broker_email) = v_email
        RETURNING * INTO v_row;
        IF NOT FOUND THEN RAISE EXCEPTION 'Lead não encontrado' USING ERRCODE = '42501'; END IF;
    END IF;

    RETURN to_jsonb(v_row);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_broker_portal_lead_salvar(TEXT, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_broker_portal_lead_salvar(TEXT, JSONB) TO anon, authenticated;

-- ── 3. Mudar a etapa (deixa rastro no histórico) ────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_broker_portal_lead_etapa(p_token TEXT, p_lead_id UUID, p_etapa TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org UUID; v_email TEXT; v_antes TEXT; v_row public.broker_portal_leads;
BEGIN
    SELECT c.org_id, c.email INTO v_org, v_email FROM public.fn_broker_portal_corretor_do_token(p_token) c;
    IF v_org IS NULL OR v_email IS NULL THEN RAISE EXCEPTION 'Link inválido ou expirado' USING ERRCODE = '42501'; END IF;

    SELECT stage INTO v_antes FROM public.broker_portal_leads
     WHERE id = p_lead_id AND organization_id = v_org AND lower(broker_email) = v_email;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lead não encontrado' USING ERRCODE = '42501'; END IF;

    UPDATE public.broker_portal_leads SET stage = p_etapa, updated_at = NOW()
     WHERE id = p_lead_id RETURNING * INTO v_row;
    IF v_antes IS DISTINCT FROM p_etapa THEN
        INSERT INTO public.broker_portal_lead_interactions (lead_id, type, description, created_by)
        VALUES (p_lead_id, 'NOTE', 'Etapa: ' || COALESCE(v_antes, '—') || ' → ' || p_etapa, v_email);
    END IF;
    RETURN to_jsonb(v_row);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_broker_portal_lead_etapa(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_broker_portal_lead_etapa(TEXT, UUID, TEXT) TO anon, authenticated;

-- ── 4. Registrar contato (ligação, visita, WhatsApp…) ───────────────────────
CREATE OR REPLACE FUNCTION public.fn_broker_portal_lead_interacao(p_token TEXT, p_lead_id UUID, p_tipo TEXT, p_descricao TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org UUID; v_email TEXT; v_row public.broker_portal_lead_interactions;
BEGIN
    SELECT c.org_id, c.email INTO v_org, v_email FROM public.fn_broker_portal_corretor_do_token(p_token) c;
    IF v_org IS NULL OR v_email IS NULL THEN RAISE EXCEPTION 'Link inválido ou expirado' USING ERRCODE = '42501'; END IF;
    IF btrim(COALESCE(p_descricao, '')) = '' THEN RAISE EXCEPTION 'Descreva o contato' USING ERRCODE = '22023'; END IF;

    PERFORM 1 FROM public.broker_portal_leads
     WHERE id = p_lead_id AND organization_id = v_org AND lower(broker_email) = v_email;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lead não encontrado' USING ERRCODE = '42501'; END IF;

    INSERT INTO public.broker_portal_lead_interactions (lead_id, type, description, created_by)
    VALUES (p_lead_id, p_tipo, btrim(p_descricao), v_email)
    RETURNING * INTO v_row;
    UPDATE public.broker_portal_leads SET updated_at = NOW() WHERE id = p_lead_id;
    RETURN to_jsonb(v_row);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_broker_portal_lead_interacao(TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_broker_portal_lead_interacao(TEXT, UUID, TEXT, TEXT) TO anon, authenticated;

-- ── 5. Gestor lê as interações dos leads da organização ─────────────────────
DROP POLICY IF EXISTS broker_lead_interactions_select ON public.broker_portal_lead_interactions;
CREATE POLICY broker_lead_interactions_select ON public.broker_portal_lead_interactions
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.broker_portal_leads l
         WHERE l.id = broker_portal_lead_interactions.lead_id
           AND (public.is_org_member(l.organization_id) OR public.is_superadmin())
    ));
