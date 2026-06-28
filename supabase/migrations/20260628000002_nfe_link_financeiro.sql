-- F1: Costura NF-e → Contas a Pagar
-- Adiciona colunas de vínculo financeiro em nfe_invoices

ALTER TABLE public.nfe_invoices
  ADD COLUMN IF NOT EXISTS project_id            UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_transaction_id UUID REFERENCES public.internal_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nfe_invoices_project      ON public.nfe_invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_nfe_invoices_linked_tx    ON public.nfe_invoices(linked_transaction_id);

NOTIFY pgrst, 'reload schema';
