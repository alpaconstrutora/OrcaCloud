-- ============================================================
-- ÒPURA · Relatórios — 5 dimensões novas: Plano de Contas, Vendas de
-- Ativos, Locações, Gestão de Locações (por locatário), Contratos de Serviço
-- OrçaCloud SaaS · Migration 20270919000042
-- Idempotente: CREATE OR REPLACE na view e no pivot; DROP IF EXISTS + CREATE
-- na entries (assinatura muda); backfill só onde contract_id é nulo.
--
-- Pedido do usuário (2026-09-13): abas "conectadas" a Minha Organização ›
-- Plano de Contas e a Comercial › Vendas de Ativos / Locações / Contratos
-- de Serviço. Todos os fluxos comerciais passam por `contracts`
-- (domain VENDAS | LOCACAO | SERVICOS; deal_id → commercial_deals →
-- commercial_properties; client_id → locatário/comprador principal) e os
-- títulos CONTRACT_* têm contract_id desde a …000040.
--
-- Decisões (com o usuário):
--   • Locações = uma linha por contrato; Gestão de Locações = por locatário.
--   • Abas de domínio mostram SÓ o domínio (v_domain no pivot).
--   • Tributos gerados sobre parcelas de locação/venda (source_system
--     COMMERCIAL, reference_id 'tax-<deal>-…', 817 títulos) entram: backfill
--     de contract_id via contracts.deal_id (só negociação com 1 contrato — a
--     ambígua fica de fora); taxPayableService passa a gravar contract_id.
--   • REVOKE anon/PUBLIC nas duas RPCs (REGRA #7; a entries precisa de
--     DROP + CREATE porque ganha 3 parâmetros — sem o DROP ficariam duas
--     sobrecargas com DEFAULT e o PostgREST responderia PGRST203 em
--     Relatórios E nas três Centrais).
--
-- Fonte da verdade copiada: view e fn_opura_entries de …000039;
-- fn_opura_pivot de …000037. Assinatura do pivot inalterada.
--
-- ⚠️ APLICAR COM `npx supabase db query --linked -f` — NUNCA `db push`.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. View — colunas novas AO FINAL
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
  END                                             AS purchase_order_name,
  -- NOVO (2026-09-13): Plano de Contas e dimensões por domínio de contrato
  -- (Vendas de Ativos / Locações / Gestão de Locações / Contratos de Serviço)
  it.plano_de_contas_id,
  CASE WHEN pc.id IS NULL THEN NULL
       ELSE CONCAT_WS(' · ', NULLIF(pc.code, ''), pc.name) END AS plano_de_contas_name,
  ct.domain                                       AS contract_domain,
  NULLIF(ct.number, '')                           AS contract_number,
  ct.client_id                                    AS contract_client_id,
  clc.name                                        AS contract_client_name,
  COALESCE(NULLIF(d.code, ''), NULLIF(d.contract_number, '')) AS deal_label,
  cp.name                                         AS property_name
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
LEFT JOIN public.plano_de_contas      pc  ON pc.id  = it.plano_de_contas_id
LEFT JOIN public.commercial_deals     d   ON d.id   = ct.deal_id
LEFT JOIN public.commercial_properties cp ON cp.id  = d.property_id
LEFT JOIN public.clients              clc ON clc.id = ct.client_id
WHERE it.status <> 'CANCELLED';

-- Trava de views (viewSecurityGuard): toda view recriada repete a proteção
-- no mesmo arquivo — CREATE OR REPLACE preserva os grants, mas quem lê o
-- arquivo precisa ver que a view nasce fechada para anon.
REVOKE ALL ON public.vw_fact_financial_tx FROM anon;
REVOKE ALL ON public.vw_fact_financial_tx FROM PUBLIC;
GRANT SELECT ON public.vw_fact_financial_tx TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 2. Backfill: tributos da negociação → contrato (1 contrato por negociação)
-- ────────────────────────────────────────────────────────────
UPDATE public.internal_transactions it
SET contract_id = c.id
FROM public.contracts c
WHERE it.contract_id IS NULL
  AND it.source_system = 'COMMERCIAL'
  AND c.deal_id IS NOT NULL
  AND c.organization_id = it.organization_id
  AND it.reference_id LIKE 'tax-' || c.deal_id::text || '-%'
  AND (SELECT COUNT(*) FROM public.contracts c2 WHERE c2.deal_id = c.deal_id) = 1;

-- ────────────────────────────────────────────────────────────
-- 3. fn_opura_pivot — dimensões novas + filtro de domínio
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

REVOKE EXECUTE ON FUNCTION public.fn_opura_pivot(uuid, text, text, date, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_opura_pivot(uuid, text, text, date, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 4. fn_opura_entries — 3 filtros novos (assinatura muda: DROP + CREATE)
-- ────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_opura_entries(uuid, text, date, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, uuid, uuid, text, int, int);

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

REVOKE EXECUTE ON FUNCTION public.fn_opura_entries(uuid, text, date, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, uuid, uuid, text, uuid, text, uuid, int, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_opura_entries(uuid, text, date, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, uuid, uuid, text, uuid, text, uuid, int, int) TO authenticated;
COMMENT ON FUNCTION public.fn_opura_entries(uuid, text, date, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, uuid, uuid, text, uuid, text, uuid, int, int) IS
  'ÒPURA: extrato linha-a-linha de vw_fact_financial_tx (filtros universais + drill + paginação). Fase 2; +plano de contas/domínio/locatário 2026-09-13.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- FIM: aplicar_20270919000042_opura_dimensoes_plano_contas_e_contratos.sql
