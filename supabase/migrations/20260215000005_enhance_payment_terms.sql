-- Enhance payment terms in purchase_orders
alter table if exists public.purchase_orders 
add column if not exists payment_term_type text check (payment_term_type in ('Vista', 'Parcelado')),
add column if not exists payment_days integer,
add column if not exists payment_installments integer;

-- Optional: Set defaults for existing data
update public.purchase_orders 
set payment_term_type = 'Vista', payment_days = 30 
where payment_term_type is null AND payment_method is not null;
