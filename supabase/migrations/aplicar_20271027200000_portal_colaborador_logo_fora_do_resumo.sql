-- ============================================================
-- Migration: aplicar_20271027200000_portal_colaborador_logo_fora_do_resumo.sql
-- Plano: docs/planos/2026-10-26-portal-colaborador-holerite-e-estados.md (item 8)
--
-- PEDIDO: `/impeccable optimize` do Portal do Colaborador (27/10/2026).
--
-- O PROBLEMA, MEDIDO
-- `organizations.logo_url` guarda a imagem EMBUTIDA (data URI), não um endereço:
-- as duas organizações com colaborador têm 80 KB e 134 KB. A migration
-- 20271026990000 pôs esse texto dentro de `fn_colab_portal_summary`, então o
-- resumo — que o portal pede ao abrir, a cada volta para a aba (staleTime de
-- 30 s) e depois de cada ação — carregava o logo inteiro toda vez.
--
-- O QUE MUDA
-- 1. O resumo devolve `organization { name, logo_versao }`: o md5 do logo, ou
--    nulo quando não há logo. Nada do logo em si.
-- 2. `fn_colab_portal_logo(p_token)` devolve o logo. O front guarda o logo no
--    aparelho pela versão e só chama esta função quando a versão muda.
--
-- ORDEM DE APLICAÇÃO: o front que entende `logo_versao` vai ao ar ANTES desta
-- migration (ele ainda aceita o `logo_url` antigo no resumo). Aplicar antes
-- deixaria o portal publicado sem logo, só com o nome, até o deploy.
--
-- AUTORIZAÇÃO (REGRA #7): as duas funções resolvem o colaborador pelo token
-- (`fn_colab_portal_employee`: expira, revoga) e só leem a organização DELE.
-- O logo é a marca que o próprio portal já mostra; nada além dele sai daqui.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_colab_portal_summary(p_token text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_emp uuid := public.fn_colab_portal_employee(p_token);
BEGIN
    RETURN (
        public.portal_employee_summary(v_emp)::jsonb
        || jsonb_build_object('organization', (
            SELECT jsonb_build_object('name', o.name, 'logo_versao', md5(NULLIF(o.logo_url, '')))
              FROM public.employees e
              JOIN public.organizations o ON o.id = e.org_id
             WHERE e.id = v_emp
        ))
    )::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_colab_portal_logo(p_token text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_emp uuid := public.fn_colab_portal_employee(p_token);
BEGIN
    RETURN (
        SELECT NULLIF(o.logo_url, '')
          FROM public.employees e
          JOIN public.organizations o ON o.id = e.org_id
         WHERE e.id = v_emp
    );
END;
$$;

-- ── Privilégios (REGRA #7) ──────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.fn_colab_portal_summary(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_colab_portal_summary(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_colab_portal_summary(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.fn_colab_portal_logo(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_colab_portal_logo(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_colab_portal_logo(text) TO anon, authenticated;

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT has_function_privilege('anon', 'public.fn_colab_portal_summary(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'fn_colab_portal_summary deveria seguir chamavel por anon (portal por link)';
    END IF;
    IF NOT has_function_privilege('anon', 'public.fn_colab_portal_logo(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'fn_colab_portal_logo deveria ser chamavel por anon (portal por link)';
    END IF;
    IF has_function_privilege('authenticated', 'public.portal_employee_summary(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'portal_employee_summary (primitiva por employee_id) nao pode reabrir para authenticated';
    END IF;
    RAISE NOTICE 'OK: resumo do portal sem o logo; logo por fn_colab_portal_logo.';
END $$;
