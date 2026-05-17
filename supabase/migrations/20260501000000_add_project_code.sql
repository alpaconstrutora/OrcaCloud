-- Add sequential code column to projects (for Engenharia - Obras: 001, 002, 003...)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS code TEXT;

-- Unique index: one code per org (expression index on JSONB field)
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_org_code
  ON public.projects ((settings->>'organizationId'), code)
  WHERE code IS NOT NULL AND settings->>'organizationId' IS NOT NULL;

-- RPC: returns the next available code for an org, with advisory lock to prevent races
CREATE OR REPLACE FUNCTION public.get_next_project_code(p_org_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_code INT;
  v_next_text TEXT;
BEGIN
  -- Per-org lock: prevents two simultaneous inserts from getting the same code
  PERFORM pg_advisory_xact_lock(hashtext('project_code_' || p_org_id));

  SELECT COALESCE(MAX(CAST(code AS INTEGER)), 0)
    INTO v_max_code
    FROM public.projects
   WHERE settings->>'organizationId' = p_org_id
     AND code IS NOT NULL
     AND code ~ '^\d+$';

  v_next_text := LPAD((v_max_code + 1)::TEXT, 3, '0');
  RETURN v_next_text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_project_code(TEXT) TO authenticated;

-- Retroactive backfill: assign codes to existing OBRA projects ordered by created_at
DO $$
DECLARE
  r RECORD;
  v_org TEXT;
  v_seq INT;
  v_orgs TEXT[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT settings->>'organizationId'
      FROM public.projects
     WHERE settings->>'classification' = 'OBRA'
       AND settings->>'organizationId' IS NOT NULL
       AND code IS NULL
  ) INTO v_orgs;

  FOREACH v_org IN ARRAY v_orgs LOOP
    v_seq := 0;
    FOR r IN
      SELECT id
        FROM public.projects
       WHERE settings->>'organizationId' = v_org
         AND settings->>'classification' = 'OBRA'
         AND code IS NULL
       ORDER BY created_at ASC
    LOOP
      v_seq := v_seq + 1;
      UPDATE public.projects
         SET code = LPAD(v_seq::TEXT, 3, '0')
       WHERE id = r.id;
    END LOOP;
  END LOOP;
END;
$$;
