-- ============================================================
-- Migration: 20270821000008_opura_docs_portal_shares.sql
-- ÒPURA Docs (GED): compartilhamento manual com Portal do Cliente
-- e Portal do Colaborador — espelha partner_shared_documents
-- (20261122000000_opura_docs.sql / partnerService.ts), mas para os
-- outros dois portais que hoje não leem o GED.
--
-- Uso: o admin, no botão "Compartilhar" do GED, escolhe um cliente
-- ou colaborador; a partir daí o documento passa a aparecer na aba
-- Documentos do respectivo portal (RPCs fn_portal_get_ged_documents
-- e portal_get_ged_documents, migrations seguintes).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.opura_document_portal_shares (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES public.opura_documents(id) ON DELETE CASCADE,
  audience      TEXT NOT NULL CHECK (audience IN ('cliente', 'colaborador')),
  client_id     UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  employee_id   UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  shared_by     TEXT NOT NULL,
  shared_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT opura_document_portal_shares_target_chk CHECK (
    (audience = 'cliente' AND client_id IS NOT NULL AND employee_id IS NULL) OR
    (audience = 'colaborador' AND employee_id IS NOT NULL AND client_id IS NULL)
  )
);

-- Evita reshare duplicado (mesmo padrão do upsert onConflict de shareDocumentsBatch)
CREATE UNIQUE INDEX IF NOT EXISTS uq_opura_portal_shares_cliente
  ON public.opura_document_portal_shares (document_id, client_id)
  WHERE audience = 'cliente';

CREATE UNIQUE INDEX IF NOT EXISTS uq_opura_portal_shares_colaborador
  ON public.opura_document_portal_shares (document_id, employee_id)
  WHERE audience = 'colaborador';

CREATE INDEX IF NOT EXISTS idx_opura_portal_shares_client ON public.opura_document_portal_shares(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opura_portal_shares_employee ON public.opura_document_portal_shares(employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opura_portal_shares_document ON public.opura_document_portal_shares(document_id);

ALTER TABLE public.opura_document_portal_shares ENABLE ROW LEVEL SECURITY;

-- Leitura/escrita: mesmo padrão de opura_document_versions — herda o acesso do
-- documento pai (a subquery em opura_documents já é filtrada pela RLS dela).
DROP POLICY IF EXISTS "portal_shares_select_org" ON public.opura_document_portal_shares;
CREATE POLICY "portal_shares_select_org" ON public.opura_document_portal_shares
  FOR SELECT TO authenticated
  USING (document_id IN (SELECT id FROM public.opura_documents));

DROP POLICY IF EXISTS "portal_shares_write_org" ON public.opura_document_portal_shares;
CREATE POLICY "portal_shares_write_org" ON public.opura_document_portal_shares
  FOR ALL TO authenticated
  USING (document_id IN (SELECT id FROM public.opura_documents))
  WITH CHECK (document_id IN (SELECT id FROM public.opura_documents));
