-- Migration: Fix RLS for projects table
-- Date: 2026-02-16

-- Enable RLS
alter table projects enable row level security;

-- Drop existing policies if any to avoid conflicts
drop policy if exists "Allow authenticated all on projects" on projects;
drop policy if exists "Allow anon all on projects" on projects;

-- Create open policies for development (similar to purchase_orders)
create policy "Allow authenticated all on projects" on projects
  for all to authenticated using (true) with check (true);

create policy "Allow anon all on projects" on projects
  for all to anon using (true) with check (true);
