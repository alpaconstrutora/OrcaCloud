-- ÒPURA · extrato de "— Sem <dimensão>" (27/10/2026)
-- Plano: docs/planos/2026-10-27-central-clientes-harden.md
--
-- O pivô agrupa as linhas sem obra (sem fornecedor, sem centro de custo…) numa
-- linha "— Sem …" de chave NULL. O extrato recebia essa chave como
-- p_project_id = NULL, que aqui quer dizer "sem filtro": a gaveta "— Sem obra"
-- listava os lançamentos de TODAS as obras. Medido: 361 de 362 lançamentos de
-- cliente não têm obra, e o extrato deles trazia o 362º junto.
--
-- p_sem_dimensao = nome da dimensão do pivô cuja chave tem de ser NULL. A
-- expressão de chave é a MESMA do fn_opura_pivot, então o extrato de "— Sem X"
-- é exatamente o conjunto que o pivô agrupou ali. Nome desconhecido é erro,
-- nunca "sem filtro" (o CASE sem ramo daria NULL e liberaria tudo).
--
-- A assinatura muda → DROP + CREATE, numa transação só (sem janela sem função).
-- Corpo idêntico ao vivo em 27/10 (pg_get_functiondef), mais o parâmetro.

BEGIN;

DROP FUNCTION IF EXISTS public.fn_opura_entries(
  uuid, text, date, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
  text, text, text, text, uuid, uuid, text, uuid, text, uuid, uuid[], integer, integer
);

CREATE FUNCTION public.fn_opura_entries(
  p_organization_id    uuid,
  p_date_field         text    DEFAULT 'transaction',
  p_date_from          date    DEFAULT NULL,
  p_date_to            date    DEFAULT NULL,
  p_project_id         uuid    DEFAULT NULL,
  p_supplier_id        uuid    DEFAULT NULL,
  p_client_id          uuid    DEFAULT NULL,
  p_contract_id        uuid    DEFAULT NULL,
  p_purchase_order_id  uuid    DEFAULT NULL,
  p_cost_center_id     uuid    DEFAULT NULL,
  p_category_id        uuid    DEFAULT NULL,
  p_account_id         uuid    DEFAULT NULL,
  p_empresa_id         uuid    DEFAULT NULL,
  p_direction          text    DEFAULT NULL,
  p_status             text    DEFAULT NULL,
  p_business_status    text    DEFAULT NULL,
  p_dre_group          text    DEFAULT NULL,
  p_category_parent_id uuid    DEFAULT NULL,
  p_created_by         uuid    DEFAULT NULL,
  p_party_label        text    DEFAULT NULL,
  p_plano_de_contas_id uuid    DEFAULT NULL,
  p_contract_domain    text    DEFAULT NULL,
  p_contract_client_id uuid    DEFAULT NULL,
  p_client_ids         uuid[]  DEFAULT NULL,
  p_sem_dimensao       text    DEFAULT NULL,
  p_limit              integer DEFAULT 100,
  p_offset             integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, transaction_date date, due_date date, payment_date date,
  direction text, status text, amount numeric, category_name text, dre_group text,
  supplier_name text, client_name text, project_name text, account_name text,
  description text, total_count bigint
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
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
$function$;

-- Mesmas permissões de antes (proacl em 27/10: só postgres, authenticated, service_role).
REVOKE EXECUTE ON FUNCTION public.fn_opura_entries(
  uuid, text, date, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
  text, text, text, text, uuid, uuid, text, uuid, text, uuid, uuid[], text, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_opura_entries(
  uuid, text, date, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
  text, text, text, text, uuid, uuid, text, uuid, text, uuid, uuid[], text, integer, integer
) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
