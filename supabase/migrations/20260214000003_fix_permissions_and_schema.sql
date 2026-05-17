-- DATA REPAIR & PERMISSIONS SCRIPT

-- 1. Fix Schema Mismatch (Add 'origin' column if missing)
alter table sinapi_items add column if not exists origin text default 'SINAPI';

-- 2. Clean up potential duplicate NBR data from failed/partial runs
truncate table nbr_tables;
-- We don't truncate sinapi_items because upsert handles it, and it has 15k rows already.

-- 3. Reset and Enable Policies for Anon (Updates & Deletes needed for ingestion + Select for verification)

-- Drop existing policies to avoid conflicts
drop policy if exists "Allow anon insert" on nbr_tables;
drop policy if exists "Allow anon update" on nbr_tables;
drop policy if exists "Allow anon select" on nbr_tables;
drop policy if exists "Allow anon all" on nbr_tables;

drop policy if exists "Allow anon insert" on sinapi_items;
drop policy if exists "Allow anon update" on sinapi_items;
drop policy if exists "Allow anon select" on sinapi_items;
drop policy if exists "Allow anon all" on sinapi_items;

-- Create comprehensive policies for Anon (Public) access
-- NOTE: In production, you should restrict this!

-- NBR Tables
create policy "Allow anon all" on nbr_tables for all to anon using (true) with check (true);

-- SINAPI Items
create policy "Allow anon all" on sinapi_items for all to anon using (true) with check (true);
