-- 1. Alterar a tabela opura_documents para suportar o estado do fluxo de aprovação
ALTER TABLE public.opura_documents 
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'rascunho';

-- 2. Criar a tabela de pareceres/aprovações de documentos
CREATE TABLE IF NOT EXISTS public.opura_document_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.opura_documents(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL,
  approver_email TEXT NOT NULL,
  status TEXT NOT NULL,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Habilitar RLS na tabela opura_document_approvals
ALTER TABLE public.opura_document_approvals ENABLE ROW LEVEL SECURITY;

-- 4. Criar políticas RLS

-- Política para ler aprovações (qualquer membro da mesma organização dos documentos associados pode ler)
DROP POLICY IF EXISTS "Allow members of organization to read approvals" ON public.opura_document_approvals;
CREATE POLICY "Allow members of organization to read approvals" 
  ON public.opura_document_approvals
  FOR SELECT
  USING (
    document_id IN (
      SELECT id FROM public.opura_documents
      WHERE organization_id IN (
        SELECT organization_id FROM public.organization_members
        WHERE email = auth.jwt() ->> 'email'
      )
    )
  );

-- Política para inserir solicitações de aprovação (qualquer membro da mesma organização pode solicitar)
DROP POLICY IF EXISTS "Allow members of organization to insert approvals" ON public.opura_document_approvals;
CREATE POLICY "Allow members of organization to insert approvals" 
  ON public.opura_document_approvals
  FOR INSERT
  WITH CHECK (
    document_id IN (
      SELECT id FROM public.opura_documents
      WHERE organization_id IN (
        SELECT organization_id FROM public.organization_members
        WHERE email = auth.jwt() ->> 'email'
      )
    )
  );

-- Política para atualizar aprovações (apenas o revisor designado ou admin pode atualizar/dar parecer)
DROP POLICY IF EXISTS "Allow approver to update approval details" ON public.opura_document_approvals;
CREATE POLICY "Allow approver to update approval details" 
  ON public.opura_document_approvals
  FOR UPDATE
  USING (
    approver_email = auth.jwt() ->> 'email'
  )
  WITH CHECK (
    approver_email = auth.jwt() ->> 'email'
  );

-- 5. REGRA 8: Políticas Anon para Ambiente de Desenvolvimento (Dev)
DROP POLICY IF EXISTS "Allow anon all on opura_document_approvals" ON public.opura_document_approvals;
CREATE POLICY "Allow anon all on opura_document_approvals" ON public.opura_document_approvals
  FOR ALL TO anon USING (true) WITH CHECK (true);
