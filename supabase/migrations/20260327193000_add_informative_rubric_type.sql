-- Atualização de tipos de rubrica para incluir 'informativa'

-- 1. Remover restrição antiga e adicionar nova na tabela rubrics
ALTER TABLE public.rubrics DROP CONSTRAINT IF EXISTS rubrics_type_check;
ALTER TABLE public.rubrics ADD CONSTRAINT rubrics_type_check CHECK (type IN ('provento', 'desconto', 'encargo', 'informativa'));

-- 2. Atualizar tabela de itens de folha (payroll_items)
ALTER TABLE public.payroll_items DROP CONSTRAINT IF EXISTS payroll_items_type_check;
ALTER TABLE public.payroll_items ADD CONSTRAINT payroll_items_type_check CHECK (type IN ('provento', 'desconto', 'encargo', 'informativa'));

-- 3. Notificar o PostgREST para recarregar o schema
NOTIFY pgrst, 'reload schema';
