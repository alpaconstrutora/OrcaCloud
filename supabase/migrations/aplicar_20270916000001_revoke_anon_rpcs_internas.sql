-- ==========================================================================
-- Segurança · Fechar as RPCs INTERNAS para anon
-- Date: 2026-08-29
-- Altera: grants de 61 funções SECURITY DEFINER do schema public
-- Auditoria: docs/planos/2026-08-29-auditoria-rpc-anon.md
-- ==========================================================================
-- CONTEXTO
-- O Supabase mantém `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO
-- anon`, então toda função nova nasce chamável por anon, e
-- `REVOKE ... FROM PUBLIC` não remove grant de papel nomeado. A migration
-- aplicar_20270915000006 corrigiu isso para as `fn_debt_*`; a auditoria que
-- veio depois achou 177 funções na mesma situação.
--
-- O QUE FOI PROVADO (29/08, `BEGIN; SET LOCAL ROLE anon; …; ROLLBACK;`):
--   · get_workspaces_for_member('<email>')  -> 7 workspaces SEM LOGIN
--   · get_user_partner_workspaces('<email>') -> 1 workspace SEM LOGIN
--   · create_organization_v2(...)            -> CRIOU a organização, sem login
--     (o teste rodou em transação revertida; conferido depois que nada ficou)
--
-- E o que NÃO vaza, medido e não suposto: as funções que recebem `p_org_id`
-- (rh_kpis, sst_indicators, esocial_get_dashboard) devolvem ZEROS para anon,
-- inclusive apontando para uma org com funcionários — o RLS das tabelas
-- internas segura. Elas entram aqui como SUPERFÍCIE desnecessária, não como
-- vazamento. A distinção importa para não inflar a gravidade do que sobrou.
--
-- ESCOPO — só a família C ("internas") da auditoria. FICAM DE FORA:
--   · 99 funções de PORTAL PÚBLICO (`*_portal_*`, fn_proposal_public,
--     qr_checkin, get_order_by_share_token, …). Os portais chamam como anon
--     por construção, com token próprio: revogar derrubaria portal.
--   · 16 helpers de RLS (is_org_member, is_superadmin, check_user_*, …).
--     Baixo impacto e sem decisão do usuário ainda.
--
-- CONFERÊNCIA FEITA ANTES DE ESCREVER ESTA MIGRATION:
--   1. Cada nome foi cruzado com `grep -rn "rpc('<nome>'"` no front.
--   2. A ÚNICA que aparecia em arquivo de portal era `fn_planning_for_client`,
--      em services/clientPortalService.ts — e ali o próprio código diz
--      "Caminho autenticado (prévia do admin, sem token público)". O portal
--      público usa `fn_portal_get_planning(p_token)`, que NÃO está nesta lista.
--   3. `create_organization_v2` roda DEPOIS do login (confirmado pelo usuário
--      em 29/08), então revogar não quebra onboarding.
--
-- ⚠️ APLICAR À MÃO — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

DO $$
DECLARE
    r        RECORD;
    n        INT := 0;
    faltando TEXT[] := '{}';
    alvos    TEXT[] := ARRAY[
        'approve_area_version',
        'calculate_area_version',
        'calculate_polygon_area',
        'close_labor_diary',
        'consolidate_evaluation_cycle',
        'create_organization_v2',
        'create_task',
        'create_vacation_period',
        'dismiss_dead_letter',
        'dispatch_communication',
        'esocial_create_batch',
        'esocial_generate_s2200',
        'esocial_get_dashboard',
        'fn_activate_commercial_price_table',
        'fn_activate_rental_price_table',
        'fn_build_planning_json',
        'fn_lock_opura_document',
        'fn_maintenance_due_alerts',
        'fn_opura_docs_vencimento_alerts',
        'fn_planning_for_client',
        'fn_process_bottlenecks',
        'fn_project_measurements_by_budget_item',
        'fn_set_broker_property_access',
        'fn_supplier_warranty_alerts',
        'fn_unlock_opura_document',
        'fn_vencimento_alerts',
        'fn_warranty_sla_sweep',
        'fpa_duplicate_budget_with_adjustment',
        'generate_hr_monthly_snapshot',
        'generate_monthly_investor_reports',
        'generate_payment_tasks',
        'generate_rental_renewal_alerts',
        'get_distinct_categories',
        'get_next_client_code',
        'get_next_company_code',
        'get_next_contract_number',
        'get_next_investor_code',
        'get_next_member_code',
        'get_next_nfe_invoice_code',
        'get_next_orcamento_code',
        'get_next_organization_code',
        'get_next_payment_account_code',
        'get_next_planejamento_code',
        'get_next_project_code',
        'get_next_supplier_code',
        'get_terrain_radius_statistics',
        'get_user_partner_workspaces',
        'get_workspaces_for_member',
        'hire_candidate',
        'imovib_unit_instance_org_check',
        'lock_area_version',
        'master_city_add',
        'replay_dead_letter',
        'rh_kpis',
        'sst_indicators',
        'supersede_area_version',
        'trigger_monthly_investor_report',
        'update_employee_rubrics',
        'upsert_employee_allocations',
        'upsert_profile',
        'validate_area_version'
    ];
BEGIN
    -- Varre por NOME e resolve a assinatura via pg_proc: assinatura copiada à
    -- mão é onde o REVOKE erra de alvo e passa despercebido. Cobre também os
    -- casos de sobrecarga (get_next_contract_number tem duas).
    FOR r IN
        SELECT p.oid::regprocedure AS assinatura
          FROM pg_proc p
          JOIN pg_namespace ns ON ns.oid = p.pronamespace
         WHERE ns.nspname = 'public'
           AND p.proname = ANY(alvos)
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon;',        r.assinatura);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC;',      r.assinatura);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated;', r.assinatura);
        n := n + 1;
    END LOOP;

    IF n = 0 THEN
        RAISE EXCEPTION 'ABORTADO: nenhuma das funcoes alvo foi encontrada.';
    END IF;

    -- Nome da lista que não existe no banco: não é erro fatal (a função pode
    -- ter sido removida), mas tem de APARECER — lista que envelhece em silêncio
    -- é lista que deixa de proteger sem ninguém notar.
    SELECT array_agg(a) INTO faltando
      FROM unnest(alvos) a
     WHERE NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
         WHERE ns.nspname = 'public' AND p.proname = a);

    RAISE NOTICE '>>> % funcao(oes) fechadas para anon.', n;
    IF faltando IS NOT NULL THEN
        RAISE NOTICE '>>> nao encontradas (confira a lista): %', faltando;
    END IF;
END $$;

-- ==========================================================================
-- Conferência
-- ==========================================================================
-- a. Nenhuma das alvo executável por anon:
-- SELECT p.proname,
--        has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_pode,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ok
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND p.prosecdef
--    AND has_function_privilege('anon', p.oid, 'EXECUTE')
--    AND p.prorettype <> 'pg_catalog.trigger'::regtype
--    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
--  ORDER BY 1;
--    -> esperado: SÓ funções de portal público e helpers de RLS
--
-- b. O vazamento provado deixou de existir:
-- BEGIN; SET LOCAL ROLE anon;
--   SELECT count(*) FROM public.get_workspaces_for_member('<email>');  -- 42501
-- ROLLBACK;
--
-- c. Os portais continuam de pé (NÃO foram tocados):
-- SELECT has_function_privilege('anon', 'public.fn_portal_get_planning(text)', 'EXECUTE');
--    -> esperado: t
-- ==========================================================================
-- FIM
-- ==========================================================================
