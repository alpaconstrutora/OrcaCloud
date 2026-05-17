-- Create table for NBR 12721 tables (CUB data)
create table if not exists nbr_tables (
  id uuid default gen_random_uuid() primary key,
  table_name text not null, -- e.g., 'TABELA 4'
  data jsonb not null, -- Stores the entire table content as JSON
  created_at timestamptz default now()
);

-- Create table for SINAPI items (CSD)
create table if not exists sinapi_items (
  code text primary key, -- SINAPI code is unique
  description text,
  unit text,
  price numeric,
  origin text default 'SINAPI',
  created_at timestamptz default now()
);

-- Enable RLS (Row Level Security) - optional but recommended, initially allowing all for ease of ingestion
alter table nbr_tables enable row level security;
alter table sinapi_items enable row level security;

-- Policies (Adjust as needed for your auth model, here assuming service role or authenticated users can read)
create policy "Allow read access to authenticated users" on nbr_tables for select to authenticated using (true);
create policy "Allow read access to authenticated users" on sinapi_items for select to authenticated using (true);

-- Allow service_role to do everything (for ingestion script)
create policy "Allow service_role full access" on nbr_tables for all to service_role using (true) with check (true);
create policy "Allow service_role full access" on sinapi_items for all to service_role using (true) with check (true);
