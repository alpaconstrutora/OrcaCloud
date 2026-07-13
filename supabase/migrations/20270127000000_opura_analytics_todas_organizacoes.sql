-- ============================================================
-- ÒPURA Financial Analytics — suporta "Todas as Organizações"
-- (p_organization_id NULL) nas 6 funções da família fn_opura_*
-- OrçaCloud SaaS · Migration 20270127000000
--
-- Mesmo contexto da migration 20270126000000 (BI Executivo): o
-- AppRouter/seletor global agora repassa NULL quando o usuário
-- escolhe "Todas as Organizações", e as RPCs precisam saber agregar
-- sobre as organizações do usuário nesse caso.
--
-- Duas categorias de função aqui, tratadas de formas diferentes:
--
-- 1. fn_opura_pivot / fn_opura_entries — agregam livremente sobre
--    vw_fact_financial_tx (sem entidade única já selecionada).
--    Precisam da mesma máquina do BI: calcular as organizações do
--    usuário (v_org_ids), validar posse de p_organization_id quando
--    informado, e filtrar por ANY(v_targets) quando NULL.
--
-- 2. fn_opura_obra_kpis / fn_opura_cliente_kpis /
--    fn_opura_fornecedor_kpis / fn_opura_obra_mensal — já recebem
--    uma entidade específica (p_project_id / p_client_id /
--    p_supplier_id), que por si só restringe a exatamente uma
--    organização. Não há "soma entre organizações" a fazer aqui —
--    só precisam parar de exigir p_organization_id (relaxando para
--    "IS NULL OR ="), pois a proteção real contra cross-tenant já
--    vem da RLS de `contracts`/`internal_transactions` (nenhuma das
--    6 funções é SECURITY DEFINER — todas rodam com os privilégios
--    de quem chama).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. fn_opura_pivot (última versão: 20261221000011, dimensão
--    'supplier' com fallback para party_label)
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
        WHEN 'category'        THEN COALESCE(f.category_name, '— Sem categoria')
        WHEN 'client'          THEN COALESCE(f.client_name,   '— Sem cliente')
        WHEN 'account'         THEN COALESCE(f.account_name,  '— Sem conta')
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
    dim_key   AS dimension_key,
    dim_label AS dimension_label,
    COUNT(*)  AS qtd,
    COALESCE(SUM(credit_realizado), 0) AS credit_realizado,
    COALESCE(SUM(debit_realizado),  0) AS debit_realizado,
    COALESCE(SUM(credit_previsto),  0) AS credit_previsto,
    COALESCE(SUM(debit_previsto),   0) AS debit_previsto,
    COALESCE(SUM(net_realizado),    0) AS net_realizado,
    COALESCE(SUM(CASE WHEN status = 'PENDING' AND due_date IS NOT NULL AND due_date < CURRENT_DATE
                      THEN amount ELSE 0 END), 0) AS vencido
  FROM base
  WHERE (p_date_from IS NULL OR filter_date >= p_date_from)
    AND (p_date_to   IS NULL OR filter_date <= p_date_to)
  GROUP BY dim_key, dim_label
  ORDER BY net_realizado DESC, qtd DESC;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. fn_opura_entries (última versão: 20261221000009, com filtro
--    p_party_label)
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
      f.supplier_name, f.client_name, f.project_name, f.account_name,
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

-- ────────────────────────────────────────────────────────────
-- 3. fn_opura_obra_kpis / cliente_kpis / fornecedor_kpis / obra_mensal
--    — já recebem uma entidade única; só relaxam p_organization_id
--    para aceitar NULL (RLS de contracts/internal_transactions
--    continua sendo a proteção real, já que nenhuma é SECURITY
--    DEFINER).
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_opura_obra_kpis(
  p_organization_id UUID,
  p_project_id      UUID,
  p_date_from       DATE DEFAULT NULL,
  p_date_to         DATE DEFAULT NULL
)
RETURNS TABLE (
  contratado_receita NUMERIC,
  contratado_custo   NUMERIC,
  recebido           NUMERIC,
  pago               NUMERIC,
  a_receber          NUMERIC,
  a_pagar            NUMERIC,
  vencido_receber    NUMERIC,
  vencido_pagar      NUMERIC,
  qtd_contratos      BIGINT,
  qtd_lancamentos    BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH contr AS (
    SELECT
      COALESCE(SUM(current_value) FILTER (
        WHERE direction = 'OUTGOING' OR (direction IS NULL AND supplier_id IS NOT NULL)
      ), 0) AS custo,
      COALESCE(SUM(current_value) FILTER (
        WHERE NOT (direction = 'OUTGOING' OR (direction IS NULL AND supplier_id IS NOT NULL))
      ), 0) AS receita,
      COUNT(*) AS qtd
    FROM public.contracts
    WHERE (p_organization_id IS NULL OR organization_id = p_organization_id)
      AND project_id = p_project_id
      AND status NOT IN ('Rascunho', 'Cancelado')
  ),
  led AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE direction = 'CREDIT' AND status = 'CONCILIATED'), 0) AS recebido,
      COALESCE(SUM(amount) FILTER (WHERE direction = 'DEBIT'  AND status = 'CONCILIATED'), 0) AS pago,
      COALESCE(SUM(amount) FILTER (WHERE direction = 'CREDIT' AND status = 'PENDING'),     0) AS a_receber,
      COALESCE(SUM(amount) FILTER (WHERE direction = 'DEBIT'  AND status = 'PENDING'),     0) AS a_pagar,
      COALESCE(SUM(amount) FILTER (
        WHERE direction = 'CREDIT' AND status = 'PENDING' AND due_date IS NOT NULL AND due_date < CURRENT_DATE
      ), 0) AS venc_receber,
      COALESCE(SUM(amount) FILTER (
        WHERE direction = 'DEBIT'  AND status = 'PENDING' AND due_date IS NOT NULL AND due_date < CURRENT_DATE
      ), 0) AS venc_pagar,
      COUNT(*) AS qtd
    FROM public.internal_transactions
    WHERE (p_organization_id IS NULL OR organization_id = p_organization_id)
      AND project_id = p_project_id
      AND status <> 'CANCELLED'
      AND (p_date_from IS NULL OR transaction_date >= p_date_from)
      AND (p_date_to   IS NULL OR transaction_date <= p_date_to)
  )
  SELECT
    contr.receita, contr.custo,
    led.recebido, led.pago, led.a_receber, led.a_pagar,
    led.venc_receber, led.venc_pagar,
    contr.qtd, led.qtd
  FROM contr, led;
$$;

CREATE OR REPLACE FUNCTION public.fn_opura_cliente_kpis(
  p_organization_id UUID,
  p_client_id       UUID,
  p_date_from       DATE DEFAULT NULL,
  p_date_to         DATE DEFAULT NULL
)
RETURNS TABLE (
  contratado       NUMERIC,
  recebido         NUMERIC,
  a_receber        NUMERIC,
  vencido          NUMERIC,
  devolvido        NUMERIC,
  qtd_contratos    BIGINT,
  qtd_lancamentos  BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH contr AS (
    SELECT
      COALESCE(SUM(current_value), 0) AS contratado,
      COUNT(*) AS qtd
    FROM public.contracts
    WHERE (p_organization_id IS NULL OR organization_id = p_organization_id)
      AND client_id = p_client_id
      AND status NOT IN ('Rascunho', 'Cancelado')
  ),
  led AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE direction = 'CREDIT' AND status = 'CONCILIATED'), 0) AS recebido,
      COALESCE(SUM(amount) FILTER (WHERE direction = 'CREDIT' AND status = 'PENDING'),     0) AS a_receber,
      COALESCE(SUM(amount) FILTER (
        WHERE direction = 'CREDIT' AND status = 'PENDING' AND due_date IS NOT NULL AND due_date < CURRENT_DATE
      ), 0) AS vencido,
      COALESCE(SUM(amount) FILTER (WHERE direction = 'DEBIT' AND status = 'CONCILIATED'), 0) AS devolvido,
      COUNT(*) AS qtd
    FROM public.internal_transactions
    WHERE (p_organization_id IS NULL OR organization_id = p_organization_id)
      AND party_id = p_client_id
      AND status <> 'CANCELLED'
      AND (p_date_from IS NULL OR transaction_date >= p_date_from)
      AND (p_date_to   IS NULL OR transaction_date <= p_date_to)
  )
  SELECT
    contr.contratado,
    led.recebido, led.a_receber, led.vencido, led.devolvido,
    contr.qtd, led.qtd
  FROM contr, led;
$$;

CREATE OR REPLACE FUNCTION public.fn_opura_fornecedor_kpis(
  p_organization_id UUID,
  p_supplier_id     UUID,
  p_date_from       DATE DEFAULT NULL,
  p_date_to         DATE DEFAULT NULL
)
RETURNS TABLE (
  contratado       NUMERIC,
  pago             NUMERIC,
  a_pagar          NUMERIC,
  vencido          NUMERIC,
  estornado        NUMERIC,
  qtd_contratos    BIGINT,
  qtd_lancamentos  BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH contr AS (
    SELECT
      COALESCE(SUM(current_value), 0) AS contratado,
      COUNT(*) AS qtd
    FROM public.contracts
    WHERE (p_organization_id IS NULL OR organization_id = p_organization_id)
      AND supplier_id = p_supplier_id
      AND status NOT IN ('Rascunho', 'Cancelado')
  ),
  led AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE direction = 'DEBIT'  AND status = 'CONCILIATED'), 0) AS pago,
      COALESCE(SUM(amount) FILTER (WHERE direction = 'DEBIT'  AND status = 'PENDING'),     0) AS a_pagar,
      COALESCE(SUM(amount) FILTER (
        WHERE direction = 'DEBIT' AND status = 'PENDING' AND due_date IS NOT NULL AND due_date < CURRENT_DATE
      ), 0) AS vencido,
      COALESCE(SUM(amount) FILTER (WHERE direction = 'CREDIT' AND status = 'CONCILIATED'), 0) AS estornado,
      COUNT(*) AS qtd
    FROM public.internal_transactions
    WHERE (p_organization_id IS NULL OR organization_id = p_organization_id)
      AND supplier_id = p_supplier_id
      AND status <> 'CANCELLED'
      AND (p_date_from IS NULL OR transaction_date >= p_date_from)
      AND (p_date_to   IS NULL OR transaction_date <= p_date_to)
  )
  SELECT
    contr.contratado,
    led.pago, led.a_pagar, led.vencido, led.estornado,
    contr.qtd, led.qtd
  FROM contr, led;
$$;

CREATE OR REPLACE FUNCTION public.fn_opura_obra_mensal(
  p_organization_id UUID,
  p_project_id      UUID,
  p_date_from       DATE DEFAULT NULL,
  p_date_to         DATE DEFAULT NULL
)
RETURNS TABLE (
  mes            TEXT,
  entradas       NUMERIC,
  saidas         NUMERIC,
  entradas_prev  NUMERIC,
  saidas_prev    NUMERIC,
  resultado      NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    to_char(date_trunc('month', transaction_date), 'YYYY-MM') AS mes,
    COALESCE(SUM(amount) FILTER (WHERE direction = 'CREDIT' AND status = 'CONCILIATED'), 0) AS entradas,
    COALESCE(SUM(amount) FILTER (WHERE direction = 'DEBIT'  AND status = 'CONCILIATED'), 0) AS saidas,
    COALESCE(SUM(amount) FILTER (WHERE direction = 'CREDIT' AND status = 'PENDING'),     0) AS entradas_prev,
    COALESCE(SUM(amount) FILTER (WHERE direction = 'DEBIT'  AND status = 'PENDING'),     0) AS saidas_prev,
    COALESCE(SUM(CASE WHEN status = 'CONCILIATED' AND direction = 'CREDIT' THEN  amount
                      WHEN status = 'CONCILIATED' AND direction = 'DEBIT'  THEN -amount ELSE 0 END), 0) AS resultado
  FROM public.internal_transactions
  WHERE (p_organization_id IS NULL OR organization_id = p_organization_id)
    AND project_id = p_project_id
    AND status <> 'CANCELLED'
    AND (p_date_from IS NULL OR transaction_date >= p_date_from)
    AND (p_date_to   IS NULL OR transaction_date <= p_date_to)
  GROUP BY date_trunc('month', transaction_date)
  ORDER BY date_trunc('month', transaction_date);
$$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20270127000000_opura_analytics_todas_organizacoes.sql
-- ────────────────────────────────────────────────────────────
