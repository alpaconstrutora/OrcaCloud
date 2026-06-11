-- Security fix: enable RLS on payroll_rubrics and payroll_fiscal_ranges
-- A migration 20260325184500 habilitou RLS em runs/items/results/events mas omitiu
-- estas duas tabelas de config global — mutáveis por qualquer usuário autenticado.
-- Política: SELECT para todos os autenticados; escrita restrita a admin/owner.

ALTER TABLE public.payroll_rubrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_rubrics_read"
ON public.payroll_rubrics
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "payroll_rubrics_write_admin"
ON public.payroll_rubrics
FOR ALL
USING (
    EXISTS (
        SELECT 1
        FROM public.organization_members
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'owner')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.organization_members
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'owner')
    )
);

ALTER TABLE public.payroll_fiscal_ranges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_fiscal_ranges_read"
ON public.payroll_fiscal_ranges
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "payroll_fiscal_ranges_write_admin"
ON public.payroll_fiscal_ranges
FOR ALL
USING (
    EXISTS (
        SELECT 1
        FROM public.organization_members
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'owner')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.organization_members
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'owner')
    )
);
