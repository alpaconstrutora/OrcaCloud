-- Código sequencial (001, 002, 003...) único por organização, para:
-- clients, suppliers, investors, companies, organization_members, payment_accounts.
-- Mesmo molde já usado em projects/contracts (get_next_project_code, get_next_contract_number):
-- índice único parcial por org + RPC com advisory lock + backfill retroativo por data.
--
-- organization_id é NULLABLE em clients/suppliers/investors (registro "Todas as
-- Organizações"/global) — para esses casos, COALESCE trata todos os registros
-- globais como um único grupo de numeração (senão NULL <> NULL quebraria a
-- unicidade do índice).

-- ═══════════════════════════════════════════════════════════════════════
-- CLIENTS
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_org_code
  ON public.clients (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), code)
  WHERE code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_next_client_code(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_code INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('client_code_' || COALESCE(p_org_id::text, 'null')));

  SELECT COALESCE(MAX(CAST(code AS INTEGER)), 0)
    INTO v_max_code
    FROM public.clients
   WHERE COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = COALESCE(p_org_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND code IS NOT NULL
     AND code ~ '^\d+$';

  RETURN LPAD((v_max_code + 1)::TEXT, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_client_code(UUID) TO authenticated;

DO $$
DECLARE
  r RECORD;
  v_org UUID;
  v_seq INT;
  v_orgs UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
      FROM public.clients
     WHERE code IS NULL
  ) INTO v_orgs;

  FOREACH v_org IN ARRAY v_orgs LOOP
    v_seq := 0;
    FOR r IN
      SELECT id FROM public.clients
       WHERE COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_org
         AND code IS NULL
       ORDER BY created_at ASC
    LOOP
      v_seq := v_seq + 1;
      UPDATE public.clients SET code = LPAD(v_seq::TEXT, 3, '0') WHERE id = r.id;
    END LOOP;
  END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- SUPPLIERS
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_org_code
  ON public.suppliers (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), code)
  WHERE code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_next_supplier_code(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_code INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('supplier_code_' || COALESCE(p_org_id::text, 'null')));

  SELECT COALESCE(MAX(CAST(code AS INTEGER)), 0)
    INTO v_max_code
    FROM public.suppliers
   WHERE COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = COALESCE(p_org_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND code IS NOT NULL
     AND code ~ '^\d+$';

  RETURN LPAD((v_max_code + 1)::TEXT, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_supplier_code(UUID) TO authenticated;

DO $$
DECLARE
  r RECORD;
  v_org UUID;
  v_seq INT;
  v_orgs UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
      FROM public.suppliers
     WHERE code IS NULL
  ) INTO v_orgs;

  FOREACH v_org IN ARRAY v_orgs LOOP
    v_seq := 0;
    FOR r IN
      SELECT id FROM public.suppliers
       WHERE COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_org
         AND code IS NULL
       ORDER BY created_at ASC
    LOOP
      v_seq := v_seq + 1;
      UPDATE public.suppliers SET code = LPAD(v_seq::TEXT, 3, '0') WHERE id = r.id;
    END LOOP;
  END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- INVESTORS
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE public.investors ADD COLUMN IF NOT EXISTS code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_investors_org_code
  ON public.investors (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), code)
  WHERE code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_next_investor_code(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_code INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('investor_code_' || COALESCE(p_org_id::text, 'null')));

  SELECT COALESCE(MAX(CAST(code AS INTEGER)), 0)
    INTO v_max_code
    FROM public.investors
   WHERE COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = COALESCE(p_org_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND code IS NOT NULL
     AND code ~ '^\d+$';

  RETURN LPAD((v_max_code + 1)::TEXT, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_investor_code(UUID) TO authenticated;

DO $$
DECLARE
  r RECORD;
  v_org UUID;
  v_seq INT;
  v_orgs UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
      FROM public.investors
     WHERE code IS NULL
  ) INTO v_orgs;

  FOREACH v_org IN ARRAY v_orgs LOOP
    v_seq := 0;
    FOR r IN
      SELECT id FROM public.investors
       WHERE COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_org
         AND code IS NULL
       ORDER BY created_at ASC
    LOOP
      v_seq := v_seq + 1;
      UPDATE public.investors SET code = LPAD(v_seq::TEXT, 3, '0') WHERE id = r.id;
    END LOOP;
  END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- COMPANIES (Empresas do Grupo) — org_id NOT NULL, sem modo global
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_org_code
  ON public.companies (org_id, code)
  WHERE code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_next_company_code(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_code INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('company_code_' || p_org_id::text));

  SELECT COALESCE(MAX(CAST(code AS INTEGER)), 0)
    INTO v_max_code
    FROM public.companies
   WHERE org_id = p_org_id
     AND code IS NOT NULL
     AND code ~ '^\d+$';

  RETURN LPAD((v_max_code + 1)::TEXT, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_company_code(UUID) TO authenticated;

DO $$
DECLARE
  r RECORD;
  v_org UUID;
  v_seq INT;
  v_orgs UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT org_id FROM public.companies WHERE code IS NULL
  ) INTO v_orgs;

  FOREACH v_org IN ARRAY v_orgs LOOP
    v_seq := 0;
    FOR r IN
      SELECT id FROM public.companies WHERE org_id = v_org AND code IS NULL ORDER BY created_at ASC
    LOOP
      v_seq := v_seq + 1;
      UPDATE public.companies SET code = LPAD(v_seq::TEXT, 3, '0') WHERE id = r.id;
    END LOOP;
  END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- ORGANIZATION_MEMBERS (Usuários) — organization_id NOT NULL, sem created_at
-- (usa joined_at)
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_members_org_code
  ON public.organization_members (organization_id, code)
  WHERE code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_next_member_code(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_code INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('member_code_' || p_org_id::text));

  SELECT COALESCE(MAX(CAST(code AS INTEGER)), 0)
    INTO v_max_code
    FROM public.organization_members
   WHERE organization_id = p_org_id
     AND code IS NOT NULL
     AND code ~ '^\d+$';

  RETURN LPAD((v_max_code + 1)::TEXT, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_member_code(UUID) TO authenticated;

DO $$
DECLARE
  r RECORD;
  v_org UUID;
  v_seq INT;
  v_orgs UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members WHERE code IS NULL
  ) INTO v_orgs;

  FOREACH v_org IN ARRAY v_orgs LOOP
    v_seq := 0;
    FOR r IN
      SELECT id FROM public.organization_members
       WHERE organization_id = v_org AND code IS NULL
       ORDER BY joined_at ASC
    LOOP
      v_seq := v_seq + 1;
      UPDATE public.organization_members SET code = LPAD(v_seq::TEXT, 3, '0') WHERE id = r.id;
    END LOOP;
  END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- PAYMENT_ACCOUNTS (Contas)
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE public.payment_accounts ADD COLUMN IF NOT EXISTS code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_accounts_org_code
  ON public.payment_accounts (organization_id, code)
  WHERE code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_next_payment_account_code(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_code INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('payment_account_code_' || p_org_id::text));

  SELECT COALESCE(MAX(CAST(code AS INTEGER)), 0)
    INTO v_max_code
    FROM public.payment_accounts
   WHERE organization_id = p_org_id
     AND code IS NOT NULL
     AND code ~ '^\d+$';

  RETURN LPAD((v_max_code + 1)::TEXT, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_payment_account_code(UUID) TO authenticated;

DO $$
DECLARE
  r RECORD;
  v_org UUID;
  v_seq INT;
  v_orgs UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.payment_accounts WHERE code IS NULL
  ) INTO v_orgs;

  FOREACH v_org IN ARRAY v_orgs LOOP
    v_seq := 0;
    FOR r IN
      SELECT id FROM public.payment_accounts
       WHERE organization_id = v_org AND code IS NULL
       ORDER BY created_at ASC
    LOOP
      v_seq := v_seq + 1;
      UPDATE public.payment_accounts SET code = LPAD(v_seq::TEXT, 3, '0') WHERE id = r.id;
    END LOOP;
  END LOOP;
END;
$$;
