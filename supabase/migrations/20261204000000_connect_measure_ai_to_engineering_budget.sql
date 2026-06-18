-- Migração SQL: Conexão da Medição Inteligente (Measure AI) com Engenharia - Orçamento (projects)
-- Data: 16/06/2026 (Nome do arquivo ajustado para o final da fila de migrações: 20261204000000)

-- Adicionar coluna de vínculo à obra principal
ALTER TABLE public.measure_projects 
ADD COLUMN IF NOT EXISTS associated_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

-- Recarregar cache de esquema do PostgREST
NOTIFY pgrst, 'reload schema';
