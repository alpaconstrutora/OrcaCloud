-- ============================================================================
-- Link do celular (/celular?token=) — aba "Pedido": Pedido Fast sem login (14/11/2026)
-- Plano: docs/planos/2026-11-14-pedido-fast.md (Parte 2, item 1)
-- Prova: scripts/teste-link-celular-pedido-fast.sql
--
-- Por quê: o usuário abriu o link do celular e viu só Tarefas e Diário — pediu o
-- Pedido Fast ali também ("sim", 14/11/2026). A Edge `pedido-fast` já faz tudo para
-- o app logado; no link quem diz QUEM é o comprador é o token.
--
-- 1. _celular_pedido_fast_autoriza(p_token, p_acao) — só service_role (a Edge chama
--    com a service_role, como a celular-diario-midia chama o storage). Resolve o
--    token (_mobile_link_resolver: 42501 'link inválido ou vencido'), aplica o
--    limite de uso (_celular_cota, 54000: a leitura chama a IA, que custa) e
--    exige que o dono do link possa fazer pedido na org do link
--    (fn_pode_criar_pedido_de — a mesma regra do app logado). Devolve
--    user_id, org_id e e-mail do dono do link.
-- 2. celular_obras_listar(p_token) — as obras do passo 2: só OBRA da org do link,
--    sem projeto de sistema (REGRAS #2/#3: isSystemProject = settings.isSystemProject
--    OU nome 'Gestão Comercial'). anon/authenticated, como as demais celular_*.
--
-- A Edge confere ainda que a obra escolhida é da org do link (criar).
--
-- ⚠️ Aplicar com db query -f — nunca db push:
--      npx supabase db query --linked -f <este arquivo>
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.celular_obras_listar(text);
--   DROP FUNCTION IF EXISTS public._celular_pedido_fast_autoriza(text, text);
--   ALTER TABLE public.user_mobile_link_uso DROP CONSTRAINT user_mobile_link_uso_acao_check,
--     ADD CONSTRAINT user_mobile_link_uso_acao_check CHECK (acao IN ('subir', 'assinar'));  -- só depois de apagar as linhas pedido_fast_*
-- ============================================================================

-- O contador de uso por link aceitava só as ações da mídia do Diário (CHECK no banco,
-- sem nome na migration de origem). Duas ações novas: pedido_fast_ler, pedido_fast_criar.
ALTER TABLE public.user_mobile_link_uso DROP CONSTRAINT IF EXISTS user_mobile_link_uso_acao_check;
ALTER TABLE public.user_mobile_link_uso ADD CONSTRAINT user_mobile_link_uso_acao_check
    CHECK (acao IN ('subir', 'assinar', 'pedido_fast_ler', 'pedido_fast_criar'));

CREATE OR REPLACE FUNCTION public._celular_pedido_fast_autoriza(p_token TEXT, p_acao TEXT)
RETURNS TABLE (user_id UUID, org_id UUID, email TEXT)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID;
    v_org  UUID;
BEGIN
    IF p_acao IS NULL OR p_acao NOT IN ('ler', 'criar') THEN
        RAISE EXCEPTION 'ação inválida' USING ERRCODE = '22023';
    END IF;

    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    -- Limite por link e por hora. Ler chama a IA; criar grava pedido.
    PERFORM public._celular_cota(p_token, 'pedido_fast_' || p_acao, CASE p_acao WHEN 'ler' THEN 40 ELSE 30 END);

    IF NOT public.fn_pode_criar_pedido_de(v_user, v_org) THEN
        RAISE EXCEPTION 'sem acesso a Pedidos de Compra' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
        SELECT v_user, v_org, lower(u.email)::text FROM auth.users u WHERE u.id = v_user;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._celular_pedido_fast_autoriza(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._celular_pedido_fast_autoriza(TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.celular_obras_listar(p_token TEXT)
RETURNS TABLE (id UUID, nome TEXT)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID;
    v_org  UUID;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    IF NOT public.fn_pode_criar_pedido_de(v_user, v_org) THEN
        RAISE EXCEPTION 'sem acesso a Pedidos de Compra' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
        SELECT p.id, p.name::text
          FROM public.projects p
         WHERE p.organization_id = v_org   -- a Edge numera pela coluna; obra só com settings.organizationId falharia ao criar
           AND public._celular_classificacao(p.settings) = 'OBRA'
           AND NOT coalesce((p.settings ->> 'isSystemProject')::boolean, false)
           AND btrim(coalesce(p.name, '')) NOT IN ('Gestão Comercial')
         ORDER BY p.name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.celular_obras_listar(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_obras_listar(TEXT) TO anon, authenticated;
