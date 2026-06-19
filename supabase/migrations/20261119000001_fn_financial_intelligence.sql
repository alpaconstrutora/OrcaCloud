-- ============================================================
-- Inteligência Financeira — alertas determinísticos + scorecards
-- OrçaCloud SaaS · Migration 20261119000001
-- Idempotente (Regra de Ouro 10).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. fn_financial_alerts
--    Alertas determinísticos com severidade HIGH/MEDIUM/LOW.
--    Tipos:
--      CASHFLOW_RISK        — obra com saldo projetado negativo em 90 dias
--      OVERDUE_HIGH         — recebíveis vencidos há > 30 dias
--      OVERDUE_AGING        — inadimplência > 15% do AR total
--      MARGIN_LOW           — obra com margem realizada < 10%
--      SUPPLIER_CONCENTRATION — fornecedor representa > 40% do AP pago
-- ────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_financial_alerts(uuid);

CREATE OR REPLACE FUNCTION public.fn_financial_alerts(
  p_organization_id UUID
)
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
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$

  -- ── 1. Risco de caixa por obra (próximos 90 dias) ──────────
  SELECT
    'CASHFLOW_RISK'::TEXT,
    CASE WHEN saldo < -50000 THEN 'HIGH' WHEN saldo < 0 THEN 'MEDIUM' ELSE 'LOW' END,
    'Risco de caixa: ' || p.name,
    'Saldo projetado negativo de ' ||
      to_char(ABS(saldo), 'FM"R$" 999G999G990D00') ||
      ' nos próximos 90 dias.',
    saldo,
    sub.project_id,
    p.name,
    NULL::TEXT
  FROM (
    SELECT
      it.project_id,
      SUM(CASE WHEN it.direction = 'CREDIT' THEN it.amount ELSE -it.amount END) AS saldo
    FROM public.internal_transactions it
    WHERE it.organization_id = p_organization_id
      AND it.status          = 'PENDING'
      AND it.due_date        BETWEEN CURRENT_DATE AND CURRENT_DATE + 90
      AND it.project_id      IS NOT NULL
    GROUP BY it.project_id
    HAVING SUM(CASE WHEN it.direction = 'CREDIT' THEN it.amount ELSE -it.amount END) < 0
  ) sub
  JOIN public.projects p ON p.id = sub.project_id

  UNION ALL

  -- ── 2. Recebíveis vencidos há > 30 dias ───────────────────
  SELECT
    'OVERDUE_HIGH'::TEXT,
    CASE WHEN total > 100000 THEN 'HIGH' WHEN total > 30000 THEN 'MEDIUM' ELSE 'LOW' END,
    'Inadimplência crítica: ' || cnt::TEXT || ' título' || CASE WHEN cnt > 1 THEN 's' ELSE '' END || ' acima de 30 dias',
    'Total de ' || to_char(total, 'FM"R$" 999G999G990D00') ||
      ' em recebíveis vencidos há mais de 30 dias.',
    total,
    NULL::UUID,
    NULL::TEXT,
    NULL::TEXT
  FROM (
    SELECT
      COUNT(*) AS cnt,
      COALESCE(SUM(amount), 0) AS total
    FROM public.internal_transactions
    WHERE organization_id  = p_organization_id
      AND direction        = 'CREDIT'
      AND status           = 'PENDING'
      AND business_status  NOT IN ('RECEBIDO','CANCELADO','RENEGOCIADO')
      AND due_date         < CURRENT_DATE - 30
  ) x
  WHERE total > 0

  UNION ALL

  -- ── 3. Taxa de inadimplência > 15% do AR total ────────────
  SELECT
    'OVERDUE_AGING'::TEXT,
    CASE WHEN pct > 30 THEN 'HIGH' WHEN pct > 15 THEN 'MEDIUM' ELSE 'LOW' END,
    'Taxa de inadimplência em ' || round(pct, 1)::TEXT || '%',
    'O total vencido representa ' || round(pct, 1)::TEXT ||
      '% do AR total. Meta: abaixo de 15%.',
    ar_total,
    NULL::UUID,
    NULL::TEXT,
    NULL::TEXT
  FROM (
    SELECT
      COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE AND business_status NOT IN ('RECEBIDO','CANCELADO','RENEGOCIADO') THEN amount END), 0) AS vencido,
      COALESCE(SUM(amount), 0) AS ar_total,
      CASE WHEN SUM(amount) > 0
        THEN 100.0 * SUM(CASE WHEN due_date < CURRENT_DATE AND business_status NOT IN ('RECEBIDO','CANCELADO','RENEGOCIADO') THEN amount ELSE 0 END) / SUM(amount)
        ELSE 0
      END AS pct
    FROM public.internal_transactions
    WHERE organization_id = p_organization_id
      AND direction       = 'CREDIT'
      AND status          <> 'CANCELLED'
  ) y
  WHERE pct > 15

  UNION ALL

  -- ── 4. Margem baixa por obra (< 10% realizados) ───────────
  SELECT
    'MARGIN_LOW'::TEXT,
    CASE WHEN margem < 0 THEN 'HIGH' WHEN margem < 5 THEN 'MEDIUM' ELSE 'LOW' END,
    'Margem baixa: ' || p.name,
    'Margem realizada de ' || round(margem, 1)::TEXT || '% (meta: ≥ 10%).',
    receita,
    sub.project_id,
    p.name,
    NULL::TEXT
  FROM (
    SELECT
      it.project_id,
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount END), 0) AS receita,
      COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN it.amount END), 0) AS custo,
      CASE
        WHEN SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount END) > 0
        THEN 100.0 *
          (SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount END) -
           SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN it.amount END))
          / SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount END)
        ELSE 0
      END AS margem
    FROM public.internal_transactions it
    WHERE it.organization_id = p_organization_id
      AND it.project_id IS NOT NULL
    GROUP BY it.project_id
    HAVING SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount END) > 10000
      AND (
        CASE
          WHEN SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount END) > 0
          THEN 100.0 *
            (SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount END) -
             SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN it.amount END))
            / SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount END)
          ELSE 0
        END
      ) < 10
  ) sub
  JOIN public.projects p ON p.id = sub.project_id

  UNION ALL

  -- ── 5. Concentração de fornecedor > 40% do AP pago ────────
  SELECT
    'SUPPLIER_CONCENTRATION'::TEXT,
    CASE WHEN pct > 60 THEN 'HIGH' ELSE 'MEDIUM' END,
    'Concentração de fornecedor: ' || supplier_name,
    supplier_name || ' representa ' || round(pct, 1)::TEXT ||
      '% do total de AP pago. Risco de dependência.',
    total_pago,
    NULL::UUID,
    NULL::TEXT,
    supplier_name
  FROM (
    SELECT
      s.name AS supplier_name,
      COALESCE(SUM(b.valor), 0) AS total_pago,
      100.0 * COALESCE(SUM(b.valor), 0) /
        NULLIF(SUM(SUM(b.valor)) OVER (), 0) AS pct
    FROM public.boletos b
    JOIN public.suppliers s ON s.id = b.supplier_id
    WHERE b.organization_id = p_organization_id
      AND b.status IN ('paid', 'approved')
    GROUP BY s.name
  ) z
  WHERE pct > 40

  ORDER BY
    CASE severity WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
    ABS(amount) DESC NULLS LAST;

$$;

-- ────────────────────────────────────────────────────────────
-- 2. fn_project_scorecard
--    Scorecard financeiro por obra: receita, custo, margem,
--    AR pendente, AP pendente, saldo projetado.
-- ────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_project_scorecard(uuid);

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
  risco             TEXT       -- 'HIGH' | 'MEDIUM' | 'OK'
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
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
   AND it.organization_id = p_organization_id
  WHERE p.organization_id = p_organization_id
  GROUP BY p.id, p.name
  HAVING (
    COALESCE(SUM(it.amount), 0) > 0
  )
  ORDER BY receita_realizada DESC NULLS LAST;
$$;

-- ────────────────────────────────────────────────────────────
-- 3. fn_cashflow_projection
--    Projeção de caixa para os próximos N dias com saldo inicial.
-- ────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_cashflow_projection(uuid, int);

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
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH dias AS (
    SELECT generate_series(CURRENT_DATE, CURRENT_DATE + p_days, '1 day'::interval)::date AS d
  ),
  movimentos AS (
    SELECT
      COALESCE(due_date, transaction_date) AS data_ref,
      COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount END), 0) AS cr,
      COALESCE(SUM(CASE WHEN direction = 'DEBIT'  THEN amount END), 0) AS db
    FROM public.internal_transactions
    WHERE organization_id = p_organization_id
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
$$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20261119000001_fn_financial_intelligence.sql
-- ────────────────────────────────────────────────────────────
