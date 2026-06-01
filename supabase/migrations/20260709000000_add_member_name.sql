-- Add name column to organization_members for storing display names
alter table organization_members
  add column if not exists name text;
