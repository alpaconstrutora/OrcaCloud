-- Add sequential code for Orçamentos (001, 002, ...) independent of Obra codes

-- Drop org-wide unique index to allow OBRA and ORCAMENTO independent sequences
DROP INDEX IF EXISTS idx_projects_org_code;

-- Scoped unique index for OBRA only
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_org_obra_code
  ON public.projects ((settings->>'organizationId'), code)
  WHERE code IS NOT NULL
    AND settings->>'organizationId' IS NOT NULL
    AND settings->>'classification' = 'OBRA';

-- Scoped unique index for ORCAMENTO only
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_org_orcamento_code
  ON public.projects ((settings->>'organizationId'), code)
  WHERE code IS NOT NULL
    AND settings->>'organizationId' IS NOT NULL
    AND settings->>'classification' = 'ORCAMENTO';

-- Update get_next_project_code to only count OBRA codes (prevents cross-contamination)
CREATE OR REPLACE FUNCTION public.get_next_project_code(p_org_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_code INT;
  v_next_text TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('project_code_' || p_org_id));

  SELECT COALESCE(MAX(CAST(code AS INTEGER)), 0)
    INTO v_max_code
    FROM public.projects
   WHERE settings->>'organizationId' = p_org_id
     AND settings->>'classification' = 'OBRA'
     AND code IS NOT NULL
     AND code ~ '^\d+$';

  v_next_text := LPAD((v_max_code + 1)::TEXT, 3, '0');
  RETURN v_next_text;
END;
$$;

-- New RPC: next sequential code for ORCAMENTO projects
CREATE OR REPLACE FUNCTION public.get_next_orcamento_code(p_org_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_code INT;
  v_next_text TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('orcamento_code_' || p_org_id));

  SELECT COALESCE(MAX(CAST(code AS INTEGER)), 0)
    INTO v_max_code
    FROM public.projects
   WHERE settings->>'organizationId' = p_org_id
     AND settings->>'classification' = 'ORCAMENTO'
     AND code IS NOT NULL
     AND code ~ '^\d+$';

  v_next_text := LPAD((v_max_code + 1)::TEXT, 3, '0');
  RETURN v_next_text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_orcamento_code(TEXT) TO authenticated;

-- Backfill existing ORCAMENTO projects with sequential codes (ordered by created_at)
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
     WHERE settings->>'classification' = 'ORCAMENTO'
       AND settings->>'organizationId' IS NOT NULL
       AND code IS NULL
  ) INTO v_orgs;

  FOREACH v_org IN ARRAY v_orgs LOOP
    v_seq := 0;
    FOR r IN
      SELECT id
        FROM public.projects
       WHERE settings->>'organizationId' = v_org
         AND settings->>'classification' = 'ORCAMENTO'
         AND code IS NULL
       ORDER BY created_at ASC
    LOOP
      v_seq := v_seq + 1;
      UPDATE public.projects
         SET code = LPAD(v_seq::TEXT, 3, '0'),
             settings = settings || jsonb_build_object('code', LPAD(v_seq::TEXT, 3, '0'))
       WHERE id = r.id;
    END LOOP;
  END LOOP;
END;
$$;
