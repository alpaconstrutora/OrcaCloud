-- ============================================================
-- Fix: Rubricas ausentes que o payrollEngine usa mas não
--      estavam no seed, causando itens órfãos em payroll_items
--      e FK violation potencial em payroll_events.
-- ============================================================

-- 1. Adicionar rubricas que o engine usa mas não estavam cadastradas

INSERT INTO public.rubrics (code, name, type, incidence_inss, incidence_fgts, incidence_irrf, is_automatic, category)
VALUES
  -- Dedução da 1ª parcela do 13º na 2ª parcela
  -- Não incide tributos: apenas reduz o líquido (INSS/IRRF já foram calculados na parcela certa)
  ('DESC_ADIANT_13', 'Dedução 1ª Parcela 13º Salário', 'desconto', false, false, false, true,  'thirteenth'),

  -- Fallback para eventos manuais de desconto/informativa sem rubric_code selecionada
  ('OUTROS',         'Outros Descontos',                'desconto', false, false, false, false, 'variable'),

  -- Multa rescisória — estava no seed original mas pode não estar em todos os ambientes
  ('FGTS_MULTA',     'Multa FGTS 40%',                  'encargo',  false, false, false, true,  'termination')

ON CONFLICT (code) DO NOTHING;

-- 2. Adicionar FK em payroll_items.code → rubrics.code
--    NOT VALID: aplica apenas a inserções novas, não valida linhas históricas.
--    Para validar retroativamente (quando dados estiverem limpos):
--      ALTER TABLE public.payroll_items VALIDATE CONSTRAINT fk_payroll_items_rubric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_payroll_items_rubric'
      AND table_name      = 'payroll_items'
      AND table_schema    = 'public'
  ) THEN
    ALTER TABLE public.payroll_items
      ADD CONSTRAINT fk_payroll_items_rubric
      FOREIGN KEY (code) REFERENCES public.rubrics(code)
      NOT VALID;
  END IF;
END $$;

-- 3. Recarregar cache do PostgREST
NOTIFY pgrst, 'reload schema';
