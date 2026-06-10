-- Migração SQL: ÒPURA Reformas (MVP)
-- Data: 09/06/2026

-- ==========================================
-- 1. TABELA DE PROJETOS DE REFORMA
-- ==========================================
CREATE TABLE IF NOT EXISTS public.reformas_projetos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    nome_cliente TEXT NOT NULL,
    endereco TEXT,
    data_inicio DATE DEFAULT CURRENT_DATE NOT NULL,
    data_fim DATE,
    status TEXT DEFAULT 'EM_ANDAMENTO' CHECK (status IN ('PLANEJAMENTO', 'EM_ANDAMENTO', 'FINALIZADO')),
    orcamento_total NUMERIC DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==========================================
-- 2. TABELA DE DIÁRIOS DE REFORMA (MULTIMODAL)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.reformas_diarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    reforma_id UUID REFERENCES public.reformas_projetos(id) ON DELETE CASCADE NOT NULL,
    data_registro DATE DEFAULT CURRENT_DATE NOT NULL,
    resumo_markdown TEXT NOT NULL,
    fotos_urls TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    audio_transcrito TEXT,
    clima TEXT DEFAULT 'Ensolarado' NOT NULL,
    temperatura TEXT DEFAULT '24°C' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==========================================
-- 3. TABELA DE CRONOGRAMA / TAREFAS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.reformas_cronograma (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    reforma_id UUID REFERENCES public.reformas_projetos(id) ON DELETE CASCADE NOT NULL,
    tarefa TEXT NOT NULL,
    responsavel TEXT,
    data_limite DATE,
    status TEXT DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==========================================
-- RLS - ROW LEVEL SECURITY & POLICIES
-- ==========================================

-- Habilitar RLS nas tabelas
ALTER TABLE public.reformas_projetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reformas_diarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reformas_cronograma ENABLE ROW LEVEL SECURITY;

-- 1. Políticas para reformas_projetos
CREATE POLICY "Enable all access for owners" ON public.reformas_projetos
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable all for anon in dev" ON public.reformas_projetos
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

-- 2. Políticas para reformas_diarios
CREATE POLICY "Enable all access for owners" ON public.reformas_diarios
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable all for anon in dev" ON public.reformas_diarios
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

-- 3. Políticas para reformas_cronograma
CREATE POLICY "Enable all access for owners" ON public.reformas_cronograma
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable all for anon in dev" ON public.reformas_cronograma
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

-- Recarregar cache do PostgREST
NOTIFY pgrst, 'reload schema';
