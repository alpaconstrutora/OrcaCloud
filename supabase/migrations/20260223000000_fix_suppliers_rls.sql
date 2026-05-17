-- Migration: Standardize Suppliers table and add RLS policies
-- Date: 2026-02-23

-- 1. Add organization_id column to suppliers if it doesn't exist and fix email nullability
do $$ 
begin
    if not exists (select 1 from information_schema.columns where table_name='suppliers' and column_name='organization_id') then
        alter table public.suppliers add column organization_id uuid references public.organizations(id) on delete cascade;
    end if;
    
    -- Relax email constraint to allow null (optional but unique if present)
    alter table public.suppliers alter column email drop not null;
end $$;

-- 2. Ensure RLS is enabled
alter table public.suppliers enable row level security;

-- 3. Drop existing policies to redeploy
drop policy if exists "Allow authenticated users to read suppliers" on public.suppliers;
drop policy if exists "Allow authenticated users to manage suppliers" on public.suppliers;
drop policy if exists "Allow anon all on suppliers" on public.suppliers;
drop policy if exists "Users can view suppliers of their organization" on public.suppliers;
drop policy if exists "Users can manage suppliers of their organization" on public.suppliers;

-- 4. Create comprehensive policies

-- Authenticated: Member of organization OR admin
create policy "Users can view suppliers of their organization" 
  on public.suppliers for select to authenticated 
  using (
    organization_id is null 
    or public.is_org_member(organization_id) 
    or auth.jwt()->>'email' = 'admin@admin.com'
  );

create policy "Users can manage suppliers of their organization" 
  on public.suppliers for all to authenticated 
  using (
    organization_id is null 
    or public.is_org_member(organization_id) 
    or auth.jwt()->>'email' = 'admin@admin.com'
  )
  with check (
    organization_id is null 
    or public.is_org_member(organization_id) 
    or auth.jwt()->>'email' = 'admin@admin.com'
  );

-- Support for Anon (development / standard for this project)
create policy "Allow anon all on suppliers" 
  on public.suppliers for all to anon 
  using (true) 
  with check (true);
