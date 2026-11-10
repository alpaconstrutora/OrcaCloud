-- ==========================================================================
-- Juros da venda parcelada separados nos relatórios por categoria fora da DRE
-- Date: 2026-11-10 · Frente feat/juros-pendencias
-- Plano: docs/planos/2026-11-10-juros-parcelamento-pendencias.md (item 1)
-- Alterados: vw_fact_financial_tx, vw_fpa_budget_vs_actual,
--            fn_entries_without_project, fn_opura_pivot (DROP + CREATE: qtd_titulos), fn_opura_aging,
--            fn_opura_entries, fn_balancete (DROP + CREATE: coluna nova)
-- Reverter: supabase/manual/reverter_20271110400000_juros_relatorios_por_categoria.sql
-- Teste:    scripts/teste-juros-relatorios-por-categoria.sql (BEGIN/ROLLBACK)
--
-- ⚠️ Aplicar com `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push`. Idempotente.
-- ==========================================================================
-- CONTEXTO
--
-- A migration aplicar_20271110300100 criou v_internal_transactions_dre (título
-- com juros = 2 linhas: principal | juros) e passou as 5 funções de DRE/
-- Balancete a lê-la. Os relatórios que também agrupam por CATEGORIA ficaram de
-- fora e somavam a parcela cheia na categoria da venda:
--   · ÒPURA (pivot, tendência do BI) — vw_fact_financial_tx
--   · FP&A orçado × realizado         — vw_fpa_budget_vs_actual
--   · Inteligência Financeira › lançamentos sem obra — fn_entries_without_project
-- E o Balancete contava 2× a parcela com juros no total de lançamentos da tela.
--
-- Ficam como estão, de propósito:
--   · vw_journal_entries (diário): só títulos com journal_entry_id — em produção
--     só 5 de NF-e; nenhum título de contrato.
--   · fn_fi_ledger: 1 linha por título; 7 das 8 funções que o leem contam títulos.
--
-- Nenhuma destas peças repete a regra de separação: todas fazem JOIN na
-- v_internal_transactions_dre pelo id. Título sem juros = 1 linha, idêntica.
--
-- RPC/VIEW = REVOKE de anon: ACLs reafirmadas como em produção (10/11/2026):
-- authenticated + service_role, sem anon/PUBLIC.
-- ==========================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. vw_fact_financial_tx — 1 linha por PARTE do título
-- ────────────────────────────────────────────────────────────
-- Corpo de produção (pg_get_viewdef de 10/11/2026) com estas trocas:
--   FROM internal_transactions it
--     → FROM v_internal_transactions_dre d JOIN internal_transactions it ON it.id = d.id
--   it.amount (valor e as 6 colunas realizado/previsto) → d.amount_dre
--   fc.id = it.category_id                              → fc.id = d.category_id_dre
-- e duas colunas NO FIM (CREATE OR REPLACE VIEW só aceita coluna nova no fim):
--   parte_juros   — true na linha da parte de juros
--   amount_titulo — valor cheio do título (o `amount` de antes)
-- A regra de separação NÃO é repetida aqui: vem da v_internal_transactions_dre.
-- Título sem juros = 1 linha, idêntica à de antes.
-- `amount` mantém o tipo numeric(15,2) da coluna antiga (o Postgres recusa trocar
-- o tipo de coluna de view no CREATE OR REPLACE).
CREATE OR REPLACE VIEW public.vw_fact_financial_tx
WITH (security_invoker = on) AS
 SELECT it.id,
    -- da view de partes (mesmo valor de it.organization_id): o filtro de org das
    -- funções da ÒPURA chega aos dois ramos do UNION da v_internal_transactions_dre.
    d.organization_id,
    it.transaction_date,
    it.payment_date,
    it.due_date,
    it.competencia_date,
    it.direction,
    it.status,
    it.business_status,
    it.approval_status,
    d.amount_dre::numeric(15,2) AS amount,
    d.category_id_dre AS category_id,
    fc.parent_id AS category_parent_id,
    it.project_id,
    it.cost_center_id,
    it.supplier_id,
    it.contract_id,
    it.purchase_order_id,
    it.payment_account_id,
    cl.id AS client_id,
    it.created_by,
    p.empresa_id,
    COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO'::text) AS dre_group,
    COALESCE(fc.nature, 'EXPENSE'::text) AS nature,
    COALESCE(fc.name, it.category, 'Sem categoria'::text) AS category_name,
    COALESCE(fc.sort_order, 99) AS sort_order,
    s.name AS supplier_name,
    COALESCE(cl.name,
        CASE
            WHEN it.party_type = 'CLIENT'::text THEN NULLIF(it.party_name, ''::text)
            ELSE NULL::text
        END) AS client_name,
    p.name AS project_name,
    pa.name AS account_name,
    it.source_system,
    it.reference_id,
    it.description,
        CASE
            WHEN it.direction = 'CREDIT'::text AND it.status = 'CONCILIATED'::text THEN d.amount_dre
            ELSE 0::numeric
        END AS credit_realizado,
        CASE
            WHEN it.direction = 'DEBIT'::text AND it.status = 'CONCILIATED'::text THEN d.amount_dre
            ELSE 0::numeric
        END AS debit_realizado,
        CASE
            WHEN it.direction = 'CREDIT'::text AND it.status = 'PENDING'::text THEN d.amount_dre
            ELSE 0::numeric
        END AS credit_previsto,
        CASE
            WHEN it.direction = 'DEBIT'::text AND it.status = 'PENDING'::text THEN d.amount_dre
            ELSE 0::numeric
        END AS debit_previsto,
        CASE
            WHEN it.direction = 'CREDIT'::text AND it.status = 'CONCILIATED'::text THEN d.amount_dre
            WHEN it.direction = 'DEBIT'::text AND it.status = 'CONCILIATED'::text THEN - d.amount_dre
            ELSE 0::numeric
        END AS net_realizado,
        CASE
            WHEN it.direction = 'CREDIT'::text AND it.status = 'PENDING'::text THEN d.amount_dre
            WHEN it.direction = 'DEBIT'::text AND it.status = 'PENDING'::text THEN - d.amount_dre
            ELSE 0::numeric
        END AS net_previsto,
    COALESCE(NULLIF(it.party_name, ''::text), NULLIF(it.entity_name, ''::text), s.name, cl.name) AS party_label,
        CASE
            WHEN cc.id IS NULL THEN NULL::text
            WHEN ccp.name IS NOT NULL THEN (ccp.name || ' › '::text) || cc.name
            ELSE cc.name
        END AS cost_center_name,
    fcp.name AS category_parent_name,
        CASE
            WHEN ct.id IS NULL THEN NULL::text
            ELSE concat_ws(' · '::text, NULLIF(ct.number, ''::text), NULLIF(ct.title, ''::text))
        END AS contract_name,
        CASE
            WHEN po.id IS NULL THEN NULL::text
            ELSE 'Pedido '::text || COALESCE(NULLIF(po.number, ''::text), "left"(po.id::text, 8))
        END AS purchase_order_name,
    it.plano_de_contas_id,
        CASE
            WHEN pc.id IS NULL THEN NULL::text
            ELSE concat_ws(' · '::text, NULLIF(pc.code, ''::text), pc.name)
        END AS plano_de_contas_name,
    ct.domain AS contract_domain,
    NULLIF(ct.number, ''::text) AS contract_number,
    ct.client_id AS contract_client_id,
    clc.name AS contract_client_name,
    COALESCE(NULLIF(d2.code, ''::text), NULLIF(d2.contract_number, ''::text)) AS deal_label,
    cp.name AS property_name,
    d.parte_juros,
    it.amount AS amount_titulo
   FROM v_internal_transactions_dre d
     JOIN internal_transactions it ON it.id = d.id
     LEFT JOIN financial_categories fc ON fc.id = d.category_id_dre
     LEFT JOIN financial_categories fcp ON fcp.id = fc.parent_id
     LEFT JOIN suppliers s ON s.id = it.supplier_id
     LEFT JOIN clients cl ON cl.id = it.party_id
     LEFT JOIN projects p ON p.id = it.project_id
     LEFT JOIN payment_accounts pa ON pa.id = it.payment_account_id
     LEFT JOIN cost_centers_v2 cc ON cc.id = it.cost_center_id
     LEFT JOIN cost_centers_v2 ccp ON ccp.id = cc.parent_id
     LEFT JOIN contracts ct ON ct.id = it.contract_id
     LEFT JOIN purchase_orders po ON po.id = it.purchase_order_id
     LEFT JOIN plano_de_contas pc ON pc.id = it.plano_de_contas_id
     LEFT JOIN commercial_deals d2 ON d2.id = ct.deal_id
     LEFT JOIN commercial_properties cp ON cp.id = d2.property_id
     LEFT JOIN clients clc ON clc.id = ct.client_id
  WHERE it.status <> 'CANCELLED'::text;

COMMENT ON VIEW public.vw_fact_financial_tx IS
'Fato financeiro da ÒPURA: 1 linha por PARTE de título (principal | juros, regra da v_internal_transactions_dre). amount/category_* = da parte; amount_titulo = valor cheio do título; parte_juros marca a parte de juros. Quem conta TÍTULOS usa COUNT(DISTINCT id) ou filtra NOT parte_juros (migration aplicar_20271110400000).';

-- ────────────────────────────────────────────────────────────
-- 2. vw_fpa_budget_vs_actual — realizado com os juros na categoria de juros
-- ────────────────────────────────────────────────────────────
-- Corpo de produção com o realizado lido das partes. A parte principal casa a
-- categoria POR NOME, como antes (comportamento preservado de propósito); a parte
-- de juros casa pelo id da categoria de juros.
CREATE OR REPLACE VIEW public.vw_fpa_budget_vs_actual
WITH (security_invoker = on) AS
 WITH actuals AS (
         SELECT it.organization_id,
            COALESCE(p.empresa_id, c.id) AS empresa_id,
            it.project_id,
            it.cost_center_id,
            COALESCE(fc_j.id, fc_1.id) AS financial_category_id,
            EXTRACT(year FROM it.transaction_date)::integer AS year,
            EXTRACT(month FROM it.transaction_date)::integer AS month,
            sum(
                CASE
                    WHEN it.direction = 'CREDIT'::text THEN d.amount_dre
                    ELSE - d.amount_dre
                END) AS actual_amount
           FROM v_internal_transactions_dre d
             JOIN internal_transactions it ON it.id = d.id
             -- Dois JOINs (não um JOIN com CASE, que impede hash join): a parte
             -- principal casa por nome, como antes; a de juros, pelo id.
             LEFT JOIN financial_categories fc_1 ON NOT d.parte_juros AND fc_1.name = it.category
             LEFT JOIN financial_categories fc_j ON d.parte_juros AND fc_j.id = d.category_id_dre
             LEFT JOIN projects p ON p.id = it.project_id
             LEFT JOIN companies c ON c.org_id = it.organization_id
          WHERE it.status = 'CONCILIATED'::text
          GROUP BY it.organization_id, (COALESCE(p.empresa_id, c.id)), it.project_id, it.cost_center_id, (COALESCE(fc_j.id, fc_1.id)), (EXTRACT(year FROM it.transaction_date)::integer), (EXTRACT(month FROM it.transaction_date)::integer)
        )
 SELECT b.id AS budget_id,
    b.empresa_id,
    b.project_id,
    b.cost_center_id,
    b.name AS budget_name,
    b.year,
    bl.month,
    fc.name AS category_name,
    fc.dre_group,
    bl.planned_amount,
    COALESCE(a.actual_amount, 0::numeric) AS actual_amount,
    COALESCE(a.actual_amount, 0::numeric) - bl.planned_amount AS variance_amount,
        CASE
            WHEN bl.planned_amount = 0::numeric THEN 0::numeric
            ELSE round((COALESCE(a.actual_amount, 0::numeric) - bl.planned_amount) / NULLIF(bl.planned_amount, 0::numeric) * 100::numeric, 2)
        END AS variance_percent
   FROM fpa_budget_lines bl
     JOIN fpa_budgets b ON b.id = bl.budget_id
     LEFT JOIN financial_categories fc ON fc.id = bl.financial_category_id
     LEFT JOIN actuals a ON a.empresa_id = b.empresa_id AND (a.project_id = b.project_id OR a.project_id IS NULL AND b.project_id IS NULL) AND (a.cost_center_id = b.cost_center_id OR a.cost_center_id IS NULL AND b.cost_center_id IS NULL) AND a.financial_category_id = bl.financial_category_id AND a.year = b.year AND a.month = bl.month;

-- ACL das duas views: CREATE OR REPLACE mantém; reafirmar só documenta (produção
-- 10/11: postgres, authenticated, service_role — sem anon).
REVOKE ALL ON public.vw_fact_financial_tx FROM anon;
REVOKE ALL ON public.vw_fact_financial_tx FROM PUBLIC;
GRANT SELECT ON public.vw_fact_financial_tx TO authenticated;
REVOKE ALL ON public.vw_fpa_budget_vs_actual FROM anon;
REVOKE ALL ON public.vw_fpa_budget_vs_actual FROM PUBLIC;
GRANT SELECT ON public.vw_fpa_budget_vs_actual TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. fn_entries_without_project (Inteligência Financeira › sem obra, por categoria)
-- ────────────────────────────────────────────────────────────
-- fn_fi_ledger continua 1 linha por TÍTULO (7 das 8 funções que o leem contam
-- títulos). Esta é a única que agrupa por categoria: junta as partes da
-- v_internal_transactions_dre pelo id — a parte de juros vai para a categoria de
-- juros. `qtd` = títulos com parte naquela categoria (como no Balancete).
CREATE OR REPLACE FUNCTION public.fn_entries_without_project(p_organization_id uuid)
 RETURNS TABLE(direction text, natureza text, empreendimento_id uuid, empreendimento_nome text, categoria text, realizado numeric, a_vencer_90d numeric, vencido numeric, qtd integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT
    y.direction,
    y.natureza,
    y.empreendimento_id,
    y.empreendimento_nome,
    y.categoria,
    COALESCE(SUM(y.amount) FILTER (WHERE y.realizado), 0),
    COALESCE(SUM(y.amount) FILTER (WHERE y.em_aberto
               AND y.data_ref BETWEEN CURRENT_DATE AND CURRENT_DATE + 90), 0),
    COALESCE(SUM(y.amount) FILTER (WHERE y.em_aberto AND y.data_ref < CURRENT_DATE), 0),
    count(*)::int
  FROM (
    SELECT
      x.direction, x.natureza, x.empreendimento_id, x.empreendimento_nome,
      CASE WHEN d.parte_juros THEN COALESCE(fj.name, 'Sem categoria') ELSE x.categoria END AS categoria,
      d.amount_dre AS amount,
      x.realizado, x.em_aberto, x.data_ref
    FROM public.fn_fi_ledger(public.fn_fi_targets(p_organization_id)) x
    JOIN public.v_internal_transactions_dre d ON d.id = x.id
    LEFT JOIN public.financial_categories fj ON d.parte_juros AND fj.id = d.category_id_dre
    WHERE x.obra_id IS NULL
      AND x.natureza IS DISTINCT FROM 'LOCACAO'
  ) y
  GROUP BY y.direction, y.natureza, y.empreendimento_id, y.empreendimento_nome, y.categoria
  ORDER BY y.direction, 6 DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_entries_without_project(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_entries_without_project(uuid) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────
-- 4. Funções da ÒPURA que leem a fato (corpos de produção de 10/11/2026)
-- ────────────────────────────────────────────────────────────
-- fn_bi_trend NÃO muda: soma net_realizado por dre_group, e a parte de juros
-- (grupo FINANCEIRO) já sai de Receita Bruta/EBITDA só com a fato nova.
-- fn_opura_pivot: qtd conta títulos (COUNT DISTINCT id) + qtd_titulos (só a parte principal).
-- fn_opura_aging: por título (NOT parte_juros, amount_titulo).
-- fn_opura_entries: 1 linha por título; no detalhe de categoria, soma só as partes que passam no filtro.

-- RETURNS TABLE muda (qtd_titulos): DROP antes.
DROP FUNCTION IF EXISTS public.fn_opura_pivot(uuid,text,text,date,date,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,uuid[]);
CREATE FUNCTION public.fn_opura_pivot(p_organization_id uuid, p_dimension text DEFAULT 'category'::text, p_date_field text DEFAULT 'transaction'::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_project_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_client_id uuid DEFAULT NULL::uuid, p_contract_id uuid DEFAULT NULL::uuid, p_purchase_order_id uuid DEFAULT NULL::uuid, p_cost_center_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid, p_account_id uuid DEFAULT NULL::uuid, p_empresa_id uuid DEFAULT NULL::uuid, p_direction text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_business_status text DEFAULT NULL::text, p_client_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(dimension_key text, dimension_label text, qtd bigint, credit_realizado numeric, debit_realizado numeric, credit_previsto numeric, debit_previsto numeric, net_realizado numeric, vencido numeric, qtd_titulos bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    -- Título com juros = 2 linhas na fato (principal | juros): conta TÍTULOS.
    COUNT(DISTINCT b.id) AS qtd,
    COALESCE(SUM(b.credit_realizado), 0) AS credit_realizado,
    COALESCE(SUM(b.debit_realizado),  0) AS debit_realizado,
    COALESCE(SUM(b.credit_previsto),  0) AS credit_previsto,
    COALESCE(SUM(b.debit_previsto),   0) AS debit_previsto,
    COALESCE(SUM(b.net_realizado),    0) AS net_realizado,
    COALESCE(SUM(CASE WHEN b.status = 'PENDING' AND b.due_date IS NOT NULL AND b.due_date < CURRENT_DATE
                      THEN b.amount ELSE 0 END), 0) AS vencido,
    COUNT(DISTINCT b.id) FILTER (WHERE NOT b.parte_juros) AS qtd_titulos
  FROM base b
  WHERE (p_date_from IS NULL OR b.filter_date >= p_date_from)
    AND (p_date_to   IS NULL OR b.filter_date <= p_date_to)
  GROUP BY b.dim_key, b.dim_label
  ORDER BY COALESCE(SUM(b.net_realizado), 0) DESC, COUNT(*) DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_opura_aging(p_organization_id uuid, p_client_id uuid DEFAULT NULL::uuid, p_client_ids uuid[] DEFAULT NULL::uuid[], p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_base text DEFAULT 'periodo'::text, p_dimension text DEFAULT NULL::text)
 RETURNS TABLE(dimension_key text, faixa text, qtd bigint, valor numeric, atraso_max integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  IF p_base NOT IN ('periodo', 'hoje') THEN
    RAISE EXCEPTION 'Base desconhecida em p_base: %', p_base;
  END IF;
  IF p_dimension IS NOT NULL AND p_dimension NOT IN ('client', 'project') THEN
    RAISE EXCEPTION 'Dimensão desconhecida em p_dimension: %', p_dimension;
  END IF;
  IF p_client_id IS NULL AND p_client_ids IS NULL THEN
    RETURN;
  END IF;

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
  WITH abertos AS (
    SELECT
      CASE p_dimension
        WHEN 'client'  THEN f.client_id::text
        WHEN 'project' THEN f.project_id::text
      END AS dim_key,
      -- Aging é por TÍTULO: a parte de juros não vira linha própria.
      f.amount_titulo AS amount,
      CASE WHEN f.due_date IS NOT NULL AND f.due_date < CURRENT_DATE
           THEN (CURRENT_DATE - f.due_date) END AS dias
    FROM public.vw_fact_financial_tx f
    WHERE f.organization_id = ANY(v_targets)
      AND NOT f.parte_juros
      AND f.direction = 'CREDIT'
      AND f.status = 'PENDING'
      AND (p_client_id  IS NULL OR f.client_id = p_client_id)
      AND (p_client_ids IS NULL OR f.client_id = ANY(p_client_ids))
      AND (p_base = 'hoje' OR (
            (p_date_from IS NULL OR f.transaction_date >= p_date_from)
        AND (p_date_to   IS NULL OR f.transaction_date <= p_date_to)))
  )
  SELECT
    a.dim_key AS dimension_key,
    CASE
      WHEN a.dias IS NULL  THEN 'a_vencer'
      WHEN a.dias <= 30    THEN '1_30'
      WHEN a.dias <= 60    THEN '31_60'
      WHEN a.dias <= 90    THEN '61_90'
      ELSE 'mais_90'
    END AS faixa,
    COUNT(*)                       AS qtd,
    COALESCE(SUM(a.amount), 0)     AS valor,
    MAX(a.dias)::integer           AS atraso_max
  FROM abertos a
  GROUP BY 1, 2;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_opura_entries(p_organization_id uuid, p_date_field text DEFAULT 'transaction'::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_project_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_client_id uuid DEFAULT NULL::uuid, p_contract_id uuid DEFAULT NULL::uuid, p_purchase_order_id uuid DEFAULT NULL::uuid, p_cost_center_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid, p_account_id uuid DEFAULT NULL::uuid, p_empresa_id uuid DEFAULT NULL::uuid, p_direction text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_business_status text DEFAULT NULL::text, p_dre_group text DEFAULT NULL::text, p_category_parent_id uuid DEFAULT NULL::uuid, p_created_by uuid DEFAULT NULL::uuid, p_party_label text DEFAULT NULL::text, p_plano_de_contas_id uuid DEFAULT NULL::uuid, p_contract_domain text DEFAULT NULL::text, p_contract_client_id uuid DEFAULT NULL::uuid, p_client_ids uuid[] DEFAULT NULL::uuid[], p_sem_dimensao text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, transaction_date date, due_date date, payment_date date, direction text, status text, amount numeric, category_name text, dre_group text, supplier_name text, client_name text, project_name text, account_name text, description text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
  -- Detalhe de uma dimensão de CATEGORIA (categoria, categoria-pai, grupo DRE):
  -- lista as PARTES (principal | juros), para somar o mesmo que a célula do pivô.
  -- Fora disso, 1 linha por título com o valor cheio (extrato da Central do Cliente).
  v_por_parte BOOLEAN := p_category_id IS NOT NULL OR p_category_parent_id IS NOT NULL
                         OR p_dre_group IS NOT NULL
                         OR COALESCE(p_sem_dimensao IN ('category', 'category_parent'), false);
BEGIN
  IF p_sem_dimensao IS NOT NULL AND p_sem_dimensao NOT IN (
    'supplier', 'project', 'cost_center', 'category', 'category_parent', 'client',
    'contract', 'purchase_order', 'account', 'empresa', 'user', 'contraparte',
    'plano_de_contas'
  ) THEN
    RAISE EXCEPTION 'Dimensão desconhecida em p_sem_dimensao: %', p_sem_dimensao;
  END IF;

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
      f.direction, f.status,
      CASE WHEN v_por_parte THEN f.amount ELSE f.amount_titulo END AS amount,
      f.category_name, f.dre_group,
      -- Saída sem supplier_id: a contraparte (party_label) entra como fornecedor,
      -- mesma regra da dimensão 'supplier' em fn_opura_pivot. Antes ela chegava
      -- ao extrato via client_name, que agora é só cliente de verdade.
      COALESCE(f.supplier_name, CASE WHEN f.direction = 'DEBIT' THEN f.party_label END) AS supplier_name,
      f.client_name, f.project_name, f.account_name,
      f.description, f.parte_juros,
      CASE p_date_field
        WHEN 'due'         THEN f.due_date
        WHEN 'payment'     THEN f.payment_date
        WHEN 'competencia' THEN f.competencia_date
        ELSE f.transaction_date
      END AS filter_date
    FROM public.vw_fact_financial_tx f
    WHERE f.organization_id = ANY(v_targets)
      AND (v_por_parte OR NOT f.parte_juros)
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
      -- "— Sem <dimensão>": a chave do pivô (mesma expressão) é NULL.
      AND (p_sem_dimensao IS NULL OR (CASE p_sem_dimensao
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
            WHEN 'plano_de_contas' THEN f.plano_de_contas_id::text
          END) IS NULL)
  ),
  dated AS (
    SELECT * FROM filtered
    WHERE (p_date_from IS NULL OR filter_date >= p_date_from)
      AND (p_date_to   IS NULL OR filter_date <= p_date_to)
  )
  , titulo AS (
    SELECT DISTINCT ON (d.id)
      d.*,
      SUM(d.amount) OVER (PARTITION BY d.id)          AS amount_titulo_filtrado,
      bool_and(d.parte_juros) OVER (PARTITION BY d.id) AS so_juros
    FROM dated d
    ORDER BY d.id, d.parte_juros
  )
  SELECT
    d.id, d.transaction_date, d.due_date, d.payment_date,
    d.direction, d.status, d.amount_titulo_filtrado, d.category_name, d.dre_group,
    d.supplier_name, d.client_name, d.project_name, d.account_name,
    CASE WHEN d.so_juros THEN concat_ws(' · ', d.description, 'juros') ELSE d.description END,
    COUNT(*) OVER () AS total_count
  FROM titulo d
  ORDER BY d.transaction_date DESC, d.id
  LIMIT  GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$function$;

-- ────────────────────────────────────────────────────────────
-- 5. fn_balancete — n_partes_juros (DROP: o RETURNS TABLE muda)
-- ────────────────────────────────────────────────────────────
-- Corpo da migration aplicar_20271110300100 + a coluna. Nenhuma view/função SQL
-- depende dela (o front chama por RPC: financialReportService.getBalancete).
DROP FUNCTION IF EXISTS public.fn_balancete(uuid, date, date, uuid, text);

CREATE OR REPLACE FUNCTION public.fn_balancete(p_organization_id uuid, p_date_from date, p_date_to date, p_project_id uuid DEFAULT NULL::uuid, p_regime text DEFAULT 'CAIXA'::text)
 RETURNS TABLE(category_id uuid, category_name text, dre_group text, nature text, sort_order integer, creditos numeric, debitos numeric, saldo_liquido numeric, n_transacoes bigint, n_partes_juros bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  SELECT
    fc.id                                                            AS category_id,
    COALESCE(fc.name, it.category, '(Sem Categoria)')               AS category_name,
    COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO')                     AS dre_group,
    COALESCE(fc.nature,    'EXPENSE')                               AS nature,
    COALESCE(fc.sort_order, 99)                                     AS sort_order,
    CASE WHEN p_regime = 'COMPETENCIA' THEN
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' THEN it.amount_dre ELSE 0 END), 0)
    ELSE
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount_dre ELSE 0 END), 0)
    END AS creditos,
    CASE WHEN p_regime = 'COMPETENCIA' THEN
      COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  THEN it.amount_dre ELSE 0 END), 0)
    ELSE
      COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN it.amount_dre ELSE 0 END), 0)
    END AS debitos,
    CASE WHEN p_regime = 'COMPETENCIA' THEN
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' THEN  it.amount_dre
                        WHEN it.direction = 'DEBIT'  THEN -it.amount_dre ELSE 0 END), 0)
    ELSE
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN  it.amount_dre
                        WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN -it.amount_dre
                        ELSE 0 END), 0)
    END AS saldo_liquido,
    COUNT(*)                                                         AS n_transacoes,
    -- Linhas desta categoria que são a parte de JUROS de um título (o título já
    -- conta 1 vez na categoria da parte principal). O total geral da tela é
    -- Σ (n_transacoes − n_partes_juros) = nº de títulos.
    COUNT(*) FILTER (WHERE it.parte_juros)                           AS n_partes_juros
  FROM public.v_internal_transactions_dre it
  LEFT JOIN public.financial_categories fc
    ON fc.id = it.category_id_dre
    OR (it.category_id_dre IS NULL
        AND fc.organization_id = it.organization_id
        AND lower(fc.name) = lower(it.category))
  WHERE it.organization_id = ANY(v_targets)
    AND it.status != 'CANCELLED'
    AND (
      CASE WHEN p_regime = 'COMPETENCIA'
           THEN COALESCE(it.competencia_date, it.transaction_date::date)
           ELSE it.transaction_date::date
      END
    ) BETWEEN p_date_from AND p_date_to
    AND (p_project_id IS NULL OR it.project_id = p_project_id)
  GROUP BY
    fc.id,
    COALESCE(fc.name, it.category, '(Sem Categoria)'),
    COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO'),
    COALESCE(fc.nature,    'EXPENSE'),
    COALESCE(fc.sort_order, 99)
  ORDER BY
    COALESCE(fc.sort_order, 99),
    COALESCE(fc.name, it.category, '(Sem Categoria)');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_balancete(UUID, DATE, DATE, UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_balancete(UUID, DATE, DATE, UUID, TEXT) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_opura_pivot(uuid,text,text,date,date,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_opura_pivot(uuid,text,text,date,date,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,uuid[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_opura_aging(uuid,uuid,uuid[],date,date,text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_opura_aging(uuid,uuid,uuid[],date,date,text,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_opura_entries(uuid,text,date,date,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,uuid,uuid,text,uuid,text,uuid,uuid[],text,integer,integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_opura_entries(uuid,text,date,date,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,uuid,uuid,text,uuid,text,uuid,uuid[],text,integer,integer) TO authenticated, service_role;

COMMIT;
