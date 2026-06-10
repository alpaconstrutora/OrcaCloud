-- Migração SQL: ÒPURA Offices (Fase 2)
-- Data: 09/06/2026

-- Adicionar a coluna comentario_cliente na tabela offices_especificacoes
ALTER TABLE public.offices_especificacoes 
ADD COLUMN IF NOT EXISTS comentario_cliente TEXT;

-- Recarregar cache do PostgREST
NOTIFY pgrst, 'reload schema';
