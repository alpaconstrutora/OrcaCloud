-- ============================================================
-- Migration: aplicar_20271026990000_portal_colaborador_resumo_com_empresa.sql
-- Plano: docs/planos/2026-10-26-portal-colaborador-holerite-e-estados.md (item 4)
--
-- PEDIDO: o Portal do Colaborador passa a levar a marca da EMPRESA do
-- colaborador (decisão do usuário, 26/10/2026): o logo de
-- `organizations.logo_url` no cabeçalho, ou o nome quando não há logo.
--
-- O QUE MUDA
-- `fn_colab_portal_summary(p_token)` devolve o mesmo resumo de antes
-- (`portal_employee_summary`) e acrescenta `organization { name, logo_url }` —
-- a organização em que o colaborador é registrado (`employees.org_id`).
-- Só nome e logo: nada de CNPJ, endereço ou `settings` num link anônimo.
--
-- AUTORIZAÇÃO (REGRA #7): o token resolve o colaborador por
-- `fn_colab_portal_employee` (expira, revoga); a organização é a DELE.
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
            SELECT jsonb_build_object('name', o.name, 'logo_url', NULLIF(o.logo_url, ''))
              FROM public.employees e
              JOIN public.organizations o ON o.id = e.org_id
             WHERE e.id = v_emp
        ))
    )::json;
END;
$$;

-- ── Privilégios (REGRA #7) ──────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.fn_colab_portal_summary(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_colab_portal_summary(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_colab_portal_summary(text) TO anon, authenticated;

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT has_function_privilege('anon', 'public.fn_colab_portal_summary(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'fn_colab_portal_summary deveria seguir chamavel por anon (portal por link)';
    END IF;
    IF has_function_privilege('authenticated', 'public.portal_employee_summary(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'portal_employee_summary (primitiva por employee_id) nao pode reabrir para authenticated';
    END IF;
    RAISE NOTICE 'OK: resumo do portal com nome e logo da empresa do colaborador.';
END $$;
