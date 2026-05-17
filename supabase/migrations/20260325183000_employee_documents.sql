-- ============================================================
-- Módulo: Gestão de Mão de Obra - Documentos
-- ============================================================

CREATE TABLE IF NOT EXISTS public.employee_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('ASO', 'NR', 'IDENTIDADE', 'CONTRATO', 'TREINAMENTO', 'OUTROS')),
    title TEXT NOT NULL,
    file_url TEXT NOT NULL,
    expiry_date DATE,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'VENCIDO', 'PENDENTE')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_docs_employee ON public.employee_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_docs_org ON public.employee_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_employee_docs_expiry ON public.employee_documents(expiry_date);

-- RLS
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'employee_docs_org_access' AND tablename = 'employee_documents') THEN
        CREATE POLICY "employee_docs_org_access" ON public.employee_documents
        FOR ALL USING (public.is_org_member(org_id));
    END IF;
END $$;

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_employee_documents_updated_at ON public.employee_documents;
CREATE TRIGGER trg_employee_documents_updated_at
    BEFORE UPDATE ON public.employee_documents
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

-- ============================================================
-- SUPORTE A STORAGE (Executar se o bucket organization-assets não existir)
-- ============================================================
-- Se o bucket não existir, tente criar via SQL (requer permissões de superuser no Supabase)
-- Caso contrário, crie manualmente na aba 'Storage' com o nome 'organization-assets'

-- Habilitar bucket 'organization-assets'
INSERT INTO storage.buckets (id, name, public)
SELECT 'organization-assets', 'organization-assets', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'organization-assets');

-- Política para permitir INSERT (Upload)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir Upload para Usuários Autenticados' AND tablename = 'objects') THEN
        CREATE POLICY "Permitir Upload para Usuários Autenticados" ON storage.objects
        FOR INSERT TO authenticated WITH CHECK (bucket_id = 'organization-assets');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir Leitura Pública' AND tablename = 'objects') THEN
        CREATE POLICY "Permitir Leitura Pública" ON storage.objects
        FOR SELECT TO public USING (bucket_id = 'organization-assets');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir Exclusão para Usuários Autenticados' AND tablename = 'objects') THEN
        CREATE POLICY "Permitir Exclusão para Usuários Autenticados" ON storage.objects
        FOR DELETE TO authenticated USING (bucket_id = 'organization-assets');
    END IF;
END $$;
