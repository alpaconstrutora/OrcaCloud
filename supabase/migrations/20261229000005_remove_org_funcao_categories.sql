-- Departamento substitui categorias no cadastro de funções.
-- Mantém a remoção idempotente para ambientes que ainda não aplicaram a migração de categorias.

ALTER TABLE public.org_funcoes
    DROP COLUMN IF EXISTS categoria_id,
    DROP COLUMN IF EXISTS categoria;

DROP TABLE IF EXISTS public.org_funcao_categorias;
