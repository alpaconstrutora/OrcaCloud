-- Add payment_method to purchase_orders
alter table if exists public.purchase_orders 
add column if not exists payment_method text;

-- Update existing orders to have a default if needed (optional)
-- update public.purchase_orders set payment_method = 'Boleto' where payment_method is null;
