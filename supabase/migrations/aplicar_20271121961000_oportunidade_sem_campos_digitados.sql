-- ==========================================================================
-- Oportunidade sem campos digitados e sem as tabelas duplicadas do estudo
-- ==========================================================================
-- Plano: docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, item 2.7.
--
-- APLICAR SÓ DEPOIS DO DEPLOY do código da Fase 2: o código anterior ainda lê estas colunas.
--
-- Saem de investor_opportunities as colunas que repetiam o estudo/empreendimento (números,
-- áreas, prazo, cenários, local, obra, captação digitada, riscos em texto, simulação):
-- a vitrine lê da versão do Imovib e do empreendimento (fn_oportunidade_na_vitrine).
-- Saem as tabelas da análise que agora mora no estudo: opportunity_risks (→ imovib_risks),
-- due_diligence_items + due_diligence_findings (→ imovib_land_checklist),
-- investor_opportunity_competitors (→ imovib_market_comparables).
-- target/current_funding_value: a captação real (SPE/aportes) é a Fase 4.
--
-- Guardas: PARA se houver dado que se perderia — número digitado em alguma oportunidade, linha
-- em alguma tabela, ou obra vinculada diferente da obra do empreendimento do estudo.
-- Em 21/11/2026: 1 oportunidade (Garden), todos os números NULL, obra = a do empreendimento;
-- 0 linhas nas quatro tabelas.
-- O bucket due-diligence-findings fica (a API de storage apaga; conferir 0 objetos antes).
--
-- REGRA #7: nenhuma policy nem função criada (as policies das tabelas saem com elas).
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter: recriar as colunas (tipos de 20261107000001/2 e 20261229000002) e as tabelas por
--   20270716000006/7 e 20261230000000 — sem os dados (não havia).

BEGIN;

DO $$
DECLARE v_n int;
BEGIN
    SELECT count(*) INTO v_n FROM public.investor_opportunities
    WHERE vgv IS NOT NULL OR roi_pct IS NOT NULL OR tir_pct IS NOT NULL OR cost_estimate IS NOT NULL
       OR cost_per_m2 IS NOT NULL OR duration_months IS NOT NULL OR land_area_m2 IS NOT NULL
       OR built_area_m2 IS NOT NULL OR floors IS NOT NULL OR target_funding_value IS NOT NULL
       OR current_funding_value IS NOT NULL OR jsonb_array_length(COALESCE(risks_json, '[]'::jsonb)) > 0;
    IF v_n > 0 THEN RAISE EXCEPTION '% oportunidade(s) com número digitado: revise antes de apagar as colunas.', v_n; END IF;

    SELECT count(*) INTO v_n FROM public.investor_opportunities o
    WHERE o.project_id IS NOT NULL AND o.project_id IS DISTINCT FROM (
        SELECT e.project_id FROM public.empreendimentos e
        WHERE e.imovib_study_id = o.imovib_study_id AND e.organization_id = o.organization_id
        ORDER BY e.created_at LIMIT 1);
    IF v_n > 0 THEN RAISE EXCEPTION '% oportunidade(s) com obra diferente da do empreendimento do estudo.', v_n; END IF;

    IF EXISTS (SELECT 1 FROM public.opportunity_risks) OR EXISTS (SELECT 1 FROM public.due_diligence_items)
       OR EXISTS (SELECT 1 FROM public.due_diligence_findings) OR EXISTS (SELECT 1 FROM public.investor_opportunity_competitors) THEN
        RAISE EXCEPTION 'Há linhas em opportunity_risks / due_diligence_* / investor_opportunity_competitors: migre antes.';
    END IF;
END $$;

ALTER TABLE public.investor_opportunities
    DROP COLUMN IF EXISTS vgv,
    DROP COLUMN IF EXISTS roi_pct,
    DROP COLUMN IF EXISTS tir_pct,
    DROP COLUMN IF EXISTS cost_estimate,
    DROP COLUMN IF EXISTS cost_per_m2,
    DROP COLUMN IF EXISTS duration_months,
    DROP COLUMN IF EXISTS land_area_m2,
    DROP COLUMN IF EXISTS built_area_m2,
    DROP COLUMN IF EXISTS floors,
    DROP COLUMN IF EXISTS expected_start,
    DROP COLUMN IF EXISTS location_city,
    DROP COLUMN IF EXISTS location_state,
    DROP COLUMN IF EXISTS project_id,
    DROP COLUMN IF EXISTS scenario_cost_cons_pct,
    DROP COLUMN IF EXISTS scenario_vgv_cons_pct,
    DROP COLUMN IF EXISTS scenario_cost_opt_pct,
    DROP COLUMN IF EXISTS scenario_vgv_opt_pct,
    DROP COLUMN IF EXISTS scenario_notes,
    DROP COLUMN IF EXISTS projected_yield,
    DROP COLUMN IF EXISTS risks_json,
    DROP COLUMN IF EXISTS simulation_params_json,
    DROP COLUMN IF EXISTS target_funding_value,
    DROP COLUMN IF EXISTS current_funding_value;

DROP TABLE IF EXISTS public.due_diligence_findings;
DROP TABLE IF EXISTS public.due_diligence_items;
DROP TABLE IF EXISTS public.opportunity_risks;
DROP TABLE IF EXISTS public.investor_opportunity_competitors;

COMMIT;
