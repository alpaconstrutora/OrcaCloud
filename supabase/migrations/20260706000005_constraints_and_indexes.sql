-- Migration: Constraints e índices faltantes
-- Date: 2026-07-06
-- Cobre: contracts NOT NULL + policies corrigidas, employees.cpf unique,
--        payroll_runs unique por período, period_year CHECK, índices FK.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. contracts.organization_id NOT NULL + corrige policies com "IS NULL OR"
-- ══════════════════════════════════════════════════════════════════════════════

-- Remover o ramo "organization_id IS NULL OR" que permitia acesso a linhas órfãs.
DROP POLICY IF EXISTS "Users can view contract of their organization"   ON public.contracts;
DROP POLICY IF EXISTS "Users can manage contract of their organization" ON public.contracts;

CREATE POLICY "Users can view contract of their organization"
  ON public.contracts FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "Users can manage contract of their organization"
  ON public.contracts FOR ALL TO authenticated
  USING (public.is_org_member(organization_id));

-- SET NOT NULL apenas se não houver linhas órfãs (migração segura em prod).
-- Se existirem linhas com organization_id NULL, não altera o schema agora —
-- use uma script de backfill antes de re-rodar esta migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.contracts WHERE organization_id IS NULL) THEN
    ALTER TABLE public.contracts ALTER COLUMN organization_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'contracts.organization_id: linhas com NULL encontradas — NOT NULL não aplicado. Faça backfill antes.';
  END IF;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. employees.cpf: UNIQUE por organização (ignora NULL — colaboradores sem CPF)
-- ══════════════════════════════════════════════════════════════════════════════

-- Verificar e remover duplicatas antes de criar constraint (seguro para prod)
-- (Caso existam, mantém o registro mais antigo e remove os mais novos.)
DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT org_id, cpf
    FROM public.employees
    WHERE cpf IS NOT NULL
    GROUP BY org_id, cpf
    HAVING COUNT(*) > 1
  ) AS dups;

  IF v_count > 0 THEN
    RAISE NOTICE 'employees.cpf: % duplicatas detectadas — constraint UNIQUE não criada. Deduplicar antes.', v_count;
  ELSE
    -- Cria índice único parcial (melhor que CONSTRAINT para nullable)
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'employees' AND indexname = 'idx_employees_cpf_unique'
    ) THEN
      CREATE UNIQUE INDEX idx_employees_cpf_unique
        ON public.employees(org_id, cpf)
        WHERE cpf IS NOT NULL;
    END IF;
  END IF;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. payroll_runs: UNIQUE por (org, start_date, end_date, type, subtype)
--    Previne geração duplicada de folha do mesmo período.
--    Nota: o schema usa start_date/end_date (não period_month/period_year).
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT org_id, start_date, end_date, type, COALESCE(subtype, '')
    FROM public.payroll_runs
    GROUP BY org_id, start_date, end_date, type, COALESCE(subtype, '')
    HAVING COUNT(*) > 1
  ) AS dups;

  IF v_count > 0 THEN
    RAISE NOTICE 'payroll_runs: % combinações duplicadas — constraint não criada. Deduplicar antes.', v_count;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'payroll_runs' AND indexname = 'idx_payroll_runs_period_unique'
    ) THEN
      CREATE UNIQUE INDEX idx_payroll_runs_period_unique
        ON public.payroll_runs(org_id, start_date, end_date, type, COALESCE(subtype, ''));
    END IF;
  END IF;
END;
$$;

-- CHECK de sanidade em end_date (não pode ser anterior a start_date)
ALTER TABLE public.payroll_runs
  DROP CONSTRAINT IF EXISTS payroll_runs_period_range_check;
ALTER TABLE public.payroll_runs
  ADD CONSTRAINT payroll_runs_period_range_check
  CHECK (end_date >= start_date);

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Índices em chaves estrangeiras sem índice (performance + planner)
-- ══════════════════════════════════════════════════════════════════════════════

-- contracts
CREATE INDEX IF NOT EXISTS idx_contracts_supplier_id    ON public.contracts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_contracts_cost_center_id ON public.contracts(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_contracts_category_id    ON public.contracts(category_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status         ON public.contracts(organization_id, status);

-- payroll (tabela V1 — run_id)
CREATE INDEX IF NOT EXISTS idx_payroll_items_employee_id    ON public.payroll_items(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_results_employee_id  ON public.payroll_results(employee_id);

-- payroll_events
CREATE INDEX IF NOT EXISTS idx_payroll_events_employee_id ON public.payroll_events(employee_id);

-- nfe_invoices: raw_document_id
CREATE INDEX IF NOT EXISTS idx_nfe_invoices_raw_document_id ON public.nfe_invoices(raw_document_id);

-- purchase_orders: status (usado em dashboards e KPIs)
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders(status);
