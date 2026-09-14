-- ============================================================
-- ÒPURA · Central de Clientes — "Todos os clientes" + filtro por tipo
-- OrçaCloud SaaS · Migration 20270921000020
-- Idempotente: DROP IF EXISTS da assinatura antiga + CREATE (as três
-- funções ganham parâmetro, e CREATE OR REPLACE criaria uma SOBRECARGA —
-- o PostgREST responderia PGRST203 em Relatórios e nas três Centrais).
--
-- Pedido do usuário (2026-09-14, Central de Clientes):
--   1. criar filtro por tipo de cliente
--   2. No seletor de cliente, incluir "todos os clientes"
--
-- Decisão: as três RPCs ganham `p_client_ids UUID[]` (NULL = sem filtro).
-- A tela manda a lista de ids (já recortada por organização — REGRA #5 —
-- e pelo tipo escolhido). Alternativa descartada: chamar sem cliente em
-- "Todos" — traria crédito SEM cliente (aporte, empréstimo) para os KPIs
-- e o extrato "por obra" viraria o da organização inteira.
-- fn_opura_cliente_kpis: p_client_id passa a opcional, mas a função exige
-- p_client_id OU p_client_ids — nunca devolve a organização inteira sem querer.
--
-- Fonte da verdade copiada por script (não transcrita): pivot e entries de
-- …000042 (conferido no banco: uma sobrecarga cada, versão …000042);
-- cliente_kpis de 20270127000000. Diferença = só as linhas de p_client_ids.
--
-- REGRA #7: REVOKE PUBLIC/anon + GRANT authenticated nas três; nenhuma é
-- SECURITY DEFINER (rodam com a RLS de quem chama).
--
-- ⚠️ APLICAR COM `npx supabase db query --linked -f` — NUNCA `db push`.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. fn_opura_cliente_kpis
-- ────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_opura_cliente_kpis(uuid, uuid, date, date);

CREATE OR REPLACE FUNCTION public.fn_opura_cliente_kpis(
  p_organization_id UUID,
  p_client_id       UUID DEFAULT NULL,
  p_date_from       DATE DEFAULT NULL,
  p_date_to         DATE DEFAULT NULL,
  -- NOVO (2026-09-14): "Todos os clientes" (ou todos de um tipo) — a tela manda a lista
  p_client_ids      UUID[] DEFAULT NULL
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
      AND (p_client_id  IS NULL OR client_id = p_client_id)
      AND (p_client_ids IS NULL OR client_id = ANY(p_client_ids))
      -- sem cliente informado NÃO devolve a organização inteira por acidente
      AND (p_client_id IS NOT NULL OR p_client_ids IS NOT NULL)
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
      AND (p_client_id  IS NULL OR party_id = p_client_id)
      AND (p_client_ids IS NULL OR party_id = ANY(p_client_ids))
      AND (p_client_id IS NOT NULL OR p_client_ids IS NOT NULL)
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

REVOKE EXECUTE ON FUNCTION public.fn_opura_cliente_kpis(uuid, uuid, date, date, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_opura_cliente_kpis(uuid, uuid, date, date, uuid[]) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 2. fn_opura_pivot
-- ────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_opura_pivot(uuid, text, text, date, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text);

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
  p_business_status  TEXT DEFAULT NULL,
  -- NOVO (2026-09-14): Central de Clientes em "Todos os clientes" (opcionalmente por tipo)
  p_client_ids       UUID[] DEFAULT NULL
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
  -- Dimensões de domínio de contrato só olham o próprio domínio (decisão do usuário, 2026-09-13)
  v_domain  TEXT;
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

  v_domain := CASE p_dimension
    WHEN 'venda_ativos'       THEN 'VENDAS'
    WHEN 'locacoes'           THEN 'LOCACAO'
    WHEN 'locacoes_locatario' THEN 'LOCACAO'
    WHEN 'contratos_servico'  THEN 'SERVICOS'
  END;

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
        WHEN 'plano_de_contas'    THEN f.plano_de_contas_id::text
        WHEN 'venda_ativos'       THEN f.contract_id::text
        WHEN 'locacoes'           THEN f.contract_id::text
        WHEN 'locacoes_locatario' THEN f.contract_client_id::text
        WHEN 'contratos_servico'  THEN f.contract_id::text
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
        WHEN 'plano_de_contas'    THEN COALESCE(f.plano_de_contas_name, '— Sem plano de contas')
        WHEN 'venda_ativos'       THEN COALESCE(NULLIF(CONCAT_WS(' · ', COALESCE(f.deal_label, f.contract_number), f.property_name), ''), f.contract_name, '— Sem contrato')
        WHEN 'locacoes'           THEN COALESCE(NULLIF(CONCAT_WS(' · ', f.contract_number, f.property_name), ''), f.contract_name, '— Sem contrato')
        WHEN 'locacoes_locatario' THEN COALESCE(f.contract_client_name, '— Sem locatário')
        WHEN 'contratos_servico'  THEN COALESCE(f.contract_name, '— Sem contrato')
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
      AND (p_client_ids        IS NULL OR f.client_id         = ANY(p_client_ids))
      AND (p_contract_id       IS NULL OR f.contract_id       = p_contract_id)
      AND (p_purchase_order_id IS NULL OR f.purchase_order_id = p_purchase_order_id)
      AND (p_cost_center_id    IS NULL OR f.cost_center_id    = p_cost_center_id)
      AND (p_category_id       IS NULL OR f.category_id       = p_category_id)
      AND (p_account_id        IS NULL OR f.payment_account_id = p_account_id)
      AND (p_empresa_id        IS NULL OR f.empresa_id        = p_empresa_id)
      AND (p_direction         IS NULL OR f.direction         = p_direction)
      AND (p_status            IS NULL OR f.status            = p_status)
      AND (p_business_status   IS NULL OR f.business_status   = p_business_status)
      AND (v_domain IS NULL OR f.contract_domain = v_domain)
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

REVOKE EXECUTE ON FUNCTION public.fn_opura_pivot(uuid, text, text, date, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_opura_pivot(uuid, text, text, date, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, uuid[]) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. fn_opura_entries
-- ────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_opura_entries(uuid, text, date, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, uuid, uuid, text, uuid, text, uuid, int, int);

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
  -- NOVO (2026-09-13): drill das dimensões Plano de Contas e domínio de contrato
  p_plano_de_contas_id UUID DEFAULT NULL,
  p_contract_domain    TEXT DEFAULT NULL,
  p_contract_client_id UUID DEFAULT NULL,
  -- NOVO (2026-09-14): Central de Clientes em "Todos os clientes"
  p_client_ids        UUID[] DEFAULT NULL,
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
      AND (p_client_ids        IS NULL OR f.client_id         = ANY(p_client_ids))
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
      AND (p_plano_de_contas_id IS NULL OR f.plano_de_contas_id = p_plano_de_contas_id)
      AND (p_contract_domain    IS NULL OR f.contract_domain    = p_contract_domain)
      AND (p_contract_client_id IS NULL OR f.contract_client_id = p_contract_client_id)
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

REVOKE EXECUTE ON FUNCTION public.fn_opura_entries(uuid, text, date, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, uuid, uuid, text, uuid, text, uuid, uuid[], int, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_opura_entries(uuid, text, date, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, uuid, uuid, text, uuid, text, uuid, uuid[], int, int) TO authenticated;
COMMENT ON FUNCTION public.fn_opura_entries(uuid, text, date, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, uuid, uuid, text, uuid, text, uuid, uuid[], int, int) IS
  'ÒPURA: extrato linha-a-linha de vw_fact_financial_tx (filtros universais + drill + paginação). Fase 2; +plano de contas/domínio/locatário 2026-09-13; +p_client_ids 2026-09-14.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- FIM: aplicar_20270921000020_opura_central_clientes_client_ids.sql
