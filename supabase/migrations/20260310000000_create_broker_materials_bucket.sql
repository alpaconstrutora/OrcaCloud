-- Criando o bucket broker-materials
insert into storage.buckets (id, name, public) 
values ('broker-materials', 'broker-materials', true) 
on conflict (id) do nothing;

-- Deletar policies antigas se existirem
drop policy if exists "Public Access for materials" on storage.objects;
drop policy if exists "Auth Insert materials" on storage.objects;

-- Criando politicas de acesso (RLS) para o bucket de materiais do corretor
create policy "Public Access for materials"
on storage.objects for select
to public
using ( bucket_id = 'broker-materials' );

create policy "Auth Insert materials"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'broker-materials' );

create policy "Auth Update materials"
on storage.objects for update
to authenticated
using ( bucket_id = 'broker-materials' );

create policy "Auth Delete materials"
on storage.objects for delete
to authenticated
using ( bucket_id = 'broker-materials' );

