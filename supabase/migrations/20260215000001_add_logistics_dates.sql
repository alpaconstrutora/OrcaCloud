-- Add logistics dates and update status constraint
alter table purchase_orders 
add column if not exists separation_date date,
add column if not exists shipped_date date,
add column if not exists actual_delivery_date date;

-- Update status constraint to include new logistics stages
alter table purchase_orders
drop constraint if exists purchase_orders_status_check;

alter table purchase_orders
add constraint purchase_orders_status_check 
check (status in ('Rascunho', 'Enviado', 'Confirmado', 'SeparaÃ§Ã£o', 'Em TrÃ¢nsito', 'Entregue', 'Cancelado'));
