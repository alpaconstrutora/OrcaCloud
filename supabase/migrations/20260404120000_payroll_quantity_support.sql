-- Migração: Suporte a Cálculo por Quantidade (Dias/Horas)
-- Adiciona colunas necessárias para persistir a unidade e quantidade dos eventos manuais

-- 1. Atualizar payroll_events
ALTER TABLE public.payroll_events ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'fixed' CHECK (unit IN ('fixed', 'days', 'hours'));
ALTER TABLE public.payroll_events ADD COLUMN IF NOT EXISTS quantity NUMERIC DEFAULT 0;

-- 2. Atualizar payroll_items para suportar referências formatadas (ex: "10,00 h")
-- Alteramos para TEXT para permitir flexibilidade de exibição no Holerite
ALTER TABLE public.payroll_items ALTER COLUMN reference TYPE TEXT;

-- 3. Comentários
COMMENT ON COLUMN public.payroll_events.unit IS 'Unidade de medida do evento: fixed (R$), days (Dias), hours (Horas)';
COMMENT ON COLUMN public.payroll_events.quantity IS 'Quantidade informada para o cálculo automático';
