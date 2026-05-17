-- Create custom_databases table (organizes user-defined item databases)
CREATE TABLE IF NOT EXISTS public.custom_databases (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ
);

-- Ensure custom_items has the database_id foreign key column
ALTER TABLE public.custom_items
    ADD COLUMN IF NOT EXISTS database_id UUID REFERENCES public.custom_databases(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE public.custom_databases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_custom_databases"  ON public.custom_databases;
DROP POLICY IF EXISTS "authenticated_write_custom_databases" ON public.custom_databases;
DROP POLICY IF EXISTS "anon_all_custom_databases"            ON public.custom_databases;

CREATE POLICY "authenticated_read_custom_databases"
    ON public.custom_databases FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_write_custom_databases"
    ON public.custom_databases FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Dev: anon policy (remover antes de produção)
CREATE POLICY "anon_all_custom_databases"
    ON public.custom_databases FOR ALL TO anon USING (true) WITH CHECK (true);

-- Seed: cria "Minha Base Própria" se ainda não existe nenhum registro
INSERT INTO public.custom_databases (name, description)
SELECT 'Minha Base Própria', 'Base de composições e insumos personalizados'
WHERE NOT EXISTS (SELECT 1 FROM public.custom_databases);
