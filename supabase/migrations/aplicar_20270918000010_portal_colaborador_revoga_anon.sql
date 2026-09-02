-- ============================================================
-- Migration: aplicar_20270918000010_portal_colaborador_revoga_anon.sql
-- SEGURANÇA — achado C3-02 da auditoria de 2026-09-01 (severidade: CRÍTICA)
-- Plano: docs/planos/2026-09-02-correcao-auditoria-seguranca.md § Fase 1.5b
--
-- FECHA O ÚLTIMO ACHADO CRÍTICO.
--
-- As sete funções abaixo são SECURITY DEFINER, recebem `p_employee_id` cru e
-- eram executáveis por `anon`: quem tivesse o UUID de um colaborador lia
-- cadastro, ponto, férias, treinamentos, documentos e FOLHA DE PAGAMENTO, sem
-- token e sem sessão. Comprovado em produção — e o contraste que torna o achado
-- inequívoco é que `anon` nem tem GRANT SELECT em `employees` (consulta direta
-- falha com 42501), mas as RPCs entregavam o mesmo dado.
--
-- PRÉ-REQUISITOS JÁ CUMPRIDOS (esta é a última etapa da janela coordenada, D2)
--   1.5a  aplicar_20270918000005 — criou as variantes `fn_colab_portal_*(p_token)`
--   3.6   components/LaborPortal.tsx + services/atsService.ts publicados
--   2.9   Edge Function labor-portal-ged-download publicada (aceita token)
-- Sem esses três, este REVOKE derrubaria o Portal do Colaborador.
--
-- POR QUE SÓ `anon`, E NÃO TAMBÉM `authenticated`
-- O caminho interno continua usando estas funções: o admin que simula o portal
-- pelo módulo de RH (LaborPortal.tsx, seleção de colaborador no dropdown) não
-- tem token de link. Ali existe sessão autenticada de verdade, que é o que
-- faltava no acesso externo. Apertar também `authenticated` — para impedir que
-- um membro da organização A leia dados de um colaborador da B — exige checagem
-- dentro do corpo das funções e é o item 1.4b do plano, ainda em aberto.
--
-- `is_employee_shared_with_user(p_employee_id)` fica DE FORA de propósito:
-- devolve booleano (não dado), é escopada ao próprio chamador e é usada dentro
-- da policy `employees_org_access`, cujo papel é `{public}` — revogá-la trocaria
-- um resultado vazio limpo por erro de permissão na avaliação da policy.
-- ============================================================

DO $$
DECLARE
    v_fn text;
    v_alvos text[] := ARRAY[
        'portal_employee_summary',
        'portal_get_time_entries',
        'portal_get_absences',
        'portal_get_trainings',
        'portal_get_documents',
        'portal_get_ged_documents',
        'portal_get_payroll_runs'
    ];
BEGIN
    FOREACH v_fn IN ARRAY v_alvos LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(uuid) FROM PUBLIC', v_fn);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(uuid) FROM anon',   v_fn);
        EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%I(uuid) TO authenticated', v_fn);
        RAISE NOTICE 'C3-02: anon revogado em public.%(uuid)', v_fn;
    END LOOP;
END $$;

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
DECLARE
    v_ainda_anon text;
    v_perdeu_auth text;
    v_token_ok int;
BEGIN
    SELECT string_agg(p.proname, ', ') INTO v_ainda_anon
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('portal_employee_summary','portal_get_time_entries',
                         'portal_get_absences','portal_get_trainings',
                         'portal_get_documents','portal_get_ged_documents',
                         'portal_get_payroll_runs')
       AND has_function_privilege('anon', p.oid, 'EXECUTE');

    SELECT string_agg(p.proname, ', ') INTO v_perdeu_auth
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('portal_employee_summary','portal_get_time_entries',
                         'portal_get_absences','portal_get_trainings',
                         'portal_get_documents','portal_get_ged_documents',
                         'portal_get_payroll_runs')
       AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE');

    -- O caminho novo tem de continuar de pé: as 7 por token, chamáveis por anon.
    SELECT count(*) INTO v_token_ok
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname LIKE 'fn_colab_portal_%'
       AND p.proname <> 'fn_colab_portal_employee'
       AND has_function_privilege('anon', p.oid, 'EXECUTE');

    IF v_ainda_anon IS NOT NULL THEN
        RAISE EXCEPTION 'C3-02: anon ainda executa: %', v_ainda_anon;
    END IF;
    IF v_perdeu_auth IS NOT NULL THEN
        RAISE EXCEPTION 'C3-02: authenticated perdeu acesso (quebraria a simulacao do admin): %', v_perdeu_auth;
    END IF;
    IF v_token_ok < 8 THEN
        RAISE EXCEPTION 'C3-02: o caminho por token nao esta completo (% de 8 funcoes)', v_token_ok;
    END IF;

    RAISE NOTICE 'C3-02 FECHADO: leitura do Portal do Colaborador exige token; anon nao alcanca mais p_employee_id.';
END $$;
