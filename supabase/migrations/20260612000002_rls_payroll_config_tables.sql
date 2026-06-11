-- Security fix: enable RLS on payroll_rubrics and payroll_fiscal_ranges
-- A migration 20260325184500 habilitou RLS em runs/items/results/events mas omitiu
-- estas duas tabelas de config global — mutáveis por qualquer usuário autenticado.
-- Política: SELECT para todos os autenticados; escrita restrita a admin/owner.
-- Guarda-chuva: só aplica se as tabelas existirem (módulo pode não estar no remote ainda).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payroll_rubrics'
  ) THEN
    ALTER TABLE public.payroll_rubrics ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "payroll_rubrics_read" ON public.payroll_rubrics;
    CREATE POLICY "payroll_rubrics_read"
      ON public.payroll_rubrics FOR SELECT TO authenticated USING (true);

    DROP POLICY IF EXISTS "payroll_rubrics_write_admin" ON public.payroll_rubrics;
    CREATE POLICY "payroll_rubrics_write_admin"
      ON public.payroll_rubrics FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.organization_members
          WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.organization_members
          WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
        )
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payroll_fiscal_ranges'
  ) THEN
    ALTER TABLE public.payroll_fiscal_ranges ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "payroll_fiscal_ranges_read" ON public.payroll_fiscal_ranges;
    CREATE POLICY "payroll_fiscal_ranges_read"
      ON public.payroll_fiscal_ranges FOR SELECT TO authenticated USING (true);

    DROP POLICY IF EXISTS "payroll_fiscal_ranges_write_admin" ON public.payroll_fiscal_ranges;
    CREATE POLICY "payroll_fiscal_ranges_write_admin"
      ON public.payroll_fiscal_ranges FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.organization_members
          WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.organization_members
          WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
        )
      );
  END IF;
END;
$$;
