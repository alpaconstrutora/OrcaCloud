
-- Create the 'receipts' bucket if it doesn't exist
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

-- 1. Allow Public Read Access
drop policy if exists "Public Receipt Access" on storage.objects;
create policy "Public Receipt Access"
  on storage.objects for select
  using ( bucket_id = 'receipts' );

-- 2. Allow Authenticated Insert (Uploads for checkout)
drop policy if exists "Authenticated Receipt Upload" on storage.objects;
create policy "Authenticated Receipt Upload"
  on storage.objects for insert
  to authenticated
  with check ( bucket_id = 'receipts' );

-- 3. Allow Authenticated Update
drop policy if exists "Authenticated Receipt Update" on storage.objects;
create policy "Authenticated Receipt Update"
  on storage.objects for update
  to authenticated
  using ( bucket_id = 'receipts' );

-- 4. Allow Authenticated Delete
drop policy if exists "Authenticated Receipt Delete" on storage.objects;
create policy "Authenticated Receipt Delete"
  on storage.objects for delete
  to authenticated
  using ( bucket_id = 'receipts' );
