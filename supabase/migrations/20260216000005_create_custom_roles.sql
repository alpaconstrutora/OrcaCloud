-- Migration: Create Custom Roles Table
-- Date: 2026-02-16

-- 1. Create custom roles table
create table if not exists organization_custom_roles (
    id uuid default gen_random_uuid() primary key,
    organization_id uuid references organizations(id) on delete cascade,
    name text not null,
    permissions jsonb default '{}'::jsonb,
    created_at timestamptz default now()
);

-- 2. Add custom_role_id to organization_members
alter table organization_members add column if not exists custom_role_id uuid references organization_custom_roles(id) on delete set null;

-- 3. Enable RLS
alter table organization_custom_roles enable row level security;

-- 4. Policies for Custom Roles
create policy "Users can view custom roles of their organization" 
    on organization_custom_roles for select to authenticated 
    using (organization_id in (select organization_id from organization_members where email = auth.jwt()->>'email'));

create policy "Admins can manage custom roles" 
    on organization_custom_roles for all to authenticated 
    using (organization_id in (select organization_id from organization_members where email = auth.jwt()->>'email' and role in ('admin', 'owner')));

-- Support for Anon (development)
create policy "Allow anon all to custom roles during dev" on organization_custom_roles for all to anon using (true) with check (true);
