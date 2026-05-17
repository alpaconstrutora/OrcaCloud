-- OPTIONAL: Run this if you are running the ingestion script with the Anon Key (VITE_SUPABASE_ANON_KEY)
-- and do not have the Service Role Key configured.
-- This temporarily opens up the tables for public insertion. You should revert this after ingestion!

drop policy if exists "Allow anon insert" on nbr_tables;
drop policy if exists "Allow anon update" on nbr_tables;
create policy "Allow anon insert" on nbr_tables for insert to anon with check (true);
create policy "Allow anon update" on nbr_tables for update to anon using (true);

drop policy if exists "Allow anon insert" on sinapi_items;
drop policy if exists "Allow anon update" on sinapi_items;
create policy "Allow anon insert" on sinapi_items for insert to anon with check (true);
create policy "Allow anon update" on sinapi_items for update to anon using (true);
