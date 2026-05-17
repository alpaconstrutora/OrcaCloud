-- Migração: Adicionar coluna origin à tabela payroll_items
-- Esta coluna foi omitida em migrações anteriores mas é utilizada no código do motor de cálculo.

ALTER TABLE public.payroll_items ADD COLUMN IF NOT EXISTS origin TEXT;

-- Comentário para documentação
COMMENT ON COLUMN public.payroll_items.origin IS 'Origem do item: automatic, manual ou recurrent';
