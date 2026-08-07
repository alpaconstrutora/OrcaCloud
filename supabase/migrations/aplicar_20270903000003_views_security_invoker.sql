-- ═════════════════════════════════════════════════════════════════════════════
-- FASE 2 — `security_invoker = on` nas 24 views (fecha o cross-tenant)
-- ═════════════════════════════════════════════════════════════════════════════
-- Plano: docs/planos/2026-08-06-views-expostas-anon.md
--
-- A Fase 1 (aplicar_20270903000002) revogou `anon`. Isso fechou o acesso SEM
-- SESSÃO, e só isso. Estas views ainda rodam como o DONO e ignoram a RLS das
-- tabelas base, então qualquer usuário LOGADO lê dados de todas as
-- organizações.
--
-- NÃO É TEÓRICO — medido em 2026-08-07 com uma conta real (`agente-leitura`,
-- membro de UMA organização), consultando pela API com o token dela:
--
--   vw_fact_financial_tx        1.300 linhas de 3 orgs (2 alheias)
--   vw_hr_turnover_trend           24 linhas de 2 orgs — metade alheia
--   vw_company_consolidated         3 empresas de 3 orgs (2 alheias)
--   vw_fpa_cashflow_projection    558 linhas de 2 orgs
--   vw_project_cost_comparison      6 projetos, dos quais só 4 sao visiveis
--                                   em `projects` sob RLS
--
-- ⚠️ O RISCO desta fase não é a view esvaziar — é ficar PARCIAL em silêncio.
-- Por isso a tabela de previsão abaixo foi medida ANTES, contando quantas
-- linhas pertencem à organização do usuário de teste. Se o número pós-aplicação
-- não bater com a coluna PREVISTO, alguma tabela base tem RLS cortando demais.
--
-- ┌──────────────────────────────┬────────┬──────────┐
-- │ view                         │  hoje  │ previsto │
-- ├──────────────────────────────┼────────┼──────────┤
-- │ vw_fact_financial_tx         │  1300  │   1238   │
-- │ vw_fpa_cashflow_projection   │   558  │    551   │
-- │ vw_hr_turnover_trend         │    24  │     12   │
-- │ vw_fact_deal                 │    13  │      8   │
-- │ vw_hr_retention_cohorts      │     6  │      3   │
-- │ vw_bi_operational            │     3  │      1   │
-- │ vw_company_consolidated      │     3  │      1   │
-- │ vw_bi_commercial             │     2  │      1   │
-- ├──────────────────────────────┼────────┼──────────┤
-- │ vw_commercial_tax_payables   │   108  │    108   │  ← sem mudança:
-- │ vw_fact_purchase_order       │    18  │     18   │    dados de uma
-- │ dead_letter_queue            │    15  │     15   │    organização só
-- │ vw_journal_entries           │     3  │      3   │
-- │ pipeline_health              │     1  │      1   │
-- │ vw_bi_supply                 │     1  │      1   │
-- └──────────────────────────────┴────────┴──────────┘
--   As 9 restantes estão vazias hoje (0 linhas) — nada a regredir, mas entram
--   para não nascerem abertas quando o módulo delas for usado.
--
-- NENHUMA ZERA. Foi essa medição que autorizou aplicar tudo de uma vez em vez
-- de ir view a view.
--
-- ⚠️ Só altera a opção — não faz DROP/CREATE, então não há risco de perder a
-- definição da view (o alerta de parte4_vw_payables_property.sql).

SET lock_timeout = '5s';

DO $$
DECLARE
    v_view   TEXT;
    v_faltam TEXT[] := '{}';
    v_alvos  TEXT[] := ARRAY[
        'dead_letter_queue', 'retry_candidates', 'vw_bi_commercial',
        'vw_bi_operational', 'vw_bi_supply', 'vw_fact_deal',
        'vw_fact_financial_tx', 'vw_fact_purchase_order',
        'vw_intercompany_transactions', 'pipeline_health',
        'vw_commercial_tax_payables', 'vw_communication_read_rate',
        'vw_company_consolidated', 'vw_esocial_status_panel',
        'vw_incentive_event_months', 'vw_journal_entries', 'tts_apuracao_view',
        'vw_fpa_budget_vs_actual', 'vw_fpa_cashflow_projection',
        'vw_hr_productivity_by_project', 'vw_hr_retention_cohorts',
        'vw_hr_turnover_trend', 'vw_project_cost_comparison',
        'vw_team_hourly_cost'
    ];
BEGIN
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
        RAISE EXCEPTION 'ABORTADO: view(s) inexistente(s): %. Nome errado aqui = view que continua vazando la.',
            array_to_string(v_faltam, ', ');
    END IF;

    -- Idempotente: ligar o que já está ligado é no-op.
    FOREACH v_view IN ARRAY v_alvos LOOP
        EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', v_view);
    END LOOP;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═════════════════════════════════════════════════════════════════════════════
-- 1) Nenhuma view do schema com security_invoker off:
--      SELECT c.relname,
--             COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions)
--                        WHERE option_name='security_invoker'), 'off') AS si
--        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--       WHERE c.relkind='v' AND n.nspname='public' ORDER BY si, 1;
--
-- 2) A que importa — contagem COM SESSÃO, comparada à tabela PREVISTO acima:
--      bash scripts/verificar-views-anon.sh '<senha>'
--    Bate com PREVISTO  → cross-tenant fechado, nada quebrado.
--    Menor que PREVISTO → RLS de alguma tabela base corta demais. Reverter a
--                         view especifica com SET (security_invoker = off) e
--                         investigar a policy da BASE, nao da view.
--
-- 3) Reversão de UMA view, se precisar:
--      ALTER VIEW public.<nome> SET (security_invoker = off);
