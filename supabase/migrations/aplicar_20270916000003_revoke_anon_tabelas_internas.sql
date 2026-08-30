-- ==========================================================================
-- Segurança · Tirar os GRANTs de `anon` das tabelas internas
-- Date: 2026-08-30
-- Altera: privilégios de 61 tabelas do schema public (nenhum DDL de estrutura)
-- Auditoria: docs/planos/2026-08-29-auditoria-rpc-anon.md
-- ==========================================================================
-- POR QUE ESTA MIGRATION EXISTE
--
-- A auditoria de 29/08 fechou as RPCs internas para `anon`, mas deixou de fora
-- os 16 helpers de RLS (`is_org_member`, `fiscal_member_of`, …) — revogá-los
-- trocaria "0 linhas" por erro 42501 em 61 tabelas, porque eles são avaliados
-- DENTRO das policies. O caminho certo, registrado lá como trabalho separado,
-- é este: tirar o GRANT de `anon` das tabelas. Sem GRANT, a policy nem chega a
-- ser avaliada — e aí o helper pode continuar aberto sem consequência.
--
-- O QUE FOI MEDIDO ANTES (curl anônimo de fora, não query no SQL Editor —
-- ver `project_views_expostas_anon`: a query roda como service role e passa por
-- cima de tudo):
--
--   · 57 das 61 devolvem 0 linhas para `anon` hoje. Revogar não muda o que se
--     enxerga; muda que deixa de haver UMA só linha de defesa.
--   · 4 devolvem dado: classification_rules (20), contract_index_values (26),
--     project_type_templates (7), structural_steel_catalog (8).
--     ⚠️ E o dado é 100% SEED DO SISTEMA: as quatro policies são
--     `(organization_id IS NULL) OR is_org_member(...)`, e a contagem confirmou
--     ZERO linha com dono em todas elas. Catálogo global, não dado de cliente —
--     mesma natureza de `cub_parametric_data`/`sinapi_items`. Não é vazamento
--     de tenant; é superfície que não precisa existir.
--
--   · `anon` tem hoje SELECT, INSERT **e DELETE** nas 61. O RLS é a única
--     defesa. Depois desta migration passam a ser duas.
--
-- POR QUE NÃO QUEBRA O APP
--
--   · `authenticated` tem GRANT **NOMINAL** nas 61 (conferido por `aclexplode`:
--     61/61). Revogar de `anon` não mexe nele.
--   · Nenhuma das 61 vem de `PUBLIC` (`via_public = 0`), então não há herança
--     escondida — o REVOKE nominal de `anon` basta e nada mais é tocado.
--   · Nenhuma é lida em contexto público: o grep das 61 em arquivos de portal/
--     login não achou nada, e o único acerto (`employees`, na Edge Function
--     labor-portal-ged-download) usa SUPABASE_SERVICE_ROLE_KEY, não a anon key.
--   · As 4 que devolvem seed são lidas por services internos e autenticados
--     (nfeService, contractIndexService, projectTypeTemplatesService,
--     structuralService).
--
-- ⚠️ APLICAR À MÃO — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

DO $$
DECLARE
    r        RECORD;
    n        INT := 0;
    sem_auth TEXT[] := '{}';
    faltando TEXT[] := '{}';
    alvos    TEXT[] := ARRAY[
        'classification_rules',
        'commercial_price_table_items',
        'commercial_price_tables',
        'communication_receipts',
        'contract_index_values',
        'contract_scope_templates',
        'contract_template_clauses',
        'contract_templates',
        'deal_credit_analysis',
        'document_templates',
        'employee_allocations',
        'employee_org_shares',
        'employees',
        'esocial_batch_events',
        'evidence_files',
        'extracted_documents',
        'incentive_rules',
        'labor_diary_workers',
        'nfe_invoice_items',
        'non_conformances',
        'oe_checklist_items',
        'oe_checklist_responses',
        'opura_electrical_boards',
        'opura_electrical_circuits',
        'opura_electrical_conduits',
        'opura_electrical_elements',
        'opura_electrical_plans',
        'opura_electrical_points',
        'opura_electrical_projects',
        'opura_electrical_rooms',
        'opura_electrical_takeoffs',
        'opura_electrical_versions',
        'opura_electrical_walls',
        'org_committee_members',
        'parsing_errors',
        'processing_jobs',
        'productivity_logs',
        'project_ops_config',
        'project_type_templates',
        'raw_documents',
        'rental_price_table_items',
        'rental_price_tables',
        'schedule_constraints',
        'service_clients',
        'sst_regulatory_docs',
        'structural_assemblies',
        'structural_elements',
        'structural_rebars',
        'structural_steel_catalog',
        'task_folders',
        'task_spaces',
        'task_statuses',
        'tasks',
        'team_members',
        'time_entries',
        'training_data',
        'vr_ajustes',
        'weekly_commitments',
        'work_logs',
        'work_order_status_log',
        'work_order_validations'
    ];
BEGIN
    -- GUARDA 1 — nenhuma tabela pode ficar sem `authenticated`.
    -- Revogar de `anon` numa tabela onde `authenticated` só enxerga via PUBLIC
    -- trancaria a tabela para o app inteiro. Aborta antes de tocar em nada.
    SELECT array_agg(c.relname ORDER BY c.relname) INTO sem_auth
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY(alvos)
       AND NOT EXISTS (
           SELECT 1 FROM aclexplode(COALESCE(c.relacl,'{}')) a
             JOIN pg_roles rr ON rr.oid = a.grantee
            WHERE rr.rolname = 'authenticated' AND a.privilege_type = 'SELECT');

    IF sem_auth IS NOT NULL THEN
        RAISE EXCEPTION 'ABORTADO: sem GRANT nominal de authenticated em: %', sem_auth;
    END IF;

    -- REVOKE ALL, não só SELECT: `anon` tem INSERT e DELETE nestas tabelas por
    -- default do Supabase. Quem não pode ler também não tem por que escrever.
    FOR r IN
        SELECT c.oid::regclass AS tab
          FROM pg_class c
          JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY(alvos)
    LOOP
        EXECUTE format('REVOKE ALL ON TABLE %s FROM anon;', r.tab);
        n := n + 1;
    END LOOP;

    IF n = 0 THEN
        RAISE EXCEPTION 'ABORTADO: nenhuma das tabelas alvo foi encontrada.';
    END IF;

    -- Nome que não existe mais: não é fatal, mas tem de aparecer — lista que
    -- envelhece em silêncio é lista que deixa de proteger sem ninguém notar.
    SELECT array_agg(a) INTO faltando
      FROM unnest(alvos) a
     WHERE NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relname = a);

    RAISE NOTICE '>>> % tabela(s) fechadas para anon.', n;
    IF faltando IS NOT NULL THEN
        RAISE NOTICE '>>> nao encontradas (confira a lista): %', faltando;
    END IF;
END $$;

-- ==========================================================================
-- Conferência — a prova é o curl ANÔNIMO, nunca a query daqui
-- ==========================================================================
-- a. As quatro que devolviam seed passam a recusar:
--    curl -s -D- -o /dev/null "$URL/rest/v1/classification_rules?select=*&limit=1" \
--         -H "apikey: $ANON_KEY"
--    -> esperado: HTTP 401/403 com 42501 (antes: 200 + Content-Range */20)
--
-- b. `authenticated` intacto:
--    SELECT count(*) FILTER (WHERE has_table_privilege('authenticated', c.oid, 'SELECT'))
--      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--     WHERE n.nspname='public' AND c.relname = ANY(<alvos>);
--    -> esperado: 61
--
-- c. O app logado continua funcionando (login + telas que usam estas tabelas).
-- ==========================================================================
-- FIM
-- ==========================================================================
