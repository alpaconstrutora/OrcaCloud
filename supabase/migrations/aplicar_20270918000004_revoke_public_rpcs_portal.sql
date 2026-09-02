-- ============================================================
-- Migration: aplicar_20270918000004_revoke_public_rpcs_portal.sql
-- SEGURANÇA — achado C3-01 da auditoria de 2026-09-01 (severidade: CRÍTICA)
-- Plano: docs/planos/2026-09-02-correcao-auditoria-seguranca.md § Fase 1.4
--
-- PROBLEMA
-- As oito RPCs que emitem e revogam credencial de portal são SECURITY DEFINER e
-- estavam executáveis pelo papel `anon` — a chave que vai publicada no bundle do
-- frontend. Nenhuma delas verifica quem chama.
--
-- A causa é um default do PostgreSQL, não um GRANT errado: toda função nova
-- nasce com EXECUTE para PUBLIC. As migrations originais fizeram
-- `GRANT EXECUTE ... TO authenticated` e nunca fizeram o REVOKE de PUBLIC, então
-- a ACL efetiva ficou {=X/postgres, ..., anon=X, ...} — o "=X" inicial é o PUBLIC.
--
-- Comprovado em produção: como `anon`, sem login, a chamada a
-- client_portal_generate_token devolveu um token válido e client_portal_get_data
-- devolveu o cadastro do cliente.
-- Prova: docs/security-audit/provas/poc-c3-01-token-portal-anon.sql
--
-- ESCOPO DESTA MIGRATION
-- Só o REVOKE. É ele que fecha o acesso anônimo, e é uma mudança de privilégio —
-- não toca no corpo de nenhuma função, então não há risco de alterar
-- comportamento para quem já está autenticado.
--
-- A defesa em profundidade (exigir vínculo com a organização DENTRO da função,
-- para que um membro da organização A não emita token de um cliente da B) fica
-- para a migration 20270918000007, que precisa reescrever os corpos e por isso
-- merece passo e verificação próprios.
--
-- Idempotente: REVOKE de privilégio já ausente é no-op.
-- ============================================================

DO $$
DECLARE
    v_fn   text;
    v_args text;
    v_assinatura text;
    -- As oito: seis emitem credencial, duas revogam (revogar = negar serviço a
    -- um parceiro/fornecedor legítimo).
    v_alvos text[] := ARRAY[
        'client_portal_generate_token',
        'broker_portal_generate_token',
        'investor_portal_generate_token',
        'partner_portal_generate_token',
        'supplier_portal_generate_token',
        'portal_generate_token',
        'partner_portal_revoke_token',
        'supplier_portal_revoke_token'
    ];
BEGIN
    FOREACH v_fn IN ARRAY v_alvos LOOP
        FOR v_args IN
            SELECT pg_get_function_identity_arguments(p.oid)
              FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = v_fn
        LOOP
            v_assinatura := format('public.%I(%s)', v_fn, v_args);
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', v_assinatura);
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon',   v_assinatura);
            -- `authenticated` continua podendo: é o app logado que gera o link
            -- de portal pela tela de administração.
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_assinatura);
            RAISE NOTICE 'C3-01: revogado PUBLIC/anon em %', v_assinatura;
        END LOOP;
    END LOOP;
END $$;

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
DECLARE
    v_ainda_anon text;
    v_perdeu_auth text;
BEGIN
    SELECT string_agg(p.proname, ', ') INTO v_ainda_anon
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('client_portal_generate_token','broker_portal_generate_token',
                         'investor_portal_generate_token','partner_portal_generate_token',
                         'supplier_portal_generate_token','portal_generate_token',
                         'partner_portal_revoke_token','supplier_portal_revoke_token')
       AND has_function_privilege('anon', p.oid, 'EXECUTE');

    SELECT string_agg(p.proname, ', ') INTO v_perdeu_auth
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('client_portal_generate_token','broker_portal_generate_token',
                         'investor_portal_generate_token','partner_portal_generate_token',
                         'supplier_portal_generate_token','portal_generate_token',
                         'partner_portal_revoke_token','supplier_portal_revoke_token')
       AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE');

    IF v_ainda_anon IS NOT NULL THEN
        RAISE EXCEPTION 'C3-01: anon ainda executa: %', v_ainda_anon;
    END IF;
    IF v_perdeu_auth IS NOT NULL THEN
        RAISE EXCEPTION 'C3-01: authenticated perdeu acesso (quebraria a tela de admin): %', v_perdeu_auth;
    END IF;

    RAISE NOTICE 'C3-01 OK: as 8 RPCs de credencial de portal nao sao mais executaveis por anon.';
END $$;
