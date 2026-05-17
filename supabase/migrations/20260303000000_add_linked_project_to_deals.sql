-- Adiciona o campo de projeto vinculado Ã  tabela de negÃ³cios comerciais
ALTER TABLE public.commercial_deals
ADD COLUMN IF NOT EXISTS linked_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

-- Criar Ã­ndice para melhorar a performance de consultas que buscam negÃ³cios por projeto
CREATE INDEX IF NOT EXISTS idx_commercial_deals_linked_project ON public.commercial_deals(linked_project_id);
