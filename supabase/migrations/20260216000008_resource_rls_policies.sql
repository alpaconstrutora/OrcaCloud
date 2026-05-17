-- Migration: Configure RLS for Resource Tables and Add Resources Column
-- Date: 2026-02-16

-- 1. Add resources column to organizations for simplified storage
alter table organizations add column if not exists resources jsonb default '{"roles": [], "workers": [], "teams": []}'::jsonb;

-- 2. Create tables if they don't exist
create table if not exists resource_roles (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    description text,
    cost_per_hour numeric default 0,
    cost_per_day numeric default 0,
    source text,
    organization_id uuid references organizations(id),
    created_at timestamptz default now()
);

create table if not exists resource_teams (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    member_ids jsonb default '[]'::jsonb,
    source text,
    organization_id uuid references organizations(id),
    created_at timestamptz default now()
);

create table if not exists resource_workers (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    role_id uuid references resource_roles(id),
    team_id uuid references resource_teams(id),
    email text,
    phone text,
    source text,
    organization_id uuid references organizations(id),
    created_at timestamptz default now()
);

create table if not exists labor (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    category text,
    unit text,
    price numeric default 0,
    organization_id uuid references organizations(id),
    created_at timestamptz default now()
);

-- 3. Ensure RLS is enabled
alter table resource_roles enable row level security;
alter table resource_workers enable row level security;
alter table resource_teams enable row level security;
alter table labor enable row level security;

-- 4. Drop existing policies if any (now safe because tables exist)
do $$ 
begin
    -- resource_roles
    drop policy if exists "Admins can view all resource roles" on resource_roles;
    drop policy if exists "Admins can manage all resource roles" on resource_roles;
    drop policy if exists "Allow anon all to resource_roles" on resource_roles;

    -- resource_workers
    drop policy if exists "Admins can view all resource workers" on resource_workers;
    drop policy if exists "Admins can manage all resource workers" on resource_workers;
    drop policy if exists "Allow anon all to resource_workers" on resource_workers;

    -- resource_teams
    drop policy if exists "Admins can view all resource teams" on resource_teams;
    drop policy if exists "Admins can manage all resource teams" on resource_teams;
    drop policy if exists "Allow anon all to resource_teams" on resource_teams;

    -- labor
    drop policy if exists "Admins can view all labor" on labor;
    drop policy if exists "Admins can manage all labor" on labor;
    drop policy if exists "Allow anon all to labor" on labor;
end $$;

-- 5. Create Organization-based Policies (Access for any member of the organization)
create policy "Users can view roles of their organization" on resource_roles for select to authenticated using (public.is_org_member(organization_id) or auth.jwt()->>'email' = 'admin@admin.com');
create policy "Users can manage roles of their organization" on resource_roles for all to authenticated using (public.is_org_member(organization_id) or auth.jwt()->>'email' = 'admin@admin.com');

create policy "Users can view workers of their organization" on resource_workers for select to authenticated using (public.is_org_member(organization_id) or auth.jwt()->>'email' = 'admin@admin.com');
create policy "Users can manage workers of their organization" on resource_workers for all to authenticated using (public.is_org_member(organization_id) or auth.jwt()->>'email' = 'admin@admin.com');

create policy "Users can view teams of their organization" on resource_teams for select to authenticated using (public.is_org_member(organization_id) or auth.jwt()->>'email' = 'admin@admin.com');
create policy "Users can manage teams of their organization" on resource_teams for all to authenticated using (public.is_org_member(organization_id) or auth.jwt()->>'email' = 'admin@admin.com');

create policy "Users can view labor of their organization" on labor for select to authenticated using (public.is_org_member(organization_id) or auth.jwt()->>'email' = 'admin@admin.com');
create policy "Users can manage labor of their organization" on labor for all to authenticated using (public.is_org_member(organization_id) or auth.jwt()->>'email' = 'admin@admin.com');

-- 6. Create anon access for development
create policy "Allow anon all to resource_roles" on resource_roles for all to anon using (true) with check (true);
create policy "Allow anon all to resource_workers" on resource_workers for all to anon using (true) with check (true);
create policy "Allow anon all to resource_teams" on resource_teams for all to anon using (true) with check (true);
create policy "Allow anon all to labor" on labor for all to anon using (true) with check (true);
