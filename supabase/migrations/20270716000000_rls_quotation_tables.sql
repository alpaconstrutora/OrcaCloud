-- =============================================================================
-- RLS das tabelas de cotação (Suprimentos)
--
-- Contexto: 20260218000001 criou quotation_requests/quotation_responses com
-- policy "Allow all ... USING(true)". A limpeza de policies de dev derrubou
-- essas policies, mas a RLS continuou ligada e NADA foi criado no lugar =>
-- tabelas 100% fechadas ("new row violates row-level security policy").
--
-- Tenancy: estas tabelas não têm organization_id. O vínculo é via
-- project_id -> projects.organization_id (project_id é obrigatório no form).
-- Fornecedor convidado é identificado por e-mail do JWT (mesmo modelo do
-- portal do fornecedor, que resolve o supplier por e-mail).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- Projeto pertence a uma org da qual o usuário é membro.
-- SECURITY DEFINER para não depender da RLS de projects dentro da policy.
CREATE OR REPLACE FUNCTION public.is_member_of_project_org(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND (
        public.is_org_member(p.organization_id)
        OR (
          p.organization_id IS NULL
          AND public.is_org_member((p.settings ->> 'organizationId')::uuid)
        )
      )
  );
$fn$;

-- Usuário logado é um dos fornecedores convidados (casado por e-mail).
-- SECURITY DEFINER: o fornecedor não é membro da org, logo não enxergaria a
-- própria linha em suppliers sob a RLS daquela tabela.
CREATE OR REPLACE FUNCTION public.is_invited_supplier(p_supplier_ids UUID[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.suppliers s
    WHERE s.id = ANY(COALESCE(p_supplier_ids, ARRAY[]::uuid[]))
      AND s.email IS NOT NULL
      AND LOWER(s.email) = LOWER(auth.jwt() ->> 'email')
  );
$fn$;

-- Usuário logado é o fornecedor da linha (casado por e-mail).
CREATE OR REPLACE FUNCTION public.is_self_supplier(p_supplier_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.suppliers s
    WHERE s.id = p_supplier_id
      AND s.email IS NOT NULL
      AND LOWER(s.email) = LOWER(auth.jwt() ->> 'email')
  );
$fn$;

-- -----------------------------------------------------------------------------
-- quotation_requests
-- -----------------------------------------------------------------------------
ALTER TABLE public.quotation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotation_requests_org_access"      ON public.quotation_requests;
DROP POLICY IF EXISTS "quotation_requests_supplier_select" ON public.quotation_requests;

-- Comprador (membro da org da obra) faz tudo.
CREATE POLICY "quotation_requests_org_access"
  ON public.quotation_requests
  FOR ALL
  TO authenticated
  USING (
    public.is_superadmin()
    OR public.is_member_of_project_org(project_id)
  )
  WITH CHECK (
    public.is_superadmin()
    OR public.is_member_of_project_org(project_id)
  );

-- Fornecedor convidado apenas lê a solicitação.
CREATE POLICY "quotation_requests_supplier_select"
  ON public.quotation_requests
  FOR SELECT
  TO authenticated
  USING (public.is_invited_supplier(invited_supplier_ids));

-- -----------------------------------------------------------------------------
-- quotation_responses
-- -----------------------------------------------------------------------------
ALTER TABLE public.quotation_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotation_responses_org_access"      ON public.quotation_responses;
DROP POLICY IF EXISTS "quotation_responses_supplier_access" ON public.quotation_responses;

-- Comprador enxerga/gerencia as respostas das cotações da sua org
-- (inclui contraproposta, aceite e recusa).
CREATE POLICY "quotation_responses_org_access"
  ON public.quotation_responses
  FOR ALL
  TO authenticated
  USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.quotation_requests r
      WHERE r.id = quotation_responses.request_id
        AND public.is_member_of_project_org(r.project_id)
    )
  )
  WITH CHECK (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.quotation_requests r
      WHERE r.id = quotation_responses.request_id
        AND public.is_member_of_project_org(r.project_id)
    )
  );

-- Fornecedor gerencia somente a própria proposta, e só em cotação p/ qual foi
-- convidado.
CREATE POLICY "quotation_responses_supplier_access"
  ON public.quotation_responses
  FOR ALL
  TO authenticated
  USING (
    public.is_self_supplier(supplier_id)
    AND EXISTS (
      SELECT 1 FROM public.quotation_requests r
      WHERE r.id = quotation_responses.request_id
        AND public.is_invited_supplier(r.invited_supplier_ids)
    )
  )
  WITH CHECK (
    public.is_self_supplier(supplier_id)
    AND EXISTS (
      SELECT 1 FROM public.quotation_requests r
      WHERE r.id = quotation_responses.request_id
        AND public.is_invited_supplier(r.invited_supplier_ids)
    )
  );
