-- ============================================================================
-- Portais do Cliente, do Fornecedor e do Corretor: login por e-mail e senha
-- "entrega a experiência do link" + convite por e-mail.
--
-- Pedido de 16/10/2026 ("faça portais exclusivo também para os demais portais").
-- Plano: docs/planos/2026-10-16-portais-login-exclusivo-convite.md
--
-- Antes desta migration:
--  - quem é DE FORA (não membro de organização) não lia o próprio cadastro em
--    `clients`/`suppliers` (policies só liberam membro/compartilhamento), então a
--    validação do login por e-mail recusava todo cliente e fornecedor; e o portal
--    depois do login lia tabelas diretas, também barradas;
--  - o acesso por LINK (`/portal-x?token=`) usa RPCs SECURITY DEFINER e funciona.
--
-- Desenho: o login por e-mail resolve o TOKEN da própria pessoa (esta RPC) e o
-- app abre a mesma casca do link. Nada vem do cliente além do nome do portal:
-- a pessoa é o e-mail do JWT.
--
-- REGRA #7: SECURITY DEFINER com autorização DENTRO (e-mail do JWT), REVOKE de
-- PUBLIC/anon na mesma migration. Aplicar com `db query -f` (nunca db push).
-- ============================================================================

-- ── 1. Data do convite por e-mail (gravada pela Edge Function portal-invite-user) ──
ALTER TABLE public.clients          ADD COLUMN IF NOT EXISTS portal_invited_at TIMESTAMPTZ;
ALTER TABLE public.suppliers        ADD COLUMN IF NOT EXISTS portal_invited_at TIMESTAMPTZ;
ALTER TABLE public.broker_profiles  ADD COLUMN IF NOT EXISTS portal_invited_at TIMESTAMPTZ;

COMMENT ON COLUMN public.clients.portal_invited_at         IS 'Último convite por e-mail para o Portal do Cliente (Edge Function portal-invite-user).';
COMMENT ON COLUMN public.suppliers.portal_invited_at       IS 'Último convite por e-mail para o Portal do Fornecedor (Edge Function portal-invite-user).';
COMMENT ON COLUMN public.broker_profiles.portal_invited_at IS 'Último convite por e-mail para o Portal do Corretor (Edge Function portal-invite-user).';

-- ── 2. Token do portal para o PRÓPRIO e-mail ────────────────────────────────
-- Devolve JSON { token, org_id, nome, situacao } ou { situacao } quando não há
-- acesso. `situacao`:
--   'ok'               → token válido (criado agora, renovado ou já existente)
--   'nao_cadastrado'   → nenhum cadastro com este e-mail
--   'revogado'         → a empresa revogou o acesso (token is_active = false)
--   'sem_organizacao'  → cadastro sem organização e sem token (corretor global):
--                        só o convite, feito por um membro, cria o token
-- Vários cadastros com o mesmo e-mail: prefere o que tem token ativo; senão o
-- cadastro mais recente.
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
    IF p_portal NOT IN ('cliente', 'fornecedor', 'corretor') THEN
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
        ELSE
            INSERT INTO public.broker_portal_tokens (org_id, broker_id, token) VALUES (v_org, v_id, v_token);
        END IF;
    END IF;

    -- org_id do token (pode diferir do cadastro quando foi gerado por outra org do grupo).
    IF p_portal = 'cliente' THEN
        SELECT t.org_id INTO v_org FROM public.client_portal_tokens t WHERE t.client_id = v_id;
    ELSIF p_portal = 'fornecedor' THEN
        SELECT t.org_id INTO v_org FROM public.supplier_portal_tokens t WHERE t.supplier_id = v_id;
    ELSE
        SELECT t.org_id INTO v_org FROM public.broker_portal_tokens t WHERE t.broker_id = v_id;
    END IF;

    RETURN jsonb_build_object('situacao', 'ok', 'token', v_token, 'org_id', v_org, 'nome', v_nome);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.portal_token_para_mim(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.portal_token_para_mim(text) TO authenticated;

COMMENT ON FUNCTION public.portal_token_para_mim(text) IS
    'Login por e-mail dos portais Cliente/Fornecedor/Corretor: devolve o token do portal da pessoa do JWT (cria/renova; revogado → recusa). 16/10/2026.';
