-- =============================================================================
-- Dados Mestres — RPC para admins adicionarem cidades manualmente
-- =============================================================================
-- Estratégia: master_cities continua read-only via RLS. Para casos excepcionais
-- (distritos/povoados que IBGE não cobre), admins de qualquer org chamam esta
-- RPC SECURITY DEFINER que valida + insere.
--
-- Política:
--   - Apenas admin/owner de pelo menos uma org pode chamar
--   - Cidade adicionada manualmente tem system_default=FALSE e is_active=TRUE
--   - source_version='MANUAL-<org_id>' para auditoria
--   - Se a cidade já existe (mesmo state_id + name normalizado), retorna a existente
-- =============================================================================

CREATE OR REPLACE FUNCTION public.master_city_add(
  p_state_id   UUID,
  p_name       TEXT,
  p_ibge_code  INTEGER DEFAULT NULL,
  p_latitude   NUMERIC DEFAULT NULL,
  p_longitude  NUMERIC DEFAULT NULL
)
RETURNS public.master_cities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email TEXT;
  v_is_admin   BOOLEAN;
  v_existing   public.master_cities%ROWTYPE;
  v_new        public.master_cities%ROWTYPE;
  v_clean_name TEXT;
BEGIN
  -- 1. Identifica usuário
  v_user_email := auth.jwt() ->> 'email';
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  -- 2. Verifica se é admin/owner em alguma org
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE email = v_user_email
      AND role IN ('admin', 'owner')
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Apenas administradores podem adicionar cidades' USING ERRCODE = '42501';
  END IF;

  -- 3. Valida entrada
  v_clean_name := btrim(p_name);
  IF v_clean_name = '' OR length(v_clean_name) < 2 THEN
    RAISE EXCEPTION 'Nome da cidade inválido' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.master_states WHERE id = p_state_id) THEN
    RAISE EXCEPTION 'Estado inexistente' USING ERRCODE = '23503';
  END IF;

  -- 4. Idempotência: se já existe (mesmo state + nome equivalente case-insensitive), retorna
  SELECT * INTO v_existing
  FROM public.master_cities
  WHERE state_id = p_state_id
    AND lower(unaccent(name)) = lower(unaccent(v_clean_name))
  LIMIT 1;

  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- Idem se ibge_code já existe
  IF p_ibge_code IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.master_cities WHERE ibge_code = p_ibge_code LIMIT 1;
    IF FOUND THEN RETURN v_existing; END IF;
  END IF;

  -- 5. Insere
  INSERT INTO public.master_cities (
    state_id, name, ibge_code, latitude, longitude,
    is_capital, is_active, system_default, source_version
  ) VALUES (
    p_state_id, v_clean_name, p_ibge_code, p_latitude, p_longitude,
    FALSE, TRUE, FALSE, 'MANUAL-' || v_user_email
  )
  RETURNING * INTO v_new;

  RETURN v_new;
END;
$$;

-- unaccent precisa estar habilitado (geralmente já está em projetos Supabase)
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Permissão de execução: apenas authenticated (a função já valida admin internamente)
REVOKE ALL ON FUNCTION public.master_city_add(UUID, TEXT, INTEGER, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_city_add(UUID, TEXT, INTEGER, NUMERIC, NUMERIC) TO authenticated;

COMMENT ON FUNCTION public.master_city_add IS
  'Adiciona cidade ao cadastro mestre. Restrito a admins/owners. Idempotente por (state_id, name) ou ibge_code.';
