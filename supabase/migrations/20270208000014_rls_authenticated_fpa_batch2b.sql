-- ============================================================
-- Migration: 20270208000014_rls_authenticated_fpa_batch2b.sql
-- Projeto RLS camada AUTHENTICATED — LOTE 2b: FP&A (fpa_budgets/fpa_budget_lines).
-- Tabelas VAZIAS (0 linhas) — feature nascente; fecha o buraco qual=true
-- ("Allow all authenticated users to ...") preventivamente, risco nil.
--
-- Escopo: fpa_budgets via project_id → projects (org-scoped: is_org_member).
-- fpa_budget_lines encadeia via budget_id → fpa_budgets.
-- ⚠️ Caveat: se surgirem orçamentos a nível de EMPRESA (project_id NULL, só
--    empresa_id), a policy precisará de um ramo empresa→companies. Como a tabela
--    está vazia hoje, fica registrado para quando a feature for usada.
-- Consumidor interno único: fpaService. Sem código, sem dependência de ordem.
-- ============================================================

DROP POLICY IF EXISTS "Allow all authenticated users to insert fpa_budgets" ON public.fpa_budgets;
DROP POLICY IF EXISTS "Allow all authenticated users to read fpa_budgets" ON public.fpa_budgets;
DROP POLICY IF EXISTS "Allow all authenticated users to update fpa_budgets" ON public.fpa_budgets;

CREATE POLICY "fpa_budgets_via_project" ON public.fpa_budgets
  FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM public.projects))
  WITH CHECK (project_id IN (SELECT id FROM public.projects));

DROP POLICY IF EXISTS "Allow all authenticated users to insert fpa_budget_lines" ON public.fpa_budget_lines;
DROP POLICY IF EXISTS "Allow all authenticated users to read fpa_budget_lines" ON public.fpa_budget_lines;
DROP POLICY IF EXISTS "Allow all authenticated users to update fpa_budget_lines" ON public.fpa_budget_lines;

CREATE POLICY "fpa_budget_lines_via_budget" ON public.fpa_budget_lines
  FOR ALL TO authenticated
  USING (budget_id IN (SELECT id FROM public.fpa_budgets))
  WITH CHECK (budget_id IN (SELECT id FROM public.fpa_budgets));
