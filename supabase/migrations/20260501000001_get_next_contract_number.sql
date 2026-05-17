-- RPC: returns the next sequential contract number for an org (001, 002, 003...)
CREATE OR REPLACE FUNCTION public.get_next_contract_number(p_org_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max INT;
  v_next TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('contract_number_' || p_org_id));

  SELECT COALESCE(MAX(CAST(number AS INTEGER)), 0)
    INTO v_max
    FROM public.contracts
   WHERE organization_id = p_org_id
     AND number IS NOT NULL
     AND number ~ '^\d+$';

  v_next := LPAD((v_max + 1)::TEXT, 3, '0');
  RETURN v_next;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_contract_number(TEXT) TO authenticated;
