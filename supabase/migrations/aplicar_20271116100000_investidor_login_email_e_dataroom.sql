-- ==========================================================================
-- Investidor: login por e-mail na casca do link · Data Room pelo link · limpeza
-- ==========================================================================
-- Plano: docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md, Fase 7 (16/11/2026).
--
-- 1. portal_token_para_mim aceita 'investidor' (o Investidor era o único portal com login por
--    e-mail que lia tabela direta — a RLS só libera membro da organização, então quem é DE FORA
--    não via oportunidade nenhuma). Mesmo contrato dos outros portais: cadastro pelo e-mail do JWT;
--    token revogado → 'revogado'; vencido → renova; sem token → cria na organização do cadastro.
-- 2. fn_investor_portal_get_dataroom(token, oportunidade): os documentos do Data Room de uma
--    oportunidade PUBLICADA da organização do link. O portal lia `opportunity_documents` direto
--    (policy só de membro) → vazio em silêncio. A assinatura do arquivo (bucket privado) é da Edge
--    Function investor-portal-dataroom-download, que chama ESTA RPC com a credencial do chamador.
-- 3. DROP fn_investor_portal_get_study: compatibilidade com o app anterior ao #483, que já saiu do
--    ar; hoje só delegava para fn_investor_portal_get_versao.
--
-- REGRA #7
--   P1: nenhuma policy criada nem alterada.
--   P2: portal_token_para_mim segue SECURITY DEFINER pela pessoa do JWT (GRANT só a authenticated,
--      como antes). fn_investor_portal_get_dataroom é SECURITY DEFINER com o token validado
--      dentro (organização do token = da oportunidade; só publicada), REVOKE PUBLIC + GRANT
--      anon/authenticated (leitura do portal por link). Devolve só metadados — o arquivo continua
--      privado; a Edge Function assina apenas o que esta RPC listou.
--
-- Reverter: aplicar de novo portal_token_para_mim de aplicar_20271016000100_portais_login_por_email.sql;
--   DROP FUNCTION public.fn_investor_portal_get_dataroom(text, uuid);
--   recriar fn_investor_portal_get_study de aplicar_20271115970000_investidor_versao_por_oportunidade.sql.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.portal_token_para_mim(p_portal text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_email      text := lower(coalesce(auth.jwt() ->> 'email', ''));
    v_id         uuid;
    v_org        uuid;
    v_nome       text;
    v_token      text;
    v_ativo      boolean;
    v_expira     timestamptz;
BEGIN
    IF v_email = '' THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_portal NOT IN ('cliente', 'fornecedor', 'corretor', 'investidor') THEN
        RAISE EXCEPTION 'portal_invalido' USING ERRCODE = '22023';
    END IF;

    -- Cadastro pelo e-mail (preferindo o que já tem token ativo).
    IF p_portal = 'cliente' THEN
        SELECT c.id, c.organization_id, c.name, t.token, t.is_active, t.expires_at
          INTO v_id, v_org, v_nome, v_token, v_ativo, v_expira
          FROM public.clients c
          LEFT JOIN public.client_portal_tokens t ON t.client_id = c.id
         WHERE lower(c.email) = v_email
         ORDER BY (t.is_active IS TRUE) DESC, c.created_at DESC NULLS LAST
         LIMIT 1;
    ELSIF p_portal = 'fornecedor' THEN
        SELECT s.id, s.organization_id, s.name, t.token, t.is_active, t.expires_at
          INTO v_id, v_org, v_nome, v_token, v_ativo, v_expira
          FROM public.suppliers s
          LEFT JOIN public.supplier_portal_tokens t ON t.supplier_id = s.id
         WHERE lower(s.email) = v_email
         ORDER BY (t.is_active IS TRUE) DESC, s.created_at DESC NULLS LAST
         LIMIT 1;
    ELSIF p_portal = 'investidor' THEN
        SELECT i.id, i.organization_id, i.name, t.token, t.is_active, t.expires_at
          INTO v_id, v_org, v_nome, v_token, v_ativo, v_expira
          FROM public.investors i
          LEFT JOIN public.investor_portal_tokens t ON t.investor_id = i.id
         WHERE lower(i.email) = v_email
         ORDER BY (t.is_active IS TRUE) DESC, i.created_at DESC NULLS LAST
         LIMIT 1;
    ELSE
        SELECT b.id, b.organization_id, b.name, t.token, t.is_active, t.expires_at
          INTO v_id, v_org, v_nome, v_token, v_ativo, v_expira
          FROM public.broker_profiles b
          LEFT JOIN public.broker_portal_tokens t ON t.broker_id = b.id
         WHERE lower(b.email) = v_email AND b.is_active IS DISTINCT FROM FALSE
         ORDER BY (t.is_active IS TRUE) DESC, b.created_at DESC NULLS LAST
         LIMIT 1;
    END IF;

    IF v_id IS NULL THEN
        RETURN jsonb_build_object('situacao', 'nao_cadastrado');
    END IF;

    -- A empresa revogou o acesso pelo link: o login por e-mail respeita.
    IF v_token IS NOT NULL AND v_ativo IS FALSE THEN
        RETURN jsonb_build_object('situacao', 'revogado', 'nome', v_nome);
    END IF;

    -- Token ativo e vencido: renova (a pessoa acabou de provar quem é pela senha).
    IF v_token IS NOT NULL AND v_expira IS NOT NULL AND v_expira < now() THEN
        v_token := gen_random_uuid()::text;
        IF p_portal = 'cliente' THEN
            UPDATE public.client_portal_tokens SET token = v_token, expires_at = now() + interval '90 days', last_used_at = NULL WHERE client_id = v_id;
        ELSIF p_portal = 'fornecedor' THEN
            UPDATE public.supplier_portal_tokens SET token = v_token, expires_at = now() + interval '90 days', last_used_at = NULL WHERE supplier_id = v_id;
        ELSIF p_portal = 'investidor' THEN
            UPDATE public.investor_portal_tokens SET token = v_token, expires_at = now() + interval '90 days', last_used_at = NULL WHERE investor_id = v_id;
        ELSE
            UPDATE public.broker_portal_tokens SET token = v_token, expires_at = now() + interval '90 days', last_used_at = NULL WHERE broker_id = v_id;
        END IF;
    END IF;

    -- Sem token: cria com a organização do cadastro.
    IF v_token IS NULL THEN
        IF v_org IS NULL THEN
            RETURN jsonb_build_object('situacao', 'sem_organizacao', 'nome', v_nome);
        END IF;
        v_token := gen_random_uuid()::text;
        IF p_portal = 'cliente' THEN
            INSERT INTO public.client_portal_tokens (org_id, client_id, token) VALUES (v_org, v_id, v_token);
        ELSIF p_portal = 'fornecedor' THEN
            INSERT INTO public.supplier_portal_tokens (org_id, supplier_id, token) VALUES (v_org, v_id, v_token);
        ELSIF p_portal = 'investidor' THEN
            INSERT INTO public.investor_portal_tokens (org_id, investor_id, token) VALUES (v_org, v_id, v_token);
        ELSE
            INSERT INTO public.broker_portal_tokens (org_id, broker_id, token) VALUES (v_org, v_id, v_token);
        END IF;
    END IF;

    -- org_id do token (pode diferir do cadastro quando foi gerado por outra org do grupo).
    IF p_portal = 'cliente' THEN
        SELECT t.org_id INTO v_org FROM public.client_portal_tokens t WHERE t.client_id = v_id;
    ELSIF p_portal = 'fornecedor' THEN
        SELECT t.org_id INTO v_org FROM public.supplier_portal_tokens t WHERE t.supplier_id = v_id;
    ELSIF p_portal = 'investidor' THEN
        SELECT t.org_id INTO v_org FROM public.investor_portal_tokens t WHERE t.investor_id = v_id;
    ELSE
        SELECT t.org_id INTO v_org FROM public.broker_portal_tokens t WHERE t.broker_id = v_id;
    END IF;

    RETURN jsonb_build_object('situacao', 'ok', 'token', v_token, 'org_id', v_org, 'nome', v_nome);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.portal_token_para_mim(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_token_para_mim(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_dataroom(p_token text, p_opportunity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org_id UUID;
BEGIN
    SELECT org_id INTO v_org_id
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"unauthorized"}'::jsonb; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.investor_opportunities o
        WHERE o.id = p_opportunity_id AND o.organization_id = v_org_id AND o.is_published = TRUE
    ) THEN
        RETURN '{"valid":false,"error":"forbidden"}'::jsonb;
    END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'documents', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', d.id, 'opportunity_id', d.opportunity_id, 'name', d.name, 'description', d.description,
                'file_path', d.file_path, 'file_size', d.file_size, 'mime_type', d.mime_type,
                'category', d.category, 'created_at', d.created_at) ORDER BY d.created_at DESC)
            FROM public.opportunity_documents d
            WHERE d.opportunity_id = p_opportunity_id
              AND d.organization_id = v_org_id
              AND d.category <> 'foto'
        ), '[]'::jsonb)
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_dataroom(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_dataroom(TEXT, UUID) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.fn_investor_portal_get_study(TEXT, UUID);
