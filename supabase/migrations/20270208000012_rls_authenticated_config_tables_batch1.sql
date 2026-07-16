-- ============================================================
-- Migration: 20270208000012_rls_authenticated_config_tables_batch1.sql
-- Projeto RLS camada AUTHENTICATED (ver project_rls_authenticated_layer_gap) —
-- LOTE 1: tabelas de config per-org com organization_id direto e SEM consumidor
-- de portal externo. Fecha o cross-tenant read/write (policies authenticated
-- qual=true → qualquer logado lia/escrevia config de qualquer empresa).
--
-- Tabelas: contract_types, financial_categories, supplier_categories.
-- Preservam DEFAULTS GLOBAIS (organization_id IS NULL): financial_categories
-- tem 38, supplier_categories tem 8 — por isso o predicado inclui o ramo NULL.
-- Padrão da casa (já usado em supplier_categories_manage):
--   organization_id IS NULL OR is_org_member(organization_id)
-- Uma policy ALL por tabela cobre SELECT (USING) e INSERT/UPDATE (WITH CHECK).
-- is_org_member(uuid) é função SECURITY DEFINER já existente no schema.
--
-- Sem companheiro de código: os services já setam organization_id nos inserts;
-- e o ramo NULL não bloqueia criação. Verificado: nenhum portal
-- client/supplier/broker/investor/partner lê essas tabelas.
-- Nomes das policies antigas conferidos no remoto (pg_policies).
-- ============================================================

-- ─── contract_types (15 linhas, 0 globais) ───────────────────
DROP POLICY IF EXISTS "Allow authenticated users to manage contract types" ON public.contract_types;
DROP POLICY IF EXISTS "Allow authenticated users to read contract types" ON public.contract_types;

CREATE POLICY "contract_types_org" ON public.contract_types
  FOR ALL TO authenticated
  USING (organization_id IS NULL OR public.is_org_member(organization_id))
  WITH CHECK (organization_id IS NULL OR public.is_org_member(organization_id));

-- ─── financial_categories (51 linhas, 38 globais) ────────────
DROP POLICY IF EXISTS "Authenticated users can manage financial_categories" ON public.financial_categories;
DROP POLICY IF EXISTS "Authenticated users can read financial_categories" ON public.financial_categories;

CREATE POLICY "financial_categories_org" ON public.financial_categories
  FOR ALL TO authenticated
  USING (organization_id IS NULL OR public.is_org_member(organization_id))
  WITH CHECK (organization_id IS NULL OR public.is_org_member(organization_id));

-- ─── supplier_categories (9 linhas, 8 globais) ───────────────
-- supplier_categories_manage (ALL) já é org-scoped correto; só removemos as 2
-- policies de SELECT abertas (qual=true) e criamos uma SELECT org-scoped.
DROP POLICY IF EXISTS "Allow authenticated users to read categories" ON public.supplier_categories;
DROP POLICY IF EXISTS "supplier_categories_read" ON public.supplier_categories;

CREATE POLICY "supplier_categories_read" ON public.supplier_categories
  FOR SELECT TO authenticated
  USING (organization_id IS NULL OR public.is_org_member(organization_id));
