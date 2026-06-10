-- Migração SQL: ÒPURA Pro Standalone (Fase 1)
-- Data: 08/06/2026

CREATE TABLE IF NOT EXISTS public.pro_clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    telefone TEXT NOT NULL,
    endereco TEXT,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pro_orcamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    cliente_id UUID NOT NULL REFERENCES public.pro_clientes(id) ON DELETE CASCADE,
    descricao TEXT NOT NULL,
    valor NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    fotos TEXT[] DEFAULT '{}'::TEXT[],
    observacoes TEXT,
    validade_dias INTEGER NOT NULL DEFAULT 15,
    garantia_dias INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN ('RASCUNHO', 'ENVIADO', 'APROVADO', 'RECUSADO')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pro_servicos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    orcamento_id UUID NOT NULL REFERENCES public.pro_orcamentos(id) ON DELETE CASCADE,
    checklist JSONB DEFAULT '[]'::JSONB,
    fotos_antes TEXT[] DEFAULT '{}'::TEXT[],
    fotos_depois TEXT[] DEFAULT '{}'::TEXT[],
    assinatura_nome TEXT,
    assinatura_data TIMESTAMPTZ,
    assinatura_imagem TEXT, -- Armazena a assinatura em formato Base64 ou URL pública
    status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO', 'BLOQUEADO')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pro_config (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    pix_key TEXT,
    pix_key_type TEXT, -- 'CPF', 'CNPJ', 'EMAIL', 'CELULAR', 'ALEATORIA'
    template_header TEXT,
    template_footer TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) & POLÍTICAS
-- ==========================================

-- 1. Habilitando RLS
ALTER TABLE public.pro_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pro_orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pro_servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pro_config ENABLE ROW LEVEL SECURITY;

-- 2. Políticas de Usuário Autenticado (Segurança de Produção)
DROP POLICY IF EXISTS "pro_clientes_user_access" ON public.pro_clientes;
CREATE POLICY "pro_clientes_user_access" ON public.pro_clientes
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "pro_orcamentos_user_access" ON public.pro_orcamentos;
CREATE POLICY "pro_orcamentos_user_access" ON public.pro_orcamentos
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "pro_servicos_user_access" ON public.pro_servicos;
CREATE POLICY "pro_servicos_user_access" ON public.pro_servicos
    FOR ALL TO authenticated
    USING (orcamento_id IN (SELECT id FROM public.pro_orcamentos WHERE user_id = auth.uid()))
    WITH CHECK (orcamento_id IN (SELECT id FROM public.pro_orcamentos WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "pro_config_user_access" ON public.pro_config;
CREATE POLICY "pro_config_user_access" ON public.pro_config
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 3. Políticas Anon para Desenvolvimento Local (REGRA 8)
DROP POLICY IF EXISTS "Allow anon all on pro_clientes" ON public.pro_clientes;
CREATE POLICY "Allow anon all on pro_clientes" ON public.pro_clientes
    FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on pro_orcamentos" ON public.pro_orcamentos;
CREATE POLICY "Allow anon all on pro_orcamentos" ON public.pro_orcamentos
    FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on pro_servicos" ON public.pro_servicos;
CREATE POLICY "Allow anon all on pro_servicos" ON public.pro_servicos
    FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on pro_config" ON public.pro_config;
CREATE POLICY "Allow anon all on pro_config" ON public.pro_config
    FOR ALL TO anon USING (true) WITH CHECK (true);
