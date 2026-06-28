-- F2: 3-Way Match — link NF-e → Pedido de Compra
ALTER TABLE public.nfe_invoices
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nfe_invoices_purchase_order ON public.nfe_invoices(purchase_order_id);

NOTIFY pgrst, 'reload schema';
