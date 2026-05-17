-- Migration: Create Financial Registry Tables (with Base Organization Schema)
-- Date: 2026-02-15

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 0. Base Tables (to fix "relation organizations does not exist")
create table if not exists organizations (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  cnpj text,
  email text,
  phone text,
  website text,
  logo_url text,
  address jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists organization_members (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references organizations(id) on delete cascade,
  user_id uuid, -- Link to auth.users if available
  email text not null,
  role text default 'member',
  permissions jsonb default '{}'::jsonb,
  joined_at timestamptz default now(),
  unique(organization_id, email)
);

-- 1. Payment Accounts
create table if not exists payment_accounts (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz default now()
);

-- 2. Cost Centers
create table if not exists cost_centers (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  code text,
  created_at timestamptz default now()
);

-- 3. Chart of Accounts
create table if not exists chart_of_accounts (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  code text not null,
  type text default 'Expense',
  parent_id uuid references chart_of_accounts(id) on delete set null,
  created_at timestamptz default now()
);

-- Enable RLS
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table payment_accounts enable row level security;
alter table cost_centers enable row level security;
alter table chart_of_accounts enable row level security;

-- Policies for Organizations (Basic)
create policy "Users can view their own organization" 
  on organizations for select to authenticated 
  using (id in (select organization_id from organization_members where email = auth.jwt()->>'email'));

-- Policies for Members
create policy "Members can view other members in same org" 
  on organization_members for select to authenticated 
  using (organization_id in (select organization_id from organization_members where email = auth.jwt()->>'email'));

-- Policies for Financial Registries
create policy "Users can view registries of their organization" 
  on payment_accounts for select to authenticated 
  using (organization_id in (select organization_id from organization_members where email = auth.jwt()->>'email'));

create policy "Users can manage registries of their organization" 
  on payment_accounts for all to authenticated 
  using (organization_id in (select organization_id from organization_members where email = auth.jwt()->>'email' and role in ('admin', 'owner')));

create policy "Users can view cost centers of their organization" 
  on cost_centers for select to authenticated 
  using (organization_id in (select organization_id from organization_members where email = auth.jwt()->>'email'));

create policy "Users can manage cost centers of their organization" 
  on cost_centers for all to authenticated 
  using (organization_id in (select organization_id from organization_members where email = auth.jwt()->>'email' and role in ('admin', 'owner')));

create policy "Users can view chart of accounts of their organization" 
  on chart_of_accounts for select to authenticated 
  using (organization_id in (select organization_id from organization_members where email = auth.jwt()->>'email'));

create policy "Users can manage chart of accounts of their organization" 
  on chart_of_accounts for all to authenticated 
  using (organization_id in (select organization_id from organization_members where email = auth.jwt()->>'email' and role in ('admin', 'owner')));

-- Support for Anon (development)
create policy "Allow anon insert to orgs during dev" on organizations for insert to anon with check (true);
create policy "Allow anon select to orgs during dev" on organizations for select to anon using (true);
create policy "Allow anon insert to members during dev" on organization_members for insert to anon with check (true);
create policy "Allow anon select to members during dev" on organization_members for select to anon using (true);
create policy "Allow anon all to registries during dev" on payment_accounts for all to anon using (true) with check (true);
create policy "Allow anon all to cost_centers during dev" on cost_centers for all to anon using (true) with check (true);
create policy "Allow anon all to chart_of_accounts during dev" on chart_of_accounts for all to anon using (true) with check (true);
