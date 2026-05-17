-- Migration: Fix RLS Policies for Organizations
-- Date: 2026-02-15

-- 1. Organizations Policies
-- Allow authenticated users to create organizations
drop policy if exists "Users can view their own organization" on organizations;
create policy "Users can view their own organization" 
  on organizations for select to authenticated 
  using (id in (select organization_id from organization_members where email = auth.jwt()->>'email'));

create policy "Authenticated users can create organizations"
  on organizations for insert to authenticated 
  with check (true);

create policy "Owners and admins can update their organization"
  on organizations for update to authenticated
  using (id in (
    select organization_id from organization_members 
    where email = auth.jwt()->>'email' and role in ('owner', 'admin')
  ));

create policy "Owners can delete their organization"
  on organizations for delete to authenticated
  using (id in (
    select organization_id from organization_members 
    where email = auth.jwt()->>'email' and role = 'owner'
  ));

-- 2. Organization Members Policies
drop policy if exists "Members can view other members in same org" on organization_members;
create policy "Members can view other members in same org" 
  on organization_members for select to authenticated 
  using (organization_id in (select organization_id from organization_members where email = auth.jwt()->>'email'));

-- Allow authenticated users to join organizations or create the first membership
create policy "Authenticated users can create memberships"
  on organization_members for insert to authenticated 
  with check (true);

create policy "Owners and admins can manage members"
  on organization_members for all to authenticated
  using (organization_id in (
    select organization_id from organization_members 
    where email = auth.jwt()->>'email' and role in ('owner', 'admin')
  ));

-- 3. Consolidated Financial Registry Policies (Fixing Payment Accounts, Cost Centers, etc.)
-- Payment Accounts
drop policy if exists "Users can view registries of their organization" on payment_accounts;
drop policy if exists "Users can manage registries of their organization" on payment_accounts;

create policy "Users can view payment accounts" on payment_accounts for select to authenticated
  using (organization_id in (select organization_id from organization_members where email = auth.jwt()->>'email'));

create policy "Admins can manage payment accounts" on payment_accounts for all to authenticated
  using (organization_id in (select organization_id from organization_members where email = auth.jwt()->>'email' and role in ('owner', 'admin')));

-- Cost Centers
drop policy if exists "Users can view cost centers of their organization" on cost_centers;
drop policy if exists "Users can manage cost centers of their organization" on cost_centers;

create policy "Users can view cost centers" on cost_centers for select to authenticated
  using (organization_id in (select organization_id from organization_members where email = auth.jwt()->>'email'));

create policy "Admins can manage cost centers" on cost_centers for all to authenticated
  using (organization_id in (select organization_id from organization_members where email = auth.jwt()->>'email' and role in ('owner', 'admin')));

-- Chart of Accounts
drop policy if exists "Users can view chart of accounts of their organization" on chart_of_accounts;
drop policy if exists "Users can manage chart of accounts of their organization" on chart_of_accounts;

create policy "Users can view chart of accounts" on chart_of_accounts for select to authenticated
  using (organization_id in (select organization_id from organization_members where email = auth.jwt()->>'email'));

create policy "Admins can manage chart of accounts" on chart_of_accounts for all to authenticated
  using (organization_id in (select organization_id from organization_members where email = auth.jwt()->>'email' and role in ('owner', 'admin')));
