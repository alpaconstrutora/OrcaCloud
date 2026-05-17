
-- Create the 'documents' bucket if it doesn't exist
insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do nothing;

-- 1. Allow Public Read Access (so public URLs work)
drop policy if exists "Public Access" on storage.objects;
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'documents' );

-- 2. Allow Authenticated Insert (Uploads)
drop policy if exists "Authenticated Upload" on storage.objects;
create policy "Authenticated Upload"
  on storage.objects for insert
  to authenticated
  with check ( bucket_id = 'documents' );

-- 3. Allow Authenticated Update (optional, for replacing files)
drop policy if exists "Authenticated Update" on storage.objects;
create policy "Authenticated Update"
  on storage.objects for update
  to authenticated
  using ( bucket_id = 'documents' );

-- 4. Allow Authenticated Delete
drop policy if exists "Authenticated Delete" on storage.objects;
create policy "Authenticated Delete"
  on storage.objects for delete
  to authenticated
  using ( bucket_id = 'documents' );
