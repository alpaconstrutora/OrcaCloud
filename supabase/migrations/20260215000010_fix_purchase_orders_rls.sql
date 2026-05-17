-- Enable RLS for purchase_orders
alter table purchase_orders enable row level security;

-- Policies for purchase_orders
drop policy if exists "Allow authenticated select on purchase_orders" on purchase_orders;
create policy "Allow authenticated select on purchase_orders" on purchase_orders
  for select to authenticated using (true);

drop policy if exists "Allow authenticated update on purchase_orders" on purchase_orders;
create policy "Allow authenticated update on purchase_orders" on purchase_orders
  for update to authenticated using (true);

drop policy if exists "Allow authenticated insert on purchase_orders" on purchase_orders;
create policy "Allow authenticated insert on purchase_orders" on purchase_orders
  for insert to authenticated with check (true);

-- Also allow anon for now if testing without full auth (consistent with other tables in this project)
drop policy if exists "Allow anon all on purchase_orders" on purchase_orders;
create policy "Allow anon all on purchase_orders" on purchase_orders
  for all to anon using (true) with check (true);
