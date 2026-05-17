-- Migration: Fix Recursive RLS for Organizations & Members
-- Date: 2026-02-15

-- 1. Security Definer Function to avoid RLS recursion
-- This function runs with the privileges of the creator (postgres)
create or replace function public.is_org_member(org_id uuid) 
returns boolean as $$
begin
  return exists (
    select 1 
    from public.organization_members 
    where organization_id = org_id 
    and email = auth.jwt()->>'email'
  );
end;
$$ language plpgsql security definer;

-- 2. Organizations Policies
drop policy if exists "Users can view their own organization" on organizations;
drop policy if exists "Authenticated users can create organizations" on organizations;
drop policy if exists "Owners and admins can update their organization" on organizations;
drop policy if exists "Owners can delete their organization" on organizations;

create policy "Users can view their own organization" 
  on organizations for select to authenticated 
  using (public.is_org_member(id));

create policy "Authenticated users can create organizations"
  on organizations for insert to authenticated 
  with check (true);

create policy "Owners and admins can update their organization"
  on organizations for update to authenticated
  using (exists (
    select 1 from organization_members 
    where organization_id = organizations.id 
    and email = auth.jwt()->>'email' 
    and role in ('owner', 'admin')
  ));

create policy "Owners can delete their organization"
  on organizations for delete to authenticated
  using (exists (
    select 1 from organization_members 
    where organization_id = organizations.id 
    and email = auth.jwt()->>'email' 
    and role = 'owner'
  ));

-- 3. Organization Members Policies (FIX RECURSION)
drop policy if exists "Members can view other members in same org" on organization_members;
drop policy if exists "Authenticated users can create memberships" on organization_members;
drop policy if exists "Owners and admins can manage members" on organization_members;

-- First, allow users to see THEIR OWN row (base case)
create policy "Users can view own membership"
  on organization_members for select to authenticated
  using (email = auth.jwt()->>'email');

-- Then, allow seeing others via the security definer function (NO RECURSION)
create policy "Members can view coworkers"
  on organization_members for select to authenticated
  using (public.is_org_member(organization_id));

create policy "Authenticated users can create memberships"
  on organization_members for insert to authenticated 
  with check (true);

create policy "Owners and admins can manage members"
  on organization_members for all to authenticated
  using (exists (
    select 1 from organization_members m
    where m.organization_id = organization_members.organization_id
    and m.email = auth.jwt()->>'email'
    and m.role in ('owner', 'admin')
  ));

-- 4. Financial Registry Policies
drop policy if exists "Users can view registries of their organization" on payment_accounts;
drop policy if exists "Users can manage registries of their organization" on payment_accounts;
drop policy if exists "Users can view payment accounts" on payment_accounts;
drop policy if exists "Admins can manage payment accounts" on payment_accounts;

create policy "Users can view payment accounts" on payment_accounts for select to authenticated
  using (public.is_org_member(organization_id));

create policy "Admins can manage payment accounts" on payment_accounts for all to authenticated
  using (exists (
    select 1 from organization_members 
    where organization_id = payment_accounts.organization_id 
    and email = auth.jwt()->>'email' 
    and role in ('owner', 'admin')
  ));

-- Cost Centers
drop policy if exists "Users can view cost centers" on cost_centers;
drop policy if exists "Admins can manage cost centers" on cost_centers;

create policy "Users can view cost centers" on cost_centers for select to authenticated
  using (public.is_org_member(organization_id));

create policy "Admins can manage cost centers" on cost_centers for all to authenticated
  using (exists (
    select 1 from organization_members 
    where organization_id = cost_centers.organization_id 
    and email = auth.jwt()->>'email' 
    and role in ('owner', 'admin')
  ));

-- Chart of Accounts
drop policy if exists "Users can view chart of accounts" on chart_of_accounts;
drop policy if exists "Admins can manage chart of accounts" on chart_of_accounts;

create policy "Users can view chart of accounts" on chart_of_accounts for select to authenticated
  using (public.is_org_member(organization_id));

create policy "Admins can manage chart of accounts" on chart_of_accounts for all to authenticated
  using (exists (
    select 1 from organization_members 
    where organization_id = chart_of_accounts.organization_id 
    and email = auth.jwt()->>'email' 
    and role in ('owner', 'admin')
  ));
