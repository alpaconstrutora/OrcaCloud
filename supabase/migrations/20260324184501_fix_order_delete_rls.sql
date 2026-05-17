-- Fix missing DELETE policy for purchase_orders
drop policy if exists "Allow authenticated delete on purchase_orders" on purchase_orders;
create policy "Allow authenticated delete on purchase_orders" on purchase_orders
  for delete to authenticated using (true);

-- Also allow for anon if relevant in this dev environment
drop policy if exists "Allow anon delete on purchase_orders" on purchase_orders;
create policy "Allow anon delete on purchase_orders" on purchase_orders
  for delete to anon using (true);
