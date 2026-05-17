-- Migration: Add Delivery Method and Location to Purchase Orders
-- Date: 2026-02-15

ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS delivery_method text,
ADD COLUMN IF NOT EXISTS delivery_location text;

-- Update existing orders if needed (optional)
-- UPDATE public.purchase_orders SET delivery_method = 'Retira', delivery_location = 'Obra' WHERE delivery_method IS NULL;
