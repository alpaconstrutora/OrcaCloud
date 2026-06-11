-- Migração SQL: ÒPURA Measure AI (Módulo de Medição Inteligente)
-- Data: 11/06/2026

-- ==========================================
-- 1. TABELAS DO MÓDULO
-- ==========================================

-- Projetos de Medição
CREATE TABLE IF NOT EXISTS public.measure_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    orcamento_id UUID REFERENCES public.pro_orcamentos(id) ON DELETE SET NULL,
    nome TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN ('RASCUNHO', 'CONCLUIDO', 'ARQUIVADO')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Arquivos de Plantas (PDF, Imagens)
CREATE TABLE IF NOT EXISTS public.measure_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.measure_projects(id) ON DELETE CASCADE NOT NULL,
    nome TEXT NOT NULL,
    storage_path TEXT NOT NULL, -- Caminho do bucket de storage
    pages_count INTEGER DEFAULT 1 NOT NULL,
    current_page INTEGER DEFAULT 1 NOT NULL,
    scale NUMERIC(12, 6) DEFAULT NULL, -- pixels por metro
    width INTEGER,
    height INTEGER,
    metadata JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Camadas de Medição (Layers)
CREATE TABLE IF NOT EXISTS public.measure_layers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.measure_projects(id) ON DELETE CASCADE NOT NULL,
    nome TEXT NOT NULL,
    cor_hex TEXT DEFAULT '#3B82F6' NOT NULL,
    is_visible BOOLEAN DEFAULT TRUE NOT NULL,
    is_locked BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Biblioteca de Itens de Medição (Insumos / Serviços)
CREATE TABLE IF NOT EXISTS public.measure_library_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.measure_projects(id) ON DELETE CASCADE NOT NULL,
    nome TEXT NOT NULL,
    categoria TEXT, -- ex: 'Pintura', 'Piso', 'Estrutura'
    unidade TEXT NOT NULL CHECK (unidade IN ('M2', 'M', 'UN')),
    valor_unitario NUMERIC(15, 2) DEFAULT 0.00 NOT NULL,
    item_referencia_id UUID, -- Referência opcional de integração externa
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Desenhos/Formas Medidas (Shapes)
CREATE TABLE IF NOT EXISTS public.measure_shapes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES public.measure_files(id) ON DELETE CASCADE NOT NULL,
    layer_id UUID REFERENCES public.measure_layers(id) ON DELETE CASCADE NOT NULL,
    item_id UUID REFERENCES public.measure_library_items(id) ON DELETE SET NULL,
    page_number INTEGER DEFAULT 1 NOT NULL,
    nome_ambiente TEXT, -- ex: 'Sala', 'Banheiro'
    tipo TEXT NOT NULL CHECK (tipo IN ('POLYGON', 'LINE', 'POINT')),
    pontos JSONB NOT NULL, -- Coordenadas de tela [{"x": ..., "y": ...}]
    valor_calculado NUMERIC(12, 4) NOT NULL DEFAULT 0.0000, -- m², metros ou unidades
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- 2. ROW LEVEL SECURITY (RLS)
-- ==========================================

ALTER TABLE public.measure_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measure_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measure_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measure_library_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measure_shapes ENABLE ROW LEVEL SECURITY;

-- Políticas para usuários autenticados (Dono do dado)
DROP POLICY IF EXISTS "measure_projects_owner_access" ON public.measure_projects;
CREATE POLICY "measure_projects_owner_access" ON public.measure_projects
    FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "measure_files_owner_access" ON public.measure_files;
CREATE POLICY "measure_files_owner_access" ON public.measure_files
    FOR ALL TO authenticated USING (
        project_id IN (SELECT id FROM public.measure_projects WHERE user_id = auth.uid())
    ) WITH CHECK (
        project_id IN (SELECT id FROM public.measure_projects WHERE user_id = auth.uid())
    );

DROP POLICY IF EXISTS "measure_layers_owner_access" ON public.measure_layers;
CREATE POLICY "measure_layers_owner_access" ON public.measure_layers
    FOR ALL TO authenticated USING (
        project_id IN (SELECT id FROM public.measure_projects WHERE user_id = auth.uid())
    ) WITH CHECK (
        project_id IN (SELECT id FROM public.measure_projects WHERE user_id = auth.uid())
    );

DROP POLICY IF EXISTS "measure_library_items_owner_access" ON public.measure_library_items;
CREATE POLICY "measure_library_items_owner_access" ON public.measure_library_items
    FOR ALL TO authenticated USING (
        project_id IN (SELECT id FROM public.measure_projects WHERE user_id = auth.uid())
    ) WITH CHECK (
        project_id IN (SELECT id FROM public.measure_projects WHERE user_id = auth.uid())
    );

DROP POLICY IF EXISTS "measure_shapes_owner_access" ON public.measure_shapes;
CREATE POLICY "measure_shapes_owner_access" ON public.measure_shapes
    FOR ALL TO authenticated USING (
        file_id IN (SELECT id FROM public.measure_files WHERE project_id IN (SELECT id FROM public.measure_projects WHERE user_id = auth.uid()))
    ) WITH CHECK (
        file_id IN (SELECT id FROM public.measure_files WHERE project_id IN (SELECT id FROM public.measure_projects WHERE user_id = auth.uid()))
    );

-- ==========================================
-- 3. POLÍTICAS ANON PARA DESENVOLVIMENTO (REGRA 8)
-- ==========================================

DROP POLICY IF EXISTS "Allow anon all on measure_projects" ON public.measure_projects;
CREATE POLICY "Allow anon all on measure_projects" ON public.measure_projects FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on measure_files" ON public.measure_files;
CREATE POLICY "Allow anon all on measure_files" ON public.measure_files FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on measure_layers" ON public.measure_layers;
CREATE POLICY "Allow anon all on measure_layers" ON public.measure_layers FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on measure_library_items" ON public.measure_library_items;
CREATE POLICY "Allow anon all on measure_library_items" ON public.measure_library_items FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on measure_shapes" ON public.measure_shapes;
CREATE POLICY "Allow anon all on measure_shapes" ON public.measure_shapes FOR ALL TO anon USING (true) WITH CHECK (true);

-- ==========================================
-- 4. STORAGE BUCKET PARA AS PLANTAS
-- ==========================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('measure-plants', 'measure-plants', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de acesso ao bucket
DROP POLICY IF EXISTS "Allow read access to measure-plants for select" ON storage.objects;
CREATE POLICY "Allow read access to measure-plants for select"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'measure-plants');

DROP POLICY IF EXISTS "Allow authenticated insert to measure-plants" ON storage.objects;
CREATE POLICY "Allow authenticated insert to measure-plants"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'measure-plants');

DROP POLICY IF EXISTS "Allow authenticated update to measure-plants" ON storage.objects;
CREATE POLICY "Allow authenticated update to measure-plants"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'measure-plants');

DROP POLICY IF EXISTS "Allow authenticated delete to measure-plants" ON storage.objects;
CREATE POLICY "Allow authenticated delete to measure-plants"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'measure-plants');

-- Políticas anon do storage para ambiente dev
DROP POLICY IF EXISTS "Allow anon upload on measure-plants" ON storage.objects;
CREATE POLICY "Allow anon upload on measure-plants"
    ON storage.objects FOR INSERT
    TO anon
    WITH CHECK (bucket_id = 'measure-plants');

DROP POLICY IF EXISTS "Allow anon update on measure-plants" ON storage.objects;
CREATE POLICY "Allow anon update on measure-plants"
    ON storage.objects FOR UPDATE
    TO anon
    USING (bucket_id = 'measure-plants');

DROP POLICY IF EXISTS "Allow anon delete on measure-plants" ON storage.objects;
CREATE POLICY "Allow anon delete on measure-plants"
    ON storage.objects FOR DELETE
    TO anon
    USING (bucket_id = 'measure-plants');

-- ==========================================
-- 5. RECARREGAR CACHE
-- ==========================================
NOTIFY pgrst, 'reload schema';
