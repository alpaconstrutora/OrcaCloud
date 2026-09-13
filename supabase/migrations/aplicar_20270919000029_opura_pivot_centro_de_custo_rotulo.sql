-- ============================================================
-- ÒPURA · Relatórios — rótulos das dimensões Centro de Custo,
-- Subcategoria (pai), Contrato, Pedido de Compra e Usuário
-- OrçaCloud SaaS · Migration 20270919000029
-- Idempotente (CREATE OR REPLACE).
--
-- Sintoma: na aba "Centro de Custo" de ÒPURA · Relatórios as
-- linhas exibem nomes de CATEGORIA ("Sem categoria", "Mão de
-- Obra / Serviço", "Folha de Pagamento"…) e o mesmo centro de
-- custo aparece espalhado em várias linhas — parece "não estar
-- conectado" a Organização › Centros de Custo. O mesmo acontece
-- em Subcategoria (pai), Contrato, Pedido de Compra e Usuário.
--
-- Causa (reproduzida em produção, org Alpa, 2026):
--   1. vw_fact_financial_tx expõe cost_center_id / contract_id /
--      purchase_order_id / category_parent_id mas NÃO faz JOIN
--      nas tabelas de origem — não existe *_name para eles.
--   2. fn_opura_pivot monta dim_key pelo id (correto), mas o CASE
--      de dim_label não tem ramo para essas dimensões e cai no
--      ELSE COALESCE(category_name, '—'). Como o GROUP BY é por
--      (dim_key, dim_label), cada centro vira N linhas — uma por
--      categoria — todas com rótulo de categoria.
--      Ex.: e9e4f46e… "Administrativo" saía como 4 linhas:
--      "Sem categoria" (133), "Mão de Obra / Serviço" (8),
--      "Contribuições de Terceiros" (5), "Folha de Pagamento" (2).
--
-- Correção:
--   • View: LEFT JOIN cost_centers_v2 (+ pai), contracts,
--     purchase_orders e financial_categories (pai); 4 colunas
--     acrescentadas ao FINAL (CREATE OR REPLACE VIEW só aceita
--     acrescentar colunas no fim):
--       cost_center_name     = "Pai › Nome" (desambigua centros
--                              homônimos em ramos diferentes, ex.
--                              "Condomínios › 007 - Bella Vista"
--                              vs "Assistência Técnica › 007 - Bella Vista")
--       category_parent_name = nome da categoria-pai
--       contract_name        = "número · título"
--       purchase_order_name  = "Pedido <número>"
--     Mantém security_invoker=on (aplicar_20270903000003);
--     grants são preservados pelo CREATE OR REPLACE.
--   • fn_opura_pivot: ramos de dim_label para cost_center,
--     category_parent, contract, purchase_order e user.
--     'user' não faz JOIN: internal_transactions.created_by está
--     vazio em 100% dos lançamentos e profiles tem RLS
--     (id = auth.uid()) — numa view security_invoker o nome só
--     apareceria para o próprio usuário. Fica "— Sem usuário".
--     Corpo copiado do arquivo 20270216000000 (fonte da verdade),
--     só os ramos acrescentados. Assinatura inalterada — o
--     frontend (opuraAnalyticsService.ts) não muda.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. View — acrescenta colunas de nome ao FINAL
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_fact_financial_tx
WITH (security_invoker = on) AS
SELECT
  it.id,
  it.organization_id,
  it.transaction_date,
  it.payment_date,
  it.due_date,
  it.competencia_date,
  it.direction,
  it.status,
  it.business_status,
  it.approval_status,
  it.amount,
  it.category_id,
  fc.parent_id                                    AS category_parent_id,
  it.project_id,
  it.cost_center_id,
  it.supplier_id,
  it.contract_id,
  it.purchase_order_id,
  it.payment_account_id,
  it.party_id                                     AS client_id,
  it.created_by,
  p.empresa_id,
  COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO')     AS dre_group,
  COALESCE(fc.nature,    'EXPENSE')               AS nature,
  COALESCE(fc.name, it.category, 'Sem categoria') AS category_name,
  COALESCE(fc.sort_order, 99)                     AS sort_order,
  s.name                                          AS supplier_name,
  COALESCE(it.party_name, cl.name)                AS client_name,
  p.name                                          AS project_name,
  pa.name                                         AS account_name,
  it.source_system,
  it.reference_id,
  it.description,
  CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount ELSE 0 END AS credit_realizado,
  CASE WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN it.amount ELSE 0 END AS debit_realizado,
  CASE WHEN it.direction = 'CREDIT' AND it.status = 'PENDING'     THEN it.amount ELSE 0 END AS credit_previsto,
  CASE WHEN it.direction = 'DEBIT'  AND it.status = 'PENDING'     THEN it.amount ELSE 0 END AS debit_previsto,
  CASE
    WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN  it.amount
    WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN -it.amount
    ELSE 0
  END AS net_realizado,
  CASE
    WHEN it.direction = 'CREDIT' AND it.status = 'PENDING' THEN  it.amount
    WHEN it.direction = 'DEBIT'  AND it.status = 'PENDING' THEN -it.amount
    ELSE 0
  END AS net_previsto,
  COALESCE(NULLIF(it.party_name, ''), NULLIF(it.entity_name, ''), s.name, cl.name) AS party_label,
  -- NOVO: nomes das dimensões que antes caíam no rótulo de categoria
  CASE
    WHEN cc.id IS NULL THEN NULL
    WHEN ccp.name IS NOT NULL THEN ccp.name || ' › ' || cc.name
    ELSE cc.name
  END                                             AS cost_center_name,
  fcp.name                                        AS category_parent_name,
  CASE
    WHEN ct.id IS NULL THEN NULL
    ELSE CONCAT_WS(' · ', NULLIF(ct.number, ''), NULLIF(ct.title, ''))
  END                                             AS contract_name,
  CASE
    WHEN po.id IS NULL THEN NULL
    ELSE 'Pedido ' || COALESCE(NULLIF(po.number, ''), LEFT(po.id::text, 8))
  END                                             AS purchase_order_name
FROM public.internal_transactions it
LEFT JOIN public.financial_categories fc  ON fc.id  = it.category_id
LEFT JOIN public.financial_categories fcp ON fcp.id = fc.parent_id
LEFT JOIN public.suppliers            s   ON s.id   = it.supplier_id
LEFT JOIN public.clients              cl  ON cl.id  = it.party_id
LEFT JOIN public.projects             p   ON p.id   = it.project_id
LEFT JOIN public.payment_accounts     pa  ON pa.id  = it.payment_account_id
LEFT JOIN public.cost_centers_v2      cc  ON cc.id  = it.cost_center_id
LEFT JOIN public.cost_centers_v2      ccp ON ccp.id = cc.parent_id
LEFT JOIN public.contracts            ct  ON ct.id  = it.contract_id
LEFT JOIN public.purchase_orders      po  ON po.id  = it.purchase_order_id
WHERE it.status <> 'CANCELLED';

-- ────────────────────────────────────────────────────────────
-- 2. fn_opura_pivot — ramos de dim_label
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_opura_pivot(
  p_organization_id  UUID,
  p_dimension        TEXT DEFAULT 'category',
  p_date_field       TEXT DEFAULT 'transaction',
  p_date_from        DATE DEFAULT NULL,
  p_date_to          DATE DEFAULT NULL,
  p_project_id       UUID DEFAULT NULL,
  p_supplier_id      UUID DEFAULT NULL,
  p_client_id        UUID DEFAULT NULL,
  p_contract_id      UUID DEFAULT NULL,
  p_purchase_order_id UUID DEFAULT NULL,
  p_cost_center_id   UUID DEFAULT NULL,
  p_category_id      UUID DEFAULT NULL,
  p_account_id       UUID DEFAULT NULL,
  p_empresa_id       UUID DEFAULT NULL,
  p_direction        TEXT DEFAULT NULL,
  p_status           TEXT DEFAULT NULL,
  p_business_status  TEXT DEFAULT NULL
)
RETURNS TABLE (
  dimension_key    TEXT,
  dimension_label  TEXT,
  qtd              BIGINT,
  credit_realizado NUMERIC,
  debit_realizado  NUMERIC,
  credit_previsto  NUMERIC,
  debit_previsto   NUMERIC,
  net_realizado    NUMERIC,
  vencido          NUMERIC
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

  RETURN QUERY
  WITH base AS (
    SELECT
      f.*,
      CASE p_dimension
        WHEN 'supplier'        THEN COALESCE(f.supplier_id::text, CASE WHEN f.direction = 'DEBIT' THEN f.party_label END)
        WHEN 'project'         THEN f.project_id::text
        WHEN 'cost_center'     THEN f.cost_center_id::text
        WHEN 'category'        THEN f.category_id::text
        WHEN 'category_parent' THEN f.category_parent_id::text
        WHEN 'client'          THEN f.client_id::text
        WHEN 'contract'        THEN f.contract_id::text
        WHEN 'purchase_order'  THEN f.purchase_order_id::text
        WHEN 'account'         THEN f.payment_account_id::text
        WHEN 'empresa'         THEN f.empresa_id::text
        WHEN 'user'            THEN f.created_by::text
        WHEN 'contraparte'     THEN f.party_label
        WHEN 'tx_month'        THEN to_char(date_trunc('month', f.transaction_date), 'YYYY-MM')
        WHEN 'due_month'       THEN to_char(date_trunc('month', f.due_date),         'YYYY-MM')
        WHEN 'pay_month'       THEN to_char(date_trunc('month', f.payment_date),     'YYYY-MM')
        WHEN 'comp_month'      THEN to_char(date_trunc('month', f.competencia_date), 'YYYY-MM')
        WHEN 'dre_group'       THEN f.dre_group
        ELSE f.category_id::text
      END AS dim_key,
      CASE p_dimension
        WHEN 'supplier'        THEN COALESCE(f.supplier_name, CASE WHEN f.direction = 'DEBIT' THEN f.party_label END, '— Sem fornecedor')
        WHEN 'project'         THEN COALESCE(f.project_name,  '— Sem obra')
        WHEN 'cost_center'     THEN COALESCE(f.cost_center_name,     '— Sem centro de custo')
        WHEN 'category'        THEN COALESCE(f.category_name, '— Sem categoria')
        WHEN 'category_parent' THEN COALESCE(f.category_parent_name, '— Sem categoria-pai')
        WHEN 'client'          THEN COALESCE(f.client_name,   '— Sem cliente')
        WHEN 'contract'        THEN COALESCE(f.contract_name,        '— Sem contrato')
        WHEN 'purchase_order'  THEN COALESCE(f.purchase_order_name,  '— Sem pedido')
        WHEN 'account'         THEN COALESCE(f.account_name,  '— Sem conta')
        WHEN 'user'            THEN COALESCE(f.created_by::text,     '— Sem usuário')
        WHEN 'contraparte'     THEN COALESCE(f.party_label,   '— Sem contraparte')
        WHEN 'dre_group'       THEN f.dre_group
        WHEN 'tx_month'        THEN to_char(date_trunc('month', f.transaction_date), 'YYYY-MM')
        WHEN 'due_month'       THEN to_char(date_trunc('month', f.due_date),         'YYYY-MM')
        WHEN 'pay_month'       THEN to_char(date_trunc('month', f.payment_date),     'YYYY-MM')
        WHEN 'comp_month'      THEN to_char(date_trunc('month', f.competencia_date), 'YYYY-MM')
        ELSE COALESCE(f.category_name, '—')
      END AS dim_label,
      CASE p_date_field
        WHEN 'due'         THEN f.due_date
        WHEN 'payment'     THEN f.payment_date
        WHEN 'competencia' THEN f.competencia_date
        ELSE f.transaction_date
      END AS filter_date
    FROM public.vw_fact_financial_tx f
    WHERE f.organization_id = ANY(v_targets)
      AND (p_project_id        IS NULL OR f.project_id        = p_project_id)
      AND (p_supplier_id       IS NULL OR f.supplier_id       = p_supplier_id)
      AND (p_client_id         IS NULL OR f.client_id         = p_client_id)
      AND (p_contract_id       IS NULL OR f.contract_id       = p_contract_id)
      AND (p_purchase_order_id IS NULL OR f.purchase_order_id = p_purchase_order_id)
      AND (p_cost_center_id    IS NULL OR f.cost_center_id    = p_cost_center_id)
      AND (p_category_id       IS NULL OR f.category_id       = p_category_id)
      AND (p_account_id        IS NULL OR f.payment_account_id = p_account_id)
      AND (p_empresa_id        IS NULL OR f.empresa_id        = p_empresa_id)
      AND (p_direction         IS NULL OR f.direction         = p_direction)
      AND (p_status            IS NULL OR f.status            = p_status)
      AND (p_business_status   IS NULL OR f.business_status   = p_business_status)
  )
  SELECT
    b.dim_key   AS dimension_key,
    b.dim_label AS dimension_label,
    COUNT(*)    AS qtd,
    COALESCE(SUM(b.credit_realizado), 0) AS credit_realizado,
    COALESCE(SUM(b.debit_realizado),  0) AS debit_realizado,
    COALESCE(SUM(b.credit_previsto),  0) AS credit_previsto,
    COALESCE(SUM(b.debit_previsto),   0) AS debit_previsto,
    COALESCE(SUM(b.net_realizado),    0) AS net_realizado,
    COALESCE(SUM(CASE WHEN b.status = 'PENDING' AND b.due_date IS NOT NULL AND b.due_date < CURRENT_DATE
                      THEN b.amount ELSE 0 END), 0) AS vencido
  FROM base b
  WHERE (p_date_from IS NULL OR b.filter_date >= p_date_from)
    AND (p_date_to   IS NULL OR b.filter_date <= p_date_to)
  GROUP BY b.dim_key, b.dim_label
  ORDER BY COALESCE(SUM(b.net_realizado), 0) DESC, COUNT(*) DESC;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- FIM: aplicar_20270919000029_opura_pivot_centro_de_custo_rotulo.sql
-- ────────────────────────────────────────────────────────────
