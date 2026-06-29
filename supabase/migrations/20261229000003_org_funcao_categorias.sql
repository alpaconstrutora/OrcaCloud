-- ============================================================
-- Categorias de Funções dinâmicas por empresa
-- Substitui o CHECK constraint estático de org_funcoes.categoria
-- por uma tabela gerenciável com CRUD.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.org_funcao_categorias (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    nome       TEXT NOT NULL,
    cor        TEXT NOT NULL DEFAULT 'slate',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_org_funcao_cat_company
    ON public.org_funcao_categorias(company_id);

-- Seed: cria as 5 categorias padrão para todas as empresas existentes
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.companies LOOP
    INSERT INTO public.org_funcao_categorias (company_id, nome, cor)
    VALUES
      (c.id, 'Operacional',    'orange'),
      (c.id, 'Técnica',        'blue'),
      (c.id, 'Administrativa', 'slate'),
      (c.id, 'Gerencial',      'indigo'),
      (c.id, 'Comercial',      'emerald')
    ON CONFLICT (company_id, nome) DO NOTHING;
  END LOOP;
END;
$$;

-- Adiciona FK em org_funcoes apontando para a nova tabela
-- (mantém coluna categoria TEXT existente por compatibilidade, mas adiciona categoria_id)
ALTER TABLE public.org_funcoes
    ADD COLUMN IF NOT EXISTS categoria_id UUID REFERENCES public.org_funcao_categorias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_org_funcoes_categoria_id
    ON public.org_funcoes(categoria_id) WHERE categoria_id IS NOT NULL;

-- Migra dados existentes: converte texto da coluna categoria para FK
UPDATE public.org_funcoes f
SET categoria_id = c.id
FROM public.org_funcao_categorias c
WHERE c.company_id = f.company_id
  AND lower(c.nome) = lower(CASE f.categoria
      WHEN 'operacional'    THEN 'Operacional'
      WHEN 'tecnica'        THEN 'Técnica'
      WHEN 'administrativa' THEN 'Administrativa'
      WHEN 'gerencial'      THEN 'Gerencial'
      WHEN 'comercial'      THEN 'Comercial'
      ELSE f.categoria
  END)
  AND f.categoria_id IS NULL;

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE public.org_funcao_categorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_funcao_cat_select" ON public.org_funcao_categorias;
CREATE POLICY "org_funcao_cat_select" ON public.org_funcao_categorias
    FOR SELECT TO authenticated
    USING (company_id IN (
        SELECT c.id FROM public.companies c WHERE public.is_org_member(c.org_id)
    ));

DROP POLICY IF EXISTS "org_funcao_cat_insert" ON public.org_funcao_categorias;
CREATE POLICY "org_funcao_cat_insert" ON public.org_funcao_categorias
    FOR INSERT TO authenticated
    WITH CHECK (company_id IN (
        SELECT c.id FROM public.companies c WHERE public.is_org_member(c.org_id)
    ));

DROP POLICY IF EXISTS "org_funcao_cat_update" ON public.org_funcao_categorias;
CREATE POLICY "org_funcao_cat_update" ON public.org_funcao_categorias
    FOR UPDATE TO authenticated
    USING (company_id IN (
        SELECT c.id FROM public.companies c WHERE public.is_org_member(c.org_id)
    ))
    WITH CHECK (company_id IN (
        SELECT c.id FROM public.companies c WHERE public.is_org_member(c.org_id)
    ));

DROP POLICY IF EXISTS "org_funcao_cat_delete" ON public.org_funcao_categorias;
CREATE POLICY "org_funcao_cat_delete" ON public.org_funcao_categorias
    FOR DELETE TO authenticated
    USING (company_id IN (
        SELECT c.id FROM public.companies c WHERE public.is_org_member(c.org_id)
    ));
