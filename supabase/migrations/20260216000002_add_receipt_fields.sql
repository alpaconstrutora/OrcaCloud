-- Migration: Add Receipt and Discrepancy fields to Purchase Orders
-- Date: 2026-02-16

ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS received_at timestamptz,
ADD COLUMN IF NOT EXISTS receipt_photo_path text,
ADD COLUMN IF NOT EXISTS receipt_notes text,
ADD COLUMN IF NOT EXISTS discrepancy_report jsonb;

-- Update status constraint if it exists (dropping and recreating is safer)
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_status_check 
CHECK (status IN ('Rascunho', 'Enviado', 'Confirmado', 'SeparaÃ§Ã£o', 'Em TrÃ¢nsito', 'Entregue', 'Recebido', 'DivergÃªncia', 'Cancelado'));

-- Create storage bucket for receipts if not exists
-- Note: This usually needs to be done via dashboard or a more complex SQL function for extensions
-- For now, we assume the bucket 'receipts' will be created or exist.
