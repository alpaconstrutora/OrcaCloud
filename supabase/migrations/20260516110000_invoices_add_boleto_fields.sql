-- Adiciona campos de vencimento, centro de custo e plano de contas à tabela invoices.
-- Aplique no Supabase Dashboard → SQL Editor.

ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS due_date         date,
    ADD COLUMN IF NOT EXISTS cost_center_id   uuid REFERENCES public.cost_centers(id)        ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS chart_of_accounts_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;
