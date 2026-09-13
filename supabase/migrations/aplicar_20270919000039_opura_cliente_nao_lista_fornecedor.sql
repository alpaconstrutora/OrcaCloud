-- ============================================================
-- ÒPURA · Relatórios — dimensão Cliente não lista fornecedores nas saídas
-- OrçaCloud SaaS · Migration 20270919000039
-- Idempotente (CREATE OR REPLACE).
--
-- Sintoma: Relatórios › aba Cliente › Direção = Saídas listava fornecedores,
-- impostos, órgãos e colaboradores como se fossem clientes.
--
-- Causa (medido em produção, 2026-09-13): nas saídas party_id é sempre nulo
-- (0 de 1.888) e party_name guarda a contraparte do pagamento (fornecedor,
-- TAX, GOVERNMENT, EMPLOYEE). A view fazia
--   client_id   = it.party_id                 → nulo
--   client_name = COALESCE(it.party_name, cl.name) → nome do fornecedor
-- e fn_opura_pivot agrupa por (client_id, client_name): chave nula + rótulo
-- de fornecedor = uma "linha de cliente" por fornecedor.
--
-- Correção:
--   • View: client_id = cl.id (só quando resolve em clients);
--     client_name = COALESCE(cl.name, party_name se party_type = 'CLIENT').
--     Nas entradas nada muda (362/362 têm party_type CLIENT e party_id em clients).
--   • fn_opura_entries: supplier_name = COALESCE(s.name, party_label nas saídas),
--     mesma regra da dimensão Fornecedor — o extrato continua mostrando a
--     contraparte das saídas sem supplier_id (antes chegava por client_name).
--     Assinatura inalterada. Corpo copiado de 20270127000000 (fonte da verdade).
--   • Mantém security_invoker=on e a proteção da view (viewSecurityGuard).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. View
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
  -- Cliente só é cliente quando party_id resolve em clients. Nas saídas
  -- party_id é nulo e party_name guarda o FORNECEDOR/imposto/órgão — antes
  -- isso vazava para a dimensão Cliente como se fosse cliente.
  cl.id                                           AS client_id,
  it.created_by,
  p.empresa_id,
  COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO')     AS dre_group,
  COALESCE(fc.nature,    'EXPENSE')               AS nature,
  COALESCE(fc.name, it.category, 'Sem categoria') AS category_name,
  COALESCE(fc.sort_order, 99)                     AS sort_order,
  s.name                                          AS supplier_name,
  COALESCE(cl.name, CASE WHEN it.party_type = 'CLIENT' THEN NULLIF(it.party_name, '') END) AS client_name,
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

-- Trava de views (viewSecurityGuard): toda view recriada repete a proteção
-- no mesmo arquivo — CREATE OR REPLACE preserva os grants, mas quem lê o
-- arquivo precisa ver que a view nasce fechada para anon.
REVOKE ALL ON public.vw_fact_financial_tx FROM anon;
REVOKE ALL ON public.vw_fact_financial_tx FROM PUBLIC;
GRANT SELECT ON public.vw_fact_financial_tx TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 2. fn_opura_entries
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_opura_entries(
  p_organization_id   UUID,
  p_date_field        TEXT DEFAULT 'transaction',
  p_date_from         DATE DEFAULT NULL,
  p_date_to           DATE DEFAULT NULL,
  p_project_id        UUID DEFAULT NULL,
  p_supplier_id       UUID DEFAULT NULL,
  p_client_id         UUID DEFAULT NULL,
  p_contract_id       UUID DEFAULT NULL,
  p_purchase_order_id UUID DEFAULT NULL,
  p_cost_center_id    UUID DEFAULT NULL,
  p_category_id       UUID DEFAULT NULL,
  p_account_id        UUID DEFAULT NULL,
  p_empresa_id        UUID DEFAULT NULL,
  p_direction         TEXT DEFAULT NULL,
  p_status            TEXT DEFAULT NULL,
  p_business_status   TEXT DEFAULT NULL,
  p_dre_group         TEXT DEFAULT NULL,
  p_category_parent_id UUID DEFAULT NULL,
  p_created_by        UUID DEFAULT NULL,
  p_party_label       TEXT DEFAULT NULL,
  p_limit             INT  DEFAULT 100,
  p_offset            INT  DEFAULT 0
)
RETURNS TABLE (
  id              UUID,
  transaction_date DATE,
  due_date        DATE,
  payment_date    DATE,
  direction       TEXT,
  status          TEXT,
  amount          NUMERIC,
  category_name   TEXT,
  dre_group       TEXT,
  supplier_name   TEXT,
  client_name     TEXT,
  project_name    TEXT,
  account_name    TEXT,
  description     TEXT,
  total_count     BIGINT
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
  WITH filtered AS (
    SELECT
      f.id, f.transaction_date, f.due_date, f.payment_date,
      f.direction, f.status, f.amount, f.category_name, f.dre_group,
      -- Saída sem supplier_id: a contraparte (party_label) entra como fornecedor,
      -- mesma regra da dimensão 'supplier' em fn_opura_pivot. Antes ela chegava
      -- ao extrato via client_name, que agora é só cliente de verdade.
      COALESCE(f.supplier_name, CASE WHEN f.direction = 'DEBIT' THEN f.party_label END) AS supplier_name,
      f.client_name, f.project_name, f.account_name,
      f.description,
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
      AND (p_dre_group         IS NULL OR f.dre_group         = p_dre_group)
      AND (p_category_parent_id IS NULL OR f.category_parent_id = p_category_parent_id)
      AND (p_created_by        IS NULL OR f.created_by        = p_created_by)
      AND (p_party_label       IS NULL OR f.party_label       = p_party_label)
  ),
  dated AS (
    SELECT * FROM filtered
    WHERE (p_date_from IS NULL OR filter_date >= p_date_from)
      AND (p_date_to   IS NULL OR filter_date <= p_date_to)
  )
  SELECT
    d.id, d.transaction_date, d.due_date, d.payment_date,
    d.direction, d.status, d.amount, d.category_name, d.dre_group,
    d.supplier_name, d.client_name, d.project_name, d.account_name,
    d.description,
    COUNT(*) OVER () AS total_count
  FROM dated d
  ORDER BY d.transaction_date DESC, d.id
  LIMIT  GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

-- FIM: aplicar_20270919000039_opura_cliente_nao_lista_fornecedor.sql
