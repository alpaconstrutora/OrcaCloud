-- Fase 2: campos de cenários de viabilidade em investor_opportunities
-- Cálculo é client-side; banco só armazena os parâmetros de variação
-- Date: 2026-11-07

ALTER TABLE public.investor_opportunities
    ADD COLUMN IF NOT EXISTS duration_months              integer,
    ADD COLUMN IF NOT EXISTS scenario_cost_cons_pct       numeric,  -- custo sobe X% no conservador
    ADD COLUMN IF NOT EXISTS scenario_vgv_cons_pct        numeric,  -- vgv cai X% no conservador
    ADD COLUMN IF NOT EXISTS scenario_cost_opt_pct        numeric,  -- custo cai X% no otimista
    ADD COLUMN IF NOT EXISTS scenario_vgv_opt_pct         numeric,  -- vgv sobe X% no otimista
    ADD COLUMN IF NOT EXISTS scenario_notes               text;     -- observações/premissas livres
