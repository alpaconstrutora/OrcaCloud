-- RPC overload: próximo número sequencial isolado por direction.
-- Mantém a função original (1 arg) para compatibilidade; adiciona variante (2 args).
CREATE OR REPLACE FUNCTION public.get_next_contract_number(p_org_id TEXT, p_direction TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max INT;
  v_next TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('contract_number_' || p_org_id || '_' || COALESCE(p_direction, 'NULL')));

  SELECT COALESCE(MAX(CAST(number AS INTEGER)), 0)
    INTO v_max
    FROM public.contracts
   WHERE organization_id = p_org_id
     AND number IS NOT NULL
     AND number ~ '^\d+$'
     AND (
        (p_direction = 'OUTGOING' AND direction = 'OUTGOING')
        OR (p_direction <> 'OUTGOING' AND (direction IS NULL OR direction = 'INCOMING'))
     );

  v_next := LPAD((v_max + 1)::TEXT, 3, '0');
  RETURN v_next;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_contract_number(TEXT, TEXT) TO authenticated;
