-- Adiciona colunas de base de cálculo na tabela payroll_results para suportar o abatimento de faltas
ALTER TABLE public.payroll_results 
ADD COLUMN IF NOT EXISTS base_inss NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS base_fgts NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS base_irrf NUMERIC(15,2);

-- Adiciona comentários para melhor identificação no banco
COMMENT ON COLUMN public.payroll_results.base_inss IS 'Base de cálculo do INSS após abatimentos de faltas/descontos';
COMMENT ON COLUMN public.payroll_results.base_fgts IS 'Base de cálculo do FGTS após abatimentos de faltas/descontos';
COMMENT ON COLUMN public.payroll_results.base_irrf IS 'Base de cálculo do IRRF após abatimentos de faltas/descontos';
