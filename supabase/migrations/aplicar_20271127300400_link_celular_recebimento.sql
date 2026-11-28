-- aplicar_20271127300400_link_celular_recebimento.sql
--
-- Recebimento mobile, Fase 2 (docs/planos/2026-11-27-recebimento-mobile.md):
-- aba "Receber" do link `/celular`, ao lado de "Pedido".
-- Prova: scripts/teste-link-celular-recebimento.sql.
--
-- O link vale para TODAS as orgs de que o dono é membro (regra do usuário de
-- 27/11) e em que ele pode pedir — conferido no banco a cada chamada pelos
-- MESMOS núcleos do app logado (`_recebimento_listar_de`, `_recebimento_abrir_de`,
-- e na escrita `_recebimento_autoriza_de` via Edge). O link segue ancorado na
-- org em que foi gerado (`_mobile_link_resolver`).
--
--   celular_recebimento_listar(p_token)          anon/authenticated
--   celular_recebimento_abrir(p_token, p_order)  anon/authenticated
--   _celular_recebimento_autoriza(p_token, p_acao) só service_role (Edge
--       `pedido-recebimento`): resolve o token, aplica a cota por hora e exige
--       acesso a Compras em alguma das orgs; devolve dono e e-mail.
--
-- Cotas por link e por hora: recebimento_receber 30, recebimento_retirada 30,
-- recebimento_subir 120 (foto do comprovante e documentos), recebimento_assinar 600.
-- O CHECK de user_mobile_link_uso.acao é recriado com as ações antigas + estas.
--
-- ⚠️ Aplicar à mão, da pasta de uma frente LIGADA ao projeto. Depois da 300300.

ALTER TABLE public.user_mobile_link_uso DROP CONSTRAINT IF EXISTS user_mobile_link_uso_acao_check;
ALTER TABLE public.user_mobile_link_uso ADD CONSTRAINT user_mobile_link_uso_acao_check
    CHECK (acao IN ('subir', 'assinar', 'pedido_fast_ler', 'pedido_fast_criar',
                    'recebimento_receber', 'recebimento_retirada', 'recebimento_subir', 'recebimento_assinar'));

CREATE OR REPLACE FUNCTION public._celular_recebimento_autoriza(p_token TEXT, p_acao TEXT)
RETURNS TABLE (user_id UUID, email TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID;
BEGIN
    IF p_acao IS NULL OR p_acao NOT IN ('receber', 'retirada', 'subir', 'assinar') THEN
        RAISE EXCEPTION 'ação inválida' USING ERRCODE = '22023';
    END IF;

    SELECT r.user_id INTO v_user FROM public._mobile_link_resolver(p_token) r;

    PERFORM public._celular_cota(p_token, 'recebimento_' || p_acao,
        CASE p_acao WHEN 'receber' THEN 30 WHEN 'retirada' THEN 30 WHEN 'subir' THEN 120 ELSE 600 END);

    IF public.fn_pode_criar_pedido_em_alguma_de(v_user) IS NOT TRUE THEN
        RAISE EXCEPTION 'sem acesso a Pedidos de Compra' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY SELECT v_user, lower(u.email)::text FROM auth.users u WHERE u.id = v_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.celular_recebimento_listar(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID;
BEGIN
    SELECT r.user_id INTO v_user FROM public._mobile_link_resolver(p_token) r;
    IF public.fn_pode_criar_pedido_em_alguma_de(v_user) IS NOT TRUE THEN
        RAISE EXCEPTION 'sem acesso a Pedidos de Compra' USING ERRCODE = '42501';
    END IF;
    RETURN public._recebimento_listar_de(v_user, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.celular_recebimento_abrir(p_token TEXT, p_order UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID;
BEGIN
    SELECT r.user_id INTO v_user FROM public._mobile_link_resolver(p_token) r;
    RETURN public._recebimento_abrir_de(v_user, p_order);
END;
$$;

-- ── ACL (REGRA #7) ───────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public._celular_recebimento_autoriza(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._celular_recebimento_autoriza(TEXT, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.celular_recebimento_listar(TEXT)       FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_recebimento_listar(TEXT)       TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_recebimento_abrir(TEXT, UUID)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_recebimento_abrir(TEXT, UUID)  TO anon, authenticated;
