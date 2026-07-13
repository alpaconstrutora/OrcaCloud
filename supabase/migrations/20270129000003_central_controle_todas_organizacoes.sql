-- ============================================================
-- Central de Controle — suporta "Todas as Organizações"
-- (p_organization_id NULL) nas RPCs consumidas por CentralControle.tsx
-- OrçaCloud SaaS · Migration 20270129000003
-- Mesmo padrão de 20270126000000 e seguintes.
--
-- Funções: fn_financial_alerts, fn_project_scorecard,
-- fn_cashflow_projection, fn_reconciliation_divergences,
-- fn_approval_action_queue, fn_approval_pending_summary,
-- fn_process_bottlenecks.
--
-- fn_process_bottlenecks é SECURITY DEFINER (sem checagem de posse
-- própria) — ganha a mesma validação explícita já aplicada em
-- rh_kpis (via fn_bi_executive) e fn_opura_*.
--
-- fn_approval_action_queue correlaciona financial_approval_config
-- pela MESMA organização da linha (t.organization_id / k.organization_id
-- / cmp.org_id), não por "qualquer uma de v_targets" — evita misturar
-- faixa de alçada de uma organização com transação de outra quando
-- várias estão selecionadas ao mesmo tempo.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. fn_financial_alerts
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_financial_alerts(p_organization_id UUID)
RETURNS TABLE (
  alert_type   TEXT,
  severity     TEXT,
  title        TEXT,
  description  TEXT,
  amount       NUMERIC,
  project_id   UUID,
  project_name TEXT,
  ref_id       TEXT
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $X$
DECLARE
  _cnt NUMERIC; _total NUMERIC; _saldo NUMERIC; _receita NUMERIC; _margem NUMERIC;
  _pname TEXT; _pid UUID;
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

  -- ── 1. Recebíveis vencidos há > 30 dias ───────────────────
  SELECT COUNT(*)::NUMERIC, COALESCE(SUM(it.amount),0) INTO _cnt,_total
  FROM internal_transactions it
  WHERE it.organization_id = ANY(v_targets) AND it.direction='CREDIT' AND it.status='PENDING'
    AND it.business_status NOT IN('RECEBIDO','CANCELADO','RENEGOCIADO') AND it.due_date<CURRENT_DATE-30;
  IF _total>0 THEN
    alert_type:='OVERDUE_HIGH'; severity:=CASE WHEN _total>100000 THEN 'HIGH' WHEN _total>30000 THEN 'MEDIUM' ELSE 'LOW' END;
    title:='Inadimplência: '||_cnt::TEXT||' título(s) acima de 30 dias';
    description:='Total de R$ '||round(_total,2)::TEXT||' vencidos há mais de 30 dias.';
    amount:=_total; project_id:=NULL; project_name:=NULL; ref_id:=NULL; RETURN NEXT;
  END IF;

  -- ── 2. Risco de caixa por obra (próximos 90 dias) ─────────
  FOR _pid,_pname,_saldo IN
    SELECT it.project_id, p.name,
      SUM(CASE WHEN it.direction='CREDIT' THEN it.amount ELSE -it.amount END)
    FROM internal_transactions it JOIN projects p ON p.id=it.project_id
    WHERE it.organization_id = ANY(v_targets) AND it.status='PENDING'
      AND it.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE+90 AND it.project_id IS NOT NULL
    GROUP BY it.project_id,p.name
    HAVING SUM(CASE WHEN it.direction='CREDIT' THEN it.amount ELSE -it.amount END)<0
  LOOP
    alert_type:='CASHFLOW_RISK'; severity:=CASE WHEN _saldo<-50000 THEN 'HIGH' ELSE 'MEDIUM' END;
    title:='Risco de caixa: '||_pname;
    description:='Saldo projetado de R$ '||round(_saldo,2)::TEXT||' nos próximos 90 dias.';
    amount:=_saldo; project_id:=_pid; project_name:=_pname; ref_id:=NULL; RETURN NEXT;
  END LOOP;

  -- ── 3. Margem baixa por obra (< 10% realizados) ───────────
  FOR _pid,_pname,_receita,_margem IN
    SELECT it.project_id, p.name,
      COALESCE(SUM(CASE WHEN it.direction='CREDIT' AND it.status='CONCILIATED' THEN it.amount END),0),
      CASE WHEN SUM(CASE WHEN it.direction='CREDIT' AND it.status='CONCILIATED' THEN it.amount END)>0
        THEN 100.0*(SUM(CASE WHEN it.direction='CREDIT' AND it.status='CONCILIATED' THEN it.amount END)-SUM(CASE WHEN it.direction='DEBIT' AND it.status='CONCILIATED' THEN it.amount END))/SUM(CASE WHEN it.direction='CREDIT' AND it.status='CONCILIATED' THEN it.amount END)
        ELSE 0 END
    FROM internal_transactions it JOIN projects p ON p.id=it.project_id
    WHERE it.organization_id = ANY(v_targets) AND it.project_id IS NOT NULL
    GROUP BY it.project_id,p.name
    HAVING SUM(CASE WHEN it.direction='CREDIT' AND it.status='CONCILIATED' THEN it.amount END)>10000
      AND (CASE WHEN SUM(CASE WHEN it.direction='CREDIT' AND it.status='CONCILIATED' THEN it.amount END)>0
        THEN 100.0*(SUM(CASE WHEN it.direction='CREDIT' AND it.status='CONCILIATED' THEN it.amount END)-SUM(CASE WHEN it.direction='DEBIT' AND it.status='CONCILIATED' THEN it.amount END))/SUM(CASE WHEN it.direction='CREDIT' AND it.status='CONCILIATED' THEN it.amount END)
        ELSE 0 END)<10
  LOOP
    alert_type:='MARGIN_LOW'; severity:=CASE WHEN _margem<0 THEN 'HIGH' WHEN _margem<5 THEN 'MEDIUM' ELSE 'LOW' END;
    title:='Margem baixa: '||_pname;
    description:='Margem de '||round(_margem,1)::TEXT||'% (meta >= 10%).';
    amount:=_receita; project_id:=_pid; project_name:=_pname; ref_id:=NULL; RETURN NEXT;
  END LOOP;
END;
$X$;

GRANT EXECUTE ON FUNCTION public.fn_financial_alerts(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 2. fn_project_scorecard
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_project_scorecard(
  p_organization_id UUID
)
RETURNS TABLE (
  project_id        UUID,
  project_name      TEXT,
  receita_realizada NUMERIC,
  custo_realizado   NUMERIC,
  margem_pct        NUMERIC,
  ar_pendente       NUMERIC,
  ap_pendente       NUMERIC,
  saldo_projetado   NUMERIC,
  risco             TEXT
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
  SELECT
    p.id                                                            AS project_id,
    p.name                                                          AS project_name,
    COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount END), 0) AS receita_realizada,
    COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN it.amount END), 0) AS custo_realizado,
    CASE
      WHEN SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount END) > 0
      THEN ROUND(100.0 *
        (SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount END) -
         SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN it.amount END)) /
        SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount END), 1)
      ELSE 0
    END                                                             AS margem_pct,
    COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'PENDING'
                       AND it.business_status NOT IN ('RECEBIDO','CANCELADO','RENEGOCIADO')
                  THEN it.amount END), 0)                           AS ar_pendente,
    COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'PENDING' THEN it.amount END), 0) AS ap_pendente,
    COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'PENDING'
                       AND it.business_status NOT IN ('RECEBIDO','CANCELADO','RENEGOCIADO')
                  THEN it.amount END), 0) -
    COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'PENDING' THEN it.amount END), 0)   AS saldo_projetado,
    CASE
      WHEN (
        COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'PENDING'
                          AND it.business_status NOT IN ('RECEBIDO','CANCELADO','RENEGOCIADO')
                     THEN it.amount END), 0) -
        COALESCE(SUM(CASE WHEN it.direction = 'DEBIT' AND it.status = 'PENDING' THEN it.amount END), 0)
      ) < -50000 THEN 'HIGH'
      WHEN (
        COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'PENDING'
                          AND it.business_status NOT IN ('RECEBIDO','CANCELADO','RENEGOCIADO')
                     THEN it.amount END), 0) -
        COALESCE(SUM(CASE WHEN it.direction = 'DEBIT' AND it.status = 'PENDING' THEN it.amount END), 0)
      ) < 0 THEN 'MEDIUM'
      ELSE 'OK'
    END                                                             AS risco
  FROM public.projects p
  LEFT JOIN public.internal_transactions it
    ON it.project_id      = p.id
   AND it.organization_id = ANY(v_targets)
  WHERE p.organization_id = ANY(v_targets)
  GROUP BY p.id, p.name
  HAVING (
    COALESCE(SUM(it.amount), 0) > 0
  )
  ORDER BY receita_realizada DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_project_scorecard(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. fn_cashflow_projection
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cashflow_projection(
  p_organization_id UUID,
  p_days            INT DEFAULT 90
)
RETURNS TABLE (
  data_ref    DATE,
  cr_previsto NUMERIC,
  db_previsto NUMERIC,
  saldo_dia   NUMERIC,
  saldo_acum  NUMERIC
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
  WITH dias AS (
    SELECT generate_series(CURRENT_DATE, CURRENT_DATE + p_days, '1 day'::interval)::date AS d
  ),
  movimentos AS (
    SELECT
      COALESCE(due_date, transaction_date) AS data_ref,
      COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount END), 0) AS cr,
      COALESCE(SUM(CASE WHEN direction = 'DEBIT'  THEN amount END), 0) AS db
    FROM public.internal_transactions
    WHERE organization_id = ANY(v_targets)
      AND status = 'PENDING'
      AND COALESCE(due_date, transaction_date) BETWEEN CURRENT_DATE AND CURRENT_DATE + p_days
    GROUP BY 1
  )
  SELECT
    d.d,
    COALESCE(m.cr, 0),
    COALESCE(m.db, 0),
    COALESCE(m.cr, 0) - COALESCE(m.db, 0),
    SUM(COALESCE(m.cr, 0) - COALESCE(m.db, 0)) OVER (ORDER BY d.d ROWS UNBOUNDED PRECEDING)
  FROM dias d
  LEFT JOIN movimentos m ON m.data_ref = d.d
  ORDER BY d.d;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_cashflow_projection(uuid, int) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 4. fn_reconciliation_divergences
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_reconciliation_divergences(
  p_organization_id uuid,
  p_as_of           date    DEFAULT current_date,
  p_aging_days      integer DEFAULT 5,
  p_value_tolerance numeric DEFAULT 50,
  p_limit           integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
  v_result  JSONB;
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

  WITH
  bank_pending AS (
    SELECT bt.id, bt.bank_account_id, bt.transaction_date, bt.amount, bt.direction,
           COALESCE(bt.description_normalized, bt.description_raw) AS description,
           bt.category,
           pa.name AS account_name
    FROM public.bank_transactions bt
    JOIN public.payment_accounts pa ON pa.id = bt.bank_account_id
    WHERE bt.organization_id = ANY(v_targets)
      AND bt.status IN ('IMPORTED','NORMALIZED','RULE_APPLIED')
      AND bt.transaction_date <= p_as_of
      AND NOT EXISTS (
        SELECT 1 FROM public.reconciliation_matches m WHERE m.bank_transaction_id = bt.id
      )
  ),
  internal_pending AS (
    SELECT it.id, it.transaction_date, it.due_date, it.amount, it.direction,
           it.description, it.category, it.party_name, it.business_status, it.project_id
    FROM public.internal_transactions it
    WHERE it.organization_id = ANY(v_targets)
      AND it.status = 'PENDING'
      AND NOT EXISTS (
        SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = it.id
      )
  ),
  mismatch AS (
    SELECT DISTINCT ON (b.id)
           b.id            AS bank_id,
           i.id            AS internal_id,
           b.amount        AS bank_amount,
           i.amount        AS internal_amount,
           b.amount - i.amount AS difference,
           b.transaction_date  AS bank_date,
           i.transaction_date  AS internal_date,
           b.description       AS bank_description,
           i.description       AS internal_description,
           b.direction,
           b.account_name
    FROM bank_pending b
    JOIN internal_pending i
      ON i.direction = b.direction
     AND i.transaction_date BETWEEN b.transaction_date - 3 AND b.transaction_date + 3
     AND abs(b.amount - i.amount) > 0
     AND abs(b.amount - i.amount) <= p_value_tolerance
    ORDER BY b.id, abs(b.amount - i.amount) ASC
  )
  SELECT jsonb_build_object(
    'as_of', p_as_of,
    'counts', jsonb_build_object(
        'bank_without_internal', (SELECT COUNT(*) FROM bank_pending b
                                   WHERE b.id NOT IN (SELECT bank_id FROM mismatch)),
        'internal_without_bank', (SELECT COUNT(*) FROM internal_pending i
                                   WHERE COALESCE(i.due_date, i.transaction_date) <= p_as_of - p_aging_days),
        'value_mismatch',        (SELECT COUNT(*) FROM mismatch)
    ),
    'bank_without_internal', COALESCE((
        SELECT jsonb_agg(row_to_json(t) ORDER BY t.transaction_date DESC) FROM (
          SELECT b.id, b.bank_account_id, b.account_name, b.transaction_date,
                 b.amount, b.direction, b.description, b.category
          FROM bank_pending b
          WHERE b.id NOT IN (SELECT bank_id FROM mismatch)
          ORDER BY b.transaction_date DESC
          LIMIT p_limit
        ) t), '[]'::jsonb),
    'internal_without_bank', COALESCE((
        SELECT jsonb_agg(row_to_json(t) ORDER BY t.ref_date ASC) FROM (
          SELECT i.id, i.transaction_date, i.due_date,
                 COALESCE(i.due_date, i.transaction_date) AS ref_date,
                 (p_as_of - COALESCE(i.due_date, i.transaction_date)) AS days_overdue,
                 i.amount, i.direction, i.description, i.category,
                 i.party_name, i.business_status, i.project_id
          FROM internal_pending i
          WHERE COALESCE(i.due_date, i.transaction_date) <= p_as_of - p_aging_days
          ORDER BY ref_date ASC
          LIMIT p_limit
        ) t), '[]'::jsonb),
    'value_mismatch', COALESCE((
        SELECT jsonb_agg(row_to_json(t) ORDER BY abs(t.difference) DESC) FROM (
          SELECT * FROM mismatch ORDER BY abs(difference) DESC LIMIT p_limit
        ) t), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.fn_reconciliation_divergences(uuid, date, integer, numeric, integer) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 5. fn_approval_action_queue — financial_approval_config
--    correlacionado pela MESMA organização da linha, não por
--    "qualquer uma de v_targets" (evita cruzar faixa de alçada
--    entre organizações quando várias estão selecionadas).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_approval_action_queue(
  p_organization_id UUID
)
RETURNS TABLE (
  entity                   TEXT,
  id                       UUID,
  title                    TEXT,
  party_name               TEXT,
  project_name             TEXT,
  amount                   NUMERIC,
  due_date                 DATE,
  approval_status          TEXT,
  approval_chain           JSONB,
  approval_required_levels INT
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
  -- TRANSAÇÕES (saídas)
  SELECT
    'transaction'::text,
    t.id,
    COALESCE(NULLIF(t.description, ''), '(sem descrição)'),
    t.party_name,
    p.name,
    t.amount,
    t.due_date::date,
    COALESCE(t.approval_status, 'RASCUNHO'),
    COALESCE(t.approval_chain, '[]'::jsonb),
    COALESCE(t.approval_required_levels, 1)
  FROM public.internal_transactions t
  LEFT JOIN public.projects p ON p.id = t.project_id
  WHERE t.organization_id = ANY(v_targets)
    AND t.direction = 'DEBIT'
    AND COALESCE(t.approval_status, 'RASCUNHO') IN ('RASCUNHO', 'PENDENTE')
    AND EXISTS (
      SELECT 1 FROM public.financial_approval_config c
      WHERE c.organization_id = t.organization_id AND c.is_active
        AND t.amount >= c.faixa_min AND (c.faixa_max IS NULL OR t.amount < c.faixa_max)
    )

  UNION ALL

  -- CONTRATOS
  SELECT
    'contract'::text,
    k.id,
    COALESCE(NULLIF(k.title, ''), 'Contrato ' || COALESCE(k.number, '')),
    COALESCE(s.name, cl.name),
    p.name,
    k.current_value,
    NULL::date,
    COALESCE(k.approval_status, 'RASCUNHO'),
    COALESCE(k.approval_chain, '[]'::jsonb),
    COALESCE(k.approval_required_levels, 1)
  FROM public.contracts k
  LEFT JOIN public.projects  p  ON p.id  = k.project_id
  LEFT JOIN public.suppliers s  ON s.id  = k.supplier_id
  LEFT JOIN public.clients   cl ON cl.id = k.client_id
  WHERE k.organization_id = ANY(v_targets)
    AND COALESCE(k.approval_status, 'RASCUNHO') IN ('RASCUNHO', 'PENDENTE')
    AND EXISTS (
      SELECT 1 FROM public.financial_approval_config c
      WHERE c.organization_id = k.organization_id AND c.is_active
        AND k.current_value >= c.faixa_min AND (c.faixa_max IS NULL OR k.current_value < c.faixa_max)
    )

  UNION ALL

  -- COMPRAS (purchase_orders) — valor = Σ items[].total; escopo via empresa→org
  SELECT
    'purchase_order'::text,
    po.id,
    'Pedido ' || COALESCE(po.number, ''),
    s.name,
    p.name,
    po_total.v,
    NULL::date,
    COALESCE(po.approval_status, 'RASCUNHO'),
    COALESCE(po.approval_chain, '[]'::jsonb),
    COALESCE(po.approval_required_levels, 1)
  FROM public.purchase_orders po
  JOIN public.companies cmp ON cmp.id = po.empresa_id
  LEFT JOIN public.projects  p ON p.id = po.project_id
  LEFT JOIN public.suppliers s ON s.id = po.supplier_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM((it->>'total')::numeric), 0) AS v
    FROM jsonb_array_elements(COALESCE(po.items, '[]'::jsonb)) it
  ) po_total
  WHERE cmp.org_id = ANY(v_targets)
    AND COALESCE(po.approval_status, 'RASCUNHO') IN ('RASCUNHO', 'PENDENTE')
    AND EXISTS (
      SELECT 1 FROM public.financial_approval_config c
      WHERE c.organization_id = cmp.org_id AND c.is_active
        AND po_total.v >= c.faixa_min AND (c.faixa_max IS NULL OR po_total.v < c.faixa_max)
    )

  ORDER BY due_date NULLS LAST, amount DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_approval_action_queue(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 6. fn_approval_pending_summary — só repassa p_organization_id
--    para fn_approval_action_queue, que já faz a checagem/agregação.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_approval_pending_summary(
  p_organization_id UUID
)
RETURNS TABLE (
  entity TEXT,
  qtd    BIGINT,
  soma   NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT q.entity, COUNT(*)::bigint, COALESCE(SUM(q.amount), 0)::numeric
  FROM public.fn_approval_action_queue(p_organization_id) q
  GROUP BY q.entity;
$$;

GRANT EXECUTE ON FUNCTION public.fn_approval_pending_summary(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 7. fn_process_bottlenecks — SECURITY DEFINER sem checagem de
--    posse própria; ganha a mesma validação explícita usada em
--    rh_kpis/fn_bi_executive.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_process_bottlenecks(p_organization_id UUID)
RETURNS TABLE (
    step_name TEXT,
    step_type TEXT,
    avg_hours NUMERIC,
    completed_count BIGINT,
    active_count BIGINT,
    overdue_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
  SELECT
      s.name,
      s.step_type,
      ROUND(
          AVG(EXTRACT(EPOCH FROM (s.completed_at - s.started_at)) / 3600.0)
              FILTER (WHERE s.completed_at IS NOT NULL AND s.started_at IS NOT NULL),
      1) AS avg_hours,
      COUNT(*) FILTER (WHERE s.status = 'CONCLUIDO') AS completed_count,
      COUNT(*) FILTER (WHERE s.status IN ('PENDENTE', 'EM_ANDAMENTO')) AS active_count,
      COUNT(*) FILTER (
          WHERE s.status IN ('PENDENTE', 'EM_ANDAMENTO') AND s.due_at IS NOT NULL AND s.due_at < now()
      ) AS overdue_count
  FROM public.process_instance_steps s
  JOIN public.process_instances i ON i.id = s.process_instance_id
  WHERE i.organization_id = ANY(v_targets)
  GROUP BY s.name, s.step_type
  ORDER BY avg_hours DESC NULLS LAST;
END;
$$;

-- FIM: 20270129000003_central_controle_todas_organizacoes.sql
