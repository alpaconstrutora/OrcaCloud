-- Extensão da Tabela de Rubricas para Motor de Fórmulas Controlado (PRD 34.1)

-- 1. Adicionar colunas de configuração de cálculo
ALTER TABLE public.rubrics ADD COLUMN IF NOT EXISTS calculation_type TEXT DEFAULT 'manual' CHECK (calculation_type IN ('manual', 'fixed', 'percentage', 'formula'));
ALTER TABLE public.rubrics ADD COLUMN IF NOT EXISTS calculation_config JSONB DEFAULT '{}'::jsonb;

-- 2. Atualizar rubricas padrão para o novo modelo
-- As rubricas fiscais permanecem 'manual' pois o motor tem lógica fixa para elas
UPDATE public.rubrics SET calculation_type = 'manual' WHERE calculation_type IS NULL;

-- 3. Exemplo de configuração para Adiantamento (Caso Real PRD 37)
INSERT INTO public.rubrics (code, name, type, calculation_type, calculation_config, active, is_automatic)
VALUES ('ADIANTAMENTO', 'Adiantamento Quinzenal', 'desconto', 'percentage', '{"base": "SALARIO", "percentage": 0.4}', true, true)
ON CONFLICT (code) DO UPDATE SET 
    calculation_type = EXCLUDED.calculation_type,
    calculation_config = EXCLUDED.calculation_config;

-- 4. Comentários para documentação
COMMENT ON COLUMN public.rubrics.calculation_type IS 'Tipo de cálculo: manual, fixed, percentage ou formula controlada';
COMMENT ON COLUMN public.rubrics.calculation_config IS 'Configuração JSON do cálculo (ex: { "base": "SALARIO", "percentage": 0.4 })';
