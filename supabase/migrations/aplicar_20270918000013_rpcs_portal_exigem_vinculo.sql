-- ============================================================
-- Migration: aplicar_20270918000013_rpcs_portal_exigem_vinculo.sql
-- SEGURANÇA — achado C3-01, defesa em profundidade (item 1.4b do plano)
-- Plano: docs/planos/2026-09-02-correcao-auditoria-seguranca.md § Fase 1.4b
--
-- ⚠️ CORREÇÃO DE ESCOPO DO PRÓPRIO RELATÓRIO
--
-- O C3-01 afirmava que as OITO RPCs de credencial de portal emitiam token "sem
-- verificar quem chama". Ao escrever esta migration, a leitura de
-- `pg_get_functiondef` das oito mostrou que isso vale para apenas TRÊS:
--
--   SEM guarda  →  client_portal_generate_token
--                  broker_portal_generate_token
--                  portal_generate_token          (colaborador)
--
--   COM guarda  →  investor_portal_generate_token
--                  partner_portal_generate_token / _revoke_token
--                  supplier_portal_generate_token / _revoke_token
--
-- As cinco já chamavam `<portal>_portal_can_manage_tokens(p_org_id)`, que exige
-- `organization_members.role IN ('owner','admin')` — e checavam que o titular
-- pertence à organização. Como `anon` não tem `auth.uid()` nem `auth.jwt()`,
-- essa guarda já as tornava inalcançáveis anonimamente, mesmo com a ACL aberta.
--
-- Ou seja: o REVOKE da aplicar_20270918000004 continuou certo e necessário (a
-- ACL estava aberta nas oito), mas o vetor anônimo real existia em três, não em
-- oito. A prova de conceito da auditoria explorou `client_portal_generate_token`
-- — uma das três de fato desprotegidas.
--
-- ESTA MIGRATION nivela as três pelo padrão que as outras cinco já seguiam.
--
-- POR QUE `is_org_manager` E NÃO `is_org_member`
-- No plano eu havia proposto `is_org_member`, para não arriscar quebrar quem
-- gera link hoje. A leitura das funções mudou a resposta: o projeto JÁ decidiu
-- que emitir credencial de portal é operação de owner/admin — é o que
-- `*_can_manage_tokens` faz nos outros cinco casos. Seguir o padrão existente
-- vale mais do que a minha proposta original, e `is_org_manager()` é exatamente
-- `role IN ('owner','admin')`, o mesmo predicado, sem criar duas funções
-- auxiliares quase idênticas.
--
-- COMPARTILHAMENTO É PRESERVADO
-- Cliente `is_shared` e colaborador em `employee_org_shares` (14 linhas) são
-- compartilhados entre organizações de propósito. A checagem de titular aceita
-- os dois casos — senão esta migration quebraria a emissão de link para eles.
-- ============================================================

-- ── 1. Portal do Cliente ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.client_portal_generate_token(p_client_id uuid, p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_token TEXT := gen_random_uuid()::text;
BEGIN
    IF NOT public.is_org_manager(p_org_id) THEN
        RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;

    -- `is_shared` é compartilhamento deliberado entre organizações do grupo.
    IF NOT EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = p_client_id
          AND (c.organization_id = p_org_id OR c.is_shared)
    ) THEN
        RAISE EXCEPTION 'client_not_found_for_org' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.client_portal_tokens (org_id, client_id, token)
    VALUES (p_org_id, p_client_id, v_token)
    ON CONFLICT (client_id)
    DO UPDATE SET org_id       = p_org_id,
                  token        = v_token,
                  expires_at   = NOW() + INTERVAL '90 days',
                  is_active    = TRUE,
                  last_used_at = NULL;

    RETURN v_token;
END;
$function$;

-- ── 2. Portal do Corretor ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broker_portal_generate_token(p_broker_id uuid, p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_token TEXT := gen_random_uuid()::text;
BEGIN
    IF NOT public.is_org_manager(p_org_id) THEN
        RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.broker_profiles b
        WHERE b.id = p_broker_id
          AND (b.organization_id = p_org_id OR b.organization_id IS NULL)
    ) THEN
        RAISE EXCEPTION 'broker_not_found_for_org' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.broker_portal_tokens (org_id, broker_id, token)
    VALUES (p_org_id, p_broker_id, v_token)
    ON CONFLICT (broker_id) DO UPDATE
        SET org_id       = p_org_id,
            token        = v_token,
            expires_at   = NOW() + INTERVAL '90 days',
            is_active    = TRUE,
            last_used_at = NULL,
            created_at   = NOW();

    RETURN v_token;
END;
$function$;

-- ── 3. Portal do Colaborador ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.portal_generate_token(p_employee_id uuid, p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_token TEXT := gen_random_uuid()::text;
BEGIN
    IF NOT public.is_org_manager(p_org_id) THEN
        RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;

    -- Colaborador compartilhado entre organizações vive em employee_org_shares
    -- (o compartilhamento é intencional; ver `is_employee_shared_with_user`).
    IF NOT EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = p_employee_id
          AND (
              e.org_id = p_org_id
              OR EXISTS (
                  SELECT 1 FROM public.employee_org_shares s
                  WHERE s.employee_id = p_employee_id AND s.target_org_id = p_org_id
              )
          )
    ) THEN
        RAISE EXCEPTION 'employee_not_found_for_org' USING ERRCODE = '42501';
    END IF;

    -- Validade de 30 dias — preservada do original, é menor que a dos outros
    -- portais (90) de propósito.
    INSERT INTO public.portal_tokens (org_id, employee_id, token)
    VALUES (p_org_id, p_employee_id, v_token)
    ON CONFLICT (employee_id)
    DO UPDATE SET org_id       = p_org_id,
                  token        = v_token,
                  expires_at   = NOW() + INTERVAL '30 days',
                  is_active    = TRUE,
                  last_used_at = NULL;

    RETURN v_token;
END;
$function$;

-- ── Privilégios ─────────────────────────────────────────────────────────────
-- `CREATE OR REPLACE` preserva a ACL, mas reafirmar é barato e deixa a intenção
-- no arquivo. Escrito de forma LITERAL, e não com `EXECUTE format(...)` num
-- laço: a trava `__tests__/segurancaMigrations.test.ts` lê o TEXTO da migration,
-- e um REVOKE montado dinamicamente é invisível para ela. Ela acusou esta
-- migration na primeira versão, e estava certa — a legibilidade para a trava é
-- parte do valor, não um detalhe de estilo.
REVOKE EXECUTE ON FUNCTION public.client_portal_generate_token(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.client_portal_generate_token(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.broker_portal_generate_token(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.broker_portal_generate_token(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.portal_generate_token(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.portal_generate_token(uuid, uuid) TO authenticated;

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
DECLARE
    v_sem_guarda text;
    v_anon text;
BEGIN
    -- Nenhuma das oito pode ficar sem checagem de papel no corpo.
    SELECT string_agg(p.proname, ', ') INTO v_sem_guarda
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('client_portal_generate_token','broker_portal_generate_token',
                         'investor_portal_generate_token','partner_portal_generate_token',
                         'supplier_portal_generate_token','portal_generate_token',
                         'partner_portal_revoke_token','supplier_portal_revoke_token')
       AND pg_get_functiondef(p.oid) !~ '(is_org_manager|can_manage_tokens)';

    SELECT string_agg(p.proname, ', ') INTO v_anon
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('client_portal_generate_token','broker_portal_generate_token','portal_generate_token')
       AND has_function_privilege('anon', p.oid, 'EXECUTE');

    IF v_sem_guarda IS NOT NULL THEN
        RAISE EXCEPTION '1.4b: RPC de credencial sem checagem de papel: %', v_sem_guarda;
    END IF;
    IF v_anon IS NOT NULL THEN
        RAISE EXCEPTION '1.4b: anon voltou a executar: %', v_anon;
    END IF;

    RAISE NOTICE '1.4b OK: as 8 RPCs de credencial de portal exigem owner/admin da organizacao no corpo.';
END $$;
