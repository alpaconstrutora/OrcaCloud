-- ============================================================
-- PRD ADITIVO: EVOLUÇÃO DO MÓDULO DE FOLHA
-- ============================================================

-- 1. Nova Tabela de Rubricas (PRD 3.3)
CREATE TABLE IF NOT EXISTS public.rubrics (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('provento', 'desconto', 'encargo')),
  incidence_inss BOOLEAN DEFAULT false,
  incidence_fgts BOOLEAN DEFAULT false,
  incidence_irrf BOOLEAN DEFAULT false,
  is_automatic BOOLEAN DEFAULT false,
  category TEXT,
  formula TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Extensão de payroll_events (PRD 3.2)
ALTER TABLE public.payroll_events ADD COLUMN IF NOT EXISTS rubric_code TEXT REFERENCES public.rubrics(code);
ALTER TABLE public.payroll_events ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;
ALTER TABLE public.payroll_events ADD COLUMN IF NOT EXISTS origin TEXT;

-- 3. Extensão de payroll_items (PRD 3.4)
ALTER TABLE public.payroll_items ADD COLUMN IF NOT EXISTS reference NUMERIC;

-- 4. Seed de Rubricas Base (PRD 4.3)
INSERT INTO public.rubrics (code, name, type, incidence_inss, incidence_fgts, incidence_irrf, is_automatic, category) 
VALUES
('SALARIO', 'Salário Base', 'provento', true, true, true, true, 'base'),
('HE50', 'Hora Extra 50%', 'provento', true, true, true, false, 'overtime'),
('HE100', 'Hora Extra 100%', 'provento', true, true, true, false, 'overtime'),
('AD_NOTURNO', 'Adicional Noturno', 'provento', true, true, true, false, 'overtime'),
('FERIAS', 'Férias Gozadas', 'provento', true, true, true, true, 'vacation'),
('FERIAS_TERCO', '1/3 Constitucional de Férias', 'provento', true, true, true, true, 'vacation'),
('DECIMO', '13º Salário', 'provento', true, true, true, true, 'thirteenth'),
('SALDO_SALARIO', 'Saldo de Salário', 'provento', true, true, true, true, 'termination'),
('BONUS', 'Bônus / Premiação', 'provento', true, true, true, false, 'variable'),
('INSS', 'Desconto INSS', 'desconto', false, false, false, true, 'tax'),
('IRRF', 'Desconto IRRF', 'desconto', false, false, false, true, 'tax'),
('FGTS', 'FGTS (Encargo)', 'encargo', false, false, false, true, 'tax'),
('FGTS_MULTA', 'Multa FGTS 40%', 'encargo', false, false, false, true, 'termination')
ON CONFLICT (code) DO UPDATE SET 
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  incidence_inss = EXCLUDED.incidence_inss,
  incidence_fgts = EXCLUDED.incidence_fgts,
  incidence_irrf = EXCLUDED.incidence_irrf,
  category = EXCLUDED.category;

-- 5. Segurança
ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rubrics_read_all" ON public.rubrics;
CREATE POLICY "rubrics_read_all" ON public.rubrics FOR SELECT USING (true);

-- 6. Comentários para documentação
COMMENT ON TABLE public.rubrics IS 'Tabela mestra de rubricas da folha de pagamento (proventos, descontos e encargos)';
COMMENT ON COLUMN public.payroll_events.rubric_code IS 'Referência à rubrica oficial vinculada ao evento';
