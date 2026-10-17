-- ============================================================
-- Portal do Corretor — Chat por empreendimento com dado real
-- Plano: docs/planos/2026-10-17-portal-corretor-pendencias.md (F5)
-- Decisão do usuário (17/10/2026, P2): um canal por empreendimento — a
-- incorporadora e os corretores HABILITADOS naquele empreendimento; o gestor lê
-- e responde, e fixa avisos.
--
-- "Empreendimento" aqui é o prédio do comercial (commercial_properties BUILDING),
-- que é onde mora a habilitação do corretor (broker_property_access). O canal
-- referenciava `projects` (obra); ganha `building_id` (tabela vazia — sem dado a
-- migrar) e nasce na primeira mensagem, nunca numa leitura.
--
-- Habilitação = a MESMA régua de fn_broker_portal_get_units: um
-- broker_property_access enabled para o prédio, de qualquer broker_profile com o
-- e-mail do corretor do token.
--
-- REGRA #7: núcleos sem EXECUTE para ninguém; RPCs do token só anon +
-- authenticated; RPCs do gestor só authenticated, com is_org_member DENTRO.
-- ============================================================

SET lock_timeout = '5s';

ALTER TABLE public.broker_portal_chat_channels
    ADD COLUMN IF NOT EXISTS building_id UUID REFERENCES public.commercial_properties(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS broker_portal_chat_channels_building_uq
    ON public.broker_portal_chat_channels (building_id) WHERE building_id IS NOT NULL;

-- ── 0. Núcleos ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_broker_corretor_habilitado(p_email TEXT, p_building UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.broker_property_access a
        JOIN public.broker_profiles bp ON bp.id = a.broker_id
        WHERE lower(bp.email) = lower(p_email) AND a.enabled = TRUE AND a.property_id = p_building
    );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_broker_corretor_habilitado(TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- Canal do prédio, criado se ainda não existe (só quem vai ESCREVER chama).
CREATE OR REPLACE FUNCTION public.fn_broker_chat_canal_do_predio(p_building UUID)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id UUID; v_predio public.commercial_properties;
BEGIN
    SELECT id INTO v_id FROM public.broker_portal_chat_channels WHERE building_id = p_building;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
    SELECT * INTO v_predio FROM public.commercial_properties WHERE id = p_building AND type = 'BUILDING';
    IF NOT FOUND THEN RAISE EXCEPTION 'Empreendimento não encontrado' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.broker_portal_chat_channels (organization_id, building_id, name)
    VALUES (v_predio.organization_id, p_building, v_predio.name)
    ON CONFLICT (building_id) WHERE building_id IS NOT NULL DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN SELECT id INTO v_id FROM public.broker_portal_chat_channels WHERE building_id = p_building; END IF;
    RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_broker_chat_canal_do_predio(UUID) FROM PUBLIC, anon, authenticated;

-- Mensagens de um prédio (as 200 mais recentes, em ordem cronológica).
CREATE OR REPLACE FUNCTION public.fn_broker_chat_mensagens_do_predio(p_building UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(jsonb_agg(m ORDER BY m->>'created_at'), '[]'::jsonb)
    FROM (
        SELECT jsonb_build_object('id', msg.id, 'sender_name', msg.sender_name, 'sender_email', msg.sender_email,
                                  'sender_type', msg.sender_type, 'message', msg.message,
                                  'is_pinned', COALESCE(msg.is_pinned, FALSE), 'created_at', msg.created_at) AS m
        FROM public.broker_portal_chat_messages msg
        JOIN public.broker_portal_chat_channels ch ON ch.id = msg.channel_id
        WHERE ch.building_id = p_building
        ORDER BY msg.created_at DESC
        LIMIT 200
    ) x;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_broker_chat_mensagens_do_predio(UUID) FROM PUBLIC, anon, authenticated;

-- Lista de canais (prédios) com a última mensagem.
CREATE OR REPLACE FUNCTION public.fn_broker_chat_resumo_predios(p_buildings UUID[])
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'building_id', p.id, 'nome', p.name,
               'total', (SELECT COUNT(*) FROM public.broker_portal_chat_messages m JOIN public.broker_portal_chat_channels ch ON ch.id = m.channel_id WHERE ch.building_id = p.id),
               'ultima', (SELECT jsonb_build_object('message', m.message, 'sender_type', m.sender_type, 'sender_name', m.sender_name, 'created_at', m.created_at)
                            FROM public.broker_portal_chat_messages m JOIN public.broker_portal_chat_channels ch ON ch.id = m.channel_id
                           WHERE ch.building_id = p.id ORDER BY m.created_at DESC LIMIT 1)
           ) ORDER BY p.name), '[]'::jsonb)
    FROM public.commercial_properties p
    WHERE p.id = ANY (p_buildings) AND p.type = 'BUILDING';
$$;
REVOKE EXECUTE ON FUNCTION public.fn_broker_chat_resumo_predios(UUID[]) FROM PUBLIC, anon, authenticated;

-- ── 1. Corretor pelo link ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_broker_portal_chat_canais(p_token TEXT)
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
    RETURN jsonb_build_object('valid', TRUE, 'canais', public.fn_broker_chat_resumo_predios(ARRAY(
        SELECT DISTINCT a.property_id FROM public.broker_property_access a
        JOIN public.broker_profiles bp ON bp.id = a.broker_id
        WHERE lower(bp.email) = v_email AND a.enabled = TRUE)));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_broker_portal_chat_canais(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_broker_portal_chat_canais(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_broker_portal_chat_mensagens(p_token TEXT, p_building UUID)
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
    IF NOT public.fn_broker_corretor_habilitado(v_email, p_building) THEN
        RAISE EXCEPTION 'Você não está habilitado neste empreendimento' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object('valid', TRUE, 'mensagens', public.fn_broker_chat_mensagens_do_predio(p_building), 'eu', v_email);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_broker_portal_chat_mensagens(TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_broker_portal_chat_mensagens(TEXT, UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_broker_portal_chat_enviar(p_token TEXT, p_building UUID, p_texto TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org UUID; v_email TEXT; v_nome TEXT; v_canal UUID; v_txt TEXT := btrim(COALESCE(p_texto, '')); v_row public.broker_portal_chat_messages;
BEGIN
    SELECT c.org_id, c.email INTO v_org, v_email FROM public.fn_broker_portal_corretor_do_token(p_token) c;
    IF v_org IS NULL OR v_email IS NULL THEN RAISE EXCEPTION 'Link inválido ou expirado' USING ERRCODE = '42501'; END IF;
    IF NOT public.fn_broker_corretor_habilitado(v_email, p_building) THEN
        RAISE EXCEPTION 'Você não está habilitado neste empreendimento' USING ERRCODE = '42501';
    END IF;
    IF v_txt = '' THEN RAISE EXCEPTION 'Escreva a mensagem' USING ERRCODE = '22023'; END IF;
    IF length(v_txt) > 2000 THEN RAISE EXCEPTION 'Mensagem longa demais (máximo 2.000 caracteres)' USING ERRCODE = '22023'; END IF;

    SELECT bp.name INTO v_nome FROM public.broker_portal_tokens t JOIN public.broker_profiles bp ON bp.id = t.broker_id WHERE t.token = p_token;
    v_canal := public.fn_broker_chat_canal_do_predio(p_building);
    INSERT INTO public.broker_portal_chat_messages (channel_id, sender_email, sender_name, sender_type, message)
    VALUES (v_canal, v_email, COALESCE(v_nome, v_email), 'CORRETOR', v_txt)
    RETURNING * INTO v_row;
    RETURN to_jsonb(v_row);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_broker_portal_chat_enviar(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_broker_portal_chat_enviar(TEXT, UUID, TEXT) TO anon, authenticated;

-- ── 2. Gestor (membro da organização dona do prédio) ────────────────────────
CREATE OR REPLACE FUNCTION public.fn_broker_chat_gestor_canais(p_org UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT (public.is_org_member(p_org) OR public.is_superadmin()) THEN
        RAISE EXCEPTION 'Sem acesso à organização' USING ERRCODE = '42501';
    END IF;
    RETURN public.fn_broker_chat_resumo_predios(ARRAY(
        SELECT id FROM public.commercial_properties WHERE organization_id = p_org AND type = 'BUILDING'));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_broker_chat_gestor_canais(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_broker_chat_gestor_canais(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_broker_chat_gestor_mensagens(p_building UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org UUID;
BEGIN
    SELECT organization_id INTO v_org FROM public.commercial_properties WHERE id = p_building AND type = 'BUILDING';
    IF v_org IS NULL OR NOT (public.is_org_member(v_org) OR public.is_superadmin()) THEN
        RAISE EXCEPTION 'Sem acesso a este empreendimento' USING ERRCODE = '42501';
    END IF;
    RETURN public.fn_broker_chat_mensagens_do_predio(p_building);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_broker_chat_gestor_mensagens(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_broker_chat_gestor_mensagens(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_broker_chat_gestor_enviar(p_building UUID, p_texto TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org UUID; v_org_nome TEXT; v_email TEXT := lower(auth.jwt() ->> 'email'); v_canal UUID;
        v_txt TEXT := btrim(COALESCE(p_texto, '')); v_row public.broker_portal_chat_messages;
BEGIN
    SELECT p.organization_id, o.name INTO v_org, v_org_nome
      FROM public.commercial_properties p LEFT JOIN public.organizations o ON o.id = p.organization_id
     WHERE p.id = p_building AND p.type = 'BUILDING';
    IF v_org IS NULL OR NOT (public.is_org_member(v_org) OR public.is_superadmin()) THEN
        RAISE EXCEPTION 'Sem acesso a este empreendimento' USING ERRCODE = '42501';
    END IF;
    IF v_txt = '' THEN RAISE EXCEPTION 'Escreva a mensagem' USING ERRCODE = '22023'; END IF;
    IF length(v_txt) > 2000 THEN RAISE EXCEPTION 'Mensagem longa demais (máximo 2.000 caracteres)' USING ERRCODE = '22023'; END IF;

    v_canal := public.fn_broker_chat_canal_do_predio(p_building);
    INSERT INTO public.broker_portal_chat_messages (channel_id, sender_email, sender_name, sender_type, message)
    VALUES (v_canal, v_email, COALESCE(v_org_nome, 'Incorporadora'), 'INCORPORADORA', v_txt)
    RETURNING * INTO v_row;
    RETURN to_jsonb(v_row);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_broker_chat_gestor_enviar(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_broker_chat_gestor_enviar(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_broker_chat_gestor_fixar(p_mensagem UUID, p_fixar BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org UUID;
BEGIN
    SELECT ch.organization_id INTO v_org
      FROM public.broker_portal_chat_messages m JOIN public.broker_portal_chat_channels ch ON ch.id = m.channel_id
     WHERE m.id = p_mensagem;
    IF v_org IS NULL OR NOT (public.is_org_member(v_org) OR public.is_superadmin()) THEN
        RAISE EXCEPTION 'Sem acesso a esta mensagem' USING ERRCODE = '42501';
    END IF;
    UPDATE public.broker_portal_chat_messages SET is_pinned = COALESCE(p_fixar, FALSE) WHERE id = p_mensagem;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_broker_chat_gestor_fixar(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_broker_chat_gestor_fixar(UUID, BOOLEAN) TO authenticated;
