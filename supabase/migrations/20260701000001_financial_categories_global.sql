-- Torna financial_categories global (independente de organização)
ALTER TABLE public.financial_categories
    ALTER COLUMN organization_id DROP NOT NULL,
    ALTER COLUMN organization_id SET DEFAULT NULL;

-- Remove constraint única por org+nome e cria única global por nome
ALTER TABLE public.financial_categories
    DROP CONSTRAINT IF EXISTS financial_categories_organization_id_name_key;

ALTER TABLE public.financial_categories
    ADD CONSTRAINT financial_categories_name_key UNIQUE (name);

-- Atualiza RLS: qualquer autenticado pode ler e gerenciar
DROP POLICY IF EXISTS "Org members can manage financial_categories" ON public.financial_categories;

CREATE POLICY "Authenticated users can read financial_categories"
    ON public.financial_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage financial_categories"
    ON public.financial_categories FOR ALL TO authenticated
    USING (true) WITH CHECK (true);
