-- ==========================================================================
-- Diário de Obras · código sequencial automático (001, 002, ...)
-- Date: 2026-09-21
-- Aplicada no banco em 2026-09-21 (db query -f) sob o nome
-- aplicar_20270921000001_add_diario_code.sql; renomeada por colisão de prefixo.
-- ==========================================================================
-- CONTEXTO
-- OBRA (get_next_project_code), ORCAMENTO (get_next_orcamento_code) e
-- PLANEJAMENTO (get_next_planejamento_code) têm código sequencial por
-- organização. DIARIO nunca ganhou o equivalente: a coluna "Código" da tela
-- Operacional › Diário de Obras ficava em branco para todo diário.
-- Mesmo modelo de 20261129000001_add_planejamento_code.sql.
-- ==========================================================================

-- Índice único por org, só para DIARIO (não colide com os demais)
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_org_diario_code
  ON public.projects ((settings->>'organizationId'), code)
  WHERE code IS NOT NULL
    AND settings->>'organizationId' IS NOT NULL
    AND settings->>'classification' = 'DIARIO';

CREATE OR REPLACE FUNCTION public.get_next_diario_code(p_org_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_code INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('diario_code_' || p_org_id));

  SELECT COALESCE(MAX(CAST(code AS INTEGER)), 0)
    INTO v_max_code
    FROM public.projects
   WHERE settings->>'organizationId' = p_org_id
     AND settings->>'classification' = 'DIARIO'
     AND code IS NOT NULL
     AND code ~ '^\d+$';

  RETURN LPAD((v_max_code + 1)::TEXT, 3, '0');
END;
$$;

-- Só usuário logado chama (o default do Supabase concede a anon nominalmente;
-- REVOKE de PUBLIC sozinho não remove esse grant).
REVOKE ALL ON FUNCTION public.get_next_diario_code(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.get_next_diario_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_next_diario_code(TEXT) TO authenticated;

-- Backfill: diários existentes sem código, por org, na ordem de criação
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
     WHERE settings->>'classification' = 'DIARIO'
       AND settings->>'organizationId' IS NOT NULL
       AND code IS NULL
  ) INTO v_orgs;

  FOREACH v_org IN ARRAY v_orgs LOOP
    SELECT COALESCE(MAX(CAST(code AS INTEGER)), 0)
      INTO v_seq
      FROM public.projects
     WHERE settings->>'organizationId' = v_org
       AND settings->>'classification' = 'DIARIO'
       AND code ~ '^\d+$';

    FOR r IN
      SELECT id
        FROM public.projects
       WHERE settings->>'organizationId' = v_org
         AND settings->>'classification' = 'DIARIO'
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
