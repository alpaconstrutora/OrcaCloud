-- Código sequencial (001, 002, 003...) único por organização para nfe_invoices.
-- Mesmo molde de 20270112000000_add_entity_codes.sql (clients/suppliers/...),
-- mas via trigger BEFORE INSERT em vez de RPC chamada pelo app: a inserção de
-- nfe_invoices acontece dentro da função persist_nfe_transaction (Edge Function
-- fiscal-nfe-processor), não por um form de UI — o trigger garante numeração
-- automática independente do caminho de escrita.

ALTER TABLE public.nfe_invoices ADD COLUMN IF NOT EXISTS code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_nfe_invoices_org_code
  ON public.nfe_invoices (organization_id, code)
  WHERE code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_next_nfe_invoice_code(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_code INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('nfe_invoice_code_' || p_org_id::text));

  SELECT COALESCE(MAX(CAST(code AS INTEGER)), 0)
    INTO v_max_code
    FROM public.nfe_invoices
   WHERE organization_id = p_org_id
     AND code IS NOT NULL
     AND code ~ '^\d+$';

  RETURN LPAD((v_max_code + 1)::TEXT, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_nfe_invoice_code(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.nfe_invoices_set_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := public.get_next_nfe_invoice_code(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nfe_invoices_set_code ON public.nfe_invoices;
CREATE TRIGGER trg_nfe_invoices_set_code
  BEFORE INSERT ON public.nfe_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.nfe_invoices_set_code();

-- Backfill retroativo por organização, ordenado por criação (001 = mais antiga)
DO $$
DECLARE
  r RECORD;
  v_org UUID;
  v_seq INT;
  v_orgs UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.nfe_invoices WHERE code IS NULL
  ) INTO v_orgs;

  FOREACH v_org IN ARRAY v_orgs LOOP
    v_seq := 0;
    FOR r IN
      SELECT id FROM public.nfe_invoices
       WHERE organization_id = v_org AND code IS NULL
       ORDER BY created_at ASC
    LOOP
      v_seq := v_seq + 1;
      UPDATE public.nfe_invoices SET code = LPAD(v_seq::TEXT, 3, '0') WHERE id = r.id;
    END LOOP;
  END LOOP;
END;
$$;
