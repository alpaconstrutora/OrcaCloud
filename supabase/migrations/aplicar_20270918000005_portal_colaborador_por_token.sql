-- ============================================================
-- Migration: aplicar_20270918000005_portal_colaborador_por_token.sql
-- SEGURANÇA — achado C3-02 da auditoria de 2026-09-01 (severidade: CRÍTICA)
-- Plano: docs/planos/2026-09-02-correcao-auditoria-seguranca.md § Fase 1.5a
--
-- PROBLEMA
-- As sete funções de leitura do Portal do Colaborador são SECURITY DEFINER,
-- recebem `p_employee_id` cru e estavam executáveis por `anon`. Quem tivesse o
-- UUID de um colaborador lia cadastro, ponto, férias, treinamentos, documentos
-- e FOLHA DE PAGAMENTO — sem token, sem sessão, sem nada.
--
-- O contraste que torna o achado inequívoco: `anon` não tem sequer
-- GRANT SELECT em `employees` (a consulta direta falha com 42501), mas as RPCs
-- SECURITY DEFINER entregavam o mesmo dado.
-- Prova: docs/security-audit/provas/poc-c3-02-portal-rpcs-anon.sql
--
-- ESTA MIGRATION (1.5a) É PURAMENTE ADITIVA
-- Cria as variantes por token. Não revoga nada, não altera nada existente — o
-- Portal do Colaborador continua funcionando exatamente como hoje enquanto o
-- frontend não migrar. A revogação das variantes por `p_employee_id` é a
-- migration 1.5b, que só sobe depois do frontend (item 3.6 do plano).
--
-- POR QUE WRAPPERS, E NÃO CÓPIAS
-- Cada nova função só resolve token → employee_id e delega para a função
-- existente. A lógica de negócio (que já está em produção e testada) não é
-- duplicada: se ela mudar, muda num lugar só. O ganho de segurança está
-- inteiramente na porta de entrada.
--
-- NOME `fn_colab_portal_*` e não `fn_portal_*`
-- `fn_portal_get_ged_documents(p_token)` JÁ EXISTE e é do Portal do CLIENTE
-- (lê `client_portal_tokens`, audience='cliente'). Reusar o prefixo criaria
-- duas famílias homônimas com semânticas diferentes.
-- ============================================================

-- ── Resolve o token do colaborador. Uma função, um lugar para mudar a regra ──
CREATE OR REPLACE FUNCTION public.fn_colab_portal_employee(p_token text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_emp uuid;
BEGIN
    SELECT employee_id INTO v_emp
      FROM public.portal_tokens
     WHERE token = p_token
       AND is_active = TRUE
       AND expires_at > NOW();

    IF v_emp IS NULL THEN
        RAISE EXCEPTION 'PORTAL_TOKEN_INVALIDO'
            USING HINT = 'Link do portal invalido, expirado ou revogado.';
    END IF;

    RETURN v_emp;
END;
$$;

-- ── As sete variantes por token ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_colab_portal_summary(p_token text)
RETURNS json LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.portal_employee_summary(public.fn_colab_portal_employee(p_token)) $$;

CREATE OR REPLACE FUNCTION public.fn_colab_portal_time_entries(p_token text)
RETURNS json LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.portal_get_time_entries(public.fn_colab_portal_employee(p_token)) $$;

CREATE OR REPLACE FUNCTION public.fn_colab_portal_absences(p_token text)
RETURNS json LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.portal_get_absences(public.fn_colab_portal_employee(p_token)) $$;

CREATE OR REPLACE FUNCTION public.fn_colab_portal_trainings(p_token text)
RETURNS json LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.portal_get_trainings(public.fn_colab_portal_employee(p_token)) $$;

CREATE OR REPLACE FUNCTION public.fn_colab_portal_documents(p_token text)
RETURNS json LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.portal_get_documents(public.fn_colab_portal_employee(p_token)) $$;

CREATE OR REPLACE FUNCTION public.fn_colab_portal_ged_documents(p_token text)
RETURNS json LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.portal_get_ged_documents(public.fn_colab_portal_employee(p_token)) $$;

CREATE OR REPLACE FUNCTION public.fn_colab_portal_payroll_runs(p_token text)
RETURNS json LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.portal_get_payroll_runs(public.fn_colab_portal_employee(p_token)) $$;

-- ── Marca o uso do link (mesma convenção dos outros portais) ────────────────
CREATE OR REPLACE FUNCTION public.fn_colab_portal_touch(p_token text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ UPDATE public.portal_tokens SET last_used_at = NOW()
       WHERE token = p_token AND is_active = TRUE AND expires_at > NOW() $$;

-- ── Privilégios explícitos ──────────────────────────────────────────────────
-- `anon` PRECISA executar: o Portal do Colaborador é acesso externo por link,
-- sem sessão Supabase. A diferença para o estado anterior é que agora o recorte
-- vem do token — que é secreto, expira e pode ser revogado —, e não de um UUID
-- de colaborador, que é enumerável e não expira nunca.
-- O REVOKE de PUBLIC vem primeiro para não repetir o defeito do C3-01.
DO $$
DECLARE
    v_fn text;
    v_alvos text[] := ARRAY[
        'fn_colab_portal_employee', 'fn_colab_portal_summary',
        'fn_colab_portal_time_entries', 'fn_colab_portal_absences',
        'fn_colab_portal_trainings', 'fn_colab_portal_documents',
        'fn_colab_portal_ged_documents', 'fn_colab_portal_payroll_runs',
        'fn_colab_portal_touch'
    ];
BEGIN
    FOREACH v_fn IN ARRAY v_alvos LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(text) FROM PUBLIC', v_fn);
        EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%I(text) TO anon, authenticated', v_fn);
    END LOOP;
END $$;

-- `fn_colab_portal_employee` é primitiva interna: não deve ser chamada do
-- cliente (devolveria o employee_id, justamente o que se quer parar de expor).
REVOKE EXECUTE ON FUNCTION public.fn_colab_portal_employee(text) FROM anon, authenticated;

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
DECLARE
    v_criadas int;
    v_emp_exposta boolean;
BEGIN
    SELECT count(*) INTO v_criadas
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname LIKE 'fn_colab_portal_%'
       AND has_function_privilege('anon', p.oid, 'EXECUTE');

    SELECT has_function_privilege('anon', 'public.fn_colab_portal_employee(text)', 'EXECUTE')
      INTO v_emp_exposta;

    -- 8 chamáveis por anon (as 7 de leitura + touch); a primitiva employee NÃO.
    IF v_criadas <> 8 THEN
        RAISE EXCEPTION '1.5a: esperava 8 funcoes chamaveis por anon, encontrei %', v_criadas;
    END IF;
    IF v_emp_exposta THEN
        RAISE EXCEPTION '1.5a: fn_colab_portal_employee nao deveria ser chamavel por anon';
    END IF;

    RAISE NOTICE '1.5a OK: 7 leituras + touch por token disponiveis; primitiva interna fechada.';
    RAISE NOTICE '1.5a: as variantes por p_employee_id CONTINUAM abertas — revogar na 1.5b, depois do frontend.';
END $$;
