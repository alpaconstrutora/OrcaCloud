-- Migração SQL: ÒPURA Offices (Fase 1)
-- Data: 08/06/2026

-- ==========================================
-- 1. TABELA DE LEADS (CRM & BRIEFING)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.offices_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    nome_cliente TEXT NOT NULL,
    contato TEXT,
    briefing TEXT,
    valor_estimado NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'BRIEFING' CHECK (status IN ('BRIEFING', 'PROPOSTA', 'CONTRATADO', 'PERDIDO')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==========================================
-- 2. TABELA DE ESPECIFICAÇÕES (MOBILIÁRIO E ACABAMENTO)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.offices_especificacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    projeto_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    ambiente TEXT NOT NULL,
    item_nome TEXT NOT NULL,
    fabricante_fornecedor TEXT,
    quantidade INTEGER DEFAULT 1 NOT NULL,
    preco_unitario NUMERIC DEFAULT 0 NOT NULL,
    foto_url TEXT,
    status_aprovacao TEXT DEFAULT 'PENDENTE' CHECK (status_aprovacao IN ('PENDENTE', 'APROVADO', 'RECUSADO')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==========================================
-- 3. TABELA DE TIMESHEET (LANCAMENTO DE HORAS)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.offices_timesheet (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    projeto_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    horas NUMERIC DEFAULT 0 NOT NULL,
    descricao_atividade TEXT,
    data_lancamento DATE DEFAULT CURRENT_DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==========================================
-- RLS - ROW LEVEL SECURITY & POLICIES
-- ==========================================

-- Habilitar RLS nas tabelas
ALTER TABLE public.offices_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offices_especificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offices_timesheet ENABLE ROW LEVEL SECURITY;

-- 1. Políticas para offices_leads
DROP POLICY IF EXISTS "Enable all access for owners" ON public.offices_leads;
CREATE POLICY "Enable all access for owners" ON public.offices_leads
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Enable all for anon in dev" ON public.offices_leads;
CREATE POLICY "Enable all for anon in dev" ON public.offices_leads
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

-- 2. Políticas para offices_especificacoes
DROP POLICY IF EXISTS "Enable all access for owners" ON public.offices_especificacoes;
CREATE POLICY "Enable all access for owners" ON public.offices_especificacoes
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Enable all for anon in dev" ON public.offices_especificacoes;
CREATE POLICY "Enable all for anon in dev" ON public.offices_especificacoes
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

-- 3. Políticas para offices_timesheet
DROP POLICY IF EXISTS "Enable all access for owners" ON public.offices_timesheet;
CREATE POLICY "Enable all access for owners" ON public.offices_timesheet
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Enable all for anon in dev" ON public.offices_timesheet;
CREATE POLICY "Enable all for anon in dev" ON public.offices_timesheet
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

-- Atualizar Schema no Supabase
NOTIFY pgrst, 'reload schema';
