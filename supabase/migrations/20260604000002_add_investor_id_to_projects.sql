-- Add investor_id FK to projects table and backfill from settings JSONB
-- Replaces the fragile settings->>'investorId' lookup with a proper FK column.
-- Date: 2026-06-04

-- 1. Add the column
ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS investor_id uuid REFERENCES public.investors(id) ON DELETE SET NULL;

-- 2. Backfill from existing JSONB data
UPDATE public.projects
SET investor_id = (settings->>'investorId')::uuid
WHERE settings->>'investorId' IS NOT NULL
  AND settings->>'investorId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 3. Index for fast investor→projects lookups
CREATE INDEX IF NOT EXISTS idx_projects_investor_id ON public.projects(investor_id);
