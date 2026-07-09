-- Código sequencial (001, 002, 003...) para public.organizations.
-- Diferente das outras 6 entidades (clients/suppliers/investors/companies/
-- organization_members/payment_accounts), aqui NÃO há coluna de organização-pai
-- para particionar a numeração por — `organizations` é a própria entidade de
-- topo (tenant). Por isso a sequência é única GLOBALMENTE (todas as
-- organizações do sistema compartilham 001, 002, 003...), não por org.

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_code
  ON public.organizations (code)
  WHERE code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_next_organization_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_code INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('organization_code'));

  SELECT COALESCE(MAX(CAST(code AS INTEGER)), 0)
    INTO v_max_code
    FROM public.organizations
   WHERE code IS NOT NULL
     AND code ~ '^\d+$';

  RETURN LPAD((v_max_code + 1)::TEXT, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_organization_code() TO authenticated;

-- Backfill retroativo por data de criação.
DO $$
DECLARE
  r RECORD;
  v_seq INT := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.organizations WHERE code IS NULL ORDER BY created_at ASC
  LOOP
    v_seq := v_seq + 1;
    UPDATE public.organizations SET code = LPAD(v_seq::TEXT, 3, '0') WHERE id = r.id;
  END LOOP;
END;
$$;
