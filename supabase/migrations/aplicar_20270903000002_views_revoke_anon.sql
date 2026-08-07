-- ═════════════════════════════════════════════════════════════════════════════
-- FASE 1 — REVOKE `anon` nas 24 views de negócio expostas sem sessão
-- ═════════════════════════════════════════════════════════════════════════════
-- Plano: docs/planos/2026-08-06-views-expostas-anon.md
--
-- Descoberto em 2026-08-06 ao verificar a correção anterior: trancar
-- `internal_transactions` (aplicar_20270903000000) e `vw_receivables`
-- (aplicar_20270903000001) NÃO fechou o vazamento — `vw_fact_financial_tx`
-- devolvia as MESMAS 1.300 linhas por outra porta.
--
-- Duas causas somadas, em 26 views:
--   1. `anon` tem GRANT SELECT (default do Supabase);
--   2. `security_invoker = off` (default do Postgres) faz a view rodar como o
--      DONO, ignorando a RLS das tabelas base.
--
-- ESTA MIGRATION TRATA SÓ A (1). A (2) é a Fase 2 do plano e vai view a view,
-- porque ligar `security_invoker` numa agregação multi-tabela pode deixá-la
-- PARCIAL em silêncio — que é pior de detectar do que vazia.
--
-- POR QUE ESTA É SEGURA: `REVOKE FROM anon` não muda absolutamente nada para
-- usuário logado. Nenhuma das 24 é lida em contexto público — o levantamento
-- de consumidores está no plano; todas são chamadas por services do app
-- interno, e 9 não têm leitor nenhum no código.
--
-- ⚠️ `REVOKE FROM PUBLIC` NÃO BASTA: o Supabase mantém
-- `ALTER DEFAULT PRIVILEGES ... GRANT ... TO anon, authenticated` no schema
-- public, então `anon` recebe o privilégio diretamente. O REVOKE tem de ser
-- NOMINAL — lição de 20270840000001_vw_payables_revoke_anon.sql.
--
-- ⚠️ FORA DE ESCOPO: `geography_columns` e `geometry_columns` são catálogo da
-- extensão PostGIS. REVOKE nelas pode quebrar a extensão. Não entram.

SET lock_timeout = '5s';

DO $$
DECLARE
    v_view   TEXT;
    v_faltam TEXT[] := '{}';
    v_alvos  TEXT[] := ARRAY[
        -- sem leitor no código (risco zero)
        'dead_letter_queue',
        'retry_candidates',
        'vw_bi_commercial',
        'vw_bi_operational',
        'vw_bi_supply',
        'vw_fact_deal',
        'vw_fact_financial_tx',
        'vw_fact_purchase_order',
        'vw_intercompany_transactions',
        -- leitor interno único
        'pipeline_health',
        'vw_commercial_tax_payables',
        'vw_communication_read_rate',
        'vw_company_consolidated',
        'vw_esocial_status_panel',
        'vw_incentive_event_months',
        'vw_journal_entries',
        'tts_apuracao_view',
        -- agregação multi-tabela, leitor interno
        'vw_fpa_budget_vs_actual',
        'vw_fpa_cashflow_projection',
        'vw_hr_productivity_by_project',
        'vw_hr_retention_cohorts',
        'vw_hr_turnover_trend',
        'vw_project_cost_comparison',
        'vw_team_hourly_cost'
    ];
BEGIN
    -- Guarda: nome errado na lista passaria despercebido e a view seguiria
    -- aberta. Melhor abortar do que "aplicar" e deixar buraco.
    FOREACH v_view IN ARRAY v_alvos LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = v_view AND c.relkind = 'v'
        ) THEN
            v_faltam := array_append(v_faltam, v_view);
        END IF;
    END LOOP;

    IF array_length(v_faltam, 1) > 0 THEN
        RAISE EXCEPTION 'ABORTADO: view(s) inexistente(s) na lista: %. Corrija o nome — uma view que nao existe aqui e uma view que continua aberta la.',
            array_to_string(v_faltam, ', ');
    END IF;

    -- Idempotente: REVOKE do que já foi revogado é no-op.
    FOREACH v_view IN ARRAY v_alvos LOOP
        EXECUTE format('REVOKE ALL ON public.%I FROM anon',   v_view);
        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', v_view);
        EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_view);
    END LOOP;

    RAISE NOTICE 'OK: % views fechadas para anon.', array_length(v_alvos, 1);
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — conferir o efeito, não o arquivo
-- ═════════════════════════════════════════════════════════════════════════════
-- 1) Nenhuma view de negócio com anon_le = true (só as 2 do PostGIS podem sobrar):
--      SELECT c.relname,
--             EXISTS (SELECT 1 FROM information_schema.role_table_grants g
--                      WHERE g.table_schema='public' AND g.table_name=c.relname
--                        AND g.grantee='anon' AND g.privilege_type='SELECT') AS anon_le
--        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--       WHERE c.relkind='v' AND n.nspname='public' ORDER BY anon_le DESC;
--
-- 2) A prova que importa — FORA do SQL Editor, que roda como service role:
--      curl -s "$URL/rest/v1/vw_fact_financial_tx?select=id&limit=1" -H "apikey: $ANON"
--    Esperado: `42501 permission denied` (eram 1.300 linhas).
--
-- 3) Regressão COM sessão: FP&A, BI, RH (turnover/retenção/produtividade),
--    Operacional, Tributos a Pagar, Diário e o painel de e-Social continuam
--    listando. Esta fase não deveria mudar NADA para logado — se mudou,
--    algum caller está rodando sem sessão e isso é outro achado.
