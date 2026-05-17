-- Migration: Allow Admin Access to all Orgs (and ensure custom roles table exists)
-- Date: 2026-02-16

-- 1. Ensure custom roles table exists (from previous migration)
create table if not exists organization_custom_roles (
    id uuid default gen_random_uuid() primary key,
    organization_id uuid references organizations(id) on delete cascade,
    name text not null,
    permissions jsonb default '{}'::jsonb,
    created_at timestamptz default now()
);

-- 2. Ensure member column exists
alter table organization_members add column if not exists custom_role_id uuid references organization_custom_roles(id) on delete set null;

-- 3. Enable RLS
alter table organization_custom_roles enable row level security;

-- 4. Admin Policies
-- Allow users with admin email to view all organizations
drop policy if exists "Admins can view all organizations" on organizations;
create policy "Admins can view all organizations"
    on organizations for select to authenticated
    using (auth.jwt()->>'email' = 'admin@admin.com');

-- Allow users with admin email to view all memberships
drop policy if exists "Admins can view all memberships" on organization_members;
create policy "Admins can view all memberships"
    on organization_members for select to authenticated
    using (auth.jwt()->>'email' = 'admin@admin.com');

-- Allow users with admin email to view all custom roles
drop policy if exists "Admins can view all custom roles" on organization_custom_roles;
create policy "Admins can view all custom roles"
    on organization_custom_roles for select to authenticated
    using (auth.jwt()->>'email' = 'admin@admin.com');
