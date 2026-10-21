-- ============================================================================
-- Portal do Síndico com o condomínio em organização própria (21/10/2026)
--
-- Plano: docs/planos/2026-10-21-sindico-operador-org-condominio.md (F1.3)
-- Corpos copiados do BANCO (pg_get_functiondef, 21/10/2026), com uma troca só
-- em cada um: onde se usava a org do EMPREENDIMENTO para gravar ou autorizar,
-- passa a valer também/em vez dela a org que OPERA o condomínio
-- (`condominio_org_id`, migration aplicar_20271021500000):
--  - fn_sindico_resolver (prévia do admin, modo 'ler'): membro de qualquer das duas;
--  - sindico_portal_estado: membro de qualquer das duas lê; gestor de qualquer das duas gere;
--  - sindico_portal_gerar_token: gestor de qualquer das duas; token nasce na org do condomínio;
--  - sindico_portal_token_para_mim: token nasce na org do condomínio;
--  - sindico_portal_publicar_aviso: o aviso nasce na org do condomínio.
-- REGRA #7: assinaturas iguais; REVOKE/GRANT repetidos explicitamente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_sindico_resolver(p_token text, p_client_id uuid, p_modo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_email   text := lower(coalesce(auth.jwt() ->> 'email', ''));
    v_tok     public.sindico_portal_tokens;
    v_cli     public.clients;
    v_ehDono  boolean;
BEGIN
    IF p_modo NOT IN ('ler', 'escrever', 'sessao') THEN
        RAISE EXCEPTION 'modo_invalido' USING ERRCODE = '22023';
    END IF;

    IF p_token IS NOT NULL AND p_token <> '' THEN
        SELECT * INTO v_tok FROM public.sindico_portal_tokens
         WHERE token = p_token AND is_active AND expires_at > now();
        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'Link inválido ou expirado.');
        END IF;
        SELECT * INTO v_cli FROM public.clients WHERE id = v_tok.client_id;
    ELSIF p_client_id IS NOT NULL THEN
        IF auth.uid() IS NULL THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'Não autenticado.');
        END IF;
        SELECT * INTO v_cli FROM public.clients WHERE id = p_client_id;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'Cadastro não encontrado.');
        END IF;
    ELSE
        RETURN jsonb_build_object('ok', false, 'motivo', 'Acesso não informado.');
    END IF;

    v_ehDono := v_email <> '' AND v_cli.email IS NOT NULL AND lower(v_cli.email) = v_email;

    IF p_modo = 'sessao' AND NOT v_ehDono THEN
        RETURN jsonb_build_object('ok', false, 'motivo',
            'Para aprovar ou devolver, entre no Portal do Síndico com seu e-mail e senha.');
    END IF;

    -- Sem token: só o próprio síndico (e-mail do JWT) ou, para LER, um membro
    -- da organização de um dos prédios dele (a prévia do admin).
    IF p_token IS NULL OR p_token = '' THEN
        IF NOT v_ehDono AND NOT (
            p_modo = 'ler' AND EXISTS (
                SELECT 1 FROM public.empreendimentos e
                 WHERE e.id IN (SELECT public.fn_sindico_predios(v_cli.id))
                   AND (public.is_org_member(e.organization_id)
                        OR (e.condominio_org_id IS NOT NULL AND public.is_org_member(e.condominio_org_id))))
        ) THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'Sem permissão para ver este cadastro.');
        END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.fn_sindico_predios(v_cli.id)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo',
            'Seu mandato de síndico não está vigente em nenhum condomínio. Fale com a administradora.');
    END IF;

    IF v_tok.id IS NOT NULL THEN
        UPDATE public.sindico_portal_tokens SET last_used_at = now() WHERE id = v_tok.id;
    END IF;

    RETURN jsonb_build_object('ok', true, 'client_id', v_cli.id, 'nome', v_cli.name);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sindico_portal_estado(p_empreendimento_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_e     public.empreendimentos;
    v_cli   public.clients;
    v_tok   public.sindico_portal_tokens;
    v_gestor boolean;
BEGIN
    SELECT * INTO v_e FROM public.empreendimentos WHERE id = p_empreendimento_id;
    IF NOT FOUND OR NOT (public.is_org_member(v_e.organization_id)
                         OR (v_e.condominio_org_id IS NOT NULL AND public.is_org_member(v_e.condominio_org_id))) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Condomínio não encontrado.');
    END IF;
    v_gestor := public.is_org_manager(v_e.organization_id)
                OR (v_e.condominio_org_id IS NOT NULL AND public.is_org_manager(v_e.condominio_org_id));

    IF v_e.sindico_client_id IS NULL THEN
        RETURN jsonb_build_object('ok', true, 'sindico', NULL, 'podeGerir', v_gestor);
    END IF;

    SELECT * INTO v_cli FROM public.clients WHERE id = v_e.sindico_client_id;
    SELECT * INTO v_tok FROM public.sindico_portal_tokens WHERE client_id = v_e.sindico_client_id;

    RETURN jsonb_build_object(
        'ok', true,
        'podeGerir', v_gestor,
        'sindico', jsonb_build_object(
            'clientId', v_cli.id, 'nome', v_cli.name, 'email', v_cli.email, 'telefone', v_cli.phone,
            'mandatoInicio', v_e.sindico_mandato_inicio, 'mandatoFim', v_e.sindico_mandato_fim,
            'vigente', p_empreendimento_id IN (SELECT public.fn_sindico_predios(v_e.sindico_client_id))),
        'acesso', CASE WHEN v_tok.id IS NULL THEN NULL ELSE jsonb_build_object(
            'ativo', v_tok.is_active,
            'expiraEm', v_tok.expires_at,
            'ultimoUso', v_tok.last_used_at,
            'convidadoEm', v_tok.convidado_em,
            'token', CASE WHEN v_gestor THEN v_tok.token END) END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sindico_portal_gerar_token(p_empreendimento_id uuid, p_renovar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_e   public.empreendimentos;
    v_tok public.sindico_portal_tokens;
BEGIN
    SELECT * INTO v_e FROM public.empreendimentos WHERE id = p_empreendimento_id;
    IF NOT FOUND OR NOT (public.is_org_manager(v_e.organization_id)
                         OR (v_e.condominio_org_id IS NOT NULL AND public.is_org_manager(v_e.condominio_org_id))) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Só gestor da organização gera o acesso do síndico.');
    END IF;
    IF v_e.sindico_client_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Defina o síndico na Ficha do condomínio.');
    END IF;
    IF NOT (p_empreendimento_id IN (SELECT public.fn_sindico_predios(v_e.sindico_client_id))) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'O mandato do síndico não está vigente (confira as datas na Ficha).');
    END IF;

    SELECT * INTO v_tok FROM public.sindico_portal_tokens WHERE client_id = v_e.sindico_client_id;

    IF v_tok.id IS NOT NULL AND v_tok.is_active AND v_tok.expires_at > now() AND NOT p_renovar THEN
        RETURN jsonb_build_object('ok', true, 'token', v_tok.token, 'expiraEm', v_tok.expires_at);
    END IF;

    INSERT INTO public.sindico_portal_tokens (org_id, client_id, token)
    VALUES (coalesce(v_e.condominio_org_id, v_e.organization_id), v_e.sindico_client_id, gen_random_uuid()::text)
    ON CONFLICT (client_id) DO UPDATE
       SET token = EXCLUDED.token, is_active = true,
           expires_at = now() + interval '90 days', last_used_at = NULL
    RETURNING * INTO v_tok;

    RETURN jsonb_build_object('ok', true, 'token', v_tok.token, 'expiraEm', v_tok.expires_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sindico_portal_token_para_mim()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_email  text := lower(coalesce(auth.jwt() ->> 'email', ''));
    v_id     uuid;
    v_nome   text;
    v_token  text;
    v_ativo  boolean;
    v_expira timestamptz;
    v_tem    boolean;
    v_org    uuid;
BEGIN
    IF v_email = '' THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT c.id, c.name, t.token, t.is_active, t.expires_at,
           EXISTS (SELECT 1 FROM public.fn_sindico_predios(c.id))
      INTO v_id, v_nome, v_token, v_ativo, v_expira, v_tem
      FROM public.clients c
      LEFT JOIN public.sindico_portal_tokens t ON t.client_id = c.id
     WHERE lower(c.email) = v_email
     ORDER BY EXISTS (SELECT 1 FROM public.fn_sindico_predios(c.id)) DESC,
              (t.is_active IS TRUE) DESC, c.created_at DESC NULLS LAST
     LIMIT 1;

    IF v_id IS NULL THEN
        RETURN jsonb_build_object('situacao', 'nao_cadastrado');
    END IF;
    IF NOT v_tem THEN
        RETURN jsonb_build_object('situacao', 'sem_mandato', 'nome', v_nome);
    END IF;
    IF v_token IS NOT NULL AND v_ativo IS FALSE THEN
        RETURN jsonb_build_object('situacao', 'revogado', 'nome', v_nome);
    END IF;

    IF v_token IS NOT NULL AND v_expira < now() THEN
        v_token := gen_random_uuid()::text;
        UPDATE public.sindico_portal_tokens
           SET token = v_token, expires_at = now() + interval '90 days', last_used_at = NULL
         WHERE client_id = v_id;
    END IF;

    IF v_token IS NULL THEN
        SELECT coalesce(e.condominio_org_id, e.organization_id) INTO v_org
          FROM public.empreendimentos e
         WHERE e.id IN (SELECT public.fn_sindico_predios(v_id))
         ORDER BY e.name LIMIT 1;
        v_token := gen_random_uuid()::text;
        INSERT INTO public.sindico_portal_tokens (org_id, client_id, token) VALUES (v_org, v_id, v_token);
    END IF;

    RETURN jsonb_build_object('situacao', 'ok', 'token', v_token, 'nome', v_nome);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sindico_portal_publicar_aviso(p_token text, p_client_id uuid, p_empreendimento_id uuid, p_titulo text, p_corpo text, p_categoria text, p_valido_ate date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_r   jsonb;
    v_cli uuid;
    v_org uuid;
    v_id  uuid;
BEGIN
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'escrever');
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli := (v_r ->> 'client_id')::uuid;

    IF NOT (p_empreendimento_id IN (SELECT public.fn_sindico_predios(v_cli))) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Você não é síndico deste condomínio.');
    END IF;
    IF coalesce(btrim(p_titulo), '') = '' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Informe o título do aviso.');
    END IF;
    IF p_categoria NOT IN ('AVISO', 'URGENTE', 'MANUTENCAO', 'ASSEMBLEIA', 'OBRA') THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Categoria inválida.');
    END IF;
    IF p_valido_ate IS NOT NULL AND p_valido_ate < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'A validade não pode ser anterior a hoje.');
    END IF;

    SELECT coalesce(condominio_org_id, organization_id) INTO v_org FROM public.empreendimentos WHERE id = p_empreendimento_id;

    INSERT INTO public.condominio_avisos
        (empreendimento_id, organization_id, titulo, corpo, categoria, valido_ate,
         publicado_em, publicado_por, publicado_por_sindico_client_id)
    VALUES
        (p_empreendimento_id, v_org, btrim(p_titulo), nullif(btrim(coalesce(p_corpo, '')), ''), p_categoria, p_valido_ate,
         now(), 'Síndico — ' || coalesce(v_r ->> 'nome', ''), v_cli)
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_sindico_resolver(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_estado(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_estado(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_gerar_token(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_gerar_token(uuid, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_token_para_mim() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_token_para_mim() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_publicar_aviso(text, uuid, uuid, text, text, text, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_publicar_aviso(text, uuid, uuid, text, text, text, date) TO anon, authenticated;
